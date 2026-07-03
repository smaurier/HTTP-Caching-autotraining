---
titre: PWA — Service Workers et cache offline
cours: 11-http-caching
notions: [Service Worker, "cycle de vie (register, install, activate, fetch)", HTTPS et scope, "event.waitUntil()", "self.skipWaiting() et self.clients.claim()", "Cache API (caches.open, cache.addAll, cache.put, cache.match)", stratégie cache-first, stratégie network-first, stratégie stale-while-revalidate, page de repli offline, "Web App Manifest (name, start_url, display, icons)", installabilité PWA, Workbox en survol]
outcomes:
  - sait enregistrer un Service Worker et décrire son cycle de vie register/install/activate/fetch
  - sait écrire un handler fetch avec les stratégies cache-first, network-first et stale-while-revalidate
  - sait fournir une page de repli offline et purger les anciens caches à l'activate
  - sait déclarer un Web App Manifest installable et situer Workbox
prerequis: [00-prerequis-et-vue-ensemble, 01-protocole-http, 02-http2-http3, 03-en-tetes-http, 04-cache-control, 05-etag-validation-conditionnelle, 06-stale-while-revalidate, 07-cache-navigateur, 08-cdn, 09-cache-multi-couches, 10-ssr, 11-isr-ssg, 12-edge-rendering, 13-http-streaming, 14-performance-web]
next: 16-push-api-web-notifications
libs: []
tribuzen: TribuZen en PWA offline — Service Worker qui précache le shell, sert le dashboard famille depuis la Cache API et affiche une page de repli hors ligne
last-reviewed: 2026-07
---

# PWA — Service Workers et cache offline

> **Outcomes — tu sauras FAIRE :** enregistrer un Service Worker et décrire son cycle de vie, écrire un handler `fetch` avec les stratégies cache-first / network-first / stale-while-revalidate, fournir une page de repli offline et purger les anciens caches, déclarer un Web App Manifest installable.
> **Difficulté :** :star::star::star::star:
>
> **Portée :** ce module couvre les **Service Workers** et le **cache offline programmable** (Cache API). La Cache API a été **introduite au module 07** pour la distinguer du cache HTTP ; ici on l'**approfondit** avec le code réel d'un SW. Les **notifications push** et l'API `PushManager` sont le sujet du **module 16** — on s'arrête à l'offline. Le `manifest` est vu pour l'installabilité, pas l'écosystème store.

## 1. Cas concret d'abord

TribuZen est utilisé par des parents dans le métro, en zone blanche, avec une connexion qui saute. Aujourd'hui, dès que le réseau tombe, l'app affiche le dinosaure de Chrome : écran cassé, charge mentale en hausse — l'inverse exact de la promesse produit.

Tu ouvres DevTools > Network, tu coches **Offline**, tu recharges `/dashboard` :

```
GET /dashboard   (failed) net::ERR_INTERNET_DISCONNECTED
GET /assets/app.a1b2c3.js   (failed)
GET /api/family/today   (failed)
```

Rien n'est servi. Pourtant, le dashboard d'hier tenait dans le cache disque du navigateur — mais le cache HTTP (module 07) est **passif** : le navigateur décide seul, et sur une navigation offline il abandonne. Tu n'as aucun moyen de dire « si le réseau est mort, sers la dernière version connue ».

C'est exactement ce que débloque un **Service Worker** : un script qui s'installe entre ta page et le réseau, intercepte **chaque** requête, et décide en JavaScript quoi servir — cache, réseau, ou une page de repli. Après ce module :

```
GET /dashboard   200 (ServiceWorker)     ← shell servi depuis la Cache API
GET /assets/app.a1b2c3.js   200 (ServiceWorker)
GET /api/family/today   200 (ServiceWorker)   ← dernière réponse mise en cache
```

**Trois questions que ce module tranche :**
1. Comment un script (`sw.js`) prend-il le contrôle des requêtes de la page, et à quel moment de son cycle de vie ?
2. Quelle stratégie choisir requête par requête (assets figés vs API qui change vs avatars) ?
3. Comment garantir une expérience offline propre — page de repli, et pas de vieux cache qui traîne à la prochaine version ?

