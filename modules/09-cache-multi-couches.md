# Module 09 — Cache multi-couches

> **Objectif** : Comprendre comment les differentes couches de cache (navigateur, CDN, reverse proxy, application, base de donnees) interagissent, et maitriser les strategies de coherence, d'invalidation en cascade et de cache applicatif.
> **Difficulte** : :star::star::star::star:

---

## 1. La pile de caches : Browser -> CDN -> Reverse Proxy -> App -> DB

### 1.1 Vue d'ensemble

Une requete traverse potentiellement **5 couches de cache** avant d'atteindre la source de verite :

```
+-------------+     +---------+     +---------------+     +----------+     +------+
|  Browser    | --> |   CDN   | --> | Reverse Proxy | --> |   App    | --> |  DB  |
|  Cache      |     |  (edge) |     |  (Varnish/    |     |  Cache   |     |      |
|             |     |         |     |   Nginx)      |     | (Redis)  |     |      |
+-------------+     +---------+     +---------------+     +----------+     +------+
    Couche 1         Couche 2          Couche 3           Couche 4       Source
    (client)         (reseau)          (infra)            (code)        de verite
```

### 1.2 L'analogie du systeme postal

- **Browser Cache** = ta boite aux lettres personnelle (rapide, petite capacite)
- **CDN** = le bureau de poste de ton quartier (moyen, partage entre voisins)
- **Reverse Proxy** = le centre de tri regional (gros volume, proche du destinataire final)
- **App Cache (Redis)** = le classeur du bureau d'Alice (donnees structurees, acces rapide)
- **DB** = les archives nationales (source de verite, lent mais complet)

### 1.3 Chaque couche a son role

| Couche | Quoi cacher | TTL typique | Qui controle | Invalidation |
|--------|-------------|-------------|-------------|-------------|
| Browser | Reponses HTTP | 1min - 1an | Headers HTTP | max-age, no-cache |
| CDN | Reponses HTTP | 5min - 24h | Headers + config CDN | Purge API |
| Reverse Proxy | Reponses HTTP | 1min - 1h | VCL / config | Ban, purge |
| App (Redis) | Donnees structurees | 30s - 1h | Code applicatif | DEL, EXPIRE |
| DB (query cache) | Resultats de requetes | Auto | Moteur DB | Auto-invalidation |

### 1.4 Exemple concret : page produit e-commerce

```
GET /produit/42

Couche        Hit/Miss    Temps    Commentaire
------        --------    -----    -----------
Browser       MISS        0ms      Premier visite
CDN (edge)    MISS        2ms      Pas encore cache
CDN (shield)  MISS        15ms     Pas encore cache
Reverse Proxy MISS        1ms      Pas encore cache
App Cache     HIT         0.5ms    Redis a le produit 42 !
                                   (pas besoin de DB)

Temps total : ~19ms

Deuxieme visite (meme utilisateur, < max-age) :
Browser       HIT         0ms      Instantane !

Autre utilisateur, meme POP :
CDN (edge)    HIT         2ms      Rapide !
```

---

## 2. Cache coherence et donnees stale

### 2.1 Le probleme fondamental

Avec 5 couches de cache, la meme donnee existe potentiellement a 5 endroits differents. Quand la source de verite change, comment s'assurer que toutes les couches se mettent a jour ?

```
Etat initial : prix du produit 42 = 29.99 EUR

  Browser Cache : 29.99 EUR    (max-age: 60s)
  CDN :           29.99 EUR    (s-maxage: 300s)
  Reverse Proxy : 29.99 EUR    (TTL: 120s)
  Redis :         29.99 EUR    (EXPIRE: 3600s)
  DB :            29.99 EUR    (source de verite)

                 MISE A JOUR : prix passe a 24.99 EUR

  Browser Cache : 29.99 EUR    <-- STALE ! (encore 45s de TTL)
  CDN :           29.99 EUR    <-- STALE ! (encore 250s de TTL)
  Reverse Proxy : 29.99 EUR    <-- STALE ! (encore 80s de TTL)
  Redis :         29.99 EUR    <-- STALE ! (encore 3200s de TTL)
  DB :            24.99 EUR    <-- A JOUR (source de verite)
```

