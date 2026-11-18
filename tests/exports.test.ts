import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { getDocumentPath, getProjectState, openDb } from '../server/db';
import { seedDemo } from '../server/seed';
import { buildDashboard } from '../shared/dashboard';
import { exportPdf } from '../shared/exportPdf';
import { exportXlsx } from '../shared/exportXlsx';

async function demo() {
  const db = openDb(':memory:');
  const id = await seedDemo(db, mkdtempSync(join(tmpdir(), 'mp-')));
  return { db, s: getProjectState(db, id)! };
}

describe('tableau de bord', () => {
  it('calcule l’avancement, les surfaces et les ratios de la démo', async () => {
    const { s } = await demo();
    const d = buildDashboard(s);
    expect(d.lots).toHaveLength(s.lots.length);
    expect(d.measuredArticles).toBeGreaterThan(0);
    expect(d.surfaces.SP).toBeGreaterThan(0);
    expect(d.surfaces.SHO).toBeGreaterThanOrEqual(d.surfaces.SP);
    expect(d.surfaces.SP).toBeGreaterThanOrEqual(d.surfaces.SH);
    expect(d.coutM2Sp).toBeCloseTo(d.ht / d.surfaces.SP, 6);
    expect(d.ttc).toBeCloseTo(d.ht * (1 + s.settings.tvaRate / 100), 1);
    expect(d.keyRatios.every((k) => k.perSp != null && k.qty > 0)).toBe(true);
  });
});

describe('exports', () => {
  it('produit un classeur Excel avec la DPGF chiffrée, le détail des mesures et le tableau de bord', async () => {
    const { s } = await demo();
    const buf = await exportXlsx(s);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['DPGF chiffrée', 'Détail des mesures', 'Tableau de bord', 'Cohérence']);
    const det = wb.getWorksheet('Détail des mesures')!;
    expect(det.rowCount - 4).toBe(s.measures.length);
    const dpgf = wb.getWorksheet('DPGF chiffrée')!;
    const formulas: string[] = [];
    dpgf.eachRow((r) => r.eachCell((c) => typeof c.value === 'object' && c.value && 'formula' in c.value && formulas.push(String(c.value.formula))));
    expect(formulas.some((f) => f.startsWith('ROUND(D'))).toBe(true);
    expect(formulas.some((f) => f.startsWith('SUM(G'))).toBe(true);
    if (process.env.MP_EXPORT_DIR) writeFileSync(join(process.env.MP_EXPORT_DIR, 'demo.xlsx'), Buffer.from(buf));
  });

  it('produit un PDF avec rapport, ratios et plans annotés', async () => {
    const { db, s } = await demo();
    const planPages = s.pages.map((p) => p.id);
    const bytes = await exportPdf(s, {
      rapport: true,
      ratios: true,
      plans: planPages,
      loadDocument: async (docId) => readFileSync(getDocumentPath(db, docId)!.path),
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(2 + planPages.length);
    const last = pdf.getPage(pdf.getPageCount() - 1);
    expect(last.getWidth()).toBeGreaterThan(last.getHeight());
    if (process.env.MP_EXPORT_DIR) writeFileSync(join(process.env.MP_EXPORT_DIR, 'demo.pdf'), bytes);
  });
});
