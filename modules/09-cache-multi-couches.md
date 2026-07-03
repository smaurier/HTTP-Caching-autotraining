---
titre: Cache multi-couches — orchestrer la chaîne navigateur, CDN, proxy, app, base
cours: 11-http-caching
notions: [pile de caches multi-couches, "clé de cache par couche (méthode + URL + Vary)", TTL décroissant vers le client, invalidation en cascade inside-out, cohérence forte vs cohérence éventuelle, fenêtre de stale cumulée, cache stampede, thundering herd, request coalescing, single-flight, probabilistic early expiration, locking distribué, "stale-while-revalidate comme amortisseur de stampede", sondes de couche X-Cache et Age, tracer une requête à travers les couches]
outcomes:
  - sait empiler les couches de cache navigateur, CDN, reverse proxy, app et base en attribuant à chacune son rôle et son TTL
  - sait ordonner une invalidation en cascade de l'intérieur vers l'extérieur et identifier la couche impossible à purger
  - sait reconnaître un cache stampede et choisir la parade adaptée (coalescing, lock, expiration probabiliste, SWR)
  - sait tracer une requête à travers les couches avec X-Cache et Age pour localiser un HIT ou un MISS
prerequis: [00-prerequis-et-vue-ensemble, 01-protocole-http, 02-http2-http3, 03-en-tetes-http, 04-cache-control, 05-etag-validation-conditionnelle, 06-stale-while-revalidate, 07-cache-navigateur, 08-cdn]
next: 10-ssr
libs: []
tribuzen: chaîne de cache complète TribuZen — assets immutables au navigateur, annuaire public au CDN, listes d'activités au reverse proxy, agrégats au cache applicatif, base comme source de vérité, invalidation en cascade sur mutation
last-reviewed: 2026-07
---

# Cache multi-couches — orchestrer la chaîne navigateur, CDN, proxy, app, base

> **Outcomes — tu sauras FAIRE :** empiler les couches de cache (navigateur, CDN, reverse proxy, application, base) en donnant à chacune son rôle et son TTL, ordonner une invalidation **en cascade** de l'intérieur vers l'extérieur, reconnaître et désamorcer un **cache stampede**, et tracer une requête couche par couche avec `X-Cache` et `Age`.
> **Difficulté :** :star::star::star::star:
>
> **Portée :** ce module **orchestre** les briques déjà vues séparément — `Cache-Control` (module 04), revalidation `ETag`/`304` (module 05), `stale-while-revalidate` (module 06), cache navigateur (module 07), CDN et invalidation par tag (module 08). On ne réexplique pas chaque brique : on les **empile** et on gère leurs interactions (cohérence, invalidation en cascade, stampede, clés de cache). Le rendu serveur (SSR) et sa revalidation (ISR) sont les **modules 10 et 11** — hors sujet ici.

## 1. Cas concret d'abord

Sur TribuZen, la fiche d'une sortie familiale `/api/activities/42` est servie via une chaîne complète : navigateur → CDN → reverse proxy (nginx) → API (NestJS + cache applicatif) → PostgreSQL. Un organisateur corrige l'heure de rendez-vous (18 h → 17 h) et enregistre. La base est à jour **immédiatement**. Pourtant, pendant les minutes qui suivent :

- un membre qui a ouvert la page il y a 20 s voit encore **18 h** (cache navigateur, `max-age=60`) ;
- un membre d'une autre ville voit **18 h** (le POP CDN le plus proche sert encore sa copie fraîche) ;
- l'app renvoie **18 h** pour tout le monde car l'agrégat est figé dans le cache applicatif (`EX 3600`).

```
UPDATE activities SET meet_at='17:00' WHERE id=42   → PostgreSQL : 17 h ✅

  Navigateur     18 h   ← stale (encore 40 s de max-age)
  CDN (edge)     18 h   ← stale (encore 250 s de s-maxage)
  Reverse proxy  18 h   ← stale (encore 90 s de TTL)
  App cache      18 h   ← stale (encore 3500 s d'EXPIRE)
  PostgreSQL     17 h   ← source de vérité
```

