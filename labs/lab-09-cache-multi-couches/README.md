# Lab 09 — Cache multi-couches : tracer, invalider en cascade, désamorcer un stampede

> **Outcome :** à la fin, tu sais monter une pile de caches (reverse proxy → app cache → base), **tracer une requête** couche par couche avec `curl -I` en lisant `X-Cache`/`Age`, provoquer puis **désamorcer un cache stampede** avec du single-flight, et orchestrer une **invalidation en cascade** inside-out après une mutation.
> **Vrai outil :** Node.js (`node:http`, aucune dépendance) + `curl -I` + l'onglet Network/Application de DevTools. Aucun harnais de test simulé.
> **Feedback :** le coach valide en session en lisant les traces `curl` avec toi — pas de test-runner auto-correcteur.

---

## Énoncé

Tu construis une maquette de la chaîne de cache de TribuZen pour la fiche d'une sortie familiale `/api/activities/:id`. La pile que tu vas coder :

```
curl / navigateur  -->  Reverse proxy (Node)  -->  App cache (Map + TTL)  -->  "Base" (Map lente)
     couche 1              couche 3                    couche 4                    source
```

Le CDN (couche 2) et le cache navigateur (couche 1) ne sont pas codés : tu les **observes** en fin de lab avec `curl -I` (en-têtes `Cache-Control`/`s-maxage`/`Surrogate-Key`) et DevTools (`from disk cache`, module 07). Le cœur du lab est l'orchestration des couches 3-4-5.

Cahier des charges **exact** :

1. **`GET /api/activities/:id`** traverse reverse proxy → app cache → base. Chaque réponse porte :
   - `Cache-Control: public, max-age=30, s-maxage=120` (pour le navigateur et le futur CDN) ;
   - `Surrogate-Key: activity-<id> activities` (pour la purge par tag au CDN) ;
   - `X-Cache` estampillant **où** la requête a fait HIT : `HIT (proxy)`, `MISS (app -> db)`, ou `HIT (app)` ;
   - `Age` = secondes depuis la mise en cache proxy (0 si servi frais depuis la source).
