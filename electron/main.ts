// Application de bureau MétréPlan+ (Electron).
// Le serveur Express + SQLite tourne dans le processus principal, en local uniquement (127.0.0.1),
// et la fenêtre affiche l'interface qu'il sert. Aucun prérequis : Node.js est fourni par Electron.

import { app, BrowserWindow, dialog, Menu, shell } from 'electron';
import { join } from 'node:path';
import { startServer } from '../server/index';

// Port fixe de préférence : l'interface mémorise ses réglages (largeur du panneau DPGF, dernier projet)
// par adresse ; un port stable les conserve d'un lancement à l'autre.
const PORT_PREFERE = 47321;
const HOTE = '127.0.0.1';

let fenetre: BrowserWindow | null = null;
let adresse = '';

// Le module node:sqlite est stable dans les faits mais encore signalé « expérimental » par Node.
process.removeAllListeners('warning');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!fenetre) return;
    if (fenetre.isMinimized()) fenetre.restore();
    fenetre.focus();
  });
  app.whenReady().then(demarrer).catch((e: unknown) => {
    dialog.showErrorBox('MétréPlan+', `Le démarrage a échoué :\n${(e as Error)?.stack ?? String(e)}`);
    app.quit();
  });
  app.on('window-all-closed', () => app.quit());
}

async function demarrer() {
  const dataDir = process.env.METREPLAN_DATA ?? join(app.getPath('userData'), 'donnees');
  // Le dossier dist/ (interface compilée) est à la racine de l'application, à côté de dist-electron/.
  const distDir = join(app.getAppPath(), 'dist');
  const options = { dataDir, distDir, host: HOTE };
  let port: number;
  try {
    ({ port } = await startServer({ ...options, port: PORT_PREFERE }));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw e;
    ({ port } = await startServer({ ...options, port: 0 }));
  }
  adresse = `http://${HOTE}:${port}`;
  // L'interface a son propre menu (Fichier, Métré, DPGF…) : pas de barre de menus Windows en double.
  Menu.setApplicationMenu(null);
  ouvrirFenetre();
}

function ouvrirFenetre() {
  fenetre = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    title: 'MétréPlan+',
    icon: join(app.getAppPath(), 'build', 'icon.png'),
    backgroundColor: '#f4f6f8',
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false },
  });
  fenetre.once('ready-to-show', () => {
    fenetre?.maximize();
    fenetre?.show();
  });
  // Liens externes : navigateur par défaut ; l'application reste sur son adresse locale.
  fenetre.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(adresse)) void shell.openExternal(url);
    return { action: url.startsWith(adresse) ? 'allow' : 'deny' };
  });
  fenetre.webContents.on('will-navigate', (ev, url) => {
    if (!url.startsWith(adresse)) {
      ev.preventDefault();
      void shell.openExternal(url);
    }
  });
  // Exports Excel / PDF : boîte « Enregistrer sous » dans le dossier Documents.
  fenetre.webContents.session.on('will-download', (_ev, item) => {
    item.setSaveDialogOptions({ defaultPath: join(app.getPath('documents'), item.getFilename()) });
  });
  // Raccourcis usuels sans barre de menus : F5 recharger, F11 plein écran, F12 outils de diagnostic.
  fenetre.webContents.on('before-input-event', (ev, input) => {
    if (input.type !== 'keyDown' || !fenetre) return;
    const wc = fenetre.webContents;
    if (input.key === 'F5') wc.reload();
    else if (input.key === 'F11') fenetre.setFullScreen(!fenetre.isFullScreen());
    else if (input.key === 'F12') wc.toggleDevTools();
    else return;
    ev.preventDefault();
  });
  fenetre.on('closed', () => (fenetre = null));
  void fenetre.loadURL(adresse);
}
