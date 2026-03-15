# Module 06 — Stale-While-Revalidate & Stratégies de cache

> **Objectif** : Comprendre les directives `stale-while-revalidate` et `stale-if-error`, puis maîtriser les cinq grands patterns de serving pour choisir la bonne stratégie selon le contexte.
> **Difficulte** : :star::star::star:

---

## 1. Le problème : cache miss = latence elevee

### 1.1 Pourquoi un cache miss fait mal

Quand un contenu expire dans le cache, la prochaine requête doit aller jusqu'a l'origin server. Pendant ce temps, l'utilisateur attend.

```
Scenario SANS stale-while-revalidate
=========================================

Client          Cache           Origin
  |               |               |
  |--GET /api---->|               |
  |               |  (expire!)    |
  |               |--GET /api---->|
  |               |               | ... 800ms ...
  |               |<----200-------|
  |<----200-------|               |
  |                                |
  Total: ~850ms (latence reseau + traitement origin)
```

### 1.2 L'analogie du boulanger

Imagine une boulangerie. Le pain du matin est en vitrine (le cache). A 14h, le pain est considere comme "pas frais" (expire). Deux options :

1. **Sans SWR** : le client attend que le boulanger refasse du pain frais (cache miss complet)
2. **Avec SWR** : le boulanger donne le pain de ce matin (encore bon !) et lance une fournee en arriere-plan. Le prochain client aura du pain tout frais.

### 1.3 Impact mesurable

| Situation | Temps de réponse | Experience utilisateur |
|-----------|-----------------|----------------------|
| Cache hit (frais) | 1-5 ms | Instantane |
| Cache hit (stale + SWR) | 1-5 ms | Instantane |
| Cache miss (revalidation bloquante) | 200-2000 ms | Perceptible |
| Origin down + pas de fallback | Timeout / erreur | Catastrophique |

---

## 2. stale-while-revalidate : servir le stale, revalider en background

### 2.1 Syntaxe

```http
Cache-Control: max-age=60, stale-while-revalidate=120
```

Cela signifie :
- **0-60s** : le contenu est frais, on le sert directement
- **60-180s** : le contenu est stale, mais on le sert immediatement ET on revalide en arriere-plan
- **Après 180s** : le contenu est considere trop vieux, requête bloquante vers l'origin

### 2.2 Diagramme temporel

```
      0s          60s                   180s
      |------------|---------------------|----------->
      |   FRAIS    |  STALE-WHILE-      |  EXPIRE
      |  (max-age) |  REVALIDATE        |  (cache miss)
      |            |                     |
      | Sert tel   | Sert stale +       | Requete
      | quel       | revalide en bg     | bloquante
```

### 2.3 Implementation serveur avec `node:http`

```js
import { createServer } from 'node:http';

// Simulons une source de donnees lente
async function fetchExpensiveData() {
  // Simule 500ms de traitement
  await new Promise(resolve => setTimeout(resolve, 500));
  return {
    timestamp: new Date().toISOString(),
    data: 'Resultat couteux a calculer',
    random: Math.random().toFixed(4)
  };
}

const server = createServer(async (req, res) => {
  if (req.url === '/api/data') {
    const data = await fetchExpensiveData();

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'max-age=10, stale-while-revalidate=30',
      'ETag': `"${Date.now()}"`,
      'Date': new Date().toUTCString()
    });

    res.end(JSON.stringify(data));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(3000, () => {
  console.log('Serveur SWR sur http://localhost:3000');
});
```

### 2.4 Comment le navigateur géré SWR

Quand le navigateur recoit `stale-while-revalidate` :

1. Il stocke la réponse avec son `max-age`
2. Après expiration du `max-age`, si dans la fenêtre SWR :
   - Il retourne immediatement la version en cache
   - Il lance une requête `fetch` en arriere-plan
   - La réponse fraiche remplace l'ancienne dans le cache
3. La prochaine requête obtiendra la version fraichement revalidee