2. **La base est lente** : 200 ms par lecture (simule une requête SQL coûteuse). C'est ce qui rend le stampede visible.
3. **`PUT /api/activities/:id`** met à jour la base **puis** déclenche une **invalidation en cascade inside-out** : base → app cache → reverse proxy (→ log d'un `PURGE` CDN, non codé). Après un `PUT`, le prochain `GET` doit repartir de la base (`X-Cache: MISS (app -> db)`).
4. **Anti-stampede** : la lecture depuis la base passe par un **single-flight** (request coalescing). Sous N requêtes concurrentes sur une clé absente, la base ne doit être appelée **qu'une seule fois**.

**Pas de gap-fill** — tu écris `layers.js` complet à partir du starter minimal.

### Starter minimal

Crée `layers.js` (rien à installer, Node 18+) :

```js
// layers.js — starter. À compléter selon le cahier des charges.
import { createServer } from 'node:http';

const db = new Map([['42', { id: '42', title: 'Pique-nique au parc', meetAt: '18:00' }]]);
const appCache = new Map();   // clé métier -> { value, expiresAt }
const proxyCache = new Map(); // URL -> { body, headers, storedAt, expiresAt }
const inflight = new Map();   // clé métier -> Promise (single-flight)

let dbReads = 0; // compteur pour PROUVER l'anti-stampede

// À toi : readFromDb (lent, compté), single-flight, readActivity,
//         cascadeInvalidate, et le serveur HTTP GET/PUT.

createServer((req, res) => {
  res.writeHead(501);
  res.end('à implémenter');
}).listen(3000, () => console.log('http://localhost:3000'));
```

Lance avec `node layers.js`.

---

## Étapes (en friction)

1. **Écris `readFromDb(id)`** — `async`, incrémente `dbReads`, attend 200 ms (`await new Promise(r => setTimeout(r, 200))`), retourne la ligne ou `null`.
2. **Enveloppe-la dans un single-flight** — avant d'appeler `readFromDb`, vérifie `inflight.get(key)` ; s'il existe, retourne **la même promesse** ; sinon crée-la, range-la, et `delete` dans un `finally`.
3. **Écris `readActivity(id)`** — d'abord l'app cache (HIT frais → `X-Cache: HIT (app)`), sinon single-flight vers la base (→ `MISS (app -> db)`), stocke le résultat en app cache (`expiresAt = now + 3600_000`).
4. **Écris le `GET`** — d'abord le reverse proxy (`proxyCache`) : HIT frais → réponds avec `X-Cache: HIT (proxy)` et `Age` calculé ; sinon appelle `readActivity`, construis les en-têtes complets, range en `proxyCache` (TTL 60 s), réponds.
5. **Écris le `PUT`** — lis le body JSON, `Object.assign` sur la ligne de base, puis **cascade inside-out** : `appCache.delete('activity:'+id)` → `proxyCache.delete(url)` → `console.log('[CDN] PURGE surrogate-key activity-'+id)`. Réponds `Cache-Control: no-store`.
6. **Trace une requête** — deux `curl -I` successifs (voir plus bas) : le 1er doit être `MISS (app -> db)`, le 2e `HIT (proxy)` avec `Age` qui grimpe.
7. **Provoque un stampede** — vide les caches (redémarre, ou attends l'expiration), puis lance ~50 `GET` concurrents et regarde `dbReads`. **Sans** single-flight (commente-le) : `dbReads` grimpe. **Avec** : `dbReads === 1`.
8. **Vérifie la cascade** — `curl -I` (MISS puis HIT proxy), un `PUT`, puis un `curl -I` : le `GET` post-`PUT` doit redevenir `MISS (app -> db)`.

### Commandes de trace

```bash
# Trace couche par couche
curl -sI http://localhost:3000/api/activities/42 | grep -Ei 'x-cache|^age|cache-control|surrogate'
curl -sI http://localhost:3000/api/activities/42 | grep -Ei 'x-cache|^age'

# Mutation + preuve de la cascade
curl -s -X PUT http://localhost:3000/api/activities/42 \
  -H 'Content-Type: application/json' -d '{"meetAt":"17:00"}'
curl -sI http://localhost:3000/api/activities/42 | grep -Ei 'x-cache|^age'

# Stampede : 50 requêtes concurrentes, puis observe dbReads dans les logs serveur
seq 50 | xargs -P50 -I{} curl -s http://localhost:3000/api/activities/42 > /dev/null
```

> Sur Windows PowerShell, remplace la boucle stampede par :
> `1..50 | ForEach-Object -Parallel { curl.exe -s http://localhost:3000/api/activities/42 | Out-Null }`

---

## Corrigé complet commenté

```js
// layers.js — corrigé
import { createServer } from 'node:http';

// --- Couche 5 : "base" (source de vérité), lente exprès ---
const db = new Map([['42', { id: '42', title: 'Pique-nique au parc', meetAt: '18:00' }]]);

// --- Couche 4 : app cache (objets métier, PAS des réponses HTTP) ---
const appCache = new Map();   // 'activity:42' -> { value, expiresAt }

// --- Couche 3 : reverse proxy (réponses HTTP) ---
const proxyCache = new Map(); // '/api/activities/42' -> { body, headers, storedAt, expiresAt }

// --- Anti-stampede : une régénération concurrente max par clé ---
const inflight = new Map();   // 'activity:42' -> Promise

let dbReads = 0;              // preuve : combien de fois la base a été touchée
const now = () => Date.now();

// Lecture base : lente + comptée. Le stampede se voit ici.
async function readFromDb(id) {
  dbReads += 1;
  console.log(`[DB] lecture #${dbReads} pour ${id}`);
  await new Promise((r) => setTimeout(r, 200)); // simule une requête SQL coûteuse
  return db.get(id) ?? null;
}

// Single-flight : les requêtes concurrentes sur la MÊME clé partagent une promesse.
async function readFromDbCoalesced(id) {
  const key = `activity:${id}`;
  if (inflight.has(key)) return inflight.get(key);      // coalescing : on attend le vol en cours
  const promise = readFromDb(id);
  inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(key);                               // on libère pour les prochains MISS
  }
}

// Couche 4 -> 5 : app cache d'abord, sinon base (via single-flight).
async function readActivity(id) {
  const key = `activity:${id}`;
  const hit = appCache.get(key);
  if (hit && now() < hit.expiresAt) {
    return { value: hit.value, xcache: 'HIT (app)' };   // servi sans toucher la base
  }
  const row = await readFromDbCoalesced(id);
  if (!row) return null;
  appCache.set(key, { value: row, expiresAt: now() + 3600_000 }); // EXPIRE 1 h
  return { value: row, xcache: 'MISS (app -> db)' };
}

// Invalidation en cascade INSIDE-OUT : base (déjà écrite) -> app -> proxy -> CDN.
function cascadeInvalidate(id, url) {
  appCache.delete(`activity:${id}`);                    // 2. couche 4
  proxyCache.delete(url);                               // 3. couche 3
  console.log(`[CDN] PURGE surrogate-key activity-${id}`); // 4. couche 2 (non codée ici)
  // 5. Navigateur : impossible à purger -> on compte sur max-age=30 côté client.
  console.log(`[cascade] invalidation inside-out terminée pour activity:${id}`);
}