---

## 2. Théorie complète, concise

### 2.1 Le Service Worker : un proxy réseau programmable

Un **Service Worker** (SW) est un script JavaScript qui tourne dans un **thread séparé**, indépendant de la page. Il n'a **pas accès au DOM**. Son rôle : s'intercaler entre l'application et le réseau comme un proxy que *tu* programmes.

Caractéristiques structurantes :
- **Pas de DOM, pas de `window`** — le contexte global est `self` (`ServiceWorkerGlobalScope`). Communication avec la page via `postMessage`.
- **Vit hors de la page** : il peut être réveillé même page fermée (base du push — module 16).
- **HTTPS obligatoire** (sauf `localhost` en dev) : un proxy réseau est trop puissant pour être servi en clair.
- **Un scope** : le SW ne contrôle que les URLs sous son chemin. Un `sw.js` à la racine (`/sw.js`) contrôle tout le site ; un `/app/sw.js` ne contrôle que `/app/…`.

> Point de vocabulaire (rappel module 07) : la **Cache API** manipulée par le SW est **indépendante du cache HTTP** et **n'honore pas les en-têtes** `Cache-Control`. C'est *ton* code qui décide quoi stocker et quoi servir.

### 2.2 Enregistrer le SW depuis la page

Le SW se déclare depuis le JS de la page, une fois le chargement critique passé :

```js
// main.js — code de la PAGE (a accès au DOM, à window)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        console.log('SW enregistré, scope:', registration.scope);
      })
      .catch((err) => console.error('Échec enregistrement SW:', err));
  });
}
```

`navigator.serviceWorker.register(scriptURL, options)` retourne une `Promise<ServiceWorkerRegistration>`. On l'appelle après l'event `load` pour ne pas concurrencer le chargement initial (le SW n'accélère que les visites *suivantes*).

### 2.3 Le cycle de vie : register → install → activate → fetch

Une fois enregistré, le SW traverse des états. Chaque transition émet un event que tu écoutes dans `sw.js` :

```
register()  ──►  install  ──►  (waiting)  ──►  activate  ──►  fetch (actif)
                    │                              │
              precache assets              purge anciens caches
```

| Event | Quand | Ce qu'on y fait |
|---|---|---|
| `install` | 1re fois que le navigateur voit ce `sw.js` (ou toute modif du fichier) | **précacher** le shell (HTML, CSS, JS, page offline) |
| `activate` | quand le nouveau SW prend le relais | **purger** les caches des versions précédentes |
| `fetch` | à **chaque** requête réseau de la page contrôlée | décider : cache, réseau, ou repli |

**Le piège du « waiting »** : par défaut, un nouveau SW installé **attend** que tous les onglets contrôlés par l'ancien soient fermés avant de s'activer. C'est une sécurité (ne pas changer le proxy sous les pieds d'une page vivante), mais en dev c'est déroutant — ta nouvelle version ne s'active jamais. Deux leviers, vus en 2.4.

### 2.4 `install` : précacher, et `skipWaiting()`

`event.waitUntil(promise)` dit au navigateur « ne considère pas l'event terminé tant que cette promesse n'est pas résolue ». On l'utilise pour garantir que le précache est complet **avant** de passer à `installed`.

```js
// sw.js — contexte Service Worker (self, pas window)
const CACHE = 'tribuzen-shell-v1';
const SHELL = ['/', '/offline.html', '/assets/app.css', '/assets/app.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL))
  );
  // Optionnel : activer sans attendre la fermeture des onglets ouverts
  self.skipWaiting();
});
```

- `caches.open(name)` → `Promise<Cache>` : ouvre (ou crée) un cache nommé.
- `cache.addAll(urls)` → `Promise<void>` : `fetch` chaque URL et stocke la réponse. **Atomique** : si une seule URL échoue (404), tout `addAll` rejette et l'install échoue. Ne mets que des URLs sûres dans le shell.
- `self.skipWaiting()` : force le nouveau SW à s'activer immédiatement, sans attendre la fermeture des onglets. À utiliser en connaissance de cause (voir piège #4).

