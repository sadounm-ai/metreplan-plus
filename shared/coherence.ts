// Analyse de cohérence plans / CCTP / DPGF.

import { designationSimilarity, normalizeCode } from './cctpParser';
import { articleTotals, computeMeasure } from './quantities';
import type { CctpArticle, DpgfLine, Lot, Measure, PlanPage, ProjectSettings } from './types';
import { displayUnit, unitDimension } from './units';

export type IssueKind =
  | 'cctp-absent-dpgf'
  | 'cctp-numerotation'
  | 'cctp-intitule'
  | 'dpgf-absent-cctp'
  | 'dpgf-sans-mesure'
  | 'unite-incoherente'
  | 'ecart-quantite'
  | 'page-non-calibree'
  | 'article-sans-unite';

export type Severity = 'erreur' | 'alerte' | 'info';

export interface Issue {
  kind: IssueKind;
  severity: Severity;
  message: string;
  lineId?: string;
  cctpId?: string;
  measureIds?: string[];
  pageId?: string;
}

export const ISSUE_LABELS: Record<IssueKind, string> = {
  'cctp-absent-dpgf': 'Articles du CCTP absents de la DPGF',
  'cctp-numerotation': 'Numérotation CCTP / DPGF divergente',
  'cctp-intitule': 'Intitulés CCTP / DPGF divergents',
  'dpgf-absent-cctp': 'Articles de DPGF non décrits au CCTP',
  'dpgf-sans-mesure': 'Articles de DPGF sans aucune mesure',
  'unite-incoherente': 'Mesures à l’unité incohérente',
  'ecart-quantite': 'Écarts métré / quantité DPGF',
  'page-non-calibree': 'Pages mesurées sans échelle',
  'article-sans-unite': 'Articles de DPGF sans unité',
};

const keyOf = (code: string) => normalizeCode(code.replace(/\.[a-z]$/, ''));

export interface CoherenceInput {
  settings: Pick<ProjectSettings, 'ecartThreshold'>;
  lots: Lot[];
  lines: DpgfLine[];
  measures: Measure[];
  pages: PlanPage[];
  cctp: CctpArticle[];
}

