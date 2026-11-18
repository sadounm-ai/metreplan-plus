// Modèle de données de MétréPlan+ (partagé entre le serveur et l'interface).
// Toutes les coordonnées de mesure sont exprimées en points PDF de la page
// (repère de la « viewport » pdf.js à l'échelle 1, origine en haut à gauche).

export type Phase = 'ESQ' | 'APS' | 'APD' | 'PRO' | 'DCE' | 'EXE';
export const PHASES: Phase[] = ['ESQ', 'APS', 'APD', 'PRO', 'DCE', 'EXE'];

export type Pt = [number, number];

export interface ProjectSummary {
  id: string;
  name: string;
  address: string;
  phase: Phase;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSettings {
  /** Taux de TVA en % */
  tvaRate: number;
  /** Seuil d'écart métré / DPGF importée, en % */
  ecartThreshold: number;
  /** Couleur de fond de la zone plan */
  planBackground: string;
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  tvaRate: 20,
  ecartThreshold: 10,
  planBackground: '#5b6470',
};

export type DocKind = 'plan' | 'cctp' | 'dpgf';

export interface DocumentFile {
  id: string;
  kind: DocKind;
  fileName: string;
  pageCount: number;
  uploadedAt: string;
}

export type ScaleMethod = 'cote' | 'normalisee' | 'cartouche';

export interface PageScale {
  method: ScaleMethod;
  /** Mètres réels par point PDF */
  metersPerPoint: number;
  /** Échelle 1/x lorsque connue */
  ratio?: number;
  label: string;
}

export interface PlanPage {
  id: string;
  docId: string;
  /** Index de page dans le PDF (0..n-1) */
  pageIndex: number;
  name: string;
  level: string;
  scale: PageScale | null;
  order: number;
}

export interface Lot {
  id: string;
  code: string;
  name: string;
  order: number;
}

/** titre = intitulé de chapitre ; article = ligne quantifiable (avec unité) ;
 *  groupe = article « parent » sans unité qui porte des sous-lignes. */
export type DpgfLineKind = 'titre' | 'groupe' | 'article';

export interface MeasureParams {
  /** Hauteur en m (extension surface / volume pour E1, E3) */
  hauteur?: number;
  /** Épaisseur en m (extension volume) */
  epaisseur?: number;
  /** Coefficient multiplicateur */
  coef?: number;
  /** Pourcentage de chute / perte */
  chute?: number;
  /** E4 : quantité unitaire par objet (m, m² ou m³ selon l'unité de l'article) */
  parUnite?: number;
}

export interface DpgfLine {
  id: string;
  lotId: string;
  kind: DpgfLineKind;
  /** Code tel qu'affiché (ex. « 01-3-2-1 1 » ou « 01-3-3-2 2.a ») */
  code: string;
  designation: string;
  /** Profondeur dans l'arborescence (0 = premier niveau du lot) */
  depth: number;
  unit: string;
  unitPrice: number | null;
  /** Quantité présente dans la DPGF importée (pour le contrôle des écarts) */
  dpgfQty: number | null;
  /** Paramètres par défaut appliqués aux nouvelles mesures */
  defaults: MeasureParams;
  color: string;
  /** Référence de l'article CCTP correspondant, si rapproché */
  cctpRef?: string;
  /** Quantité saisie manuellement (forfaits « ens », ajustements) */
  manualQty?: number | null;
  order: number;
}

export type ToolId = 'E1' | 'E2' | 'E3' | 'E4';

export const TOOL_LABELS: Record<ToolId, string> = {
  E1: 'Périmètre',
  E2: 'Surface',
  E3: 'Longueur',
  E4: 'Comptage',
};

export type SurfaceTag = 'SHO' | 'SP' | 'SH';

export interface Measure {
  id: string;
  pageId: string;
  layerId: string;
  articleId: string;
  tool: ToolId;
  /** Sommets (E1/E2/E3) ou positions des objets (E4) */
  points: Pt[];
  /** Trous / trémies à déduire (E2 uniquement) */
  holes: Pt[][];
  params: MeasureParams;
  label: string;
  /** Classement surfacique pour les tableaux de bord (E2) */
  surfaceTags?: SurfaceTag[];
  room?: string;
  createdAt: string;
}

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  color: string;
  order: number;
}

export interface CctpArticle {
  id: string;
  lotCode: string;
  code: string;
  title: string;
  kind: 'titre' | 'article';
  depth: number;
  body: string;
  localisation: string;
  /** Unité suggérée à partir du texte (pour la génération de DPGF) */
  suggestedUnit: string;
  page: number;
  order: number;
}

export interface CctpLot {
  code: string;
  name: string;
}

export interface ProjectState {
  project: ProjectSummary;
  settings: ProjectSettings;
  documents: DocumentFile[];
  pages: PlanPage[];
  lots: Lot[];
  lines: DpgfLine[];
  layers: Layer[];
  measures: Measure[];
  cctpLots: CctpLot[];
  cctp: CctpArticle[];
}

/** Partie modifiable de l'état, envoyée au serveur à chaque sauvegarde. */
export type EditableState = Omit<ProjectState, 'project' | 'documents'> & {
  project: Pick<ProjectSummary, 'name' | 'address' | 'phase'>;
};