### 2.2 Les 3 modeles de coherence

```
+------------------+-----------------------------------------------+
| Modele           | Description                                   |
+------------------+-----------------------------------------------+
| Coherence forte  | Toutes les couches voient la meme valeur      |
|                  | en meme temps. Cout : performances.           |
+------------------+-----------------------------------------------+
| Coherence        | Les couches finissent par converger.           |
| eventuelle       | Fenetre de stale acceptable.                  |
+------------------+-----------------------------------------------+
| Pas de coherence | Chaque couche expire independamment.           |
|                  | Pas de garantie.                              |
+------------------+-----------------------------------------------+
```

### 2.3 Quand choisir quoi

| Scenario | Modele | Justification |
|----------|--------|---------------|
| Prix affiche | Eventuelle (court TTL) | Quelques secondes de retard OK |
| Stock disponible | Eventuelle (tres court) | "Plus que 2 !" doit etre a jour |
| Solde bancaire | Forte | Toujours exact |
| Avatar utilisateur | Eventuelle (long TTL) | Pas grave si ancien 5 min |
| Token d'authentification | Forte | Securite |
| Article de blog | Eventuelle | Changements rares |

---

## 3. Invalidation en cascade

### 3.1 Le principe

Quand une donnee change, il faut invalider **de l'interieur vers l'exterieur** :

```
Invalidation en cascade (Inside-Out) :
========================================

  1. Mise a jour DB          UPDATE products SET price = 24.99 WHERE id = 42
           |
           v
  2. Invalider App Cache     redis.del('product:42')
           |
           v
  3. Invalider Reverse Proxy PURGE /produit/42
           |
           v
  4. Invalider CDN           API purge par tag "product-42"
           |
           v
  5. Browser ?               On ne peut pas ! Il faut attendre max-age
                             ou que l'utilisateur recharge
```

### 3.2 Le probleme du browser cache

On ne peut PAS invalider le cache navigateur de l'exterieur. Solutions :

```
Solution 1 : TTL court
  Cache-Control: max-age=60
  --> Maximum 60s de stale

Solution 2 : no-cache (revalidation systematique)
  Cache-Control: no-cache
  --> Toujours revalide, mais peut utiliser 304

Solution 3 : Versioning dans l'URL
  /api/v2/produits/42  --> Nouvelle URL = pas de cache stale

Solution 4 : WebSocket / SSE pour notifier le client
  Le serveur pousse un event "invalidate:product:42"
  Le client force un re-fetch
```

### 3.3 Implementation : invalidation en cascade