export function analyseCoherence(s: CoherenceInput): Issue[] {
  const issues: Issue[] = [];
  const pagesById = new Map(s.pages.map((p) => [p.id, p]));
  const lotById = new Map(s.lots.map((l) => [l.id, l]));
  const priced = s.lines.filter((l) => l.kind !== 'titre');

  // 1. CCTP ↔ DPGF
  const cctpArts = s.cctp.filter((a) => a.kind === 'article');
  if (cctpArts.length) {
    const cctpLots = new Set(cctpArts.map((a) => a.lotCode).filter(Boolean));
    const scope = priced.filter((l) => {
      const lot = lotById.get(l.lotId);
      return !cctpLots.size || (lot && cctpLots.has(lot.code));
    });
    const byKey = new Map<string, DpgfLine[]>();
    for (const l of scope) {
      if (!l.code) continue;
      const k = keyOf(l.code);
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k)!.push(l);
    }
    const matchedLines = new Set<string>();
    const pending: CctpArticle[] = [];
    // Passe 1 : même numéro et intitulé proche
    for (const a of cctpArts) {
      const same = byKey.get(keyOf(a.code)) ?? [];
      const best = same.map((l) => ({ l, sim: designationSimilarity(a.title, l.designation) })).sort((x, y) => y.sim - x.sim)[0];
      if (best && best.sim >= 0.5 && !matchedLines.has(best.l.id)) same.forEach((l) => matchedLines.add(l.id));
      else pending.push(a);
    }
    // Passe 2 : même intitulé sous un autre numéro
    const pending2: CctpArticle[] = [];
    for (const a of pending) {
      const elsewhere = scope
        .filter((l) => !/\.[a-z]$/.test(l.code) && !matchedLines.has(l.id))
        .map((l) => ({ l, sim: designationSimilarity(a.title, l.designation) }))
        .filter((x) => x.sim >= 0.8)
        .sort((x, y) => y.sim - x.sim)[0];
      if (!elsewhere) {
        pending2.push(a);
        continue;
      }
      byKey.get(keyOf(elsewhere.l.code))?.forEach((l) => matchedLines.add(l.id));
      matchedLines.add(elsewhere.l.id);
      issues.push({
        kind: 'cctp-numerotation',
        severity: 'alerte',
        message: `CCTP ${a.code} « ${a.title} » correspond à la DPGF ${elsewhere.l.code} « ${elsewhere.l.designation} »`,
        cctpId: a.id,
        lineId: elsewhere.l.id,
      });
    }
    // Passe 3 : numéro présent mais intitulé différent, sinon absent
    for (const a of pending2) {
      const same = (byKey.get(keyOf(a.code)) ?? []).filter((l) => !matchedLines.has(l.id));
      if (same.length) {
        same.forEach((l) => matchedLines.add(l.id));
        issues.push({
          kind: 'cctp-intitule',
          severity: 'alerte',
          message: `${a.code} : CCTP « ${a.title} » ≠ DPGF « ${same[0].designation} »`,
          cctpId: a.id,
          lineId: same[0].id,
        });
        continue;
      }
      issues.push({
        kind: 'cctp-absent-dpgf',
        severity: 'erreur',
        message: `${a.code} « ${a.title} » (CCTP p. ${a.page}) n’a pas de ligne de prix dans la DPGF`,
        cctpId: a.id,
      });
    }
    for (const l of scope) {
      if (matchedLines.has(l.id) || /\.[a-z]$/.test(l.code)) continue;
      const parentMatched = scope.some((p) => p.kind === 'groupe' && l.code.startsWith(p.code + '.') && matchedLines.has(p.id));
      if (parentMatched) continue;
      issues.push({
        kind: 'dpgf-absent-cctp',
        severity: 'alerte',
        message: `${l.code} « ${l.designation} » n’est décrit dans aucun article du CCTP`,
        lineId: l.id,
      });
    }
  }

  // 2. DPGF ↔ métré
  for (const l of s.lines) {
    if (l.kind !== 'article') continue;
    if (!l.unit) {
      issues.push({ kind: 'article-sans-unite', severity: 'alerte', message: `${l.code} « ${l.designation} » n’a pas d’unité`, lineId: l.id });
      continue;
    }
    const mine = s.measures.filter((m) => m.articleId === l.id);
    const t = articleTotals(l, mine, pagesById);
    const forfait = unitDimension(l.unit) === 'forfait';
    if (!mine.length && !l.manualQty && !forfait) {
      issues.push({ kind: 'dpgf-sans-mesure', severity: 'info', message: `${l.code || '—'} « ${l.designation} » (${displayUnit(l.unit)})`, lineId: l.id });
    }
    const bad = mine.filter((m) => computeMeasure(m, l, pagesById.get(m.pageId)).status === 'incoherent');
    if (bad.length) {
      const msg = computeMeasure(bad[0], l, pagesById.get(bad[0].pageId)).message;
      issues.push({
        kind: 'unite-incoherente',
        severity: 'erreur',
        message: `${l.code} « ${l.designation} » : ${bad.length} mesure${bad.length > 1 ? 's' : ''} — ${msg}`,
        lineId: l.id,
        measureIds: bad.map((m) => m.id),
      });
    }
    if (l.dpgfQty != null && l.dpgfQty > 0 && (mine.length || l.manualQty)) {
      const ecart = ((t.qty - l.dpgfQty) / l.dpgfQty) * 100;
      if (Math.abs(ecart) > s.settings.ecartThreshold) {
        issues.push({
          kind: 'ecart-quantite',
          severity: 'alerte',
          message: `${l.code} « ${l.designation} » : métré ${t.qty.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${displayUnit(l.unit)} / DPGF ${l.dpgfQty.toLocaleString('fr-FR')} (${ecart > 0 ? '+' : ''}${ecart.toFixed(1).replace('.', ',')} %)`,
          lineId: l.id,
        });
      }
    }
  }

  // 3. Pages
  for (const p of s.pages) {
    if (p.scale) continue;
    const ms = s.measures.filter((m) => m.pageId === p.id && m.tool !== 'E4');
    if (ms.length)
      issues.push({ kind: 'page-non-calibree', severity: 'erreur', message: `« ${p.name} » : ${ms.length} mesure(s) sans échelle`, pageId: p.id, measureIds: ms.map((m) => m.id) });
  }
  return issues;
}