```js
// Ce que fait le navigateur "sous le capot" (pseudo-code)
async function handleRequestWithSWR(request, cachedResponse, cachePolicy) {
  const age = Date.now() - cachedResponse.storedAt;
  const maxAge = cachePolicy.maxAge * 1000;
  const swrWindow = cachePolicy.staleWhileRevalidate * 1000;

  if (age < maxAge) {
    // Frais : retourne directement
    return cachedResponse;
  }

  if (age < maxAge + swrWindow) {
    // Stale mais dans la fenetre SWR
    // Lancer la revalidation en arriere-plan (non bloquante)
    revalidateInBackground(request);
    return cachedResponse; // Retourne immediatement le stale
  }

  // Trop vieux : requete bloquante
  return await fetch(request);
}

async function revalidateInBackground(request) {
  try {
    const freshResponse = await fetch(request);
    await cache.put(request, freshResponse);
    console.log('Cache mis a jour en arriere-plan');
  } catch (err) {
    console.warn('Revalidation echouee, on garde le stale');
  }
}
```

### 2.5 Support navigateur

| Navigateur | Support SWR |
|-----------|------------|
| Chrome 75+ | Oui |
| Firefox 68+ | Oui |
| Safari 16+ | Oui |
| Edge 79+ | Oui |

---

## 3. stale-if-error : fallback si origin down

### 3.1 Le problème

Que se passe-t-il si l'origin server est en panne et que le cache a expire ?

```
Client          Cache           Origin
  |               |               |
  |--GET /api---->|               |
  |               |  (expire)     |
  |               |--GET /api---->|
  |               |               X  (500 / timeout)
  |               |               |
  |<---500--------|               |   <-- Sans stale-if-error
  |                                |
  |<---200 stale--|               |   <-- Avec stale-if-error
```

### 3.2 Syntaxe

```http
Cache-Control: max-age=60, stale-if-error=86400
```

Signification : si l'origin repond une erreur (5xx) ou est injoignable, le cache peut servir une version stale pendant 24h (86400 secondes).

### 3.3 Combiner SWR et SIE

```http
Cache-Control: max-age=300, stale-while-revalidate=600, stale-if-error=86400
```

Chronologie :
- **0-5min** : frais
- **5-15min** : stale + revalidation background
- **Si erreur pendant 24h** : sert la version stale plutot qu'une erreur

### 3.4 Implementation d'un proxy cache avec SIE

```js
import { createServer, request as httpRequest } from 'node:http';

// Cache en memoire simple
const cache = new Map();

function getCacheEntry(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  return entry;
}

function setCacheEntry(key, response, maxAge) {
  cache.set(key, {
    body: response,
    storedAt: Date.now(),
    maxAge: maxAge * 1000,
    staleIfError: 86400 * 1000 // 24h
  });
}

async function fetchFromOrigin(path) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { hostname: 'localhost', port: 4000, path, method: 'GET' },
      (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (res.statusCode >= 500) {
            reject(new Error(`Origin error: ${res.statusCode}`));
          } else {
            resolve({ statusCode: res.statusCode, body });
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(3000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
    req.end();
  });
}

const proxy = createServer(async (req, res) => {
  const entry = getCacheEntry(req.url);
  const now = Date.now();

  // Cache frais ?
  if (entry && (now - entry.storedAt) < entry.maxAge) {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'X-Cache': 'HIT (fresh)'
    });
    res.end(entry.body);
    return;
  }

  // Tenter l'origin
  try {
    const origin = await fetchFromOrigin(req.url);
    setCacheEntry(req.url, origin.body, 300);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'X-Cache': 'MISS'
    });
    res.end(origin.body);
  } catch (err) {
    // Origin en erreur : utiliser stale-if-error
    if (entry && (now - entry.storedAt) < entry.staleIfError) {
      console.warn(`Origin down, servant stale pour ${req.url}`);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'X-Cache': 'HIT (stale-if-error)',
        'Warning': '110 - "Response is Stale"'
      });
      res.end(entry.body);
    } else {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Service indisponible' }));
    }
  }
});

proxy.listen(3000, () => {
  console.log('Proxy cache avec stale-if-error sur :3000');
});
```

---

## 4. Cache serving patterns

### 4.1 Vue d'ensemble des 5 patterns

```
+------------------+----------------------------------+
|     Pattern      |         Comportement             |
+------------------+----------------------------------+
| Cache-Only       | Cache uniquement, jamais reseau  |
| Cache-First      | Cache d'abord, reseau en backup  |
| Network-Only     | Reseau uniquement, jamais cache  |
| Network-First    | Reseau d'abord, cache en backup  |
| SWR              | Cache + revalidation background  |
+------------------+----------------------------------+
```

