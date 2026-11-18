// Projet de démonstration : petit logement collectif (4 logements, RDC + R+1).
// Les plans et le CCTP sont générés à la volée en PDF vectoriel (pdf-lib), les
// données sont fictives. Les coordonnées sont exprimées en mètres puis
// converties en points PDF à l'échelle 1/100.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { colorFor, uid } from '../shared/ids';
import type { CctpArticle, DpgfLine, EditableState, Layer, Lot, Measure, MeasureParams, PlanPage, Pt, SurfaceTag } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/types';

const A3: [number, number] = [1190.55, 841.89];
/** points PDF par mètre réel à l'échelle 1/100 */
export const K = 72 / 0.0254 / 100;
const OX = 130;
const OY = 150;

/** Coordonnées « viewport » (origine en haut à gauche) d'un point en mètres. */
export const vp = (x: number, y: number): Pt => [OX + x * K, OY + y * K];

type Rect = [number, number, number, number]; // x1, y1, x2, y2 en mètres

const ROOMS_A: { name: string; r: Rect; sol: 'pvc' | 'carrelage' }[] = [
  { name: 'Séjour', r: [0.2, 0.2, 5.5, 6.0], sol: 'pvc' },
  { name: 'Cuisine', r: [5.57, 0.2, 8.5, 4.0], sol: 'carrelage' },
  { name: 'Salle d’eau', r: [5.57, 4.07, 8.5, 6.0], sol: 'carrelage' },
  { name: 'Dégagement', r: [0.2, 6.07, 8.5, 7.0], sol: 'pvc' },
  { name: 'Chambre 1', r: [0.2, 7.07, 4.2, 10.8], sol: 'pvc' },
  { name: 'Chambre 2', r: [4.27, 7.07, 8.5, 10.8], sol: 'pvc' },
];
const mirror = (r: Rect): Rect => [20 - r[2], r[1], 20 - r[0], r[3]];
const ROOMS_B = ROOMS_A.map((x) => ({ ...x, r: mirror(x.r) }));
const STAIR: Rect = [8.8, 0.4, 11.2, 4.6];
const LIFT: Rect = [8.8, 8.4, 10.4, 10.6];

const rectPts = (r: Rect): Pt[] => [vp(r[0], r[1]), vp(r[2], r[1]), vp(r[2], r[3]), vp(r[0], r[3])];
const area = (r: Rect) => (r[2] - r[0]) * (r[3] - r[1]);
const fr = (n: number) => n.toFixed(2).replace('.', ',');

