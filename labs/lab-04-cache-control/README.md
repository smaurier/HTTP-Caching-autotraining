# Lab 04 — Cache-Control par type de ressource

> **Outcome :** à la fin, tu sais poser le bon `Cache-Control` pour cinq types de ressource (asset à hash, HTML, annuaire public, profil privé, donnée sensible) sur un vrai serveur Express, et lire le résultat avec `curl -I` et l'onglet Network de Chrome DevTools.
> **Vrai outil :** serveur **Express** (TypeScript, lancé avec `tsx`) + `curl -I` + Chrome DevTools (onglet Network). Aucun harnais simulé, aucune assertion automatique.
> **Feedback :** le coach valide en session à partir de ce que tu observes (`curl -I` + colonne Size/Status de Network) — pas de test-runner auto-correcteur.

---

## Énoncé

Tu écris le serveur qui applique la stratégie de cache de TribuZen. Cahier des charges **exact** — cinq routes, chacune avec le `Cache-Control` correct :

| Route | Ressource | Cache-Control attendu |
|---|---|---|
| `GET /assets/app.a1b2c3d4.js` | asset à hash | `public, max-age=31536000, immutable` |
| `GET /` | `index.html` | `no-cache` |
| `GET /api/families` | annuaire public | `public, max-age=30, s-maxage=300` |
| `GET /api/profile` | profil utilisateur | `private, no-store` |
| `GET /api/bank` | donnée sensible | `no-store` |

**Contraintes :**
- Tu écris le serveur **complet** depuis le starter ci-dessous — pas de gap-fill.
- Aucune route ne doit poser `Expires` ni `Pragma` (HTTP/1.1 → interdit dans ce lab).
- On ne touche **pas** à `ETag` / `If-None-Match` / `304` ici : c'est le **module 05**. Ce lab porte uniquement sur les directives `Cache-Control`.
- Tu dois **justifier oralement** en session, pour chaque route : pourquoi `no-cache` OU `no-store`, et pourquoi `public` OU `private`.

### Starter minimal

```bash
mkdir tribuzen-cache-lab && cd tribuzen-cache-lab
npm init -y
npm i express
npm i -D tsx typescript @types/node @types/express
```

```typescript
// server.ts — STARTER (à compléter)
import express from 'express';

const app = express();

// TODO 1 : /assets/*.[hash].js|css -> public, max-age=31536000, immutable
// TODO 2 : '/' et '/index.html'    -> no-cache
// TODO 3 : '/api/families'         -> public, max-age=30, s-maxage=300
// TODO 4 : '/api/profile'          -> private, no-store
// TODO 5 : '/api/bank'             -> no-store

app.use((_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(404).send('Not found');
});

app.listen(3000, () => console.log('http://localhost:3000'));
```

```jsonc
// package.json — ajoute
{
  "scripts": { "dev": "tsx watch server.ts" }
}
```

Lance `npm run dev`, puis inspecte chaque route avec `curl -I http://localhost:3000/<route>` et dans DevTools > Network.

---

## Étapes (en friction)

1. **Asset à hash** — matche l'URL avec une regex sur le hash (`/\/assets\/.+\.[a-f0-9]{8}\.(js|css)$/`). Pose `public, max-age=31536000, immutable`. Dans Network, recharge : la 2ᵉ requête doit afficher `(memory cache)` / `(disk cache)`, taille non téléchargée.
2. **HTML `no-cache`** — pose `Cache-Control: no-cache` et renvoie un petit HTML qui référence `/assets/app.a1b2c3d4.js`. Vérifie avec `curl -I /` que l'en-tête est bien `no-cache` (et **pas** `no-store`).
3. **Annuaire public** — pose `public, max-age=30, s-maxage=300`. Prépare ta justification : pourquoi `s-maxage` (300) est plus long que `max-age` (30) ici.
4. **Profil privé** — pose `private, no-store`. Dans Network, un F5 rapide doit toujours re-télécharger (jamais `from cache`).
5. **Donnée sensible** — pose `no-store` seul. Confirme qu'aucune trace n'est mise en cache, réponse complète à chaque fois.
6. **Observe** : pour chaque route, `curl -I` pour l'en-tête brut, puis Network pour la colonne **Size** (`(disk cache)` vs téléchargement) et **Status**. Compare le comportement `immutable` (aucune requête au F5) vs `no-store` (re-téléchargé systématiquement).

---

## Corrigé complet commenté