### 4.2 Cache-Only

```
Client -----> Cache -----> Reponse (ou erreur si absent)
                |
                X (jamais de reseau)
```

**Quand l'utiliser** : ressources pre-cachees dont on est certain qu'elles existent (app shell, assets embarques).

```js
// Pseudo-implementation
async function cacheOnly(cacheStore, key) {
  const cached = cacheStore.get(key);
  if (cached) return cached;
  throw new Error('Ressource non trouvee en cache');
}
```

### 4.3 Cache-First (Cache, falling back to network)

```
Client -----> Cache -----> HIT ? -----> Reponse
                |
                +-- MISS ---> Reseau -----> Reponse + mise en cache
```

**Quand l'utiliser** : images, polices, fichiers CSS/JS avec hash dans le nom.

```js
async function cacheFirst(cacheStore, key, fetchFn) {
  const cached = cacheStore.get(key);
  if (cached) return cached;

  const response = await fetchFn(key);
  cacheStore.set(key, response);
  return response;
}
```

### 4.4 Network-First (Network, falling back to cache)

```
Client -----> Reseau -----> OK ? -----> Reponse + mise en cache
                |
                +-- Erreur ---> Cache -----> Reponse stale
```

**Quand l'utiliser** : contenu dynamique qui doit etre le plus frais possible, mais avec fallback offline.

```js
async function networkFirst(cacheStore, key, fetchFn) {
  try {
    const response = await fetchFn(key);
    cacheStore.set(key, response);
    return response;
  } catch (err) {
    const cached = cacheStore.get(key);
    if (cached) return cached;
    throw err;
  }
}
```

### 4.5 Network-Only

```
Client -----> Reseau -----> Reponse (ou erreur)
                |
                X (jamais de cache)
```

**Quand l'utiliser** : operations d'écriture (POST, PUT, DELETE), authentification, donnees temps-réel.

```js
async function networkOnly(fetchFn, key) {
  return await fetchFn(key); // Pas de cache
}
```

### 4.6 Stale-While-Revalidate (SWR)

```
Client -----> Cache -----> HIT ? -----> Reponse immediate
                |                |
                |                +------> Revalidation en arriere-plan
                |
                +-- MISS ---> Reseau -----> Reponse + mise en cache
```

**Quand l'utiliser** : fil d'actualite, tableaux de bord, donnees qui changent mais ou 30s de retard est acceptable.

```js
async function staleWhileRevalidate(cacheStore, key, fetchFn) {
  const cached = cacheStore.get(key);

  // Lancer la revalidation (non bloquante)
  const revalidation = fetchFn(key)
    .then(fresh => cacheStore.set(key, fresh))
    .catch(err => console.warn('Revalidation echouee:', err.message));

  if (cached) {
    // Ne pas attendre la revalidation
    return cached;
  }

  // Pas de cache : attendre la reponse reseau
  await revalidation;
  return cacheStore.get(key);
}
```

---

## 5. Matrice de decision

### 5.1 Tableau de choix

| Critere | Cache-Only | Cache-First | Network-First | Network-Only | SWR |
|---------|-----------|------------|--------------|-------------|-----|
| Vitesse | +++++ | ++++ | ++ | + | ++++ |
| Fraicheur | -- | -- | ++++ | +++++ | +++ |
| Offline | Oui | Oui | Partiel | Non | Partiel |
| Complexite | Faible | Faible | Moyenne | Faible | Moyenne |

### 5.2 Arbre de decision

```
La ressource change-t-elle ?
|
+-- Jamais (ex: image avec hash)
|   --> Cache-First ou Cache-Only
|
+-- Rarement (ex: page "A propos")
|   --> Cache-First avec max-age long
|
+-- Regulierement (ex: fil d'actu, dashboard)
|   |
|   +-- 30s de retard acceptable ?
|   |   --> SWR
|   |
|   +-- Doit etre ultra-frais ?
|       --> Network-First
|
+-- Tout le temps (ex: chat, notifications)
    --> Network-Only
```

### 5.3 Exemples concrets par type de ressource

