// Accueil : liste des projets, création, ouverture, projet de démonstration.
import { useEffect, useState } from 'react';
import { PHASES, type Phase, type ProjectSummary } from '../../shared/types';
import { api } from '../api';
import { BrandEmblem, BrandLogo } from './Brand';
import { Modal } from './Dialogs';
import { Toasts } from './Workspace';
import { useApp } from '../store';

export function Home({ onOpen }: { onOpen: (id: string) => void }) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', address: '', phase: 'DCE' as Phase });
  const toast = useApp((s) => s.toast);
  const refresh = () => api.listProjects().then(setProjects).catch((e) => toast(`Serveur injoignable : ${e.message}`, 'erreur'));
  useEffect(() => {
    refresh();
  }, []);

  const create = async () => {
    if (!form.name.trim()) return toast('Le nom du projet est obligatoire', 'erreur');
    const p = await api.createProject(form);
    onOpen(p.id);
  };

  return (
    <div className="home">
      <header className="home-head">
        <div>
          <div className="brand big">
            <span className="logo">M+</span>
            <span>
              MétréPlan<b>+</b>
            </span>
          </div>
          <p>Métré sur plans PDF piloté par la DPGF et contrôlé par le CCTP.</p>
        </div>
        <BrandLogo height={72} />
      </header>
      <div className="home-actions">
        <button className="btn primary" onClick={() => setCreating(true)}>
          Nouveau projet
        </button>
        <button
          className="btn"
          onClick={async () => {
            const { id } = await api.resetDemo();
            onOpen(id);
          }}
          title="Recrée le projet de démonstration dans son état initial"
        >
          Réinitialiser la démo
        </button>
      </div>
      <table className="projects">
        <thead>
          <tr>
            <th>Projet</th>
            <th>Adresse</th>
            <th>Phase</th>
            <th>Modifié le</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {projects?.map((p) => (
            <tr key={p.id} onClick={() => onOpen(p.id)}>
              <td>
                <strong>{p.name}</strong> {p.isDemo && <span className="tag ok">démo</span>}
              </td>
              <td>{p.address}</td>
              <td>
                <span className="tag">{p.phase}</span>
              </td>
              <td>{new Date(p.updatedAt).toLocaleString('fr-FR')}</td>
              <td>
                <button
                  className="link danger"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!window.confirm(`Supprimer définitivement « ${p.name} » et ses documents ?`)) return;
                    await api.deleteProject(p.id);
                    refresh();
                  }}
                >
                  supprimer
                </button>
              </td>
            </tr>
          ))}
          {projects && !projects.length && (
            <tr>
              <td colSpan={5} className="muted">
                Aucun projet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {creating && (
        <Modal
          title="Nouveau projet"
          onClose={() => setCreating(false)}
          footer={
            <>
              <button className="btn" onClick={() => setCreating(false)}>
                Annuler
              </button>
              <button className="btn primary" onClick={create}>
                Créer
              </button>
            </>
          }
        >
          <label className="field">
            <span>Nom du projet</span>
            <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ex. Construction de 34 logements collectifs" />
          </label>
          <label className="field">
            <span>Adresse</span>
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </label>
          <label className="field">
            <span>Phase</span>
            <select value={form.phase} onChange={(e) => setForm({ ...form, phase: e.target.value as Phase })}>
              {PHASES.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
        </Modal>
      )}
      <footer className="home-foot">
        <BrandEmblem size={28} />
        <span>
          Conçu par <strong>MSBIM5D</strong> — Mourad SADOUN, ingénieur économiste, formateur
        </span>
      </footer>
      <Toasts />
    </div>
  );
}