### 2.5 `activate` : purger les anciens caches, et `clients.claim()`

À l'activation, l'ancienne version est révolue : on supprime ses caches pour ne pas accumuler des versions périmées.

```js
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE)   // tout ce qui n'est pas la version courante
          .map((key) => caches.delete(key))
      )
    )
  );
  // Prendre le contrôle des pages déjà ouvertes, sans rechargement
  self.clients.claim();
});
```

- `caches.keys()` → `Promise<string[]>` : noms de tous les caches.
- `caches.delete(name)` → `Promise<boolean>` : supprime un cache.
- `self.clients.claim()` : le SW fraîchement activé prend **immédiatement** le contrôle des pages déjà ouvertes (sinon elles ne sont contrôlées qu'au prochain chargement).

C'est ici que le **versionnage du nom de cache** (`-v1`, `-v2`) prend son sens : changer le nom à chaque déploiement fait tomber l'ancien cache dans le filtre `key !== CACHE` → purge automatique.

### 2.6 `fetch` : intercepter et répondre

Le cœur du SW. `event.respondWith(responsePromise)` **court-circuite** la requête réseau du navigateur et fournit ta réponse à la place. Sans `respondWith`, la requête suit son cours normal (réseau + cache HTTP).

```js
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
```

- `event.request` : l'objet `Request` intercepté.
- `caches.match(request)` → `Promise<Response | undefined>` : cherche une réponse dans **tous** les caches (ou `cache.match` pour un cache précis).
- `event.respondWith(...)` : prend une `Response` ou une `Promise<Response>`.

Tel quel, c'est déjà la stratégie **cache-first**. Les sections suivantes déclinent les autres.

### 2.7 Les trois stratégies de cache

Le choix de stratégie se fait **par type de requête**. Trois patterns couvrent l'essentiel (source : web.dev Offline Cookbook).

**Cache-first (cache, sinon réseau)** — pour les assets figés (CSS/JS hashés, fonts, images statiques). Instantané, offline-friendly. Risque : sert une version périmée si l'URL n'est pas versionnée.

```js
// Cache d'abord ; réseau seulement si absent
caches.match(request).then((cached) => cached || fetch(request));
```

**Network-first (réseau, sinon cache)** — pour les données fraîches par nature (dashboard, journal du jour). On tente le réseau ; s'il échoue (offline), on sert la dernière réponse mise en cache.

```js
fetch(request).catch(() => caches.match(request));
```

**Stale-while-revalidate (cache tout de suite + rafraîchit en fond)** — pour le contenu semi-statique où « la toute dernière version » n'est pas vitale (avatars, listes peu changeantes). On sert le cache **immédiatement** et on met à jour en arrière-plan pour la prochaine fois.

```js
caches.open('dynamic').then((cache) =>
  cache.match(request).then((cached) => {
    const fresh = fetch(request).then((networkResponse) => {
      // .clone() : un corps de Response ne se lit qu'UNE fois -> une copie pour le cache
      cache.put(request, networkResponse.clone());
      return networkResponse;
    });
    return cached || fresh;   // cache tout de suite, sinon on attend le réseau
  })
);
```

C'est l'écho **côté client** du `stale-while-revalidate` HTTP du module 06 : même idée (servir périmé + revalider en fond), mais piloté par *ton* code au lieu de l'en-tête `Cache-Control`.

> `response.clone()` est obligatoire dès qu'on lit **et** met en cache la même réponse : le corps (`ReadableStream`) ne peut être consommé qu'une fois. Une copie va au cache, l'original à la page.

### 2.8 La page de repli offline

Pour une navigation (document HTML) hors ligne et non cachée, on sert une page de repli précachée au lieu d'une erreur brute :

```js
self.addEventListener('fetch', (event) => {
  // Ne traiter que les navigations (barre d'adresse, clic sur un lien)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/offline.html'))
    );
  }
});
```

`request.mode === 'navigate'` isole les requêtes de page. Le `/offline.html` a été précaché à l'`install` (2.4). Résultat : offline, l'utilisateur voit une page TribuZen soignée (« Pas de connexion — tes données se synchroniseront au retour »), jamais le dinosaure.

### 2.9 Le Web App Manifest : rendre l'app installable

Le SW gère l'offline ; le **Web App Manifest** rend l'app **installable** (icône sur l'écran d'accueil, lancement plein écran sans barre de navigateur). C'est un fichier JSON lié depuis le HTML :

```html
<link rel="manifest" href="/manifest.webmanifest" />
```

```json
{
  "name": "TribuZen",
  "short_name": "TribuZen",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#F8F5F0",
  "theme_color": "#6B7E6B",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

Membres clés :
- `name` / `short_name` : nom complet / nom court (sous l'icône).
- `start_url` : URL ouverte au lancement.
- `display: "standalone"` : app sans chrome de navigateur (allure native).
- `icons` : au moins une **192×192** et une **512×512** ; `purpose: "any maskable"` pour les icônes adaptatives Android.
- `theme_color` / `background_color` : couleur de la barre système et du splash screen.

**Critères d'installabilité** (audit Lighthouse, catégorie PWA) : servi en HTTPS, un manifest valide avec `name`, `icons` (192 + 512) et `start_url`, **et** un Service Worker enregistré. Les deux vont ensemble : manifest sans SW = pas installable comme PWA.

### 2.10 Workbox — en survol

Écrire à la main les stratégies, la purge de versions, l'expiration par entrée devient vite verbeux et source de bugs. **Workbox** (Google) est la bibliothèque de référence qui encapsule tout ça. Tu n'écris plus les handlers `fetch`, tu **déclares des routes** :

```js
// sw.js avec Workbox (survol — pas à mémoriser)
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';

// Images -> cache-first
registerRoute(({ request }) => request.destination === 'image', new CacheFirst());
// API -> network-first
registerRoute(({ url }) => url.pathname.startsWith('/api/'), new NetworkFirst());
// Navigations -> stale-while-revalidate
registerRoute(({ request }) => request.mode === 'navigate', new StaleWhileRevalidate());
```

`registerRoute(matchFn, strategy)` (paquet `workbox-routing`) associe un filtre à une stratégie (`workbox-strategies` : `CacheFirst`, `NetworkFirst`, `StaleWhileRevalidate`, `NetworkOnly`, `CacheOnly`). En prod, on utilise Workbox — mais **avoir écrit les handlers à la main une fois** est ce qui te permet de débugger ce que Workbox fait sous le capot. C'est l'objectif de ce module ; le lab reste en vanilla.

---

## 3. Worked examples

### Exemple 1 — `sw.js` complet pour TribuZen (le cas concret, résolu)

On assemble install + activate + fetch avec une stratégie **par type de requête**.

```js
// public/sw.js — Service Worker TribuZen (vanilla, sans Workbox)
const VERSION = 'v3';
const SHELL_CACHE = `tribuzen-shell-${VERSION}`;
const DATA_CACHE = `tribuzen-data-${VERSION}`;

const SHELL = ['/', '/offline.html', '/assets/app.css', '/assets/app.js'];

// 1) INSTALL — précacher le shell applicatif
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL))
  );
  self.skipWaiting(); // la nouvelle version s'active sans attendre
});

