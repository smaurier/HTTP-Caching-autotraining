# Lab 07 — Mini CDN

## Objectifs

- Construire un mini CDN avec un serveur d'origine et un noeud edge
- Comprendre le role d'un proxy cache entre le client et l'origine
- Implementer la logique de cache hit/miss/stale avec TTL
- Implementer une API de purge pour invalider le cache

## Prerequis

- Node.js 18+
- Connaissance de `node:http` (createServer, request)
- Notions de TTL et invalidation de cache

## Instructions

1. Ouvrir `exercise.js`
2. Completer les 4 parties dans l'ordre :
   - **PARTIE 1** : Creer le serveur d'origine qui sert du contenu
   - **PARTIE 2** : Creer le noeud edge (proxy) qui met en cache les reponses
   - **PARTIE 3** : Implementer la logique cache hit/miss/stale avec TTL
   - **PARTIE 4** : Implementer l'API de purge (POST /purge?url=...)
3. Executer avec `node exercise.js`
4. Verifier que tous les tests affichent ✅

## Ce qu'il faut observer

- La premiere requete vers l'edge est toujours un MISS (forward vers l'origine)
- Les requetes suivantes sont des HIT (servies depuis le cache de l'edge)
- Apres expiration du TTL, la requete suivante est un MISS (revalidation)
- Apres un purge, l'entree est supprimee et la prochaine requete est un MISS
- Le header `X-Cache` indique `HIT`, `MISS` ou `STALE`

## Indices

1. Le serveur d'origine est un simple `http.createServer` qui sert du JSON
2. Le noeud edge utilise `http.request` pour forwarder vers l'origine
3. Le cache de l'edge est un `Map` avec `{ body, headers, timestamp }`
4. Comparer `Date.now() - entry.timestamp` avec le TTL pour detecter le stale
5. Le purge supprime simplement l'entree du Map avec `cache.delete(url)`
