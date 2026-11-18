// État de l'application (Zustand) : projet ouvert, historique annuler/rétablir,
// sauvegarde automatique et état de l'interface.

import { create } from 'zustand';
import { colorFor, uid } from '../shared/ids';
import { recommendedTool } from '../shared/quantities';
import type {
  CctpArticle,
  CctpLot,
  DpgfLine,
  EditableState,
  Layer,
  Lot,
  Measure,
  PlanPage,
  ProjectSettings,
  ProjectState,
  ToolId,
} from '../shared/types';
import { api } from './api';

export type Tool = 'select' | 'pan' | 'scale' | ToolId;

type Data = Omit<ProjectState, 'documents'>;
type Snapshot = Pick<Data, 'pages' | 'lots' | 'lines' | 'layers' | 'measures' | 'cctp' | 'cctpLots' | 'settings' | 'project'>;

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'erreur' | 'ok';
}

interface UiState {
  tool: Tool;
  currentPageId: string | null;
  activeArticleId: string | null;
  activeLayerId: string | null;
  selectedMeasureId: string | null;
  highlightArticleId: string | null;
  snap: boolean;
  showQuantities: boolean;
  showLegend: boolean;
  /** Ajout d'un trou à la surface sélectionnée */
  holeMode: boolean;
  dialog: null | { type: string; payload?: unknown };
  /** Demande de recadrage du plan (incrémentée) */
  fitRequest: number;
  zoomRequest: { factor: number; n: number };
}

interface AppState extends UiState {
  data: Data | null;
  documents: ProjectState['documents'];
  past: Snapshot[];
  future: Snapshot[];
  saving: 'idle' | 'pending' | 'saving' | 'error';
  savedAt: string | null;
  toasts: Toast[];

  open(id: string): Promise<void>;
  close(): void;
  setUi(p: Partial<UiState>): void;
  toast(text: string, kind?: Toast['kind']): void;
  /** Modification avec historique (annulable) */
  commit(fn: (d: Data) => Partial<Data>, opts?: { history?: boolean }): void;
  undo(): void;
  redo(): void;

  addDocument(doc: ProjectState['documents'][number], pages: PlanPage[]): void;
  removeDocument(docId: string): Promise<void>;
  addMeasure(m: Omit<Measure, 'id' | 'createdAt' | 'layerId'> & { layerId?: string }): string | null;
  updateMeasure(id: string, patch: Partial<Measure>): void;
  deleteMeasure(id: string): void;
  updatePage(id: string, patch: Partial<PlanPage>): void;
  updateLine(id: string, patch: Partial<DpgfLine>): void;
  addLine(lotId: string, afterId: string | null, line?: Partial<DpgfLine>): string;
  deleteLine(id: string): void;
  addLot(code: string, name: string): string;
  updateLot(id: string, patch: Partial<Lot>): void;
  setSettings(patch: Partial<ProjectSettings>): void;
  setProjectInfo(patch: Partial<Data['project']>): void;
  addLayer(name: string): void;
  updateLayer(id: string, patch: Partial<Layer>): void;
  deleteLayer(id: string): void;
  replaceDpgf(lots: Lot[], lines: DpgfLine[], mode: 'remplacer' | 'ajouter'): { relinked: number; orphans: number };
  setCctp(lots: CctpLot[], articles: CctpArticle[]): void;
  generateDpgfFromCctp(): number;
  selectArticle(id: string | null, opts?: { pickTool?: boolean }): void;
}

const snapshot = (d: Data): Snapshot => ({
  pages: d.pages,
  lots: d.lots,
  lines: d.lines,
  layers: d.layers,
  measures: d.measures,
  cctp: d.cctp,
  cctpLots: d.cctpLots,
  settings: d.settings,
  project: d.project,
});

const toEditable = (d: Data): EditableState => ({
  project: { name: d.project.name, address: d.project.address, phase: d.project.phase },
  settings: d.settings,
  pages: d.pages,
  lots: d.lots,
  lines: d.lines,
  layers: d.layers,
  measures: d.measures,
  cctpLots: d.cctpLots,
  cctp: d.cctp,
});

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let toastId = 0;

const initialUi: UiState = {
  tool: 'select',
  currentPageId: null,
  activeArticleId: null,
  activeLayerId: null,
  selectedMeasureId: null,
  highlightArticleId: null,
  snap: true,
  showQuantities: true,
  showLegend: true,
  holeMode: false,
  dialog: null,
  fitRequest: 0,
  zoomRequest: { factor: 1, n: 0 },
};

