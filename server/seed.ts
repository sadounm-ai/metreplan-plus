// Création du projet de démonstration (plans + CCTP générés, DPGF et mesures fictives).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parseCctp } from '../shared/cctpParser';
import { uid } from '../shared/ids';
import { documentLines } from '../shared/pdfText';
import { buildDemoCctp, buildDemoPlans, buildDemoState } from './demo';
import * as store from './db';

export async function seedDemo(db: store.DB, filesDir: string): Promise<string> {
  const p = store.createProject(db, { id: uid('prj'), name: 'Démo — Résidence Les Tilleuls', phase: 'DCE', isDemo: true });
  const dir = join(filesDir, p.id);
  mkdirSync(dir, { recursive: true });
  const plans = await buildDemoPlans();
  const cctpPdf = await buildDemoCctp();
  const now = new Date().toISOString();
  const planDoc = { id: uid('doc'), kind: 'plan' as const, fileName: 'Tilleuls_Plans_DCE_indA.pdf', pageCount: 3, uploadedAt: now };
  const cctpDoc = { id: uid('doc'), kind: 'cctp' as const, fileName: 'Tilleuls_CCTP_Lot01_GO.pdf', pageCount: 0, uploadedAt: now };
  writeFileSync(join(dir, `${planDoc.id}.pdf`), plans);
  writeFileSync(join(dir, `${cctpDoc.id}.pdf`), cctpPdf);
  const pdf = await getDocument({ data: new Uint8Array(cctpPdf), verbosity: 0 }).promise;
  cctpDoc.pageCount = pdf.numPages;
  const parsed = parseCctp(await documentLines(pdf));
  store.addDocument(db, p.id, { ...planDoc, path: join(dir, `${planDoc.id}.pdf`) });
  store.addDocument(db, p.id, { ...cctpDoc, path: join(dir, `${cctpDoc.id}.pdf`) });
  store.saveProjectState(db, p.id, buildDemoState(planDoc.id, parsed.articles));
  return p.id;
}
