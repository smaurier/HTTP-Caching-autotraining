# Lab 08 — Reverse Proxy Cache

## Objectifs

- Construire un reverse proxy avec cache intégré
- Respecter les directives Cache-Control de l'origine
- Implementer un cache sensible au header Vary
- Comprendre la différence entre cache prive et cache partage

## Prérequis

- Node.js 18+
- Connaissance de `node:http`
- En-tetes HTTP : `Cache-Control`, `Vary`, `Accept-Encoding`

## Instructions

1. Ouvrir `exercise.js`
2. Completer les 4 parties dans l'ordre :
   - **PARTIE 1** : Créer un serveur d'origine avec différents types de contenu
   - **PARTIE 2** : Construire le reverse proxy qui forward les requêtes
   - **PARTIE 3** : Ajouter la couche de cache (stocker, servir, respecter Cache-Control)
   - **PARTIE 4** : Implementer le cache Vary-aware
3. Exécuter avec `node exercise.js`
4. Vérifier que tous les tests affichent ✅

## Ce qu'il faut observer

- Le proxy respecte `Cache-Control: no-store` (pas de mise en cache)
- Le proxy respecte `Cache-Control: max-age=N` (cache avec TTL)
- Avec `Vary: Accept-Encoding`, deux requêtes avec des encodages différents
  ont des entrees de cache separees
- Le header `X-Cache` indique HIT ou MISS

## Indices

1. Parser `Cache-Control` en cherchant `no-store`, `no-cache`, `max-age=`
2. La clé de cache doit inclure l'URL ET les headers Vary pour differencier les variantes
3. Utiliser `url + '|' + varyKey` comme clé composite
4. `res.headers['vary']` contient la liste des headers qui influencent le cache
5. Attention : `Vary: *` signifie "ne jamais cacher"
