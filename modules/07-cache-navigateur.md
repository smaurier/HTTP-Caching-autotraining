# Module 07 — Cache navigateur

> **Objectif** : Comprendre les différentes couches de cache dans un navigateur, maîtriser la Service Worker Cache API et les mécanismes de preloading pour optimiser les performances cote client.
> **Difficulte** : :star::star::star:

---

## 1. Les 4 couches de cache du navigateur

### 1.1 Vue d'ensemble

Quand le navigateur a besoin d'une ressource, il parcourt **4 couches** avant d'aller sur le réseau :

```
Requete du navigateur
        |
        v
+------------------+
| 1. Memory Cache  |  <-- RAM, ultra-rapide, volatil
+------------------+
        | MISS
        v
+------------------+
| 2. Service Worker|  <-- Code JS que tu controles
+------------------+
        | MISS
        v
+------------------+
| 3. Disk Cache    |  <-- Disque dur, persistant
+------------------+
        | MISS
        v
+------------------+
| 4. Network       |  <-- Requete HTTP au serveur
+------------------+
```

### 1.2 L'analogie de la bibliotheque

- **Memory Cache** = le livre que tu as déjà ouvert sur ton bureau (instantane)
- **Service Worker** = ton assistant personnel qui va chercher dans tes etageres selon tes instructions
- **Disk Cache** = tes etageres à la maison (rapide mais faut se lever)
- **Network** = aller à la bibliotheque municipale (lent mais complet)

### 1.3 Tableau comparatif

| Couche | Stockage | Vitesse | Persistence | Controle dev |
|--------|----------|---------|-------------|-------------|
| Memory Cache | RAM | ~0ms | Tab/session | Aucun |
| Service Worker | Cache API (disk) | ~1-5ms | Permanent | Total |
| Disk Cache | Système fichiers | ~5-20ms | Permanent | Headers HTTP |
| Network | Serveur distant | 50-2000ms | N/A | Headers HTTP |

---

## 2. Memory Cache vs Disk Cache

### 2.1 Memory Cache

Le Memory Cache (où "in-memory cache") est stocke **en RAM**. Il est :

- **Cree** quand une page charge des ressources
- **Detruit** quand l'onglet est ferme
- **Non controle** par les headers `Cache-Control` (le navigateur decide seul)

```
Exemple : Memory Cache en action
================================

1. Page charge <img src="logo.png">       --> Network (premier chargement)
2. Meme page, autre <img src="logo.png">  --> Memory Cache (meme document!)
3. Scroll down, lazy-load logo.png         --> Memory Cache (encore)
4. Fermer l'onglet                         --> Memory Cache vide
```

**Ce qui va en Memory Cache** :
- Images affichees sur la page
- Scripts et feuilles de style du document courant
- Ressources prefetchees avec `<link rel="preload">`

### 2.2 Disk Cache (HTTP Cache)

Le Disk Cache est le **vrai** cache HTTP. Il :

- Respecte les headers `Cache-Control`, `Expires`, `ETag`
- Persiste entre les sessions (fermer/rouvrir le navigateur)
- A une taille limitee (géré par le navigateur, souvent 50-250 MB)

```
Exemple : Disk Cache en action
==============================

1. Premiere visite de site.com     --> Network, stocke en Disk Cache
2. Fermer le navigateur
3. Rouvrir site.com                --> Disk Cache (si pas expire)
4. Ctrl+Shift+R (hard refresh)     --> Ignore le Disk Cache, va au Network
```

### 2.3 Comment les observer dans DevTools

```
Chrome DevTools > Network tab
==============================

La colonne "Size" indique la source :

  (memory cache)    --> Servi depuis la RAM
  (disk cache)      --> Servi depuis le disque
  (ServiceWorker)   --> Servi par un Service Worker
  24.5 kB           --> Telecharge depuis le reseau (taille reelle)
```

### 2.4 Serveur de test pour observer les caches

