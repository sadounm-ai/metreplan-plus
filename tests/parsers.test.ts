import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { analyseCoherence } from '../shared/coherence';
import { normalizeCode, parseCctp } from '../shared/cctpParser';
import { parseDpgfRows } from '../shared/dpgfParser';
import { parseDpgfXlsx } from '../shared/dpgfXlsx';
import { documentLines } from '../shared/pdfText';
import type { TextLine } from '../shared/textLines';
import { buildDemoCctp } from '../server/demo';

const L = (page: number, ...t: string[]): TextLine[] => t.map((text, i) => ({ text, page, x: 0, y: 800 - i * 10 }));

describe('parseur CCTP', () => {
  it('découpe titres et articles, ignore le sommaire', () => {
    const r = parseCctp([
      ...L(1, 'Chapitre N°02 MAÇONNERIE -', 'GROS-OEUVRE', '02-1 TERRASSEMENTS ........ 3', '02-1 1 Fouilles ........ 3'),
      ...L(3, '02-1 TERRASSEMENTS', '02-1 1 Fouilles en rigoles', 'Exécution de fouilles.', 'Localisation :', 'Sous semelles.', '02-1 2 Dallage en béton', 'Dallage de 13 cm.'),
    ]);
    expect(r.lots[0]).toEqual({ code: '02', name: 'MAÇONNERIE - GROS-OEUVRE' });
    expect(r.articles.map((a) => [a.kind, a.code])).toEqual([
      ['titre', '02-1'],
      ['article', '02-1 1'],
      ['article', '02-1 2'],
    ]);
    expect(r.articles[1].localisation).toBe('Sous semelles.');
    expect(r.articles[1].suggestedUnit).toBe('m');
    expect(r.articles[2].suggestedUnit).toBe('m2');
  });
  it('normalise la numérotation', () => {
    expect(normalizeCode('01-3-6 11 2')).toBe(normalizeCode('01-3-6-11 2 '));
    expect(normalizeCode('2.1.3')).toBe('2-1-3');
  });
  it('lit le CCTP de démonstration généré en PDF', async () => {
    const pdf = await getDocument({ data: new Uint8Array(await buildDemoCctp()), verbosity: 0 }).promise;
    const r = parseCctp(await documentLines(pdf));
    expect(r.lots[0].code).toBe('01');
    expect(r.articles.filter((a) => a.kind === 'article')).toHaveLength(18);
  });
});

describe('parseur DPGF', () => {
  it('lit en-têtes, titres, groupes, sous-lignes, totaux et TVA', () => {
    const r = parseDpgfRows([
      {
        name: 'Lot N°01 GO',
        rows: [
          [null, null, 'U', 'Qu.', 'PU en €', 'PRODUIT en €'],
          ['A', 'GROS-OEUVRE', null, null, null, null],
          ['01-3-3', 'FONDATIONS', null, null, null, null],
          ['01-3-3-2 1 ', 'Massifs en béton armé', 'u', 4, 420, 1680],
          ['01-3-3-2 2 ', 'Semelles filantes', null, null, null, 0],
          [null, '     - semelles 50 x 20', 'ml', 61, 95, null],
          [null, '     - semelles 50 x 25', 'ml', null, null, null],
          [null, 'Montant HT du Lot N°01 GROS-OEUVRE', null, null, null, 1680],
          [20, 'Montant TVA (20%)', null, null, null, 336],
        ],
      },
    ]);
    expect(r.tvaRate).toBe(20);
    expect(r.lots).toHaveLength(1);
    expect(r.lots[0].name).toBe('GROS-OEUVRE');
    expect(r.lines.map((l) => [l.kind, l.code, l.unit])).toEqual([
      ['titre', '01-3-3', ''],
      ['article', '01-3-3-2 1', 'u'],
      ['groupe', '01-3-3-2 2', ''],
      ['article', '01-3-3-2 2.a', 'ml'],
      ['article', '01-3-3-2 2.b', 'ml'],
    ]);
    expect(r.lines[3]).toMatchObject({ dpgfQty: 61, unitPrice: 95, designation: 'semelles 50 x 20' });
  });
});

// Tests sur les vrais documents de l'utilisateur, présents uniquement en local (non versionnés)
const PRIV = 'tests/fixtures/private/';
const hasPriv = existsSync(PRIV + 'cctp.pdf') && existsSync(PRIV + 'dpgf.xlsx');
describe.skipIf(!hasPriv)('documents réels (fixtures privées)', () => {
  it('CCTP + DPGF : détection des articles manquants et de la numérotation décalée', async () => {
    const pdf = await getDocument({ data: new Uint8Array(readFileSync(PRIV + 'cctp.pdf')), verbosity: 0 }).promise;
    const c = parseCctp(await documentLines(pdf));
    const d = await parseDpgfXlsx(readFileSync(PRIV + 'dpgf.xlsx'));
    expect(c.articles.filter((a) => a.kind === 'article').length).toBeGreaterThan(100);
    expect(d.lots.length).toBeGreaterThanOrEqual(15);
    const issues = analyseCoherence({ settings: { ecartThreshold: 10 }, lots: d.lots, lines: d.lines, measures: [], pages: [], cctp: c.articles });
    const absent = issues.filter((i) => i.kind === 'cctp-absent-dpgf').map((i) => i.message);
    expect(absent.some((m) => m.includes('Échafaudage commun'))).toBe(true);
    expect(issues.filter((i) => i.kind === 'cctp-numerotation').length).toBe(3);
  }, 60000);
});
