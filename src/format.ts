export const fmt = (n: number, d = 2) =>
  Number.isFinite(n) ? n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';

export const money = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }) : '—';

/** Lecture d'un nombre saisi à la française (virgule ou point). */
export const parseNum = (s: string): number | null => {
  const t = s.replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