```js
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const server = createServer(async (req, res) => {
  if (req.url === '/') {
    // Page HTML : ne pas cacher pour observer les comportements
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Test Cache Navigateur</title>
  <link rel="stylesheet" href="/style.css">
  <link rel="preload" href="/logo.svg" as="image">
</head>
<body>
  <img src="/logo.svg" alt="Logo">
  <img src="/logo.svg" alt="Logo duplique">
  <p>Ouvrez DevTools > Network pour observer les sources de cache</p>
  <script src="/app.js"></script>
</body>
</html>`;
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Cache-Control': 'no-cache'
    });
    res.end(html);
    return;
  }

  if (req.url === '/style.css') {
    res.writeHead(200, {
      'Content-Type': 'text/css',
      'Cache-Control': 'max-age=3600',
      'ETag': '"style-v1"'
    });
    res.end('body { font-family: sans-serif; color: #333; }');
    return;
  }

  if (req.url === '/logo.svg') {
    res.writeHead(200, {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'max-age=86400'
    });
    res.end('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="blue"/></svg>');
    return;
  }

  if (req.url === '/app.js') {
    res.writeHead(200, {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'max-age=600'
    });
    res.end('console.log("App chargee a", new Date().toISOString());');
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(3000, () => {
  console.log('http://localhost:3000 -- Ouvrez DevTools > Network');
});
```

---

## 3. Service Worker Cache API

### 3.1 Qu'est-ce qu'un Service Worker ?

Un Service Worker est un **proxy programmable** qui s'installe entre le navigateur et le réseau :

```
  Page Web
     |
     |  fetch('/api/data')
     v
+-----------+
|  Service  |   <-- Tu ecris le code qui decide :
|  Worker   |       "Je sers depuis le cache ou le reseau ?"
+-----------+
     |
     v  (si besoin)
  Network
```

### 3.2 Cycle de vie

```
1. register()   --> Le navigateur telecharge le SW
2. install       --> SW installe, on peut pre-cacher des ressources
3. activate      --> SW prend le controle des pages
4. fetch         --> SW intercepte chaque requete
5. (update)      --> Nouvelle version detectee, on recommence
```

### 3.3 API Cache : les méthodes essentielles

```js
// ---- caches.open(name) ----
// Ouvre (ou cree) un cache nomme
const cache = await caches.open('mon-app-v1');

// ---- cache.put(request, response) ----
// Stocke une paire requete/reponse
await cache.put('/api/data', new Response('{"ok":true}'));

// ---- cache.match(request) ----
// Cherche une reponse en cache
const response = await cache.match('/api/data');
if (response) {
  const data = await response.json();
}

// ---- cache.add(url) ----
// Fetch + put en une seule operation
await cache.add('/style.css');

// ---- cache.addAll(urls) ----
// Fetch + put pour plusieurs URLs
await cache.addAll(['/style.css', '/app.js', '/logo.svg']);

// ---- cache.delete(request) ----
// Supprime une entree
await cache.delete('/api/data');

// ---- cache.keys() ----
// Liste toutes les requetes en cache
const requests = await cache.keys();
```

### 3.4 Enregistrement et installation

```js
// ---- Dans votre page HTML ----
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('/sw.js')
    .then(reg => console.log('SW enregistre:', reg.scope))
    .catch(err => console.error('SW erreur:', err));
}
```

```js
// ---- sw.js : Service Worker ----

const CACHE_NAME = 'app-cache-v1';
const PRECACHE_URLS = [
  '/',
  '/style.css',
  '/app.js',
  '/logo.svg'
];

// Phase d'installation : pre-cacher les ressources essentielles
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Pre-cache des ressources');
      return cache.addAll(PRECACHE_URLS);
    })
  );
});

// Phase d'activation : nettoyer les anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Suppression ancien cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
});
```

---

## 4. Stratégies Service Worker

### 4.1 Cache-First

```js
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        return cached; // Cache HIT
      }
      // Cache MISS : aller au reseau et stocker
      return fetch(event.request).then(response => {
        // Cloner car la reponse ne peut etre lue qu'une fois
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, clone);
        });
        return response;
      });
    })
  );
});
```

**Usage** : fichiers statiques versionnes, polices, images.

### 4.2 Network-First

```js
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Succes reseau : mettre en cache et retourner
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, clone);
        });
        return response;
      })
      .catch(() => {
        // Reseau en echec : essayer le cache
        return caches.match(event.request);
      })
  );
});
```

**Usage** : pages HTML, contenu editorial, API critiques.

### 4.3 Stale-While-Revalidate

```js
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(cached => {
        // Lancer la requete reseau en parallele (revalidation)
        const fetchPromise = fetch(event.request).then(response => {
          cache.put(event.request, response.clone());
          return response;
        });

        // Retourner le cache immediatement, ou attendre le reseau
        return cached || fetchPromise;
      });
    })
  );
});
```

**Usage** : avatars, previews, donnees semi-statiques.

### 4.4 Comparaison visuelle

```
Cache-First :     Cache ------> [OUI] ----> Reponse
                    |
                  [NON]
                    |
                  Network ----> Reponse + mise en cache

