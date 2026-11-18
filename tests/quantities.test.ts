import { describe, expect, it } from 'vitest';
import { computeMeasure } from '../shared/quantities';
import type { Pt } from '../shared/types';
import { displayUnit, normalizeUnit, unitDimension } from '../shared/units';

const page = { scale: { method: 'normalisee' as const, metersPerPoint: 0.01, label: 'test' } }; // 1 pt = 1 cm
const sq = (s: number, o = 0): Pt[] => [[o, o], [o + s, o], [o + s, o + s], [o, o + s]];
const art = (unit: string, defaults = {}) => ({ unit, defaults });

describe('unités', () => {
  it('normalise les unités usuelles de DPGF', () => {
    expect(normalizeUnit("l'Ens")).toBe('ens');
    expect(normalizeUnit('ml')).toBe('m');
    expect(normalizeUnit('m²')).toBe('m2');
    expect(normalizeUnit('M3')).toBe('m3');
    expect(normalizeUnit('U')).toBe('u');
    expect(normalizeUnit('F')).toBe('ens');
    expect(unitDimension('m²')).toBe('surface');
    expect(displayUnit('m3')).toBe('m³');
  });
});

describe('calcul des quantités pilotées par l’unité de l’article', () => {
  it('E2 surface avec trou déduit', () => {
    const r = computeMeasure({ tool: 'E2', points: sq(1000), holes: [sq(200, 100)], params: {} }, art('m²'), page);
    expect(r.status).toBe('ok');
    expect(r.value).toBeCloseTo(100 - 4, 6);
  });
  it('E2 vers m³ avec épaisseur par défaut de l’article, coefficient et chute', () => {
    const r = computeMeasure({ tool: 'E2', points: sq(1000), holes: [], params: { coef: 2, chute: 10 } }, art('m3', { epaisseur: 0.2 }), page);
    expect(r.value).toBeCloseTo(100 * 0.2 * 2 * 1.1, 6);
  });
  it('E1 périmètre en ml puis en m² avec hauteur', () => {
    expect(computeMeasure({ tool: 'E1', points: sq(1000), holes: [], params: {} }, art('ml'), page).value).toBeCloseTo(40);
    expect(computeMeasure({ tool: 'E1', points: sq(1000), holes: [], params: { hauteur: 2.5 } }, art('m2'), page).value).toBeCloseTo(100);
  });
  it('E3 longueur ouverte', () => {
    const r = computeMeasure({ tool: 'E3', points: [[0, 0], [300, 400], [300, 1400]], holes: [], params: {} }, art('ml'), page);
    expect(r.value).toBeCloseTo(15);
  });
  it('E4 comptage, et extension par objet', () => {
    const pts: Pt[] = [[0, 0], [1, 1], [2, 2]];
    expect(computeMeasure({ tool: 'E4', points: pts, holes: [], params: {} }, art('u'), undefined).value).toBe(3);
    expect(computeMeasure({ tool: 'E4', points: pts, holes: [], params: { parUnite: 1.5 } }, art('ml'), undefined).value).toBeCloseTo(4.5);
  });
  it('signale les unités incohérentes', () => {
    expect(computeMeasure({ tool: 'E3', points: sq(10), holes: [], params: {} }, art('m²'), page).status).toBe('incoherent');
    expect(computeMeasure({ tool: 'E2', points: sq(10), holes: [], params: {} }, art('ml'), page).status).toBe('incoherent');
    expect(computeMeasure({ tool: 'E1', points: sq(10), holes: [], params: {} }, art('u'), page).status).toBe('incoherent');
  });
  it('page non calibrée', () => {
    expect(computeMeasure({ tool: 'E2', points: sq(10), holes: [], params: {} }, art('m²'), { scale: null }).status).toBe('non-calibre');
  });
});
