// Tableau de bord : avancement du métré, surfaces (SHO / SP / SH), ratios.

import { articleTotals, computeMeasure, round } from './quantities';
import type { DpgfLine, Lot, Measure, PlanPage, ProjectSettings, SurfaceTag } from './types';
import { displayUnit, unitDimension } from './units';

export interface LotProgress {
  lot: Lot;
  articles: number;
  measured: number;
  pct: number;
  amount: number;
}

export interface RoomRow {
  room: string;
  level: string;
  page: string;
  tags: SurfaceTag[];
  surface: number;
}

export interface KeyRatio {
  line: DpgfLine;
  lot: Lot | undefined;
  qty: number;
  unit: string;
  perSp: number | null;
  amount: number;
}

export interface Dashboard {
  ht: number;
  tva: number;
  ttc: number;
  articles: number;
  measuredArticles: number;
  pct: number;
  measures: number;
  lots: LotProgress[];
  surfaces: Record<SurfaceTag, number>;
  surfacesByLevel: { level: string; SHO: number; SP: number; SH: number }[];
  rooms: RoomRow[];
  coutM2Sp: number | null;
  coutM2Sh: number | null;
  ratioShSp: number | null;
  keyRatios: KeyRatio[];
}

export function buildDashboard(d: { lots: Lot[]; lines: DpgfLine[]; measures: Measure[]; pages: PlanPage[]; settings: Pick<ProjectSettings, 'tvaRate'> }): Dashboard {
  const pages = new Map(d.pages.map((p) => [p.id, p]));
  const lotById = new Map(d.lots.map((l) => [l.id, l]));
  const byArticle = new Map<string, Measure[]>();
  for (const m of d.measures) (byArticle.get(m.articleId) ?? byArticle.set(m.articleId, []).get(m.articleId)!).push(m);

  const totals = new Map(d.lines.filter((l) => l.kind === 'article').map((l) => [l.id, articleTotals(l, byArticle.get(l.id) ?? [], pages)]));
  const lots: LotProgress[] = d.lots.map((lot) => {
    const arts = d.lines.filter((l) => l.lotId === lot.id && l.kind === 'article');
    const measured = arts.filter((l) => totals.get(l.id)!.qty > 0).length;
    const amount = round(arts.reduce((s, l) => s + totals.get(l.id)!.amount, 0), 2);
    return { lot, articles: arts.length, measured, pct: arts.length ? (measured / arts.length) * 100 : 0, amount };
  });
  const articles = lots.reduce((s, l) => s + l.articles, 0);
  const measuredArticles = lots.reduce((s, l) => s + l.measured, 0);
  const ht = round(lots.reduce((s, l) => s + l.amount, 0), 2);
  const tva = round((ht * d.settings.tvaRate) / 100, 2);

  // Surfaces classées (géométrie nette des trous, sans coefficient)
  const surfaces: Record<SurfaceTag, number> = { SHO: 0, SP: 0, SH: 0 };
  const levels = new Map<string, { SHO: number; SP: number; SH: number }>();
  const rooms: RoomRow[] = [];
  for (const m of d.measures) {
    if (m.tool !== 'E2' || !m.surfaceTags?.length) continue;
    const page = pages.get(m.pageId);
    const r = computeMeasure(m, { unit: 'm2', defaults: {} }, page);
    const s = r.surface ?? 0;
    if (!s) continue;
    const level = page?.level || page?.name || '—';
    const lv = levels.get(level) ?? { SHO: 0, SP: 0, SH: 0 };
    for (const t of m.surfaceTags) {
      surfaces[t] += s;
      lv[t] += s;
    }
    levels.set(level, lv);
    rooms.push({ room: m.room || m.label || 'Pièce', level, page: page?.name ?? '', tags: m.surfaceTags, surface: s });
  }
  rooms.sort((a, b) => a.level.localeCompare(b.level, 'fr') || a.room.localeCompare(b.room, 'fr'));
  const sp = surfaces.SP;

  const keyRatios: KeyRatio[] = d.lines
    .filter((l) => l.kind === 'article' && totals.get(l.id)!.qty > 0 && ['longueur', 'surface', 'volume', 'nombre'].includes(unitDimension(l.unit)))
    .map((l) => {
      const t = totals.get(l.id)!;
      return { line: l, lot: lotById.get(l.lotId), qty: t.qty, unit: displayUnit(l.unit), perSp: sp ? t.qty / sp : null, amount: t.amount };
    });

  return {
    ht,
    tva,
    ttc: round(ht + tva, 2),
    articles,
    measuredArticles,
    pct: articles ? (measuredArticles / articles) * 100 : 0,
    measures: d.measures.length,
    lots,
    surfaces,
    surfacesByLevel: [...levels.entries()].map(([level, v]) => ({ level, ...v })),
    rooms,
    coutM2Sp: sp ? ht / sp : null,
    coutM2Sh: surfaces.SH ? ht / surfaces.SH : null,
    ratioShSp: sp ? surfaces.SH / sp : null,
    keyRatios,
  };
}
