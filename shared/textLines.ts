// Reconstitution des lignes de texte à partir des fragments renvoyés par pdf.js.

export interface TextFragment {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextLine {
  text: string;
  page: number;
  x: number;
  y: number;
}

/** Regroupe les fragments d'une page en lignes (de haut en bas, de gauche à droite). */
export function fragmentsToLines(frags: TextFragment[], page: number): TextLine[] {
  const items = frags.filter((f) => f.str.length > 0).sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: TextFragment[][] = [];
  for (const it of items) {
    const tol = Math.max(2, (it.height || 10) * 0.45);
    const row = rows.find((r) => Math.abs(r[0].y - it.y) <= tol);
    if (row) row.push(it);
    else rows.push([it]);
  }
  rows.sort((a, b) => b[0].y - a[0].y);
  return rows
    .map((r) => {
      r.sort((a, b) => a.x - b.x);
      let text = '';
      let end = -Infinity;
      for (const it of r) {
        const gap = it.x - end;
        const space = (it.height || 10) * 0.2;
        if (text && gap > space && !text.endsWith(' ') && !it.str.startsWith(' ')) text += gap > space * 12 ? '    ' : ' ';
        text += it.str;
        end = it.x + it.width;
      }
      return { text: text.replace(/\s+$/, ''), page, x: r[0].x, y: r[0].y };
    })
    .filter((l) => l.text.trim().length > 0);
}
