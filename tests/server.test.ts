import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDb, getProjectState, listProjects, saveProjectState } from '../server/db';
import { seedDemo } from '../server/seed';
import { analyseCoherence } from '../shared/coherence';

describe('base de données et projet de démonstration', () => {
  it('crée la démo, la relit et enregistre une modification', async () => {
    const db = openDb(':memory:');
    const id = await seedDemo(db, mkdtempSync(join(tmpdir(), 'mp-')));
    expect(listProjects(db)[0].isDemo).toBe(true);
    const s = getProjectState(db, id)!;
    expect(s.pages).toHaveLength(3);
    expect(s.measures.length).toBeGreaterThan(10);
    const kinds = new Set(analyseCoherence(s).map((i) => i.kind));
    expect(kinds).toContain('cctp-absent-dpgf');
    expect(kinds).toContain('unite-incoherente');
    expect(kinds).toContain('ecart-quantite');
    saveProjectState(db, id, { ...s, measures: s.measures.slice(1), project: { ...s.project, name: 'Renommé' } });
    const s2 = getProjectState(db, id)!;
    expect(s2.measures).toHaveLength(s.measures.length - 1);
    expect(s2.project.name).toBe('Renommé');
  });
});