class Drawer {
  constructor(
    private page: PDFPage,
    private font: PDFFont,
    private bold: PDFFont,
  ) {}
  private y = (v: number) => this.page.getHeight() - v;
  fillRect(r: Rect, gray = 0.35) {
    const [x1, y1] = vp(r[0], r[1]);
    const [x2, y2] = vp(r[2], r[3]);
    this.page.drawRectangle({ x: x1, y: this.y(y2), width: x2 - x1, height: y2 - y1, color: rgb(gray, gray, gray) });
  }
  strokeRect(r: Rect, width = 1.4, dash?: number[], gray = 0.15) {
    const [x1, y1] = vp(r[0], r[1]);
    const [x2, y2] = vp(r[2], r[3]);
    this.page.drawRectangle({
      x: x1,
      y: this.y(y2),
      width: x2 - x1,
      height: y2 - y1,
      borderColor: rgb(gray, gray, gray),
      borderWidth: width,
      borderDashArray: dash,
    });
  }
  line(a: Pt, b: Pt, width = 0.8, gray = 0.1, dash?: number[]) {
    this.page.drawLine({ start: { x: a[0], y: this.y(a[1]) }, end: { x: b[0], y: this.y(b[1]) }, thickness: width, color: rgb(gray, gray, gray), dashArray: dash });
  }
  text(s: string, p: Pt, size = 8, bold = false, center = false) {
    const f = bold ? this.bold : this.font;
    const w = center ? f.widthOfTextAtSize(s, size) / 2 : 0;
    this.page.drawText(s, { x: p[0] - w, y: this.y(p[1]) - size / 3, size, font: f, color: rgb(0.1, 0.1, 0.12) });
  }
  /** Cote horizontale ou verticale avec texte, en mètres. */
  cote(a: [number, number], b: [number, number], offset: number) {
    const horiz = a[1] === b[1];
    const pa = horiz ? vp(a[0], a[1] + offset) : vp(a[0] + offset, a[1]);
    const pb = horiz ? vp(b[0], b[1] + offset) : vp(b[0] + offset, b[1]);
    this.line(pa, pb, 0.5);
    const t = 4;
    for (const p of [pa, pb]) this.line([p[0] - t, p[1] + t], [p[0] + t, p[1] - t], 0.8);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const mid: Pt = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
    if (horiz) this.text(fr(len), [mid[0], mid[1] - 7], 8, false, true);
    else this.text(fr(len), [mid[0] - 16, mid[1]], 8, false, true);
  }
  cartouche(title: string, level: string) {
    const x = 840;
    const yTop = 655;
    const w = 320;
    const h = 150;
    this.page.drawRectangle({ x, y: this.y(yTop + h), width: w, height: h, borderColor: rgb(0.1, 0.1, 0.1), borderWidth: 1 });
    for (const dy of [34, 62, 90, 118]) this.line([x, yTop + dy], [x + w, yTop + dy], 0.5);
    this.text('MÉTRÉPLAN+ — PROJET DE DÉMONSTRATION', [x + 10, yTop + 12], 9, true);
    this.text('Résidence Les Tilleuls — 4 logements collectifs', [x + 10, yTop + 25], 8);
    this.text(title, [x + 10, yTop + 50], 11, true);
    this.text(`Niveau : ${level}`, [x + 10, yTop + 77], 9);
    this.text('Échelle : 1/100', [x + 170, yTop + 77], 9, true);
    this.text('Phase : DCE — Indice A — Format A3', [x + 10, yTop + 105], 8);
    this.text('Données fictives, à usage de test uniquement', [x + 10, yTop + 133], 7);
  }
}

function drawWalls(d: Drawer, withPartitions: boolean, withRoomLabels: boolean) {
  // Murs de façade 20 cm
  d.fillRect([0, 0, 20, 0.2]);
  d.fillRect([0, 10.8, 20, 11]);
  d.fillRect([0, 0, 0.2, 11]);
  d.fillRect([19.8, 0, 20, 11]);
  // Refends de la cage d'escalier 18 cm
  d.fillRect([8.5, 0.2, 8.68, 10.8]);
  d.fillRect([11.32, 0.2, 11.5, 10.8]);
  // Baies (fenêtres) en façade nord et sud
  const win = (x1: number, x2: number, y: number) => {
    d.fillRect([x1, y, x2, y + 0.2], 1);
    d.line(vp(x1, y + 0.08), vp(x2, y + 0.08), 0.5);
    d.line(vp(x1, y + 0.12), vp(x2, y + 0.12), 0.5);
  };
  for (const [a, b] of [[1.5, 3.9], [6.3, 7.7], [12.3, 13.7], [16.1, 18.5]]) win(a, b, 0);
  for (const [a, b] of [[1.2, 2.8], [5.2, 6.8], [13.2, 14.8], [17.2, 18.8]]) win(a, b, 10.8);
  // Porte d'entrée du hall
  d.fillRect([9.3, 10.8, 10.7, 11], 1);
  if (withPartitions) {
    for (const r of [...ROOMS_A, ...ROOMS_B]) d.strokeRect(r.r, 1.2, undefined, 0.25);
  }
  // Escalier et gaine d'ascenseur
  d.strokeRect(STAIR, 1);
  for (let i = 1; i < 14; i++) d.line(vp(STAIR[0], STAIR[1] + i * 0.3), vp(STAIR[2], STAIR[1] + i * 0.3), 0.4, 0.3);
  d.line(vp(10, STAIR[1]), vp(10, STAIR[3]), 0.6, 0.3);
  d.strokeRect(LIFT, 1);
  d.line(vp(LIFT[0], LIFT[1]), vp(LIFT[2], LIFT[3]), 0.5, 0.4);
  d.line(vp(LIFT[2], LIFT[1]), vp(LIFT[0], LIFT[3]), 0.5, 0.4);
  if (withRoomLabels) {
    for (const r of [...ROOMS_A, ...ROOMS_B]) {
      const c = vp((r.r[0] + r.r[2]) / 2, (r.r[1] + r.r[3]) / 2);
      d.text(r.name, [c[0], c[1] - 5], 8, true, true);
      d.text(`${fr(area(r.r))} m²`, [c[0], c[1] + 6], 7, false, true);
    }
    d.text('Hall / Escalier', [vp(10, 6)[0], vp(10, 6)[1]], 7, true, true);
    d.text('Asc.', [vp(9.6, 9.5)[0], vp(9.6, 9.5)[1]], 7, false, true);
    d.text('LOGEMENT A — T3', [vp(4.2, -0.6)[0], vp(4.2, -0.6)[1]], 9, true, true);
    d.text('LOGEMENT B — T3', [vp(15.8, -0.6)[0], vp(15.8, -0.6)[1]], 9, true, true);
  }
  d.cote([0, 0], [20, 0], -1.4);
  d.cote([0, 0], [8.5, 0], -2.4);
  d.cote([0, 0], [0, 11], -1.4);
}

