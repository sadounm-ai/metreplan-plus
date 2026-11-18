// Panneau DPGF latéral en temps réel : quantités métrées, prix, montants,
// sous-totaux par chapitre et par lot, total HT / TVA / TTC.

import { useMemo, useState } from 'react';
import { articleTotals, recommendedTool, round, type ArticleTotals } from '../../shared/quantities';
import type { DpgfLine } from '../../shared/types';
import { displayUnit } from '../../shared/units';
import { fmt, money, parseNum } from '../format';
import { useApp } from '../store';

export function useDpgfTotals() {
  const data = useApp((s) => s.data)!;
  return useMemo(() => {
    const pages = new Map(data.pages.map((p) => [p.id, p]));
    const measuresByArticle = new Map<string, typeof data.measures>();
    for (const m of data.measures) {
      const a = measuresByArticle.get(m.articleId);
      if (a) a.push(m);
      else measuresByArticle.set(m.articleId, [m]);
    }
    const totals = new Map<string, ArticleTotals>();
    for (const l of data.lines) if (l.kind === 'article') totals.set(l.id, articleTotals(l, measuresByArticle.get(l.id) ?? [], pages));
    const sub = new Map<string, number>();
    const lotTotal = new Map<string, number>();
    for (const lot of data.lots) {
      const ls = data.lines.filter((l) => l.lotId === lot.id);
      let t = 0;
      ls.forEach((l, i) => {
        if (l.kind === 'article') t += totals.get(l.id)!.amount;
        else {
          let s = 0;
          for (let j = i + 1; j < ls.length && ls[j].depth > l.depth; j++) if (ls[j].kind === 'article') s += totals.get(ls[j].id)!.amount;
          sub.set(l.id, round(s, 2));
        }
      });
      lotTotal.set(lot.id, round(t, 2));
    }
    const ht = round([...lotTotal.values()].reduce((a, b) => a + b, 0), 2);
    const tva = round((ht * data.settings.tvaRate) / 100, 2);
    return { totals, sub, lotTotal, ht, tva, ttc: round(ht + tva, 2), measuresByArticle };
  }, [data.lines, data.measures, data.pages, data.lots, data.settings.tvaRate]);
}