```js
import { createServer, request as httpRequest } from 'node:http';

// ---- Simuler Redis ----
class AppCache {
  #store = new Map();

  get(key) {
    const entry = this.#store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.#store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key, value, ttlSeconds = 3600) {
    this.#store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000
    });
  }

  del(key) {
    this.#store.delete(key);
    console.log(`[AppCache] Invalidation de "${key}"`);
  }

  // Invalidation par pattern (comme Redis SCAN + DEL)
  delByPattern(pattern) {
    let count = 0;
    for (const key of this.#store.keys()) {
      if (key.includes(pattern)) {
        this.#store.delete(key);
        count++;
      }
    }
    console.log(`[AppCache] Invalidation par pattern "${pattern}" : ${count} cles`);
    return count;
  }
}

// ---- Simuler la base de donnees ----
class Database {
  #products = new Map([
    ['42', { id: '42', nom: 'Clavier mecanique', prix: 89.99, stock: 15 }],
    ['43', { id: '43', nom: 'Souris ergonomique', prix: 49.99, stock: 8 }]
  ]);

  getProduct(id) {
    console.log(`[DB] Lecture du produit ${id}`);
    return this.#products.get(id) || null;
  }

  updateProduct(id, updates) {
    const product = this.#products.get(id);
    if (!product) return null;
    Object.assign(product, updates);
    console.log(`[DB] Mise a jour produit ${id}:`, updates);
    return product;
  }
}

// ---- Simuler le reverse proxy cache ----
class ReverseProxyCache {
  #store = new Map();

  get(url) {
    const entry = this.#store.get(url);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.#store.delete(url);
      return null;
    }
    console.log(`[ReverseProxy] HIT pour ${url}`);
    return entry.value;
  }

  set(url, value, ttlSeconds = 120) {
    this.#store.set(url, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000
    });
  }

  purge(url) {
    this.#store.delete(url);
    console.log(`[ReverseProxy] PURGE ${url}`);
  }

  purgeByTag(tag) {
    // Simuler la purge par tag
    let count = 0;
    for (const [url, entry] of this.#store) {
      if (entry.value.tags && entry.value.tags.includes(tag)) {
        this.#store.delete(url);
        count++;
      }
    }
    console.log(`[ReverseProxy] PURGE par tag "${tag}" : ${count} URLs`);
    return count;
  }
}

const db = new Database();
const appCache = new AppCache();
const proxyCache = new ReverseProxyCache();

// ---- Invalidation en cascade ----
async function cascadeInvalidation(productId, tags) {
  console.log('\n=== DEBUT INVALIDATION EN CASCADE ===');

  // 1. App Cache (Redis)
  appCache.del(`product:${productId}`);
  appCache.delByPattern(`list:products`); // Listes qui contiennent ce produit

  // 2. Reverse Proxy
  proxyCache.purge(`/api/produits/${productId}`);
  for (const tag of tags) {
    proxyCache.purgeByTag(tag);
  }

  // 3. CDN (simule)
  console.log(`[CDN] Purge par tag : ${tags.join(', ')}`);
  // En vrai : appel API CDN
  // await fetch('https://api.fastly.com/service/xxx/purge/' + tags[0], ...);

  // 4. Browser : impossible ! On compte sur le TTL court
  console.log('[Browser] Impossible a invalider - attente du TTL');

  console.log('=== FIN INVALIDATION EN CASCADE ===\n');
}

// ---- Serveur HTTP ----
const server = createServer(async (req, res) => {
  // ---- GET /api/produits/:id ----
  const getMatch = req.url.match(/^\/api\/produits\/(\d+)$/);
  if (req.method === 'GET' && getMatch) {
    const id = getMatch[1];

    // 1. Verifier reverse proxy
    const proxyCached = proxyCache.get(req.url);
    if (proxyCached) {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'X-Cache': 'HIT (reverse-proxy)',
        'Cache-Control': 'public, max-age=30',
        'CDN-Cache-Control': 'max-age=300'
      });
      res.end(JSON.stringify(proxyCached.data));
      return;
    }

    // 2. Verifier app cache
    let product = appCache.get(`product:${id}`);
    let cacheSource = 'app-cache';

    if (!product) {
      // 3. Aller en DB
      product = db.getProduct(id);
      cacheSource = 'database';

      if (!product) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Produit non trouve' }));
        return;
      }

      // Stocker en app cache
      appCache.set(`product:${id}`, product, 3600);
    }

    // Stocker en reverse proxy
    const tags = [`product-${id}`, 'products'];
    proxyCache.set(req.url, { data: product, tags }, 120);

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'X-Cache': `MISS (source: ${cacheSource})`,
      'Cache-Control': 'public, max-age=30',
      'CDN-Cache-Control': 'max-age=300',
      'Surrogate-Key': tags.join(' ')
    });
    res.end(JSON.stringify(product));
    return;
  }

  // ---- PUT /api/produits/:id ----
  const putMatch = req.url.match(/^\/api\/produits\/(\d+)$/);
  if (req.method === 'PUT' && putMatch) {
    const id = putMatch[1];
    let body = '';
    for await (const chunk of req) body += chunk;
    const updates = JSON.parse(body);

    // 1. Mettre a jour la DB (source de verite)
    const updated = db.updateProduct(id, updates);
    if (!updated) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Produit non trouve' }));
      return;
    }

    // 2. Invalidation en cascade
    await cascadeInvalidation(id, [`product-${id}`, 'products']);

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify(updated));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(3000, () => {
  console.log('Serveur multi-couches sur http://localhost:3000');
  console.log('');
  console.log('Tester :');
  console.log('  curl http://localhost:3000/api/produits/42');
  console.log('  curl http://localhost:3000/api/produits/42  (2e fois = cache)');
  console.log('');
  console.log('Modifier :');
  console.log('  curl -X PUT http://localhost:3000/api/produits/42 \\');
  console.log('    -H "Content-Type: application/json" \\');
  console.log('    -d \'{"prix": 74.99}\'');
});
```