La même donnée existe maintenant à **cinq endroits** avec **cinq durées de vie différentes**. Écrire dans la base ne suffit pas : il faut **orchestrer** l'invalidation des couches, dans le bon ordre, et savoir laquelle est impossible à purger. Pire, si on purge tout d'un coup une fiche très populaire, les requêtes qui arrivent juste après trouvent un cache vide et **tapent toutes la base en même temps** — c'est le *cache stampede*. Ce module traite ces deux problèmes : la **cohérence en cascade** et le **stampede**.

---

## 2. Théorie complète, concise

### 2.1 La pile : cinq couches, un même octet

Une requête `GET` traverse jusqu'à cinq caches avant d'atteindre la source de vérité. Chaque couche répond « j'ai » (HIT) ou « je passe à la suivante » (MISS).

```
+-----------+   +-------+   +---------------+   +-----------+   +-----+
| Navigateur|-->|  CDN  |-->| Reverse proxy |-->| App cache |-->| Base|
| (privé)   |   | (edge)|   | (nginx/Varnish)|  | (Redis)   |   | (BDD)|
+-----------+   +-------+   +---------------+   +-----------+   +-----+
 Couche 1        Couche 2      Couche 3           Couche 4      Source
 1 user          N users       N users            process(es)  vérité
```

| Couche | Cache | Ce qu'elle stocke | Contrôle | TTL typique |
|---|---|---|---|---|
| Navigateur | privé (module 07) | réponses HTTP | `Cache-Control: max-age` | 30 s – 1 an (assets) |
| CDN | partagé (module 08) | réponses HTTP | `s-maxage` + surrogate keys | 1 min – 24 h |
| Reverse proxy | partagé | réponses HTTP | config (VCL/nginx) | 30 s – 1 h |
| App cache | applicatif | **données**, pas des réponses HTTP | code (`SET/DEL/EXPIRE`) | 30 s – 1 h |
| Base | source de vérité | l'état canonique | requêtes SQL | — |

Distinction cruciale : les trois premières couches cachent des **réponses HTTP** (pilotées par en-têtes, vues aux modules 04-08). Le cache applicatif (couche 4) cache des **objets métier** (un agrégat, un résultat de requête) et n'obéit pas aux en-têtes HTTP — c'est **ton code** qui décide.

### 2.2 La règle du TTL décroissant vers le client

> Plus une couche est **loin de la source**, plus elle est **difficile à invalider**, donc plus son TTL doit être **court**.

```
Base        pas de TTL (source de vérité)
App cache   EXPIRE 3600 s   (tu contrôles : DEL instantané possible)
Rev. proxy  TTL   300 s     (purge possible via API/PURGE)
CDN         s-maxage 120 s  (purge par tag, ~qq secondes de propagation)
Navigateur  max-age 30 s    (IMPOSSIBLE à purger de l'extérieur)
```

Le navigateur est le **cul-de-sac** : aucune API ne permet de vider le cache HTTP d'un utilisateur distant. Sa seule borne est le `max-age` que tu lui as donné. Donc il reçoit le TTL le plus court. **Anti-pattern absolu** : `max-age` long sur le navigateur et TTL court en amont — tu purges le CDN et l'app, mais l'utilisateur reste bloqué sur l'ancienne valeur jusqu'à expiration locale.

### 2.3 Clé de cache : ce qui distingue deux entrées, par couche

Chaque couche partagée range ses entrées sous une **clé de cache**. D'après MDN, la clé HTTP se compose de la **méthode + l'URL**, étendue par les en-têtes listés dans `Vary`.

```
Clé de cache HTTP (CDN, proxy) = méthode + URL + valeurs des en-têtes cités dans Vary

Vary: Accept-Encoding          → une entrée par encodage (gzip, br)
Vary: Accept-Language          → une entrée par langue
```

