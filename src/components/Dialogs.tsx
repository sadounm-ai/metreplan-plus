// Boîtes de dialogue : imports (plans, CCTP, DPGF), échelle, article,
// paramètres du projet et analyse de cohérence.

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { analyseCoherence, ISSUE_LABELS, type Issue, type IssueKind } from '../../shared/coherence';
import { normalizeCode, parseCctp, type CctpParseResult } from '../../shared/cctpParser';
import type { DpgfParseResult } from '../../shared/dpgfParser';
import { uid } from '../../shared/ids';
import { documentLines } from '../../shared/pdfText';
import { PHASES, type DpgfLine, type MeasureParams, type Phase, type PlanPage } from '../../shared/types';
import { displayUnit, normalizeUnit } from '../../shared/units';
import { api } from '../api';
import { fmt, parseNum } from '../format';
import { detectScaleRatio, metersPerPointForRatio, openLocalPdf, pageText, registerLocalDocument } from '../pdf';
import { useApp } from '../store';

export function Modal({ title, children, onClose, wide, footer }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean; footer?: ReactNode }) {
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

const close = () => useApp.getState().setUi({ dialog: null });

export function Dialogs() {
  const dialog = useApp((s) => s.dialog);
  if (!dialog) return null;
  switch (dialog.type) {
    case 'import-plans':
      return <ImportPlansDialog />;
    case 'import-dpgf':
      return <ImportDpgfDialog />;
    case 'import-cctp':
      return <ImportCctpDialog />;
    case 'generer-dpgf':
      return <GenerateDialog />;
    case 'echelle':
      return <ScaleDialog payload={dialog.payload as { pageId: string; distPts?: number }} />;
    case 'article':
      return <ArticleDialog id={dialog.payload as string} />;
    case 'parametres':
      return <SettingsDialog />;
    case 'coherence':
      return <CoherenceDialog />;
    case 'aide':
      return <HelpDialog />;
    default:
      return null;
  }
}

// --- Plans -------------------------------------------------------------------

const LEVEL_RE = /\b(fondations?|sous[- ]sol|rdc|rez[- ]de[- ]chauss[ée]e|r\s?\+\s?\d+|r\s?-\s?\d+|combles?|toiture|terrasse)\b/i;

function guessLevel(text: string): string {
  const m = text.match(LEVEL_RE);
  if (!m) return '';
  const v = m[1].toLowerCase().replace(/\s/g, '');
  if (v.startsWith('rez') || v === 'rdc') return 'RDC';
  if (v.startsWith('fondation')) return 'Fondations';
  if (v.startsWith('sous')) return 'Sous-sol';
  return m[1].toUpperCase().replace(/\s/g, '');
}

function guessName(text: string): string | null {
  const m = text.replace(/\s+/g, ' ').match(/\b(PLAN|COUPE|FA[CÇ]ADE|[ÉE]L[ÉE]VATION)S?\s+(DU|DE LA|DE L'|DES|DE|D')?\s?([A-ZÀ-Ü0-9'’ +\-]{3,40})/);
  if (!m) return null;
  const s = `${m[1]} ${m[2] ?? ''} ${m[3]}`.replace(/\s+/g, ' ').trim();
  return s.charAt(0) + s.slice(1).toLowerCase();
}

function ImportPlansDialog() {
  const data = useApp((s) => s.data)!;
  const { addDocument, toast, setUi } = useApp.getState();
  const [busy, setBusy] = useState<string | null>(null);
  const [report, setReport] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);

  const run = async (files: FileList) => {
    const lines: string[] = [];
    for (const file of Array.from(files)) {
      try {
        setBusy(`Lecture de ${file.name}…`);
        const buf = await file.arrayBuffer();
        const pdf = await openLocalPdf(buf);
        setBusy(`Envoi de ${file.name}…`);
        const doc = await api.uploadDocument(data.project.id, file, 'plan', pdf.numPages);
        registerLocalDocument(doc.id, buf);
        const pages: PlanPage[] = [];
        const base = file.name.replace(/\.pdf$/i, '');
        let detected = 0;
        for (let i = 0; i < pdf.numPages; i++) {
          setBusy(`Analyse de ${file.name} — page ${i + 1}/${pdf.numPages}…`);
          const p = await pdf.getPage(i + 1);
          const text = await pageText(p);
          const ratio = detectScaleRatio(text);
          if (ratio) detected++;
          pages.push({
            id: uid('pg'),
            docId: doc.id,
            pageIndex: i,
            name: guessName(text) ?? (pdf.numPages > 1 ? `${base} — p. ${i + 1}` : base),
            level: guessLevel(text),
            scale: ratio ? { method: 'cartouche', metersPerPoint: metersPerPointForRatio(ratio), ratio, label: `1/${ratio} (cartouche)` } : null,
            order: data.pages.length + pages.length,
          });
        }
        addDocument(doc, pages);
        setUi({ currentPageId: pages[0]?.id ?? null });
        lines.push(`${file.name} : ${pdf.numPages} page(s), échelle détectée dans le cartouche sur ${detected} page(s).`);
      } catch (e) {
        lines.push(`${file.name} : échec — ${(e as Error).message}`);
        toast(`Import impossible : ${(e as Error).message}`, 'erreur');
      }
    }
    setBusy(null);
    setReport(lines);
  };

  return (
    <Modal title="Importer des plans PDF" onClose={close} footer={<button className="btn" onClick={close}>Fermer</button>}>
      <p>Chaque page du PDF devient un plan nommé, avec son niveau. Le texte « Échelle 1/xx » du cartouche est détecté automatiquement.</p>
      <input ref={input} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => e.target.files?.length && run(e.target.files)} />
      <button className="btn primary" disabled={!!busy} onClick={() => input.current?.click()}>
        Choisir des fichiers PDF…
      </button>
      {busy && <p className="muted">{busy}</p>}
      {report.length > 0 && (
        <ul className="report">
          {report.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

// --- DPGF --------------------------------------------------------------------

function ImportDpgfDialog() {
  const data = useApp((s) => s.data)!;
  const { replaceDpgf, setSettings, toast } = useApp.getState();
  const [res, setRes] = useState<(DpgfParseResult & { file: File }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'remplacer' | 'ajouter'>('remplacer');
  const input = useRef<HTMLInputElement>(null);

  const read = async (file: File) => {
    setBusy(true);
    try {
      const { parseDpgfXlsx } = await import('../../shared/dpgfXlsx');
      const r = await parseDpgfXlsx(await file.arrayBuffer());
      if (!r.lines.length) throw new Error('aucune ligne de prix reconnue (en-têtes U / Qté / PU introuvables)');
      setRes({ ...r, file });
    } catch (e) {
      toast(`Lecture de la DPGF impossible : ${(e as Error).message}`, 'erreur');
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!res) return;
    const out = replaceDpgf(res.lots, res.lines, mode);
    if (res.tvaRate != null) setSettings({ tvaRate: res.tvaRate });
    try {
      await api.uploadDocument(data.project.id, res.file, 'dpgf', 0);
    } catch {
      /* la DPGF reste importée même si l'archivage du fichier échoue */
    }
    toast(
      `DPGF importée : ${res.lines.filter((l) => l.kind === 'article').length} articles` + (data.measures.length ? ` — ${out.relinked} mesure(s) rattachée(s), ${out.orphans} sans correspondance supprimée(s)` : ''),
      'ok',
    );
    close();
  };

  return (
    <Modal
      title="Importer une DPGF Excel (.xlsx)"
      onClose={close}
      wide={!!res}
      footer={
        <>
          <button className="btn" onClick={close}>
            Annuler
          </button>
          <button className="btn primary" disabled={!res} onClick={apply}>
            Importer
          </button>
        </>
      }
    >
      <p>Lots, articles, unités, quantités et prix unitaires sont lus feuille par feuille (colonnes N° / Désignation / U / Qté / PU détectées automatiquement).</p>
      <input ref={input} type="file" accept=".xlsx" hidden onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
      <button className="btn primary" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? 'Lecture…' : 'Choisir le fichier .xlsx…'}
      </button>
      {res && (
        <>
          <table className="simple">
            <thead>
              <tr>
                <th>Lot</th>
                <th className="c-num">Articles</th>
                <th className="c-num">Avec quantité</th>
                <th className="c-num">Avec PU</th>
              </tr>
            </thead>
            <tbody>
              {res.lots.map((l) => {
                const ls = res.lines.filter((x) => x.lotId === l.id && x.kind === 'article');
                return (
                  <tr key={l.id}>
                    <td>
                      {l.code} — {l.name}
                    </td>
                    <td className="c-num">{ls.length}</td>
                    <td className="c-num">{ls.filter((x) => x.dpgfQty != null).length}</td>
                    <td className="c-num">{ls.filter((x) => x.unitPrice != null).length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {res.tvaRate != null && <p className="muted small">Taux de TVA lu dans le classeur : {fmt(res.tvaRate, 1)} %</p>}
          {res.warnings.length > 0 && (
            <details>
              <summary>{res.warnings.length} remarque(s) de lecture</summary>
              <ul className="report">
                {res.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          )}
          {data.lines.length > 0 && (
            <div className="radio-group">
              <label>
                <input type="radio" checked={mode === 'remplacer'} onChange={() => setMode('remplacer')} /> Remplacer la DPGF actuelle (les mesures sont rattachées par numéro d’article)
              </label>
              <label>
                <input type="radio" checked={mode === 'ajouter'} onChange={() => setMode('ajouter')} /> Ajouter ces lots à la DPGF actuelle
              </label>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

// --- CCTP --------------------------------------------------------------------

function ImportCctpDialog() {
  const data = useApp((s) => s.data)!;
  const { setCctp, toast, setUi, addDocument } = useApp.getState();
  const [res, setRes] = useState<(CctpParseResult & { file: File; pages: number }) | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const read = async (file: File) => {
    try {
      setBusy('Extraction du texte…');
      const pdf = await openLocalPdf(await file.arrayBuffer());
      const lines = await documentLines(pdf, (p) => setBusy(`Extraction du texte… ${Math.round(p * 100)} %`));
      const r = parseCctp(lines);
      if (!r.articles.length) throw new Error('aucun article numéroté trouvé (le PDF est peut-être scanné, sans texte)');
      setRes({ ...r, file, pages: pdf.numPages });
    } catch (e) {
      toast(`Lecture du CCTP impossible : ${(e as Error).message}`, 'erreur');
    } finally {
      setBusy(null);
    }
  };

  const apply = async (thenGenerate: boolean) => {
    if (!res) return;
    setCctp(res.lots, res.articles);
    try {
      const doc = await api.uploadDocument(data.project.id, res.file, 'cctp', res.pages);
      addDocument(doc, []);
    } catch {
      /* archivage facultatif */
    }
    toast(`CCTP importé : ${res.articles.filter((a) => a.kind === 'article').length} articles`, 'ok');
    setUi({ dialog: thenGenerate ? { type: 'generer-dpgf' } : null });
  };

  const arts = res?.articles.filter((a) => a.kind === 'article') ?? [];
  return (
    <Modal
      title="Importer un CCTP (PDF)"
      onClose={close}
      wide={!!res}
      footer={
        <>
          <button className="btn" onClick={close}>
            Annuler
          </button>
          <button className="btn" disabled={!res} onClick={() => apply(false)}>
            Importer le CCTP
          </button>
          <button className="btn primary" disabled={!res} onClick={() => apply(true)}>
            Importer et générer une DPGF
          </button>
        </>
      }
    >
      <p>Le texte est extrait et découpé en lot, chapitres et articles à partir de la numérotation (ex. « 01-3-2-1 1 »). En-têtes, pieds de page et sommaire sont ignorés.</p>
      <input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
      <button className="btn primary" disabled={!!busy} onClick={() => input.current?.click()}>
        Choisir le CCTP en PDF…
      </button>
      {busy && <p className="muted">{busy}</p>}
      {res && (
        <>
          <p>
            <strong>{res.lots.map((l) => `Lot ${l.code} — ${l.name}`).join(', ') || 'Lot non identifié'}</strong> : {res.articles.filter((a) => a.kind === 'titre').length} chapitres,{' '}
            {arts.length} articles, {res.pages} pages.
          </p>
          <div className="cctp-preview">
            {res.articles.map((a) => (
              <div key={a.id} className={`cctp-row ${a.kind}`} style={{ paddingLeft: 4 + a.depth * 12 }}>
                <span className="c-code">{a.code}</span> {a.title}
                {a.kind === 'article' && <span className="tag">{displayUnit(a.suggestedUnit)} ?</span>}
                <span className="muted small"> p. {a.page}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

function GenerateDialog() {
  const data = useApp((s) => s.data)!;
  const { generateDpgfFromCctp, toast } = useApp.getState();
  const n = data.cctp.filter((a) => a.kind === 'article').length;
  return (
    <Modal
      title="Générer une DPGF vierge depuis le CCTP"
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>
            Annuler
          </button>
          <button
            className="btn primary"
            onClick={() => {
              const k = generateDpgfFromCctp();
              toast(`DPGF générée : ${k} articles à chiffrer`, 'ok');
              close();
            }}
          >
            Générer
          </button>
        </>
      }
    >
      <p>
        {n} articles du CCTP vont devenir des lignes de prix, avec une unité proposée d’après leur intitulé (à vérifier dans le panneau DPGF). Les prix unitaires
        sont laissés vides.
      </p>
      {data.lines.length > 0 && <p className="warn-text">La DPGF actuelle sera remplacée. Les mesures dont le numéro d’article existe dans le CCTP restent rattachées.</p>}
    </Modal>
  );
}

// --- Échelle -----------------------------------------------------------------

const RATIOS = [1, 2, 5, 10, 20, 25, 50, 75, 100, 125, 200, 250, 500, 1000, 2000, 2500, 5000];

function ScaleDialog({ payload }: { payload: { pageId: string; distPts?: number } }) {
  const data = useApp((s) => s.data)!;
  const { updatePage, toast } = useApp.getState();
  const page = data.pages.find((p) => p.id === payload.pageId)!;
  const [real, setReal] = useState('');
  const [ratio, setRatio] = useState(page.scale?.ratio ? String(page.scale.ratio) : '100');
  const [allPages, setAllPages] = useState(false);
  const fromCote = payload.distPts != null;
  const apply = () => {
    let scale;
    if (fromCote) {
      const v = parseNum(real);
      if (!v || v <= 0) return toast('Saisissez la longueur réelle de la cote, en mètres', 'erreur');
      const mpp = v / payload.distPts!;
      const approx = mpp / (0.0254 / 72);
      scale = { method: 'cote' as const, metersPerPoint: mpp, ratio: Math.round(approx), label: `cote ${fmt(v)} m (≈ 1/${Math.round(approx)})` };
    } else {
      const r = parseNum(ratio);
      if (!r || r <= 0) return;
      scale = { method: 'normalisee' as const, metersPerPoint: metersPerPointForRatio(r), ratio: r, label: `1/${r}` };
    }
    const targets = allPages ? data.pages.filter((p) => p.docId === page.docId) : [page];
    targets.forEach((p) => updatePage(p.id, { scale }));
    toast(`Échelle appliquée à ${targets.length} page(s)`, 'ok');
    useApp.getState().setUi({ dialog: null, tool: 'select' });
  };
  return (
    <Modal
      title={fromCote ? 'Calibrage par cote connue' : 'Échelle normalisée'}
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>
            Annuler
          </button>
          <button className="btn primary" onClick={apply}>
            Appliquer
          </button>
        </>
      }
    >
      <p className="muted">Plan : {page.name}</p>
      {fromCote ? (
        <label className="field">
          <span>Longueur réelle de la cote tracée (m)</span>
          <input autoFocus value={real} onChange={(e) => setReal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && apply()} placeholder="ex. 20,00" />
        </label>
      ) : (
        <label className="field">
          <span>Échelle du plan</span>
          <div className="ratio">
            1 /
            <input list="ratios" value={ratio} onChange={(e) => setRatio(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && apply()} />
            <datalist id="ratios">
              {RATIOS.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </div>
          <span className="muted small">Valable si le PDF a été imprimé au format réel (sans « ajuster à la page »). En cas de doute, calibrez sur une cote.</span>
        </label>
      )}
      <label className="chk">
        <input type="checkbox" checked={allPages} onChange={(e) => setAllPages(e.target.checked)} /> Appliquer à toutes les pages de ce PDF
      </label>
    </Modal>
  );
}

// --- Article -----------------------------------------------------------------

const UNITS = ['m', 'm2', 'm3', 'u', 'ens', 'kg', 't', 'h'];
const DEF_PARAMS: { key: keyof MeasureParams; label: string }[] = [
  { key: 'hauteur', label: 'Hauteur (m)' },
  { key: 'epaisseur', label: 'Épaisseur (m)' },
  { key: 'parUnite', label: 'Qté par objet (E4)' },
  { key: 'coef', label: 'Coefficient' },
  { key: 'chute', label: 'Chute (%)' },
];

function ArticleDialog({ id }: { id: string }) {
  const data = useApp((s) => s.data)!;
  const { updateLine, deleteLine } = useApp.getState();
  const line = data.lines.find((l) => l.id === id);
  const [d, setD] = useState<DpgfLine | null>(line ? { ...line, defaults: { ...line.defaults } } : null);
  const cctp = useMemo(() => {
    if (!line) return null;
    const k = normalizeCode(line.code.replace(/\.[a-z]$/, ''));
    return data.cctp.find((a) => a.id === line.cctpRef) ?? data.cctp.find((a) => a.kind === 'article' && normalizeCode(a.code) === k) ?? null;
  }, [line, data.cctp]);
  if (!line || !d) return null;
  const count = data.measures.filter((m) => m.articleId === id).length;
  const numField = (k: 'unitPrice' | 'dpgfQty' | 'manualQty', label: string) => (
    <label className="field">
      <span>{label}</span>
      <input defaultValue={d[k] != null ? fmt(d[k]!, k === 'unitPrice' ? 2 : 3) : ''} onBlur={(e) => setD({ ...d, [k]: parseNum(e.target.value) })} />
    </label>
  );
  const save = () => {
    updateLine(id, { ...d, unit: d.kind === 'article' ? normalizeUnit(d.unit) || d.unit : '' });
    close();
  };
  return (
    <Modal
      title={d.kind === 'article' ? 'Article de DPGF' : 'Chapitre de DPGF'}
      onClose={close}
      wide
      footer={
        <>
          <button
            className="btn danger"
            onClick={() => {
              if (!count || confirmSafe(`Supprimer l’article et ses ${count} mesure(s) ?`)) {
                deleteLine(id);
                close();
              }
            }}
          >
            Supprimer
          </button>
          <span className="grow" />
          <button className="btn" onClick={close}>
            Annuler
          </button>
          <button className="btn primary" onClick={save}>
            Enregistrer
          </button>
        </>
      }
    >
      <div className="grid2">
        <label className="field">
          <span>N° d’article</span>
          <input value={d.code} onChange={(e) => setD({ ...d, code: e.target.value })} />
        </label>
        <label className="field">
          <span>Type</span>
          <select value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value as DpgfLine['kind'] })}>
            <option value="article">Article (ligne de prix)</option>
            <option value="titre">Titre / chapitre</option>
            <option value="groupe">Groupe d’articles</option>
          </select>
        </label>
      </div>
      <label className="field">
        <span>Désignation</span>
        <input value={d.designation} onChange={(e) => setD({ ...d, designation: e.target.value })} />
      </label>
      {d.kind === 'article' && (
        <>
          <div className="grid3">
            <label className="field">
              <span>Unité</span>
              <select value={normalizeUnit(d.unit) || d.unit} onChange={(e) => setD({ ...d, unit: e.target.value })}>
                {!UNITS.includes(normalizeUnit(d.unit)) && <option value={d.unit}>{d.unit || '—'}</option>}
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {displayUnit(u)}
                  </option>
                ))}
              </select>
            </label>
            {numField('unitPrice', 'Prix unitaire HT (€)')}
            <label className="field">
              <span>Couleur</span>
              <input type="color" value={d.color || '#d6336c'} onChange={(e) => setD({ ...d, color: e.target.value })} />
            </label>
          </div>
          <div className="grid2">
            {numField('dpgfQty', 'Quantité de la DPGF importée (contrôle)')}
            {numField('manualQty', 'Quantité manuelle ajoutée (forfaits, compléments)')}
          </div>
          <fieldset>
            <legend>Paramètres par défaut des mesures</legend>
            <div className="grid5">
              {DEF_PARAMS.map((p) => (
                <label className="field small" key={p.key}>
                  <span>{p.label}</span>
                  <input
                    defaultValue={d.defaults[p.key] != null ? String(d.defaults[p.key]).replace('.', ',') : ''}
                    onBlur={(e) => {
                      const v = parseNum(e.target.value);
                      const defaults = { ...d.defaults };
                      if (v == null) delete defaults[p.key];
                      else defaults[p.key] = v;
                      setD({ ...d, defaults });
                    }}
                  />
                </label>
              ))}
            </div>
            <p className="muted small">Ces valeurs s’appliquent à toutes les mesures de l’article qui ne les redéfinissent pas.</p>
          </fieldset>
          <p className="muted small">{count} mesure(s) rattachée(s).</p>
        </>
      )}
      {cctp && (
        <fieldset>
          <legend>
            CCTP {cctp.code} — {cctp.title} (p. {cctp.page})
          </legend>
          {cctp.localisation && (
            <p>
              <strong>Localisation :</strong> {cctp.localisation}
            </p>
          )}
          <pre className="cctp-body">{cctp.body.slice(0, 2500)}</pre>
        </fieldset>
      )}
    </Modal>
  );
}

function confirmSafe(msg: string) {
  try {
    return window.confirm(msg);
  } catch {
    return true;
  }
}

// --- Paramètres --------------------------------------------------------------

function SettingsDialog() {
  const data = useApp((s) => s.data)!;
  const { setProjectInfo, setSettings } = useApp.getState();
  const [p, setP] = useState({ ...data.project });
  const [s, setS] = useState({ ...data.settings });
  return (
    <Modal
      title="Paramètres du projet"
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>
            Annuler
          </button>
          <button
            className="btn primary"
            onClick={() => {
              setProjectInfo({ name: p.name, address: p.address, phase: p.phase });
              setSettings(s);
              close();
            }}
          >
            Enregistrer
          </button>
        </>
      }
    >
      <label className="field">
        <span>Nom du projet</span>
        <input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
      </label>
      <label className="field">
        <span>Adresse</span>
        <input value={p.address} onChange={(e) => setP({ ...p, address: e.target.value })} />
      </label>
      <div className="grid3">
        <label className="field">
          <span>Phase</span>
          <select value={p.phase} onChange={(e) => setP({ ...p, phase: e.target.value as Phase })}>
            {PHASES.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>TVA (%)</span>
          <input defaultValue={String(s.tvaRate).replace('.', ',')} onBlur={(e) => setS({ ...s, tvaRate: parseNum(e.target.value) ?? s.tvaRate })} />
        </label>
        <label className="field">
          <span>Seuil d’écart (%)</span>
          <input defaultValue={String(s.ecartThreshold).replace('.', ',')} onBlur={(e) => setS({ ...s, ecartThreshold: parseNum(e.target.value) ?? s.ecartThreshold })} />
        </label>
      </div>
      <label className="field">
        <span>Couleur de fond de la zone plan</span>
        <div className="row">
          <input type="color" value={s.planBackground} onChange={(e) => setS({ ...s, planBackground: e.target.value })} />
          {['#5b6470', '#2b2f36', '#e9ecef', '#ffffff', '#1f3b57'].map((c) => (
            <button key={c} className="color-chip" style={{ background: c }} onClick={() => setS({ ...s, planBackground: c })} aria-label={c} />
          ))}
        </div>
      </label>
    </Modal>
  );
}

// --- Cohérence ---------------------------------------------------------------

const ORDER: IssueKind[] = [
  'cctp-absent-dpgf',
  'unite-incoherente',
  'page-non-calibree',
  'ecart-quantite',
  'cctp-numerotation',
  'cctp-intitule',
  'dpgf-absent-cctp',
  'article-sans-unite',
  'dpgf-sans-mesure',
];

export function useIssues() {
  const data = useApp((s) => s.data)!;
  return useMemo(() => analyseCoherence(data), [data.lines, data.measures, data.pages, data.cctp, data.settings.ecartThreshold, data.lots]);
}

function CoherenceDialog() {
  const data = useApp((s) => s.data)!;
  const issues = useIssues();
  const { setUi, selectArticle, setSettings } = useApp.getState();
  const [open, setOpen] = useState<Record<string, boolean>>({ 'cctp-absent-dpgf': true, 'unite-incoherente': true, 'ecart-quantite': true, 'page-non-calibree': true });
  const groups = ORDER.map((k) => ({ k, items: issues.filter((i) => i.kind === k) })).filter((g) => g.items.length);
  const go = (i: Issue) => {
    if (i.lineId) {
      selectArticle(i.lineId);
      const m = data.measures.find((x) => (i.measureIds ? i.measureIds.includes(x.id) : x.articleId === i.lineId));
      setUi({ currentPageId: m?.pageId ?? useApp.getState().currentPageId, selectedMeasureId: i.measureIds?.[0] ?? null, dialog: null });
    } else if (i.pageId) setUi({ currentPageId: i.pageId, dialog: null });
    else if (i.cctpId) setUi({ dialog: null });
  };
  return (
    <Modal title="Analyse de cohérence plans / CCTP / DPGF" onClose={close} wide footer={<button className="btn" onClick={close}>Fermer</button>}>
      <div className="row">
        <span>Seuil d’écart métré / DPGF :</span>
        <input
          className="tva"
          defaultValue={String(data.settings.ecartThreshold).replace('.', ',')}
          onBlur={(e) => {
            const v = parseNum(e.target.value);
            if (v != null && v >= 0) setSettings({ ecartThreshold: v });
          }}
        />
        %<span className="grow" />
        {!data.cctp.length && <span className="muted small">Aucun CCTP importé : le contrôle CCTP ↔ DPGF est inactif.</span>}
      </div>
      {groups.length === 0 && <p className="ok-text">Aucune anomalie détectée.</p>}
      {groups.map((g) => (
        <div key={g.k} className={`issue-group sev-${g.items[0].severity}`}>
          <button className="issue-head" onClick={() => setOpen((o) => ({ ...o, [g.k]: !o[g.k] }))}>
            <span className="caret">{open[g.k] ? '▾' : '▸'}</span> {ISSUE_LABELS[g.k]} <span className="badge">{g.items.length}</span>
          </button>
          {open[g.k] && (
            <ul>
              {g.items.map((i, n) => (
                <li key={n}>
                  <button className="link" onClick={() => go(i)} disabled={!i.lineId && !i.pageId}>
                    {i.message}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </Modal>
  );
}

function HelpDialog() {
  return (
    <Modal title="Aide — raccourcis et principes" onClose={close} footer={<button className="btn" onClick={close}>Fermer</button>}>
      <h4>Principe</h4>
      <p>
        Le métré est piloté par la DPGF : sélectionnez un article dans le panneau de droite, puis mesurez sur le plan. L’unité de l’article détermine le calcul
        (ml, m², m³, u) et les paramètres d’extension (hauteur, épaisseur, quantité par objet).
      </p>
      <h4>Raccourcis</h4>
      <table className="simple">
        <tbody>
          {[
            ['V', 'Sélection'],
            ['H ou Espace maintenu', 'Panoramique (ou clic molette / clic droit glissé)'],
            ['1 à 4', 'Outils E1 Périmètre, E2 Surface, E3 Longueur, E4 Comptage'],
            ['K', 'Échelle par cote connue'],
            ['Molette', 'Zoom centré sur le curseur'],
            ['Maj', 'Tracé orthogonal (0°, 45°, 90°)'],
            ['Entrée / double-clic', 'Terminer la mesure ou la série de comptage'],
            ['Retour arrière', 'Retirer le dernier point'],
            ['Échap', 'Annuler le tracé en cours'],
            ['Ctrl+Z / Ctrl+Y', 'Annuler / rétablir'],
            ['Suppr', 'Supprimer la mesure sélectionnée'],
            ['S', 'Activer / désactiver l’accrochage'],
          ].map(([k, v]) => (
            <tr key={k}>
              <td>
                <kbd>{k}</kbd>
              </td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