---

## 4. Surrogate keys / cache tags

### 4.1 Pourquoi des tags ?

Une page web est rarement composee d'une seule "entite". La page `/produit/42` peut dependre de :

```
/produit/42 depend de :
========================
- Le produit 42 lui-meme
- L'auteur de la fiche
- La categorie "peripheriques"
- Le taux de TVA
- Les avis clients
- Les produits recommandes (43, 44, 45)
- Le layout global du site
- Les promotions en cours

Tags : product-42 author-bob category-peripheriques
       reviews-42 promo-summer layout-v3
```

### 4.2 Matrice de dependances

```
                   product-42  category-tech  author-alice  promo-noel
                   ----------  -------------  -----------   ----------
/produit/42            X                                        X
/categorie/tech                     X
/auteur/alice                                      X
/accueil               X              X              X           X
/recherche?q=clav      X              X
/promo/noel            X                                        X
```

Quand `product-42` change, on purge : `/produit/42`, `/accueil`, `/recherche?q=clav`, `/promo/noel`.

### 4.3 Implementation des tags

```js
// Classe pour gerer les tags de cache
class TaggedCache {
  #store = new Map();       // URL -> { body, tags, storedAt, ttl }
  #tagIndex = new Map();    // tag -> Set<URL>

  set(url, body, tags = [], ttlSeconds = 3600) {
    // Stocker l'entree
    this.#store.set(url, {
      body,
      tags,
      storedAt: Date.now(),
      ttl: ttlSeconds * 1000
    });

    // Indexer par tag
    for (const tag of tags) {
      if (!this.#tagIndex.has(tag)) {
        this.#tagIndex.set(tag, new Set());
      }
      this.#tagIndex.get(tag).add(url);
    }

    console.log(`[TaggedCache] SET ${url} avec tags: [${tags.join(', ')}]`);
  }

  get(url) {
    const entry = this.#store.get(url);
    if (!entry) return null;
    if (Date.now() - entry.storedAt > entry.ttl) {
      this.#purgeEntry(url);
      return null;
    }
    return entry.body;
  }

  // Purge par URL
  purgeUrl(url) {
    this.#purgeEntry(url);
    console.log(`[TaggedCache] PURGE URL: ${url}`);
  }

  // Purge par tag -- la star du spectacle
  purgeByTag(tag) {
    const urls = this.#tagIndex.get(tag);
    if (!urls) {
      console.log(`[TaggedCache] PURGE TAG "${tag}": 0 URLs`);
      return 0;
    }

    const count = urls.size;
    for (const url of urls) {
      this.#purgeEntry(url);
    }
    console.log(`[TaggedCache] PURGE TAG "${tag}": ${count} URLs`);
    return count;
  }

  // Soft purge par tag : marquer stale au lieu de supprimer
  softPurgeByTag(tag) {
    const urls = this.#tagIndex.get(tag);
    if (!urls) return 0;

    let count = 0;
    for (const url of urls) {
      const entry = this.#store.get(url);
      if (entry) {
        // Forcer l'expiration (mais garder en cache pour SWR)
        entry.storedAt = Date.now() - entry.ttl - 1;
        entry.softPurged = true;
        count++;
      }
    }
    console.log(`[TaggedCache] SOFT PURGE TAG "${tag}": ${count} URLs marquees stale`);
    return count;
  }

  // Stats
  stats() {
    return {
      entries: this.#store.size,
      tags: this.#tagIndex.size,
      tagDetails: Object.fromEntries(
        [...this.#tagIndex].map(([tag, urls]) => [tag, urls.size])
      )
    };
  }

  #purgeEntry(url) {
    const entry = this.#store.get(url);
    if (entry) {
      // Retirer des index de tags
      for (const tag of entry.tags) {
        const tagUrls = this.#tagIndex.get(tag);
        if (tagUrls) {
          tagUrls.delete(url);
          if (tagUrls.size === 0) this.#tagIndex.delete(tag);
        }
      }
      this.#store.delete(url);
    }
  }
}

// Utilisation
const cache = new TaggedCache();

cache.set('/produit/42',
  '{"id":42,"nom":"Clavier"}',
  ['product-42', 'category-tech', 'promo-noel'],
  3600
);

cache.set('/categorie/tech',
  '{"produits":[42,43,44]}',
  ['category-tech', 'product-42', 'product-43', 'product-44'],
  1800
);

cache.set('/accueil',
  '{"featured":[42]}',
  ['homepage', 'product-42', 'promo-noel'],
  600
);

console.log('Stats avant purge:', cache.stats());
// { entries: 3, tags: 5, tagDetails: { 'product-42': 3, ... } }

cache.purgeByTag('product-42');
// Purge /produit/42, /categorie/tech, /accueil (toutes ont le tag product-42)

console.log('Stats apres purge:', cache.stats());
// { entries: 0, tags: 0, tagDetails: {} }
```

