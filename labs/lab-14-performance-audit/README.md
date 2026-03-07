# Lab 14 — Performance Audit

## Objectifs

- Construire un serveur volontairement "lent" pour mesurer l'impact de chaque optimisation
- Mesurer le TTFB (Time To First Byte) dans differents scenarios
- Construire une visualisation "waterfall" en console pour comprendre le timing des requetes
- Appliquer des optimisations (cache, compression, connection reuse) et mesurer l'amelioration

## Prerequis

- Labs 1 a 13 completes
- Connaissance de `node:http` et `node:zlib`
- Comprehension de Cache-Control, ETag, gzip/deflate
- Notion de TTFB et metriques de performance web

## Instructions

### PARTIE 1 — Serveur "lent"

Construisez un serveur qui simule toutes les lenteurs possibles : latence reseau, pas de cache, pas de compression, pas de keep-alive. Chaque requete prend intentionnellement du temps.

### PARTIE 2 — Mesure de TTFB

Ecrivez des fonctions qui mesurent le TTFB pour differentes URLs. Comparez le TTFB avec et sans les optimisations.

### PARTIE 3 — Visualisation waterfall

Construisez une visualisation console qui montre le timing de chaque requete dans un "waterfall" : DNS, connect, TTFB, download, total.

### PARTIE 4 — Appliquer les optimisations

Ajoutez progressivement : Cache-Control, ETag, gzip compression, keep-alive. Re-mesurez apres chaque optimisation.

## Ce qu'il faut observer

1. Le TTFB est significativement plus eleve sans optimisations
2. Le cache elimine completement les allers-retours serveur (304, cache hit)
3. La compression reduit la taille de transfert (Content-Encoding: gzip)
4. Le keep-alive evite la re-creation de connexions TCP
5. Le waterfall montre visuellement l'impact de chaque optimisation

## Indices

- Utilisez `process.hrtime.bigint()` pour des mesures de temps precises (nanosecondes)
- Simulez la latence avec `setTimeout` dans le serveur
- Pour la compression, utilisez `node:zlib` (createGzip)
- Pour le waterfall, utilisez des caracteres comme `\u2588` (bloc plein) et `-` pour dessiner les barres
- Mesurez le temps entre la creation du socket et la reception du premier octet pour le TTFB
