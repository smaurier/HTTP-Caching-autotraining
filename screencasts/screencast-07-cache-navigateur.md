# Screencast 07 — Cache navigateur : couches et Service Worker

## Informations
- **Durée estimée** : 14-15 min
- **Module** : `modules/07-cache-navigateur.md`
- **Lab associé** : `labs/lab-07-service-worker-cache/`
- **Prérequis** : Screencast 04 (Cache-Control), Screencast 06 (SWR)

## Setup
- [ ] Application web de démo avec Service Worker : `labs/lab-07-service-worker-cache/`
- [ ] Chrome DevTools ouverts (onglets Network, Application, et Performance)
- [ ] Serveur local HTTPS (le Service Worker nécessite HTTPS ou localhost)
- [ ] Mode avion ou Network throttling disponible pour les démos offline

## Script

### [00:00-01:30] Introduction — Le cache navigateur, c'est plusieurs caches

> Salut ! Quand on parle de "cache navigateur", on pense souvent à un seul mécanisme. En réalité, le navigateur a plusieurs couches de cache qui travaillent ensemble. Comprendre ces couches, c'est comprendre pourquoi parfois votre changement ne s'affiche pas, et surtout comment optimiser la performance de votre application.

**Action** : Afficher le slide "Module 07 — Cache navigateur".

> Aujourd'hui, on va explorer le memory cache, le disk cache, le cache HTTP classique, et surtout le Service Worker cache, qui vous donne un contrôle total sur ce qui est mis en cache et comment.

### [01:30-04:00] Les couches du cache navigateur

> Quand le navigateur a besoin d'une ressource, il consulte ses caches dans un ordre précis.

**Action** : Afficher un schéma des couches de cache du navigateur.

> Première couche : le memory cache. C'est le plus rapide — la ressource est en RAM. C'est là que sont stockées les ressources utilisées dans la page actuelle. Quand vous voyez "(from memory cache)" dans les DevTools, c'est ce cache. Il est vidé quand vous fermez l'onglet.

> Deuxième couche : le Service Worker cache. Si un Service Worker est installé, il peut intercepter les requêtes et répondre avec sa propre version en cache. On va s'y attarder.

> Troisième couche : le disk cache (où HTTP cache). C'est le cache HTTP classique, celui qui respecte les directives Cache-Control. Les ressources sont stockées sur le disque dur. Quand vous voyez "(from disk cache)" dans les DevTools, c'est lui.

> Et enfin, si aucun cache n'à la ressource, le navigateur fait une vraie requête réseau.

**Action** : Lancer le serveur du lab et ouvrir la page de démo.

```bash
cd labs/lab-07-service-worker-cache
node exercise.js
```

**Action** : Dans les DevTools, naviguer et montrer les différentes sources de cache dans la colonne Size.

> Regardez la colonne Size dans le Network panel. "(from memory cache)" pour les images déjà chargées dans la page. "(from disk cache)" pour le CSS et JS avec max-age encore valide. Et la taille réelle en octets pour les requêtes qui sont allées au réseau.

### [04:00-08:00] Service Worker — Le cache programmable

> Passons au Service Worker. C'est un script JavaScript qui s'exécute entre votre application et le réseau. Il peut intercepter chaque requête et décider quoi en faire. C'est votre proxy personnel, entièrement programmable.

**Action** : Ouvrir le fichier Service Worker dans l'éditeur.

```javascript
// sw.js - Service Worker basique
const CACHE_NAME = 'app-cache-v1';
const ASSETS = [
  '/',
  '/style.css',
  '/app.js',
  '/offline.html'
];

// Installation : pré-cacher les ressources essentielles
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// Interception des requêtes
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request);
    })
  );
});
```

> Ce Service Worker fait deux choses. A l'installation, il pré-cache les ressources essentielles de l'application. Ensuite, à chaque requête, il vérifie d'abord dans le cache. Si la ressource est en cache, il la sert directement. Sinon, il la demandé au réseau. C'est la stratégie "Cache First".

**Action** : Enregistrer le Service Worker et montrer dans les DevTools Application > Service Workers.