export function DpgfPanel() {
  const data = useApp((s) => s.data)!;
  const activeArticleId = useApp((s) => s.activeArticleId);
  const currentPageId = useApp((s) => s.currentPageId);
  const { selectArticle, setUi, updateLine, setSettings } = useApp.getState();
  const { totals, sub, lotTotal, ht, tva, ttc, measuresByArticle } = useDpgfTotals();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState('');
  const [showDpgfQty, setShowDpgfQty] = useState(true);

  const filter = q.trim().toLowerCase();
  const match = (l: DpgfLine) => !filter || l.designation.toLowerCase().includes(filter) || l.code.toLowerCase().includes(filter);

  const onRowClick = (l: DpgfLine) => {
    if (l.kind !== 'article') return;
    const same = activeArticleId === l.id;
    selectArticle(same ? null : l.id);
    if (same) return;
    const ms = measuresByArticle.get(l.id) ?? [];
    if (ms.length && !ms.some((m) => m.pageId === currentPageId)) setUi({ currentPageId: ms[0].pageId, selectedMeasureId: null });
  };

  if (!data.lines.length) {
    return (
      <div className="dpgf-empty">
        <p>Aucune DPGF dans ce projet.</p>
        <button className="btn primary" onClick={() => setUi({ dialog: { type: 'import-dpgf' } })}>
          Importer une DPGF Excel
        </button>
        <button className="btn" disabled={!data.cctp.length} onClick={() => setUi({ dialog: { type: 'generer-dpgf' } })}>
          Générer depuis le CCTP
        </button>
        {!data.cctp.length && <p className="muted small">Importez d’abord un CCTP pour générer une DPGF vierge.</p>}
      </div>
    );
  }

  return (
    <div className="dpgf">
      <div className="dpgf-tools">
        <input className="search" placeholder="Rechercher un article…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="chk" title="Afficher la quantité de la DPGF importée">
          <input type="checkbox" checked={showDpgfQty} onChange={(e) => setShowDpgfQty(e.target.checked)} /> Qté DPGF
        </label>
      </div>
      <div className="dpgf-scroll">
        <table className="dpgf-table">
          <thead>
            <tr>
              <th className="c-code">N°</th>
              <th>Désignation</th>
              <th className="c-u">U</th>
              <th className="c-num">Qté métrée</th>
              {showDpgfQty && <th className="c-num">Qté DPGF</th>}
              <th className="c-num">PU HT</th>
              <th className="c-num">Montant HT</th>
            </tr>
          </thead>
          {data.lots.map((lot) => {
            const ls = data.lines.filter((l) => l.lotId === lot.id && (match(l) || l.kind !== 'article'));
            const isCol = collapsed[lot.id];
            return (
              <tbody key={lot.id}>
                <tr className="row-lot" onClick={() => setCollapsed((c) => ({ ...c, [lot.id]: !c[lot.id] }))}>
                  <td colSpan={showDpgfQty ? 6 : 5}>
                    <span className="caret">{isCol ? '▸' : '▾'}</span> Lot {lot.code} — {lot.name}
                  </td>
                  <td className="c-num">{money(lotTotal.get(lot.id) ?? 0)}</td>
                </tr>
                {!isCol &&
                  ls.map((l) => {
                    if (l.kind !== 'article') {
                      if (filter) return null;
                      return (
                        <tr key={l.id} className={`row-${l.kind}`} onDoubleClick={() => setUi({ dialog: { type: 'article', payload: l.id } })}>
                          <td className="c-code">{l.code}</td>
                          <td colSpan={showDpgfQty ? 5 : 4} style={{ paddingLeft: 6 + l.depth * 10 }}>
                            {l.designation}
                          </td>
                          <td className="c-num sub">{sub.get(l.id) ? money(sub.get(l.id)!) : ''}</td>
                        </tr>
                      );
                    }
                    const t = totals.get(l.id)!;
                    const active = activeArticleId === l.id;
                    const ecart = l.dpgfQty && t.qty ? ((t.qty - l.dpgfQty) / l.dpgfQty) * 100 : null;
                    const ecartBad = ecart != null && Math.abs(ecart) > data.settings.ecartThreshold;
                    return (
                      <tr
                        key={l.id}
                        className={`row-article${active ? ' active' : ''}${t.count ? ' measured' : ''}`}
                        onClick={() => onRowClick(l)}
                        onDoubleClick={() => setUi({ dialog: { type: 'article', payload: l.id } })}
                        title="Clic : sélectionner l’article et surligner ses mesures — double-clic : modifier l’article"
                      >
                        <td className="c-code">
                          <span className="swatch" style={{ background: l.color }} />
                          {l.code}
                        </td>
                        <td style={{ paddingLeft: 6 + l.depth * 10 }}>
                          <div className="des">
                            <span className="des-text">{l.designation}</span>
                            {t.incoherent > 0 && (
                              <span className="badge err" title="Mesure(s) à l’unité incohérente">
                                ⚠ {t.incoherent}
                              </span>
                            )}
                            {t.count > 0 && <span className="badge">{t.count}</span>}
                            {recommendedTool(l.unit) && (
                              <button
                                className="mini"
                                title={`Métrer avec ${recommendedTool(l.unit)}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  selectArticle(l.id, { pickTool: true });
                                }}
                              >
                                {recommendedTool(l.unit)}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="c-u">{displayUnit(l.unit)}</td>
                        <td className="c-num">{t.qty || t.count ? fmt(t.qty) : ''}</td>
                        {showDpgfQty && (
                          <td className={`c-num${ecartBad ? ' ecart' : ''}`} title={ecart != null ? `Écart ${ecart > 0 ? '+' : ''}${fmt(ecart, 1)} %` : ''}>
                            {l.dpgfQty != null ? fmt(l.dpgfQty) : ''}
                          </td>
                        )}
                        <td className="c-num" onClick={(e) => e.stopPropagation()}>
                          <input
                            className="pu"
                            defaultValue={l.unitPrice != null ? fmt(l.unitPrice) : ''}
                            key={`${l.id}-${l.unitPrice}`}
                            placeholder="—"
                            onBlur={(e) => {
                              const v = parseNum(e.target.value);
                              if (v !== l.unitPrice) updateLine(l.id, { unitPrice: v });
                            }}
                            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                          />
                        </td>
                        <td className="c-num">{t.amount ? money(t.amount) : ''}</td>
                      </tr>
                    );
                  })}
              </tbody>
            );
          })}
        </table>
      </div>
      <div className="dpgf-totals">
        <div>
          <span>Total HT</span>
          <strong>{money(ht)}</strong>
        </div>
        <div>
          <span>
            TVA{' '}
            <input
              className="tva"
              defaultValue={fmt(data.settings.tvaRate, 1)}
              key={data.settings.tvaRate}
              onBlur={(e) => {
                const v = parseNum(e.target.value);
                if (v != null && v >= 0 && v < 100) setSettings({ tvaRate: v });
              }}
            />{' '}
            %
          </span>
          <strong>{money(tva)}</strong>
        </div>
        <div className="ttc">
          <span>Total TTC</span>
          <strong>{money(ttc)}</strong>
        </div>
      </div>
    </div>
  );
}
