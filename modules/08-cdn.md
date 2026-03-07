# Module 08 — CDN (Content Delivery Network)

> **Objectif** : Comprendre l'architecture d'un CDN, les mecanismes de mise en cache edge, la hierarchie de cache et les strategies de purge utilisees par les principaux fournisseurs.
> **Difficulte** : :star::star::star:

---

## 1. Architecture d'un CDN

### 1.1 Pourquoi un CDN ?

Sans CDN, tous les utilisateurs du monde entier se connectent a un seul serveur :

```
SANS CDN :
                                    +--------+
  Utilisateur Paris -----3000km---> |        |
  Utilisateur Tokyo ----10000km---> | Origin | <-- Un seul serveur
  Utilisateur New York ---6000km--> | Server |     a Paris
  Utilisateur Sydney ---17000km---> |        |
                                    +--------+
  Latence = distance / vitesse de la lumiere + sauts reseau
  Tokyo -> Paris : ~250ms minimum (physique !)
```

Avec un CDN, des copies du contenu sont distribuees partout :

```
AVEC CDN :
  Utilisateur Paris ----5ms----> [POP Paris] -------+
  Utilisateur Tokyo ----5ms----> [POP Tokyo] -------+---> Origin Paris
  Utilisateur NY -------5ms----> [POP New York] ----+     (si cache miss)
  Utilisateur Sydney ---5ms----> [POP Sydney] ------+
```

### 1.2 Vocabulaire cle

| Terme | Definition |
|-------|-----------|
| **POP** | Point of Presence -- un datacenter du CDN dans une region |
| **Edge Server** | Serveur dans un POP qui cache et sert le contenu |
| **Origin Server** | Ton serveur d'origine, la source de verite |
| **Shield** | Serveur intermediaire qui protege l'origin |
| **Hit Ratio** | % de requetes servies par le cache (objectif : > 90%) |
| **TTL** | Time To Live -- duree de vie d'un contenu en cache |
| **Purge** | Suppression forcee d'un contenu du cache |

### 1.3 L'analogie de la franchise de restaurants

- **Origin** = la cuisine centrale qui cree les recettes
- **Shield** = l'entrepot regional qui stocke les ingredients
- **POP/Edge** = chaque restaurant local qui sert les clients
- **Purge** = rappeler un plat dans tous les restaurants (ex: alerte sanitaire)

---

## 2. Comment le CDN decide de cacher

### 2.1 Headers standard : Cache-Control

Le CDN respecte les headers `Cache-Control` envoyes par l'origin :

```http
Cache-Control: public, max-age=3600, s-maxage=86400
```

- `public` : autorise le cache partage (CDN)
- `max-age=3600` : le navigateur cache 1 heure
- `s-maxage=86400` : le CDN cache 24 heures (prioritaire sur max-age pour les caches partages)

```
Priorite des directives pour un CDN :
=====================================
1. s-maxage      (specifique aux caches partages)
2. max-age       (si s-maxage absent)
3. Expires       (si Cache-Control absent)
4. Heuristique   (basee sur Last-Modified, en dernier recours)
```

### 2.2 Surrogate-Control (Ancien, Akamai)

```http
Surrogate-Control: max-age=86400
Cache-Control: no-cache
```

Ce pattern permet de dire :
- **CDN** : cache pendant 24h (`Surrogate-Control`)
- **Navigateur** : revalide a chaque requete (`Cache-Control: no-cache`)
- Le CDN **supprime** le header `Surrogate-Control` avant de transmettre au client

### 2.3 CDN-Cache-Control (Moderne, standardise)

Le header `CDN-Cache-Control` est une approche plus propre et standardisee :

```http
CDN-Cache-Control: max-age=86400
Cache-Control: max-age=60
```

- Le CDN utilise `CDN-Cache-Control` (24h)
- Le navigateur utilise `Cache-Control` (60s)
- Le CDN **supprime** `CDN-Cache-Control` avant de transmettre

### 2.4 Hierarchie des headers selon les CDN

| Header | Cloudflare | Fastly | Akamai | Standard |
|--------|-----------|--------|--------|----------|
| `CDN-Cache-Control` | Oui | Oui | Oui | RFC 9213 |
| `Surrogate-Control` | Non | Oui | Oui | W3C TR |
| `Cloudflare-CDN-Cache-Control` | Oui | Non | Non | Proprietaire |
| `Cache-Control: s-maxage` | Oui | Oui | Oui | RFC 9111 |