// 2) ACTIVATE — purger tous les caches d'une version précédente
self.addEventListener('activate', (event) => {
  const current = [SHELL_CACHE, DATA_CACHE];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => !current.includes(k)).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim(); // contrôle immédiat des onglets ouverts
});

// 3) FETCH — stratégie choisie selon la requête
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // a) Navigation (page HTML) : réseau d'abord, repli offline si échec
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/offline.html'))
    );
    return;
  }

  // b) API famille : network-first (données fraîches), cache en secours offline
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // On met à jour le cache de données au passage (clone obligatoire)
          const copy = res.clone();
          caches.open(DATA_CACHE).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request)) // offline -> dernière réponse connue
    );
    return;
  }

  // c) Assets versionnés (JS/CSS hashés) : cache-first (figés, instantanés)
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
```

**Ce qui rend ce SW correct :**
- Le shell (coquille de l'app) est garanti offline dès l'`install`.
- L'API est en **network-first** : on privilégie la fraîcheur, mais offline on sert la dernière réponse — le parent voit le dashboard d'hier plutôt qu'une erreur.
- Les assets hashés sont en **cache-first** : instantanés, et jamais périmés puisque leur URL change à chaque build (module 07).
- Le versionnage `v3` dans les noms de cache déclenche la purge automatique à l'`activate` du prochain déploiement.

### Exemple 2 — Stale-while-revalidate pour les avatars famille

Les avatars des membres changent rarement mais ne sont pas critiques : on veut l'affichage **instantané** et une mise à jour discrète. C'est le cas d'école du SWR côté client.

```js
// Dans le handler fetch, branche dédiée aux avatars
if (url.pathname.startsWith('/avatars/')) {
  event.respondWith(
    caches.open('tribuzen-avatars').then((cache) =>
      cache.match(request).then((cached) => {
        // Requête réseau lancée en parallèle, quoi qu'il arrive
        const network = fetch(request).then((res) => {
          cache.put(request, res.clone()); // maj pour la PROCHAINE visite
          return res;
        });
        // On renvoie le cache TOUT DE SUITE s'il existe ; sinon on attend le réseau
        return cached || network;
      })
    )
  );
  return;
}
```

**Pourquoi c'est correct :**
- Premier affichage sans cache : `cached` est `undefined` → on attend `network` (une fois).
- Visites suivantes : l'avatar caché s'affiche **immédiatement**, pendant que `network` rafraîchit silencieusement le cache pour la fois d'après.
- `res.clone()` : la réponse réseau est lue deux fois (retour à la page + `cache.put`) — sans clone, la seconde lecture jetterait une erreur « body already used ».

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Croire que le SW contrôle la page qui l'a enregistré, tout de suite

Au **premier** chargement, la page est déjà en cours quand le SW s'installe : elle n'est **pas contrôlée** par lui. Le SW ne prend la main qu'au **rechargement suivant** — ou immédiatement si tu appelles `self.clients.claim()` à l'`activate`. Ne t'étonne pas qu'un `fetch` ne soit pas intercepté à la toute première visite.

### PIÈGE #2 — Précacher une URL qui 404 → tout l'`install` échoue

```js
// ❌ Une seule URL invalide fait rejeter addAll ET échouer l'install
cache.addAll(['/', '/app.js', '/typo-inexistant.css']); // 404 -> SW jamais installé
```

`cache.addAll` est **atomique** : une entrée en échec annule tout. Vérifie chaque URL du shell. Pour des ressources optionnelles, utilise `cache.add` individuellement dans des `try/catch` séparés plutôt que de les mettre dans le `addAll` critique.

### PIÈGE #3 — Oublier `response.clone()`

```js
// ❌ "Failed to execute 'put': Response body is already used"
const res = await fetch(request);
cache.put(request, res);   // consomme le body...
return res;                // ...puis on tente de le renvoyer -> erreur
```

Le corps d'une `Response` est un flux lisible **une seule fois**. Dès que tu la mets en cache *et* la renvoies, clone : `cache.put(request, res.clone())`.

### PIÈGE #4 — `skipWaiting()` sans réfléchir aux versions mixtes

`self.skipWaiting()` active le nouveau SW immédiatement, même si des onglets tournent encore avec l'ancien code. Si le nouveau SW change le format du cache ou des données, une page **ancienne** peut recevoir des réponses **nouvelles** incompatibles. C'est pratique en dev, mais en prod il faut soit versionner proprement les caches (comme dans l'Exemple 1), soit prévenir l'utilisateur (« nouvelle version disponible, recharger ») avant de skipper.

### PIÈGE #5 — Confondre Cache API et cache HTTP (rappel module 07)

```
❌ « J'ai mis Cache-Control: no-store, pourtant le SW sert encore l'ancienne réponse. »
```

La **Cache API n'honore pas les en-têtes HTTP**. Une réponse rangée par `cache.put()` est servie par *ton* code, quel que soit son `Cache-Control`. `no-store` n'y touche pas. Pour la purger : `caches.delete(...)` dans le code, ou en debug DevTools > Application > Cache Storage **et** Unregister du SW.

### PIÈGE #6 — Le SW en cache-first sur `sw.js` lui-même

Si tu sers `sw.js` avec un `Cache-Control` long, le navigateur peut garder l'**ancien** fichier SW et ne jamais détecter ta mise à jour (la mise à jour du SW dépend d'un octet différent dans `sw.js`). Sers **toujours** `sw.js` avec `Cache-Control: no-cache` (ou `max-age=0`). Les navigateurs modernes limitent déjà le cache du script SW à 24 h, mais ne compte pas dessus.

### PIÈGE #7 — Tester la PWA sans HTTPS

Un SW ne s'enregistre qu'en **HTTPS** ou sur **`localhost`**. En dev réseau (`http://192.168.x.x`) sur ton téléphone, `navigator.serviceWorker.register` échoue silencieusement. Utilise `localhost`, un tunnel HTTPS (type `ngrok`), ou un certificat local.

