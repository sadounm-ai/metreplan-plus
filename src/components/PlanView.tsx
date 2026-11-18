// Zone plan centrale : rendu du PDF (pdf.js), superposition SVG des mesures,
// zoom / panoramique, accrochage, outils E1 à E4 et calibrage d'échelle.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PDFPageProxy, RenderTask } from 'pdfjs-dist';
import { centroid, dist, distToPolyline, orthoSnap, pointInPolygon, polygonArea, polylineLength } from '../../shared/geometry';
import { computeMeasure } from '../../shared/quantities';
import { TOOL_LABELS, type Measure, type Pt } from '../../shared/types';
import { displayUnit } from '../../shared/units';
import { loadDocument, vectorSnapIndex, type SnapIndex } from '../pdf';
import { useApp } from '../store';
import { fmt } from '../format';

interface View {
  tx: number;
  ty: number;
  z: number;
}

const MAX_PIXELS = 36_000_000;

/** Position de l'étiquette de quantité : centre de la surface, milieu d'un segment pour les tracés. */
function labelAnchor(m: Measure): Pt | null {
  if (m.tool === 'E4' || !m.points.length) return null;
  if (m.tool === 'E2') return centroid(m.points);
  const segs = m.points.length - 1;
  const i = m.tool === 'E1' ? 0 : Math.floor(segs / 2);
  const a = m.points[i];
  const b = m.points[(i + 1) % m.points.length] ?? a;
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 3];
}