const MASSIFS: [number, number][] = [
  [3, 12.6],
  [8.6, 12.6],
  [11.4, 12.6],
  [17, 12.6],
];

export async function buildDemoPlans(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Résidence Les Tilleuls — Plans (démonstration)');
  pdf.setCreator('MétréPlan+');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Page 1 : fondations
  {
    const page = pdf.addPage(A3);
    const d = new Drawer(page, font, bold);
    d.strokeRect([0, 0, 20, 11], 0.6, [3, 3], 0.5);
    d.strokeRect([-0.15, -0.15, 20.15, 11.15], 1.4);
    d.strokeRect([0.35, 0.35, 19.65, 10.65], 1.4);
    for (const x of [8.59, 11.41]) d.strokeRect([x - 0.25, 0.35, x + 0.25, 10.65], 1.4);
    for (const [x, y] of MASSIFS) {
      d.fillRect([x - 0.5, y - 0.5, x + 0.5, y + 0.5], 0.75);
      d.strokeRect([x - 0.5, y - 0.5, x + 0.5, y + 0.5], 1.2);
      d.text('M1', vp(x, y), 7, true, true);
    }
    d.text('SF 50x20', vp(4, -0.5), 8, true, true);
    d.text('SF 50x25', vp(8.59, 5.6), 7, true, true);
    d.text('Massifs M1 100x100x40 (poteaux d’auvent)', vp(10, 13.6), 8, false, true);
    d.cote([0, 0], [20, 0], -1.4);
    d.cote([0, 0], [0, 11], -1.4);
    d.cartouche('PLAN DES FONDATIONS', 'Fondations');
  }
  // Page 2 : RDC
  {
    const page = pdf.addPage(A3);
    const d = new Drawer(page, font, bold);
    drawWalls(d, true, true);
    d.cartouche('PLAN DU REZ-DE-CHAUSSÉE', 'RDC');
  }
  // Page 3 : R+1
  {
    const page = pdf.addPage(A3);
    const d = new Drawer(page, font, bold);
    drawWalls(d, true, true);
    d.cartouche('PLAN DU 1er ÉTAGE', 'R+1');
  }
  return pdf.save();
}

// ---------------------------------------------------------------------------
// CCTP de démonstration

