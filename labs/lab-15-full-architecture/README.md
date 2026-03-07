# Lab 15 — Full Architecture (Projet final)

## Objectifs

Ce lab est la synthese de tous les labs precedents. Vous allez construire une architecture complete multi-couches :

- Serveur d'origine avec SSR (generation dynamique de HTML)
- Simulateur de CDN (proxy avec cache, purge API, TTL)
- Simulateur de cache navigateur (cache en memoire respectant Cache-Control)
- Tests d'integration complets montrant le cycle de vie du cache a chaque couche

## Prerequis

- Tous les labs precedents (1 a 14) completes
- Maitrise de `node:http`, `node:crypto`, `node:zlib`
- Comprehension complete de Cache-Control, ETag, stale-while-revalidate
- Notion de CDN, SSR, cache multi-couches

## Instructions

### PARTIE 1 — Serveur d'origine avec SSR

Construisez un serveur qui genere du HTML dynamiquement a partir de donnees (comme une base de donnees). Les reponses incluent des headers de cache (Cache-Control, ETag, Last-Modified).

### PARTIE 2 — Simulateur de CDN

Construisez un proxy qui se comporte comme un CDN :
- Cache les reponses en memoire
- Respecte les TTL (max-age)
- Expose un endpoint de purge (`POST /purge?path=...`)
- Ajoute des headers diagnostiques (`X-CDN-Cache`, `Age`, `X-Cache-Hits`)

### PARTIE 3 — Simulateur de cache navigateur

Construisez un "client" qui simule le comportement du cache navigateur :
- Stocke les reponses en memoire
- Respecte Cache-Control (max-age, no-cache, no-store)
- Envoie If-None-Match / If-Modified-Since pour les revalidations
- Utilise stale-while-revalidate quand disponible

### PARTIE 4 — Tests d'integration complets

Ecrivez une sequence de tests qui demontre le fonctionnement complet :
1. Requete initiale : MISS a toutes les couches
2. Requete repetee : HIT au navigateur
3. Expiration du cache navigateur : HIT au CDN
4. Expiration du cache CDN : requete a l'origine
5. Purge du CDN : la prochaine requete va a l'origine
6. Revalidation conditionnelle : 304 Not Modified
7. Changement de donnees : nouvelle version servie

## Ce qu'il faut observer

1. Chaque couche de cache fonctionne independamment
2. Les headers diagnostiques montrent d'ou vient chaque reponse
3. Le purge du CDN force un refresh mais le cache navigateur peut encore servir l'ancienne version
4. La revalidation conditionnelle (ETag) economise de la bande passante
5. Le stale-while-revalidate permet de servir du contenu stale pendant la revalidation

## Indices

- Utilisez 3 ports differents : origin (3150), CDN (3151), et le "browser client" est juste du code
- Le CDN est un proxy HTTP classique (comme dans le lab 12)
- Le cache navigateur est une classe JavaScript avec `get(url)` et la logique de cache
- Les tests doivent manipuler les timestamps pour simuler le passage du temps
- Utilisez des `Map()` pour chaque couche de cache