export function PlanView() {
  const data = useApp((s) => s.data)!;
  const currentPageId = useApp((s) => s.currentPageId);
  const tool = useApp((s) => s.tool);
  const activeArticleId = useApp((s) => s.activeArticleId);
  const selectedMeasureId = useApp((s) => s.selectedMeasureId);
  const highlightArticleId = useApp((s) => s.highlightArticleId);
  const snapOn = useApp((s) => s.snap);
  const showQuantities = useApp((s) => s.showQuantities);
  const showLegend = useApp((s) => s.showLegend);
  const holeMode = useApp((s) => s.holeMode);
  const fitRequest = useApp((s) => s.fitRequest);
  const zoomRequest = useApp((s) => s.zoomRequest);
  const { setUi, addMeasure, updateMeasure, toast, selectArticle, commit } = useApp.getState();

  const page = data.pages.find((p) => p.id === currentPageId) ?? null;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfPage, setPdfPage] = useState<PDFPageProxy | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [view, setView] = useState<View>({ tx: 0, ty: 0, z: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [renderScale, setRenderScale] = useState(1);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<Pt[]>([]);
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [snapPt, setSnapPt] = useState<Pt | null>(null);
  const [countId, setCountId] = useState<string | null>(null);
  const snapIdx = useRef<SnapIndex | null>(null);
  const pan = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const dragVertex = useRef<{ id: string; idx: number; hole: number; moved: boolean } | null>(null);
  const [dragPreview, setDragPreview] = useState<Measure | null>(null);
  const [space, setSpace] = useState(false);
  const [shift, setShift] = useState(false);

  const lineById = useMemo(() => new Map(data.lines.map((l) => [l.id, l])), [data.lines]);
  const layerById = useMemo(() => new Map(data.layers.map((l) => [l.id, l])), [data.layers]);
  const pageMeasures = useMemo(
    () => data.measures.filter((m) => m.pageId === page?.id && layerById.get(m.layerId)?.visible !== false),
    [data.measures, page?.id, layerById],
  );

  // Chargement de la page PDF
  useEffect(() => {
    let cancelled = false;
    setPdfPage(null);
    setSize(null);
    setDraft([]);
    setCountId(null);
    snapIdx.current = null;
    if (!page) return;
    setLoading(true);
    loadDocument(page.docId)
      .then((doc) => doc.getPage(page.pageIndex + 1))
      .then((p) => {
        if (cancelled) return;
        const vp = p.getViewport({ scale: 1 });
        setPdfPage(p);
        setSize({ w: vp.width, h: vp.height });
        vectorSnapIndex(`${page.docId}:${page.pageIndex}`, p).then((idx) => {
          if (!cancelled) snapIdx.current = idx;
        });
      })
      .catch((e) => toast(`Impossible d’ouvrir le plan : ${e.message}`, 'erreur'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [page?.docId, page?.pageIndex, page?.id]);

  const fit = useCallback(() => {
    const el = wrapRef.current;
    if (!el || !size) return;
    const z = Math.min(el.clientWidth / size.w, el.clientHeight / size.h) * 0.94;
    setView({ z, tx: (el.clientWidth - size.w * z) / 2, ty: (el.clientHeight - size.h * z) / 2 });
  }, [size]);

  useEffect(() => fit(), [size, fitRequest]);

  const zoomAt = useCallback((factor: number, cx?: number, cy?: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const v = viewRef.current;
    const x = cx ?? el.clientWidth / 2;
    const y = cy ?? el.clientHeight / 2;
    const z = Math.max(0.05, Math.min(40, v.z * factor));
    const k = z / v.z;
    setView({ z, tx: x - (x - v.tx) * k, ty: y - (y - v.ty) * k });
  }, []);

  useEffect(() => {
    if (zoomRequest.n) zoomAt(zoomRequest.factor);
  }, [zoomRequest.n]);

  // Rendu du canevas à une résolution adaptée au zoom (différé)
  useEffect(() => {
    if (!size) return;
    const dpr = window.devicePixelRatio || 1;
    const maxS = Math.sqrt(MAX_PIXELS / (size.w * size.h));
    const target = Math.min(maxS, Math.max(0.5, view.z * dpr));
    if (Math.abs(target - renderScale) / renderScale < 0.25 && renderScale >= Math.min(maxS, view.z * dpr) * 0.8) return;
    const t = setTimeout(() => setRenderScale(target), 180);
    return () => clearTimeout(t);
  }, [view.z, size]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!pdfPage || !canvas || !size) return;
    let task: RenderTask | null = null;
    const vp = pdfPage.getViewport({ scale: renderScale });
    const off = document.createElement('canvas');
    off.width = Math.floor(vp.width);
    off.height = Math.floor(vp.height);
    task = pdfPage.render({ canvasContext: off.getContext('2d')!, viewport: vp });
    task.promise
      .then(() => {
        canvas.width = off.width;
        canvas.height = off.height;
        canvas.getContext('2d')!.drawImage(off, 0, 0);
      })
      .catch(() => {
        /* rendu annulé */
      });
    return () => task?.cancel();
  }, [pdfPage, renderScale, size]);

  // Molette : zoom centré sur le curseur
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const toPage = (e: { clientX: number; clientY: number }): Pt => {
    const r = wrapRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return [(e.clientX - r.left - v.tx) / v.z, (e.clientY - r.top - v.ty) / v.z];
  };

  /** Applique accrochage puis contrainte orthogonale. */
  const resolvePoint = (raw: Pt, ortho: boolean, base?: Pt): { p: Pt; snapped: Pt | null } => {
    let p = raw;
    let snapped: Pt | null = null;
    const radius = 9 / viewRef.current.z;
    if (snapOn) {
      let best: Pt | null = null;
      let bd = radius;
      for (const m of pageMeasures) {
        for (const q of [...m.points, ...m.holes.flat()]) {
          const d = dist(q, raw);
          if (d < bd) {
            bd = d;
            best = q;
          }
        }
      }
      for (const q of draft) {
        const d = dist(q, raw);
        if (d < bd) {
          bd = d;
          best = q;
        }
      }
      if (!best && snapIdx.current) best = snapIdx.current.nearest(raw, radius);
      if (best) {
        p = best;
        snapped = best;
      }
    }
    if (ortho && base && !snapped) p = orthoSnap(base, p);
    return { p, snapped };
  };

  const drawing = tool === 'E1' || tool === 'E2' || tool === 'E3' || tool === 'scale';
  const activeLine = activeArticleId ? lineById.get(activeArticleId) : undefined;

  const finishDraft = useCallback(
    (pts: Pt[]) => {
      if (!page) return;
      const s = useApp.getState();
      if (s.tool === 'scale') return;
      const t = s.tool as 'E1' | 'E2' | 'E3';
      const min = t === 'E3' ? 2 : 3;
      if (pts.length < min) {
        toast(t === 'E3' ? 'Une longueur demande au moins 2 points' : 'Un contour demande au moins 3 points', 'erreur');
        return;
      }
      if (s.holeMode && s.selectedMeasureId) {
        const m = s.data!.measures.find((x) => x.id === s.selectedMeasureId);
        if (m?.tool === 'E2') {
          updateMeasure(m.id, { holes: [...m.holes, pts] });
          setUi({ holeMode: false, tool: 'select' });
          toast('Trou / trémie déduit de la surface', 'ok');
        }
        setDraft([]);
        return;
      }
      if (!s.activeArticleId) return;
      const id = addMeasure({ pageId: page.id, articleId: s.activeArticleId, tool: t, points: pts, holes: [], params: {}, label: '' });
      setDraft([]);
      if (id) setUi({ selectedMeasureId: id });
      if (!page.scale) toast('Page non calibrée : la quantité sera calculée après définition de l’échelle', 'erreur');
    },
    [page],
  );

  // Clavier propre à la zone plan
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return;
      if (e.key === 'Shift') setShift(true);
      if (e.code === 'Space') {
        setSpace(true);
        e.preventDefault();
      }
      if (e.key === 'Escape') {
        if (draft.length && (tool === 'E1' || tool === 'E2' || tool === 'E3')) setDraft([]);
        else if (countId) setCountId(null);
        else if (draft.length) setDraft([]);
        else setUi({ selectedMeasureId: null, holeMode: false });
      }
      if (e.key === 'Enter') {
        if (draft.length && tool !== 'scale') finishDraft(draft);
        if (countId) {
          setCountId(null);
          toast('Série de comptage terminée', 'ok');
        }
      }
      if (e.key === 'Backspace' && draft.length) {
        e.preventDefault();
        setDraft((d) => d.slice(0, -1));
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShift(false);
      if (e.code === 'Space') setSpace(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [draft, tool, countId, finishDraft]);

  // Changement d'outil ou d'article : on termine les tracés en cours
  useEffect(() => {
    setDraft([]);
    setCountId(null);
  }, [tool, activeArticleId, page?.id]);

  const hitTest = (p: Pt): Measure | null => {
    const tol = 6 / viewRef.current.z;
    for (let i = pageMeasures.length - 1; i >= 0; i--) {
      const m = pageMeasures[i];
      if (layerById.get(m.layerId)?.locked) continue;
      if (m.tool === 'E4') {
        if (m.points.some((q) => dist(q, p) < tol * 1.6)) return m;
      } else if (m.tool === 'E2') {
        if (pointInPolygon(p, m.points) && !m.holes.some((h) => pointInPolygon(p, h))) return m;
        if (distToPolyline(p, m.points, true) < tol) return m;
      } else if (distToPolyline(p, m.points, m.tool === 'E1') < tol) return m;
    }
    return null;
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (!page || !size) return;
    if (e.button === 1 || e.button === 2 || tool === 'pan' || space) {
      e.preventDefault();
      pan.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
      return;
    }
    if (e.button !== 0) return;
    const raw = toPage(e);
    if (tool === 'select') {
      // Poignées de la mesure sélectionnée
      const sel = data.measures.find((m) => m.id === selectedMeasureId);
      if (sel && sel.pageId === page.id && !layerById.get(sel.layerId)?.locked) {
        const tol = 7 / view.z;
        const idx = sel.points.findIndex((q) => dist(q, raw) < tol);
        if (idx >= 0) {
          dragVertex.current = { id: sel.id, idx, hole: -1, moved: false };
          return;
        }
        for (let h = 0; h < sel.holes.length; h++) {
          const hi = sel.holes[h].findIndex((q) => dist(q, raw) < tol);
          if (hi >= 0) {
            dragVertex.current = { id: sel.id, idx: hi, hole: h, moved: false };
            return;
          }
        }
      }
      const hit = hitTest(raw);
      setUi({ selectedMeasureId: hit?.id ?? null });
      if (hit) selectArticle(hit.articleId);
      return;
    }
    const base = draft[draft.length - 1];
    const { p } = resolvePoint(raw, shift, base);

    if (tool === 'scale') {
      const pts = [...draft, p];
      if (pts.length === 2) {
        setDraft([]);
        setUi({ dialog: { type: 'echelle', payload: { pageId: page.id, distPts: dist(pts[0], pts[1]) } } });
      } else setDraft(pts);
      return;
    }
    if (!holeMode && !activeArticleId) {
      toast('Sélectionnez d’abord un article dans la DPGF : chaque mesure y est rattachée', 'erreur');
      return;
    }
    if (tool === 'E4') {
      const existing = countId ? data.measures.find((m) => m.id === countId) : null;
      if (existing && existing.articleId === activeArticleId) {
        updateMeasure(existing.id, { points: [...existing.points, p] });
      } else {
        const id = addMeasure({ pageId: page.id, articleId: activeArticleId!, tool: 'E4', points: [p], holes: [], params: {}, label: '' });
        setCountId(id);
        setUi({ selectedMeasureId: id });
      }
      return;
    }
    // E1 / E2 / E3 : fermeture en cliquant sur le premier point
    if ((tool === 'E1' || tool === 'E2') && draft.length >= 3 && dist(p, draft[0]) < 9 / view.z) {
      finishDraft(draft);
      return;
    }
    if (e.detail >= 2) return; // le double-clic est traité séparément
    setDraft([...draft, p]);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (tool === 'E1' || tool === 'E2' || tool === 'E3') {
      const { p } = resolvePoint(toPage(e), shift, draft[draft.length - 1]);
      const pts = draft.length && dist(draft[draft.length - 1], p) > 0.5 ? [...draft, p] : draft;
      finishDraft(pts);
    } else if (tool === 'E4' && countId) {
      setCountId(null);
    } else if (tool === 'select') {
      const hit = hitTest(toPage(e));
      if (hit) setUi({ dialog: { type: 'article', payload: hit.articleId } });
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (pan.current) {
      const p = pan.current;
      setView((v) => ({ ...v, tx: p.tx + e.clientX - p.x, ty: p.ty + e.clientY - p.y }));
      return;
    }
    const raw = toPage(e);
    if (dragVertex.current) {
      const dv = dragVertex.current;
      const m = data.measures.find((x) => x.id === dv.id);
      if (!m) return;
      const { p } = resolvePoint(raw, false);
      dv.moved = true;
      const nm: Measure =
        dv.hole < 0
          ? { ...m, points: m.points.map((q, i) => (i === dv.idx ? p : q)) }
          : { ...m, holes: m.holes.map((h, hi) => (hi === dv.hole ? h.map((q, i) => (i === dv.idx ? p : q)) : h)) };
      setDragPreview(nm);
      return;
    }
    if (tool === 'select' || tool === 'pan') {
      setCursor(raw);
      setSnapPt(null);
      return;
    }
    const { p, snapped } = resolvePoint(raw, shift, draft[draft.length - 1]);
    setCursor(p);
    setSnapPt(snapped);
  };

  const onMouseUp = () => {
    pan.current = null;
    const dv = dragVertex.current;
    if (dv && dv.moved && dragPreview) {
      commit((d) => ({ measures: d.measures.map((m) => (m.id === dv.id ? { ...m, points: dragPreview.points, holes: dragPreview.holes } : m)) }));
    }
    dragVertex.current = null;
    setDragPreview(null);
  };

  // Rendu --------------------------------------------------------------------

  const z = view.z;
  const mpp = page?.scale?.metersPerPoint;
  const liveQty = (() => {
    if (!cursor || !draft.length || !mpp) return null;
    const pts = [...draft, cursor];
    if (tool === 'scale') return null;
    if (tool === 'E2' && pts.length >= 3) return `${fmt(polygonArea(pts) * mpp * mpp)} m²`;
    if (tool === 'E1') return `${fmt(polylineLength(pts, pts.length > 2) * mpp)} m`;
    return `${fmt(polylineLength(pts) * mpp)} m`;
  })();

  const legend = useMemo(() => {
    const byArt = new Map<string, { qty: number; n: number }>();
    for (const m of pageMeasures) {
      const l = lineById.get(m.articleId);
      if (!l) continue;
      const r = computeMeasure(m, l, page ?? undefined);
      const e = byArt.get(l.id) ?? { qty: 0, n: 0 };
      e.qty += r.status === 'ok' ? r.value : 0;
      e.n++;
      byArt.set(l.id, e);
    }
    return [...byArt.entries()].map(([id, v]) => ({ line: lineById.get(id)!, ...v })).sort((a, b) => a.line.order - b.line.order);
  }, [pageMeasures, lineById, page]);

  const cursorStyle = pan.current ? 'grabbing' : tool === 'pan' || space ? 'grab' : tool === 'select' ? 'default' : 'crosshair';

  if (!page) {
    return (
      <div className="plan-empty" style={{ background: data.settings.planBackground }}>
        <div className="plan-empty-card">
          <h2>Aucun plan</h2>
          <p>Importez un ou plusieurs plans PDF (menu Fichier → Importer des plans) pour commencer le métré.</p>
          <button className="btn primary" onClick={() => setUi({ dialog: { type: 'import-plans' } })}>
            Importer des plans PDF
          </button>
        </div>
      </div>
    );
  }

  const renderMeasure = (m0: Measure) => {
    const m = dragPreview?.id === m0.id ? dragPreview : m0;
    const l = lineById.get(m.articleId);
    const color = l?.color || layerById.get(m.layerId)?.color || '#d6336c';
    const selected = m.id === selectedMeasureId;
    const hl = highlightArticleId === m.articleId;
    const dim = highlightArticleId && !hl ? 0.28 : 1;
    const sw = selected ? 3.5 : hl ? 3 : 2;
    const r = computeMeasure(m, l, page);
    const bad = r.status !== 'ok';
    const pts = m.points.map((p) => p.join(',')).join(' ');
    const c = labelAnchor(m);
    return (
      <g key={m.id} opacity={dim} className={hl ? 'm-hl' : undefined}>
        {m.tool === 'E2' && (
          <path
            d={[m.points, ...m.holes].map((ring) => `M${ring.map((p) => p.join(',')).join('L')}Z`).join(' ')}
            fill={color}
            fillOpacity={hl || selected ? 0.38 : 0.22}
            fillRule="evenodd"
            stroke={color}
            strokeWidth={sw}
            vectorEffect="non-scaling-stroke"
            strokeDasharray={bad ? '6 4' : undefined}
          />
        )}
        {m.tool === 'E1' && (
          <polygon points={pts} fill="none" stroke={color} strokeWidth={sw + 1} vectorEffect="non-scaling-stroke" strokeDasharray={bad ? '6 4' : undefined} />
        )}
        {m.tool === 'E3' && (
          <polyline points={pts} fill="none" stroke={color} strokeWidth={sw + 1} strokeLinecap="round" vectorEffect="non-scaling-stroke" strokeDasharray={bad ? '6 4' : undefined} />
        )}
        {m.tool === 'E4' &&
          m.points.map((p, i) => (
            <g key={i} transform={`translate(${p[0]},${p[1]}) scale(${1 / z})`}>
              <circle r={selected ? 9 : 7.5} fill={color} stroke="#fff" strokeWidth={1.5} />
              <text y={3.5} textAnchor="middle" fontSize={9} fontWeight={700} fill="#fff">
                {i + 1}
              </text>
            </g>
          ))}
        {selected &&
          m.tool !== 'E4' &&
          [...m.points, ...m.holes.flat()].map((p, i) => (
            <rect key={i} x={p[0] - 4 / z} y={p[1] - 4 / z} width={8 / z} height={8 / z} fill="#fff" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          ))}
        {showQuantities && c && (
          <text x={c[0]} y={c[1]} fontSize={11 / z} textAnchor="middle" className="m-label" fill={bad ? '#c92a2a' : '#1a1d23'}>
            {bad ? '⚠ ' : ''}
            {r.status === 'ok' ? `${fmt(r.value)} ${displayUnit(l?.unit)}` : r.status === 'non-calibre' ? 'échelle ?' : 'unité ?'}
          </text>
        )}
        {showQuantities && m.tool === 'E4' && m.points[0] && (
          <text x={m.points[0][0] + 11 / z} y={m.points[0][1] - 9 / z} fontSize={10 / z} className="m-label" fill={bad ? '#c92a2a' : '#1a1d23'}>
            {m.points.length} u
          </text>
        )}
      </g>
    );
  };

  const draftColor = holeMode ? '#c92a2a' : tool === 'scale' ? '#f08c00' : activeLine?.color || '#d6336c';
  const draftPts = cursor && drawing ? [...draft, cursor] : draft;

  return (
    <div
      ref={wrapRef}
      className="plan-wrap"
      style={{ background: data.settings.planBackground, cursor: cursorStyle }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={() => {
        onMouseUp();
        setCursor(null);
      }}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => e.preventDefault()}
    >
      {size && (
        <div className="plan-stage" style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${z})`, width: size.w, height: size.h }}>
          <canvas ref={canvasRef} style={{ width: size.w, height: size.h }} className="plan-canvas" />
          <svg className="plan-svg" width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`}>
            {pageMeasures.map(renderMeasure)}
            {draftPts.length > 0 && (
              <g>
                {(tool === 'E2' || (tool === 'E1' && draftPts.length > 2)) && draftPts.length > 2 ? (
                  <polygon points={draftPts.map((p) => p.join(',')).join(' ')} fill={tool === 'E2' ? draftColor : 'none'} fillOpacity={0.15} stroke={draftColor} strokeWidth={2} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />
                ) : (
                  <polyline points={draftPts.map((p) => p.join(',')).join(' ')} fill="none" stroke={draftColor} strokeWidth={2} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />
                )}
                {draft.map((p, i) => (
                  <circle key={i} cx={p[0]} cy={p[1]} r={3.5 / z} fill="#fff" stroke={draftColor} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                ))}
              </g>
            )}
            {snapPt && <rect x={snapPt[0] - 6 / z} y={snapPt[1] - 6 / z} width={12 / z} height={12 / z} fill="none" stroke="#f08c00" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
          </svg>
        </div>
      )}
      {loading && <div className="plan-loading">Chargement du plan…</div>}
      {(drawing || tool === 'E4') && (
        <div className="plan-hint">
          {tool === 'scale'
            ? draft.length
              ? 'Cliquez la seconde extrémité de la cote connue'
              : 'Échelle : cliquez la première extrémité d’une cote connue'
            : holeMode
              ? 'Trou / trémie : tracez le contour à déduire — Entrée ou double-clic pour terminer'
              : activeLine
                ? `${tool} ${TOOL_LABELS[tool as 'E1']} → ${activeLine.code} ${activeLine.designation} (${displayUnit(activeLine.unit)})` +
                  (tool === 'E4' ? ' — un clic par objet, Entrée pour terminer la série' : ' — double-clic ou Entrée pour terminer, Retour arrière pour annuler un point, Maj pour l’orthogonal')
                : 'Sélectionnez un article dans la DPGF (panneau de droite)'}
          {liveQty && <strong> — {liveQty}</strong>}
        </div>
      )}
      {showLegend && legend.length > 0 && (
        <div className="plan-legend" onMouseDown={(e) => e.stopPropagation()}>
          <div className="plan-legend-title">Légende — {page.name}</div>
          {legend.map(({ line, qty, n }) => (
            <div
              key={line.id}
              className={`plan-legend-row${highlightArticleId === line.id ? ' on' : ''}`}
              onClick={() => selectArticle(highlightArticleId === line.id ? null : line.id)}
              title={`${n} mesure(s)`}
            >
              <span className="swatch" style={{ background: line.color }} />
              <span className="lg-code">{line.code}</span>
              <span className="lg-des">{line.designation}</span>
              <span className="lg-qty">
                {fmt(qty)} {displayUnit(line.unit)}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="plan-zoom" onMouseDown={(e) => e.stopPropagation()}>
        <button title="Zoom arrière" onClick={() => zoomAt(1 / 1.25)}>−</button>
        <span>{Math.round(z * 100)} %</span>
        <button title="Zoom avant" onClick={() => zoomAt(1.25)}>+</button>
        <button title="Ajuster à la fenêtre" onClick={fit}>⤢</button>
      </div>
      <div className="plan-coords">
        {page.scale ? `Échelle ${page.scale.label}` : 'Échelle non définie'}
        {cursor && mpp ? ` · x ${fmt(cursor[0] * mpp)} m · y ${fmt(cursor[1] * mpp)} m` : ''}
      </div>
    </div>
  );
}
