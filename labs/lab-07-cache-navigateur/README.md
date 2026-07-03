# Lab 07 — Le cache du navigateur (memory/disk, heuristique, bfcache, purge)

> **Outcome :** à la fin, tu sais lire la source de chaque requête dans DevTools Network (`memory cache` / `disk cache` / réseau), prouver l'heuristique de fraîcheur sur une réponse sans en-tête, purger le cache proprement, et détecter une restauration bfcache en JS.
> **Vrai outil :** serveur **Express** (TypeScript, lancé avec `tsx`) + `curl -I` + **Chrome DevTools** (onglets Network **et** Application). Aucun harnais simulé, aucune assertion automatique.
> **Feedback :** le coach valide en session à partir de ce que **tu observes** (colonne Size de Network, panneau Application > Storage, logs console) — pas de test-runner auto-correcteur.

---

## Énoncé

Tu montes un mini-serveur qui reproduit, en local, les quatre comportements du cache navigateur du cours, puis tu les **observes** dans DevTools. Le but n'est pas d'écrire beaucoup de code : c'est de **savoir lire** DevTools et **provoquer** chaque comportement à volonté.

Cahier des charges — quatre routes, chacune sert à démontrer un point :

| Route | Sert à démontrer |
|---|---|
| `GET /assets/app.a1b2c3d4.js` | asset immutable → `(disk cache)` / `(memory cache)`, jamais re-téléchargé |
| `GET /api/config` | **heuristique de fraîcheur** : AUCUN `Cache-Control`, seulement `Last-Modified` |
| `GET /` (page HTML) | page compatible **bfcache** avec un badge à rafraîchir au retour |
| `GET /api/tick` | compteur qui s'incrémente à chaque hit réel du serveur (preuve d'un vrai aller-retour) |

**Contraintes :**
- Tu écris le serveur **complet** depuis le starter — pas de gap-fill.
- La route `/api/config` ne doit **poser aucun** `Cache-Control` ni `Expires` : uniquement `Last-Modified`. C'est ce qui déclenche l'heuristique.
- Tu dois **justifier oralement** en session : pourquoi `app.js` reste en cache au `F5`, pourquoi `/api/config` est caché *sans en-tête*, et ce que tu vois dans Application > Storage avant/après purge.

### Starter minimal

```bash
mkdir tribuzen-browser-cache-lab && cd tribuzen-browser-cache-lab
npm init -y
npm i express
npm i -D tsx typescript @types/node @types/express
```

```typescript
// server.ts — STARTER (à compléter)
import express from 'express';

const app = express();

// TODO 1 : /assets/app.a1b2c3d4.js -> public, max-age=31536000, immutable
// TODO 2 : /api/config             -> AUCUN Cache-Control, seulement Last-Modified (heuristique)
// TODO 3 : /                       -> page HTML compatible bfcache (badge + pageshow)
// TODO 4 : /api/tick               -> incrémente un compteur serveur, no-store

app.listen(3000, () => console.log('http://localhost:3000'));
```

```jsonc
// package.json — ajoute
{
  "scripts": { "dev": "tsx watch server.ts" }
}
```

Lance `npm run dev`, ouvre `http://localhost:3000` dans Chrome, puis DevTools (F12).

---

## Étapes (en friction)

