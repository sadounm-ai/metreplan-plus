// Espace de travail : menu principal, barre d'outils, panneaux et zone plan.

import { useEffect, useRef, useState } from 'react';
import { recommendedTool } from '../../shared/quantities';
import { COLOR_MODE_LABELS, TOOL_LABELS, type ColorMode, type ToolId } from '../../shared/types';
import { displayUnit } from '../../shared/units';
import { detectScaleRatio, loadDocument, metersPerPointForRatio, pageText } from '../pdf';
import { useApp, type Tool } from '../store';
import { Dialogs, useIssues } from './Dialogs';
import { DpgfPanel } from './DpgfPanel';
import { MeasureInspector } from './MeasureInspector';
import { PlanView } from './PlanView';
import { LayersPanel, PagesPanel } from './SidePanels';
import { Icon, type IconName } from './Icons';
import { localStorageSafe } from '../store';

interface MenuItem {
  label: string;
  icon?: IconName;
  action?: () => void;
  shortcut?: string;
  disabled?: boolean;
  checked?: boolean;
  sep?: boolean;
}

function Menu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button className={`menu-btn${open ? ' on' : ''}`} onClick={() => setOpen(!open)}>
        {label}
      </button>
      {open && (
        <div className="menu-drop">
          {items.map((it, i) =>
            it.sep ? (
              <div key={i} className="menu-sep" />
            ) : (
              <button
                key={i}
                className="menu-item"
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false);
                  it.action?.();
                }}
              >
                <span className="menu-check">{it.checked ? '✓' : ''}</span>
                <span className="menu-ico">{it.icon ? Icon[it.icon]({ size: 16 }) : null}</span>
                <span className="menu-label">{it.label}</span>
                {it.shortcut && <span className="menu-kbd">{it.shortcut}</span>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

const TOOL_ICONS: Record<ToolId, IconName> = { E1: 'perimetre', E2: 'surface', E3: 'longueur', E4: 'comptage' };

const RIGHT_MIN = 320;
const RIGHT_MAX = 760;

export function Workspace({ onHome }: { onHome: () => void }) {
  const data = useApp((s) => s.data)!;
  const s = useApp();
  const issues = useIssues();
  const page = data.pages.find((p) => p.id === s.currentPageId);
  const activeLine = data.lines.find((l) => l.id === s.activeArticleId);
  const errors = issues.filter((i) => i.severity === 'erreur').length;

  const setTool = (t: Tool) => {
    if ((t === 'E1' || t === 'E2' || t === 'E3' || t === 'E4') && !s.activeArticleId) {
      s.toast('Sélectionnez d’abord l’article de DPGF à métrer (panneau de droite)', 'erreur');
    }
    s.setUi({ tool: t, holeMode: false });
  };

  const detectScale = async () => {
    if (!page) return;
    const doc = await loadDocument(page.docId);
    const ratio = detectScaleRatio(await pageText(await doc.getPage(page.pageIndex + 1)));
    if (!ratio) return s.toast('Aucune mention « Échelle 1/xx » trouvée dans le texte de cette page', 'erreur');
    s.updatePage(page.id, { scale: { method: 'cartouche', metersPerPoint: metersPerPointForRatio(ratio), ratio, label: `1/${ratio} (cartouche)` } });
    s.toast(`Échelle 1/${ratio} détectée dans le cartouche`, 'ok');
  };

  // Raccourcis clavier globaux
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select') || useApp.getState().dialog) return;
      const st = useApp.getState();
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) {
        e.preventDefault();
        st.undo();
      } else if ((e.ctrlKey || e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) {
        e.preventDefault();
        st.redo();
      } else if (e.ctrlKey || e.metaKey || e.altKey) return;
      else if (k === 'v') setTool('select');
      else if (k === 'h') setTool('pan');
      else if (k === 'k') setTool('scale');
      else if (['1', '2', '3', '4'].includes(k)) setTool(`E${k}` as ToolId);
      else if (k === 's') st.setUi({ snap: !st.snap });
      else if ((e.key === 'Delete' || (e.key === 'Backspace' && st.tool === 'select')) && st.selectedMeasureId) st.deleteMeasure(st.selectedMeasureId);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [s.activeArticleId]);

  const dlg = (type: string, payload?: unknown) => () => s.setUi({ dialog: { type, payload } });

  // Largeur du panneau DPGF : réglable à la souris, mémorisée, repliable
  const [rightW, setRightW] = useState(() => Number(localStorageSafe.get('metreplan:largeur-dpgf')) || 420);
  const [rightOpen, setRightOpenState] = useState(() => localStorageSafe.get('metreplan:dpgf-replie') !== '1');
  const setRightOpen = (v: boolean) => {
    setRightOpenState(v);
    localStorageSafe.set('metreplan:dpgf-replie', v ? '0' : '1');
  };
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = rightW;
    let w = w0;
    const move = (ev: MouseEvent) => {
      w = Math.max(RIGHT_MIN, Math.min(RIGHT_MAX, w0 + x0 - ev.clientX));
      setRightW(w);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      document.body.classList.remove('resizing');
      localStorageSafe.set('metreplan:largeur-dpgf', String(Math.round(w)));
    };
    document.body.classList.add('resizing');
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const firstLot = data.lots[0];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand" onClick={onHome} title="Retour à la liste des projets">
          <span className="logo">M+</span>
          <span>
            MétréPlan<b>+</b>
          </span>
        </div>
        <nav className="menubar">
          <Menu
            label="Fichier"
            items={[
              { label: 'Projets…', icon: 'maison', action: onHome },
              { sep: true, label: '' },
              { label: 'Importer des plans PDF…', icon: 'plan', action: dlg('import-plans') },
              { label: 'Importer un CCTP (PDF)…', icon: 'cctp', action: dlg('import-cctp') },
              { label: 'Importer une DPGF (Excel)…', icon: 'tableur', action: dlg('import-dpgf') },
              { sep: true, label: '' },
              { label: 'Paramètres du projet…', icon: 'parametres', action: dlg('parametres') },
            ]}
          />
          <Menu
            label="Édition"
            items={[
              { label: 'Annuler', icon: 'annuler', shortcut: 'Ctrl+Z', action: s.undo, disabled: !s.past.length },
              { label: 'Rétablir', icon: 'retablir', shortcut: 'Ctrl+Y', action: s.redo, disabled: !s.future.length },
              { sep: true, label: '' },
              { label: 'Supprimer la mesure', icon: 'corbeille', shortcut: 'Suppr', disabled: !s.selectedMeasureId, action: () => s.selectedMeasureId && s.deleteMeasure(s.selectedMeasureId) },
            ]}
          />
          <Menu
            label="Affichage"
            items={[
              { label: 'Zoom avant', icon: 'zoomPlus', action: () => s.setUi({ zoomRequest: { factor: 1.25, n: s.zoomRequest.n + 1 } }) },
              { label: 'Zoom arrière', icon: 'zoomMoins', action: () => s.setUi({ zoomRequest: { factor: 0.8, n: s.zoomRequest.n + 1 } }) },
              { label: 'Ajuster à la fenêtre', icon: 'ajuster', action: () => s.setUi({ fitRequest: s.fitRequest + 1 }) },
              { sep: true, label: '' },
              { label: 'Quantités sur le plan', checked: s.showQuantities, action: () => s.setUi({ showQuantities: !s.showQuantities }) },
              { label: 'Légende automatique', checked: s.showLegend, action: () => s.setUi({ showLegend: !s.showLegend }) },
              { sep: true, label: '' },
              ...(Object.keys(COLOR_MODE_LABELS) as ColorMode[]).map((k) => ({ label: `Couleur ${COLOR_MODE_LABELS[k]}`, checked: (data.settings.colorMode ?? 'article') === k, action: () => s.setSettings({ colorMode: k }) })),
              { sep: true, label: '' },
              { label: 'Couleur de fond…', action: dlg('parametres') },
            ]}
          />
          <Menu
            label="Métré"
            items={[
              { label: 'Sélection', icon: 'select', shortcut: 'V', checked: s.tool === 'select', action: () => setTool('select') },
              { label: 'Panoramique', icon: 'pan', shortcut: 'H', checked: s.tool === 'pan', action: () => setTool('pan') },
              { sep: true, label: '' },
              ...(['E1', 'E2', 'E3', 'E4'] as ToolId[]).map((t, i) => ({ label: `${t} ${TOOL_LABELS[t]}`, icon: TOOL_ICONS[t], shortcut: String(i + 1), checked: s.tool === t, action: () => setTool(t) })),
              { sep: true, label: '' },
              { label: 'Échelle par cote connue', icon: 'echelle', shortcut: 'K', disabled: !page, action: () => setTool('scale') },
              { label: 'Échelle normalisée…', disabled: !page, action: dlg('echelle', { pageId: page?.id }) },
              { label: 'Détecter l’échelle (cartouche)', disabled: !page, action: detectScale },
              { sep: true, label: '' },
              { label: 'Accrochage aux extrémités', icon: 'accroche', shortcut: 'S', checked: s.snap, action: () => s.setUi({ snap: !s.snap }) },
            ]}
          />
          <Menu
            label="DPGF"
            items={[
              { label: 'Importer une DPGF (Excel)…', icon: 'tableur', action: dlg('import-dpgf') },
              { label: 'Générer une DPGF depuis le CCTP…', disabled: !data.cctp.length, action: dlg('generer-dpgf') },
              { sep: true, label: '' },
              {
                label: 'Ajouter un article',
                icon: 'plus',
                action: () => {
                  const lotId = (activeLine?.lotId ?? firstLot?.id) || s.addLot('01', 'Nouveau lot');
                  const id = s.addLine(lotId, s.activeArticleId);
                  s.setUi({ dialog: { type: 'article', payload: id } });
                },
              },
              { label: 'Ajouter un lot', action: () => s.addLot(String(data.lots.length + 1).padStart(2, '0'), 'Nouveau lot') },
              { label: 'Modifier l’article actif…', disabled: !activeLine, action: dlg('article', s.activeArticleId) },
            ]}
          />
          <Menu
            label="Analyse"
            items={[
              { label: `Cohérence plans / CCTP / DPGF (${issues.length})`, icon: 'coherence', action: dlg('coherence') },
              { label: 'Tableau de bord et ratios', icon: 'tableau', action: dlg('tableau-de-bord') },
            ]}
          />
          <Menu
            label="Exports"
            items={[
              { label: 'Excel : DPGF chiffrée, détail des mesures, tableau de bord…', icon: 'tableur', action: dlg('export', 'xlsx') },
              { label: 'PDF : rapport par lot, ratios, plans annotés…', icon: 'pdf', action: dlg('export', 'pdf') },
            ]}
          />
          <Menu label="Aide" items={[{ label: 'Raccourcis et principes', icon: 'aide', action: dlg('aide') }]} />
        </nav>
        <div className="project-title" title={data.project.address}>
          <strong>{data.project.name}</strong> <span className="tag">{data.project.phase}</span>
        </div>
        <div className={`save-state ${s.saving}`}>
          {s.saving === 'idle' ? 'Enregistré' : s.saving === 'error' ? 'Erreur d’enregistrement' : 'Enregistrement…'}
        </div>
      </header>

      <div className="toolbar">
        <div className="tb-group">
          <button className={`tb${s.tool === 'select' ? ' on' : ''}`} onClick={() => setTool('select')} title="Sélection (V)">
            <Icon.select /> <span>Sélection</span>
          </button>
          <button className={`tb${s.tool === 'pan' ? ' on' : ''}`} onClick={() => setTool('pan')} title="Panoramique (H, ou Espace maintenu)">
            <Icon.pan /> <span>Panoramique</span>
          </button>
        </div>
        <div className="tb-group">
          {(['E1', 'E2', 'E3', 'E4'] as ToolId[]).map((t, i) => (
            <button
              key={t}
              className={`tb tool${s.tool === t ? ' on' : ''}${activeLine && recommendedTool(activeLine.unit) === t ? ' reco' : ''}`}
              onClick={() => setTool(t)}
              title={`${t} ${TOOL_LABELS[t]} (${i + 1})${activeLine && recommendedTool(activeLine.unit) === t ? ' — outil conseillé pour l’article actif' : ''}`}
            >
              {Icon[TOOL_ICONS[t]]({})}
              <b>{t}</b> <span>{TOOL_LABELS[t]}</span>
            </button>
          ))}
        </div>
        <div className="tb-group">
          <button className={`tb${s.tool === 'scale' ? ' on' : ''}`} onClick={() => setTool('scale')} disabled={!page} title="Échelle par cote connue (K)">
            <Icon.echelle /> <span>Échelle</span>
          </button>
          <button className={`tb${s.snap ? ' on' : ''}`} onClick={() => s.setUi({ snap: !s.snap })} title="Accrochage aux extrémités (S)">
            <Icon.accroche /> <span>Accroche</span>
          </button>
        </div>
        <div className="tb-group">
          <button className="tb" onClick={s.undo} disabled={!s.past.length} title="Annuler (Ctrl+Z)">
            <Icon.annuler />
          </button>
          <button className="tb" onClick={s.redo} disabled={!s.future.length} title="Rétablir (Ctrl+Y)">
            <Icon.retablir />
          </button>
        </div>
        <div className="tb-active">
          {activeLine ? (
            <>
              <span className="swatch" style={{ background: activeLine.color }} />
              Article actif : <b>{activeLine.code}</b> {activeLine.designation} <span className="tag">{displayUnit(activeLine.unit)}</span>
              <button className="link" onClick={() => s.selectArticle(null)}>
                désélectionner
              </button>
            </>
          ) : (
            <span className="muted">Aucun article actif — cliquez une ligne de la DPGF</span>
          )}
        </div>
        <button className="tb" onClick={dlg('tableau-de-bord')} title="Tableau de bord et ratios">
          <Icon.tableau /> <span>Tableau de bord</span>
        </button>
        <button className={`tb coh${errors ? ' bad' : ''}`} onClick={dlg('coherence')} title="Analyse de cohérence">
          {errors ? <Icon.alerte /> : <Icon.coherence />} <span>{errors ? `${errors} erreur(s)` : 'Cohérence'} · {issues.length}</span>
        </button>
        <button className={`tb${rightOpen ? ' on' : ''}`} onClick={() => setRightOpen(!rightOpen)} title={rightOpen ? 'Replier le panneau DPGF' : 'Afficher le panneau DPGF'}>
          <Icon.panneauDroit />
        </button>
      </div>

      <main className="main" style={{ gridTemplateColumns: `var(--left-w) 1fr ${rightOpen ? `${rightW}px` : '0px'}` }}>
        <aside className="left">
          <PagesPanel />
          <LayersPanel />
        </aside>
        <section className="center">
          <PlanView />
        </section>
        <aside className={`right${rightOpen ? '' : ' closed'}`}>
          {rightOpen && <div className="resizer" onMouseDown={startResize} title="Glisser pour élargir ou réduire le panneau DPGF" />}
          <div className="panel-head">
            <span className="head-ico">
              <Icon.tableur size={15} /> DPGF — {data.lots.length} lot(s)
            </span>
            <span className="row">
              <button className="mini" onClick={dlg('import-dpgf')} title="Importer une DPGF Excel">
                Importer
              </button>
              <button className="icon" onClick={() => setRightOpen(false)} title="Replier le panneau DPGF">
                <Icon.fermer size={14} />
              </button>
            </span>
          </div>
          <DpgfPanel />
          <MeasureInspector />
        </aside>
      </main>
      <Dialogs />
      <Toasts />
    </div>
  );
}

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
