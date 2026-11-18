// Représentation graphique des mesures (écran et exports) : couleur selon le
// mode choisi (article, outil, calque) et symbole des objets comptés.

import type { ColorMode, DpgfLine, Layer, Measure, SymbolId, ToolId } from './types';

export const TOOL_COLORS: Record<ToolId, string> = {
  E1: '#1c7ed6',
  E2: '#2f9e44',
  E3: '#e8590c',
  E4: '#ae3ec9',
};

export function measureColor(m: Pick<Measure, 'tool'>, line: Pick<DpgfLine, 'color'> | undefined, layer: Pick<Layer, 'color'> | undefined, mode: ColorMode = 'article'): string {
  if (mode === 'outil') return TOOL_COLORS[m.tool];
  if (mode === 'calque') return layer?.color || '#868e96';
  return line?.color || layer?.color || '#d6336c';
}

/** Tracé SVG d'un symbole centré sur l'origine, de rayon r. */
export function symbolPath(s: SymbolId | undefined, r: number): string {
  const f = (n: number) => +n.toFixed(2);
  switch (s) {
    case 'carre': {
      const a = f(r * 0.86);
      return `M${-a},${-a}H${a}V${a}H${-a}Z`;
    }
    case 'triangle':
      return `M0,${f(-r * 1.1)}L${f(r * 1.05)},${f(r * 0.75)}L${f(-r * 1.05)},${f(r * 0.75)}Z`;
    case 'losange':
      return `M0,${f(-r * 1.15)}L${f(r * 1.15)},0L0,${f(r * 1.15)}L${f(-r * 1.15)},0Z`;
    case 'croix': {
      const a = f(r), b = f(r * 0.36);
      return `M${-b},${-a}H${b}V${-b}H${a}V${b}H${b}V${a}H${-b}V${b}H${-a}V${-b}H${-b}Z`;
    }
    default: {
      const a = f(r);
      return `M${-a},0A${a},${a} 0 1,0 ${a},0A${a},${a} 0 1,0 ${-a},0Z`;
    }
  }
}

export interface LegendEntry {
  key: string;
  color: string;
  /** Symbole E4 à dessiner à la place de la pastille */
  symbol?: SymbolId;
  /** Style de pastille : surface (aplat), trait, symbole */
  kind: 'surface' | 'trait' | 'symbole';
  code: string;
  label: string;
  qty: number;
  unit: string;
  n: number;
  articleId?: string;
}

/** Légende automatique d'une page selon le mode de couleur. */
export function buildLegend(
  measures: Measure[],
  lineById: Map<string, DpgfLine>,
  layerById: Map<string, Layer>,
  mode: ColorMode,
  value: (m: Measure, line: DpgfLine | undefined) => number,
  unitOf: (line: DpgfLine | undefined) => string,
  toolLabels: Record<ToolId, string>,
): LegendEntry[] {
  const map = new Map<string, LegendEntry & { order: number }>();
  const kindOf = (t: ToolId): LegendEntry['kind'] => (t === 'E2' ? 'surface' : t === 'E4' ? 'symbole' : 'trait');
  for (const m of measures) {
    const line = lineById.get(m.articleId);
    const layer = layerById.get(m.layerId);
    let key: string, e: Omit<LegendEntry, 'qty' | 'n'> & { order: number };
    if (mode === 'outil') {
      key = m.tool;
      e = { key, color: TOOL_COLORS[m.tool], kind: kindOf(m.tool), code: m.tool, label: toolLabels[m.tool], unit: '', order: +m.tool.slice(1) };
    } else if (mode === 'calque') {
      key = m.layerId;
      e = { key, color: layer?.color || '#868e96', kind: 'surface', code: '', label: layer?.name ?? 'Calque', unit: '', order: layer?.order ?? 0 };
    } else {
      if (!line) continue;
      key = line.id;
      e = { key, color: line.color, kind: kindOf(m.tool), symbol: m.tool === 'E4' ? line.symbol ?? 'cercle' : undefined, code: line.code, label: line.designation, unit: unitOf(line), order: line.order, articleId: line.id };
    }
    const cur = map.get(key) ?? { ...e, qty: 0, n: 0 };
    cur.n++;
    if (mode === 'article') cur.qty += value(m, line);
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => a.order - b.order).map(({ order: _o, ...rest }) => rest);
}