1. **Asset immutable.** Écris la route `/assets/app.a1b2c3d4.js` avec `public, max-age=31536000, immutable`. Ouvre Network, recharge la page **deux fois**. Note la colonne **Size** de `app.a1b2c3d4.js` au 2ᵉ chargement : `(memory cache)` ou `(disk cache)` ? Ferme l'onglet, rouvre l'URL : la valeur change-t-elle ? Explique pourquoi (RAM éphémère vs disque persistant).
2. **Heuristique de fraîcheur.** Écris `/api/config` qui renvoie du JSON avec **seulement** un en-tête `Last-Modified` daté d'il y a longtemps (ex. 100 jours), **aucun** `Cache-Control`. Vérifie avec `curl -I` qu'il n'y a bien pas de `Cache-Control`. Dans le navigateur, `fetch('/api/config')` deux fois : la 2ᵉ est-elle servie du cache (`from disk cache` / `200 OK` sans hit serveur) alors que tu n'as posé aucune directive ? C'est l'heuristique (~10 % de l'âge du fichier).
3. **Prouve le hit serveur.** Écris `/api/tick` en `no-store` qui incrémente et renvoie un compteur en mémoire. Compare : `/api/tick` monte à chaque appel (vrai réseau), `/api/config` **stagne** tant qu'il est frais (servi du cache). Le compteur est ta preuve qu'aucune requête n'a atteint le serveur.
4. **bfcache.** Sur la page `/`, ajoute un badge qui affiche `Date.now()` et un lien vers une autre page (ou `history.back()` après navigation). Ajoute un listener `pageshow`. Navigue puis fais **Précédent** : le `pageshow` avec `event.persisted === true` se déclenche-t-il ? Vérifie dans **Application > Back/forward cache** que la page est éligible.
5. **Casse le bfcache, puis répare.** Ajoute `window.addEventListener('unload', () => {})`. Refais Précédent : la page est-elle encore restaurée du bfcache ? Regarde Application > Back/forward cache : le motif d'exclusion est listé. Remplace `unload` par `pagehide` → le bfcache revient.
6. **Purge.** Ouvre **Application > Storage**. Repère le disk cache et (s'il y en a) le Cache Storage. Clique **Clear site data**, recharge : `app.a1b2c3d4.js` repart-il du réseau (taille réelle) au lieu de `(disk cache)` ? Compare avec la case **Network > Disable cache** (effet tant que DevTools est ouvert, sans tout effacer).

---

## Corrigé complet commenté

```typescript
// server.ts — CORRIGÉ
import express from 'express';

const app = express();

// ── 1) ASSET IMMUTABLE ─────────────────────────────────────────
// Nom à hash (app.a1b2c3d4.js) + immutable : le navigateur ne revalide
// même pas au F5. Au 2e chargement, Network affiche (memory/disk cache).
app.get('/assets/app.a1b2c3d4.js', (_req, res) => {
  res.set('Content-Type', 'text/javascript');
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.send('console.log("bundle TribuZen chargé");');
});

// ── 2) HEURISTIQUE DE FRAÎCHEUR ────────────────────────────────
// AUCUN Cache-Control, AUCUN Expires : seulement Last-Modified daté
// d'il y a 100 jours. Le navigateur DEVINE une fraîcheur ≈ 10 % de
// (maintenant - Last-Modified) ≈ 10 jours. La 2e requête est donc
// servie du cache SANS qu'on ait posé la moindre directive.
app.get('/api/config', (_req, res) => {
  const centJoursMs = 100 * 24 * 60 * 60 * 1000;
  const lastModified = new Date(Date.now() - centJoursMs).toUTCString();
  res.set('Last-Modified', lastModified);
  // Pas de res.set('Cache-Control', ...) : c'est VOLONTAIRE.
  res.json({ theme: 'dark', locale: 'fr-FR' });
});

// ── 3) PAGE HTML COMPATIBLE bfcache ────────────────────────────
// no-cache (PAS no-store : no-store bloquerait le bfcache).
// Le badge affiche l'heure de rendu ; pageshow(persisted) la rafraîchit
// au retour "Précédent" sans recharger la page.
app.get('/', (_req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(`<!doctype html>
<html lang="fr">
<body>
  <h1>TribuZen — lab cache navigateur</h1>
  <p>Badge (heure de rendu) : <b id="badge"></b></p>
  <p><a href="https://example.com">Aller ailleurs</a>, puis clique Précédent.</p>
  <script src="/assets/app.a1b2c3d4.js"></script>
  <script>
    function paintBadge() {
      document.getElementById('badge').textContent = new Date().toLocaleTimeString();
    }
    paintBadge();

    // pageshow : persisted=true => la page revient du bfcache.
    // Le JS n'a PAS été ré-exécuté : on rafraîchit la donnée sensible au temps.
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        console.log('[bfcache] restauré depuis le Back-Forward Cache');
        paintBadge();
      }
    });

    // ✅ pagehide (et NON unload) : prépare la mise en bfcache sans le bloquer.
    window.addEventListener('pagehide', (event) => {
      console.log('[bfcache] page cachée, persisted =', event.persisted);
    });
  </script>
</body>
</html>`);
});

// ── 4) PREUVE DE HIT SERVEUR ───────────────────────────────────
// no-store => jamais caché => chaque appel atteint vraiment le serveur.
// Le compteur monte à chaque hit : si /api/config ne le fait PAS monter,
// c'est qu'il était servi du cache (heuristique).
let ticks = 0;
app.get('/api/tick', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ticks: ++ticks });
});

app.listen(3000, () => console.log('http://localhost:3000'));
```