const server = createServer(async (req, res) => {
  const m = req.url.match(/^\/api\/activities\/(\d+)$/);
  if (!m) { res.writeHead(404); return res.end('not found'); }
  const id = m[1];

  // ---------- GET : traverse la pile ----------
  if (req.method === 'GET') {
    // Couche 3 : reverse proxy répond seul s'il a une copie fraîche.
    const cached = proxyCache.get(req.url);
    if (cached && now() < cached.expiresAt) {
      res.writeHead(200, {
        ...cached.headers,
        'X-Cache': 'HIT (proxy)',
        Age: Math.round((now() - cached.storedAt) / 1000), // Age = temps passé dans le proxy
      });
      return res.end(cached.body);
    }

    // MISS proxy : on descend (app -> base).
    const found = await readActivity(id);
    if (!found) { res.writeHead(404); return res.end('not found'); }

    const body = JSON.stringify(found.value);
    const headers = {
      'Content-Type': 'application/json',
      // Pour le navigateur (max-age) ET le futur CDN (s-maxage) : TTL décroissant vers le client.
      'Cache-Control': 'public, max-age=30, s-maxage=120',
      'Surrogate-Key': `activity-${id} activities`,   // purge par tag au CDN (module 08)
      'X-Cache': found.xcache,                        // sonde de la couche du dessous
      Age: 0,                                         // vient de la source
    };
    proxyCache.set(req.url, { body, headers, storedAt: now(), expiresAt: now() + 60_000 });
    res.writeHead(200, headers);
    return res.end(body);
  }

  // ---------- PUT : mutation + cascade ----------
  if (req.method === 'PUT') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const updates = JSON.parse(raw || '{}');

    const row = db.get(id);
    if (!row) { res.writeHead(404); return res.end('not found'); }
    Object.assign(row, updates);                      // 1. source de vérité d'abord
    console.log(`[DB] UPDATE ${id}:`, updates);

    cascadeInvalidate(id, req.url);                   // 2->4. inside-out

    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(row));
  }

  res.writeHead(405);
  res.end('method not allowed');
});

server.listen(3000, () => console.log('http://localhost:3000  (GET/PUT /api/activities/:id)'));
```

**Pourquoi ce corrigé est correct :**

- **Trace couche par couche.** `X-Cache` distingue les trois issues : `HIT (proxy)` (couche 3 répond seule), `HIT (app)` (couche 4), `MISS (app -> db)` (descente jusqu'à la source). `Age` grimpe uniquement quand le proxy sert sa copie — la sonde exacte des modules 04/08.
- **Anti-stampede prouvé.** Sous 50 `GET` concurrents sur une clé absente, `readFromDbCoalesced` range **une** promesse dans `inflight` ; les 49 autres l'attendent → `dbReads === 1`. Commente le single-flight (`return readFromDb(id)`) et `dbReads` explose : la démonstration est chiffrée, pas théorique.
- **Cascade inside-out.** Le `PUT` écrit la base **puis** invalide app → proxy → CDN dans cet ordre. Invalider le proxy avant l'app risquerait de re-cacher du stale (piège #2 du module). Le navigateur n'est pas purgeable → `max-age=30` court.
- **Séparation des mécanismes.** Le proxy cache des **réponses HTTP** (clé = URL) ; l'app cache des **objets métier** (clé = `activity:42`). Deux invalidations distinctes dans la cascade — exactement le piège #6 du module.

---

## Variante J+30 (fading)

**Même pile, contraintes ajoutées, en 30 minutes, sans rouvrir ce corrigé ni le module :**

1. Ajoute une route liste `GET /api/activities` qui renvoie **toutes** les activités, cachée en app cache sous la clé `activities:list` **et** en proxy sous son URL.
2. Fais que le `PUT /api/activities/:id` invalide **aussi** la liste (l'activité éditée y apparaît) — la cascade doit purger `activity:<id>` **et** `activities:list`, plus les deux URLs proxy correspondantes.
3. Remplace l'expiration nette du single-flight par un **soft-serve** : si l'app cache est périmé **mais** présent, renvoie la valeur stale **immédiatement** avec `X-Cache: STALE (app, revalidating)` et relance la régénération en arrière-plan (mini `stale-while-revalidate` applicatif, module 06).

**Critère de réussite :** après un `PUT`, la liste ET la fiche repartent en `MISS (app -> db)` ; et sous charge, aucune requête n'attend les 200 ms (elles reçoivent du stale pendant que la base est relue une seule fois).

---

## Application TribuZen

Dans `smaurier/tribuzen`, cette maquette devient l'orchestration réelle du cache d'activités :

```
tribuzen/
  api/src/activities/activities.service.ts       # readActivity + cascade sur edit
  api/src/common/cache/single-flight.ts          # le request coalescing du lab, réutilisable
  api/src/common/cache/cascade-invalidator.ts     # app (Redis) -> nginx PURGE -> CDN purge tag
  infra/nginx.conf                               # le vrai reverse proxy (couche 3)
```

**Différences avec le lab :**

- L'app cache est **Redis** (partagé entre instances NestJS), pas un `Map` en mémoire → le single-flight devient un **lock distribué** (`SET lock:activity:42 1 NX PX 5000`) : un seul pod recalcule, les autres attendent ou servent stale.
- La couche CDN est **réelle** (Cloudflare/Fastly) : le `console.log('[CDN] PURGE ...')` devient un vrai appel à l'API de purge par surrogate key `activity-<id>`.
- Le reverse proxy est **nginx** configuré via `proxy_cache` + `PURGE`, pas un `Map` Node.

**Commit cible :**

```
feat(cache): orchestration multi-couches activités — cascade inside-out + single-flight anti-stampede
```
