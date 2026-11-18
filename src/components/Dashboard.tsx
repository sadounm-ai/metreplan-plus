// Tableau de bord : montants, avancement du métré par lot, surfaces SHO / SP /
// SH, coûts au m² et quantités clés rapportées à la surface de plancher.

import { useMemo, useState } from 'react';
import { buildDashboard } from '../../shared/dashboard';
import { fmt, money } from '../format';
import { useApp } from '../store';
import { Modal } from './Dialogs';

const close = () => useApp.getState().setUi({ dialog: null });

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="kpi" title={hint}>
      <span className="kpi-label">{label}</span>
      <strong className="kpi-value">{value}</strong>
    </div>
  );
}

export function DashboardDialog() {
  const data = useApp((s) => s.data)!;
  const { setUi } = useApp.getState();
  const db = useMemo(() => buildDashboard(data), [data.lots, data.lines, data.measures, data.pages, data.settings.tvaRate]);
  const [tab, setTab] = useState<'synthese' | 'surfaces' | 'ratios'>('synthese');
  const m2 = (v: number) => (v ? `${fmt(v)} m²` : '—');
  const noSurf = !db.surfaces.SP && !db.surfaces.SH && !db.surfaces.SHO;

  return (
    <Modal
      title="Tableau de bord et ratios"
      onClose={close}
      wide
      footer={
        <>
          <button className="btn" onClick={() => setUi({ dialog: { type: 'export', payload: 'xlsx' } })}>
            Exporter en Excel…
          </button>
          <button className="btn" onClick={() => setUi({ dialog: { type: 'export', payload: 'pdf' } })}>
            Exporter en PDF…
          </button>
          <span className="grow" />
          <button className="btn primary" onClick={close}>
            Fermer
          </button>
        </>
      }
    >
      <div className="kpis">
        <Kpi label="Montant HT" value={money(db.ht)} />
        <Kpi label="Montant TTC" value={money(db.ttc)} hint={`TVA ${fmt(data.settings.tvaRate, 1)} % : ${money(db.tva)}`} />
        <Kpi label="Articles métrés" value={`${db.measuredArticles} / ${db.articles}`} hint={`${fmt(db.pct, 0)} % des articles ont une quantité`} />
        <Kpi label="Coût HT / m² SP" value={db.coutM2Sp != null ? money(db.coutM2Sp) : '—'} />
        <Kpi label="Surface de plancher (SP)" value={m2(db.surfaces.SP)} />
        <Kpi label="Surface hors œuvre (SHO)" value={m2(db.surfaces.SHO)} />
        <Kpi label="Surface habitable (SH)" value={m2(db.surfaces.SH)} />
        <Kpi label="Ratio SH / SP" value={db.ratioShSp != null ? fmt(db.ratioShSp) : '—'} hint={db.coutM2Sh != null ? `Coût HT / m² SH : ${money(db.coutM2Sh)}` : undefined} />
      </div>

      <div className="tabs" role="tablist">
        {(
          [
            ['synthese', 'Avancement par lot'],
            ['surfaces', 'Surfaces'],
            ['ratios', 'Quantités clés / m² SP'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`tab${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'synthese' && (
        <table className="simple dash">
          <thead>
            <tr>
              <th>Lot</th>
              <th style={{ width: '38%' }}>Avancement du métré</th>
              <th className="r">Articles</th>
              <th className="r">Montant HT</th>
            </tr>
          </thead>
          <tbody>
            {db.lots.map((lp) => (
              <tr key={lp.lot.id}>
                <td>
                  Lot {lp.lot.code} — {lp.lot.name}
                </td>
                <td>
                  <div className="bar" title={`${fmt(lp.pct, 0)} %`}>
                    <div className="bar-fill" style={{ width: `${Math.min(100, lp.pct)}%` }} />
                  </div>
                  <span className="bar-pct">{fmt(lp.pct, 0)} %</span>
                </td>
                <td className="r">
                  {lp.measured} / {lp.articles}
                </td>
                <td className="r">{money(lp.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th>Total</th>
              <th>
                <span className="bar-pct">{fmt(db.pct, 0)} %</span>
              </th>
              <th className="r">
                {db.measuredArticles} / {db.articles}
              </th>
              <th className="r">{money(db.ht)}</th>
            </tr>
          </tfoot>
        </table>
      )}

      {tab === 'surfaces' &&
        (noSurf ? (
          <p className="muted">
            Aucune surface classée. Sélectionnez une mesure de surface (E2) et cochez SHO, SP ou SH dans l’inspecteur, avec le nom de la pièce, pour alimenter ces tableaux.
          </p>
        ) : (
          <>
            <h4>Par niveau</h4>
            <table className="simple dash">
              <thead>
                <tr>
                  <th>Niveau</th>
                  <th className="r">SHO (m²)</th>
                  <th className="r">SP (m²)</th>
                  <th className="r">SH (m²)</th>
                </tr>
              </thead>
              <tbody>
                {db.surfacesByLevel.map((l) => (
                  <tr key={l.level}>
                    <td>{l.level}</td>
                    <td className="r">{fmt(l.SHO)}</td>
                    <td className="r">{fmt(l.SP)}</td>
                    <td className="r">{fmt(l.SH)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th>Total</th>
                  <th className="r">{fmt(db.surfaces.SHO)}</th>
                  <th className="r">{fmt(db.surfaces.SP)}</th>
                  <th className="r">{fmt(db.surfaces.SH)}</th>
                </tr>
              </tfoot>
            </table>
            <h4>Par pièce</h4>
            <table className="simple dash">
              <thead>
                <tr>
                  <th>Pièce</th>
                  <th>Niveau</th>
                  <th>Classement</th>
                  <th className="r">Surface (m²)</th>
                </tr>
              </thead>
              <tbody>
                {db.rooms.map((r, i) => (
                  <tr key={i}>
                    <td>{r.room}</td>
                    <td>{r.level}</td>
                    <td>{r.tags.join(', ')}</td>
                    <td className="r">{fmt(r.surface)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ))}

      {tab === 'ratios' && (
        <>
          {!db.surfaces.SP && <p className="muted small">Classez au moins une surface en SP pour calculer les ratios au m² de surface de plancher.</p>}
          <table className="simple dash">
            <thead>
              <tr>
                <th>Article</th>
                <th className="r">Quantité</th>
                <th>U</th>
                <th className="r">Qté / m² SP</th>
                <th className="r">Montant HT</th>
                <th className="r">€ HT / m² SP</th>
              </tr>
            </thead>
            <tbody>
              {db.keyRatios.map((k) => (
                <tr key={k.line.id}>
                  <td>
                    <span className="swatch" style={{ background: k.line.color }} />
                    {k.line.code} {k.line.designation}
                  </td>
                  <td className="r">{fmt(k.qty)}</td>
                  <td>{k.unit}</td>
                  <td className="r">{k.perSp != null ? fmt(k.perSp, 3) : '—'}</td>
                  <td className="r">{money(k.amount)}</td>
                  <td className="r">{db.surfaces.SP ? money(k.amount / db.surfaces.SP) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Modal>
  );
}