---

## 5. Ancrage TribuZen

TribuZen est **PWA-first** : installable, utilisable offline, pensée pour des parents en mobilité. Ce module fournit exactement la couche offline.

**Le shell précaché.** Au premier lancement, le SW précache la coquille de l'app (`/`, `/offline.html`, le bundle CSS/JS hashé). Résultat : même hors ligne, l'ossature de TribuZen s'affiche instantanément — on ne repart jamais d'un écran blanc.

**Le dashboard famille en network-first.** `/api/family/today` (routines du jour, tâches) est servi réseau d'abord pour la fraîcheur, cache en secours offline. Dans le métro, le parent voit la dernière version connue au lieu d'une erreur — puis les données se rafraîchissent au retour du réseau.

**Les avatars en stale-while-revalidate** (Exemple 2). Les photos des membres s'affichent tout de suite depuis le cache, se mettent à jour en fond. Perçu instantané, charge réseau minimale.

**La page de repli.** `/offline.html` affiche un message rassurant, cohérent avec la promesse anti-charge-mentale (« Pas de connexion — tout se resynchronise au retour »), jamais le dinosaure Chrome.

> Les actions **d'écriture** offline (compléter une routine hors ligne, à rejouer au retour du réseau via Background Sync) et les **notifications push** de rappel s'appuient sur ce même SW mais relèvent du **module 16 (Push API & notifications)**. Ici, on couvre la **lecture offline** et l'installabilité.

