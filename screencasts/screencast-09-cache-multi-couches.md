# Screencast 09 — Cache multi-couches : démo et invalidation

## Informations
- **Durée estimée** : 14-15 min
- **Module** : `modules/09-cache-multi-couches.md`
- **Lab associé** : `labs/lab-09-multi-layer-cache/`
- **Prérequis** : Screencast 07 (Cache navigateur), Screencast 08 (CDN)

## Setup
- [ ] Architecture complète du lab : `labs/lab-09-multi-layer-cache/exercise.js` (origin + reverse proxy + CDN simulé)
- [ ] Chrome DevTools ouverts
- [ ] Terminal avec curl pour les tests à chaque couche
- [ ] Schéma d'architecture multi-couches

## Script

### [00:00-01:30] Introduction — L'orchestre du cache

> Salut ! On a vu le cache navigateur, le CDN, les ETags, Cache-Control. Chaque mécanisme est puissant seul, mais dans une application réelle, ils travaillent tous ensemble. C'est un orchestre, et aujourd'hui on va apprendre à le diriger.

**Action** : Afficher le slide "Module 09 — Cache multi-couches".

> Le cache multi-couches, c'est quand chaque requête traverse potentiellement : le memory cache du navigateur, le disk cache, le Service Worker, un CDN edge, un reverse proxy (Varnish/Nginx), un cache applicatif (Redis), et enfin la base de données. Chaque couche à un rôle, et la clé c'est de bien les coordonner.

### [01:30-04:30] L'architecture en couches — Vue d'ensemble

> Voyons notre architecture de démo.

**Action** : Afficher le schéma d'architecture et lancer le lab.

```bash
cd labs/lab-09-multi-layer-cache
node exercise.js
```

> J'ai trois processus qui tournent. Le serveur d'origine sur le port 5000 — c'est notre API avec la base de données. Le reverse proxy sur le port 4000 — il fait office de cache serveur, comme Varnish ou Nginx. Et le CDN simulé sur le port 3000 — c'est le point d'entrée pour les clients.

> Quand un utilisateur fait une requête, elle traverse les couches dans cet ordre : navigateur -> CDN -> reverse proxy -> origine. Et la réponse fait le chemin inverse, en se faisant cacher à chaque couche selon les directives.

```bash
# Requête à travers toutes les couches
curl -v http://localhost:3000/api/products/1
```

**Action** : Montrer les en-têtes de chaque couche dans la réponse.

> Regardez les en-têtes de réponse. `X-CDN-Cache: MISS`, `X-Proxy-Cache: MISS` — c'est la première requête, aucun cache n'à la réponse. Le serveur d'origine a été sollicité.

```bash
# Deuxième requête
curl -v http://localhost:3000/api/products/1
```

> Deuxième requête : `X-CDN-Cache: HIT`. Le CDN a servi la réponse depuis son cache. Le reverse proxy et le serveur d'origine n'ont même pas été contactés. C'est l'objectif : que le maximum de requêtes soient absorbées le plus tôt possible.

### [04:30-07:30] Stratégie par type de ressource

> Chaque type de ressource mérite sa propre stratégie de cache. Voyons les cas courants.

**Action** : Afficher un tableau des stratégies par type de ressource.

> Les assets statiques avec hash (CSS, JS, images) : cache maximum partout. `Cache-Control: public, max-age=31536000, immutable`. Le navigateur, le CDN, le proxy — tout le monde cache pendant un an. Si le fichier change, le hash change, l'URL change.

```bash
curl -I http://localhost:3000/assets/bundle.a1b2c3.js
# Cache-Control: public, max-age=31536000, immutable
# X-CDN-Cache: HIT
```

> Les pages HTML : pas de cache longue durée, revalidation obligatoire. `Cache-Control: no-cache`. Le CDN et le navigateur stockent, mais revalident à chaque requête. Pourquoi ? Parce que le HTML référence les assets. Si l'utilisateur à un vieux HTML en cache, il demandé les anciens assets avec les anciens hash, et il ne voit jamais les mises à jour.

```bash
curl -I http://localhost:3000/
# Cache-Control: no-cache
# ETag: "page-v42"
```

> Les APIs publiques (catalogue produits, articles) : cache CDN moyen avec SWR. `Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=600`. Le CDN cache 5 minutes, le navigateur 1 minute, et SWR étend la fenêtre de tolérance.

```bash
curl -I http://localhost:3000/api/products
# Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=600
```

> Les APIs privées (profil utilisateur, panier) : cache navigateur uniquement. `Cache-Control: private, max-age=300`. Le CDN ne doit jamais stocker ces données.

```bash
curl -I http://localhost:3000/api/user/profile
# Cache-Control: private, max-age=300
```