---

## 5. Patterns de cache applicatif

### 5.1 In-memory cache (Map, LRU)

Le plus simple : un `Map` ou un LRU cache directement dans le processus Node.js.

```js
// LRU Cache simple (sans dependance externe)
class LRUCache {
  #max;
  #cache = new Map();

  constructor(max = 1000) {
    this.#max = max;
  }

  get(key) {
    if (!this.#cache.has(key)) return undefined;
    // Deplacer en fin (plus recent)
    const value = this.#cache.get(key);
    this.#cache.delete(key);
    this.#cache.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.#cache.has(key)) {
      this.#cache.delete(key);
    } else if (this.#cache.size >= this.#max) {
      // Supprimer le plus ancien (premier element)
      const firstKey = this.#cache.keys().next().value;
      this.#cache.delete(firstKey);
    }
    this.#cache.set(key, value);
  }

  delete(key) { this.#cache.delete(key); }
  get size() { return this.#cache.size; }
  clear() { this.#cache.clear(); }
}
```

**Avantages** : ultra-rapide (~ns), pas de dependance.
**Inconvenients** : pas partage entre processus, perdu au redemarrage.

### 5.2 Redis cache (distribue)

```js
// Pseudo-code illustrant le pattern avec Redis
// (necessiterait le package 'redis' en vrai)

import { createServer } from 'node:http';

// Simuler Redis avec un Map + TTL
class SimulatedRedis {
  #store = new Map();
  #timers = new Map();

  async get(key) {
    const entry = this.#store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.#store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key, value, options = {}) {
    const entry = { value };
    if (options.EX) {
      entry.expiresAt = Date.now() + options.EX * 1000;
    }
    this.#store.set(key, entry);
  }

  async del(key) {
    this.#store.delete(key);
  }

  // MGET : obtenir plusieurs cles en une seule operation
  async mget(...keys) {
    return keys.map(key => {
      const entry = this.#store.get(key);
      if (!entry) return null;
      if (entry.expiresAt && Date.now() > entry.expiresAt) return null;
      return entry.value;
    });
  }
}

const redis = new SimulatedRedis();

// Pattern : Cache-Aside (Lazy Loading)
async function getProductCacheAside(id) {
  // 1. Chercher dans Redis
  const cached = await redis.get(`product:${id}`);
  if (cached) {
    console.log(`[Redis] HIT product:${id}`);
    return JSON.parse(cached);
  }

  // 2. Aller en DB
  console.log(`[Redis] MISS product:${id}, requete DB`);
  const product = await queryDatabase(id);

  // 3. Stocker en Redis
  await redis.set(`product:${id}`, JSON.stringify(product), { EX: 3600 });

  return product;
}

async function queryDatabase(id) {
  // Simuler une requete DB lente
  await new Promise(r => setTimeout(r, 50));
  return { id, nom: `Produit ${id}`, prix: Math.random() * 100 };
}
```