### 2.5 Implementation serveur avec headers CDN

```js
import { createServer } from 'node:http';

const server = createServer((req, res) => {
  if (req.url === '/api/articles') {
    const articles = [
      { id: 1, titre: 'Introduction au cache', date: '2024-01-15' },
      { id: 2, titre: 'CDN avance', date: '2024-01-20' }
    ];

    res.writeHead(200, {
      'Content-Type': 'application/json',
      // Le navigateur cache 60s
      'Cache-Control': 'public, max-age=60',
      // Le CDN cache 24h (prioritaire pour les caches partages)
      'CDN-Cache-Control': 'max-age=86400',
      // Surrogate keys pour purge ciblee (Fastly, Varnish)
      'Surrogate-Key': 'articles article-1 article-2',
      // ETag pour revalidation
      'ETag': '"articles-v42"',
      // Vary pour cache contextuel
      'Vary': 'Accept-Encoding, Accept-Language'
    });

    res.end(JSON.stringify(articles));
    return;
  }

  if (req.url === '/images/hero.webp') {
    res.writeHead(200, {
      'Content-Type': 'image/webp',
      // Meme TTL partout pour les assets statiques
      'Cache-Control': 'public, max-age=2592000, immutable',
      'Surrogate-Key': 'images static'
    });
    res.end('(contenu image binaire)');
    return;
  }

  if (req.url === '/api/panier') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      // Jamais cacher dans le CDN ! Donnees personnelles.
      'Cache-Control': 'private, no-store',
      'CDN-Cache-Control': 'no-store'
    });
    res.end(JSON.stringify({ items: [] }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(4000, () => {
  console.log('Origin server sur http://localhost:4000');
});
```

---

## 3. Cache hierarchy : L1 Edge, L2 Shield, Origin

### 3.1 Le probleme du "thundering herd"

Sans hierarchie, quand un contenu expire dans un POP, CHAQUE POP va chercher a l'origin :

```
SANS Shield (mauvais) :
  [POP Paris]   -- cache miss --> Origin  \
  [POP Tokyo]   -- cache miss --> Origin   |-- 50 requetes simultanees !
  [POP NY]      -- cache miss --> Origin   |   L'origin est submerge.
  ...47 autres POPs...        --> Origin  /
```

### 3.2 Architecture a 2 niveaux

```
AVEC Shield (bon) :
                                  Shield
  [POP Paris]  -- miss --> [L2 Bouclier] -- miss (1 seule!) --> Origin
  [POP Lyon]   -- miss --> [   Paris    ] -- HIT ------------->
  [POP Madrid] -- miss --> [            ] -- HIT ------------->

  [POP Tokyo]  -- miss --> [L2 Bouclier] -- miss (1 seule!) --> Origin
  [POP Seoul]  -- miss --> [   Tokyo    ] -- HIT ------------->
  [POP Osaka]  -- miss --> [            ] -- HIT ------------->
```

### 3.3 Diagramme complet

```
Utilisateur
     |
     v
+----------+     +----------+     +----------+
| L1 Edge  | --> | L2 Shield| --> |  Origin  |
|  (POP)   |     | (region) |     | (serveur)|
+----------+     +----------+     +----------+
  ~5ms           ~20ms            ~200ms
  Hit ratio      Hit ratio        Toujours
  ~80-90%        ~95-99%          disponible

Chaque niveau reduit la charge sur le suivant.
```

### 3.4 Request collapsing / coalescing

Quand plusieurs requetes identiques arrivent simultanement a un POP, le CDN n'envoie **qu'une seule** requete vers le shield/origin :

```
Request Collapsing :
=====================================

  Req 1 ---> [POP] --+
  Req 2 ---> [POP] --+--> 1 seule requete --> Shield/Origin
  Req 3 ---> [POP] --+
  Req 4 ---> [POP] --+
                      |
                      +--> Reponse dupliquee a tous les 4 clients
```

### 3.5 Simuler une hierarchie de cache