### [07:30-10:30] Invalidation multi-couches — Le défi

> Le plus gros défi du cache multi-couches, c'est l'invalidation. Quand une donnée change, il faut invalider toutes les couches dans le bon ordre.

**Action** : Simuler une mise à jour de données.

```bash
# L'article existe avec un prix de 29.99
curl http://localhost:3000/api/products/1
# {"id":1,"name":"Widget","price":29.99}

# Mise à jour du prix côté origine
curl -X PUT -H "Content-Type: application/json" \
  -d '{"price":39.99}' \
  http://localhost:5000/api/products/1

# Le CDN sert encore l'ancien prix !
curl http://localhost:3000/api/products/1
# {"id":1,"name":"Widget","price":29.99} <- STALE !
```

> Vous voyez le problème ? L'origine a le nouveau prix, mais le CDN sert encore l'ancien. C'est exactement le bug classique du cache périmé.

> Solution 1 : purge en cascade. Quand les données changent, on purge chaque couche.

```bash
# Purge du reverse proxy
curl -X PURGE http://localhost:4000/api/products/1

# Purge du CDN
curl -X PURGE http://localhost:3000/api/products/1

# Vérification
curl http://localhost:3000/api/products/1
# {"id":1,"name":"Widget","price":39.99} <- A JOUR !
```

**Action** : Montrer que la purge a fonctionné.

> Solution 2 : des durées de cache courtes avec SWR. Au lieu de purger, on accepte que les données soient périmées de quelques secondes. C'est souvent suffisant et beaucoup plus simple à gérer.

> Solution 3 : les webhooks et événements. Le serveur d'origine envoie un événement "produit modifié" qui déclenche automatiquement la purge sur toutes les couches.

### [10:30-12:30] Patterns avancés — Cache warming et stampede

> Deux problèmes avancés à connaître.

**Action** : Afficher un schéma du cache stampede.

> Le cache stampede (où thunder herd). Imaginez : le cache expire, et 1000 utilisateurs font la même requête au même moment. Le CDN fait 1000 requêtes à l'origine. Votre serveur s'effondre.

> La solution : le request collapsing (où request coalescing). Le CDN regroupe les requêtes identiques et n'en envoie qu'une seule à l'origine. Tous les CDN professionnels font ça. Notre mini-CDN aussi peut l'implémenter.

> Le cache warming. Au lieu d'attendre le premier utilisateur pour remplir le cache, on le remplit proactivement après un déploiement.

```bash
# Script de cache warming
for url in /api/products /api/categories /api/featured; do
  curl -s http://localhost:3000$url > /dev/null
  echo "Warmed: $url"
done
```

> Après un déploiement, on parcourt les URLs les plus populaires pour remplir le cache du CDN. Comme ça, le premier vrai utilisateur à un cache hit.

### [12:30-14:00] Monitoring et debug — Vérifier que tout fonctionne

> Comment vérifier que votre cache multi-couches fonctionne correctement ?

**Action** : Montrer les en-têtes de debug.

```bash
# Vérifier le statut de chaque couche
curl -I http://localhost:3000/api/products/1

# En-têtes à surveiller :
# X-CDN-Cache: HIT/MISS
# X-Proxy-Cache: HIT/MISS
# Age: 45  (secondes depuis la mise en cache)
# X-Cache-Hits: 12  (nombre de hits sur cette entrée)
```

> Les métriques clés : le hit ratio de chaque couche, le temps de réponse moyen (TTFB), et le taux de requêtes qui atteignent l'origine. Si votre hit ratio CDN est en dessous de 80%, investigatez. C'est probablement un problème de `Vary` trop large ou de durées de cache trop courtes.

### [14:00-14:30] Récap — Maîtriser le cache multi-couches

> Résumons. Le cache multi-couches combine navigateur, CDN, proxy et cache applicatif. Chaque type de ressource a sa stratégie. L'invalidation est le défi principal, avec purge, TTL court, ou événements. Et le monitoring du hit ratio est essentiel.

**Action** : Mentionner le quiz et le lab.

> Le lab `labs/lab-09-multi-layer-cache/` vous fait mettre en place et débugger une architecture complète. Vous allez configurer les en-têtes, simuler des invalidations, et optimiser le hit ratio. Prochain screencast : le SSR, quand le serveur génère le HTML. A bientôt !

## Points d'attention pour l'enregistrement
- L'architecture à 3 processus doit fonctionner de manière fiable, tester avant l'enregistrement
- Les en-têtes X-CDN-Cache et X-Proxy-Cache doivent être bien visibles
- Prendre le temps d'expliquer le scénario d'invalidation étape par étape
- Le cache stampede est un concept important mais subtil, utiliser le schéma pour illustrer
