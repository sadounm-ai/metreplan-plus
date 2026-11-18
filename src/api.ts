import type { DocKind, DocumentFile, EditableState, Phase, ProjectState, ProjectSummary } from '../shared/types';

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) {
    let msg = `${r.status} ${r.statusText}`;
    try {
      msg = (await r.json()).erreur ?? msg;
    } catch {
      /* corps non JSON */
    }
    throw new Error(msg);
  }
  return r.json() as Promise<T>;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  listProjects: () => req<ProjectSummary[]>('/api/projets'),
  createProject: (p: { name: string; address: string; phase: Phase }) => req<ProjectSummary>('/api/projets', json('POST', p)),
  getProject: (id: string) => req<ProjectState>(`/api/projets/${id}`),
  saveState: (id: string, s: EditableState) => req<{ ok: boolean; savedAt: string }>(`/api/projets/${id}/etat`, json('PUT', s)),
  deleteProject: (id: string) => req<{ ok: boolean }>(`/api/projets/${id}`, { method: 'DELETE' }),
  resetDemo: () => req<{ id: string }>('/api/demo/reinitialiser', { method: 'POST' }),
  uploadDocument: (projectId: string, file: File, kind: DocKind, pageCount: number) => {
    const fd = new FormData();
    fd.append('kind', kind);
    fd.append('pageCount', String(pageCount));
    fd.append('fichier', file);
    return req<DocumentFile>(`/api/projets/${projectId}/documents`, { method: 'POST', body: fd });
  },
  deleteDocument: (projectId: string, docId: string) => req<{ ok: boolean }>(`/api/projets/${projectId}/documents/${docId}`, { method: 'DELETE' }),
  documentUrl: (docId: string) => `/api/documents/${docId}/fichier`,
};
