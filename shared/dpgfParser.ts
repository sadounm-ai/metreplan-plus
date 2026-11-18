// Lecture d'une DPGF à partir des lignes d'un classeur (valeurs déjà résolues).

import { normalizeCode } from './cctpParser';
import type { DpgfLine, Lot } from './types';
import { normalizeUnit } from './units';
import { colorFor, uid } from './ids';

export type CellValue = string | number | null;
export interface SheetRows {
  name: string;
  rows: CellValue[][];
}

export interface DpgfParseResult {
  lots: Lot[];
  lines: DpgfLine[];
  tvaRate: number | null;
  warnings: string[];
}

interface Columns {
  code: number;
  designation: number;
  unit: number;
  qty: number;
  pu: number;
  total: number;
}

const txt = (v: CellValue | undefined) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());
const num = (v: CellValue | undefined): number | null => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/\s/g, '').replace(/€/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return parseFloat(s);
};

const isUpper = (s: string) => {
  const letters = s.replace(/[^A-Za-zÀ-ÖØ-öø-ÿŒœ]/g, '');
  return letters.length > 1 && letters === letters.toUpperCase();
};

const looksLikeUnit = (s: string) => {
  if (!s || s.length > 8) return false;
  const n = normalizeUnit(s);
  return ['m', 'm2', 'm3', 'u', 'ens', 'kg', 't', 'h'].includes(n);
};

function findHeader(rows: CellValue[][]): { row: number; cols: Columns } | null {
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const cells = rows[r].map((c) => txt(c).toLowerCase());
    const find = (re: RegExp) => cells.findIndex((c) => re.test(c));
    const unit = find(/^(u|u\.|unit[ée]s?|unit\.?)$/);
    const qty = find(/^(qu\.?|qt[ée]s?\.?|quantit[ée]s?|q\.?|qte\.?)(\s|$)/);
    const pu = find(/^(p\.?\s?u\.?|prix unit)/);
    const total = find(/produit|montant|prix total|total/);
    const hits = [unit, qty, pu].filter((i) => i >= 0).length;
    if (hits < 2 || unit < 0) continue;
    let designation = find(/d[ée]signation|libell[ée]|description|ouvrage/);
    if (designation < 0) designation = Math.max(0, unit - 1);
    let code = find(/^(n°|n\.|num|code|art|r[ée]f|item|poste)/);
    if (code < 0) code = designation > 0 ? designation - 1 : -1;
    return { row: r, cols: { code, designation, unit, qty, pu, total } };
  }
  return null;
}

function lotFromText(s: string): { code: string; name: string } | null {
  const m = s.match(/\blot\s*n?\s*[°ºo]?\s*(\d{1,3})\s*[-–:]?\s*(.*)$/i) ?? s.match(/^\s*n\s*[°º]\s*(\d{1,3})\s*[-–:]?\s*(.*)$/i);
  if (!m) return null;
  return { code: m[1].padStart(2, '0'), name: m[2].replace(/^n?\s*[°ºo]\s*\d+\s*[-–:]?\s*/i, '').trim() };
}

