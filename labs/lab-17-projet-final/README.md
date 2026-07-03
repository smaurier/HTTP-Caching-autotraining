# Lab 17 — Projet final : auditer et optimiser la chaîne de cache

> **Outcome :** à la fin, tu sais auditer la chaîne de cache complète d'une app réelle, poser la bonne stratégie par type de contenu, et **prouver** le gain (TTFB, LCP) avec `curl -I`, l'onglet Network de DevTools et Lighthouse.
> **Vrai outil :** un serveur Node natif (`node:http`, zéro dépendance) + `curl` + Chrome DevTools (Network + Lighthouse). PAS de harnais de test simulé.
> **Feedback :** le coach valide en session sur pièces à conviction — les sorties `curl`, les captures Network et les deux rapports Lighthouse avant/après. Il n'y a pas de test-runner auto-correcteur : l'oracle, c'est la **mesure**.

---

## Énoncé

On te livre `tribuzen-lab.mjs`, une version réduite de TribuZen. Elle **fonctionne** mais sa chaîne de cache n'a jamais été conçue : tout sort en `no-store`, aucun ETag, aucun `Cache-Control` sur les assets. C'est exactement la situation du §1 du module.

Ta mission, en 4 temps :

1. **Auditer** l'état initial (le « avant ») avec `curl -I` sur chaque route + l'onglet Network.
2. **Décider** la stratégie par route en appliquant la matrice de décision du module (§2.3).
3. **Implémenter** les en-têtes de cache + ETag + revalidation `304` dans le serveur.
4. **Prouver** le gain : re-`curl`, vérifier `x-cache: HIT` / `304` / `(disk cache)`, et comparer deux passes Lighthouse.

Le serveur simule un CDN en mémoire (comme dans les modules 08-09) pour que tu observes `x-cache: HIT/MISS` **en local**, sans déployer.

### Starter — `tribuzen-lab.mjs` (état AVANT, à optimiser)

Crée le fichier et lance-le avec `node tribuzen-lab.mjs`. Il écoute sur `http://localhost:3000`.

```js
// tribuzen-lab.mjs — TribuZen réduit, chaîne de cache NON optimisée (à corriger)
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

// --- "DB" simulée + latence origine ---
const sorties = {
  'rando-vercors': { nom: 'Rando Vercors', place: 12, date: '2026-08-15' },
  'kayak-ardeche': { nom: 'Kayak Ardèche', place: 8,  date: '2026-07-20' },
};
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// --- CDN en mémoire (observe x-cache en local) ---
const cdn = new Map(); // clé = pathname → { body, storedAt, sMaxAge, swr }
function cdnGet(key) {
  const e = cdn.get(key);
  if (!e) return null;
  const age = Math.floor((Date.now() - e.storedAt) / 1000);
  if (age <= e.sMaxAge) return { body: e.body, age, status: 'HIT' };
  if (age <= e.sMaxAge + e.swr) return { body: e.body, age, status: 'STALE' };
  cdn.delete(key);
  return null;
}
// NOTE starter : personne n'écrit jamais dans le CDN → il reste toujours vide.

const shell = (titre, corps) =>
  `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
   <meta name="viewport" content="width=device-width,initial-scale=1">
   <title>${titre} — TribuZen</title></head>
   <body><h1>${titre}</h1>${corps}</body></html>`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // --- Avatar (asset binaire simulé) ---
  if (url.pathname.startsWith('/avatars/')) {
    await wait(20);
    // ❌ AUCUN Cache-Control → re-téléchargé à chaque navigation
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
    res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="30" fill="#6d28d9"/></svg>`);
    return;
  }

  // --- Page sortie (semi-statique) ---
  if (url.pathname.startsWith('/sorties/')) {
    const id = url.pathname.split('/')[2];
    const s = sorties[id];
    if (!s) { res.writeHead(404); res.end('404'); return; }
    await wait(120); // latence origine (DB + rendu)
    const html = shell(s.nom, `<p>${s.place} places — le ${s.date}</p>
      <img src="/avatars/${id}.svg" width="64" height="64" alt="">`);
    // ❌ no-store : le CDN ne garde rien, chaque visiteur tape l'origine
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(html);
    return;
  }

  // --- API feed ---
  if (url.pathname === '/api/feed') {
    await wait(80);
    // ❌ aucun en-tête de cache → aller-retour complet à chaque retour d'onglet
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ items: Object.keys(sorties), ts: Date.now() }));
    return;
  }

  // --- Dashboard (données perso) ---
  if (url.pathname === '/dashboard') {
    await wait(60);
    const html = shell('Dashboard', `<p>Session ${Math.random().toString(36).slice(2, 8)}</p>`);
    // ✅ celle-ci est déjà correcte : perso → ne jamais cacher
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' });
    res.end(html);
    return;
  }

  res.writeHead(404); res.end('404');
});

