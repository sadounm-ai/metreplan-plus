# MétréPlan+ : guide d'installation

Guide pas à pas pour installer, lancer et mettre à jour MétréPlan+ sur son ordinateur, sans connaissances en informatique.

## En bref

MétréPlan+ s'installe en 20 à 30 minutes sur un ordinateur Windows, Mac ou Linux. Il suffit d'installer un seul logiciel gratuit (Node.js), de récupérer l'application et de taper quatre commandes.

Une fois installée, l'application fonctionne **sur votre ordinateur**, dans votre navigateur internet (Chrome, Edge ou Firefox). Vos projets, plans et DPGF restent chez vous : rien n'est envoyé sur internet.

Le principe à retenir : une **fenêtre noire** (l'« Invite de commandes ») fait tourner l'application. Tant qu'elle est ouverte, MétréPlan+ est accessible à l'adresse http://localhost:3001 dans votre navigateur. Quand vous la fermez, l'application s'arrête, et vos données restent enregistrées.

## Ce qu'il vous faut

Un seul logiciel est indispensable : **Node.js version 22.13 ou plus récente**. La base de données est intégrée à Node.js, il n'y a rien d'autre à installer ni à paramétrer.

| Élément | Minimum conseillé | Remarque |
| --- | --- | --- |
| Système | Windows 10 ou 11, macOS 12 ou plus, Linux récent | 64 bits |
| Mémoire | 8 Go | Les gros plans PDF en demandent davantage |
| Espace disque | 1 Go libre | Plus la place pour vos plans et projets |
| Navigateur | Chrome, Edge ou Firefox à jour | Safari fonctionne aussi sur Mac |
| Node.js | Version 22.13 ou plus (LTS conseillée) | Gratuit, sur [nodejs.org](https://nodejs.org/fr) |
| Git | Facultatif | Simplifie les mises à jour, sur [git-scm.com](https://git-scm.com) |
| Internet | Pendant l'installation | Ensuite, l'application fonctionne hors ligne |

Vous aurez aussi besoin de vous connecter à votre compte GitHub pour télécharger l'application depuis le dépôt [metreplan-plus](https://github.com/sadounm-ai/metreplan-plus).

**Le mot « commande »** désigne une ligne de texte que vous tapez (ou collez) dans la fenêtre noire, puis que vous validez avec la touche **Entrée**. Dans ce guide, chaque commande est dans un cadre gris : copiez-la telle quelle.

## Installation sous Windows

Comptez 20 minutes. Faites les étapes dans l'ordre, sans en sauter.

### Étape 1 : installer Node.js

1. Allez sur [nodejs.org/fr/download](https://nodejs.org/fr/download) et téléchargez l'**installateur Windows (.msi)** de la version **LTS** (version 22 ou plus récente).
2. Double-cliquez sur le fichier téléchargé, puis cliquez sur **Suivant** à chaque écran en gardant les options proposées. Acceptez la licence.
3. Si une case « Automatically install the necessary tools » apparaît, **laissez-la décochée** : elle est inutile pour MétréPlan+.
4. Cliquez sur **Install**, acceptez la demande d'autorisation de Windows, puis **Finish**.

### Étape 2 : vérifier Node.js

1. Ouvrez le menu Démarrer, tapez **cmd** et cliquez sur **Invite de commandes**. Une fenêtre noire s'ouvre.
2. Tapez la commande suivante, puis Entrée :

```
node -v
```

La fenêtre doit afficher un numéro comme `v22.13.0` ou plus (`v24.x` convient aussi). Si le message est « 'node' n'est pas reconnu », fermez la fenêtre, rouvrez-en une nouvelle et réessayez ; sinon redémarrez l'ordinateur.

Utilisez l'**Invite de commandes** plutôt que PowerShell : elle évite un message de sécurité fréquent sous Windows (voir Dépannage).

### Étape 3 : récupérer l'application

Choisissez **une** des deux méthodes.

**Méthode A, la plus simple (fichier ZIP)**

1. Connectez-vous sur [github.com](https://github.com) avec votre compte, puis ouvrez [github.com/sadounm-ai/metreplan-plus](https://github.com/sadounm-ai/metreplan-plus).
2. Cliquez sur le bouton vert **Code**, puis sur **Download ZIP**.
3. Dans vos Téléchargements, faites un clic droit sur `metreplan-plus-main.zip`, puis **Extraire tout**, et choisissez `C:\` comme destination.
4. Renommez le dossier obtenu `C:\metreplan-plus-main` en **`C:\MetrePlan`**.

**Méthode B, conseillée pour les mises à jour (Git)**

1. Installez Git depuis [git-scm.com/download/win](https://git-scm.com/download/win) en gardant toutes les options par défaut.
2. Ouvrez une **nouvelle** Invite de commandes et tapez :

```
git clone https://github.com/sadounm-ai/metreplan-plus C:\MetrePlan
```

Si une fenêtre de connexion GitHub s'ouvre, connectez-vous avec votre compte et autorisez l'accès.

### Étape 4 : installer et préparer l'application

Dans l'Invite de commandes, tapez ces trois commandes, une par une, en attendant la fin de chacune (le curseur clignote de nouveau après `C:\MetrePlan>`) :

```
cd /d C:\MetrePlan
npm install
npm run build
```

- `cd /d C:\MetrePlan` place la fenêtre dans le dossier de l'application.
- `npm install` télécharge les composants nécessaires (2 à 5 minutes). Des lignes « npm warn » ou « npm notice » peuvent apparaître : elles sont sans gravité.
- `npm run build` prépare l'interface (environ 30 secondes). Il se termine par une ligne « ✓ built in … ».

Ces trois commandes ne sont à faire qu'une fois (et après chaque mise à jour).

### Étape 5 : créer un raccourci de lancement (facultatif, recommandé)

Pour lancer MétréPlan+ d'un double-clic au lieu de taper des commandes :

1. Ouvrez le Bloc-notes et collez exactement ce texte :

```
@echo off
title MetrePlan+ (ne pas fermer pendant l'utilisation)
cd /d C:\MetrePlan
start "" cmd /c "timeout /t 6 >nul & start http://localhost:3001"
npm start
```

2. Menu **Fichier > Enregistrer sous**, choisissez le Bureau, dans « Type » choisissez **Tous les fichiers**, et nommez le fichier **`Lancer MetrePlan.bat`**.
3. Désormais, un double-clic sur ce fichier ouvre la fenêtre noire, démarre l'application et ouvre le navigateur au bout de quelques secondes.

## Installation sous macOS et Linux

Le principe est le même que sous Windows ; seule la fenêtre de commandes change : c'est l'application **Terminal**.

### macOS

1. Téléchargez l'installateur **macOS (.pkg)** de la version **LTS** sur [nodejs.org/fr/download](https://nodejs.org/fr/download), double-cliquez dessus et suivez les écrans.
2. Ouvrez le **Terminal** (Cmd + Espace, tapez « Terminal », Entrée) et vérifiez avec `node -v` (version 22.13 ou plus).
3. Récupérez l'application dans votre dossier personnel. Avec Git (macOS propose de l'installer au premier usage, acceptez) :

```
git clone https://github.com/sadounm-ai/metreplan-plus ~/MetrePlan
```

Sans Git : téléchargez le ZIP comme sous Windows (bouton **Code > Download ZIP**), double-cliquez dessus, puis déplacez le dossier dans votre dossier personnel et renommez-le **MetrePlan**.

4. Installez et préparez l'application :

```
cd ~/MetrePlan
npm install
npm run build
```

### Linux (Ubuntu, Debian)

La version de Node.js fournie par les dépôts de la distribution est souvent trop ancienne. Installez-la avec [nvm](https://github.com/nvm-sh/nvm), qui ne demande aucun droit administrateur :

```
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
```

Fermez et rouvrez le terminal, puis :

```
nvm install --lts
node -v
git clone https://github.com/sadounm-ai/metreplan-plus ~/MetrePlan
cd ~/MetrePlan
npm install
npm run build
```

### Lancer sous macOS et Linux

```
cd ~/MetrePlan
npm start
```

Puis ouvrez http://localhost:3001 dans le navigateur. Laissez le Terminal ouvert pendant l'utilisation.

## Lancer l'application et ouvrir le projet démo

### Lancer

Double-cliquez sur **Lancer MetrePlan.bat** sur le Bureau. Sans raccourci, ouvrez l'Invite de commandes et tapez :

```
cd /d C:\MetrePlan
npm start
```

La fenêtre noire affiche alors ces lignes (le numéro entre parenthèses varie) :

```
(node:4852) ExperimentalWarning: SQLite is an experimental feature and might change at any time
Projet de démonstration créé.
MétréPlan+ API sur http://localhost:3001
```

L'avertissement « ExperimentalWarning » est normal et sans conséquence. La ligne « Projet de démonstration créé » n'apparaît qu'au tout premier lancement.

Ouvrez votre navigateur à l'adresse **http://localhost:3001**. Astuce : ajoutez cette page à vos favoris.

### Ouvrir le projet de démonstration

1. La page d'accueil liste vos projets. Cliquez sur la ligne **Résidence Les Tilleuls**, marquée d'une étiquette « démo ».
2. Le projet s'ouvre : plans des fondations, du RDC et du R+1 au 1/100, CCTP gros œuvre, DPGF de 4 lots et mesures déjà saisies.
3. Cliquez sur une ligne du panneau DPGF à droite (par exemple le dallage) : ses mesures sont surlignées sur le plan.
4. La démo contient deux erreurs volontaires, que l'analyse de cohérence doit signaler. C'est un bon exercice pour une formation.

Vous pouvez modifier la démo librement. Le bouton **Réinitialiser la démo** de la page d'accueil la remet dans son état d'origine.

### Arrêter

Fermez la fenêtre noire (ou appuyez sur **Ctrl + C** dedans). Tout est enregistré automatiquement au fil du travail : il n'y a pas de bouton « Enregistrer » à utiliser avant de fermer.

### Où sont vos données

Tous vos projets, plans, CCTP et DPGF importés sont dans le dossier **`C:\MetrePlan\data`** (sur Mac et Linux : `~/MetrePlan/data`). Pour une sauvegarde, copiez ce dossier entier sur un disque externe ou un cloud, application arrêtée. Ne le supprimez jamais : vous perdriez tous vos projets.

## Mettre à jour l'application

Quand une nouvelle version est publiée sur GitHub (par exemple après la fusion d'une amélioration), commencez toujours par **arrêter l'application** et **sauvegarder le dossier `data`**.

### Si vous avez installé avec Git (méthode B)

Dans l'Invite de commandes :

```
cd /d C:\MetrePlan
git pull
npm install
npm run build
```

Relancez ensuite normalement. Vos projets sont conservés : le dossier `data` n'est jamais touché par la mise à jour.

### Si vous avez installé avec le ZIP (méthode A)

1. Renommez `C:\MetrePlan` en `C:\MetrePlan-ancien`.
2. Téléchargez le nouveau ZIP, extrayez-le dans `C:\` et renommez le dossier en `C:\MetrePlan`, comme à l'installation.
3. Copiez le dossier **`data`** de `C:\MetrePlan-ancien` dans `C:\MetrePlan`.
4. Tapez `cd /d C:\MetrePlan`, puis `npm install`, puis `npm run build`.
5. Relancez et vérifiez que vos projets sont là. Vous pouvez alors supprimer `C:\MetrePlan-ancien`.

Sur Mac et Linux, la mise à jour avec Git est identique, avec `cd ~/MetrePlan`.

## Dépannage courant

La plupart des problèmes viennent d'une version de Node.js trop ancienne, d'une étape oubliée ou d'une fenêtre noire fermée. Repérez le message affiché dans la première colonne.

| Ce que vous voyez | Cause | Solution |
| --- | --- | --- |
| « 'node' n'est pas reconnu en tant que commande interne… » | Node.js absent, ou fenêtre ouverte avant son installation | Fermez et rouvrez l'Invite de commandes ; sinon redémarrez le PC ou réinstallez Node.js |
| « l'exécution de scripts est désactivée sur ce système » | Vous êtes dans PowerShell | Utilisez l'Invite de commandes (cmd) |
| « No such built-in module: node:sqlite » ou « EBADENGINE » | Node.js plus ancien que 22.13 | Installez la dernière version LTS, puis refaites `npm install` |
| « EADDRINUSE … 3001 » | L'application tourne déjà dans une autre fenêtre, ou un autre logiciel occupe le port | Fermez l'autre fenêtre noire. Sinon tapez `set PORT=3002` puis `npm start`, et ouvrez http://localhost:3002 |
| « Ce site est inaccessible » dans le navigateur | Fenêtre noire fermée, ou application en cours de démarrage | Relancez l'application, attendez la ligne « API sur http://localhost:3001 », puis actualisez (F5) |
| « Cannot GET / » | L'étape `npm run build` n'a pas été faite | Arrêtez, tapez `npm run build`, relancez |
| « npm error » avec ECONNRESET, ETIMEDOUT ou proxy | Connexion internet coupée ou filtrée (réseau d'entreprise) | Relancez `npm install` ; sinon essayez depuis un autre réseau |
| « EPERM » ou « EBUSY » pendant `npm install` | Dossier synchronisé (OneDrive) ou antivirus qui bloque | Installez dans `C:\MetrePlan`, hors OneDrive ; relancez `npm install` |
| « Repository not found » avec `git clone` | Compte GitHub non connecté | Connectez-vous à GitHub quand la fenêtre le propose, ou utilisez le ZIP |
| Fenêtre « Pare-feu Windows » au premier lancement | Windows signale un programme qui écoute sur le réseau | Cliquez sur Annuler ; l'application reste accessible sur votre ordinateur |
| Le double-clic sur le .bat ouvre le Bloc-notes | Le fichier s'appelle en réalité `….bat.txt` | Ré-enregistrez en choisissant « Tous les fichiers » comme type |
| Projet démo modifié ou supprimé | Normal | Bouton **Réinitialiser la démo** sur la page d'accueil |

Si un problème persiste, faites une capture d'écran de la fenêtre noire entière et envoyez-la : le message d'erreur suffit en général à trouver la cause.