Network-First :   Network -----> [OK] ----> Reponse + mise en cache
                    |
                  [ERREUR]
                    |
                  Cache -------> Reponse

SWR :             Cache ------> [OUI] ----> Reponse
                    |               |
                    |           Network ----> mise en cache (background)
                  [NON]
                    |
                  Network ----> Reponse + mise en cache
```

---

## 5. bfcache (Back/Forward Cache)

### 5.1 Qu'est-ce que le bfcache ?

Le **bfcache** (back/forward cache) est un mécanisme du navigateur qui **gele** l'état complet d'une page quand l'utilisateur la quitte. Quand il appuie sur "Retour", la page est restauree **instantanement** (en mémoire, pas re-telecharge).

```
Page A -----> Navigation vers Page B
  |
  +-- [Page A gelee en bfcache : DOM, JS heap, tout]

Page B -----> Bouton "Retour"
  |
  +-- [Page A restauree instantanement depuis bfcache]
       Pas de requete reseau !
       Pas de re-execution du JS !
       Etat exact au moment du depart !
```

### 5.2 Ce qui bloque le bfcache

| Bloqueur | Pourquoi | Solution |
|----------|----------|----------|
| `unload` event listener | Ancien, incompatible | Utiliser `pagehide` |
| `Cache-Control: no-store` | Empeche la mise en cache | Utiliser `no-cache` si possible |
| Connexions ouvertes (WebSocket) | État réseau non restaurable | Fermer dans `pagehide` |
| `window.opener` | Référence inter-fenêtre | `rel="noopener"` |

### 5.3 Événements bfcache

```js
// Detecter si la page est restauree depuis le bfcache
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    console.log('Page restauree depuis le bfcache !');
    // Rafraichir les donnees si necessaire
    refreshTimeSensitiveData();
  }
});

// Preparation avant mise en bfcache
window.addEventListener('pagehide', (event) => {
  if (event.persisted) {
    console.log('Page mise en bfcache');
    // Fermer les connexions ouvertes
    closeWebSockets();
  }
});
```

### 5.4 Tester le bfcache

```
Chrome DevTools > Application > Back/forward cache
  --> Cliquer "Test back/forward cache"
  --> Le navigateur signale les problemes bloquants
```

---

## 6. Preload, Prefetch, Preconnect

### 6.1 Les trois mécanismes

```
                    Priorite    Quand        Pour quoi
                    --------    -----        ---------
<link rel="preload">    Haute     Maintenant   Ressources de la page actuelle
<link rel="prefetch">   Basse     Temps libre  Ressources de la prochaine page
<link rel="preconnect"> Haute     Maintenant   Etablir la connexion TCP/TLS
```

### 6.2 Preload

```html
<!-- Precharger une police critique -->
<link rel="preload" href="/fonts/Inter.woff2" as="font" type="font/woff2" crossorigin>

<!-- Precharger une image hero -->
<link rel="preload" href="/hero.webp" as="image">

<!-- Precharger un script critique -->
<link rel="preload" href="/critical.js" as="script">
```

```
SANS preload :
  HTML ----parse----> decouvre font.woff2 dans CSS -----> telecharge
                          ^                                   ^
                          |_____ 500ms _____|_____ 300ms _____|

AVEC preload :
  HTML ----parse---+----> decouvre font.woff2 (deja en cache!)
                   |
                   +----> preload font.woff2 (demarre immediatement)
                              ^
                              |_____ 300ms (en parallele du parse) _____|
```

### 6.3 Prefetch

```html
<!-- Prefetcher la prochaine page probable -->
<link rel="prefetch" href="/page-suivante.html">

<!-- Prefetcher des donnees pour la page suivante -->
<link rel="prefetch" href="/api/next-page-data.json">
```

**Attention** : le navigateur peut ignorer les prefetch si la bande passante est limitee.

### 6.4 Preconnect

```html
<!-- Etablir la connexion a un CDN tiers -->
<link rel="preconnect" href="https://cdn.example.com">

<!-- DNS-only (moins couteux) -->
<link rel="dns-prefetch" href="https://analytics.example.com">
```

```
SANS preconnect :
  fetch('https://cdn.example.com/data')
    DNS (50ms) + TCP (50ms) + TLS (100ms) + Request (200ms) = 400ms

