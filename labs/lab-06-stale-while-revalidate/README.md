# Lab 06 — Stale-while-revalidate et stale-if-error

> **Outcome :** à la fin, tu sais poser une politique `Cache-Control: max-age + stale-while-revalidate + stale-if-error` sur un vrai serveur Express, la lire avec `curl -I`, et écrire le **moteur de cache aval** (le rôle joué par le navigateur/CDN) qui sert le stale immédiatement, revalide en tâche de fond, et bascule sur le stale quand l'origine tombe.
> **Vrai outil :** serveur **Express** (TypeScript, lancé avec `tsx`) + `curl -I` + Chrome DevTools (onglet Network) + un module Node `swr-cache.mjs` que tu exécutes avec `node`. Aucun harnais simulé, aucune assertion automatique.
> **Feedback :** le coach valide en session à partir de ce que tu observes (`curl -I` + la trace `cacheStatus` imprimée par ton moteur) — pas de test-runner auto-correcteur.

---

## Énoncé

Deux livrables, dans l'ordre.

**Partie A — le serveur d'origine (Express).** Il ne *fait pas* le SWR : il **déclare la politique** dans l'en-tête. Cahier des charges exact :

| Route | Ressource | Cache-Control attendu |
|---|---|---|
| `GET /api/families/:id/activities` | liste d'activités (tolère un décalage) | `max-age=60, stale-while-revalidate=300, stale-if-error=86400` |
| `GET /api/checkout/total` | montant à payer (sensible) | `no-store` |

La route activités doit aussi poser un **ETag fort** (module 05) et répondre `304` si la revalidation arrive avec un `If-None-Match` qui matche.

**Partie B — le moteur de cache aval (`swr-cache.mjs`).** C'est le rôle du navigateur/CDN : lire la politique et l'**appliquer**. Il doit gérer les quatre cas :

1. **MISS** (rien en cache) → attend l'origine (bloquant).
2. **HIT (fresh)** (`age < max-age`) → sert direct, zéro réseau.
3. **HIT (stale, revalidating)** (`max-age ≤ age < max-age + swr`) → sert le stale **immédiatement** + revalide **en tâche de fond, sans `await`**.
4. **HIT (stale-if-error)** → si, hors fenêtre SWV, la revalidation échoue (5xx/timeout) et qu'on est encore dans la fenêtre `stale-if-error`, sert le stale au lieu de propager l'erreur.

**Contraintes :**
- Tu écris les deux fichiers **complets** depuis les starters — pas de gap-fill.
- Le fetch de revalidation en arrière-plan ne doit **jamais** être `await`é (c'est tout l'intérêt du SWR).
- Les fenêtres SWV et SIE se comptent **à partir de la fin du `max-age`**, pas du stockage.
- Tu dois **justifier oralement** en session : pourquoi la route activités est en SWR mais `/api/checkout/total` en `no-store`.

### Starter minimal

```bash
mkdir tribuzen-swr-lab && cd tribuzen-swr-lab
npm init -y
npm i express
npm i -D tsx typescript @types/node @types/express
```

```typescript
// server.ts — STARTER (Partie A, à compléter)
import express from 'express';
import crypto from 'node:crypto';

const app = express();

const activities: Record<string, { id: string; title: string; date: string }[]> = {
  '42': [
    { id: 'a1', title: 'Pique-nique parc', date: '2026-07-12' },
    { id: 'a2', title: 'Ciné en famille', date: '2026-07-15' },
  ],
};

// TODO 1 : GET /api/families/:id/activities
//   - calcule un ETag fort (sha256 tronqué) du corps JSON
//   - si If-None-Match matche -> 304 + REPOSE le Cache-Control complet
//   - sinon -> 200 + ETag + Cache-Control: max-age=60, stale-while-revalidate=300, stale-if-error=86400

// TODO 2 : GET /api/checkout/total -> no-store (jamais de SWR sur un montant)

app.listen(3000, () => console.log('http://localhost:3000'));
```

```jsonc
// package.json — ajoute
{ "scripts": { "dev": "tsx watch server.ts" } }
```

Lance `npm run dev`, puis inspecte avec `curl -I http://localhost:3000/api/families/42/activities`.

---

## Étapes (en friction)