```js
import { createServer, request as httpRequest } from 'node:http';

// ---- Couche de cache generique ----
class CacheLayer {
  #name;
  #cache = new Map();
  #pendingRequests = new Map(); // Pour le request collapsing

  constructor(name) {
    this.#name = name;
  }

  async get(key, fetchFromUpstream) {
    // Verifier le cache
    const entry = this.#cache.get(key);
    if (entry && Date.now() - entry.storedAt < entry.ttl) {
      console.log(`[${this.#name}] HIT pour ${key}`);
      return { ...entry, source: this.#name };
    }

    // Request collapsing : si une requete est deja en cours, attendre
    if (this.#pendingRequests.has(key)) {
      console.log(`[${this.#name}] COALESCE pour ${key}`);
      return this.#pendingRequests.get(key);
    }

    // Cache miss : aller upstream
    console.log(`[${this.#name}] MISS pour ${key}`);
    const promise = fetchFromUpstream(key).then(result => {
      this.#cache.set(key, {
        body: result.body,
        storedAt: Date.now(),
        ttl: result.ttl || 60000
      });
      this.#pendingRequests.delete(key);
      return { ...result, source: this.#name };
    });

    this.#pendingRequests.set(key, promise);
    return promise;
  }

  purge(key) {
    this.#cache.delete(key);
    console.log(`[${this.#name}] PURGE ${key}`);
  }

  purgeAll() {
    this.#cache.clear();
    console.log(`[${this.#name}] PURGE ALL`);
  }
}

// ---- Creer la hierarchie ----
const edgeCache = new CacheLayer('L1-Edge');
const shieldCache = new CacheLayer('L2-Shield');

// Simuler l'origin (couteux)
async function originFetch(key) {
  console.log(`[Origin] Traitement de ${key}...`);
  await new Promise(r => setTimeout(r, 200)); // 200ms de traitement
  return {
    body: JSON.stringify({
      data: `Contenu pour ${key}`,
      generatedAt: new Date().toISOString()
    }),
    ttl: 60000 // 60 secondes
  };
}

// ---- Serveur Edge ----
const server = createServer(async (req, res) => {
  if (req.url.startsWith('/purge/')) {
    const key = req.url.replace('/purge', '');
    edgeCache.purge(key);
    shieldCache.purge(key);
    res.writeHead(200);
    res.end('Purge OK');
    return;
  }

  const start = Date.now();

  // Edge -> Shield -> Origin
  const result = await edgeCache.get(req.url, (key) => {
    return shieldCache.get(key, originFetch);
  });

  const elapsed = Date.now() - start;

  res.writeHead(200, {
    'Content-Type': 'application/json',
    'X-Cache-Source': result.source,
    'X-Response-Time': `${elapsed}ms`
  });
  res.end(result.body);
});

server.listen(3000, () => {
  console.log('CDN simule sur http://localhost:3000');
  console.log('1er appel : curl http://localhost:3000/api/test   (MISS)');
  console.log('2e appel  : curl http://localhost:3000/api/test   (HIT)');
  console.log('Purge     : curl http://localhost:3000/purge/api/test');
});
```

---

## 4. Purging : strategies de purge

### 4.1 Pourquoi purger ?

Le cache a un TTL, mais parfois on veut invalider **immediatement** :

- Correction d'une erreur sur le site
- Mise a jour de prix
- Contenu supprime pour raisons legales
- Deploiement d'une nouvelle version

### 4.2 Les 3 types de purge

```
+------------------+------------------------------------------+
| Type             | Description                              |
+------------------+------------------------------------------+
| Purge par URL    | Invalider une URL precise                |
| Purge par tag    | Invalider toutes les URLs avec un tag    |
| Soft purge       | Marquer comme stale (pas supprimer)      |
+------------------+------------------------------------------+
```

### 4.3 Purge par URL

```
# Cloudflare API
curl -X POST "https://api.cloudflare.com/client/v4/zones/{zone_id}/purge_cache" \
  -H "Authorization: Bearer {token}" \
  -d '{"files":["https://example.com/style.css"]}'

# Fastly API
curl -X PURGE "https://example.com/style.css" \
  -H "Fastly-Key: {token}"

# Akamai (CCU API v3)
curl -X POST "https://edgegrid.akamai.com/ccu/v3/invalidate/url/production" \
  -d '{"objects":["https://example.com/style.css"]}'