server.listen(3000, () => console.log('AVANT → http://localhost:3000'));
```

---

## Étapes (en friction)

Tu produis toi-même chaque commande et chaque bloc de code. Ne saute pas l'audit « avant » : sans lui, tu ne pourras rien prouver.

1. **Capture l'état AVANT.** Lance le serveur, puis pour chaque route :
   ```bash
   curl -sI http://localhost:3000/sorties/rando-vercors
   curl -sI http://localhost:3000/avatars/rando-vercors.svg
   curl -sI http://localhost:3000/api/feed
   ```
   Note ce qui manque : pas d'`ETag`, pas de `s-maxage`, pas de `x-cache`, `no-store` là où il ne faut pas.
2. **Ouvre DevTools → Network**, recharge `/sorties/rando-vercors` deux fois. Observe que l'avatar sort en kB (jamais `(disk cache)`).
3. **Lance Lighthouse** (DevTools → onglet Lighthouse, mode Mobile / Slow 4G) sur `/sorties/rando-vercors`. Archive le rapport « avant » (note le LCP et le TTFB).
4. **Écris la fonction `etag(body)`** (`"` + md5 tronqué + `"`) et le helper `notModified(req, tag)` qui lit `if-none-match`.
5. **Écris `cdnSet(key, body, { sMaxAge, swr })`** et branche la lecture `cdnGet` **en tête** du handler des routes cachables (sortie) : si HIT/STALE, réponds avec `x-cache`, `age`, sans retaper l'origine.
6. **Applique la matrice** route par route (voir corrigé) : avatars `max-age=86400` ; page sortie `s-maxage=60, swr=600` + ETag + `304` ; feed `s-maxage=30, swr=300` ; dashboard **inchangé** (`private, no-store`).
7. **Capture l'état APRÈS.** Re-`curl` : la page sortie doit renvoyer un `ETag`, le 2ᵉ appel `x-cache: HIT` + `age`, et avec `-H 'If-None-Match: "..."'` un `304`. L'avatar doit passer `(disk cache)` dans Network.
8. **Re-lance Lighthouse.** Compare LCP/TTFB avant vs après. Écris une phrase de conclusion chiffrée.

**Critères de réussite (l'oracle) :**
- `curl -sI /sorties/rando-vercors` (2ᵉ appel) → `x-cache: HIT` + `age: N`.
- `curl -sI ... -H 'If-None-Match: "<etag>"'` → `HTTP/1.1 304`.
- Avatar en `(disk cache)` au 2ᵉ chargement dans DevTools Network.
- Dashboard **toujours** `private, no-store` (piège : ne pas le cacher par excès de zèle).
- Lighthouse « après » montre un TTFB et un LCP plus bas que « avant ».

---

## Corrigé complet commenté

```js
// tribuzen-lab.mjs — chaîne de cache OPTIMISÉE (APRÈS)
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

