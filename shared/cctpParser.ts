// Découpage d'un CCTP (texte extrait du PDF) en lot, chapitres et articles.

import type { TextLine } from './textLines';
import type { CctpArticle, CctpLot } from './types';
import { guessUnit } from './units';

export interface CctpParseResult {
  lots: CctpLot[];
  articles: CctpArticle[];
}

const HEADING = /^\s*((?:\d{1,3}[-.])+\d{1,3}(?:\s+\d{1,3}){0,3})\.?\s+(?:[-–:]\s*)?(\S.*)$/;
const TOC_LEADER = /(\.{4,}|…{2,}|(\.\s){4,})\s*\d*\s*$/;
const LOT_RE = /\b(?:lot|chapitre)\s*n?\s*[°ºo]?\s*(\d{1,3})\s*[-–:]?\s*(.*)$/i;

export const normalizeCode = (code: string) =>
  code
    .trim()
    .replace(/[\s.]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .split('-')
    .map((s) => (/^\d+$/.test(s) ? String(parseInt(s, 10)) : s))
    .join('-');

const isUpper = (s: string) => {
  const letters = s.replace(/[^A-Za-zÀ-ÖØ-öø-ÿŒœ]/g, '');
  return letters.length > 0 && letters === letters.toUpperCase();
};

const startsLikeTitle = (s: string) => /^[A-ZÀ-ÖØ-ÞŒ«"“(]/.test(s);

/** Lignes répétées en tête / pied de page (normalisées sur les chiffres). */
function repeatedLines(lines: TextLine[]): Set<string> {
  const byPage = new Map<number, TextLine[]>();
  for (const l of lines) {
    if (!byPage.has(l.page)) byPage.set(l.page, []);
    byPage.get(l.page)!.push(l);
  }
  const pages = byPage.size;
  const seen = new Map<string, Set<number>>();
  // Seules les lignes en haut ou en bas de page peuvent être des en-têtes / pieds de page
  const edges = [...byPage.values()].flatMap((ls) => [...ls.slice(0, 3), ...ls.slice(-4)]);
  for (const l of edges) {
    const k = l.text.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
    if (!seen.has(k)) seen.set(k, new Set());
    seen.get(k)!.add(l.page);
  }
  const out = new Set<string>();
  if (pages < 3) return out;
  for (const [k, ps] of seen) if (ps.size >= Math.max(3, pages * 0.4)) out.add(k);
  return out;
}

export function parseCctp(lines: TextLine[]): CctpParseResult {
  const rep = repeatedLines(lines);
  const byPage = new Map<number, TextLine[]>();
  lines.forEach((l) => (byPage.get(l.page) ?? byPage.set(l.page, []).get(l.page)!).push(l));
  const edgeSet = new Set([...byPage.values()].flatMap((ls) => [...ls.slice(0, 3), ...ls.slice(-4)]));
  const clean = lines.filter((l) => {
    const k = l.text.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
    if (edgeSet.has(l) && rep.has(k)) return false;
    if (/^page\s*[\d.\s/]+$/i.test(l.text.trim())) return false;
    return true;
  });

  // Lot
  const lots: CctpLot[] = [];
  for (let i = 0; i < Math.min(clean.length, 400); i++) {
    const m = clean[i].text.match(LOT_RE);
    if (m) {
      let name = m[2].trim().replace(/[-–\s]+$/, '');
      const next = clean[i + 1]?.text.trim() ?? '';
      if (clean[i].text.trim().endsWith('-') && next && isUpper(next) && !HEADING.test(next)) name = `${name} - ${next}`;
      if (!name && next && isUpper(next)) name = next;
      lots.push({ code: m[1].padStart(2, '0'), name: name.replace(/\s+/g, ' ') });
      break;
    }
  }

  // Titres numérotés candidats (hors sommaire)
  type Cand = { idx: number; code: string; title: string };
  const cands: Cand[] = [];
  clean.forEach((l, idx) => {
    if (TOC_LEADER.test(l.text)) return;
    // Entrée de sommaire dont les points de conduite sont renvoyés à la ligne suivante
    if (/^\s*[.…]{4,}/.test(clean[idx + 1]?.text ?? '')) return;
    const m = l.text.match(HEADING);
    if (!m) return;
    const title = m[2].trim();
    if (!startsLikeTitle(title) || title.length < 2) return;
    cands.push({ idx, code: m[1].replace(/\s+/g, ' ').trim(), title });
  });
  const firstSeg = (c: string) => normalizeCode(c).split('-')[0];
  const freq = new Map<string, number>();
  cands.forEach((c) => freq.set(firstSeg(c.code), (freq.get(firstSeg(c.code)) ?? 0) + 1));
  const [dominant, domCount] = [...freq.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
  const heads = domCount >= cands.length * 0.6 ? cands.filter((c) => firstSeg(c.code) === dominant) : cands;

  if (!lots.length && dominant) lots.push({ code: dominant.padStart(2, '0'), name: `Lot ${dominant}` });
  const lotCode = lots[0]?.code ?? '';

  const articles: CctpArticle[] = [];
  heads.forEach((h, k) => {
    const end = k + 1 < heads.length ? heads[k + 1].idx : clean.length;
    let title = h.title;
    let bodyStart = h.idx + 1;
    // Titre en capitales sur plusieurs lignes
    while (bodyStart < end && isUpper(title) && isUpper(clean[bodyStart].text) && clean[bodyStart].text.trim().length < 80 && !/^localisation/i.test(clean[bodyStart].text.trim())) {
      title += ' ' + clean[bodyStart].text.trim();
      bodyStart++;
    }
    const bodyLines = clean.slice(bodyStart, end).map((l) => l.text.trim());
    const locIdx = bodyLines.findIndex((t) => /^localisations?\s*:?/i.test(t));
    const localisation =
      locIdx >= 0
        ? [bodyLines[locIdx].replace(/^localisations?\s*:?\s*/i, ''), ...bodyLines.slice(locIdx + 1)].join(' ').replace(/\s+/g, ' ').trim()
        : '';
    const body = bodyLines.join('\n');
    const segs = normalizeCode(h.code).split('-');
    const next = heads[k + 1] ? normalizeCode(heads[k + 1].code) : '';
    const hasChildren = next.startsWith(segs.join('-') + '-');
    const kind: CctpArticle['kind'] = hasChildren ? 'titre' : !isUpper(title) || locIdx >= 0 ? 'article' : 'titre';
    articles.push({
      id: `cctp-${k}`,
      lotCode,
      code: h.code,
      title: title.replace(/\s+/g, ' ').trim(),
      kind,
      depth: Math.max(0, segs.length - 2),
      body,
      localisation,
      suggestedUnit: kind === 'article' ? guessUnit(title, body) : '',
      page: clean[h.idx].page,
      order: k,
    });
  });
  return { lots, articles };
}

/** Similarité de désignations (0..1), sur les mots significatifs. */
export function designationSimilarity(a: string, b: string): number {
  const words = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .split(' ')
        .filter((w) => w.length > 2 && !['les', 'des', 'pour', 'avec', 'sur', 'dans', 'une', 'entre'].includes(w))
        .map((w) => w.replace(/s$/, '')),
    );
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return 0;
  const flat = (x: Set<string>) => [...x].join('');
  if (flat(A) === flat(B)) return 1;
  let inter = 0;
  A.forEach((w) => B.has(w) && inter++);
  return inter / Math.min(A.size, B.size);
}