| Ressource | Pattern recommande | Cache-Control |
|-----------|-------------------|---------------|
| `app.a1b2c3.js` | Cache-First | `max-age=31536000, immutable` |
| `/api/user/profile` | Network-First | `no-cache` |
| `/api/feed` | SWR | `max-age=30, stale-while-revalidate=300` |
| `/api/notifications` | Network-Only | `no-store` |
| Logo du site | Cache-First | `max-age=86400` |
| Page de login | Network-Only | `no-store` |
| Catalogue produits | SWR | `max-age=60, stale-while-revalidate=600, stale-if-error=86400` |

---

## 6. Exemple complet : serveur multi-stratégie

```js
import { createServer } from 'node:http';

// ---- Cache store simple ----
class CacheStore {
  #entries = new Map();

  get(key) {
    const entry = this.#entries.get(key);
    if (!entry) return null;
    return { ...entry, age: Date.now() - entry.storedAt };
  }

  set(key, body, maxAge = 60, swrWindow = 0, sieWindow = 0) {
    this.#entries.set(key, {
      body,
      storedAt: Date.now(),
      maxAge: maxAge * 1000,
      swrWindow: swrWindow * 1000,
      sieWindow: sieWindow * 1000
    });
  }

  delete(key) { this.#entries.delete(key); }
}

const store = new CacheStore();

// ---- Routes avec strategies differentes ----
const routes = {
  // SWR pour le catalogue
  '/api/catalogue': {
    strategy: 'swr',
    maxAge: 60,
    swrWindow: 300,
    sieWindow: 86400,
    handler: async () => ({
      produits: ['Clavier', 'Souris', 'Ecran'],
      updatedAt: new Date().toISOString()
    })
  },

  // Network-First pour le profil
  '/api/profil': {
    strategy: 'network-first',
    handler: async () => ({
      nom: 'Alice',
      lastLogin: new Date().toISOString()
    })
  },

  // Cache-First pour les assets statiques
  '/static/logo.json': {
    strategy: 'cache-first',
    maxAge: 86400,
    handler: async () => ({
      url: '/images/logo.svg',
      version: '2.0'
    })
  }
};

const server = createServer(async (req, res) => {
  const route = routes[req.url];
  if (!route) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  let result;
  let cacheStatus;

  const entry = store.get(req.url);

  switch (route.strategy) {
    case 'swr': {
      if (entry && entry.age < entry.maxAge) {
        // Frais
        result = entry.body;
        cacheStatus = 'HIT (fresh)';
      } else if (entry && entry.age < entry.maxAge + entry.swrWindow) {
        // Stale : servir + revalider en background
        result = entry.body;
        cacheStatus = 'HIT (stale, revalidating)';
        route.handler().then(data => {
          store.set(req.url, JSON.stringify(data),
            route.maxAge, route.swrWindow, route.sieWindow);
          console.log(`[SWR] ${req.url} revalide en background`);
        });
      } else {
        // Miss ou trop vieux
        try {
          const data = await route.handler();
          result = JSON.stringify(data);
          store.set(req.url, result,
            route.maxAge, route.swrWindow, route.sieWindow);
          cacheStatus = 'MISS';
        } catch (err) {
          if (entry && entry.age < entry.sieWindow) {
            result = entry.body;
            cacheStatus = 'HIT (stale-if-error)';
          } else {
            res.writeHead(502);
            res.end('Service indisponible');
            return;
          }
        }
      }
      break;
    }

    case 'network-first': {
      try {
        const data = await route.handler();
        result = JSON.stringify(data);
        store.set(req.url, result, 300);
        cacheStatus = 'MISS (network-first)';
      } catch (err) {
        if (entry) {
          result = entry.body;
          cacheStatus = 'HIT (fallback)';
        } else {
          res.writeHead(502);
          res.end('Service indisponible');
          return;
        }
      }
      break;
    }

    case 'cache-first': {
      if (entry && entry.age < entry.maxAge) {
        result = entry.body;
        cacheStatus = 'HIT (cache-first)';
      } else {
        const data = await route.handler();
        result = JSON.stringify(data);
        store.set(req.url, result, route.maxAge || 3600);
        cacheStatus = 'MISS (cache-first)';
      }
      break;
    }
  }

  res.writeHead(200, {
    'Content-Type': 'application/json',
    'X-Cache': cacheStatus,
    'X-Strategy': route.strategy
  });
  res.end(result);
});

server.listen(3000, () => {
  console.log('Serveur multi-strategie sur http://localhost:3000');
  console.log('Essayez :');
  console.log('  curl -i http://localhost:3000/api/catalogue');
  console.log('  curl -i http://localhost:3000/api/profil');
  console.log('  curl -i http://localhost:3000/static/logo.json');
});
```

