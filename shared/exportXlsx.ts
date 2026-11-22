// Export Excel : DPGF quantifiée et chiffrée (formules), détail des mesures
// avec leur origine, tableau de bord et analyse de cohérence.

import ExcelJS from 'exceljs';
import { analyseCoherence, ISSUE_LABELS } from './coherence';
import { buildDashboard } from './dashboard';
import { articleTotals, computeMeasure, effectiveParams } from './quantities';
import { TOOL_LABELS, type ProjectState } from './types';
import { displayUnit } from './units';

type Data = Omit<ProjectState, 'documents'>;

const NAVY = 'FF10283D';
const TITLE_FILL = 'FFF1F4F8';
const EUR = '#,##0.00 "€";-#,##0.00 "€";""';
const QTY = '#,##0.00;-#,##0.00;""';

const thin = { style: 'thin' as const, color: { argb: 'FFDDE1E7' } };
const border = { top: thin, bottom: thin, left: thin, right: thin };

export interface XlsxExportOptions {
  /** Logo PNG de l'auteur (MSBIM5D), placé à droite de l'en-tête de chaque feuille */
  logo?: { png: Uint8Array | ArrayBuffer; width: number; height: number };
}

function toBase64(bytes: Uint8Array) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Largeur approximative d'une colonne Excel en pixels */
const colPx = (w: number | undefined) => Math.round((w ?? 9) * 7 + 5);

function placeLogo(ws: ExcelJS.Worksheet, imageId: number | undefined, size: { width: number; height: number } | undefined, cols: number) {
  if (imageId == null || !size) return;
  const h = 40;
  const w = (size.width * h) / size.height;
  // Ancre la fin du logo sur le bord droit de la dernière colonne de l'en-tête
  let px = w + 4;
  let col = cols;
  while (col > 0 && px > colPx(ws.getColumn(col).width)) {
    px -= colPx(ws.getColumn(col).width);
    col--;
  }
  const c0 = Math.max(0, col - px / colPx(ws.getColumn(Math.max(1, col)).width));
  ws.getRow(1).height = 22;
  ws.getRow(2).height = 18;
  ws.addImage(imageId, { tl: { col: c0, row: 0.1 }, ext: { width: w, height: h }, editAs: 'oneCell' } as never);
}

function head(ws: ExcelJS.Worksheet, d: Data, title: string, cols: number) {
  ws.mergeCells(1, 1, 1, cols);
  const c = ws.getCell(1, 1);
  c.value = `${title} — ${d.project.name}`;
  c.font = { bold: true, size: 14, color: { argb: NAVY } };
  ws.mergeCells(2, 1, 2, cols);
  ws.getCell(2, 1).value = [d.project.address, `Phase ${d.project.phase}`, `Édité le ${new Date().toLocaleDateString('fr-FR')} avec MétréPlan+`].filter(Boolean).join(' — ');
  ws.getCell(2, 1).font = { italic: true, color: { argb: 'FF6B7280' } };
}

function headerRow(ws: ExcelJS.Worksheet, row: number, labels: string[]) {
  const r = ws.getRow(row);
  labels.forEach((l, i) => {
    const c = r.getCell(i + 1);
    c.value = l;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    c.alignment = { vertical: 'middle', wrapText: true };
    c.border = border;
  });
  r.height = 22;
}