const CCTP_ARTICLES: [string, string, string, string][] = [
  ['01-3-1', 'TRAVAUX PRÉLIMINAIRES', '', ''],
  ['01-3-1 1', 'Installation de chantier', 'L’entreprise devra l’installation complète du chantier : clôtures, base vie, branchements provisoires et repli en fin de travaux.', 'Pour l’ensemble de l’opération.'],
  ['01-3-1 3', 'Implantation de la construction', 'Implantation des ouvrages par un géomètre agréé, y compris piquetage et procès-verbal.', 'Pour l’ensemble des bâtiments.'],
  ['01-3-2', 'TERRASSEMENTS', '', ''],
  ['01-3-2-1 1', 'Décapage de la terre végétale', 'Décapage sur 30 cm d’épaisseur et mise en dépôt sur site pour réemploi.', 'Emprise du bâtiment avec empattement de 2,00 m.'],
  ['01-3-2-2 1', 'Fouilles en trous', 'Fouilles en puits pour massifs isolés, finition manuelle des fonds.', 'Au droit des massifs, suivant plans.'],
  ['01-3-2-2 2', 'Fouilles en rigoles', 'Fouilles en rigoles pour semelles filantes, finition manuelle.', 'Au droit des semelles filantes, suivant plans.'],
  ['01-3-2-3 2', 'Évacuation des déblais excédentaires', 'Chargement, transport et mise en décharge agréée, bons de décharge à fournir.', 'Pour l’ensemble des terres excédentaires.'],
  ['01-3-3', 'FONDATIONS SUPERFICIELLES', '', ''],
  ['01-3-3-1 1', 'Béton de propreté', 'Béton de propreté de 5 cm minimum, débord de 10 cm de part et d’autre.', 'Sous l’ensemble des fondations.'],
  ['01-3-3-2 1', 'Massifs en béton armé', 'Massifs isolés en béton armé C25/30 suivant étude structure.', 'Poteaux de l’auvent, suivant plans.'],
  ['01-3-3-2 2', 'Semelles filantes en béton armé', 'Semelles filantes en béton armé, sections suivant étude structure (50 x 20 et 50 x 25 cm).', 'Sous murs de façade et refends.'],
  ['01-3-5', 'SYSTÈME PORTEUR EN INFRASTRUCTURE', '', ''],
  ['01-3-5-1 1', 'Imperméabilisation des soubassements', 'Deux couches d’enduit bitumineux sur parties enterrées, hauteur 60 cm.', 'Périphérie des soubassements.'],
  ['01-3-5-4 4', 'Dallage en béton armé', 'Dallage de 13 cm sur hérisson et film polyéthylène, finition talochée.', 'Rez-de-chaussée, déduction des trémies.'],
  ['01-3-6', 'SYSTÈME PORTEUR EN SUPERSTRUCTURE', '', ''],
  ['01-3-6-1 4', 'Murs de façades en blocs béton à bancher', 'Murs en blocs à bancher de 20 cm remplis de béton, hauteur d’étage 2,70 m.', 'Façades RDC et R+1.'],
  ['01-3-6-2 1', 'Voiles porteurs en béton armé', 'Voiles de refend de 18 cm coulés en place.', 'Cage d’escalier.'],
  ['01-3-6-5 1', 'Planchers d’étages entre points d’appuis', 'Dalle pleine coulée en place de 20 cm.', 'Plancher haut du RDC.'],
  ['01-3-6-5 2', 'Rives de trémies de planchers', 'Rives coffrées des trémies d’escalier et d’ascenseur.', 'Au droit des trémies.'],
  ['01-3-6-10 1', 'Seuils de portes en béton de gravillon', 'Seuils préfabriqués avec rejingot.', 'Portes extérieures.'],
  ['01-3-6-11 1', 'Escaliers droits en béton armé', 'Escalier droit préfabriqué, deux volées par niveau.', 'Cage d’escalier commune.'],
  ['01-3-8', 'OUVRAGES DIVERS', '', ''],
  ['01-3-8 2', 'Échafaudage commun', 'Échafaudage de pied conforme R408, mis à disposition des autres corps d’état.', 'Toutes façades.'],
];