**Pourquoi ce corrigé est correct :**
- `app.a1b2c3d4.js` en `immutable` : au 2ᵉ chargement, aucune requête réseau. Onglet resté ouvert → souvent `(memory cache)` ; après fermeture/réouverture → `(disk cache)`. C'est la démonstration directe des deux niveaux physiques.
- `/api/config` **sans** `Cache-Control` : le navigateur applique l'heuristique (~10 % de 100 jours ≈ 10 jours de fraîcheur) et sert la copie disque. Preuve que « pas d'en-tête » ≠ « pas de cache ».
- `/api/tick` en `no-store` sert d'**oracle** : son compteur monte à chaque vrai hit. En le comparant à `/api/config` (dont le body/valeur ne bouge pas et qui n'incrémente rien côté serveur), on prouve qu'une requête a bien été évitée.
- La page `/` est en `no-cache` (**pas** `no-store`, qui bloquerait le bfcache), sans listener `unload` → éligible au bfcache. `pageshow` + `event.persisted` rafraîchit le badge au retour.

**Vérification attendue avec `curl -I` :**
```
$ curl -I http://localhost:3000/assets/app.a1b2c3d4.js
Cache-Control: public, max-age=31536000, immutable

$ curl -I http://localhost:3000/api/config
Last-Modified: <date ~100 jours dans le passé>
# (aucune ligne Cache-Control — c'est le but)

$ curl -I http://localhost:3000/api/tick
Cache-Control: no-store
```

**Vérification attendue en DevTools :**
```
Network, après un 2e chargement de la page :
  /assets/app.a1b2c3d4.js   200   (memory cache | disk cache)   ← jamais re-téléchargé
  /api/config               200   (disk cache)                  ← heuristique, sans en-tête !
  /api/tick                 200   (réseau, taille réelle)       ← no-store, toujours réseau

Application > Back/forward cache :
  page /  ->  "Eligible"  (tant qu'il n'y a pas de listener unload)

Console, après un clic "Précédent" :
  [bfcache] restauré depuis le Back-Forward Cache
```

---

## Variante J+30 (fading)

**Même objectif, contraintes ajoutées — à reproduire de mémoire, sans rouvrir ce corrigé, en 25 minutes :**

1. Remplace `/api/config` (heuristique) par une version qui pose `Cache-Control: no-cache` et un `ETag`. Observe : la 2ᵉ requête part-elle en réseau ? Renvoie un `304` si le `If-None-Match` correspond, et vérifie dans Network que le body n'est **pas** re-téléchargé (statut `304`, petite taille). (Rappel module 05.)
2. Ajoute une deuxième page `/admin/membres` avec un badge « demandes en attente » chargé via `fetch('/api/tick')` au montage. Fais en sorte que le retour bfcache **rafraîchisse** ce badge (donc que le compteur reflète le vrai serveur), sans recharger la page.
3. Provoque volontairement une **exclusion bfcache** (ajoute un listener `unload`), constate le motif exact dans Application > Back/forward cache, puis corrige.

**Critères de réussite :**
- `/api/config` renvoie `304` au 2ᵉ appel identique (Network : statut 304, `Size` ≈ quelques centaines d'octets, pas le body complet).
- Au retour « Précédent » sur `/admin/membres`, la console logge la restauration bfcache **et** le badge affiche une valeur de `ticks` à jour.
- Le motif d'exclusion bfcache est nommé correctement (listener `unload`) et disparaît après passage à `pagehide`.

---

## Application TribuZen

Dans le repo `smaurier/tribuzen`, ces comportements se règlent à trois endroits :

```
tribuzen/
  vite.config.ts                 # hash de contenu sur les assets -> URLs immutables
  server/headers.ts              # Cache-Control immutable sur /assets, no-cache sur le HTML
                                 #   + JAMAIS de réponse sans Cache-Control (évite l'heuristique)
  src/lib/bfcache.ts             # helpers pageshow/pagehide, refresh des compteurs sensibles
  src/pages/MembersPage.tsx      # badge "demandes en attente" rafraîchi via pageshow(persisted)
```

**Différences par rapport au lab :**
- Le front est servi par **nginx/CDN**, pas par Express : `immutable` (assets) et `no-cache` (HTML) sont des blocs `location`, pas des `res.set`.
- On **interdit les réponses API sans `Cache-Control`** en production (un intercepteur NestJS pose `private, no-store` par défaut) — précisément pour ne jamais laisser l'heuristique décider à notre place.
- La restauration bfcache est branchée sur le store réel (badges de présence, compteurs de notifications), pas sur un simple horodatage.

**Commit cible :**
```
feat(front): assets immutables à hash + bfcache-safe pages (pageshow refresh, no unload)
chore(api): no réponse sans Cache-Control (private,no-store par défaut) — évite l'heuristique
```
