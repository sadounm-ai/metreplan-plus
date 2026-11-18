// Propriétés de la mesure sélectionnée : article, calque, paramètres
// d'extension, classement surfacique, origine et formule de calcul.

import { computeMeasure, effectiveParams } from '../../shared/quantities';
import { TOOL_LABELS, type MeasureParams, type SurfaceTag } from '../../shared/types';
import { displayUnit, unitDimension } from '../../shared/units';
import { fmt, parseNum } from '../format';
import { useApp } from '../store';

const PARAMS: { key: keyof MeasureParams; label: string; unit: string }[] = [
  { key: 'hauteur', label: 'Hauteur', unit: 'm' },
  { key: 'epaisseur', label: 'Épaisseur', unit: 'm' },
  { key: 'parUnite', label: 'Qté / objet', unit: '' },
  { key: 'coef', label: 'Coefficient', unit: '×' },
  { key: 'chute', label: 'Chute', unit: '%' },
];

export function MeasureInspector() {
  const data = useApp((s) => s.data)!;
  const id = useApp((s) => s.selectedMeasureId);
  const { updateMeasure, deleteMeasure, setUi, selectArticle } = useApp.getState();
  const m = data.measures.find((x) => x.id === id);
  if (!m) return null;
  const line = data.lines.find((l) => l.id === m.articleId);
  const page = data.pages.find((p) => p.id === m.pageId);
  const layer = data.layers.find((l) => l.id === m.layerId);
  const r = computeMeasure(m, line, page);
  const eff = effectiveParams(m, line);
  const dim = unitDimension(line?.unit);
  const relevant = (k: keyof MeasureParams) => {
    if (k === 'coef' || k === 'chute') return true;
    if (m.tool === 'E4') return k === 'parUnite';
    if (k === 'parUnite') return false;
    if (m.tool === 'E2') return k === 'epaisseur';
    return true;
  };
  const setParam = (k: keyof MeasureParams, v: string) => {
    const n = parseNum(v);
    const params = { ...m.params };
    if (n == null) delete params[k];
    else params[k] = n;
    updateMeasure(m.id, { params });
  };
  const toggleTag = (t: SurfaceTag) => {
    const tags = new Set(m.surfaceTags ?? []);
    if (tags.has(t)) tags.delete(t);
    else tags.add(t);
    updateMeasure(m.id, { surfaceTags: [...tags] });
  };
  const articles = data.lines.filter((l) => l.kind === 'article');

  return (
    <div className="inspector">
      <div className="panel-head">
        <span>
          Mesure {m.tool} — {TOOL_LABELS[m.tool]}
        </span>
        <button className="icon" title="Fermer" onClick={() => setUi({ selectedMeasureId: null })}>
          ✕
        </button>
      </div>
      <div className="insp-body">
        <label className="field">
          <span>Article DPGF</span>
          <select
            value={m.articleId}
            onChange={(e) => {
              updateMeasure(m.id, { articleId: e.target.value });
              selectArticle(e.target.value);
            }}
          >
            {articles.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.designation.slice(0, 60)} ({displayUnit(a.unit)})
              </option>
            ))}
          </select>
        </label>
        <div className="field-row">
          <label className="field">
            <span>Libellé</span>
            <input defaultValue={m.label} key={m.id + 'l'} placeholder="ex. Façade nord" onBlur={(e) => e.target.value !== m.label && updateMeasure(m.id, { label: e.target.value })} />
          </label>
          <label className="field">
            <span>Calque</span>
            <select value={m.layerId} onChange={(e) => updateMeasure(m.id, { layerId: e.target.value })}>
              {data.layers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="params">
          {PARAMS.filter((p) => relevant(p.key)).map((p) => {
            const own = m.params[p.key];
            const def = line?.defaults?.[p.key];
            return (
              <label key={p.key} className="field small">
                <span>
                  {p.label} {p.key === 'parUnite' ? `(${displayUnit(line?.unit)}/u)` : p.unit && `(${p.unit})`}
                </span>
                <input
                  key={`${m.id}-${p.key}-${own}`}
                  defaultValue={own != null ? fmt(own, 3).replace(/,?0+$/, '') : ''}
                  placeholder={def != null ? `${fmt(def, 3).replace(/,?0+$/, '')} (article)` : p.key === 'coef' ? '1' : p.key === 'chute' ? '0' : '—'}
                  onBlur={(e) => setParam(p.key, e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                />
              </label>
            );
          })}
        </div>
        {m.tool === 'E2' && (
          <div className="field">
            <span>Classement surfacique (tableau de bord)</span>
            <div className="tags">
              {(['SHO', 'SP', 'SH'] as SurfaceTag[]).map((t) => (
                <label key={t} className="chk">
                  <input type="checkbox" checked={!!m.surfaceTags?.includes(t)} onChange={() => toggleTag(t)} /> {t}
                </label>
              ))}
              <input className="room" defaultValue={m.room ?? ''} key={m.id + 'r'} placeholder="Pièce" onBlur={(e) => updateMeasure(m.id, { room: e.target.value || undefined })} />
            </div>
          </div>
        )}
        <div className={`result ${r.status}`}>
          <div className="result-value">
            {r.status === 'ok' ? `${fmt(r.value)} ${displayUnit(line?.unit)}` : r.status === 'non-calibre' ? 'Échelle manquante' : 'Unité incohérente'}
          </div>
          <div className="result-formula">{r.status === 'ok' ? r.formula : r.message}</div>
          <div className="result-geo muted small">
            {r.longueur != null && `${m.tool === 'E2' ? 'Périmètre' : 'Longueur'} ${fmt(r.longueur)} m`}
            {r.surface != null && ` · Surface ${fmt(r.surface)} m²`}
            {r.nombre != null && `${r.nombre} objet(s)`}
            {dim === 'volume' && Number.isFinite(eff.epaisseur) && ` · ép. ${fmt(eff.epaisseur, 3)} m`}
          </div>
        </div>
        <div className="origin muted small">
          Origine : {page?.name ?? '?'} ({page?.level || 'niveau non renseigné'}) · calque {layer?.name} · {m.tool} · {m.points.length} point(s)
          {m.holes.length ? ` · ${m.holes.length} trou(s)` : ''} · {new Date(m.createdAt).toLocaleString('fr-FR')}
        </div>
        <div className="insp-actions">
          {m.tool === 'E2' && (
            <button className="btn" onClick={() => setUi({ holeMode: true, tool: 'E2' })} title="Tracer un contour à déduire (trémie, gaine, trou)">
              Déduire un trou
            </button>
          )}
          {m.holes.length > 0 && (
            <button className="btn" onClick={() => updateMeasure(m.id, { holes: m.holes.slice(0, -1) })}>
              Retirer le dernier trou
            </button>
          )}
          <button className="btn danger" onClick={() => deleteMeasure(m.id)}>
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}
