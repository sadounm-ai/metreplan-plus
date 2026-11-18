// Jeu d'icônes SVG (trait 1,6 px, 20 × 20) dessinées pour MétréPlan+.

import type { ReactNode, SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

const Svg = ({ size = 18, children, ...rest }: P & { children: ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
    {children}
  </svg>
);

export const Icon = {
  /** Flèche de sélection */
  select: (p: P) => (
    <Svg {...p}>
      <path d="M4 3l11 6.2-4.8 1.3L8.3 15z" fill="currentColor" fillOpacity={0.15} />
      <path d="M10.2 10.5l3.6 5" />
    </Svg>
  ),
  /** Main de panoramique */
  pan: (p: P) => (
    <Svg {...p}>
      <path d="M6.5 10V5.2a1.2 1.2 0 012.4 0V9M8.9 8.6V3.8a1.2 1.2 0 012.4 0V9M11.3 8.8V5a1.2 1.2 0 012.4 0v6.5c0 3-2 5.5-5 5.5-2.2 0-3.4-1.1-4.6-3l-1.8-3a1.2 1.2 0 012-1.3L6.5 12" />
    </Svg>
  ),
  /** E1 : polyligne fermée avec sommets */
  perimetre: (p: P) => (
    <Svg {...p}>
      <path d="M3.5 7l6-4 7 3.5-1.5 9-9 1z" />
      {[
        [3.5, 7],
        [9.5, 3],
        [16.5, 6.5],
        [15, 15.5],
        [6, 16.5],
      ].map(([x, y], i) => (
        <rect key={i} x={x - 1.3} y={y - 1.3} width={2.6} height={2.6} fill="#fff" strokeWidth={1.2} />
      ))}
    </Svg>
  ),
  /** E2 : surface hachurée avec trémie */
  surface: (p: P) => (
    <Svg {...p}>
      <path d="M3 4h14v12H3z" fill="currentColor" fillOpacity={0.22} />
      <path d="M11 7h3.5v4H11z" fill="#fff" strokeDasharray="1.6 1.4" />
    </Svg>
  ),
  /** E3 : polyligne ouverte et extrémités */
  longueur: (p: P) => (
    <Svg {...p}>
      <path d="M3 15l5-6 4 3 5-7" />
      <circle cx={3} cy={15} r={1.6} fill="currentColor" />
      <circle cx={17} cy={5} r={1.6} fill="currentColor" />
    </Svg>
  ),
  /** E4 : objets comptés */
  comptage: (p: P) => (
    <Svg {...p}>
      <circle cx={6} cy={6} r={2.6} fill="currentColor" fillOpacity={0.2} />
      <circle cx={14} cy={6} r={2.6} fill="currentColor" fillOpacity={0.2} />
      <circle cx={6} cy={14} r={2.6} fill="currentColor" fillOpacity={0.2} />
      <path d="M12.5 14h3M14 12.5v3" />
    </Svg>
  ),
  /** Règle graduée (échelle) */
  echelle: (p: P) => (
    <Svg {...p}>
      <path d="M2.5 13.5l11-11 4 4-11 11z" />
      <path d="M6 10l1.6 1.6M8.2 7.8l1 1M10.4 5.6l1.6 1.6M12.6 3.4l1 1" />
    </Svg>
  ),
  /** Accrochage : réticule */
  accroche: (p: P) => (
    <Svg {...p}>
      <circle cx={10} cy={10} r={5} />
      <path d="M10 2v3.5M10 14.5V18M2 10h3.5M14.5 10H18" />
      <rect x={8.6} y={8.6} width={2.8} height={2.8} fill="currentColor" stroke="none" />
    </Svg>
  ),
  annuler: (p: P) => (
    <Svg {...p}>
      <path d="M7 5L3.5 8.5 7 12" />
      <path d="M3.5 8.5H12a4.5 4.5 0 010 9H9" />
    </Svg>
  ),
  retablir: (p: P) => (
    <Svg {...p}>
      <path d="M13 5l3.5 3.5L13 12" />
      <path d="M16.5 8.5H8a4.5 4.5 0 000 9h3" />
    </Svg>
  ),
  zoomPlus: (p: P) => (
    <Svg {...p}>
      <circle cx={8.5} cy={8.5} r={5.5} />
      <path d="M12.5 12.5L17 17M6.3 8.5h4.4M8.5 6.3v4.4" />
    </Svg>
  ),
  zoomMoins: (p: P) => (
    <Svg {...p}>
      <circle cx={8.5} cy={8.5} r={5.5} />
      <path d="M12.5 12.5L17 17M6.3 8.5h4.4" />
    </Svg>
  ),
  ajuster: (p: P) => (
    <Svg {...p}>
      <path d="M3 7.5V3h4.5M12.5 3H17v4.5M17 12.5V17h-4.5M7.5 17H3v-4.5" />
      <rect x={6.5} y={6.5} width={7} height={7} rx={1} />
    </Svg>
  ),
  /** Bouclier de contrôle (cohérence) */
  coherence: (p: P) => (
    <Svg {...p}>
      <path d="M10 2.5l6 2.3v4.6c0 3.9-2.6 6.8-6 8.1-3.4-1.3-6-4.2-6-8.1V4.8z" />
      <path d="M7.2 10l2 2 3.8-4" />
    </Svg>
  ),
  alerte: (p: P) => (
    <Svg {...p}>
      <path d="M10 3l7.5 13h-15z" />
      <path d="M10 8v3.5M10 14v.2" />
    </Svg>
  ),
  /** Plan PDF */
  plan: (p: P) => (
    <Svg {...p}>
      <path d="M5 2.5h7l3.5 3.5v11.5H5z" />
      <path d="M12 2.5V6h3.5M7.5 10h5M7.5 13h3" />
    </Svg>
  ),
  /** Tableur (DPGF) */
  tableur: (p: P) => (
    <Svg {...p}>
      <rect x={3} y={3.5} width={14} height={13} rx={1.5} />
      <path d="M3 8h14M3 12.3h14M8 3.5v13" />
    </Svg>
  ),
  /** Document texte (CCTP) */
  cctp: (p: P) => (
    <Svg {...p}>
      <path d="M5 2.5h7l3.5 3.5v11.5H5z" />
      <path d="M7.5 9h5M7.5 11.5h5M7.5 14h3.5" />
    </Svg>
  ),
  calques: (p: P) => (
    <Svg {...p}>
      <path d="M10 3l7 3.8-7 3.8-7-3.8z" />
      <path d="M3 10.3l7 3.8 7-3.8M3 13.6l7 3.8 7-3.8" />
    </Svg>
  ),
  oeil: (p: P) => (
    <Svg {...p}>
      <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z" />
      <circle cx={10} cy={10} r={2.4} />
    </Svg>
  ),
  oeilBarre: (p: P) => (
    <Svg {...p}>
      <path d="M4.5 6.5C3 8 2 10 2 10s3 5.5 8 5.5c1.4 0 2.6-.4 3.7-1M8 4.8c.6-.2 1.3-.3 2-.3 5 0 8 5.5 8 5.5s-.7 1.3-2 2.7M3 3l14 14" />
    </Svg>
  ),
  cadenas: (p: P) => (
    <Svg {...p}>
      <rect x={4.5} y={9} width={11} height={8} rx={1.5} />
      <path d="M7 9V6.5a3 3 0 016 0V9" />
    </Svg>
  ),
  cadenasOuvert: (p: P) => (
    <Svg {...p}>
      <rect x={4.5} y={9} width={11} height={8} rx={1.5} />
      <path d="M7 9V6.5a3 3 0 015.8-1" />
    </Svg>
  ),
  corbeille: (p: P) => (
    <Svg {...p}>
      <path d="M3.5 5.5h13M8 5.5V3.5h4v2M5 5.5l.8 11h8.4l.8-11M8.3 8.5v5.5M11.7 8.5v5.5" />
    </Svg>
  ),
  plus: (p: P) => (
    <Svg {...p}>
      <path d="M10 4v12M4 10h12" />
    </Svg>
  ),
  fermer: (p: P) => (
    <Svg {...p}>
      <path d="M5 5l10 10M15 5L5 15" />
    </Svg>
  ),
  trou: (p: P) => (
    <Svg {...p}>
      <path d="M3 4h14v12H3z" fill="currentColor" fillOpacity={0.18} />
      <path d="M8 8h4v4H8z" fill="#fff" />
      <path d="M6 10h1.2M12.8 10H14" />
    </Svg>
  ),
  parametres: (p: P) => (
    <Svg {...p}>
      <path d="M3 5.5h8M15 5.5h2M3 14.5h2M9 14.5h8" />
      <circle cx={13} cy={5.5} r={2} />
      <circle cx={7} cy={14.5} r={2} />
    </Svg>
  ),
  /** Replier / déplier un panneau latéral droit */
  panneauDroit: (p: P) => (
    <Svg {...p}>
      <rect x={2.5} y={3.5} width={15} height={13} rx={1.5} />
      <path d="M12.5 3.5v13" />
    </Svg>
  ),
  maison: (p: P) => (
    <Svg {...p}>
      <path d="M3 9.5L10 3.5l7 6M5 8v8.5h10V8" />
    </Svg>
  ),
  aide: (p: P) => (
    <Svg {...p}>
      <circle cx={10} cy={10} r={7.5} />
      <path d="M7.8 7.8a2.3 2.3 0 114 1.6c-.9.6-1.8 1.1-1.8 2.3M10 14.2v.2" />
    </Svg>
  ),
};

export type IconName = keyof typeof Icon;
