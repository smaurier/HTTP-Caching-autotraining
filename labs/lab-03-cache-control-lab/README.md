# Lab 03 — Cache-Control Lab

## Objectifs
- Comprendre les différentes directives de `Cache-Control`
- Distinguer `max-age`, `no-cache`, `no-store` et `s-maxage`
- Observer le comportement du cache navigateur selon les headers
- Comprendre la différence entre cache privé (navigateur) et cache partagé (CDN)

## Prérequis
- Node.js 20+

## Lancer l'exercice
```bash
node exercise.js
```

## Instructions

### Partie 1 — Servir avec `max-age` (assets immutables)
Créez une route `/assets/style.css` qui sert un fichier CSS simulé avec :
- `Cache-Control: public, max-age=31536000, immutable`
- Cela signifie : "cache pendant 1 an, ne revalide jamais"
- Utilisé pour les fichiers avec hash dans le nom (ex: `style.abc123.css`)

### Partie 2 — Servir avec `no-cache` (toujours revalider)
Créez une route `/api/data` qui sert du JSON avec :
- `Cache-Control: no-cache`
- Cela signifie : "tu peux stocker, mais revalide TOUJOURS avant d'utiliser"
- Le navigateur fera une requête conditionnelle (If-None-Match / If-Modified-Since)

### Partie 3 — Servir avec `no-store` (jamais cacher)
Créez une route `/api/secret` qui sert des données sensibles avec :
- `Cache-Control: no-store`
- Cela signifie : "ne stocke JAMAIS cette réponse, ni en mémoire ni sur disque"
- Utilisé pour les données sensibles (tokens, informations personnelles)

### Partie 4 — Servir avec `s-maxage` (cache CDN)
Créez une route `/page` qui sert du HTML avec :
- `Cache-Control: public, max-age=0, s-maxage=300`
- Cela signifie : "le navigateur revalide toujours, mais le CDN cache 5 minutes"
- `s-maxage` ne s'applique qu'aux caches partagés (CDN, reverse proxy)

## Ce qu'il faut observer
1. Avec `max-age=31536000`, le navigateur ne fait AUCUNE requête pendant 1 an
2. Avec `no-cache`, le navigateur fait une requête mais peut recevoir un 304
3. Avec `no-store`, le navigateur fait toujours une requête complète (200)
4. `s-maxage` permet des stratégies différentes pour le navigateur et le CDN

## Indices
- `res.writeHead(200, { "Cache-Control": "..." })` pour définir la politique de cache
- Testez avec `curl -v http://localhost:3002/assets/style.css` pour voir les headers
- Utilisez l'onglet Network de DevTools (cochez "Disable cache" puis décochez pour tester)
- Le compteur de requêtes côté serveur montre si la requête atteint vraiment le serveur