Conséquences en multi-couches :
- **`Vary` trop large fragmente** le cache. `Vary: User-Agent` = quasiment une entrée par visiteur → taux de HIT proche de zéro, la couche ne sert à rien.
- **La clé applicative est différente** : au niveau code, ta clé est ce que tu choisis (`activity:42`, `activities:list:page=1`). Elle n'inclut pas `Vary` — c'est à toi d'y intégrer ce qui fait varier la donnée (locale, rôle).
- **Une donnée personnalisée ne doit jamais partager une clé partagée.** Si `/api/me` dépend de l'utilisateur, il faut `private`/`no-store` (module 04), sinon le CDN sert la réponse d'Alice à Bob sous la même clé URL.

### 2.4 Cohérence : forte vs éventuelle

Avec cinq copies, deux modèles de cohérence :

| Modèle | Garantie | Coût | Quand |
|---|---|---|---|
| **Forte** | toutes les couches voient la même valeur en même temps | on court-circuite le cache (bypass) ou on invalide de façon synchrone | solde, stock « plus que 2 », auth |
| **Éventuelle** | les couches **convergent** après une fenêtre de stale bornée | quasi nul | annuaire, listes, fiches, avatars |

La **fenêtre de stale se cumule** : dans le pire cas, le retard visible par un utilisateur est borné par la couche qu'on **ne peut pas** purger, c'est-à-dire le `max-age` du navigateur. C'est encore une raison de le garder court. La cohérence forte, elle, implique en général de **ne pas cacher** la donnée critique (`no-store`) plutôt que d'essayer de synchroniser cinq couches — plus simple et plus sûr.

### 2.5 Invalidation en cascade (inside-out)

Quand la source change, on invalide **de l'intérieur (proche source) vers l'extérieur (proche client)**. L'ordre importe : si on purge le CDN **avant** l'app cache, une requête peut recharger le CDN depuis un app cache encore périmé — on aurait re-caché du stale.

```
1. Base       UPDATE ... (source de vérité d'abord)
2. App cache  redis.del('activity:42')      + del des agrégats qui la contiennent
3. Rev. proxy PURGE /api/activities/42
4. CDN        purge par surrogate key "activity-42"   (module 08)
5. Navigateur — impossible — on compte sur un max-age court
```

Deux subtilités :
- **Une entité vit dans plusieurs entrées.** L'activité 42 apparaît dans `/api/activities/42`, dans `/api/activities?famille=7` et sur l'accueil. Les **surrogate keys / cache tags** (module 08) permettent de purger toutes ces URLs d'un coup via une clé `activity-42`. Sans tags, il faut connaître et purger chaque URL une par une.
- **Le navigateur** ne se purge pas. Parades côté client : `max-age` court, `no-cache` (revalidation systématique, module 05), URL versionnée (`?v=3`), ou notification temps réel (WebSocket/SSE) qui déclenche un re-fetch.

### 2.6 Cache stampede / thundering herd