**Avantages** : partage entre processus/serveurs, persistant, rapide (~1ms).
**Inconvenients** : dependance externe, latence reseau.

### 5.3 Write-Through vs Write-Behind (Write-Back)

```
Write-Through :
===============
L'application ecrit simultanement dans le cache ET la DB.

  App ---> [Ecriture cache] + [Ecriture DB] --> Reponse
           (synchrone)        (synchrone)

  + Coherence forte : cache toujours a jour
  - Latence d'ecriture doublee

Write-Behind (Write-Back) :
===========================
L'application ecrit dans le cache, puis la DB est mise a jour en asynchrone.

  App ---> [Ecriture cache] --> Reponse (rapide !)
                |
                +--> [Ecriture DB en arriere-plan]

  + Latence d'ecriture faible
  - Risque de perte de donnees si crash avant ecriture DB
```

### 5.4 Implementation Write-Through vs Write-Behind

```js
import { createServer } from 'node:http';

// Simuler Redis et DB
const redisStore = new Map();
const dbStore = new Map([
  ['42', { id: '42', nom: 'Clavier', prix: 89.99 }]
]);

// ---- Write-Through ----
async function writeThroughUpdate(id, updates) {
  const product = dbStore.get(id);
  if (!product) throw new Error('Non trouve');

  Object.assign(product, updates);

  // Ecriture synchrone : DB ET cache
  dbStore.set(id, product);                                    // DB
  redisStore.set(`product:${id}`, JSON.stringify(product));    // Cache

  console.log(`[Write-Through] DB + Cache mis a jour pour ${id}`);
  return product;
}

// ---- Write-Behind ----
const writeQueue = [];
let queueTimer = null;

async function writeBehindUpdate(id, updates) {
  const product = dbStore.get(id);
  if (!product) throw new Error('Non trouve');

  Object.assign(product, updates);

  // Ecriture immediate dans le cache
  redisStore.set(`product:${id}`, JSON.stringify(product));
  console.log(`[Write-Behind] Cache mis a jour pour ${id}`);

  // Ecriture DB en asynchrone (queue)
  writeQueue.push({ id, product: { ...product } });
  scheduleFlush();

  return product;
}

function scheduleFlush() {
  if (queueTimer) return;
  queueTimer = setTimeout(async () => {
    const batch = writeQueue.splice(0);
    console.log(`[Write-Behind] Flush de ${batch.length} ecritures en DB`);
    for (const item of batch) {
      dbStore.set(item.id, item.product);
    }
    queueTimer = null;
    if (writeQueue.length > 0) scheduleFlush();
  }, 1000); // Flush toutes les secondes
}

// ---- Serveur ----
const server = createServer(async (req, res) => {
  const match = req.url.match(/^\/api\/produits\/(\d+)$/);
  if (!match) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const id = match[1];

  if (req.method === 'GET') {
    // Lire depuis le cache d'abord
    const cached = redisStore.get(`product:${id}`);
    if (cached) {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'X-Cache': 'HIT'
      });
      res.end(cached);
      return;
    }

    const product = dbStore.get(id);
    if (!product) {
      res.writeHead(404);
      res.end('Non trouve');
      return;
    }

    redisStore.set(`product:${id}`, JSON.stringify(product));
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'X-Cache': 'MISS'
    });
    res.end(JSON.stringify(product));
    return;
  }

  if (req.method === 'PUT') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const updates = JSON.parse(body);

    // Choisir la strategie via un query param
    const strategy = new URL(req.url, 'http://localhost').searchParams.get('strategy')
                     || 'write-through';

    try {
      let result;
      if (strategy === 'write-behind') {
        result = await writeBehindUpdate(id, updates);
      } else {
        result = await writeThroughUpdate(id, updates);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  res.writeHead(405);
  res.end('Methode non supportee');
});

server.listen(3000, () => {
  console.log('Serveur Write-Through/Write-Behind sur http://localhost:3000');
});
```

