# Screencast 15 — Projet final : architecture complète et audit

## Informations
- **Durée estimée** : 14-15 min
- **Module** : `modules/15-projet-final.md`
- **Lab associé** : `labs/lab-15-final-project/`
- **Prérequis** : Tous les screencasts précédents (00 à 14)

## Setup
- [ ] Projet final complet : `labs/lab-15-final-project/`
- [ ] Toute l'architecture lancée : serveur origin, reverse proxy, CDN simulé, Service Worker
- [ ] Chrome DevTools ouverts (tous les onglets)
- [ ] Terminal avec curl
- [ ] Lighthouse prêt pour l'audit final

## Script

### [00:00-02:00] Introduction — On rassemble tout

> Salut à tous ! Voilà, on y est. Le dernier screencast. On a couvert le protocole HTTP, les en-têtes, Cache-Control, les ETags, le SWR, le cache navigateur, les CDN, le cache multi-couches, le SSR, l'ISR, l'edge, le streaming, et la performance web. C'est beaucoup de concepts. Aujourd'hui, on met tout ensemble dans un projet complet.

**Action** : Afficher le slide "Module 15 — Projet Final".

> Notre projet final, c'est une application e-commerce simplifiée. Un catalogue de produits, des pages de détail, un panier, et un espace utilisateur. Chaque partie a ses propres besoins en cache, et on va les configurer de manière optimale en utilisant tout ce qu'on a appris.

### [02:00-04:30] Architecture du projet — Vue d'ensemble

> Commençons par l'architecture.

**Action** : Afficher le schéma d'architecture complet et lancer le projet.

```bash
cd labs/lab-15-final-project
npm install && npm start
```

> Notre architecture a quatre couches. Le navigateur avec un Service Worker. Le CDN simulé (port 3000). Le reverse proxy (port 4000). Et le serveur d'origine avec une base de données en mémoire (port 5000).

**Action** : Montrer la structure des fichiers du projet.

```bash
ls -la labs/lab-15-final-project/
# server/          - Serveur d'origine (Express)
# proxy/           - Reverse proxy
# cdn/             - CDN simulé
# public/          - Assets statiques
# sw.js            - Service Worker
# pages/           - Pages SSR
```

> Chaque couche a un rôle précis. Le Service Worker gère le cache offline et la stratégie SWR côté client. Le CDN absorbe le trafic public. Le reverse proxy cache les réponses API fréquentes. Et le serveur d'origine est le dernier recours.

### [04:30-08:00] Configuration du cache par type de ressource

> Voyons la configuration cache pour chaque type de ressource.

**Action** : Ouvrir les fichiers de configuration dans l'éditeur.

> Les assets statiques avec hash : c'est notre cache le plus agressif.

```javascript
// server/static.js
app.use('/assets', express.static('public/assets', {
  maxAge: '1y',
  immutable: true,
  etag: true
}));
// Cache-Control: public, max-age=31536000, immutable
```

> Les images produits : cache long avec ETag pour revalidation.

```javascript
// server/images.js
app.use('/images/products', express.static('public/images/products', {
  maxAge: '7d',
  etag: true
}));
// Cache-Control: public, max-age=604800
// ETag: "img-abc123"
```

> La page d'accueil et les pages catalogue : ISR-style avec SWR.

```javascript
// server/pages.js
app.get('/', (req, res) => {
  const html = renderHomePage();
  res.set('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
  res.set('ETag', generateETag(html));
  res.send(html);
});
```

> L'API catalogue (publique) : cache CDN avec SWR et stale-if-error.

```bash
curl -I http://localhost:3000/api/products
# Cache-Control: public, max-age=30, s-maxage=120, stale-while-revalidate=300, stale-if-error=86400
# Vary: Accept-Encoding
# ETag: "cat-v42"
```

> L'API panier et profil (privée) : cache navigateur uniquement.

```bash
curl -I http://localhost:3000/api/cart
# Cache-Control: private, max-age=0, must-revalidate
# ETag: "cart-user123-v7"
```

> Les données sensibles (paiement) : aucun cache.

```bash
curl -I http://localhost:3000/api/checkout
# Cache-Control: no-store
# Pragma: no-cache
```

**Action** : Récapituler dans un tableau toutes les stratégies.

> Vous voyez le pattern ? Chaque ressource a sa stratégie. Plus c'est public et statique, plus le cache est agressif. Plus c'est privé et dynamique, moins on cache. C'est la pyramide du cache.

### [08:00-10:30] Le Service Worker — Stratégie complète

> Voyons le Service Worker du projet.

**Action** : Ouvrir le fichier `sw.js`.

```javascript
// sw.js - Service Worker complet
const CACHE_VERSION = 'v1';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `dynamic-${CACHE_VERSION}`;

// Assets à pré-cacher
const PRECACHE_ASSETS = [
  '/',
  '/offline.html',
  '/assets/style.abc123.css',
  '/assets/app.def456.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(PRECACHE_ASSETS))
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Assets statiques : Cache First
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Pages HTML : Network First avec fallback offline
  if (request.headers.get('Accept')?.includes('text/html')) {
    event.respondWith(networkFirstWithOffline(request));
    return;
  }

  // API publiques : SWR
  if (url.pathname.startsWith('/api/products')) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Tout le reste : Network Only
  event.respondWith(fetch(request));
});
```