Fichiers cibles dans `smaurier/tribuzen` :
```
tribuzen/
  public/
    sw.js                    # install/activate/fetch — stratégies par requête
    offline.html             # page de repli hors ligne
    manifest.webmanifest     # name, start_url, display standalone, icons 192/512
  src/
    main.ts                  # navigator.serviceWorker.register('/sw.js') après load
  server/headers.ts          # sw.js servi en Cache-Control: no-cache
```

---

## 6. Points clés

1. Un Service Worker est un proxy réseau programmable, dans un thread séparé, sans DOM, en HTTPS (ou localhost), limité à son scope.
2. Cycle de vie : `register` (depuis la page) → `install` (précache) → `activate` (purge des anciens caches) → `fetch` (interception).
3. `event.waitUntil()` prolonge un event le temps d'une promesse ; `install` précache le shell avec `caches.open` + `cache.addAll` (atomique).
4. `activate` purge via `caches.keys` + `caches.delete` ; `skipWaiting()` et `clients.claim()` évitent l'attente et prennent le contrôle immédiat.
5. Dans `fetch`, `event.respondWith()` court-circuite le réseau ; `caches.match()` cherche une réponse cachée.
6. Trois stratégies : cache-first (assets figés), network-first (données fraîches), stale-while-revalidate (semi-statique, sert le cache + rafraîchit en fond).
7. `response.clone()` est obligatoire dès qu'on lit et met en cache la même réponse (body lisible une seule fois).
8. La Cache API n'honore pas `Cache-Control` — c'est ton code qui décide ; purge via `caches.delete` ou DevTools + Unregister.
9. Une page de repli offline (précachée) se sert sur `request.mode === 'navigate'` en secours du réseau.
10. Le Web App Manifest (name, start_url, display standalone, icons 192/512) rend l'app installable ; SW + manifest ensemble = PWA installable.
11. Workbox déclare des routes (`registerRoute` + stratégies) au lieu de handlers manuels — mais comprendre le vanilla d'abord permet de débugger.

