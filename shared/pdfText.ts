// Extraction des lignes de texte d'un document pdf.js (navigateur ou Node).
import { fragmentsToLines, type TextLine } from './textLines';

interface PdfLikePage {
  getTextContent(): Promise<{ items: unknown[] }>;
}
interface PdfLikeDoc {
  numPages: number;
  getPage(n: number): Promise<PdfLikePage>;
}

export async function pageLines(page: PdfLikePage, pageNo: number): Promise<TextLine[]> {
  const tc = await page.getTextContent();
  const frags = (tc.items as { str?: string; transform?: number[]; width?: number; height?: number }[])
    .filter((i) => typeof i.str === 'string' && i.transform)
    .map((i) => ({
      str: i.str as string,
      x: i.transform![4],
      y: i.transform![5],
      width: i.width ?? 0,
      height: i.height || Math.abs(i.transform![3]) || 10,
    }));
  return fragmentsToLines(frags, pageNo);
}

export async function documentLines(doc: PdfLikeDoc, onProgress?: (p: number) => void): Promise<TextLine[]> {
  const out: TextLine[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    out.push(...(await pageLines(await doc.getPage(n), n)));
    onProgress?.(n / doc.numPages);
  }
  return out;
}