**Action** : Démontrer le fonctionnement offline en coupant le réseau.

> Si je coupe le réseau... l'application fonctionne toujours pour les pages et le catalogue. Le panier et le checkout ne fonctionnent plus — c'est normal, ce sont des opérations qui nécessitent le serveur. Mais l'utilisateur peut toujours naviguer dans le catalogue et voir les produits.

### [10:30-12:30] Audit complet — Lighthouse et vérification des en-têtes

> Maintenant, faisons un audit complet.

**Action** : Lancer un audit Lighthouse sur la page d'accueil.

> Lighthouse nous donne un score de 95 en performance. LCP à 0.8 secondes — excellent, grâce au cache CDN et aux images optimisées. Pas de recommandation sur le cache — toutes nos ressources ont les bons en-têtes.

**Action** : Vérifier les en-têtes de chaque type de ressource avec curl.

```bash
# Vérification systématique des en-têtes
echo "=== Page HTML ==="
curl -sI http://localhost:3000/ | grep -i "cache-control\|etag\|vary"

echo "=== Asset CSS ==="
curl -sI http://localhost:3000/assets/style.abc123.css | grep -i "cache-control\|etag"

echo "=== API publique ==="
curl -sI http://localhost:3000/api/products | grep -i "cache-control\|etag\|vary"

echo "=== API privée ==="
curl -sI http://localhost:3000/api/cart | grep -i "cache-control\|etag"
```

**Action** : Vérifier les hit ratios du CDN et du proxy.

```bash
# Hit ratio du CDN
curl http://localhost:3000/admin/cache-stats
# {"cdn_hit_ratio": 0.87, "proxy_hit_ratio": 0.92, "total_requests": 1523}
```

> 87% de hit ratio CDN, 92% sur le proxy. C'est excellent. Ça signifie que seulement 8% des requêtes publiques atteignent le serveur d'origine. Le cache fait son travail.

### [12:30-14:00] Les erreurs courantes — Derniers conseils

> Avant de conclure la formation, voici les erreurs les plus courantes que je vois en production.

**Action** : Afficher la liste des erreurs courantes.

> Erreur 1 : oublier Vary: Accept-Encoding. Le CDN sert du gzip à un client qui n'en veut pas, ou l'inverse.

> Erreur 2 : mettre max-age long sur le HTML. L'utilisateur ne voit jamais les mises à jour. Utilisez no-cache ou max-age très court pour le HTML.

> Erreur 3 : cacher du contenu privé sur le CDN. Un utilisateur voit les données d'un autre. Toujours private pour les données personnalisées.

> Erreur 4 : ne pas tester l'invalidation. Votre cache fonctionne, mais pouvez-vous le purger quand il faut ?

> Erreur 5 : ignorer le Service Worker en production. Il peut devenir un cauchemar si mal géré — les utilisateurs restent bloqués sur une vieille version.

> Erreur 6 : ne pas monitorer. Mettez en place des alertes sur le hit ratio et les Core Web Vitals. Un déploiement peut casser votre stratégie de cache sans que vous vous en rendiez compte.

### [14:00-15:00] Récap — Conclusion de la formation

> Et voilà, on a fait le tour. Résumons toute la formation en quelques phrases.

**Action** : Afficher le slide récapitulatif de la formation.

> HTTP est un protocole texte avec des en-têtes qui contrôlent le cache. Cache-Control est le chef d'orchestre : public/private, max-age, no-cache, no-store. Les ETags permettent la revalidation fine avec le pattern 304. SWR offre le meilleur compromis fraîcheur/performance. Le cache multi-couches — navigateur, CDN, proxy, application — chaque couche a son rôle. Le SSR, l'ISR, le streaming et l'edge sont des techniques modernes qui s'appuient toutes sur ces fondamentaux.

> Et la règle d'or : mesurez, optimisez, mesurez encore. Lighthouse et les Core Web Vitals sont vos guides.

**Action** : Mentionner le projet final du lab.

> Le lab `labs/lab-15-final-project/` est votre projet de fin de formation. Vous allez configurer toute l'architecture de cache d'une application e-commerce, faire un audit Lighthouse, optimiser, et documenter vos choix. C'est le moment de prouver que vous maîtrisez le sujet.

> Merci d'avoir suivi cette formation. Le caching HTTP, c'est un des sujets les plus sous-estimés du développement web, et maintenant vous avez toutes les cartes en main pour l'implémenter correctement. Bonne chance pour le projet final, et bon caching !

## Points d'attention pour l'enregistrement
- C'est le screencast final, prendre un ton un peu plus solennel pour la conclusion
- L'architecture complète doit fonctionner de bout en bout, tester toutes les routes avant
- L'audit Lighthouse doit donner un bon score pour que la démo soit convaincante
- La checklist des erreurs courantes est un excellent rappel, bien les articuler
- Prévoir un petit temps supplémentaire pour la conclusion émotionnelle
