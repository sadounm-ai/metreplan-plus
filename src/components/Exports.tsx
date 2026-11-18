// Exports Excel (DPGF chiffrée, détail des mesures, tableau de bord) et PDF
// (rapport par lot, ratios, plans annotés avec légende).

import { useState } from 'react';
import { api } from '../api';
import { useApp } from '../store';
import { Modal } from './Dialogs';

const close = () => useApp.getState().setUi({ dialog: null });

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60) || 'projet';

function download(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function ExportDialog({ kind }: { kind: 'xlsx' | 'pdf' }) {
  const data = useApp((s) => s.data)!;
  const { toast } = useApp.getState();
  const withMeasures = new Set(data.measures.map((m) => m.pageId));
  const [rapport, setRapport] = useState(true);
  const [ratios, setRatios] = useState(true);
  const [plans, setPlans] = useState<Set<string>>(() => new Set(data.pages.filter((p) => withMeasures.has(p.id)).map((p) => p.id)));
  const [busy, setBusy] = useState(false);
  const base = slug(data.project.name);

  const run = async () => {
    setBusy(true);
    try {
      if (kind === 'xlsx') {
        const { exportXlsx } = await import('../../shared/exportXlsx');
        const buf = await exportXlsx(data);
        download(buf, `${base}_DPGF_metre.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      } else {
        const { exportPdf } = await import('../../shared/exportPdf');
        const bytes = await exportPdf(data, {
          rapport,
          ratios,
          plans: data.pages.filter((p) => plans.has(p.id)).map((p) => p.id),
          loadDocument: async (docId) => {
            const r = await fetch(api.documentUrl(docId));
            if (!r.ok) throw new Error(`Plan introuvable (${r.status})`);
            return r.arrayBuffer();
          },
        });
        download(bytes, `${base}_rapport_metre.pdf`, 'application/pdf');
      }
      toast('Export terminé : le fichier est dans vos téléchargements.', 'ok');
      close();
    } catch (e) {
      toast(`Échec de l’export : ${(e as Error).message}`, 'erreur');
    } finally {
      setBusy(false);
    }
  };

  const nothing = kind === 'pdf' && !rapport && !ratios && !plans.size;
  return (
    <Modal
      title={kind === 'xlsx' ? 'Export Excel' : 'Export PDF'}
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>
            Annuler
          </button>
          <button className="btn primary" disabled={busy || nothing} onClick={run}>
            {busy ? 'Export en cours…' : 'Exporter'}
          </button>
        </>
      }
    >
      {kind === 'xlsx' ? (
        <>
          <p>Le classeur contient quatre onglets :</p>
          <ul className="report">
            <li>
              <strong>DPGF chiffrée</strong> : lots, chapitres et articles avec quantité métrée, quantité DPGF d’origine, PU, montant (formules), totaux HT, TVA et TTC ;
            </li>
            <li>
              <strong>Détail des mesures</strong> : origine de chaque quantité (plan, niveau, calque, outil, paramètres, calcul) ;
            </li>
            <li>
              <strong>Tableau de bord</strong> : avancement par lot, SHO / SP / SH, coûts au m², quantités clés par m² SP ;
            </li>
            <li>
              <strong>Cohérence</strong> : résultats du contrôle plans / CCTP / DPGF.
            </li>
          </ul>
        </>
      ) : (
        <>
          <label className="chk">
            <input type="checkbox" checked={rapport} onChange={(e) => setRapport(e.target.checked)} /> Rapport de quantités par lot (avec récapitulatif HT / TVA / TTC)
          </label>
          <label className="chk">
            <input type="checkbox" checked={ratios} onChange={(e) => setRatios(e.target.checked)} /> Tableau de bord et ratios
          </label>
          <fieldset>
            <legend>Plans annotés avec légende</legend>
            {data.pages.length === 0 && <p className="muted small">Aucun plan dans le projet.</p>}
            {data.pages.map((p) => (
              <label className="chk" key={p.id}>
                <input
                  type="checkbox"
                  checked={plans.has(p.id)}
                  onChange={(e) => {
                    const n = new Set(plans);
                    if (e.target.checked) n.add(p.id);
                    else n.delete(p.id);
                    setPlans(n);
                  }}
                />{' '}
                {p.name}
                {p.level ? ` (${p.level})` : ''} <span className="muted small">— {data.measures.filter((m) => m.pageId === p.id).length} mesure(s)</span>
              </label>
            ))}
            <p className="muted small">Les mesures sont dessinées sur la page d’origine, dans le mode de couleur choisi (Paramètres du projet), avec une légende à droite.</p>
          </fieldset>
        </>
      )}
    </Modal>
  );
}
