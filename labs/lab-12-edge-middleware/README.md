# Lab 12 — Edge Middleware

## Objectifs

- Comprendre le role d'un middleware "edge" entre le client et le serveur d'origine
- Construire un proxy HTTP qui intercepte et transforme les requetes
- Implementer un cache au niveau edge (comme un CDN edge node)
- Simuler du geo-routing et de l'A/B testing via headers et cookies

## Prerequis

- Labs 1 a 11 completes
- Connaissance de `node:http` (client et serveur)
- Comprehension des proxies HTTP
- Notions de Cache-Control et headers personnalises

## Instructions

### PARTIE 1 — Serveur d'origine

Creez un serveur d'origine simple qui retourne du contenu dynamique (HTML avec timestamp, donnees JSON, etc.).

### PARTIE 2 — Edge middleware (proxy)

Construisez un serveur proxy qui intercepte les requetes du client, les transmet au serveur d'origine, et retourne la reponse. Le proxy doit logger chaque requete.

### PARTIE 3 — Cache au niveau edge

Ajoutez un cache en memoire au proxy. Si la reponse est dans le cache et n'est pas expiree, servez-la directement sans contacter l'origine.

### PARTIE 4 — Transformation de requetes

Ajoutez des fonctionnalites "edge" :
- **Geo-routing** : simulez la detection de region via un header `X-Geo-Region` et renvoyez du contenu adapte
- **A/B testing** : assignez un groupe A ou B via un cookie et renvoyez du contenu different selon le groupe

## Ce qu'il faut observer

1. Le proxy transmet fidelement les requetes a l'origine
2. Le cache edge evite des allers-retours inutiles a l'origine
3. Les headers `X-Edge-Cache` indiquent HIT ou MISS
4. Le geo-routing retourne du contenu different selon la region
5. L'A/B testing assigne un cookie persistent et sert du contenu coherent

## Indices

- Utilisez `http.request()` dans le proxy pour contacter le serveur d'origine
- Stockez le cache dans un `Map()` avec les headers Cache-Control de l'origine
- Pour le geo-routing, lisez le header `X-Geo-Region` de la requete entrante
- Pour l'A/B testing, parsez le header `Cookie` et settez `Set-Cookie` si absent
- Le proxy et l'origine tournent sur deux ports differents
