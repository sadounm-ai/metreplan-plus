// Stockage persistant SQLite (module natif node:sqlite, sans dépendance compilée).

import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import {
  DEFAULT_SETTINGS,
  type CctpArticle,
  type DocumentFile,
  type DpgfLine,
  type EditableState,
  type Layer,
  type Lot,
  type Measure,
  type PlanPage,
  type ProjectState,
  type ProjectSummary,
} from '../shared/types';

// Chargement via require : certains outillages (Vite/Vitest) ne connaissent pas encore « node:sqlite ».
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

export type DB = DatabaseSyncType;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL DEFAULT '', phase TEXT NOT NULL DEFAULT 'DCE',
  is_demo INTEGER NOT NULL DEFAULT 0, settings_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, file_name TEXT NOT NULL, page_count INTEGER NOT NULL DEFAULT 0,
  uploaded_at TEXT NOT NULL, path TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  doc_id TEXT NOT NULL, page_index INTEGER NOT NULL, name TEXT NOT NULL, level TEXT NOT NULL DEFAULT '',
  scale_json TEXT, ord INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS lots (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  code TEXT NOT NULL, name TEXT NOT NULL, ord INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS dpgf_lines (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  lot_id TEXT NOT NULL, kind TEXT NOT NULL, code TEXT NOT NULL, designation TEXT NOT NULL, depth INTEGER NOT NULL,
  unit TEXT NOT NULL, unit_price REAL, dpgf_qty REAL, manual_qty REAL, defaults_json TEXT NOT NULL DEFAULT '{}',
  color TEXT NOT NULL DEFAULT '', cctp_ref TEXT, ord INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS layers (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL, visible INTEGER NOT NULL DEFAULT 1, locked INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#888888', ord INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS measures (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  page_id TEXT NOT NULL, layer_id TEXT NOT NULL, article_id TEXT NOT NULL, tool TEXT NOT NULL,
  points_json TEXT NOT NULL, holes_json TEXT NOT NULL DEFAULT '[]', params_json TEXT NOT NULL DEFAULT '{}',
  label TEXT NOT NULL DEFAULT '', surface_tags TEXT, room TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cctp_lots (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, code TEXT NOT NULL, name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cctp_articles (
  id TEXT NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  lot_code TEXT NOT NULL, code TEXT NOT NULL, title TEXT NOT NULL, kind TEXT NOT NULL, depth INTEGER NOT NULL,
  body TEXT NOT NULL, localisation TEXT NOT NULL, suggested_unit TEXT NOT NULL, page INTEGER NOT NULL, ord INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_measures_project ON measures(project_id);
CREATE INDEX IF NOT EXISTS idx_lines_project ON dpgf_lines(project_id);
`;

export function openDb(file: string): DB {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

type Row = Record<string, unknown>;
const j = <T>(s: unknown, fallback: T): T => {
  if (typeof s !== 'string' || !s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

const toSummary = (r: Row): ProjectSummary => ({
  id: r.id as string,
  name: r.name as string,
  address: r.address as string,
  phase: r.phase as ProjectSummary['phase'],
  isDemo: !!r.is_demo,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});

export function listProjects(db: DB): ProjectSummary[] {
  return (db.prepare('SELECT * FROM projects ORDER BY is_demo DESC, updated_at DESC').all() as Row[]).map(toSummary);
}

export function createProject(db: DB, p: { id: string; name: string; address?: string; phase?: string; isDemo?: boolean }): ProjectSummary {
  const now = new Date().toISOString();
  db.prepare('INSERT INTO projects (id, name, address, phase, is_demo, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    p.id,
    p.name,
    p.address ?? '',
    p.phase ?? 'DCE',
    p.isDemo ? 1 : 0,
    JSON.stringify(DEFAULT_SETTINGS),
    now,
    now,
  );
  return toSummary(db.prepare('SELECT * FROM projects WHERE id = ?').get(p.id) as Row);
}

export function deleteProject(db: DB, id: string) {
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
}

export function addDocument(db: DB, projectId: string, d: DocumentFile & { path: string }) {
  db.prepare('INSERT INTO documents (id, project_id, kind, file_name, page_count, uploaded_at, path) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    d.id,
    projectId,
    d.kind,
    d.fileName,
    d.pageCount,
    d.uploadedAt,
    d.path,
  );
  touch(db, projectId);
}

export function getDocumentPath(db: DB, id: string): { path: string; fileName: string; projectId: string } | null {
  const r = db.prepare('SELECT path, file_name, project_id FROM documents WHERE id = ?').get(id) as Row | undefined;
  return r ? { path: r.path as string, fileName: r.file_name as string, projectId: r.project_id as string } : null;
}

export function deleteDocument(db: DB, projectId: string, id: string) {
  db.prepare('DELETE FROM documents WHERE id = ? AND project_id = ?').run(id, projectId);
  const pageIds = (db.prepare('SELECT id FROM pages WHERE doc_id = ?').all(id) as Row[]).map((r) => r.id as string);
  for (const pid of pageIds) db.prepare('DELETE FROM measures WHERE page_id = ?').run(pid);
  db.prepare('DELETE FROM pages WHERE doc_id = ?').run(id);
  touch(db, projectId);
}

const touch = (db: DB, id: string) => db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), id);

export function getProjectState(db: DB, id: string): ProjectState | null {
  const pr = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Row | undefined;
  if (!pr) return null;
  const all = (sql: string) => db.prepare(sql).all(id) as Row[];
  return {
    project: toSummary(pr),
    settings: { ...DEFAULT_SETTINGS, ...j(pr.settings_json, {}) },
    documents: all('SELECT * FROM documents WHERE project_id = ? ORDER BY uploaded_at').map(
      (r): DocumentFile => ({
        id: r.id as string,
        kind: r.kind as DocumentFile['kind'],
        fileName: r.file_name as string,
        pageCount: r.page_count as number,
        uploadedAt: r.uploaded_at as string,
      }),
    ),
    pages: all('SELECT * FROM pages WHERE project_id = ? ORDER BY ord').map(
      (r): PlanPage => ({
        id: r.id as string,
        docId: r.doc_id as string,
        pageIndex: r.page_index as number,
        name: r.name as string,
        level: r.level as string,
        scale: j(r.scale_json, null),
        order: r.ord as number,
      }),
    ),
    lots: all('SELECT * FROM lots WHERE project_id = ? ORDER BY ord').map(
      (r): Lot => ({ id: r.id as string, code: r.code as string, name: r.name as string, order: r.ord as number }),
    ),
    lines: all('SELECT * FROM dpgf_lines WHERE project_id = ? ORDER BY ord').map(
      (r): DpgfLine => ({
        id: r.id as string,
        lotId: r.lot_id as string,
        kind: r.kind as DpgfLine['kind'],
        code: r.code as string,
        designation: r.designation as string,
        depth: r.depth as number,
        unit: r.unit as string,
        unitPrice: (r.unit_price as number | null) ?? null,
        dpgfQty: (r.dpgf_qty as number | null) ?? null,
        manualQty: (r.manual_qty as number | null) ?? null,
        defaults: j(r.defaults_json, {}),
        color: r.color as string,
        cctpRef: (r.cctp_ref as string | null) ?? undefined,
        order: r.ord as number,
      }),
    ),
    layers: all('SELECT * FROM layers WHERE project_id = ? ORDER BY ord').map(
      (r): Layer => ({
        id: r.id as string,
        name: r.name as string,
        visible: !!r.visible,
        locked: !!r.locked,
        color: r.color as string,
        order: r.ord as number,
      }),
    ),
    measures: all('SELECT * FROM measures WHERE project_id = ? ORDER BY created_at').map(
      (r): Measure => ({
        id: r.id as string,
        pageId: r.page_id as string,
        layerId: r.layer_id as string,
        articleId: r.article_id as string,
        tool: r.tool as Measure['tool'],
        points: j(r.points_json, []),
        holes: j(r.holes_json, []),
        params: j(r.params_json, {}),
        label: r.label as string,
        surfaceTags: j(r.surface_tags, undefined),
        room: (r.room as string | null) ?? undefined,
        createdAt: r.created_at as string,
      }),
    ),
    cctpLots: all('SELECT * FROM cctp_lots WHERE project_id = ?').map((r) => ({ code: r.code as string, name: r.name as string })),
    cctp: all('SELECT * FROM cctp_articles WHERE project_id = ? ORDER BY ord').map(
      (r): CctpArticle => ({
        id: r.id as string,
        lotCode: r.lot_code as string,
        code: r.code as string,
        title: r.title as string,
        kind: r.kind as CctpArticle['kind'],
        depth: r.depth as number,
        body: r.body as string,
        localisation: r.localisation as string,
        suggestedUnit: r.suggested_unit as string,
        page: r.page as number,
        order: r.ord as number,
      }),
    ),
  };
}

/** Remplace l'état modifiable d'un projet dans une transaction. */
export function saveProjectState(db: DB, id: string, s: EditableState) {
  const exists = db.prepare('SELECT 1 FROM projects WHERE id = ?').get(id);
  if (!exists) throw new Error('Projet introuvable');
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE projects SET name = ?, address = ?, phase = ?, settings_json = ?, updated_at = ? WHERE id = ?').run(
      s.project.name,
      s.project.address,
      s.project.phase,
      JSON.stringify(s.settings),
      new Date().toISOString(),
      id,
    );
    for (const t of ['pages', 'lots', 'dpgf_lines', 'layers', 'measures', 'cctp_lots', 'cctp_articles'])
      db.prepare(`DELETE FROM ${t} WHERE project_id = ?`).run(id);
    const docIds = new Set((db.prepare('SELECT id FROM documents WHERE project_id = ?').all(id) as Row[]).map((r) => r.id as string));
    const insPage = db.prepare('INSERT INTO pages (id, project_id, doc_id, page_index, name, level, scale_json, ord) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const p of s.pages) {
      if (!docIds.has(p.docId)) continue;
      insPage.run(p.id, id, p.docId, p.pageIndex, p.name, p.level, p.scale ? JSON.stringify(p.scale) : null, p.order);
    }
    const insLot = db.prepare('INSERT INTO lots (id, project_id, code, name, ord) VALUES (?, ?, ?, ?, ?)');
    for (const l of s.lots) insLot.run(l.id, id, l.code, l.name, l.order);
    const insLine = db.prepare(
      'INSERT INTO dpgf_lines (id, project_id, lot_id, kind, code, designation, depth, unit, unit_price, dpgf_qty, manual_qty, defaults_json, color, cctp_ref, ord) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    for (const l of s.lines)
      insLine.run(
        l.id,
        id,
        l.lotId,
        l.kind,
        l.code,
        l.designation,
        l.depth,
        l.unit,
        l.unitPrice ?? null,
        l.dpgfQty ?? null,
        l.manualQty ?? null,
        JSON.stringify(l.defaults ?? {}),
        l.color,
        l.cctpRef ?? null,
        l.order,
      );
    const insLayer = db.prepare('INSERT INTO layers (id, project_id, name, visible, locked, color, ord) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const l of s.layers) insLayer.run(l.id, id, l.name, l.visible ? 1 : 0, l.locked ? 1 : 0, l.color, l.order);
    const insM = db.prepare(
      'INSERT INTO measures (id, project_id, page_id, layer_id, article_id, tool, points_json, holes_json, params_json, label, surface_tags, room, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    for (const m of s.measures)
      insM.run(
        m.id,
        id,
        m.pageId,
        m.layerId,
        m.articleId,
        m.tool,
        JSON.stringify(m.points),
        JSON.stringify(m.holes ?? []),
        JSON.stringify(m.params ?? {}),
        m.label ?? '',
        m.surfaceTags ? JSON.stringify(m.surfaceTags) : null,
        m.room ?? null,
        m.createdAt,
      );
    const insCl = db.prepare('INSERT INTO cctp_lots (project_id, code, name) VALUES (?, ?, ?)');
    for (const l of s.cctpLots) insCl.run(id, l.code, l.name);
    const insCa = db.prepare(
      'INSERT INTO cctp_articles (id, project_id, lot_code, code, title, kind, depth, body, localisation, suggested_unit, page, ord) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    for (const a of s.cctp) insCa.run(a.id, id, a.lotCode, a.code, a.title, a.kind, a.depth, a.body, a.localisation, a.suggestedUnit, a.page, a.order);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
