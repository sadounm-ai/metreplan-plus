// Calcul des quantités : la géométrie mesurée est convertie dans l'unité de
// l'article DPGF auquel la mesure est rattachée (c'est la DPGF qui pilote).

import { polygonArea, polylineLength } from './geometry';
import type { DpgfLine, Measure, MeasureParams, PlanPage, ToolId } from './types';
import { displayUnit, unitDimension, type Dimension } from './units';

export type QtyStatus = 'ok' | 'incoherent' | 'non-calibre';

export interface MeasureResult {
  value: number;
  status: QtyStatus;
  /** Grandeurs géométriques de base, en unités réelles */
  longueur?: number;
  surface?: number;
  nombre?: number;
  formula: string;
  message?: string;
}

export function effectiveParams(m: Pick<Measure, 'params'>, article?: Pick<DpgfLine, 'defaults'>): Required<MeasureParams> {
  const d = article?.defaults ?? {};
  const p = m.params ?? {};
  const pick = (k: keyof MeasureParams, fallback: number) => {
    const v = p[k] ?? d[k];
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  };
  return {
    hauteur: pick('hauteur', NaN),
    epaisseur: pick('epaisseur', NaN),
    coef: pick('coef', 1),
    chute: pick('chute', 0),
    parUnite: pick('parUnite', NaN),
  };
}

