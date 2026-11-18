// Chargement des PDF (pdf.js), extraction de texte, détection d'échelle et
// extraction des extrémités de tracés vectoriels pour l'accrochage.
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { Pt } from '../shared/types';
import { api } from './api';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const docs = new Map<string, Promise<PDFDocumentProxy>>();

export function loadDocument(docId: string): Promise<PDFDocumentProxy> {
  if (!docs.has(docId)) docs.set(docId, pdfjs.getDocument({ url: api.documentUrl(docId) }).promise);
  return docs.get(docId)!;
}

export function openLocalPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  return pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) }).promise;
}

export function registerLocalDocument(docId: string, data: ArrayBuffer) {
  docs.set(docId, openLocalPdf(data));
}

export async function pageText(page: PDFPageProxy): Promise<string> {
  const tc = await page.getTextContent();
  return (tc.items as { str?: string }[]).map((i) => i.str ?? '').join(' ');
}

/** Cherche « échelle 1/xx » (ou « ech. 1:xx ») dans le texte de la page. */
export function detectScaleRatio(text: string): number | null {
  const t = text.replace(/\s+/g, ' ');
  const re = /(?:[ée]chelle|ech\.?|scale)\s*[:=]?\s*1\s*[/:]\s*(\d{1,4})\b/i;
  const m = t.match(re);
  if (m) return parseInt(m[1], 10);
  return null;
}

/** Mètres réels par point PDF pour une échelle 1/ratio. */
export const metersPerPointForRatio = (ratio: number) => (0.0254 / 72) * ratio;

// --- Accrochage : extrémités des segments vectoriels -----------------------

export class SnapIndex {
  private cells = new Map<string, Pt[]>();
  constructor(
    pts: Pt[],
    private cell = 12,
  ) {
    for (const p of pts) {
      const k = this.key(p[0], p[1]);
      const arr = this.cells.get(k);
      if (arr) arr.push(p);
      else this.cells.set(k, [p]);
    }
  }
  private key(x: number, y: number) {
    return `${Math.floor(x / this.cell)}:${Math.floor(y / this.cell)}`;
  }
  nearest(p: Pt, radius: number): Pt | null {
    let best: Pt | null = null;
    let bd = radius;
    const r = Math.ceil(radius / this.cell);
    const cx = Math.floor(p[0] / this.cell);
    const cy = Math.floor(p[1] / this.cell);
    for (let i = -r; i <= r; i++)
      for (let j = -r; j <= r; j++) {
        const arr = this.cells.get(`${cx + i}:${cy + j}`);
        if (!arr) continue;
        for (const q of arr) {
          const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
          if (d < bd) {
            bd = d;
            best = q;
          }
        }
      }
    return best;
  }
}

type M = [number, number, number, number, number, number];
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

const snapCache = new Map<string, Promise<SnapIndex>>();

export function vectorSnapIndex(key: string, page: PDFPageProxy): Promise<SnapIndex> {
  if (!snapCache.has(key)) snapCache.set(key, buildSnap(page));
  return snapCache.get(key)!;
}

async function buildSnap(page: PDFPageProxy): Promise<SnapIndex> {
  const vp = page.getViewport({ scale: 1 });
  const OPS = pdfjs.OPS;
  const ol = await page.getOperatorList();
  const out: Pt[] = [];
  const seen = new Set<string>();
  let ctm: M = [1, 0, 0, 1, 0, 0];
  const stack: M[] = [];
  const push = (x: number, y: number) => {
    if (out.length > 150000) return;
    const ux = ctm[0] * x + ctm[2] * y + ctm[4];
    const uy = ctm[1] * x + ctm[3] * y + ctm[5];
    const [vx, vy] = vp.convertToViewportPoint(ux, uy) as [number, number];
    const k = `${Math.round(vx * 2)}:${Math.round(vy * 2)}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push([vx, vy]);
  };
  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i];
    const args = ol.argsArray[i] as unknown[];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = mul(ctm, args as unknown as M);
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm);
      const m = args[0] as M | null;
      if (m) ctm = mul(ctm, m);
    } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.constructPath) {
      const ops = args[0] as number[];
      const c = args[1] as number[];
      let j = 0;
      for (const op of ops) {
        switch (op) {
          case OPS.moveTo:
          case OPS.lineTo:
            push(c[j], c[j + 1]);
            j += 2;
            break;
          case OPS.curveTo:
            push(c[j + 4], c[j + 5]);
            j += 6;
            break;
          case OPS.curveTo2:
          case OPS.curveTo3:
            push(c[j + 2], c[j + 3]);
            j += 4;
            break;
          case OPS.rectangle: {
            const [x, y, w, h] = [c[j], c[j + 1], c[j + 2], c[j + 3]];
            push(x, y);
            push(x + w, y);
            push(x + w, y + h);
            push(x, y + h);
            j += 4;
            break;
          }
          default:
            break;
        }
      }
    }
  }
  return new SnapIndex(out);
}