1. **Route activités (200)** — sérialise la liste, calcule l'ETag fort, pose `Cache-Control: max-age=60, stale-while-revalidate=300, stale-if-error=86400`. Vérifie avec `curl -I` que l'en-tête et l'`ETag` sortent bien.
2. **Revalidation 304** — relis l'ETag renvoyé, renvoie une 2ᵉ requête avec `curl -I -H 'If-None-Match: "<etag>"' …` : tu dois obtenir `304 Not Modified` **et** le `Cache-Control` reposé (il relance les timers du cache aval).
3. **Route checkout `no-store`** — pose `no-store`, prépare ta justification : pourquoi un montant ne tolère jamais de stale.
4. **Moteur aval** — écris `swr-cache.mjs` (starter ci-dessous) qui applique la politique. La revalidation en arrière-plan est `fire-and-forget` (pas d'`await`).
5. **Trace temps** — dans `swr-cache.mjs`, simule le passage du temps en trichant sur `storedAt`, et imprime le `cacheStatus` à chaque `get` : tu dois voir `MISS → HIT (fresh) → HIT (stale, revalidating) → HIT (stale-if-error)`.
6. **Panne** — fais échouer `fetchOrigin` (rejette une Promise) une fois la copie stale, et vérifie que le moteur renvoie `HIT (stale-if-error)` tant qu'on est sous `max-age + sie`, puis `throw` au-delà.

```js
// swr-cache.mjs — STARTER (Partie B, à compléter)
const store = new Map(); // key -> { body, etag, storedAt, maxAge, swr, sie }

// TODO revalidateInBackground(key, fetchOrigin) : NON awaité, .catch ignoré
// TODO get(key, fetchOrigin) : gère MISS / fresh / stale-revalidating / stale-if-error

export { store };
```

---

## Corrigé complet commenté

### Partie A — `server.ts`

```typescript
// server.ts — CORRIGÉ (origine : DÉCLARE la politique, ne fait pas le SWR)
import express from 'express';
import crypto from 'node:crypto';

const app = express();

const activities: Record<string, { id: string; title: string; date: string }[]> = {
  '42': [
    { id: 'a1', title: 'Pique-nique parc', date: '2026-07-12' },
    { id: 'a2', title: 'Ciné en famille', date: '2026-07-15' },
  ],
};

// La politique complète, dans une constante : on la REPOSE aussi sur le 304
// pour que le cache aval réarme ses timers (max-age / swr / sie).
const ACTIVITIES_CC = 'max-age=60, stale-while-revalidate=300, stale-if-error=86400';

function strongEtag(body: string): string {
  const hash = crypto.createHash('sha256').update(body).digest('hex').slice(0, 16);
  return `"${hash}"`;
}

// ── 1) LISTE D'ACTIVITÉS : SWR + stale-if-error ────────────────
// Contenu qui tolère 1-5 min de décalage → SWR = latence 0 perçue.
// stale-if-error → l'app affiche encore la liste si l'API tombe.
app.get('/api/families/:id/activities', (req, res) => {
  const list = activities[req.params.id];
  if (!list) {
    res.set('Cache-Control', 'no-store'); // une 404 ne se cache pas ici
    return res.status(404).json({ error: 'famille inconnue' });
  }

  const body = JSON.stringify(list);
  const etag = strongEtag(body);

  // La revalidation SWR (déclenchée par le cache aval) arrive avec If-None-Match.
  const inm = req.headers['if-none-match'];
  if (inm && inm.split(',').map((s) => s.trim()).includes(etag)) {
    res.set('ETag', etag);
    res.set('Cache-Control', ACTIVITIES_CC); // REPOSE la politique → réarme les timers
    return res.status(304).end();            // 304 : pas de corps, la copie aval reste bonne
  }

  res.set('ETag', etag);
  res.set('Cache-Control', ACTIVITIES_CC);
  res.type('application/json').send(body);
});

// ── 2) MONTANT À PAYER : no-store strict ───────────────────────
// Un montant périmé induirait une décision erronée → JAMAIS de SWR.
app.get('/api/checkout/total', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ currency: 'EUR', amount: 42.9 });
});

app.listen(3000, () => console.log('http://localhost:3000'));
```

### Partie B — `swr-cache.mjs`

```js
// swr-cache.mjs — CORRIGÉ (aval : APPLIQUE la politique, rôle du navigateur/CDN)
const store = new Map(); // key -> { body, etag, storedAt, maxAge, swr, sie }

// Revalidation en arrière-plan : fire-and-forget. JAMAIS awaité.
function revalidateInBackground(key, fetchOrigin) {
  fetchOrigin(store.get(key)?.etag)
    .then((fresh) => {
      const entry = store.get(key);
      if (!entry) return;
      if (fresh.status === 304) {
        entry.storedAt = Date.now();          // inchangé : on réarme juste les timers
      } else {
        store.set(key, { ...entry, body: fresh.body, etag: fresh.etag, storedAt: Date.now() });
      }
    })
    .catch(() => {
      /* échec ignoré : stale-if-error gère la LECTURE bloquante, pas ce fetch de fond */
    });
}

// Retourne { body, cacheStatus } — immédiat du point de vue de l'utilisateur.
async function get(key, fetchOrigin) {
  const entry = store.get(key);
  const now = Date.now();

  // 1) MISS : rien en cache → on attend l'origine (bloquant).
  if (!entry) {
    const fresh = await fetchOrigin(null);
    store.set(key, {
      body: fresh.body, etag: fresh.etag, storedAt: now,
      maxAge: 60_000, swr: 300_000, sie: 86_400_000, // en ms, calqués sur l'en-tête
    });
    return { body: fresh.body, cacheStatus: 'MISS' };
  }

  const age = now - entry.storedAt;

  // 2) FRESH : servi direct, zéro réseau.
  if (age < entry.maxAge) {
    return { body: entry.body, cacheStatus: 'HIT (fresh)' };
  }

  // 3) FENÊTRE SWV : sert le stale IMMÉDIAT + revalide en fond (pas d'await).
  //    Fenêtre comptée à partir de la FIN du max-age.
  if (age < entry.maxAge + entry.swr) {
    revalidateInBackground(key, fetchOrigin); // <- fire-and-forget = latence 0 perçue
    return { body: entry.body, cacheStatus: 'HIT (stale, revalidating)' };
  }

  // 4) HORS SWV : revalidation bloquante, avec filet stale-if-error.
  try {
    const fresh = await fetchOrigin(entry.etag);
    if (fresh.status !== 304) {
      store.set(key, { ...entry, body: fresh.body, etag: fresh.etag, storedAt: now });
    } else {
      entry.storedAt = now;
    }
    return { body: store.get(key).body, cacheStatus: 'MISS (revalidated)' };
  } catch {
    // Origine DOWN (5xx/timeout) : SIE autorise le stale jusqu'à max-age + sie.
    if (age < entry.maxAge + entry.sie) {
      return { body: entry.body, cacheStatus: 'HIT (stale-if-error)' };
    }
    throw new Error('origine down et hors fenêtre stale-if-error');
  }
}

// ── Démo : on triche sur storedAt pour traverser les 4 phases sans attendre ──
async function demo() {
  const key = '/api/families/42/activities';
  let originUp = true;
  // fetchOrigin simulé : renvoie 200 si up, rejette si down.
  const fetchOrigin = async (etag) => {
    if (!originUp) throw new Error('ECONNREFUSED');
    return { status: etag ? 304 : 200, body: '[{"id":"a1"}]', etag: '"abc123"' };
  };

  console.log(await get(key, fetchOrigin)); // MISS
  console.log(await get(key, fetchOrigin)); // HIT (fresh)

  // On vieillit l'entrée de 90 s → dans la fenêtre SWV (60 ≤ 90 < 360).
  store.get(key).storedAt -= 90_000;
  console.log(await get(key, fetchOrigin)); // HIT (stale, revalidating)

  // On coupe l'origine et on vieillit au-delà de la fenêtre SWV (400 s).
  originUp = false;
  store.get(key).storedAt -= 310_000; // total ~400 s > 360 s → hors SWV
  console.log(await get(key, fetchOrigin)); // HIT (stale-if-error)
}

demo();

export { store, get };
```

**Pourquoi ce corrigé est correct :**
- **Le serveur ne fait pas le SWR** : il pose l'en-tête, point. C'est `swr-cache.mjs` (le rôle du navigateur/CDN) qui décide de servir le stale et de revalider. Le serveur ne voit qu'un `GET` normal (avec `If-None-Match`) quand la revalidation arrive.
- **`revalidateInBackground` n'est pas `await`é** dans le cas 3 : l'utilisateur reçoit `entry.body` immédiatement, le fetch continue derrière → latence 0 perçue. C'est le cœur du SWR.
- **Les fenêtres partent de la fin du `max-age`** : cas 3 teste `age < maxAge + swr`, cas 4 (SIE) teste `age < maxAge + sie`. Pas `age < swr`.
- **SIE n'agit que sur échec bloquant** (le `catch` du cas 4), pas sur le fetch de fond (dont l'échec est silencieusement ignoré) : la lecture est protégée, mais on ne masque pas une erreur qu'on n'attendait pas.
- **`/api/checkout/total` en `no-store`** : un montant stale ferait payer le mauvais prix — SWR y est interdit.