Le piège du multi-couches : quand une clé **populaire** expire ou est purgée, **toutes** les requêtes concurrentes ratent le cache **en même temps** et se ruent sur la couche du dessous (jusqu'à la base). C'est le **cache stampede**, aussi appelé **thundering herd**.

```
t0    activity:42 expire dans le cache applicatif
t0+ε  500 requêtes/s arrivent → 500 MISS simultanés
      → 500 requêtes SQL identiques → la base sature → latence → timeouts
      → le cache ne se repeuple pas → ça empire (effondrement)
```

Le cache, censé **protéger** la base, devient l'origine d'une panne au moment précis où il expire. Quatre parades (à combiner) :

1. **Request coalescing (single-flight).** À la première MISS, on pose un verrou « recalcul en cours ». Les requêtes suivantes **attendent** ce recalcul au lieu d'en lancer un chacune : **une seule** requête SQL, toutes partagent le résultat.
2. **Locking distribué.** Même idée quand plusieurs **process/serveurs** partagent le cache (Redis) : un lock distribué (`SET NX` avec TTL) garantit qu'un seul nœud recalcule ; les autres attendent ou servent l'ancienne valeur.
3. **Probabilistic early expiration (XFetch).** Chaque lecture peut décider de recalculer **un peu avant** l'expiration, avec une probabilité qui **croît à l'approche** de l'échéance. Statistiquement, un seul client rafraîchit tôt et la clé n'expire jamais « à sec » pour la foule (papier VLDB 2015, *Optimal Probabilistic Cache Stampede Prevention*).
4. **stale-while-revalidate (module 06).** On sert la copie **stale immédiatement** et on revalide **en arrière-plan** : aucune requête n'attend, une seule revalidation part. C'est l'amortisseur naturel du stampede au niveau HTTP (CDN/navigateur) — combiné au coalescing côté applicatif, il couvre les cinq couches.

### 2.7 Sondes de couche : lire où ça a HIT

Pour diagnostiquer, deux en-têtes servent de sonde à travers la pile :

- **`Age`** (standard, module 04) : secondes écoulées depuis que la réponse a été générée par l'**origine**. `Age: 0` ou absent → vient de l'origine ; `Age` élevé → sert depuis un cache partagé (CDN/proxy).
- **`X-Cache`** (non standard, ajouté par la plupart des CDN/proxies) : `HIT`/`MISS`, souvent enrichi (`X-Cache: HIT from edge-par-1`). Certains CDN utilisent `CF-Cache-Status`, `X-Cache-Status`, etc. — le nom exact dépend du fournisseur, mais l'idée est la même.

En empilant les couches, chacune peut estampiller sa propre sonde (`X-Cache: HIT (proxy)`, `X-Cache: MISS (app)`), ce qui permet de **tracer** exactement où la requête s'est arrêtée — c'est l'objet du lab.

---

## 3. Worked examples

### Exemple 1 — Tracer une requête à travers les couches avec `curl -I`

On simule la chaîne avec un petit serveur Node qui joue **reverse proxy + app cache** devant une « base » lente, et on lit les sondes. (Le CDN et le navigateur s'observent ensuite avec les vrais outils — c'est le lab.)

```js
// layers.js — reverse proxy + app cache devant une base simulée
import { createServer } from 'node:http';

const db = new Map([['42', { id: '42', meetAt: '18:00' }]]);
const appCache = new Map();   // clé métier -> { value, expiresAt }
const proxyCache = new Map(); // URL -> { body, headers, expiresAt }

const now = () => Date.now();

function readActivity(id) {
  // Couche 4 : app cache
  const hit = appCache.get(`activity:${id}`);
  if (hit && now() < hit.expiresAt) return { value: hit.value, xcache: 'HIT (app)' };
  // Couche 5 : base (lente)
  const row = db.get(id);
  if (!row) return null;
  appCache.set(`activity:${id}`, { value: row, expiresAt: now() + 3600_000 });
  return { value: row, xcache: 'MISS (app -> db)' };
}

createServer((req, res) => {
  const m = req.url.match(/^\/api\/activities\/(\d+)$/);
  if (!m) { res.writeHead(404); return res.end('not found'); }
  const id = m[1];

  // Couche 3 : reverse proxy
  const cached = proxyCache.get(req.url);
  if (cached && now() < cached.expiresAt) {
    res.writeHead(200, { ...cached.headers, 'X-Cache': 'HIT (proxy)', Age: Math.round((now() - cached.storedAt) / 1000) });
    return res.end(cached.body);
  }

  const found = readActivity(id);
  if (!found) { res.writeHead(404); return res.end('not found'); }

  const body = JSON.stringify(found.value);
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=30, s-maxage=120',
    'Surrogate-Key': `activity-${id} activities`,
    'X-Cache': found.xcache,       // MISS (proxy) : sonde de la couche app en dessous
    Age: 0,
  };
  proxyCache.set(req.url, { body, headers, storedAt: now(), expiresAt: now() + 300_000 });
  res.writeHead(200, headers);
  res.end(body);
}).listen(3000, () => console.log('http://localhost:3000'));
```

Trace attendue avec `curl -I` :

```
# 1re requête : rien en cache -> descend jusqu'à la base
$ curl -sI http://localhost:3000/api/activities/42 | grep -Ei 'x-cache|age|cache-control'
Cache-Control: public, max-age=30, s-maxage=120
X-Cache: MISS (app -> db)
Age: 0

# 2e requête : le reverse proxy répond seul, sans toucher app ni base
$ curl -sI http://localhost:3000/api/activities/42 | grep -Ei 'x-cache|age'
X-Cache: HIT (proxy)
Age: 1
```

Lecture : le premier appel a `X-Cache: MISS (app -> db)` et `Age: 0` → il vient de la source. Le second a `X-Cache: HIT (proxy)` et `Age` qui grimpe → il est servi par la couche 3 sans redescendre. En production, tu empiles à ça le `CF-Cache-Status` du CDN et le `(from disk cache)` de DevTools (module 07) pour couvrir les cinq couches.

### Exemple 2 — Désamorcer un stampede avec du request coalescing

Sur une clé populaire, on veut qu'**une seule** régénération parte même sous 500 requêtes concurrentes. Le pattern single-flight en mémoire :

```js
// single-flight.js — une seule régénération concurrente par clé
const cache = new Map();      // clé -> { value, expiresAt }
const inflight = new Map();   // clé -> Promise en cours

async function getActivity(id) {
  const key = `activity:${id}`;
  const hit = cache.get(key);
  if (hit && Date.now() < hit.expiresAt) return hit.value;   // HIT frais

  // Une régénération est déjà en cours ? on attend LA MÊME promesse.
  if (inflight.has(key)) return inflight.get(key);           // coalescing

  const promise = (async () => {
    const value = await queryDatabaseSlow(id);               // 1 seule fois
    cache.set(key, { value, expiresAt: Date.now() + 60_000 });
    return value;
  })();

  inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(key);   // on libère : les prochains MISS relanceront un seul vol
  }
}

async function queryDatabaseSlow(id) {
  await new Promise((r) => setTimeout(r, 200)); // requête lente
  return { id, meetAt: '17:00' };
}

// 500 appels simultanés -> 1 seule exécution de queryDatabaseSlow
await Promise.all(Array.from({ length: 500 }, () => getActivity('42')));
```

**Pourquoi ça marche :** la première MISS crée **une** promesse rangée dans `inflight`. Les 499 autres tombent sur `inflight.has(key)` et **attendent la même promesse** au lieu d'ouvrir 499 requêtes SQL. La base reçoit **une** requête. Pour un cache **partagé entre serveurs** (Redis), on remplace `inflight` par un **lock distribué** (`SET lock:activity:42 1 NX PX 5000`) : seul le nœud qui obtient le lock recalcule ; les autres attendent ou servent l'ancienne valeur (couplé à `stale-while-revalidate`, personne n'attend).

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Croire qu'écrire dans la base met les caches à jour

```
❌ UPDATE activities SET meet_at='17:00' WHERE id=42;   // et c'est tout
```

La base est à jour, mais les quatre couches au-dessus servent encore l'ancienne valeur jusqu'à expiration. **Correct :** déclencher une **invalidation en cascade** après l'écriture (app → proxy → CDN), et compter sur un `max-age` court pour le navigateur.

### PIÈGE #2 — Invalider de l'extérieur vers l'intérieur

```
❌ purge CDN, PUIS del app cache
```

Entre les deux, une requête recharge le CDN depuis un app cache **encore périmé** → on re-cache du stale pour tout un TTL. **Correct :** toujours **inside-out** — source d'abord, puis app, puis proxy, puis CDN.

### PIÈGE #3 — `max-age` long au navigateur « pour la perf »

```
❌ Cache-Control: max-age=86400   sur une donnée qui change
```

Le navigateur est **impossible à purger** : tu es coincé 24 h même en purgeant tout le reste. **Correct :** navigateur = TTL le plus court de la pile (ou `no-cache`) ; c'est le CDN/proxy qui portent les longs TTL, car eux sont purgeables.

### PIÈGE #4 — Confondre purge et expiration face au stampede

Purger une clé très populaire, c'est **déclencher** un stampede : juste après la purge, tout le monde rate le cache en même temps.

```
❌ purge brutale d'une clé chaude sans parade
```

**Correct :** combiner **soft purge** / `stale-while-revalidate` (on sert stale pendant la régénération) et **coalescing/lock** (une seule régénération). On ne laisse jamais une clé chaude passer de « fraîche » à « vide » d'un coup.

### PIÈGE #5 — `Vary` trop large qui tue le cache partagé

```
❌ Vary: User-Agent    // ou Vary: Cookie
```

La clé de cache inclut l'en-tête varié → quasiment **une entrée par visiteur** → taux de HIT ~0, la couche partagée ne sert plus à rien. **Correct :** ne `Vary` que sur ce qui change **réellement** la représentation partageable (`Accept-Encoding`, éventuellement `Accept-Language`). Ce qui dépend de l'utilisateur → `private`/`no-store`, pas `Vary`.

### PIÈGE #6 — Confondre cache HTTP (couches 1-3) et cache applicatif (couche 4)

Le cache applicatif (Redis, Map) **n'obéit pas** à `Cache-Control` : poser `max-age=60` sur la réponse ne fixe pas le TTL de ta clé Redis. Ce sont **deux mécanismes** avec **deux clés** et **deux invalidations**. **Correct :** piloter le HTTP avec les en-têtes, le cache applicatif avec ton code (`EXPIRE`, `DEL`), et penser l'invalidation en cascade **des deux**.

---

## 5. Ancrage TribuZen

TribuZen sert son trafic à travers la pile complète, ressource par ressource :

| Ressource | Navigateur | CDN | Reverse proxy | App cache | Invalidation |
|---|---|---|---|---|---|
| `/assets/*.[hash].js` | `max-age=31536000, immutable` | idem | passe-plat | — | jamais (hash) |
| `GET /api/families` (annuaire public) | `max-age=30` | `s-maxage=300` + tag `families` | TTL 120 s | `families:list` EX 600 | cascade sur création/edit famille |
| `GET /api/activities/:id` | `max-age=30` | `s-maxage=120` + tag `activity-<id>` | TTL 60 s | `activity:<id>` EX 3600 | cascade sur edit activité |
| `GET /api/me` | `no-store` | bypass | bypass | — | jamais caché (cohérence forte) |

Orchestration concrète dans `smaurier/tribuzen` :

- **Invalidation en cascade** : quand un organisateur édite l'activité 42, un `ActivitiesService` (NestJS) exécute, **dans cet ordre** : `UPDATE` PostgreSQL → `redis.del('activity:42')` + `redis.del('activities:list:*')` concernées → `PURGE` nginx → purge CDN par surrogate key `activity-42`. Le navigateur, lui, converge en ≤ 30 s (`max-age`).
- **Anti-stampede** : les fiches d'activités très consultées (une sortie virale) passent par un **single-flight** applicatif (Exemple 2) + `stale-while-revalidate` au CDN (module 06). À l'expiration de la clé chaude, une seule requête SQL part, tout le monde est servi en stale entre-temps.
- **Cohérence forte réservée** : `/api/me` et les documents personnels sont en `no-store` (module 04) — on ne tente pas de synchroniser cinq couches pour de la donnée sensible, on la sort simplement du cache.

Fichiers cibles :

```
tribuzen/
  api/src/activities/activities.service.ts       # invalidation en cascade inside-out
  api/src/common/cache/single-flight.ts          # request coalescing anti-stampede
  api/src/common/cache/cascade-invalidator.ts    # orchestre app -> proxy -> CDN
  infra/nginx.conf                               # reverse proxy : TTL + PURGE
```

---

## 6. Points clés

1. Une requête traverse jusqu'à **cinq couches** : navigateur (privé) → CDN → reverse proxy → app cache → base. Les 1-3 cachent des **réponses HTTP**, la 4 des **objets métier** (pas de `Cache-Control`).
2. **TTL décroissant vers le client** : le navigateur, impossible à purger, reçoit le TTL le plus court ; les couches purgeables portent les longs TTL.
3. La **clé de cache HTTP** = méthode + URL + en-têtes cités dans `Vary` ; un `Vary` trop large fragmente et détruit le taux de HIT.
4. **Cohérence** : éventuelle (fenêtre de stale bornée) pour la plupart des données ; forte (souvent = `no-store`) pour le critique.
5. **Invalidation en cascade inside-out** : base → app → proxy → CDN → (navigateur : impossible) ; les surrogate keys purgent toutes les URLs d'une entité d'un coup.
6. **Cache stampede / thundering herd** : à l'expiration d'une clé chaude, toutes les requêtes ratent le cache et saturent la base. Parades : **request coalescing / single-flight**, **lock distribué**, **probabilistic early expiration**, **stale-while-revalidate**.
7. **`Age` et `X-Cache`** sont les sondes pour tracer où une requête a fait HIT ou MISS à travers la pile.

---

## 7. Seeds Anki

```
Quelles sont les 5 couches de cache d'une requête et laquelle est impossible à purger ?|Navigateur (privé) -> CDN -> reverse proxy -> app cache -> base. Le cache navigateur est impossible à purger de l'extérieur : sa seule borne est le max-age qu'on lui a donné, d'où la règle du TTL le plus court pour lui.
Pourquoi le TTL doit-il décroître à mesure qu'on se rapproche du client ?|Plus une couche est loin de la source, plus elle est difficile à invalider. Le navigateur ne se purge pas du tout -> TTL court. Les couches purgeables (CDN, proxy, app) peuvent porter des TTL longs car on peut les invalider activement.
Dans quel ordre invalider les couches après une écriture, et pourquoi ?|Inside-out : base -> app cache -> reverse proxy -> CDN -> (navigateur impossible). Si on purgeait le CDN avant l'app cache, une requête pourrait recharger le CDN depuis un app cache encore périmé et re-cacher du stale.
Qu'est-ce qu'un cache stampede (thundering herd) ?|Quand une clé populaire expire ou est purgée, toutes les requêtes concurrentes ratent le cache en même temps et se ruent sur la couche du dessous (jusqu'à la base), qui sature. Le cache censé protéger la base devient la cause de la panne au moment où il expire.
Cite trois parades au cache stampede.|1) Request coalescing / single-flight : une seule régénération, les autres attendent la même promesse. 2) Lock distribué (SET NX) quand le cache est partagé entre serveurs. 3) Probabilistic early expiration (XFetch) : recalcul anticipé avec probabilité croissante. Bonus : stale-while-revalidate sert du stale pendant la régénération.
De quoi est composée une clé de cache HTTP, et quel est le risque d'un Vary trop large ?|Clé = méthode + URL + valeurs des en-têtes listés dans Vary. Un Vary trop large (User-Agent, Cookie) crée quasiment une entrée par visiteur -> taux de HIT proche de zéro, la couche partagée ne sert plus à rien.
Quelle est la différence entre cache HTTP (couches 1-3) et cache applicatif (couche 4) ?|Les couches 1-3 cachent des réponses HTTP pilotées par les en-têtes (Cache-Control, ETag). La couche 4 (Redis, Map) cache des objets métier et n'obéit pas aux en-têtes : c'est le code qui fixe la clé et le TTL (SET/DEL/EXPIRE). Deux mécanismes, deux invalidations.
À quoi servent les en-têtes Age et X-Cache pour diagnostiquer un multi-couches ?|Age (standard) = secondes depuis la génération à l'origine : Age 0/absent = vient de l'origine, Age élevé = servi par un cache partagé. X-Cache (non standard, ajouté par CDN/proxy) = HIT/MISS de la couche. Ensemble ils tracent où la requête a fait HIT dans la pile.
```

---

## Pont vers le lab

> Lab associé : `11-http-caching/labs/lab-09-cache-multi-couches/README.md`. Monter une pile navigateur → reverse proxy → app cache → base avec un vrai serveur Node, estampiller chaque couche (`X-Cache`, `Age`, `Surrogate-Key`), **tracer une requête** à travers les couches avec `curl -I`, provoquer puis **désamorcer un cache stampede** avec du single-flight, et orchestrer une **invalidation en cascade** après mutation.