```typescript
// server.ts — CORRIGÉ
import express from 'express';

const app = express();

// ── 1) ASSET À HASH ────────────────────────────────────────────
// Le nom contient un hash de 8 hexa (app.a1b2c3d4.js).
// immutable : le navigateur ne revalide même pas au rechargement.
// Sûr car si le contenu change, le build produit une NOUVELLE URL.
app.get(/\/assets\/.+\.[a-f0-9]{8}\.(js|css)$/, (req, res) => {
  res.set('Content-Type', req.path.endsWith('.js') ? 'text/javascript' : 'text/css');
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.send('console.log("bundle TribuZen");');
});

// ── 2) HTML : no-cache ─────────────────────────────────────────
// no-cache = STOCKÉ mais REVALIDÉ à chaque fois (≠ no-store).
// Le HTML reste toujours à jour et pointe vers les derniers hashes
// d'assets → pas de page blanche après déploiement.
// (Le mécanisme ETag/304 qui rend la revalidation légère = module 05.)
app.get(['/', '/index.html'], (_req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(
    '<!doctype html><html><body>' +
      '<h1>TribuZen</h1>' +
      '<script src="/assets/app.a1b2c3d4.js"></script>' +
      '</body></html>',
  );
});

// ── 3) ANNUAIRE PUBLIC : cache partagé long, navigateur court ──
// s-maxage=300 : le CDN garde 5 min (prioritaire sur max-age pour lui).
// max-age=30 : le navigateur ne fait confiance à sa copie que 30 s.
app.get('/api/families', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=30, s-maxage=300');
  res.json([{ id: 1, name: 'Les Dupont' }]);
});

// ── 4) PROFIL PRIVÉ : private + no-store ───────────────────────
// private : INTERDIT au cache partagé (un CDN ne resservira jamais
//           le profil d'Alice à Bob).
// no-store : et on ne l'écrit même pas sur le disque du navigateur.
app.get('/api/profile', (_req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json({ name: 'Alice', email: 'alice@tribuzen.app' });
});

// ── 5) DONNÉE SENSIBLE : no-store strict ───────────────────────
// Solde bancaire : aucune trace, nulle part. no-store SEUL suffit
// (pas de ceinture-et-bretelles Expires/Pragma en HTTP/1.1).
app.get('/api/bank', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ balance: 1234.56 });
});

// 404 : rien à cacher
app.use((_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(404).send('Not found');
});

app.listen(3000, () => console.log('http://localhost:3000'));
```

**Pourquoi ce corrigé est correct :**
- L'asset à hash reçoit `immutable` **parce que** son nom change avec son contenu — le cache-busting est automatique, aucun risque de servir un vieux bundle.
- Le HTML est en `no-cache` (revalidé, jamais `no-store`) : il reste toujours à jour et pointe vers les derniers hashes → pas de page blanche au déploiement.
- L'annuaire sépare `s-maxage` (CDN, 5 min) de `max-age` (navigateur, 30 s) : l'origine est protégée, l'utilisateur voit du frais.
- Le profil combine `private` (jamais de CDN) **et** `no-store` (rien sur disque) — deux protections distinctes pour une donnée personnelle.
- La donnée sensible utilise `no-store` seul : ni `no-cache` (qui stockerait !), ni empilement legacy inutile.

**Vérification attendue avec `curl -I` :**
```
$ curl -I http://localhost:3000/assets/app.a1b2c3d4.js
Cache-Control: public, max-age=31536000, immutable

$ curl -I http://localhost:3000/
Cache-Control: no-cache

$ curl -I http://localhost:3000/api/families
Cache-Control: public, max-age=30, s-maxage=300

$ curl -I http://localhost:3000/api/profile
Cache-Control: private, no-store

$ curl -I http://localhost:3000/api/bank
Cache-Control: no-store
```

**Vérification attendue en DevTools (Network), après un rechargement (F5) :**
```
/assets/app.a1b2c3d4.js   200   (disk cache)   0 ms   ← immutable, aucune requête réseau
/                          200   (réseau)               ← no-cache → revalidé/re-servi
/api/profile              200   (réseau)               ← no-store → re-téléchargé
/api/bank                 200   (réseau)               ← no-store → re-téléchargé
```

---

## Variante J+30 (fading)

**Même objectif, contraintes ajoutées — à reproduire de mémoire, sans rouvrir ce corrigé, en 25 minutes :**

1. Ajoute `GET /img/logo.png` (image publique **sans** hash dans le nom) : trouve le `Cache-Control` correct (indice : pas `immutable`, pas 1 an).
2. Ajoute `GET /api/report` qui doit rester servi **même si l'origine tombe en panne** : ajoute la directive de résilience adéquate.
3. Modifie la route `/` pour logger la valeur de `req.headers['cache-control']` reçue en **requête**, puis fais un `Ctrl+Shift+R` (hard refresh) dans le navigateur et explique ce que le navigateur envoie.
4. **Sans regarder** le module 04 ni ce corrigé.

**Critères de réussite :**
- `/img/logo.png` → `public, max-age=86400` (pas `immutable` : sans hash, on ne peut pas figer 1 an).
- `/api/report` → contient `stale-if-error=86400`.
- Le hard refresh logge `cache-control: no-cache` côté requête (c'est le navigateur qui parle, pas le serveur).

---

## Application TribuZen

Dans le repo `smaurier/tribuzen`, cette stratégie vit à trois endroits :

```
tribuzen/
  infra/nginx.conf                              # assets immutables + index.html no-cache
  api/src/common/cache-control.interceptor.ts   # private, no-store par défaut (routes auth)
  api/src/families/families.controller.ts       # opt-in public, s-maxage sur l'annuaire
```

**Différences par rapport au lab :**
- Le front est servi par **nginx/CDN**, pas par Express : les règles `immutable` (assets) et `no-cache` (HTML) sont des blocs `location` nginx, pas des `res.set`.
- Côté API, un **intercepteur NestJS** pose `private, no-store` par défaut sur toute route authentifiée ; les routes publiques opt-in explicitement avec `@Header('Cache-Control', 'public, s-maxage=300, ...')`.
- La revalidation légère du HTML (ETag → 304) est gérée nativement par le serveur statique — tu la construiras à la main au **module 05** pour comprendre le mécanisme.

**Commit cible :**
```
feat(infra): Cache-Control — assets immutables à hash + index.html no-cache
feat(api): intercepteur private,no-store par défaut + opt-in public s-maxage sur l'annuaire
```