---

## Points clés

1. **`stale-while-revalidate`** permet de servir du contenu expire immediatement tout en le rafraichissant en arriere-plan -- le meilleur des deux mondes.
2. **`stale-if-error`** est votre filet de sécurité : mieux vaut des donnees de 5 minutes que pas de donnees du tout.
3. **Cache-Only** et **Network-Only** sont les deux extremes : l'un ignore le réseau, l'autre ignore le cache.
4. **Cache-First** est ideal pour les ressources statiques versionnees (fichiers avec hash).
5. **Network-First** garantit la fraicheur avec un fallback offline gracieux.
6. **SWR** offre le meilleur compromis vitesse/fraicheur pour les donnees semi-dynamiques.
7. La fenêtre SWR commence **après** l'expiration du `max-age`, pas à partir du stockage.
8. Combiner `stale-while-revalidate` et `stale-if-error` dans le même header est non seulement valide mais **fortement recommande** pour la résilience.

---

## Lab associe

> Lab 06 — Implementer les 5 patterns de serving dans un proxy cache `node:http`

---

## Pour aller plus loin

- [RFC 5861 - HTTP Cache-Control Extensions for Stale Content](https://datatracker.ietf.org/doc/html/rfc5861)
- [web.dev - Keeping things fresh with stale-while-revalidate](https://web.dev/stale-while-revalidate/)
- [Google Developers - The Offline Cookbook](https://web.dev/offline-cookbook/)
- [Workbox Stratégies](https://developer.chrome.com/docs/workbox/modules/workbox-strategies/)

---

## Si tu es perdu

Pense à un distributeur automatique de cafe :

- **Cache-Only** : tu ne bois que le cafe déjà dans ta tasse. Pas de machine.
- **Cache-First** : tu regardes d'abord si tu as du cafe dans ta tasse. Sinon, tu en refais.
- **Network-First** : tu refais toujours un cafe frais. Si la machine est en panne, tu bois celui de ta tasse (même froid).
- **Network-Only** : tu refais toujours un cafe frais. Machine en panne = pas de cafe.
- **SWR** : tu bois le cafe de ta tasse (même tiede) et tu lances la machine pour en avoir un frais pour la prochaine fois.

Le `stale-while-revalidate` c'est juste : "donne-moi ce que tu as maintenant, et prepare du frais pour la prochaine fois". C'est aussi simple que ça.

---

## Defi

### Enonce

Ecris les headers `Cache-Control` optimaux pour chacun de ces cas :

1. Une API de meteo mise a jour toutes les 10 minutes, ou 2 minutes de retard sont acceptables
2. Un fichier JavaScript `app.d8f3a2.js` (hash dans le nom)
3. Un endpoint de paiement `/api/checkout`
4. Un catalogue e-commerce ou l'origin peut tomber
5. L'avatar de l'utilisateur (change rarement)

### Reponse

```
1. Cache-Control: max-age=120, stale-while-revalidate=600
   --> 2min frais, puis SWR jusqu'a 12min

2. Cache-Control: max-age=31536000, immutable
   --> 1 an, immutable car le hash change si le fichier change

3. Cache-Control: no-store
   --> Jamais cacher une operation de paiement

4. Cache-Control: max-age=60, stale-while-revalidate=300, stale-if-error=86400
   --> 1min frais, SWR 5min, fallback 24h si origin down

5. Cache-Control: max-age=3600, stale-while-revalidate=86400
   --> 1h frais, puis SWR pendant 24h (change rarement)
```

---

<!-- parcours-recommande -->

::: tip Parcours recommandé
1. **Screencast** : [screencast 06 swr](../screencasts/screencast-06-swr.md)
2. **Lab** : [lab-05-swr-implementation](../labs/lab-05-swr-implementation/README)
3. **Visualisation** : [Cache Decision Tree](../visualizations/cache-decision-tree.html)
4. **Visualisation** : [Stale-While-Revalidate](../visualizations/stale-while-revalidate.html)
5. **Quiz** : [quiz 06 swr](../quizzes/quiz-06-swr.html)
:::
