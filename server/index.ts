// Serveur API MétréPlan+ : projets, documents et état du métré (SQLite).

import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { uid } from '../shared/ids';
import { PHASES, type DocKind, type DocumentFile, type EditableState } from '../shared/types';
import * as store from './db';
import { seedDemo } from './seed';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = resolve(process.env.METREPLAN_DATA ?? join(root, 'data'));
const FILES_DIR = join(DATA_DIR, 'fichiers');
mkdirSync(FILES_DIR, { recursive: true });

export function createApp(db: store.DB, filesDir = FILES_DIR) {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

  const wrap = (fn: (req: Request, res: Response) => unknown) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };

  app.get('/api/sante', (_req, res) => res.json({ ok: true }));

  app.get('/api/projets', (_req, res) => res.json(store.listProjects(db)));

  app.post('/api/projets', (req, res) => {
    const { name, address, phase } = req.body ?? {};
    if (!name || typeof name !== 'string') return res.status(400).json({ erreur: 'Le nom du projet est obligatoire' });
    if (phase && !PHASES.includes(phase)) return res.status(400).json({ erreur: 'Phase inconnue' });
    const p = store.createProject(db, { id: uid('prj'), name: name.trim(), address: String(address ?? ''), phase: phase ?? 'DCE' });
    const layer = { id: uid('cal'), name: 'Calque principal', visible: true, locked: false, color: '#1c7ed6', order: 0 };
    const s = store.getProjectState(db, p.id)!;
    store.saveProjectState(db, p.id, { ...s, layers: [layer] });
    res.status(201).json(p);
  });

  app.get('/api/projets/:id', (req, res) => {
    const s = store.getProjectState(db, req.params.id);
    if (!s) return res.status(404).json({ erreur: 'Projet introuvable' });
    res.json(s);
  });

  app.put('/api/projets/:id/etat', (req, res) => {
    const body = req.body as EditableState;
    if (!body?.project || !Array.isArray(body.measures)) return res.status(400).json({ erreur: 'État invalide' });
    try {
      store.saveProjectState(db, req.params.id, body);
    } catch (e) {
      return res.status(404).json({ erreur: (e as Error).message });
    }
    res.json({ ok: true, savedAt: new Date().toISOString() });
  });

  app.delete('/api/projets/:id', (req, res) => {
    store.deleteProject(db, req.params.id);
    rmSync(join(filesDir, req.params.id), { recursive: true, force: true });
    res.json({ ok: true });
  });

  app.post(
    '/api/projets/:id/documents',
    upload.single('fichier'),
    wrap((req, res) => {
      const projectId = req.params.id;
      if (!store.getProjectState(db, projectId)) return res.status(404).json({ erreur: 'Projet introuvable' });
      const f = req.file;
      if (!f) return res.status(400).json({ erreur: 'Fichier manquant' });
      const kind = String(req.body.kind ?? 'plan') as DocKind;
      if (!['plan', 'cctp', 'dpgf'].includes(kind)) return res.status(400).json({ erreur: 'Type de document inconnu' });
      const doc: DocumentFile = {
        id: uid('doc'),
        kind,
        fileName: Buffer.from(f.originalname, 'latin1').toString('utf8'),
        pageCount: Number(req.body.pageCount ?? 0) || 0,
        uploadedAt: new Date().toISOString(),
      };
      const dir = join(filesDir, projectId);
      mkdirSync(dir, { recursive: true });
      const path = join(dir, `${doc.id}${kind === 'dpgf' ? '.xlsx' : '.pdf'}`);
      writeFileSync(path, f.buffer);
      store.addDocument(db, projectId, { ...doc, path });
      res.status(201).json(doc);
    }),
  );

  app.get('/api/documents/:id/fichier', (req, res) => {
    const d = store.getDocumentPath(db, req.params.id);
    if (!d || !existsSync(d.path)) return res.status(404).json({ erreur: 'Document introuvable' });
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(d.fileName)}`);
    res.type(d.path.endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(readFileSync(d.path));
  });

  app.delete('/api/projets/:id/documents/:docId', (req, res) => {
    const d = store.getDocumentPath(db, req.params.docId);
    store.deleteDocument(db, req.params.id, req.params.docId);
    if (d) rmSync(d.path, { force: true });
    res.json({ ok: true });
  });

  app.post(
    '/api/demo/reinitialiser',
    wrap(async (_req, res) => {
      for (const p of store.listProjects(db).filter((x) => x.isDemo)) {
        store.deleteProject(db, p.id);
        rmSync(join(filesDir, p.id), { recursive: true, force: true });
      }
      const id = await seedDemo(db, filesDir);
      res.json({ id });
    }),
  );

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ erreur: err.message });
  });
  return app;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const db = store.openDb(join(DATA_DIR, 'metreplan.sqlite'));
  if (!store.listProjects(db).some((p) => p.isDemo)) {
    await seedDemo(db, FILES_DIR);
    console.log('Projet de démonstration créé.');
  }
  const app = createApp(db);
  const dist = join(root, 'dist');
  if ((process.argv.includes('--production') || process.env.NODE_ENV === 'production') && existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(join(dist, 'index.html')));
  }
  const port = Number(process.env.PORT ?? 3001);
  app.listen(port, () => console.log(`MétréPlan+ API sur http://localhost:${port}`));
}
