import type { Pt } from './types';

export const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);

export function polylineLength(pts: Pt[], closed = false): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
  if (closed && pts.length > 2) l += dist(pts[pts.length - 1], pts[0]);
  return l;
}

/** Aire signée (formule du lacet). */
export function signedArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

export const polygonArea = (pts: Pt[]) => (pts.length < 3 ? 0 : Math.abs(signedArea(pts)));

export function centroid(pts: Pt[]): Pt {
  if (pts.length === 0) return [0, 0];
  if (pts.length < 3) {
    const sx = pts.reduce((s, p) => s + p[0], 0);
    const sy = pts.reduce((s, p) => s + p[1], 0);
    return [sx / pts.length, sy / pts.length];
  }
  const a = signedArea(pts);
  if (Math.abs(a) < 1e-9) return centroid(pts.slice(0, 2));
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    const f = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  return [cx / (6 * a), cy / (6 * a)];
}

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return dist(p, [a[0] + t * dx, a[1] + t * dy]);
}

export function distToPolyline(p: Pt, pts: Pt[], closed: boolean): number {
  let d = Infinity;
  for (let i = 1; i < pts.length; i++) d = Math.min(d, distToSegment(p, pts[i - 1], pts[i]));
  if (closed && pts.length > 2) d = Math.min(d, distToSegment(p, pts[pts.length - 1], pts[0]));
  return d;
}

/** Contraint le point p à l'horizontale, la verticale ou à 45° depuis l'origine o. */
export function orthoSnap(o: Pt, p: Pt): Pt {
  const dx = p[0] - o[0];
  const dy = p[1] - o[1];
  const ang = Math.atan2(dy, dx);
  const step = Math.PI / 4;
  const a = Math.round(ang / step) * step;
  const r = Math.hypot(dx, dy);
  const q: Pt = [o[0] + Math.cos(a) * r, o[1] + Math.sin(a) * r];
  if (Math.abs(Math.cos(a)) < 1e-9) q[0] = o[0];
  if (Math.abs(Math.sin(a)) < 1e-9) q[1] = o[1];
  return q;
}