### 5.5 Comparaison des patterns de cache applicatif

| Pattern | Coherence | Perf lecture | Perf ecriture | Complexite |
|---------|-----------|-------------|---------------|------------|
| Cache-Aside | Eventuelle | Rapide (apres 1er miss) | Normale | Faible |
| Read-Through | Eventuelle | Rapide | Normale | Moyenne |
| Write-Through | Forte | Rapide | Plus lente | Moyenne |
| Write-Behind | Eventuelle | Rapide | Tres rapide | Elevee |
| Refresh-Ahead | Proactive | Rapide | Normale | Elevee |

---

## 6. Strategies de TTL multi-couches

### 6.1 La regle du "TTL decroissant"

```
Regle d'or : le TTL doit DIMINUER en s'eloignant de la source
=============================================================

  DB          (source de verite - pas de TTL)
  App Cache   TTL = 3600s (1 heure)
  Rev. Proxy  TTL = 300s  (5 minutes)
  CDN         TTL = 120s  (2 minutes)
  Browser     TTL = 30s   (30 secondes)

Pourquoi ? Plus on est loin de la source, plus c'est difficile a invalider.
Le browser est le PLUS difficile a invalider (impossible de l'exterieur).
Donc on lui donne le TTL le plus court.
```

### 6.2 Anti-pattern : TTL inversé

```
NE PAS FAIRE :
  Browser     TTL = 86400s  (24 heures)   <-- DANGER !
  CDN         TTL = 3600s   (1 heure)
  App Cache   TTL = 60s     (1 minute)

Probleme : meme si on purge le CDN et l'app cache,
le navigateur sert du contenu stale pendant 24h !
On ne peut PAS purger le cache navigateur de l'exterieur.
```

### 6.3 Configuration type par scenario

```
Page produit e-commerce :
  Browser : max-age=30, stale-while-revalidate=60
  CDN :     CDN-Cache-Control: max-age=300
  Proxy :   TTL 120s
  Redis :   EXPIRE 3600

API de recherche :
  Browser : no-cache (revalide toujours)
  CDN :     CDN-Cache-Control: max-age=60
  Proxy :   TTL 30s
  Redis :   EXPIRE 300

Assets statiques (avec hash) :
  Browser : max-age=31536000, immutable
  CDN :     max-age=31536000, immutable
  Proxy :   TTL 31536000
  Redis :   N/A (pas besoin)
```

---

## Points cles

1. Une requete peut traverser **5 couches de cache** : Browser, CDN, Reverse Proxy, App Cache, DB.
2. La **coherence eventuelle** est acceptable pour la plupart des cas ; la coherence forte est reservee aux donnees critiques (finance, auth).
3. L'**invalidation en cascade** doit se faire de l'interieur vers l'exterieur : DB -> App Cache -> Proxy -> CDN -> (Browser : impossible).
4. Les **Surrogate Keys** (cache tags) permettent d'invalider toutes les URLs liees a une entite en une seule operation.
5. **Write-Through** garantit la coherence cache/DB mais double la latence d'ecriture.
6. **Write-Behind** offre des ecritures ultra-rapides mais risque la perte de donnees.
7. Le **TTL doit decroitre** en s'eloignant de la source : Redis (long) > CDN (moyen) > Browser (court).
8. Le cache navigateur est **impossible a invalider de l'exterieur** -- c'est pour ca qu'il doit avoir le TTL le plus court ou utiliser `no-cache`.