const sorties = {
  'rando-vercors': { nom: 'Rando Vercors', place: 12, date: '2026-08-15' },
  'kayak-ardeche': { nom: 'Kayak Ardèche', place: 8,  date: '2026-07-20' },
};
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// --- CDN en mémoire ---
const cdn = new Map();
function cdnGet(key) {
  const e = cdn.get(key);
  if (!e) return null;
  const age = Math.floor((Date.now() - e.storedAt) / 1000);
  if (age <= e.sMaxAge) return { body: e.body, age, status: 'HIT' };
  if (age <= e.sMaxAge + e.swr) return { body: e.body, age, status: 'STALE' };
  cdn.delete(key);
  return null;
}
// AJOUT : on écrit désormais dans le CDN → les hits deviennent possibles.
function cdnSet(key, body, { sMaxAge, swr }) {
  cdn.set(key, { body, storedAt: Date.now(), sMaxAge, swr });
}

// --- ETag : empreinte du corps → revalidation conditionnelle ---
function etag(body) {
  return '"' + createHash('md5').update(body).digest('hex').slice(0, 12) + '"';
}
function notModified(req, tag) {
  return req.headers['if-none-match'] === tag; // le client renvoie l'ETag qu'il détient
}

const shell = (titre, corps) =>
  `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
   <meta name="viewport" content="width=device-width,initial-scale=1">
   <title>${titre} — TribuZen</title></head>
   <body><h1>${titre}</h1>${corps}</body></html>`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // --- Avatar : immuable côté navigateur, long côté CDN ---
  if (url.pathname.startsWith('/avatars/')) {
    await wait(20);
    res.writeHead(200, {
      'Content-Type': 'image/svg+xml',
      // max-age (navigateur) + s-maxage (CDN). Change rarement → 1 jour / 1 semaine.
      'Cache-Control': 'public, max-age=86400, s-maxage=604800',
    });
    res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="30" fill="#6d28d9"/></svg>`);
    return;
  }

  // --- Page sortie : ISR-like (CDN cache court + SWR) + ETag ---
  if (url.pathname.startsWith('/sorties/')) {
    const id = url.pathname.split('/')[2];

    // 1) Le CDN répond-il ? (HIT/STALE) → on évite la latence origine
    const cached = cdnGet(url.pathname);
    if (cached) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=600',
        'X-Cache': cached.status,          // HIT ou STALE
        'Age': String(cached.age),         // secondes passées dans le CDN
        'ETag': etag(cached.body),
      });
      res.end(cached.body);
      return;
    }

    // 2) MISS → origine
    const s = sorties[id];
    if (!s) { res.writeHead(404); res.end('404'); return; }
    await wait(120);
    const html = shell(s.nom, `<p>${s.place} places — le ${s.date}</p>
      <img src="/avatars/${id}.svg" width="64" height="64" alt="">`);
    const tag = etag(html);

    // 2b) Revalidation conditionnelle : si le client a déjà cet ETag → 304 (corps vide)
    if (notModified(req, tag)) {
      res.writeHead(304, { 'ETag': tag });
      res.end();
      return;
    }

    // 3) On peuple le CDN pour les prochains visiteurs, puis on répond
    cdnSet(url.pathname, html, { sMaxAge: 60, swr: 600 });
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=600',
      'ETag': tag,
      'X-Cache': 'MISS',
    });
    res.end(html);
    return;
  }

  // --- API feed : cache partagé court + SWR ---
  if (url.pathname === '/api/feed') {
    await wait(80);
    const body = JSON.stringify({ items: Object.keys(sorties), ts: Date.now() });
    res.writeHead(200, {
      'Content-Type': 'application/json',
      // Tolère 30 s de fraîcheur ; SWR absorbe les pics de retour d'onglet
      'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=300',
    });
    res.end(body);
    return;
  }

  // --- Dashboard : INCHANGÉ. Données perso → jamais de cache partagé ---
  if (url.pathname === '/dashboard') {
    await wait(60);
    const html = shell('Dashboard', `<p>Session ${Math.random().toString(36).slice(2, 8)}</p>`);
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'Vary': 'Cookie, Authorization', // le cache ne doit pas mélanger les utilisateurs
    });
    res.end(html);
    return;
  }

  res.writeHead(404); res.end('404');
});

server.listen(3000, () => console.log('APRÈS → http://localhost:3000'));
```

**Pourquoi ce corrigé est correct :**
- La lecture `cdnGet` est **en tête** de la route sortie : un HIT renvoie la page sans payer les 120 ms d'origine → TTFB effondré → LCP en baisse.
- L'`ETag` + `304` économisent la bande passante quand le contenu n'a pas changé, même après expiration du cache navigateur.
- `stale-while-revalidate` sur la sortie et le feed : la version périmée part immédiatement, la revalidation se fait en fond → pas de cache stampede.
- Le dashboard reste `private, no-store` + `Vary` : le seul contenu personnalisé n'entre jamais dans un cache partagé. Le corriger « aussi » serait une **régression de sécurité** — c'est le piège du lab.

**Vérification (les preuves à montrer au coach) :**
```bash
curl -sI http://localhost:3000/sorties/rando-vercors            # 1er : X-Cache: MISS, ETag présent
curl -sI http://localhost:3000/sorties/rando-vercors            # 2e  : X-Cache: HIT, Age: N
curl -sI http://localhost:3000/sorties/rando-vercors \
     -H 'If-None-Match: "<colle-l-etag-ici>"'                   # → HTTP/1.1 304
curl -sI http://localhost:3000/avatars/rando-vercors.svg        # Cache-Control: max-age=86400
```

---

## Variante J+30 (fading)

**Même app, contraintes ajoutées, sans rouvrir ce corrigé ni le module :**

1. Ajoute une route `/api/purge?id=xxx` (POST) qui **invalide** l'entrée CDN de `/sorties/xxx` — et vérifie que l'ordre est correct (purger le CDN *après* avoir muté la « DB », pas avant).
2. Ajoute un en-tête `Server-Timing: origin;dur=<ms>` sur les MISS pour mesurer la latence origine réellement économisée sur les HIT.
3. Fais-le en **25 minutes**, et termine par une phrase chiffrée : « TTFB HIT = X ms vs MISS = Y ms, soit Z % de gain. »

**Critère de réussite :** après un `POST /api/purge?id=rando-vercors`, le `curl -I` suivant repasse `X-Cache: MISS`, et le `Server-Timing` du MISS montre les ~120 ms d'origine absents du HIT.

---

## Application TribuZen

Dans le repo `smaurier/tribuzen`, tu ne codes pas un serveur `node:http` — tu appliques la **même matrice** sur la vraie app Next.js :

```
tribuzen/
  app/
    sorties/[id]/page.tsx     ← export const revalidate = 60  (ISR)
    api/feed/route.ts         ← Response avec Cache-Control: s-maxage=30, swr=300
    (app)/dashboard/page.tsx  ← export const dynamic = 'force-dynamic' (private, no-store)
  next.config.js              ← headers() : Cache-Control immutable sur /_next/static
  docs/perf/
    lighthouse-avant.html     ← rapport archivé
    lighthouse-apres.html     ← rapport archivé (preuve du gain)
```

**Différences avec le lab :**
- Le CDN n'est plus simulé : c'est celui de l'hébergeur (Vercel/Cloudflare). Tu vérifies `x-cache`/`cf-cache-status` sur le domaine déployé, pas en local.
- L'ISR est déclaré par `export const revalidate` au lieu d'un `cdnSet` manuel — Next gère le SWR pour toi.
- La preuve reste la même : `curl -sI` sur l'URL de prod + deux rapports Lighthouse.

**Commit cible :**
```
perf(cache): chaîne de cache TribuZen — ISR sorties, s-maxage feed, immutable assets, LCP 4.1s→2.1s
```
