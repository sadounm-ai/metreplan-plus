// Normalisation des unités de DPGF et dimension associée.

export type Dimension = 'longueur' | 'surface' | 'volume' | 'nombre' | 'forfait' | 'autre';

const strip = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’'`.\s]/g, '')
    .replace(/^l(?=ens)/, '');

/** Renvoie l'unité canonique : m, m2, m3, u, ens, kg, t, h ou la saisie d'origine. */
export function normalizeUnit(raw: string | null | undefined): string {
  if (!raw) return '';
  const s = strip(String(raw)).replace('²', '2').replace('³', '3');
  if (['m', 'ml', 'mlin', 'metre', 'metrelineaire', 'ml2'].includes(s)) return 'm';
  if (['m2', 'mc', 'metrecarre'].includes(s)) return 'm2';
  if (['m3', 'metrecube'].includes(s)) return 'm3';
  if (['u', 'un', 'unite', 'nb', 'nbre', 'pce', 'piece', 'pc', 'p'].includes(s)) return 'u';
  if (['ens', 'ensemble', 'ft', 'forfait', 'f', 'fft', 'global', 'gl'].includes(s)) return 'ens';
  if (['kg'].includes(s)) return 'kg';
  if (['t', 'tonne', 'tonnes'].includes(s)) return 't';
  if (['h', 'heure', 'heures'].includes(s)) return 'h';
  return String(raw).trim();
}

export function unitDimension(raw: string | null | undefined): Dimension {
  switch (normalizeUnit(raw)) {
    case 'm':
      return 'longueur';
    case 'm2':
      return 'surface';
    case 'm3':
      return 'volume';
    case 'u':
      return 'nombre';
    case 'ens':
      return 'forfait';
    default:
      return 'autre';
  }
}

/** Libellé d'affichage d'une unité (ml, m², m³, u, ens…). */
export function displayUnit(raw: string | null | undefined): string {
  const n = normalizeUnit(raw);
  switch (n) {
    case 'm':
      return 'ml';
    case 'm2':
      return 'm²';
    case 'm3':
      return 'm³';
    default:
      return n;
  }
}

/** Suggère une unité à partir d'une désignation d'ouvrage (génération de DPGF depuis le CCTP). */
export function guessUnit(title: string, body = ''): string {
  const t = (title + ' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const b = body.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const explicit = b.match(/(?:unite|mode de metre|metre)\s*[:=]?\s*(?:au\s+)?(m2|m²|m3|m³|ml|unite|u|forfait|ens)\b/);
  if (explicit) return normalizeUnit(explicit[1]);
  const rules: [RegExp, string][] = [
    [/installation|etudes?|implantation|signalisation|panneau|constat|test d.etancheite|essai|forfait|echafaudage|preparation|scellements|penetrations?|terrassement par passes/, 'ens'],
    [/acroteres?/, 'm2'],
    [/deblais|remblais|evacuation|terrassement en masse|beton de fosses/, 'm3'],
    [/semelles? filante|longrine|poutre|linteau|bandes? noyees?|reseaux?|fourreaux?|caniveau|coupure de capillarite|planelle|rupteur|seuils?|rives?|poteaux?|muret|acrotere|chainage|relev/, 'm'],
    [/fouilles? en trou|massifs?|regard|separateur|siphon|avaloir|carneau|conduits?|bac a sable|edicule|escaliers?|socle|plot|nez de marche|bande podotactile|reservation/, 'u'],
    [/fouilles? en rigole/, 'm'],
    [/decapage|dallage|dalle|plancher|voiles?|murs?|isolation|film|reglage|impermeabilisation|enduit|radier|cuvelage|beton de proprete|cloison|doublage|carrelage|peinture|chape/, 'm2'],
  ];
  for (const [re, u] of rules) if (re.test(t)) return u;
  return 'u';
}
