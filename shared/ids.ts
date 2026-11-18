let counter = 0;

/** Identifiant court et unique (suffisant pour un usage local / mono-utilisateur). */
export function uid(prefix = 'id'): string {
  counter = (counter + 1) % 1_000_000;
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rnd}`;
}

/** Palette de couleurs contrastées, lisibles sur un plan blanc. */
export const PALETTE = [
  '#d6336c', '#1c7ed6', '#2f9e44', '#f08c00', '#7048e8', '#0c8599', '#e8590c', '#5c940d',
  '#c2255c', '#1971c2', '#099268', '#e67700', '#6741d9', '#3b5bdb', '#c92a2a', '#087f5b',
];

export const colorFor = (i: number) => PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length];