export async function buildDemoCctp(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle('CCTP Lot 01 Gros-œuvre (démonstration)');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const A4: [number, number] = [595.28, 841.89];
  let page = pdf.addPage(A4);
  let y = 0;
  const header = () => {
    page.drawText('Résidence Les Tilleuls — CCTP — Démonstration MétréPlan+', { x: 60, y: 810, size: 8, font });
    page.drawText(`Page ${pdf.getPageCount()}`, { x: 500, y: 30, size: 8, font });
    y = 770;
  };
  const put = (s: string, size: number, f: PDFFont, x = 60) => {
    if (y < 70) {
      page = pdf.addPage(A4);
      header();
    }
    page.drawText(s, { x, y, size, font: f });
    y -= size + 6;
  };
  header();
  put('Chapitre N°01 GROS-ŒUVRE', 16, bold);
  put('CCTP - Phase DCE - indice A', 10, font);
  y -= 20;
  for (const [code, title, body, loc] of CCTP_ARTICLES) {
    y -= 6;
    put(`${code} ${title}`, title === title.toUpperCase() ? 11 : 10, bold, 50);
    if (body) {
      const words = body.split(' ');
      let line = '';
      for (const w of words) {
        if (font.widthOfTextAtSize(line + ' ' + w, 9) > 460) {
          put(line, 9, font, 70);
          line = w;
        } else line = line ? `${line} ${w}` : w;
      }
      if (line) put(line, 9, font, 70);
      put('Localisation :', 9, bold, 85);
      put(loc, 9, font, 85);
    }
  }
  return pdf.save();
}

// ---------------------------------------------------------------------------
// DPGF, calques et mesures de démonstration

type LineDef = [code: string, designation: string, unit: string, pu?: number, extra?: { qty?: number; manual?: number; defaults?: MeasureParams }];

const DPGF: { code: string; name: string; lines: LineDef[] }[] = [
  {
    code: '01',
    name: 'GROS-ŒUVRE',
    lines: [
      ['01-3-1', 'TRAVAUX PRÉLIMINAIRES', ''],
      ['01-3-1 1', 'Installation de chantier', 'ens', 12500, { manual: 1 }],
      ['01-3-1 3', 'Implantation de la construction', 'ens', 1800, { manual: 1 }],
      ['01-3-2', 'TERRASSEMENTS', ''],
      ['01-3-2-1 1', 'Décapage de la terre végétale', 'm²', 4.5],
      ['01-3-2-2 1', 'Fouilles en trous', 'u', 85],
      ['01-3-2-2 2', 'Fouilles en rigoles', 'ml', 28],
      ['01-3-2-3 2', 'Évacuation des déblais excédentaires', 'm³', 32],
      ['01-3-3', 'FONDATIONS SUPERFICIELLES', ''],
      ['01-3-3-1 1', 'Béton de propreté', 'm²', 18],
      ['01-3-3-2 1', 'Massifs en béton armé', 'u', 420],
      ['01-3-3-2 2', 'Semelles filantes en béton armé', 'groupe'],
      ['01-3-3-2 2.a', 'semelles filantes en béton armé 50 x 20 cm ht', 'ml', 95, { qty: 61 }],
      ['01-3-3-2 2.b', 'semelles filantes en béton armé 50 x 25 cm ht', 'ml', 110, { qty: 21 }],
      ['01-3-5', 'SYSTÈME PORTEUR EN INFRASTRUCTURE', ''],
      ['01-3-5-1 1', 'Imperméabilisation des soubassements', 'm²', 22],
      ['01-3-5-4 4', 'Dallage en béton armé de 13 cm d’épaisseur', 'm²', 58, { qty: 180 }],
      ['01-3-6', 'SYSTÈME PORTEUR EN SUPERSTRUCTURE', ''],
      ['01-3-6-1 4', 'Murs de façades en blocs béton à bancher', 'm²', 115, { defaults: { hauteur: 2.7 } }],
      ['01-3-6-2 1', 'Voiles porteurs en béton armé de 18 cm', 'm²', 135, { defaults: { hauteur: 2.7 } }],
      ['01-3-6-5 1', 'Planchers d’étages entre points d’appuis 20 cm', 'm²', 92],
      ['01-3-6-5 2', 'Rives de trémies de planchers', 'ml', 38],
      ['01-3-6-10 1', 'Seuils de portes en béton de gravillon', 'ml', 65],
      ['01-3-6-11 1', 'Escaliers droits en béton armé', 'u', 3800],
    ],
  },
  {
    code: '07',
    name: 'CLOISONS - DOUBLAGES',
    lines: [
      ['07-1', 'CLOISONS ET DOUBLAGES', ''],
      ['07-1 1', 'Cloisons de distribution 72/48', 'm²', 42, { defaults: { hauteur: 2.5 } }],
      ['07-1 2', 'Doublage isolant 120 + 10 mm', 'm²', 48, { defaults: { hauteur: 2.5 } }],
    ],
  },
  {
    code: '09',
    name: 'REVÊTEMENTS DE SOLS',
    lines: [
      ['09-1', 'SOLS SOUPLES', ''],
      ['09-1 1', 'Revêtement de sol PVC U2SP3', 'm²', 38],
      ['09-2', 'CARRELAGE', ''],
      ['09-2 1', 'Carrelage grès cérame 30 x 30', 'm²', 55],
      ['09-2 2', 'Plinthes carrelées', 'ml', 14],
    ],
  },
  {
    code: '10',
    name: 'PEINTURE',
    lines: [
      ['10-1', 'PEINTURES INTÉRIEURES', ''],
      ['10-1 1', 'Peinture acrylique sur murs', 'm²', 12, { defaults: { hauteur: 2.5 } }],
      ['10-1 2', 'Peinture acrylique sur plafonds', 'm²', 14],
    ],
  },
];


