// Panneau de gauche : plans (vignettes, nom, niveau, échelle) et calques.

import { useEffect, useRef, useState } from 'react';
import { loadDocument } from '../pdf';
import { useApp } from '../store';
import { Icon } from './Icons';

function Thumb({ docId, pageIndex }: { docId: string; pageIndex: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    loadDocument(docId)
      .then((d) => d.getPage(pageIndex + 1))
      .then(async (p) => {
        if (cancelled || !ref.current) return;
        const vp0 = p.getViewport({ scale: 1 });
        const vp = p.getViewport({ scale: 150 / vp0.width });
        const c = ref.current;
        c.width = vp.width;
        c.height = vp.height;
        await p.render({ canvasContext: c.getContext('2d')!, viewport: vp }).promise;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [docId, pageIndex]);
  return <canvas ref={ref} className="thumb" />;
}

export function PagesPanel() {
  const data = useApp((s) => s.data)!;
  const documents = useApp((s) => s.documents);
  const currentPageId = useApp((s) => s.currentPageId);
  const { setUi, updatePage } = useApp.getState();
  const [editing, setEditing] = useState<string | null>(null);
  const pages = [...data.pages].sort((a, b) => a.order - b.order);
  const counts = new Map<string, number>();
  data.measures.forEach((m) => counts.set(m.pageId, (counts.get(m.pageId) ?? 0) + 1));

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="head-ico">
          <Icon.plan size={15} /> Plans ({pages.length})
        </span>
        <button className="mini" title="Importer des plans PDF" onClick={() => setUi({ dialog: { type: 'import-plans' } })}>
          <Icon.plus size={12} /> PDF
        </button>
      </div>
      <div className="pages">
        {pages.map((p) => {
          const doc = documents.find((d) => d.id === p.docId);
          return (
            <div
              key={p.id}
              className={`page-item${p.id === currentPageId ? ' on' : ''}`}
              onClick={() => setUi({ currentPageId: p.id, selectedMeasureId: null })}
              title={doc ? `${doc.fileName} — page ${p.pageIndex + 1}` : ''}
            >
              <Thumb docId={p.docId} pageIndex={p.pageIndex} />
              <div className="page-meta">
                {editing === p.id ? (
                  <div className="page-edit" onClick={(e) => e.stopPropagation()}>
                    <input autoFocus defaultValue={p.name} onBlur={(e) => updatePage(p.id, { name: e.target.value || p.name })} placeholder="Nom du plan" />
                    <input
                      defaultValue={p.level}
                      onBlur={(e) => updatePage(p.id, { level: e.target.value })}
                      onKeyDown={(e) => e.key === 'Enter' && setEditing(null)}
                      placeholder="Niveau (RDC, R+1…)"
                    />
                    <button className="mini" onClick={() => setEditing(null)}>
                      OK
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="page-name" onDoubleClick={() => setEditing(p.id)}>
                      {p.name}
                    </div>
                    <div className="page-sub">
                      {p.level && <span className="tag">{p.level}</span>}
                      <span className={`tag ${p.scale ? 'ok' : 'warn'}`}>{p.scale ? p.scale.label : 'sans échelle'}</span>
                      {counts.get(p.id) ? <span className="tag">{counts.get(p.id)} mes.</span> : null}
                      <button className="link" onClick={(e) => (e.stopPropagation(), setEditing(p.id))}>
                        renommer
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LayersPanel() {
  const data = useApp((s) => s.data)!;
  const activeLayerId = useApp((s) => s.activeLayerId);
  const { setUi, addLayer, updateLayer, deleteLayer } = useApp.getState();
  const [editing, setEditing] = useState<string | null>(null);
  const counts = new Map<string, number>();
  data.measures.forEach((m) => counts.set(m.layerId, (counts.get(m.layerId) ?? 0) + 1));
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="head-ico">
          <Icon.calques size={15} /> Calques
        </span>
        <button className="mini" onClick={() => addLayer(`Calque ${data.layers.length + 1}`)}>
          <Icon.plus size={12} /> Calque
        </button>
      </div>
      <div className="layers">
        {data.layers.map((l) => (
          <div key={l.id} className={`layer${l.id === activeLayerId ? ' on' : ''}`} onClick={() => setUi({ activeLayerId: l.id })} title="Calque actif pour les nouvelles mesures">
            <button className="icon" title={l.visible ? 'Masquer' : 'Afficher'} onClick={(e) => (e.stopPropagation(), updateLayer(l.id, { visible: !l.visible }))}>
              {l.visible ? <Icon.oeil size={15} /> : <Icon.oeilBarre size={15} />}
            </button>
            <button className="icon" title={l.locked ? 'Déverrouiller' : 'Verrouiller'} onClick={(e) => (e.stopPropagation(), updateLayer(l.id, { locked: !l.locked }))}>
              {l.locked ? <Icon.cadenas size={15} /> : <Icon.cadenasOuvert size={15} />}
            </button>
            <input type="color" value={l.color} onClick={(e) => e.stopPropagation()} onChange={(e) => updateLayer(l.id, { color: e.target.value })} title="Couleur du calque" />
            {editing === l.id ? (
              <input
                autoFocus
                className="layer-name-input"
                defaultValue={l.name}
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => (updateLayer(l.id, { name: e.target.value || l.name }), setEditing(null))}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            ) : (
              <span className="layer-name" onDoubleClick={() => setEditing(l.id)}>
                {l.name}
              </span>
            )}
            <span className="muted small">{counts.get(l.id) ?? 0}</span>
            {data.layers.length > 1 && (
              <button
                className="icon"
                title="Supprimer le calque (ses mesures passent sur un autre calque)"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteLayer(l.id);
                }}
              >
                <Icon.corbeille size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