**Vérification attendue avec `curl` :**
```
$ curl -I http://localhost:3000/api/families/42/activities
Cache-Control: max-age=60, stale-while-revalidate=300, stale-if-error=86400
ETag: "…16 hexa…"

# 2e requête avec l'ETag → 304, en-tête reposé
$ curl -I -H 'If-None-Match: "…16 hexa…"' http://localhost:3000/api/families/42/activities
HTTP/1.1 304 Not Modified
Cache-Control: max-age=60, stale-while-revalidate=300, stale-if-error=86400

$ curl -I http://localhost:3000/api/checkout/total
Cache-Control: no-store
```

**Trace attendue du moteur (`node swr-cache.mjs`) :**
```
{ body: '…', cacheStatus: 'MISS' }
{ body: '…', cacheStatus: 'HIT (fresh)' }
{ body: '…', cacheStatus: 'HIT (stale, revalidating)' }
{ body: '…', cacheStatus: 'HIT (stale-if-error)' }
```

> **Observer le SWR dans un vrai navigateur.** Chrome n'applique pas encore `stale-while-revalidate` sur toutes les plateformes — pour le *voir*, un CDN (module 08) est le terrain le plus fiable. En attendant, DevTools > Network te montre déjà, sur la route activités, la revalidation en `304` (colonne Size très petite, Status `304`) : c'est la brique que le SWR déclenche en arrière-plan.