export function buildDemoState(planDocId: string, cctp: CctpArticle[]): EditableState {
  const lots: Lot[] = [];
  const lines: DpgfLine[] = [];
  const codeToId = new Map<string, string>();
  for (const l of DPGF) {
    const lot: Lot = { id: uid('lot'), code: l.code, name: l.name, order: lots.length };
    lots.push(lot);
    for (const [code, designation, unit, pu, extra] of l.lines) {
      const kind = unit === '' ? 'titre' : unit === 'groupe' ? 'groupe' : 'article';
      const segs = code.replace(/\.[a-z]$/, '').split(/[-\s]/).length;
      const depth = Math.max(0, segs - (l.code === '01' ? 3 : 2)) + (/\.[a-z]$/.test(code) ? 1 : 0);
      const line: DpgfLine = {
        id: uid('art'),
        lotId: lot.id,
        kind,
        code,
        designation,
        depth,
        unit: kind === 'article' ? unit : '',
        unitPrice: kind === 'article' ? (pu ?? null) : null,
        dpgfQty: extra?.qty ?? null,
        manualQty: extra?.manual ?? null,
        defaults: extra?.defaults ?? {},
        color: '',
        order: lines.length,
      };
      if (kind === 'article') line.color = colorFor(lines.filter((x) => x.kind === 'article').length);
      lines.push(line);
      codeToId.set(code, line.id);
    }
  }

  const pageIds = [uid('pg'), uid('pg'), uid('pg')];
  const scale = { method: 'cartouche' as const, metersPerPoint: 1 / K, ratio: 100, label: '1/100 (cartouche)' };
  const pages: PlanPage[] = [
    { id: pageIds[0], docId: planDocId, pageIndex: 0, name: 'Plan des fondations', level: 'Fondations', scale, order: 0 },
    { id: pageIds[1], docId: planDocId, pageIndex: 1, name: 'Plan du rez-de-chaussée', level: 'RDC', scale, order: 1 },
    { id: pageIds[2], docId: planDocId, pageIndex: 2, name: 'Plan du 1er étage', level: 'R+1', scale: null, order: 2 },
  ];
  const layers: Layer[] = [
    { id: uid('cal'), name: 'Gros-œuvre', visible: true, locked: false, color: '#1c7ed6', order: 0 },
    { id: uid('cal'), name: 'Second œuvre', visible: true, locked: false, color: '#2f9e44', order: 1 },
  ];
  const now = Date.now();
  let t = 0;
  const measures: Measure[] = [];
  const add = (
    pageIdx: number,
    code: string,
    tool: Measure['tool'],
    points: Pt[],
    opts: { holes?: Pt[][]; params?: MeasureParams; label?: string; layer?: number; tags?: SurfaceTag[]; room?: string } = {},
  ) => {
    measures.push({
      id: uid('mes'),
      pageId: pageIds[pageIdx],
      layerId: layers[opts.layer ?? 0].id,
      articleId: codeToId.get(code)!,
      tool,
      points,
      holes: opts.holes ?? [],
      params: opts.params ?? {},
      label: opts.label ?? '',
      surfaceTags: opts.tags,
      room: opts.room,
      createdAt: new Date(now + t++ * 1000).toISOString(),
    });
  };
  // Fondations
  add(0, '01-3-3-2 2.a', 'E1', rectPts([0.1, 0.1, 19.9, 10.9]), { label: 'SF façades (axe)' });
  add(0, '01-3-3-2 2.b', 'E3', [vp(8.59, 0.35), vp(8.59, 10.65)], { label: 'SF refend ouest' });
  add(0, '01-3-3-2 2.b', 'E3', [vp(11.41, 0.35), vp(11.41, 10.65)], { label: 'SF refend est' });
  add(0, '01-3-3-2 1', 'E4', MASSIFS.map(([x, y]) => vp(x, y)), { label: 'Massifs M1' });
  add(0, '01-3-2-2 1', 'E4', MASSIFS.map(([x, y]) => vp(x, y)), { label: 'Fouilles des massifs' });
  // Erreur volontaire : imperméabilisation (m²) mesurée en longueur sans hauteur
  add(0, '01-3-5-1 1', 'E1', rectPts([0, 0, 20, 11]), { label: 'Périphérie soubassements' });
  // RDC
  add(1, '01-3-5-4 4', 'E2', rectPts([0.2, 0.2, 19.8, 10.8]), { holes: [rectPts(LIFT)], label: 'Dallage RDC (trémie ascenseur déduite)' });
  add(1, '01-3-6-1 4', 'E1', rectPts([0, 0, 20, 11]), { label: 'Façades RDC' });
  add(1, '01-3-6-2 1', 'E3', [vp(8.59, 0.2), vp(8.59, 10.8)], { label: 'Refend ouest', params: { hauteur: 2.7 } });
  add(1, '01-3-6-2 1', 'E3', [vp(11.41, 0.2), vp(11.41, 10.8)], { label: 'Refend est' });
  // Erreur volontaire : rive de trémie (ml) mesurée avec l'outil Surface
  add(1, '01-3-6-5 2', 'E2', rectPts(STAIR), { label: 'Trémie escalier' });
  for (const r of ROOMS_A) {
    add(1, r.sol === 'pvc' ? '09-1 1' : '09-2 1', 'E2', rectPts(r.r), { layer: 1, label: `Log. A — ${r.name}`, room: r.name, tags: ['SH', 'SP', 'SHO'] });
  }
  add(1, '07-1 1', 'E3', [vp(5.535, 0.2), vp(5.535, 6.0)], { layer: 1, label: 'Cloison séjour / cuisine' });
  add(1, '07-1 1', 'E3', [vp(0.2, 6.035), vp(8.5, 6.035)], { layer: 1, label: 'Cloison dégagement nord' });

  return {
    project: { name: 'Démo — Résidence Les Tilleuls', address: '12 rue des Tilleuls, 14000 Caen (fictif)', phase: 'DCE' },
    settings: { ...DEFAULT_SETTINGS },
    pages,
    lots,
    lines,
    layers,
    measures,
    cctpLots: [{ code: '01', name: 'GROS-ŒUVRE' }],
    cctp,
  };
}