const f = (n: number, d = 2) => n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Outils capables de produire chaque dimension (pour l'aide et le contrôle). */
export const TOOLS_FOR_DIMENSION: Record<Dimension, ToolId[]> = {
  longueur: ['E1', 'E3', 'E4'],
  surface: ['E2', 'E1', 'E3', 'E4'],
  volume: ['E2', 'E1', 'E3', 'E4'],
  nombre: ['E4'],
  forfait: [],
  autre: ['E1', 'E2', 'E3', 'E4'],
};

/** Outil conseillé pour une unité d'article. */
export function recommendedTool(unit: string): ToolId | null {
  switch (unitDimension(unit)) {
    case 'longueur':
      return 'E3';
    case 'surface':
    case 'volume':
      return 'E2';
    case 'nombre':
      return 'E4';
    default:
      return null;
  }
}

export function computeMeasure(
  m: Pick<Measure, 'tool' | 'points' | 'holes' | 'params'>,
  article: Pick<DpgfLine, 'unit' | 'defaults'> | undefined,
  page: Pick<PlanPage, 'scale'> | undefined,
): MeasureResult {
  const unit = article?.unit ?? '';
  const dim = unitDimension(unit);
  const u = displayUnit(unit);
  const p = effectiveParams(m, article);
  const mpp = page?.scale?.metersPerPoint;
  const tail = (v: number, formula: string): MeasureResult => {
    const k = p.coef * (1 + p.chute / 100);
    let fx = formula;
    if (p.coef !== 1) fx += ` × ${f(p.coef, 3)}`;
    if (p.chute) fx += ` × (1 + ${f(p.chute, 1)} %)`;
    return { value: v * k, status: 'ok', formula: `${fx} = ${f(v * k)} ${u}` };
  };
  const bad = (message: string, extra: Partial<MeasureResult> = {}): MeasureResult => ({
    value: 0,
    status: 'incoherent',
    formula: '—',
    message,
    ...extra,
  });

  if (m.tool === 'E4') {
    const n = m.points.length;
    const base = { nombre: n };
    switch (dim) {
      case 'nombre':
        return { ...tail(n, `${n} u`), ...base };
      case 'longueur':
      case 'surface':
      case 'volume':
        if (!Number.isFinite(p.parUnite)) return bad(`Comptage vers ${u} : saisir la quantité par unité`, base);
        return { ...tail(n * p.parUnite, `${n} u × ${f(p.parUnite, 3)} ${u}/u`), ...base };
      case 'forfait':
        return bad('Article au forfait (ens) : saisir une quantité manuelle plutôt qu’un comptage', base);
      default:
        return { ...tail(n * (Number.isFinite(p.parUnite) ? p.parUnite : 1), `${n} u`), ...base };
    }
  }

  if (!mpp) return { value: 0, status: 'non-calibre', formula: '—', message: 'Page non calibrée : définir l’échelle' };

  if (m.tool === 'E2') {
    const s = Math.max(0, polygonArea(m.points) - m.holes.reduce((a, h) => a + polygonArea(h), 0)) * mpp * mpp;
    const per = polylineLength(m.points, true) * mpp;
    const base = { surface: s, longueur: per };
    const holes = m.holes.length ? ` (${m.holes.length} trou${m.holes.length > 1 ? 's' : ''} déduit${m.holes.length > 1 ? 's' : ''})` : '';
    switch (dim) {
      case 'surface':
        return { ...tail(s, `${f(s)} m²${holes}`), ...base };
      case 'volume':
        if (!Number.isFinite(p.epaisseur)) return bad('Surface vers m³ : saisir l’épaisseur', base);
        return { ...tail(s * p.epaisseur, `${f(s)} m² × ${f(p.epaisseur, 3)} m`), ...base };
      case 'longueur':
        return bad('Article en ml mesuré avec l’outil Surface : utiliser E1 Périmètre ou E3 Longueur', base);
      case 'nombre':
        return bad('Article à l’unité mesuré avec l’outil Surface : utiliser E4 Comptage', base);
      case 'forfait':
        return bad('Article au forfait (ens) : saisir une quantité manuelle', base);
      default:
        return { ...tail(s, `${f(s)} m²`), ...base };
    }
  }

  // E1 périmètre (fermé) ou E3 longueur (ouverte)
  const closed = m.tool === 'E1';
  const l = polylineLength(m.points, closed) * mpp;
  const base = { longueur: l };
  const lbl = closed ? 'périmètre' : 'longueur';
  switch (dim) {
    case 'longueur':
      return { ...tail(l, `${f(l)} m`), ...base };
    case 'surface':
      if (!Number.isFinite(p.hauteur)) return bad(`Article en m² mesuré en ${lbl} : saisir la hauteur (ou utiliser E2 Surface)`, base);
      return { ...tail(l * p.hauteur, `${f(l)} m × ${f(p.hauteur, 3)} m`), ...base };
    case 'volume':
      if (!Number.isFinite(p.hauteur) || !Number.isFinite(p.epaisseur))
        return bad(`Article en m³ mesuré en ${lbl} : saisir hauteur et épaisseur`, base);
      return { ...tail(l * p.hauteur * p.epaisseur, `${f(l)} m × ${f(p.hauteur, 3)} m × ${f(p.epaisseur, 3)} m`), ...base };
    case 'nombre':
      return bad(`Article à l’unité mesuré avec l’outil ${closed ? 'Périmètre' : 'Longueur'} : utiliser E4 Comptage`, base);
    case 'forfait':
      return bad('Article au forfait (ens) : saisir une quantité manuelle', base);
    default:
      return { ...tail(l, `${f(l)} m`), ...base };
  }
}

export interface ArticleTotals {
  measured: number;
  /** Quantité retenue = métré + quantité manuelle */
  qty: number;
  amount: number;
  count: number;
  incoherent: number;
}

export function articleTotals(
  line: DpgfLine,
  measures: Measure[],
  pagesById: Map<string, PlanPage>,
): ArticleTotals {
  let measured = 0;
  let incoherent = 0;
  let count = 0;
  for (const m of measures) {
    if (m.articleId !== line.id) continue;
    count++;
    const r = computeMeasure(m, line, pagesById.get(m.pageId));
    if (r.status === 'ok') measured += r.value;
    else incoherent++;
  }
  const qty = round(measured + (line.manualQty ?? 0), 3);
  const amount = line.unitPrice != null ? round(round(qty, 2) * line.unitPrice, 2) : 0;
  return { measured, qty, amount, count, incoherent };
}

export const round = (n: number, d = 2) => {
  const k = 10 ** d;
  return Math.round((n + Number.EPSILON) * k) / k;
};