---

## 7. Seeds Anki

```
Pourquoi un Service Worker n'intercepte-t-il pas les requêtes de la page à sa toute première visite ?|La page est déjà chargée quand le SW s'installe : elle n'est pas contrôlée. Le SW prend la main au rechargement suivant, OU immédiatement si on appelle self.clients.claim() dans l'event activate.
À quoi sert event.waitUntil() dans un Service Worker ?|Il prolonge la durée de vie d'un event (install/activate) tant que la promesse passée n'est pas résolue. On l'utilise pour garantir que le précache (install) ou la purge (activate) est terminé avant de passer à l'état suivant.
Décris les 3 stratégies de cache d'un Service Worker et leur cas d'usage.|cache-first (caches.match sinon fetch) pour les assets figés/hashés ; network-first (fetch sinon caches.match) pour les données fraîches comme une API ; stale-while-revalidate (sert le cache tout de suite + fetch en fond via cache.put) pour le semi-statique comme les avatars.
Pourquoi response.clone() est-il obligatoire quand on met une réponse en cache et qu'on la renvoie ?|Le corps d'une Response est un flux lisible une seule fois. cache.put(request, res) consomme le body ; le renvoyer ensuite jette "body already used". On clone : cache.put(request, res.clone()) et on renvoie l'original.
Que fait self.skipWaiting() et quel est son risque ?|Il active le nouveau SW immédiatement sans attendre la fermeture des onglets contrôlés par l'ancien. Risque : des pages ouvertes avec l'ancien code reçoivent des réponses du nouveau SW, potentiellement incompatibles (formats de cache/données). En prod, versionner les caches ou prévenir l'utilisateur.
Comment purge-t-on les anciens caches d'un Service Worker, et quand ?|Dans l'event activate : caches.keys() liste les caches, on filtre ceux dont le nom n'est pas la version courante et on appelle caches.delete(name) sur chacun. Le versionnage du nom de cache (v1, v2...) rend la purge automatique à chaque déploiement.
La Cache API honore-t-elle les en-têtes Cache-Control ?|Non. C'est ton code qui décide quoi stocker (cache.put) et quoi servir (cache.match). Un Cache-Control: no-store n'empêche ni le stockage ni le service. Pour purger : caches.delete() ou DevTools Application > Cache Storage + Unregister du SW.
Quels sont les critères pour qu'une app web soit installable comme PWA ?|HTTPS, un Web App Manifest valide avec name, start_url et des icons (au moins 192x192 et 512x512), display standalone, ET un Service Worker enregistré. Manifest sans SW = non installable comme PWA.
Comment sert-on une page de repli offline dans le fetch handler ?|On teste request.mode === 'navigate' pour cibler les navigations HTML, puis event.respondWith(fetch(request).catch(() => caches.match('/offline.html'))). La page offline.html a été précachée à l'install.
Qu'est-ce que Workbox et qu'apporte-t-il par rapport au SW vanilla ?|Une bibliothèque Google qui encapsule les stratégies de cache. Au lieu d'écrire les handlers fetch, on déclare des routes : registerRoute(matchFn, new CacheFirst()) (paquets workbox-routing + workbox-strategies : CacheFirst, NetworkFirst, StaleWhileRevalidate, NetworkOnly, CacheOnly).
```

---

## Pont vers le lab

> Lab associé : `11-http-caching/labs/lab-15-pwa-service-workers/README.md`. Enregistrer un vrai Service Worker, l'observer dans DevTools > Application (Service Workers + Cache Storage), implémenter les 3 stratégies et une page offline, valider en mode Offline — corrigé inline, variante J+30, portage TribuZen.