---

## Lab associe

> Lab 09 — Construire un systeme de cache a 3 couches (in-memory, reverse proxy, CDN simule) avec invalidation en cascade et purge par tag

---

## Pour aller plus loin

- [Architecture of a Multi-Layer Cache](https://www.varnish-software.com/developers/tutorials/multi-tier-caching/)
- [Redis Caching Patterns](https://redis.io/docs/manual/patterns/)
- [Fastly - Surrogate Keys Cookbook](https://docs.fastly.com/en/guides/purging-api-cache-with-surrogate-keys)
- [Facebook - TAO: Distributed Data Store for the Social Graph](https://www.usenix.org/conference/atc13/technical-sessions/presentation/bronson)
- [Martin Fowler - Cache Strategies](https://martinfowler.com/bliki/TwoHardThings.html)

---

## Si tu es perdu

Imagine un supermarche :

- **La DB**, c'est le producteur agricole (source de verite)
- **Redis**, c'est l'entrepot du supermarche (stock en gros, rapide a acceder)
- **Le reverse proxy**, c'est le rayon du magasin (visible, pre-arrange)
- **Le CDN**, c'est le supermarche le plus pres de chez toi (geographiquement proche)
- **Le browser cache**, c'est ton frigo a la maison (le plus rapide mais tu ne peux pas le vider a distance)

Quand un produit est rappele (invalidation), il faut :
1. Prevenir le producteur (DB : mise a jour)
2. Retirer du stock en entrepot (Redis : DEL)
3. Retirer du rayon (Proxy : PURGE)
4. Prevenir tous les supermarches (CDN : purge par tag)
5. Ton frigo ? On ne peut que mettre une date de peremption courte (TTL court) et esperer que tu verifies !

---

## Defi

### Enonce

Tu geres un site e-commerce avec :
- 10 000 produits en DB
- Redis avec un TTL de 1h par produit
- Varnish comme reverse proxy (TTL 5 min)
- Cloudflare comme CDN (TTL 10 min)
- Browser cache avec `max-age=60`

Le produit 42 passe en promotion (-50%). Decris **etape par etape** ce qui se passe pour :

1. La mise a jour initiale
2. Un utilisateur qui avait deja la page en cache navigateur
3. Un utilisateur dans un POP CDN qui n'a pas encore recu la purge
4. Quel est le temps maximum avant que TOUS les utilisateurs voient le nouveau prix ?

### Reponse

```
1. Mise a jour initiale :
   a) UPDATE db SET prix = 44.99 WHERE id = 42
   b) redis.del('product:42')
   c) Varnish: PURGE /produit/42
   d) Cloudflare API: purge par tag "product-42"
   Temps : ~2 secondes pour tout invalider

2. Utilisateur avec cache navigateur :
   - Il voit encore l'ancien prix (89.99 EUR)
   - Pendant max 60 secondes (max-age=60)
   - Au prochain chargement apres 60s, il revalide
   - Il obtient le nouveau prix

3. Utilisateur dans un POP non purge :
   - Cloudflare purge en ~30 secondes (tous les POPs)
   - Pendant ces 30s, certains POPs peuvent servir le stale
   - Apres purge, prochaine requete = miss = origin = nouveau prix

4. Temps maximum avant convergence :
   - CDN purge : ~30s
   - Browser max-age : 60s
   - PIRE CAS : un utilisateur a charge la page a T-1s,
     le cache expire a T+59s, le CDN est purge a T+30s
     --> Max 60 secondes (dicte par le browser cache)

   C'est pour ca que le browser doit avoir le TTL le plus court !
```
