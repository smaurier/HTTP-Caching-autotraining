# Lab 09 — Multi-Layer Cache

## Objectifs

- Orchestrer un cache a 3 couches : navigateur (simule) → CDN → origine
- Comprendre comment une requête traverse chaque couche
- Tracer les HIT/MISS à chaque niveau
- Observer l'effet multiplicateur du cache multi-couche

## Prérequis

- Node.js 18+
- Connaissance de `node:http` et des proxies
- Notions de TTL et couches de cache

## Instructions

1. Ouvrir `exercise.js`
2. Completer les 4 parties dans l'ordre :
   - **PARTIE 1** : Créer le serveur d'origine (simule une base de donnees)
   - **PARTIE 2** : Créer la couche de cache applicatif (in-memory Map)
   - **PARTIE 3** : Créer le simulateur CDN (proxy avec son propre cache)
   - **PARTIE 4** : Tracer le chemin complet (browser sim → CDN → app → origin)
3. Exécuter avec `node exercise.js`
4. Vérifier que tous les tests affichent ✅

## Ce qu'il faut observer

- Requête 1 : MISS partout (browser, CDN, app) → l'origine est contactee
- Requête 2 : HIT au niveau CDN → ni l'app ni l'origine ne sont contactees
- Après expiration CDN : MISS CDN, HIT app → l'origine n'est pas contactee
- Après expiration app : MISS CDN + MISS app → l'origine est contactee
- Le header X-Cache-Trace montre le chemin complet : "browser:MISS, cdn:MISS, app:MISS"

## Indices

1. Chaque couche a son propre TTL (browser < CDN < app)
2. Le browser cache est un simple Map cote client
3. Le CDN est un `http.createServer` qui proxifie vers l'app
4. L'app est un `http.createServer` qui vérifié son cache avant d'aller a l'origine
5. Le header `X-Cache-Trace` est construit en concatenant les résultats de chaque couche