export const useApp = create<AppState>((set, get) => {
  const scheduleSave = () => {
    set({ saving: 'pending' });
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const d = get().data;
      if (!d) return;
      set({ saving: 'saving' });
      try {
        const r = await api.saveState(d.project.id, toEditable(d));
        set({ saving: 'idle', savedAt: r.savedAt });
      } catch (e) {
        set({ saving: 'error' });
        get().toast(`Échec de l’enregistrement : ${(e as Error).message}`, 'erreur');
      }
    }, 700);
  };

  const commit: AppState['commit'] = (fn, opts = { history: true }) => {
    const d = get().data;
    if (!d) return;
    const patch = fn(d);
    const next = { ...d, ...patch };
    set((s) => ({
      data: next,
      past: opts.history === false ? s.past : [...s.past.slice(-99), snapshot(d)],
      future: opts.history === false ? s.future : [],
    }));
    scheduleSave();
  };

  return {
    ...initialUi,
    data: null,
    documents: [],
    past: [],
    future: [],
    saving: 'idle',
    savedAt: null,
    toasts: [],

    async open(id) {
      const s = await api.getProject(id);
      const { documents, ...data } = s;
      const firstPage = [...data.pages].sort((a, b) => a.order - b.order)[0];
      set({
        ...initialUi,
        data,
        documents,
        past: [],
        future: [],
        savedAt: s.project.updatedAt,
        currentPageId: firstPage?.id ?? null,
        activeLayerId: data.layers[0]?.id ?? null,
      });
      localStorageSafe.set('metreplan:dernier-projet', id);
    },
    close() {
      set({ ...initialUi, data: null, documents: [], past: [], future: [] });
    },
    setUi(p) {
      set(p);
    },
    toast(text, kind = 'info') {
      const id = ++toastId;
      set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }));
      setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === 'erreur' ? 7000 : 3500);
    },
    commit,
    undo() {
      const { past, data } = get();
      if (!past.length || !data) return;
      const prev = past[past.length - 1];
      set((s) => ({ data: { ...data, ...prev }, past: s.past.slice(0, -1), future: [snapshot(data), ...s.future] }));
      const sel = get().selectedMeasureId;
      if (sel && !prev.measures.some((m) => m.id === sel)) set({ selectedMeasureId: null });
      scheduleSave();
    },
    redo() {
      const { future, data } = get();
      if (!future.length || !data) return;
      const next = future[0];
      set((s) => ({ data: { ...data, ...next }, future: s.future.slice(1), past: [...s.past, snapshot(data)] }));
      scheduleSave();
    },

    addDocument(doc, pages) {
      set((s) => ({ documents: [...s.documents, doc] }));
      if (pages.length) {
        commit((d) => ({ pages: [...d.pages, ...pages] }), { history: false });
        if (!get().currentPageId) set({ currentPageId: pages[0].id });
      }
    },
    async removeDocument(docId) {
      const d = get().data;
      if (!d) return;
      await api.deleteDocument(d.project.id, docId);
      const pageIds = new Set(d.pages.filter((p) => p.docId === docId).map((p) => p.id));
      set((s) => ({ documents: s.documents.filter((x) => x.id !== docId), past: [], future: [] }));
      commit(
        (dd) => ({ pages: dd.pages.filter((p) => !pageIds.has(p.id)), measures: dd.measures.filter((m) => !pageIds.has(m.pageId)) }),
        { history: false },
      );
      if (get().currentPageId && pageIds.has(get().currentPageId!)) set({ currentPageId: get().data!.pages[0]?.id ?? null });
    },
    addMeasure(m) {
      const s = get();
      const d = s.data;
      if (!d) return null;
      const layerId = m.layerId ?? s.activeLayerId ?? d.layers[0]?.id;
      if (!layerId) return null;
      const id = uid('mes');
      commit((dd) => ({ measures: [...dd.measures, { ...m, layerId, id, createdAt: new Date().toISOString() }] }));
      return id;
    },
    updateMeasure(id, patch) {
      commit((d) => ({ measures: d.measures.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
    },
    deleteMeasure(id) {
      commit((d) => ({ measures: d.measures.filter((m) => m.id !== id) }));
      if (get().selectedMeasureId === id) set({ selectedMeasureId: null });
    },
    updatePage(id, patch) {
      commit((d) => ({ pages: d.pages.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
    },
    updateLine(id, patch) {
      commit((d) => ({ lines: d.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
    },
    addLine(lotId, afterId, line = {}) {
      const id = uid('art');
      commit((d) => {
        const lines = [...d.lines];
        const idx = afterId ? lines.findIndex((l) => l.id === afterId) : lines.map((l) => l.lotId).lastIndexOf(lotId);
        const after = lines[idx];
        const nl: DpgfLine = {
          id,
          lotId,
          kind: 'article',
          code: '',
          designation: 'Nouvel article',
          depth: after ? (after.kind === 'titre' ? after.depth + 1 : after.depth) : 0,
          unit: 'm2',
          unitPrice: null,
          dpgfQty: null,
          manualQty: null,
          defaults: {},
          color: colorFor(lines.length),
          order: 0,
          ...line,
        };
        lines.splice(idx + 1, 0, nl);
        return { lines: lines.map((l, i) => ({ ...l, order: i })) };
      });
      return id;
    },
    deleteLine(id) {
      commit((d) => ({ lines: d.lines.filter((l) => l.id !== id), measures: d.measures.filter((m) => m.articleId !== id) }));
      if (get().activeArticleId === id) set({ activeArticleId: null });
    },
    addLot(code, name) {
      const id = uid('lot');
      commit((d) => ({ lots: [...d.lots, { id, code, name, order: d.lots.length }] }));
      return id;
    },
    updateLot(id, patch) {
      commit((d) => ({ lots: d.lots.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
    },
    setSettings(patch) {
      commit((d) => ({ settings: { ...d.settings, ...patch } }));
    },
    setProjectInfo(patch) {
      commit((d) => ({ project: { ...d.project, ...patch } }));
    },
    addLayer(name) {
      const id = uid('cal');
      commit((d) => ({ layers: [...d.layers, { id, name, visible: true, locked: false, color: colorFor(d.layers.length + 3), order: d.layers.length }] }));
      set({ activeLayerId: id });
    },
    updateLayer(id, patch) {
      commit((d) => ({ layers: d.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
    },
    deleteLayer(id) {
      const d = get().data;
      if (!d || d.layers.length <= 1) return;
      const target = d.layers.find((l) => l.id !== id)!;
      commit((dd) => ({
        layers: dd.layers.filter((l) => l.id !== id),
        measures: dd.measures.map((m) => (m.layerId === id ? { ...m, layerId: target.id } : m)),
      }));
      if (get().activeLayerId === id) set({ activeLayerId: target.id });
    },
    replaceDpgf(lots, lines, mode) {
      const d = get().data!;
      let relinked = 0;
      let orphans = 0;
      if (mode === 'ajouter') {
        commit((dd) => ({ lots: [...dd.lots, ...lots].map((l, i) => ({ ...l, order: i })), lines: [...dd.lines, ...lines].map((l, i) => ({ ...l, order: i })) }));
        return { relinked, orphans };
      }
      // Remplacement : on rattache les mesures existantes par code d'article
      const oldById = new Map(d.lines.map((l) => [l.id, l]));
      const lotCode = new Map(lots.map((l) => [l.id, l.code]));
      const oldLotCode = new Map(d.lots.map((l) => [l.id, l.code]));
      const byKey = new Map(lines.filter((l) => l.kind === 'article').map((l) => [`${lotCode.get(l.lotId)}|${l.code.trim()}`, l]));
      const measures: Measure[] = [];
      for (const m of d.measures) {
        const old = oldById.get(m.articleId);
        const nl = old && byKey.get(`${oldLotCode.get(old.lotId)}|${old.code.trim()}`);
        if (nl) {
          relinked++;
          measures.push({ ...m, articleId: nl.id });
          if (!nl.defaults || !Object.keys(nl.defaults).length) nl.defaults = old.defaults;
          nl.color = old.color || nl.color;
        } else orphans++;
      }
      commit(() => ({ lots, lines, measures }));
      set({ activeArticleId: null, highlightArticleId: null, selectedMeasureId: null });
      return { relinked, orphans };
    },
    setCctp(lots, articles) {
      commit(() => ({ cctpLots: lots, cctp: articles }));
    },
    generateDpgfFromCctp() {
      const d = get().data!;
      const lotsOut: Lot[] = [];
      const lines: DpgfLine[] = [];
      const cl = d.cctpLots.length ? d.cctpLots : [{ code: d.cctp[0]?.lotCode ?? '01', name: 'Lot' }];
      for (const c of cl) {
        const lot: Lot = { id: uid('lot'), code: c.code, name: c.name, order: lotsOut.length };
        lotsOut.push(lot);
        const arts = d.cctp.filter((a) => (a.lotCode || c.code) === c.code);
        // On ne reprend que les titres qui contiennent au moins un article
        const minDepth = Math.min(...arts.filter((a) => a.kind === 'article').map((a) => a.depth), 99);
        arts.forEach((a, i) => {
          if (a.kind === 'titre') {
            let has = false;
            for (let j = i + 1; j < arts.length && arts[j].depth > a.depth; j++) if (arts[j].kind === 'article') has = true;
            if (!has) return;
          }
          lines.push({
            id: uid(a.kind === 'titre' ? 'ttl' : 'art'),
            lotId: lot.id,
            kind: a.kind === 'titre' ? 'titre' : 'article',
            code: a.code,
            designation: a.title,
            depth: Math.max(0, a.depth - Math.max(0, minDepth - 1)),
            unit: a.kind === 'article' ? a.suggestedUnit : '',
            unitPrice: null,
            dpgfQty: null,
            manualQty: null,
            defaults: {},
            color: a.kind === 'article' ? colorFor(lines.length) : '',
            cctpRef: a.id,
            order: lines.length,
          });
        });
      }
      get().replaceDpgf(lotsOut, lines, 'remplacer');
      return lines.filter((l) => l.kind === 'article').length;
    },
    selectArticle(id, opts) {
      const line = id ? get().data?.lines.find((l) => l.id === id) : null;
      const patch: Partial<UiState> = { activeArticleId: id, highlightArticleId: id };
      if (opts?.pickTool && line) {
        const t = recommendedTool(line.unit);
        if (t) patch.tool = t;
      }
      set(patch);
    },
  };
});

export const localStorageSafe = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* stockage indisponible */
    }
  },
};