> Dans les DevTools, onglet Application, puis Service Workers, je vois mon SW installé et activé. Et dans Cache Storage, je vois les ressources pré-cachées.

**Action** : Rafraîchir la page et observer que les requêtes sont servies par le Service Worker.

> Si je rafraîchis et que je regarde le Network panel, les requêtes montrent une icône de roue dentée à côté. Ça signifie qu'elles ont été interceptées par le Service Worker. La réponse vient du cache du SW, pas du réseau.

### [08:00-11:00] Stratégies de cache avec Service Worker

> Le "Cache First" est une stratégie, mais il en existe d'autres. Voyons les plus courantes.

**Action** : Afficher un schéma des différentes stratégies.

> Stratégie "Network First" : on essaie d'abord le réseau. Si ça échoue (offline), on sert le cache. Parfait pour du contenu dynamique qui doit être frais mais disponible offline.

```javascript
// Network First
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Mettre à jour le cache avec la réponse fraîche
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
```

> Stratégie "Stale While Revalidate" : on sert le cache immédiatement et on met à jour en arrière-plan. C'est le SWR qu'on a vu, mais implémenté côté client.

```javascript
// SWR côté Service Worker
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      });
      return cached || networkFetch;
    })
  );
});
```

**Action** : Démontrer le mode offline en activant le mode avion dans les DevTools.

> Et maintenant, le test ultime. J'active le mode offline dans les DevTools (onglet Network, cocher "Offline").

> Je rafraîchis la page et... elle s'affiche ! L'application fonctionne sans connexion parce que le Service Worker sert tout depuis son cache. C'est ça la puissance du Service Worker.

**Action** : Montrer la page offline.html pour les pages non cachées.

> Par contre, si j'essaie d'accéder à une page qui n'est pas dans le cache, le Service Worker peut servir une page offline de fallback. "Vous êtes hors ligne, voici les dernières données disponibles." C'est une bien meilleure expérience que la page "Pas de connexion" du navigateur.

### [11:00-13:00] Gestion du cycle de vie — Mise à jour du cache

> Un point critique : comment mettre à jour le cache du Service Worker ?

**Action** : Montrer le mécanisme de versioning du cache.

```javascript
// Nouvelle version du cache
const CACHE_NAME = 'app-cache-v2'; // v1 -> v2

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.filter((name) => name !== CACHE_NAME)
             .map((name) => caches.delete(name))
      );
    })
  );
});
```

> A chaque déploiement, on incrémente la version du cache. Le nouveau Service Worker s'installe, et à l'activation, il supprime les anciens caches. Attention par contre : le nouveau Service Worker ne s'active pas immédiatement — il attend que tous les onglets utilisant l'ancien SW soient fermés.

> C'est pour ça que dans les DevTools, vous voyez parfois "waiting to activate". Vous pouvez cliquer sur "skipWaiting" pour forcer l'activation, ou ajouter `self.skipWaiting()` dans l'événement install.

### [13:00-14:30] Récap — Le cache navigateur maîtrisé

> Résumons. Le navigateur a plusieurs couches de cache : memory, Service Worker, disk/HTTP. Le Service Worker vous donne un contrôle total et permet le fonctionnement offline. Les stratégies principales sont Cache First, Network First, et Stale While Revalidate. Et la gestion du cycle de vie est cruciale pour les mises à jour.

**Action** : Mentionner le quiz et le lab.

> Le lab `labs/lab-07-service-worker-cache/` vous fait implémenter un Service Worker complet avec plusieurs stratégies selon le type de ressource. Les assets en Cache First, les APIs en Network First, et une page offline de fallback. C'est un lab très concret. Prochain screencast : les CDN, le cache côté infrastructure. A plus !

## Points d'attention pour l'enregistrement
- Le Service Worker nécessite HTTPS ou localhost, vérifier la configuration
- Bien montrer les différentes valeurs dans la colonne Size des DevTools
- La démo offline est très impactante, prendre le temps de la montrer
- Attention au cache du SW pendant l'enregistrement : utiliser "Update on reload" dans DevTools pour faciliter les tests