AVEC preconnect :
  <link rel="preconnect" href="https://cdn.example.com">
  ...plus tard...
  fetch('https://cdn.example.com/data')
    [DNS + TCP + TLS deja faits!] + Request (200ms) = 200ms
```

### 6.5 Servir des hint headers cote serveur

```js
import { createServer } from 'node:http';

const server = createServer((req, res) => {
  if (req.url === '/') {
    // Envoyer des Link headers pour le preloading
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Link': [
        '</style.css>; rel=preload; as=style',
        '</app.js>; rel=preload; as=script',
        '</font.woff2>; rel=preload; as=font; crossorigin',
        '<https://api.example.com>; rel=preconnect'
      ].join(', '),
      'Cache-Control': 'no-cache'
    });

    res.end(`<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <h1>Page avec preloading</h1>
  <script src="/app.js"></script>
</body>
</html>`);
    return;
  }

  if (req.url === '/style.css') {
    res.writeHead(200, {
      'Content-Type': 'text/css',
      'Cache-Control': 'max-age=3600'
    });
    res.end('h1 { color: navy; }');
    return;
  }

  if (req.url === '/app.js') {
    res.writeHead(200, {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'max-age=3600'
    });
    res.end('console.log("App loaded");');
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(3000, () => {
  console.log('Serveur avec preload hints sur http://localhost:3000');
});
```

### 6.6 HTTP/2 Server Push vs Preload (Note historique)

```
HTTP/2 Server Push (DEPRECIE dans Chrome 106+)
===============================================
Avant : le serveur pouvait "pousser" des ressources sans que le client les demande.
Probleme : le serveur ne savait pas si le client les avait deja en cache.
Resultat : gaspillage de bande passante.
Solution moderne : utiliser <link rel="preload"> + Early Hints (103).
```

### 6.7 Early Hints (103)

```js
import { createServer } from 'node:http';

const server = createServer((req, res) => {
  if (req.url === '/') {
    // Envoyer un 103 Early Hints avant la reponse finale
    // Note : le support Node.js natif est limite,
    // ceci montre le concept
    res.writeEarlyHints({
      link: [
        '</style.css>; rel=preload; as=style',
        '</app.js>; rel=preload; as=script'
      ]
    });

    // Simuler un traitement serveur long
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><head><link rel="stylesheet" href="/style.css"></head><body>OK</body></html>');
    }, 500);
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(3000, () => {
  console.log('Serveur Early Hints sur http://localhost:3000');
});
```

```
SANS Early Hints :
  Client ---- GET / ----> Serveur (500ms traitement)
  Client <--- 200 + HTML  (puis decouvre style.css)
  Client ---- GET /style.css ----> Serveur
  Total : ~700ms avant affichage

AVEC Early Hints (103) :
  Client ---- GET / ----> Serveur (500ms traitement)
  Client <--- 103 Early Hints (preload style.css)
  Client ---- GET /style.css ----> (pendant que le serveur traite)
  Client <--- 200 + HTML          (style.css deja en cache!)
  Total : ~500ms avant affichage (200ms gagnes)
```

---

## Points clés

1. Le navigateur utilise **4 couches de cache** dans l'ordre : Memory Cache, Service Worker, Disk Cache, Network.
2. Le **Memory Cache** est volatile (lie a l'onglet) et non controlable par le développeur.
3. Le **Disk Cache** est le cache HTTP classique, controle par les headers `Cache-Control`.
4. La **Service Worker Cache API** donne un controle **total** sur ce qui est cache et comment il est servi.
5. Le **bfcache** gele et restaure des pages entieres pour une navigation instantanee avec le bouton Retour.
6. **`<link rel="preload">`** charge des ressources critiques en avance pour la page actuelle.
7. **`<link rel="prefetch">`** pre-charge des ressources pour les navigations futures (priorite basse).
8. **`<link rel="preconnect">`** etablit les connexions DNS+TCP+TLS a l'avance pour les domaines tiers.

---

## Lab associe

> Lab 07 — Construire un Service Worker avec les 3 stratégies (Cache-First, Network-First, SWR) et observer les couches de cache dans DevTools

---

## Pour aller plus loin

- [web.dev - Service Worker Caching Stratégies](https://web.dev/offline-cookbook/)
- [MDN - Cache API](https://developer.mozilla.org/fr/docs/Web/API/Cache)
- [web.dev - Back/forward cache](https://web.dev/bfcache/)
- [web.dev - Preload critical assets](https://web.dev/preload-critical-assets/)
- [web.dev - Early Hints](https://web.dev/early-hints/)

---

## Si tu es perdu

Imagine que tu prepares un repas :

- **Memory Cache** = les ingredients déjà sur ton plan de travail (instantane, mais disparaissent quand tu ranges la cuisine)
- **Service Worker** = ton robot de cuisine programme : tu lui as dit "si on me demandé de la soupe, prends celle du frigo ; si on me demandé du pain, va à la boulangerie"
- **Disk Cache** = ton frigo et tes placards (rapide d'acces, persistant)
- **Network** = aller au supermarche (long, mais tu trouves tout)

Le navigateur regarde d'abord le plan de travail, puis demandé au robot, puis ouvre le frigo, et en dernier recours va au supermarche. C'est logique : on commence par le plus rapide.

---

## Exercice pratique — Chrome DevTools

### Objectif

Observer les différentes couches de cache du navigateur dans DevTools : distinguer memory cache et disk cache, inspecter les caches Service Worker dans l'onglet Application, et tester le bfcache.

### Etapes

#### Partie 1 : Memory cache vs Disk cache dans l'onglet Network

1. **Lancer le serveur de test**
   - Utilise le serveur de la section 2.4 de ce module, ou lance un des serveurs de lab précédent :
   ```bash
   node labs/lab-03-cache-control-lab/solution.js
   ```

2. **Observer le disk cache**
   - Ouvre Chrome et va sur `http://localhost:3000`
   - Ouvre DevTools (`F12`) > onglet **Network**
   - Recharge (`F5`) pour que les ressources soient telechargees et mises en cache
   - **Ferme l'onglet** (cela vide le memory cache)
   - Rouvre `http://localhost:3000` dans un nouvel onglet avec DevTools ouvert
   - Observe la colonne **Size** :
     - Les ressources cachees apparaissent comme `(from disk cache)`
     - C'est le cache HTTP classique, stocke sur le disque dur
     - Il survit à la fermeture de l'onglet et même du navigateur

3. **Observer le memory cache**
   - Sans fermer l'onglet, recharge avec `F5`
   - Observe la colonne **Size** :
     - Certaines ressources passent de `(from disk cache)` a `(from memory cache)`
     - Le memory cache est en RAM : il est plus rapide mais volatil
   - Regle pratique :
     - Les **images** et **scripts** du document courant vont souvent en memory cache
     - Les ressources chargees pour la première fois dans cette session viennent du disk cache
   - Observe la colonne **Time** : les deux types affichent `0 ms`, mais memory cache est techniquement plus rapide

4. **Filtrer par source de cache**
   - Dans le champ de filtre de l'onglet Network, utilise :
     - `larger-than:0` pour ne voir que les ressources telechargees depuis le réseau
     - Ou clique sur les en-tetes de colonnes pour trier par **Size** et regrouper les `(from memory cache)` et `(from disk cache)`

#### Partie 2 : Inspecter les caches Service Worker dans l'onglet Application

5. **Ouvrir l'onglet Application**
   - Dans DevTools, clique sur l'onglet **Application** (s'il n'est pas visible, clique sur `>>` pour le trouver)
   - Dans le panneau de gauche, développé la section **Cache Storage**

6. **Explorer le contenu du cache**
   - Si un Service Worker est installe sur le site, tu verras un ou plusieurs caches nommes (ex: `app-cache-v1`)
   - Clique sur un nom de cache pour voir la liste des URLs stockees
   - Pour chaque entree, tu peux voir :
     - L'URL de la requête
     - Les headers de la réponse stockee
     - Le body de la réponse (onglet **Preview**)

7. **Supprimer des entrees de cache**
   - Clique-droit sur une entree et choisis **Delete** pour supprimer une seule ressource
   - Ou clique sur le bouton **Clear** (icone poubelle) pour vider tout un cache
   - Cela permet de tester le comportement de l'application quand le cache est vide

8. **Vérifier l'état du Service Worker**
   - Dans le panneau de gauche, clique sur **Service Workers**
   - Tu verras le Service Worker enregistre, son statut (active, waiting, etc.)
   - Tu peux cocher **Offline** pour simuler une perte de connexion et vérifier que le Service Worker sert les ressources depuis le cache

#### Partie 3 : Tester le bfcache

9. **Ouvrir le testeur de bfcache**
   - Dans DevTools, va dans l'onglet **Application**
   - Dans le panneau de gauche, cherche la section **Back/forward cache**
   - Clique sur **Test back/forward cache**

10. **Effectuer le test**
    - Chrome va automatiquement naviguer ailleurs puis revenir sur ta page
    - Le résultat du test s'affiche :
      - **Restaure depuis le bfcache** : la page est compatible, navigation instantanee
      - **Non restaure** : la page a des éléments bloquants
    - Si le bfcache echoue, DevTools liste les raisons bloquantes :
      - `unload` event listener
      - `Cache-Control: no-store`
      - Connexions WebSocket ouvertes
      - `window.opener` present

11. **Observer le bfcache en action**
    - Navigue vers un autre site (ex: tape `about:blank` dans la barre d'adresse)
    - Appuie sur le bouton **Retour** du navigateur
    - Si le bfcache fonctionne :
      - La page se restaure **instantanement** (pas de requête réseau, pas de re-exécution du JS)
      - Dans l'onglet Network, **aucune nouvelle requête** n'apparait
    - Si le bfcache ne fonctionne pas :
      - La page est rechargee normalement avec des requêtes réseau

### Ce que tu devrais observer

```
Colonne Size dans l'onglet Network :
  (memory cache)     --> Ressource en RAM (onglet courant)
  (disk cache)       --> Ressource sur le disque (persistant)
  (ServiceWorker)    --> Servie par un Service Worker
  24.5 kB            --> Telechargee depuis le reseau

Onglet Application > Cache Storage :
  app-cache-v1/
    /               text/html        OK
    /style.css      text/css         OK
    /app.js         application/js   OK

Onglet Application > Back/forward cache :
  Test result: "Successfully served from back/forward cache"
  OU
  Test result: "Not served" + liste des raisons bloquantes
```

### Questions de reflexion

- Pourquoi une image apparait-elle en `(from memory cache)` après un refresh mais en `(from disk cache)` après la reouverture d'un onglet ?
- Quelle est la différence entre le Disk Cache (controle par les headers HTTP) et le Cache Storage (controle par le Service Worker) ?
- Pourquoi `Cache-Control: no-store` bloque-t-il le bfcache ? Quel impact cela a-t-il sur la navigation avec le bouton Retour ?
- Si tu coches "Offline" dans le panneau Service Workers, quelles ressources sont encore accessibles ? Pourquoi ?

---

## Defi

### Enonce

Tu as un site e-commerce avec ces ressources :
- `/index.html` (page d'accueil, change toutes les heures)
- `/app.abc123.js` (script avec hash)
- `/api/produits` (catalogue, change toutes les 5 minutes)
- `/images/hero.webp` (banniere, change chaque semaine)
- `/api/panier` (panier utilisateur, temps réel)

Pour chaque ressource, indique :
1. Quelle stratégie Service Worker utiliser
2. Quel header `Cache-Control` configurer cote serveur
3. Faut-il un `<link rel="preload">` ?

### Reponse

```
/index.html
  Strategie SW : Network-First (toujours tenter du frais, fallback cache)
  Cache-Control : no-cache (revalider a chaque fois)
  Preload : Non (c'est la page elle-meme)

/app.abc123.js
  Strategie SW : Cache-First (le hash garantit l'immutabilite)
  Cache-Control : max-age=31536000, immutable
  Preload : Oui --> <link rel="preload" href="/app.abc123.js" as="script">

/api/produits
  Strategie SW : Stale-While-Revalidate (rapidite + fraicheur acceptable)
  Cache-Control : max-age=60, stale-while-revalidate=300
  Preload : Non (donnees dynamiques)

/images/hero.webp
  Strategie SW : Cache-First (change rarement)
  Cache-Control : max-age=604800 (7 jours)
  Preload : Oui --> <link rel="preload" href="/images/hero.webp" as="image">

/api/panier
  Strategie SW : Network-Only (temps reel, pas de cache)
  Cache-Control : no-store
  Preload : Non
```

---

<!-- parcours-recommande -->

::: tip Parcours recommandé
1. **Screencast** : [screencast 07 cache navigateur](../screencasts/screencast-07-cache-navigateur.md)
2. **Lab** : [lab-06-cache-stratégies](../labs/lab-06-cache-strategies/README)
3. **Visualisation** : [Multi-Layer Cache](../visualizations/multi-layer-cache.html)
4. **Quiz** : [quiz 07 browser cache](../quizzes/quiz-07-browser-cache.html)
:::
