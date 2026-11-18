// Export PDF : rapport de quantités par lot, tableau de bord et ratios,
// plans annotés (mesures dessinées sur les pages d'origine) avec légende.

import { LineCapStyle, PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { buildDashboard } from './dashboard';
import { buildLegend, measureColor, symbolPath, type LegendEntry } from './display';
import { centroid, polygonArea } from './geometry';
import { articleTotals, computeMeasure } from './quantities';
import { TOOL_LABELS, COLOR_MODE_LABELS, type Measure, type ProjectState, type Pt } from './types';
import { displayUnit } from './units';

type Data = Omit<ProjectState, 'documents'>;

export interface PdfExportOptions {
  rapport: boolean;
  ratios: boolean;
  /** Pages de plan à annoter (identifiants) */
  plans: string[];
  /** Lecture du PDF d'origine d'un document de plans */
  loadDocument: (docId: string) => Promise<Uint8Array | ArrayBuffer>;
}

// --- Utilitaires -------------------------------------------------------------

const NAVY = rgb(0.063, 0.157, 0.239);
const INK = rgb(0.1, 0.11, 0.14);
const MUTED = rgb(0.42, 0.45, 0.5);
const RULE = rgb(0.86, 0.88, 0.9);
const BAND = rgb(0.945, 0.957, 0.973);
const BAR = rgb(0.11, 0.49, 0.84);
const RED = rgb(0.79, 0.16, 0.16);

function hex(c: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return rgb(0.84, 0.2, 0.42);
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const num = (n: number, d = 2) => (Number.isFinite(n) ? n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const eur = (n: number) => `${num(n)} €`;

/** Les polices standard ne couvrent que WinAnsi : on remplace le reste. */
function clean(font: PDFFont, s: string): string {
  const t = s.replace(/[   ]/g, ' ').replace(/[‘’]/g, '’').replace(/−/g, '-');
  try {
    font.widthOfTextAtSize(t, 10);
    return t;
  } catch {
    return [...t]
      .map((ch) => {
        try {
          font.widthOfTextAtSize(ch, 10);
          return ch;
        } catch {
          return '?';
        }
      })
      .join('');
  }
}

function fit(font: PDFFont, s: string, size: number, w: number): string {
  let t = clean(font, s);
  if (font.widthOfTextAtSize(t, size) <= w) return t;
  while (t.length > 1 && font.widthOfTextAtSize(t + '…', size) > w) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

/** Orientation des sous-contours pour que le remplissage « non nul » évide les trous. */
function ring(pts: Pt[], clockwise: boolean): Pt[] {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return a > 0 === clockwise ? pts : [...pts].reverse();
}
const pathOf = (rings: Pt[][], close: boolean) =>
  rings.map((r) => `M${r.map((p) => `${+p[0].toFixed(2)},${+p[1].toFixed(2)}`).join('L')}${close ? 'Z' : ''}`).join(' ');

// --- Mise en page des pages A4 ----------------------------------------------

const A4: [number, number] = [595.28, 841.89];
const M = 42;

interface Col {
  w: number;
  align?: 'left' | 'right' | 'center';
}

class Report {
  page!: PDFPage;
  y = 0;
  pages: PDFPage[] = [];
  constructor(
    private doc: PDFDocument,
    private f: PDFFont,
    private b: PDFFont,
    private title: string,
  ) {}

  newPage() {
    this.page = this.doc.addPage(A4);
    this.pages.push(this.page);
    this.y = A4[1] - M;
    this.text(this.title, M, this.y - 8, 8, { color: MUTED });
    this.page.drawLine({ start: { x: M, y: this.y - 13 }, end: { x: A4[0] - M, y: this.y - 13 }, thickness: 0.5, color: RULE });
    this.y -= 30;
  }
  ensure(h: number) {
    if (this.y - h < M + 20) this.newPage();
  }
  text(s: string, x: number, y: number, size: number, o: { bold?: boolean; color?: RGB; w?: number; align?: Col['align'] } = {}) {
    const font = o.bold ? this.b : this.f;
    const t = o.w ? fit(font, s, size, o.w) : clean(font, s);
    let xx = x;
    if (o.w && o.align === 'right') xx = x + o.w - font.widthOfTextAtSize(t, size);
    if (o.w && o.align === 'center') xx = x + (o.w - font.widthOfTextAtSize(t, size)) / 2;
    this.page.drawText(t, { x: xx, y, size, font, color: o.color ?? INK });
  }
  h1(s: string, sub?: string) {
    this.ensure(50);
    this.text(s, M, this.y - 16, 17, { bold: true, color: NAVY });
    this.y -= 24;
    if (sub) {
      this.text(sub, M, this.y - 10, 9.5, { color: MUTED });
      this.y -= 18;
    }
    this.y -= 6;
  }
  h2(s: string, right?: string) {
    this.ensure(44);
    this.page.drawRectangle({ x: M, y: this.y - 18, width: A4[0] - 2 * M, height: 18, color: NAVY });
    this.text(s, M + 6, this.y - 13, 10, { bold: true, color: rgb(1, 1, 1), w: A4[0] - 2 * M - 120 });
    if (right) this.text(right, A4[0] - M - 116, this.y - 13, 10, { bold: true, color: rgb(1, 1, 1), w: 110, align: 'right' });
    this.y -= 24;
  }
  row(cols: Col[], cells: string[], o: { bold?: boolean; fill?: RGB; size?: number; indent?: number; color?: RGB; header?: boolean } = {}) {
    const size = o.size ?? 8.5;
    const h = size + 6;
    this.ensure(h);
    const W = cols.reduce((s, c) => s + c.w, 0);
    if (o.fill) this.page.drawRectangle({ x: M, y: this.y - h, width: W, height: h, color: o.fill });
    let x = M;
    cells.forEach((c, i) => {
      const ind = i === 1 ? o.indent ?? 0 : 0;
      this.text(c, x + 3 + ind, this.y - h + 4.5, size, { bold: o.bold || o.header, color: o.color, w: cols[i].w - 6 - ind, align: cols[i].align });
      x += cols[i].w;
    });
    this.page.drawLine({ start: { x: M, y: this.y - h }, end: { x: M + W, y: this.y - h }, thickness: 0.4, color: RULE });
    this.y -= h;
  }
  kpis(items: [string, string][]) {
    const per = 4;
    const gap = 8;
    const w = (A4[0] - 2 * M - gap * (per - 1)) / per;
    for (let i = 0; i < items.length; i += per) {
      this.ensure(50);
      items.slice(i, i + per).forEach(([k, v], j) => {
        const x = M + j * (w + gap);
        this.page.drawRectangle({ x, y: this.y - 42, width: w, height: 42, color: BAND });
        this.text(k, x + 8, this.y - 14, 7.5, { color: MUTED, w: w - 16 });
        this.text(v, x + 8, this.y - 32, 12.5, { bold: true, color: NAVY, w: w - 16 });
      });
      this.y -= 42 + gap;
    }
    this.y -= 6;
  }
  bar(label: string, pct: number, right: string) {
    this.ensure(18);
    const lw = 190;
    const bw = A4[0] - 2 * M - lw - 120;
    this.text(label, M, this.y - 10, 8.5, { w: lw - 8 });
    this.page.drawRectangle({ x: M + lw, y: this.y - 11, width: bw, height: 8, color: BAND });
    if (pct > 0) this.page.drawRectangle({ x: M + lw, y: this.y - 11, width: Math.max(2, (bw * Math.min(100, pct)) / 100), height: 8, color: BAR });
    this.text(right, M + lw + bw + 6, this.y - 10, 8.5, { w: 114, align: 'right' });
    this.y -= 17;
  }
  space(h = 10) {
    this.y -= h;
  }
  footers(project: string) {
    const n = this.pages.length;
    this.pages.forEach((p, i) => {
      const t = clean(this.f, `MétréPlan+ — ${project} — page ${i + 1} / ${n}`);
      p.drawText(t, { x: A4[0] - M - this.f.widthOfTextAtSize(t, 7.5), y: M - 18, size: 7.5, font: this.f, color: MUTED });
    });
  }
}

// --- Export ------------------------------------------------------------------

export async function exportPdf(d: Data, o: PdfExportOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Rapport de quantités — ${d.project.name}`);
  doc.setCreator('MétréPlan+');
  doc.setProducer('MétréPlan+');
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const b = await doc.embedFont(StandardFonts.HelveticaBold);
  const pages = new Map(d.pages.map((p) => [p.id, p]));
  const lines = new Map(d.lines.map((l) => [l.id, l]));
  const layers = new Map(d.layers.map((l) => [l.id, l]));
  const db = buildDashboard(d);
  const date = new Date().toLocaleDateString('fr-FR');
  const sub = [d.project.address, `Phase ${d.project.phase}`, `Édité le ${date}`].filter(Boolean).join(' — ');
  const R = new Report(doc, f, b, `${d.project.name} — ${sub}`);

  if (o.rapport) {
    R.newPage();
    R.h1('Rapport de quantités', `${d.project.name} — ${sub}`);
    R.kpis([
      ['Montant HT', eur(db.ht)],
      [`TVA ${num(d.settings.tvaRate, 1)} %`, eur(db.tva)],
      ['Montant TTC', eur(db.ttc)],
      ['Articles métrés', `${db.measuredArticles} / ${db.articles} (${num(db.pct, 0)} %)`],
    ]);
    const cols: Col[] = [{ w: 72 }, { w: 236 }, { w: 30, align: 'center' }, { w: 58, align: 'right' }, { w: 55, align: 'right' }, { w: 60, align: 'right' }];
    for (const lot of d.lots) {
      const ls = d.lines.filter((l) => l.lotId === lot.id);
      const lp = db.lots.find((x) => x.lot.id === lot.id);
      R.h2(`Lot ${lot.code} — ${lot.name}`, eur(lp?.amount ?? 0));
      R.row(cols, ['N°', 'Désignation', 'U', 'Quantité', 'PU HT', 'Montant HT'], { header: true, fill: BAND, size: 8 });
      for (const l of ls) {
        if (l.kind !== 'article') {
          R.row(cols, [l.code, l.designation, '', '', '', ''], { bold: l.kind === 'titre', indent: l.depth * 6 });
          continue;
        }
        const t = articleTotals(l, d.measures.filter((m) => m.articleId === l.id), pages);
        R.row(
          cols,
          [l.code, l.designation + (t.incoherent ? ` (${t.incoherent} mesure(s) non comptée(s))` : ''), displayUnit(l.unit), t.qty ? num(t.qty) : '', l.unitPrice != null ? num(l.unitPrice) : '', t.amount ? num(t.amount) : ''],
          { indent: l.depth * 6, color: t.incoherent ? RED : undefined },
        );
      }
      R.row(cols, ['', `Total HT du lot ${lot.code}`, '', '', '', eur(lp?.amount ?? 0)], { bold: true });
      R.space(12);
    }
    R.h2('Récapitulatif');
    const rc: Col[] = [{ w: 60 }, { w: 331 }, { w: 120, align: 'right' }];
    for (const lp of db.lots) R.row(rc, [`Lot ${lp.lot.code}`, lp.lot.name, eur(lp.amount)]);
    R.row(rc, ['', 'Montant total HT', eur(db.ht)], { bold: true, fill: BAND });
    R.row(rc, ['', `TVA ${num(d.settings.tvaRate, 1)} %`, eur(db.tva)], { bold: true });
    R.row(rc, ['', 'Montant total TTC', eur(db.ttc)], { bold: true, fill: BAND, size: 10 });
  }

  if (o.ratios) {
    R.newPage();
    R.h1('Tableau de bord et ratios', d.project.name);
    const m2 = (v: number) => (v ? `${num(v)} m²` : '—');
    R.kpis([
      ['Surface de plancher (SP)', m2(db.surfaces.SP)],
      ['Surface hors œuvre (SHO)', m2(db.surfaces.SHO)],
      ['Surface habitable (SH)', m2(db.surfaces.SH)],
      ['Ratio SH / SP', db.ratioShSp != null ? num(db.ratioShSp) : '—'],
      ['Coût HT / m² SP', db.coutM2Sp != null ? eur(db.coutM2Sp) : '—'],
      ['Coût HT / m² SH', db.coutM2Sh != null ? eur(db.coutM2Sh) : '—'],
      ['Montant HT', eur(db.ht)],
      ['Mesures', String(db.measures)],
    ]);
    R.h2('Avancement du métré par lot');
    for (const lp of db.lots) R.bar(`Lot ${lp.lot.code} — ${lp.lot.name}`, lp.pct, `${lp.measured} / ${lp.articles} — ${num(lp.pct, 0)} %`);
    R.space(8);
    if (db.surfacesByLevel.length) {
      R.h2('Surfaces par niveau');
      const c: Col[] = [{ w: 211 }, { w: 100, align: 'right' }, { w: 100, align: 'right' }, { w: 100, align: 'right' }];
      R.row(c, ['Niveau', 'SHO (m²)', 'SP (m²)', 'SH (m²)'], { header: true, fill: BAND, size: 8 });
      for (const lv of db.surfacesByLevel) R.row(c, [lv.level, num(lv.SHO), num(lv.SP), num(lv.SH)]);
      R.row(c, ['Total', num(db.surfaces.SHO), num(db.surfaces.SP), num(db.surfaces.SH)], { bold: true });
      R.space(12);
    }
    if (db.rooms.length) {
      R.h2('Surfaces par pièce');
      const c: Col[] = [{ w: 211 }, { w: 120 }, { w: 90 }, { w: 90, align: 'right' }];
      R.row(c, ['Pièce', 'Niveau', 'Classement', 'Surface (m²)'], { header: true, fill: BAND, size: 8 });
      for (const r of db.rooms) R.row(c, [r.room, r.level, r.tags.join(', '), num(r.surface)]);
      R.space(12);
    }
    if (db.keyRatios.length) {
      R.h2('Quantités clés rapportées à la surface de plancher');
      const c: Col[] = [{ w: 241 }, { w: 80, align: 'right' }, { w: 30, align: 'center' }, { w: 70, align: 'right' }, { w: 90, align: 'right' }];
      R.row(c, ['Article', 'Quantité', 'U', 'Qté / m² SP', 'Montant HT'], { header: true, fill: BAND, size: 8 });
      for (const k of db.keyRatios) R.row(c, [`${k.line.code} ${k.line.designation}`, num(k.qty), k.unit, k.perSp != null ? num(k.perSp, 3) : '—', eur(k.amount)]);
    }
  }
  R.footers(d.project.name);

  // --- Plans annotés ---------------------------------------------------------
  const mode = d.settings.colorMode ?? 'article';
  const srcDocs = new Map<string, PDFDocument>();
  for (const pid of o.plans) {
    const pg = pages.get(pid);
    if (!pg) continue;
    let src = srcDocs.get(pg.docId);
    if (!src) {
      src = await PDFDocument.load(await o.loadDocument(pg.docId), { ignoreEncryption: true });
      srcDocs.set(pg.docId, src);
    }
    const sp = src.getPage(pg.pageIndex);
    const box = sp.getCropBox();
    const rot = (((sp.getRotation().angle % 360) + 360) % 360) as 0 | 90 | 180 | 270;
    const emb = await doc.embedPage(sp, { left: box.x, bottom: box.y, right: box.x + box.width, top: box.y + box.height });
    const swap = rot === 90 || rot === 270;
    const vw = swap ? box.height : box.width;
    const vh = swap ? box.width : box.height;
    const fs = Math.min(22, Math.max(7, vw / 120));
    const panel = fs * 24;
    const out = doc.addPage([vw + panel, vh]);
    const pos = { 0: [0, 0], 90: [0, vh], 180: [vw, vh], 270: [vw, 0] }[rot];
    out.drawPage(emb, { x: pos[0], y: pos[1], rotate: degrees(-rot) });

    const ms = d.measures.filter((m) => m.pageId === pid && layers.get(m.layerId)?.visible !== false);
    const lw = Math.max(0.8, vw / 700);
    const top = { x: 0, y: vh };
    // Surfaces d'abord, puis tracés, puis symboles
    const orderOf = (m: Measure) => (m.tool === 'E2' ? 0 : m.tool === 'E4' ? 2 : 1);
    for (const m of [...ms].sort((a, z) => orderOf(a) - orderOf(z))) {
      const l = lines.get(m.articleId);
      const col = hex(measureColor(m, l, layers.get(m.layerId), mode));
      const r = computeMeasure(m, l, pg);
      const dash = r.status !== 'ok' ? [lw * 4, lw * 3] : undefined;
      if (m.tool === 'E2' && m.points.length > 2) {
        const p = pathOf([ring(m.points, true), ...m.holes.map((h) => ring(h, false))], true);
        out.drawSvgPath(p, { ...top, color: col, opacity: 0.25, borderColor: col, borderWidth: lw, borderDashArray: dash });
      } else if ((m.tool === 'E1' || m.tool === 'E3') && m.points.length > 1) {
        out.drawSvgPath(pathOf([m.points], m.tool === 'E1'), { ...top, borderColor: col, borderWidth: lw * 1.6, borderDashArray: dash, borderLineCap: LineCapStyle.Round });
      } else if (m.tool === 'E4') {
        for (const p of m.points) out.drawSvgPath(symbolPath(l?.symbol, fs * 0.55), { x: p[0], y: vh - p[1], color: col, borderColor: rgb(1, 1, 1), borderWidth: lw * 0.8 });
      }
      // Étiquette de quantité
      const u = displayUnit(l?.unit);
      const label = r.status === 'ok' ? `${num(r.value)} ${u}` : r.status === 'non-calibre' ? 'échelle ?' : 'unité ?';
      let at: Pt | null = null;
      if (m.tool === 'E4' && m.points[0]) at = [m.points[0][0] + fs * 0.8, m.points[0][1] - fs * 0.6];
      else if (m.tool === 'E2' && polygonArea(m.points) > 0) at = centroid(m.points);
      else if (m.points.length > 1) {
        const i = m.tool === 'E1' ? 0 : Math.floor((m.points.length - 1) / 2);
        const a = m.points[i];
        const c = m.points[(i + 1) % m.points.length];
        at = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2 - fs * 0.4];
      }
      if (at) {
        const t = clean(f, m.tool === 'E4' ? `${m.points.length} u` : label);
        const s = fs * 0.85;
        const w = f.widthOfTextAtSize(t, s);
        const cx = m.tool === 'E4' ? at[0] : at[0] - w / 2;
        out.drawRectangle({ x: cx - s * 0.25, y: vh - at[1] - s * 0.3, width: w + s * 0.5, height: s * 1.25, color: rgb(1, 1, 1), opacity: 0.82 });
        out.drawText(t, { x: cx, y: vh - at[1], size: s, font: f, color: r.status === 'ok' ? INK : RED });
      }
    }

    // Panneau de légende à droite du plan
    const x0 = vw;
    out.drawRectangle({ x: x0, y: 0, width: panel, height: vh, color: rgb(1, 1, 1) });
    out.drawLine({ start: { x: x0, y: 0 }, end: { x: x0, y: vh }, thickness: lw, color: RULE });
    const pad = fs;
    let y = vh - pad * 1.8;
    const tx = (s: string, x: number, size: number, o2: { bold?: boolean; color?: RGB; w?: number; align?: Col['align'] } = {}) => {
      const font = o2.bold ? b : f;
      const t = o2.w ? fit(font, s, size, o2.w) : clean(font, s);
      const xx = o2.align === 'right' && o2.w ? x + o2.w - font.widthOfTextAtSize(t, size) : x;
      out.drawText(t, { x: xx, y, size, font, color: o2.color ?? INK });
    };
    const inner = panel - 2 * pad;
    tx(pg.name, x0 + pad, fs * 1.25, { bold: true, color: NAVY, w: inner });
    y -= fs * 1.5;
    tx([pg.level, pg.scale ? `Échelle ${pg.scale.label}` : 'Échelle non définie'].filter(Boolean).join(' — '), x0 + pad, fs * 0.85, { color: MUTED, w: inner });
    y -= fs * 1.2;
    tx(d.project.name, x0 + pad, fs * 0.85, { color: MUTED, w: inner });
    y -= fs * 2;
    tx(`Légende (couleur ${COLOR_MODE_LABELS[mode]})`, x0 + pad, fs, { bold: true, w: inner });
    y -= fs * 1.6;
    const legend: LegendEntry[] = buildLegend(
      ms,
      lines,
      layers,
      mode,
      (m, l) => {
        const r = computeMeasure(m, l, pg);
        return r.status === 'ok' ? r.value : 0;
      },
      (l) => displayUnit(l?.unit),
      TOOL_LABELS,
    );
    const ls = fs * 0.8;
    for (const e of legend) {
      if (y < pad * 3) {
        tx('… (suite dans le rapport)', x0 + pad, ls, { color: MUTED });
        break;
      }
      const c = hex(e.color);
      const sy = y + ls * 0.35;
      const sx = x0 + pad + ls * 0.7;
      if (e.kind === 'surface') out.drawRectangle({ x: x0 + pad, y: sy - ls * 0.45, width: ls * 1.4, height: ls * 0.9, color: c, opacity: 0.35, borderColor: c, borderWidth: lw * 0.8 });
      else if (e.kind === 'trait') out.drawLine({ start: { x: x0 + pad, y: sy }, end: { x: x0 + pad + ls * 1.4, y: sy }, thickness: lw * 2, color: c });
      else out.drawSvgPath(symbolPath(e.symbol, ls * 0.5), { x: sx, y: sy, color: c });
      const qty = mode === 'article' ? `${num(e.qty)} ${e.unit}` : `${e.n} mes.`;
      const qw = f.widthOfTextAtSize(clean(f, qty), ls) + ls;
      tx(`${e.code ? e.code + ' ' : ''}${e.label}`, x0 + pad + ls * 2, ls, { w: inner - ls * 2 - qw });
      tx(qty, x0 + pad, ls, { bold: true, w: inner, align: 'right' });
      y -= ls * 1.7;
    }
    if (!legend.length) tx('Aucune mesure sur ce plan.', x0 + pad, ls, { color: MUTED });
    y = pad * 1.2;
    tx(`MétréPlan+ — ${date}`, x0 + pad, fs * 0.7, { color: MUTED });
  }

  if (!doc.getPageCount()) doc.addPage(A4);
  return doc.save();
}