export function parseDpgfRows(sheets: SheetRows[]): DpgfParseResult {
  const lots: Lot[] = [];
  const lines: DpgfLine[] = [];
  const warnings: string[] = [];
  let tvaRate: number | null = null;

  for (const sheet of sheets) {
    const head = findHeader(sheet.rows);
    if (!head) continue;
    const c = head.cols;
    const fromSheet = lotFromText(sheet.name);
    let lot: Lot = {
      id: uid('lot'),
      code: fromSheet?.code ?? String(lots.length + 1).padStart(2, '0'),
      name: fromSheet?.name || sheet.name,
      order: lots.length,
    };
    lots.push(lot);
    const startIdx = lines.length;
    let lastGroup: DpgfLine | null = null;
    let subCount = 0;
    let anyArticle = false;

    for (let r = head.row + 1; r < sheet.rows.length; r++) {
      const row = sheet.rows[r];
      const code = c.code >= 0 ? txt(row[c.code]) : '';
      const des = txt(row[c.designation]);
      const unitRaw = txt(row[c.unit]);
      if (!des && !code) continue;

      // Lignes de totaux
      const TOTAL = /^(montant|total|sous[- ]?total|tva|t\.v\.a|ttc|report|net)\b/i;
      if (TOTAL.test(code) && !des) continue;
      if (TOTAL.test(des)) {
        const l = lotFromText(des);
        if (l && /^montant\s+h\.?t/i.test(des)) {
          if (l.name) lot.name = l.name;
          lot.code = l.code;
        }
        if (/tva/i.test(des)) {
          const rate = num(row[c.code >= 0 ? c.code : 0]) ?? num(des.match(/(\d+(?:[.,]\d+)?)\s*%/)?.[1] ?? null);
          if (rate != null && rate > 0 && rate < 30) tvaRate = rate;
        }
        continue;
      }

      // Changement de lot dans une même feuille
      const lotRow = !unitRaw && lotFromText(des);
      if (lotRow && !looksLikeUnit(unitRaw) && /^lot/i.test(des)) {
        if (anyArticle || lines.length > startIdx) {
          lot = { id: uid('lot'), code: lotRow.code, name: lotRow.name || des, order: lots.length };
          lots.push(lot);
        } else {
          lot.code = lotRow.code;
          lot.name = lotRow.name || des;
        }
        lastGroup = null;
        continue;
      }

      // En-tête de lot du type « A | TERRASSEMENTS - … » avant tout article
      if (/^[A-Z]$/.test(code) && !unitRaw && !anyArticle && isUpper(des)) {
        if (!fromSheet?.name || fromSheet.name.length < des.length) lot.name = des;
        continue;
      }

      const unit = looksLikeUnit(unitRaw) ? unitRaw : '';
      const qty = num(row[c.qty]);
      const pu = num(row[c.pu]);
      const base = {
        lotId: lot.id,
        unitPrice: pu,
        dpgfQty: qty,
        defaults: {},
        color: '',
        order: lines.length,
      };

      if (unit) {
        anyArticle = true;
        if (!code && lastGroup) {
          subCount++;
          lines.push({
            ...base,
            id: uid('art'),
            kind: 'article',
            code: `${lastGroup.code}.${String.fromCharCode(96 + Math.min(subCount, 26))}`,
            designation: des.replace(/^[-–•]\s*/, ''),
            depth: lastGroup.depth + 1,
            unit,
          });
        } else {
          const art: DpgfLine = { ...base, id: uid('art'), kind: 'article', code, designation: des, depth: 0, unit };
          lines.push(art);
          // Une ligne sans code qui suit un article avec unité en devient une sous-ligne
          lastGroup = code ? art : null;
          subCount = 0;
        }
        continue;
      }

      if (!code) {
        // Texte descriptif sans code ni unité : rattaché comme titre s'il est en capitales
        if (isUpper(des) && des.length > 3) {
          lines.push({ ...base, id: uid('ttl'), kind: 'titre', code: '', designation: des, depth: 0, unit: '', unitPrice: null, dpgfQty: null });
          lastGroup = null;
        }
        continue;
      }

      if (isUpper(des)) {
        lines.push({ ...base, id: uid('ttl'), kind: 'titre', code, designation: des, depth: 0, unit: '', unitPrice: null, dpgfQty: null });
        lastGroup = null;
      } else {
        const g: DpgfLine = { ...base, id: uid('art'), kind: 'groupe', code, designation: des, depth: 0, unit: '' };
        lines.push(g);
        lastGroup = g;
        subCount = 0;
        anyArticle = true;
      }
    }

    // Profondeurs à partir de la numérotation
    const own = lines.slice(startIdx);
    const segs = (l: DpgfLine) => (l.code ? normalizeCode(l.code.replace(/\.[a-z]$/, '')).split('-').length : 0);
    const minSeg = Math.min(...own.filter((l) => l.code && l.kind === 'titre').map(segs), Infinity);
    for (const l of own) {
      if (!l.code || !Number.isFinite(minSeg)) continue;
      const isSub = /\.[a-z]$/.test(l.code);
      const d = segs(l) - minSeg + (l.kind === 'titre' ? 0 : 0);
      l.depth = Math.max(0, d) + (isSub ? 1 : 0);
    }
    // Groupe suivi d'articles numérotés plus profonds : c'est un titre.
    // Groupe sans sous-ligne : article sans unité (signalé).
    own.forEach((l, i) => {
      if (l.kind !== 'groupe') return;
      const next = own[i + 1];
      const hasSub = !!next && next.code.length === l.code.length + 2 && next.code.startsWith(l.code + '.') && /\.[a-z]$/.test(next.code);
      const key = normalizeCode(l.code);
      if (!hasSub && next?.code && normalizeCode(next.code.replace(/\.[a-z]$/, '')).startsWith(key + '-')) {
        l.kind = 'titre';
        return;
      }
      if (!hasSub) {
        l.kind = 'article';
        warnings.push(`Article ${l.code} « ${l.designation} » sans unité`);
      }
    });
  }

  const used = new Set(lines.map((l) => l.lotId));
  const keptLots = lots.filter((l) => used.has(l.id));
  keptLots.forEach((l, i) => (l.order = i));
  lots.length = 0;
  lots.push(...keptLots);
  lines.forEach((l, i) => {
    l.order = i;
    if (l.kind === 'article') l.color = colorFor(i);
  });
  return { lots, lines, tvaRate, warnings };
}
