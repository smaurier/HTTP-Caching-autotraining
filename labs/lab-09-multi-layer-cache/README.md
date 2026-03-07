# Lab 09 — Multi-Layer Cache

## Objectifs

- Orchestrer un cache a 3 couches : navigateur (simule) → CDN → origine
- Comprendre comment une requete traverse chaque couche
- Tracer les HIT/MISS a chaque niveau
- Observer l'effet multiplicateur du cache multi-couche

## Prerequis

- Node.js 18+
- Connaissance de `node:http` et des proxies
- Notions de TTL et couches de cache

## Instructions

1. Ouvrir `exercise.js`
2. Completer les 4 parties dans l'ordre :
   - **PARTIE 1** : Creer le serveur d'origine (simule une base de donnees)
   - **PARTIE 2** : Creer la couche de cache applicatif (in-memory Map)
   - **PARTIE 3** : Creer le simulateur CDN (proxy avec son propre cache)
   - **PARTIE 4** : Tracer le chemin complet (browser sim → CDN → app → origin)
3. Executer avec `node exercise.js`
4. Verifier que tous les tests affichent ✅

## Ce qu'il faut observer

- Requete 1 : MISS partout (browser, CDN, app) → l'origine est contactee
- Requete 2 : HIT au niveau CDN → ni l'app ni l'origine ne sont contactees
- Apres expiration CDN : MISS CDN, HIT app → l'origine n'est pas contactee
- Apres expiration app : MISS CDN + MISS app → l'origine est contactee
- Le header X-Cache-Trace montre le chemin complet : "browser:MISS, cdn:MISS, app:MISS"

## Indices

1. Chaque couche a son propre TTL (browser < CDN < app)
2. Le browser cache est un simple Map cote client
3. Le CDN est un `http.createServer` qui proxifie vers l'app
4. L'app est un `http.createServer` qui verifie son cache avant d'aller a l'origine
5. Le header `X-Cache-Trace` est construit en concatenant les resultats de chaque couche