export async function exportXlsx(d: Data, opts: XlsxExportOptions = {}): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const logoId = opts.logo ? wb.addImage({ base64: toBase64(new Uint8Array(opts.logo.png)), extension: 'png' }) : undefined;
  const logo = (ws: ExcelJS.Worksheet, cols: number) => placeLogo(ws, logoId, opts.logo, cols);
  wb.creator = 'MétréPlan+';
  wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true;
  const pages = new Map(d.pages.map((p) => [p.id, p]));
  const layers = new Map(d.layers.map((l) => [l.id, l]));
  const lines = new Map(d.lines.map((l) => [l.id, l]));
  const lots = new Map(d.lots.map((l) => [l.id, l]));

  // 1. DPGF chiffrée -----------------------------------------------------------
  const ws = wb.addWorksheet('DPGF chiffrée', { views: [{ state: 'frozen', ySplit: 4 }], pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  ws.columns = [{ width: 16 }, { width: 60 }, { width: 7 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 16 }];
  head(ws, d, 'DPGF quantifiée et chiffrée', 7);
  logo(ws, 7);
  headerRow(ws, 4, ['N°', 'Désignation', 'U', 'Qté métrée', 'Qté DPGF', 'PU HT', 'Montant HT']);
  let r = 5;
  const lotTotalCells: string[] = [];
  let htSum = 0;
  for (const lot of d.lots) {
    const lr = ws.getRow(r++);
    lr.getCell(1).value = `Lot ${lot.code}`;
    lr.getCell(2).value = lot.name;
    lr.eachCell((c) => {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    });
    for (let i = 1; i <= 7; i++) lr.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3B57' } };
    const first = r;
    let lotSum = 0;
    for (const l of d.lines.filter((x) => x.lotId === lot.id)) {
      const row = ws.getRow(r);
      row.getCell(1).value = l.code;
      row.getCell(2).value = l.designation;
      row.getCell(2).alignment = { indent: Math.min(l.depth, 6), wrapText: true };
      if (l.kind === 'article') {
        const t = articleTotals(l, d.measures.filter((m) => m.articleId === l.id), pages);
        row.getCell(3).value = displayUnit(l.unit);
        row.getCell(4).value = t.qty || null;
        row.getCell(5).value = l.dpgfQty;
        row.getCell(6).value = l.unitPrice;
        row.getCell(7).value = { formula: `ROUND(D${r}*F${r},2)`, result: t.amount };
        lotSum += t.amount;
        row.getCell(4).numFmt = QTY;
        row.getCell(5).numFmt = QTY;
        row.getCell(6).numFmt = EUR;
        row.getCell(7).numFmt = EUR;
        if (t.incoherent) row.getCell(4).note = `${t.incoherent} mesure(s) à l’unité incohérente non comptée(s)`;
      } else {
        row.font = { bold: l.kind === 'titre', italic: l.kind === 'groupe' };
        if (l.kind === 'titre') for (let i = 1; i <= 7; i++) row.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_FILL } };
      }
      for (let i = 1; i <= 7; i++) row.getCell(i).border = border;
      r++;
    }
    const tr = ws.getRow(r);
    tr.getCell(2).value = `Total HT du lot ${lot.code} — ${lot.name}`;
    tr.getCell(7).value = { formula: `SUM(G${first}:G${r - 1})`, result: Math.round(lotSum * 100) / 100 };
    htSum += lotSum;
    tr.getCell(7).numFmt = EUR;
    tr.font = { bold: true };
    lotTotalCells.push(`G${r}`);
    r += 2;
  }
  const totalHt = ws.getRow(r);
  totalHt.getCell(2).value = 'Montant total HT';
  const htR = Math.round(htSum * 100) / 100;
  const tvaR = Math.round(htR * d.settings.tvaRate) / 100;
  totalHt.getCell(7).value = { formula: lotTotalCells.length ? lotTotalCells.join('+') : '0', result: htR };
  const tvaRow = ws.getRow(r + 1);
  tvaRow.getCell(2).value = `TVA ${d.settings.tvaRate.toLocaleString('fr-FR')} %`;
  tvaRow.getCell(6).value = d.settings.tvaRate / 100;
  tvaRow.getCell(6).numFmt = '0.0%';
  tvaRow.getCell(7).value = { formula: `ROUND(G${r}*F${r + 1},2)`, result: tvaR };
  const ttc = ws.getRow(r + 2);
  ttc.getCell(2).value = 'Montant total TTC';
  ttc.getCell(7).value = { formula: `G${r}+G${r + 1}`, result: Math.round((htR + tvaR) * 100) / 100 };
  for (const row of [totalHt, tvaRow, ttc]) {
    row.font = { bold: true, size: 12 };
    row.getCell(7).numFmt = EUR;
  }

  // 2. Détail des mesures -------------------------------------------------------
  const wm = wb.addWorksheet('Détail des mesures', { views: [{ state: 'frozen', ySplit: 4 }] });
  const cols = ['Lot', 'N° article', 'Désignation', 'U', 'Plan', 'Niveau', 'Calque', 'Outil', 'Libellé', 'Pièce', 'Longueur (m)', 'Surface (m²)', 'Nombre', 'Hauteur', 'Épaisseur', 'Coef.', 'Chute %', 'Qté / objet', 'Quantité retenue', 'Statut', 'Calcul', 'Saisie le'];
  wm.columns = [6, 14, 40, 6, 24, 10, 14, 14, 22, 14, 12, 12, 9, 9, 9, 7, 8, 10, 14, 12, 50, 18].map((width) => ({ width }));
  head(wm, d, 'Détail des mesures par article', cols.length);
  logo(wm, 9);
  headerRow(wm, 4, cols);
  r = 5;
  const sorted = [...d.measures].sort((a, b) => (lines.get(a.articleId)?.order ?? 0) - (lines.get(b.articleId)?.order ?? 0) || a.createdAt.localeCompare(b.createdAt));
  for (const m of sorted) {
    const l = lines.get(m.articleId);
    const p = pages.get(m.pageId);
    const res = computeMeasure(m, l, p);
    const e = effectiveParams(m, l);
    const num = (v: number) => (Number.isFinite(v) ? v : null);
    const row = wm.getRow(r++);
    row.values = [
      l ? lots.get(l.lotId)?.code : '',
      l?.code ?? '',
      l?.designation ?? '(article supprimé)',
      displayUnit(l?.unit),
      p?.name ?? '',
      p?.level ?? '',
      layers.get(m.layerId)?.name ?? '',
      `${m.tool} ${TOOL_LABELS[m.tool]}`,
      m.label,
      m.room ?? '',
      res.longueur ?? null,
      res.surface ?? null,
      res.nombre ?? null,
      num(e.hauteur),
      num(e.epaisseur),
      e.coef,
      e.chute,
      num(e.parUnite),
      res.status === 'ok' ? res.value : null,
      res.status === 'ok' ? 'OK' : res.status === 'non-calibre' ? 'Sans échelle' : 'Incohérent',
      res.status === 'ok' ? res.formula : res.message ?? '',
      new Date(m.createdAt).toLocaleString('fr-FR'),
    ];
    for (const c of [11, 12, 14, 15, 18, 19]) row.getCell(c).numFmt = '#,##0.000';
    if (res.status !== 'ok') row.getCell(20).font = { color: { argb: 'FFC92A2A' }, bold: true };
  }
  wm.autoFilter = { from: { row: 4, column: 1 }, to: { row: Math.max(4, r - 1), column: cols.length } };

  // 3. Tableau de bord -----------------------------------------------------------
  const db = buildDashboard(d);
  const wd = wb.addWorksheet('Tableau de bord');
  wd.columns = [{ width: 44 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }];
  head(wd, d, 'Tableau de bord', 5);
  logo(wd, 5);
  r = 4;
  const kv = (k: string, v: number | string | null, fmt?: string) => {
    const row = wd.getRow(r++);
    row.getCell(1).value = k;
    row.getCell(2).value = v;
    if (fmt) row.getCell(2).numFmt = fmt;
    row.getCell(1).font = { bold: true };
  };
  kv('Montant HT', db.ht, EUR);
  kv('Montant TTC', db.ttc, EUR);
  kv('Avancement du métré (articles métrés)', db.pct / 100, '0.0%');
  kv('Surface de plancher (SP)', db.surfaces.SP, '#,##0.00 "m²"');
  kv('Surface hors œuvre (SHO)', db.surfaces.SHO, '#,##0.00 "m²"');
  kv('Surface habitable (SH)', db.surfaces.SH, '#,##0.00 "m²"');
  kv('Coût HT / m² SP', db.coutM2Sp, EUR);
  kv('Coût HT / m² SH', db.coutM2Sh, EUR);
  kv('Ratio SH / SP', db.ratioShSp, '0.00');
  r++;
  headerRow(wd, r++, ['Avancement par lot', 'Articles', 'Métrés', '% métré', 'Montant HT']);
  for (const lp of db.lots) {
    const row = wd.getRow(r++);
    row.values = [`Lot ${lp.lot.code} — ${lp.lot.name}`, lp.articles, lp.measured, lp.pct / 100, lp.amount];
    row.getCell(4).numFmt = '0.0%';
    row.getCell(5).numFmt = EUR;
  }
  r++;
  headerRow(wd, r++, ['Surfaces par niveau', 'SHO (m²)', 'SP (m²)', 'SH (m²)', '']);
  for (const lv of db.surfacesByLevel) {
    const row = wd.getRow(r++);
    row.values = [lv.level, lv.SHO, lv.SP, lv.SH];
    for (const c of [2, 3, 4]) row.getCell(c).numFmt = '#,##0.00';
  }
  r++;
  headerRow(wd, r++, ['Surfaces par pièce', 'Niveau', 'Classement', 'Surface (m²)', '']);
  for (const rm of db.rooms) {
    const row = wd.getRow(r++);
    row.values = [rm.room, rm.level, rm.tags.join(', '), rm.surface];
    row.getCell(4).numFmt = '#,##0.00';
  }
  r++;
  headerRow(wd, r++, ['Quantités clés', 'Quantité', 'Unité', 'Qté / m² SP', 'Montant HT']);
  for (const k of db.keyRatios) {
    const row = wd.getRow(r++);
    row.values = [`${k.line.code} ${k.line.designation}`, k.qty, k.unit, k.perSp, k.amount];
    row.getCell(2).numFmt = '#,##0.00';
    row.getCell(4).numFmt = '0.000';
    row.getCell(5).numFmt = EUR;
  }

  // 4. Cohérence ----------------------------------------------------------------
  const issues = analyseCoherence(d);
  const wc = wb.addWorksheet('Cohérence');
  wc.columns = [{ width: 42 }, { width: 10 }, { width: 110 }];
  head(wc, d, 'Analyse de cohérence plans / CCTP / DPGF', 3);
  logo(wc, 3);
  headerRow(wc, 4, ['Contrôle', 'Gravité', 'Détail']);
  issues.forEach((i, n) => {
    wc.getRow(5 + n).values = [ISSUE_LABELS[i.kind], i.severity, i.message];
  });

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