```

**Avantage** : simple et precis.
**Inconvenient** : si tu as 10 000 URLs a purger, ca prend du temps.

### 4.4 Purge par tag (Surrogate Keys)

C'est la methode la plus puissante. L'origin envoie des tags avec chaque reponse :

```http
HTTP/1.1 200 OK
Content-Type: application/json
Surrogate-Key: articles article-42 auteur-alice categorie-tech
Cache-Control: public, s-maxage=86400
```

Pour purger tout ce qui concerne l'article 42 :

```
# Fastly
curl -X POST "https://api.fastly.com/service/{id}/purge/article-42" \
  -H "Fastly-Key: {token}"
```

Cela invalide **toutes les URLs** qui portent le tag `article-42` :
- `/articles/42`
- `/api/articles/42`
- `/feed` (qui contient l'article 42)
- `/auteur/alice` (qui liste l'article 42)

```
Purge par tag : vue schematique
================================

Tag "article-42" est present sur :

  /articles/42          --> PURGE
  /api/articles/42      --> PURGE
  /feed                 --> PURGE (contient l'article 42)
  /auteur/alice         --> PURGE (liste l'article 42)
  /articles/43          --> PAS purge (tag different)
```

### 4.5 Soft Purge

Au lieu de supprimer le contenu du cache, on le marque comme **stale**. Le CDN peut alors :
- Servir le stale via `stale-while-revalidate`
- Revalider en arriere-plan

```
# Fastly soft purge
curl -X PURGE "https://example.com/articles/42" \
  -H "Fastly-Key: {token}" \
  -H "Fastly-Soft-Purge: 1"
```

```
Purge classique :         Soft Purge :
  Cache: article-42         Cache: article-42
        |                         |
  [PURGE] --> Supprime      [SOFT PURGE] --> Marque stale
        |                         |
  Prochaine requete :       Prochaine requete :
  MISS --> origin           Sert stale + revalide en bg
  (latence elevee)          (latence faible)
```

### 4.6 Comparaison des CDN

| Fonctionnalite | Cloudflare | Fastly | Akamai |
|---------------|-----------|--------|--------|
| Purge par URL | Oui (gratuit) | Oui | Oui |
| Purge par tag | Enterprise | Oui (natif) | Oui |
| Purge globale | Oui | Oui | Oui |
| Soft purge | Non | Oui (natif) | Oui |
| Temps de purge | ~30s | ~150ms | ~5s |
| Surrogate-Key | Cache-Tag | Surrogate-Key | Edge-Cache-Tag |
| Logique edge | Workers (JS) | VCL | EdgeWorkers (JS) |
| CDN-Cache-Control | Oui | Oui | Oui |

---

## 5. Configuration CDN : exemples concrets

### 5.1 Cloudflare : Page Rules et Cache Rules

```
Cloudflare Cache Rules (dashboard ou API) :
=============================================

Regle 1 : Assets statiques
  Si : URI contient /static/ OU extension dans {js, css, png, webp, woff2}
  Alors : Cache 30 jours, Browser TTL 7 jours

Regle 2 : API publique
  Si : URI commence par /api/public/
  Alors : Cache 5 minutes, Browser TTL 60s

Regle 3 : Contenu prive
  Si : Cookie contient "session_id"
  Alors : Bypass cache
```

### 5.2 Fastly : VCL (Varnish Configuration Language)

```vcl
# Fastly VCL personnalise

sub vcl_recv {
  # Ne pas cacher les requetes avec cookie de session
  if (req.http.Cookie ~ "session_id") {
    return(pass);
  }
}

sub vcl_fetch {
  # Assets statiques : cache 30 jours
  if (req.url ~ "\.(js|css|png|webp|woff2)$") {
    set beresp.ttl = 30d;
    set beresp.http.Cache-Control = "public, max-age=2592000, immutable";
  }

  # API : cache 5 minutes avec SWR
  if (req.url ~ "^/api/") {
    set beresp.ttl = 5m;
    set beresp.stale_while_revalidate = 60s;
    set beresp.stale_if_error = 86400s;
  }
}

sub vcl_deliver {
  # Ajouter un header pour debugger
  if (obj.hits > 0) {
    set resp.http.X-Cache = "HIT";
    set resp.http.X-Cache-Hits = obj.hits;
  } else {
    set resp.http.X-Cache = "MISS";
  }
}
```

### 5.3 Headers de debug CDN

```
Headers de reponse utiles pour debugger :
==========================================

Cloudflare :
  CF-Cache-Status: HIT | MISS | EXPIRED | DYNAMIC | BYPASS
  CF-Ray: 7a1234567890-CDG    (identifiant + POP)
  Age: 3600                    (secondes depuis le cache)

Fastly :
  X-Cache: HIT | MISS
  X-Cache-Hits: 42
  X-Served-By: cache-cdg20734-CDG
  X-Timer: S1705324800.123

Akamai :
  X-Cache: TCP_HIT from a23-45-67-89
  X-Akamai-Request-ID: abcdef123
  X-Check-Cacheable: YES
```

### 5.4 Implementation : origin qui coopere avec le CDN

```js
import { createServer } from 'node:http';

// Simuler une base de donnees
const articles = new Map([
  ['1', { titre: 'Cache HTTP 101', auteur: 'alice', categorie: 'tech' }],
  ['2', { titre: 'Node.js avance', auteur: 'bob', categorie: 'tech' }],
  ['3', { titre: 'Recette de gateau', auteur: 'alice', categorie: 'cuisine' }]
]);

function buildSurrogateKeys(article, id) {
  // Chaque article porte plusieurs tags pour permettre la purge ciblee
  return [
    `article-${id}`,
    `auteur-${article.auteur}`,
    `categorie-${article.categorie}`,
    'articles' // tag global
  ].join(' ');
}

const server = createServer((req, res) => {
  // ---- Liste des articles ----
  if (req.url === '/api/articles') {
    const allArticles = [];
    const allKeys = new Set(['articles']);

    for (const [id, article] of articles) {
      allArticles.push({ id, ...article });
      allKeys.add(`article-${id}`);
      allKeys.add(`auteur-${article.auteur}`);
      allKeys.add(`categorie-${article.categorie}`);
    }

    res.writeHead(200, {
      'Content-Type': 'application/json',
      // Pour le navigateur : fraicheur courte
      'Cache-Control': 'public, max-age=60',
      // Pour le CDN : fraicheur longue
      'CDN-Cache-Control': 'max-age=3600',
      // Tags pour purge ciblee
      'Surrogate-Key': [...allKeys].join(' '),
      'Cache-Tag': [...allKeys].join(','), // Format Cloudflare
      'Vary': 'Accept-Encoding'
    });

    res.end(JSON.stringify(allArticles));
    return;
  }

  // ---- Article individuel ----
  const match = req.url.match(/^\/api\/articles\/(\d+)$/);
  if (match) {
    const id = match[1];
    const article = articles.get(id);

    if (!article) {
      res.writeHead(404, {
        'Cache-Control': 'no-cache',
        'CDN-Cache-Control': 'max-age=10' // Cache les 404 brievement
      });
      res.end(JSON.stringify({ error: 'Article non trouve' }));
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60',
      'CDN-Cache-Control': 'max-age=3600',
      'Surrogate-Key': buildSurrogateKeys(article, id),
      'ETag': `"article-${id}-v${Date.now()}"`,
      'Vary': 'Accept-Encoding'
    });

    res.end(JSON.stringify({ id, ...article }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(4000, () => {
  console.log('Origin server (CDN-ready) sur http://localhost:4000');
});
```

---

## Points cles

1. Un **CDN** distribue des copies du contenu dans des **POP** proches des utilisateurs, reduisant la latence.
2. Les **edge servers** dans chaque POP servent le contenu en cache ; le **shield** protege l'origin des cache miss multiples.
3. `s-maxage` controle le TTL du CDN independamment du navigateur ; `CDN-Cache-Control` est l'approche moderne standardisee.
4. La **hierarchie L1/L2** (Edge/Shield) permet d'atteindre un hit ratio > 99% et protege l'origin du "thundering herd".
5. Le **request collapsing** fusionne les requetes simultanees identiques en une seule requete upstream.
6. La **purge par tag** (Surrogate Keys) est la methode la plus puissante : une seule commande invalide toutes les URLs liees.
7. Le **soft purge** marque le contenu comme stale au lieu de le supprimer, permettant le SWR.
8. Toujours ajouter des **headers de debug** (`X-Cache`, `X-Cache-Hits`) pour diagnostiquer les problemes de cache en production.

---

## Lab associe

> Lab 08 — Construire un mini-CDN avec hierarchie L1/L2, request collapsing et purge par tag avec `node:http`

---

## Pour aller plus loin

- [RFC 9213 - Targeted HTTP Cache Control](https://datatracker.ietf.org/doc/html/rfc9213)
- [Cloudflare - How caching works](https://developers.cloudflare.com/cache/)
- [Fastly - Surrogate Keys](https://docs.fastly.com/en/guides/purging-api-cache-with-surrogate-keys)
- [Akamai - Edge Caching](https://techdocs.akamai.com/property-mgr/docs/caching-2)
- [web.dev - Content delivery networks](https://web.dev/content-delivery-networks/)

---

## Si tu es perdu

Pense a une chaine de pizzerias :

- **L'origin**, c'est la cuisine centrale a Paris qui cree les recettes
- **Le shield**, c'est l'entrepot regional (un par grande zone) qui stocke les ingredients prepares
- **Le POP/edge**, c'est le restaurant local pres de chez toi qui assemble et sert la pizza

Quand tu commandes une Margherita :
1. Le restaurant local regarde s'il en a une prete (edge cache HIT)
2. Sinon, il demande a l'entrepot regional (shield HIT)
3. En dernier recours, il demande a la cuisine centrale (origin)

La **purge**, c'est quand la cuisine centrale dit : "La recette de la Margherita a change, jetez toutes les anciennes !". Par tag, on peut dire : "Tout ce qui contient de la mozzarella, jetez-le !" -- ca touche la Margherita, la 4 Fromages, etc.

---

## Exercice pratique — Analyser de vrais headers CDN

Jusqu'ici, nous avons simule le comportement d'un CDN avec du code local. Il est temps d'observer de **vrais headers CDN en production** en interrogeant des ressources servies par Cloudflare et Fastly.

> **Pre-requis** : avoir `curl` installe (disponible par defaut sur macOS, Linux et Windows avec Git Bash / WSL).

### Exercice 1 : Analyser les headers Cloudflare

Cloudflare est l'un des CDN les plus repandus. Interrogeons une librairie JavaScript populaire hebergee sur leur reseau :

```bash
curl -sI https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js \
  | grep -iE "(cache-control|cf-cache|age|x-cache|server|etag|vary|content-encoding)"
```

**Exemple de reponse :**

```
server: cloudflare
cache-control: public, max-age=30672000
cf-cache-status: HIT
age: 245832
etag: "6234f9087a93c21c4ce04e47-xxx"
vary: Accept-Encoding
content-encoding: br
```

**Analyse des headers :**

| Header | Signification |
|--------|--------------|
| `server: cloudflare` | Confirme que la reponse est servie par le reseau Cloudflare |
| `cache-control: public, max-age=30672000` | Le contenu est cacheable par tous (CDN + navigateur) pendant ~355 jours. C'est typique pour un asset statique versionne |
| `cf-cache-status: HIT` | Header **proprietaire Cloudflare**. Valeurs possibles : `HIT` (servi depuis le cache edge), `MISS` (pas en cache, recupere a l'origin), `EXPIRED` (etait en cache mais TTL depasse), `DYNAMIC` (jamais cache), `BYPASS` (regle de contournement) |
| `age: 245832` | Le contenu est en cache depuis ~2.8 jours (245 832 secondes). Ce header est standard HTTP (RFC 9111) |
| `etag` | Identifiant unique de la version du fichier, utilise pour la revalidation conditionnelle |
| `vary: Accept-Encoding` | Le CDN stocke des variantes differentes selon l'encodage demande (gzip, brotli, etc.) |
| `content-encoding: br` | La reponse est compressée en Brotli |

> **A propos de `cf-ray`** : Cloudflare ajoute egalement un header `cf-ray` (ex: `cf-ray: 7a1234567890-CDG`). C'est un identifiant unique de requete. Les 3 dernieres lettres (`CDG`) indiquent le **POP** (Point of Presence) qui a servi la reponse -- ici l'aeroport Charles-de-Gaulle a Paris. Cet identifiant est essentiel pour le **debugging** : il permet au support Cloudflare de retrouver exactement le trajet de la requete.

---

### Exercice 2 : Comparer avec un CDN different (jsDelivr / Fastly)

jsDelivr utilise le reseau **Fastly** comme CDN. Comparons les headers avec la meme librairie :

```bash
curl -sI https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js \
  | grep -iE "(cache-control|x-cache|age|server|etag|vary|content-encoding|x-served-by)"
```

**Exemple de reponse :**

```
cache-control: public, max-age=31536000, s-maxage=31536000, immutable
x-cache: HIT
age: 1209600
vary: Accept-Encoding
content-encoding: br
x-served-by: cache-cdg20734-CDG, cache-par-lfpg1960042-PAR
```

**Differences notables avec Cloudflare :**

| Aspect | Cloudflare (cdnjs) | Fastly (jsDelivr) |
|--------|-------------------|-------------------|
| Header de statut cache | `cf-cache-status: HIT` | `x-cache: HIT` |
| Identification du POP | `cf-ray: xxx-CDG` | `x-served-by: cache-cdg20734-CDG` |
| TTL | `max-age=30672000` (~355j) | `max-age=31536000` (365j) + `immutable` |
| Directive `s-maxage` | Absente (meme TTL partout) | Presente (TTL specifique au CDN) |
| Directive `immutable` | Absente | Presente (empeche la revalidation) |

> **`x-served-by`** : Ce header Fastly indique la chaine de serveurs qui ont traite la requete. Quand vous voyez deux valeurs separees par une virgule, cela signifie que la requete est passee par un **shield** (premier serveur) avant d'atteindre l'**edge** (deuxieme serveur). Les noms de serveurs contiennent le code du POP (ex : `CDG` = Paris Charles-de-Gaulle, `PAR` = Paris).

---

### Exercice 3 : Observer un cache MISS vs HIT

Pour observer la difference entre un MISS et un HIT, nous pouvons forcer un MISS en ajoutant un parametre unique a l'URL (cache buster) :

```bash
# Premiere requete : MISS probable (URL jamais vue par le cache)
curl -sI "https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js?cachebust=$(date +%s)" \
  | grep -iE "(cf-cache-status|age|x-cache)"

# Deuxieme requete : HIT probable (meme URL, deja en cache)
# Attendre 1-2 secondes, puis relancer avec le MEME timestamp
TIMESTAMP=$(date +%s) && \
curl -sI "https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js?cachebust=$TIMESTAMP" \
  | grep -iE "(cf-cache-status|age|x-cache)" && \
sleep 2 && \
curl -sI "https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js?cachebust=$TIMESTAMP" \
  | grep -iE "(cf-cache-status|age|x-cache)"
```

**Resultats attendus :**

```
# Premiere requete (MISS) :
cf-cache-status: MISS
age: 0

# Deuxieme requete (HIT) :
cf-cache-status: HIT
age: 2
```

**Ce qu'il faut observer :**

- Sur un **MISS**, `age` est a `0` (le contenu vient d'etre recupere a l'origin).
- Sur un **HIT**, `age` est > 0 et `cf-cache-status` passe a `HIT`.
- Le `cachebust` simule une nouvelle URL unique : le CDN ne l'a jamais vue, donc il doit aller a l'origin.
- C'est exactement ce qui se passe apres un **deploiement** avec des noms de fichiers hashes (`app.a3b4c5.js`) : le premier visiteur declenche un MISS, les suivants profitent du HIT.

---

### Exercice 4 : Analyser les headers Vary

Le header `Vary: Accept-Encoding` oblige le CDN a stocker **une variante par encodage**. Verifions cela en envoyant des headers `Accept-Encoding` differents :

```bash
# Requete avec compression gzip
curl -sI -H "Accept-Encoding: gzip" \
  https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js \
  | grep -iE "(content-encoding|vary|content-length)"

# Requete avec compression Brotli
curl -sI -H "Accept-Encoding: br" \
  https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js \
  | grep -iE "(content-encoding|vary|content-length)"

# Requete sans compression
curl -sI -H "Accept-Encoding: identity" \
  https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js \
  | grep -iE "(content-encoding|vary|content-length)"
```

**Resultats attendus :**

```
# gzip :
content-encoding: gzip
vary: Accept-Encoding
content-length: ~25 000 octets

# Brotli :
content-encoding: br
vary: Accept-Encoding
content-length: ~22 000 octets (Brotli compresse mieux)

# Pas de compression :
(pas de content-encoding)
vary: Accept-Encoding
content-length: ~73 000 octets (taille originale)
```

**Ce qu'il faut retenir :**

- Le CDN stocke **3 variantes** du meme fichier grace au header `Vary`.
- Chaque variante a une taille (`content-length`) differente selon la compression.
- **Brotli** (`br`) offre une meilleure compression que **gzip** (~15-20% plus petit).
- Sans `Vary`, le CDN pourrait envoyer une reponse gzip a un client qui a demande du Brotli, ou vice-versa — causant des erreurs de decodage.

---

### Tableau recapitulatif : Headers CDN en production

| Header | Cloudflare | Fastly / jsDelivr | Akamai |
|--------|-----------|-------------------|--------|
| **Statut du cache** | `cf-cache-status: HIT` | `x-cache: HIT` | `x-cache: TCP_HIT` |
| **Identification du POP** | `cf-ray: xxx-CDG` | `x-served-by: cache-cdg20734-CDG` | `x-akamai-request-id` |
| **Age du cache** | `age: 3600` | `age: 3600` | `age: 3600` |
| **Controle du cache** | `cache-control` | `cache-control` + `s-maxage` | `cache-control` |
| **Compression** | `content-encoding: br` | `content-encoding: br` | `content-encoding: br` |
| **Variantes** | `vary: Accept-Encoding` | `vary: Accept-Encoding` | `vary: Accept-Encoding` |
| **ETag** | Oui | Oui | Oui |
| **Nombre de hits** | Non expose | `x-cache-hits: 42` | Non expose |
| **Timer de requete** | Non expose | `x-timer: S170xxx.xxx` | Non expose |
| **Header proprietaire** | `cf-ray`, `cf-cache-status` | `x-served-by`, `x-timer` | `x-akamai-request-id` |

> **Conseil** : dans un vrai projet, ajoutez `curl -sI <votre-url> | grep -iE "cache|age|vary|x-cache|cf-"` a votre checklist de deploiement. Cela permet de verifier immediatement que le CDN cache bien vos ressources avec les bons TTL.

---

## Defi

### Enonce

Tu geres un site d'actualites avec :
- 500 articles
- 50 auteurs
- 10 categories
- 3 millions de visiteurs/jour

L'article 42 de l'auteur "alice" dans la categorie "tech" contient une erreur factuelle. Tu dois corriger et invalider le cache.

1. Quels `Surrogate-Key` aurais-tu mis sur la page de l'article 42 ?
2. Quels `Surrogate-Key` aurais-tu mis sur la page de la categorie "tech" ?
3. Quelle commande de purge utiliser pour invalider tout ce qui touche a l'article 42 ?
4. Pourquoi un soft purge serait-il preferable ici ?
5. Apres correction, combien de requetes arrivent a l'origin si les 3 millions de visiteurs reviennent ?

### Reponse

```
1. Surrogate-Key sur /articles/42 :
   "article-42 auteur-alice categorie-tech articles"

2. Surrogate-Key sur /categorie/tech :
   "categorie-tech article-42 article-55 article-78 ..."
   (tous les articles de la categorie)

3. Purge par tag :
   curl -X POST "https://api.fastly.com/service/{id}/purge/article-42"
   --> Invalide /articles/42, /categorie/tech, /auteur/alice, /feed, etc.

4. Soft purge est preferable car :
   - Les utilisateurs continuent de voir l'ancienne version (stale)
     pendant la revalidation (quelques ms)
   - Pas de "trou" dans le cache ou tout le monde frappe l'origin
   - L'origin ne recoit qu'UNE requete de revalidation par POP (pas 3M)

5. Nombre de requetes a l'origin :
   - Avec request collapsing + shield : ~1 requete par shield (2-5 shields)
   - Soit environ 2 a 5 requetes, PAS 3 millions !
   - Le shield sert les POPs, les POPs servent les utilisateurs
```