---

## Variante J+30 (fading)

**Même objectif, contraintes ajoutées — à reproduire de mémoire, sans rouvrir ce corrigé, en 25 minutes :**

1. Dans `swr-cache.mjs`, ajoute un compteur `originCalls` incrémenté à **chaque** appel réel à `fetchOrigin`. Démontre, via la trace, que deux `get` rapprochés dans la fenêtre SWV ne déclenchent **qu'une seule** revalidation de fond (indice : mémorise un flag `revalidating` par entrée).
2. Ajoute une route `GET /api/families` (annuaire) en `max-age=30, stale-while-revalidate=120` — **sans** `stale-if-error`. Explique en une phrase ce qui change côté résilience quand l'API tombe.
3. Écris à la main la ligne de temps de `max-age=45, stale-while-revalidate=90, stale-if-error=3600` : à `t=100 s`, dans quelle phase est-on ? À `t=200 s` avec origine down ?
4. **Sans regarder** le module 06 ni ce corrigé.

**Critères de réussite :**
- Deux `get` rapprochés en fenêtre SWV → `originCalls` n'augmente que de 1 (dédoublonnage de la revalidation).
- `/api/families` sans SIE → si l'API tombe une fois la copie stale et hors fenêtre SWV, l'utilisateur reçoit une **erreur** (pas de filet).
- `t=100 s` → **fenêtre SWV** (45 ≤ 100 < 45+90=135) ; `t=200 s` origine down → **stale-if-error** (hors SWV mais 200 < 45+3600=3645).

---

## Application TribuZen

Dans le repo `smaurier/tribuzen`, cette politique vit côté serveur d'API :

```
tribuzen/src/server/
  routes/
    families.list.ts        # GET /families                -> max-age + SWR + SIE
    families.activities.ts  # GET /families/:id/activities -> max-age + SWR + SIE
  lib/
    cacheControl.ts         # helper qui assemble la politique (fresh/swr/sie)
```

**Différences par rapport au lab :**
- Le **moteur SWR aval** que tu écris ici (`swr-cache.mjs`) n'existe pas dans TribuZen : c'est le **CDN** (module 08) et le **navigateur** qui l'appliquent nativement. Tu le codes au lab uniquement pour *comprendre* ce qu'ils font de l'en-tête.
- Côté API, `cacheControl.ts` centralise la politique dans un helper (`swrPolicy({ fresh: 60, swr: 300, sie: 86400 })`) au lieu de chaînes en dur, pour rester cohérent entre routes.
- Le **front React** ajoutera par-dessus le SWR **applicatif** (TanStack Query, cours React module 23) : `staleTime` aligné sur le `max-age`, `refetchOnWindowFocus`. Les deux couches se cumulent — CDN pour la latence réseau, lib pour la latence entre navigations.

**Commit cible :**
```
feat(api): Cache-Control SWR — max-age+stale-while-revalidate+stale-if-error sur les listes
```
