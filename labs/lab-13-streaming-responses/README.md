# Lab 13 — Streaming HTTP Responses

## Objectifs

- Comprendre le Transfer-Encoding chunked et son role dans HTTP
- Implementer le chunked transfer encoding manuellement
- Construire un pipeline de transformation de donnees en streaming
- Implementer le streaming SSR (envoyer le head HTML immediatement, puis le body en chunks)
- Construire un système de suivi de progression pour les réponses volumineuses

## Prérequis

- Labs 1 a 12 completes
- Connaissance de `node:http` et des streams Node.js
- Comprehension du concept de chunks et de Transfer-Encoding
- Notions de base sur les Readable/Writable streams

## Instructions

### PARTIE 1 — Chunked Transfer Encoding manuel

Ecrivez un serveur qui envoie une réponse en plusieurs chunks avec des delais entre chaque chunk. Observez comment le navigateur recoit les donnees progressivement.

### PARTIE 2 — Pipeline de ReadableStream

Construisez un pipeline : source de donnees -> transformation -> réponse HTTP. La source généré des donnees, le transform les modifie, et le résultat est streame au client.

### PARTIE 3 — Streaming SSR

Implementez une page HTML en streaming : envoyez le `<head>` immediatement (pour que le navigateur commence a charger CSS/JS), puis le `<body>` en chunks au fur et à mesure que les donnees sont pretes.

### PARTIE 4 — Suivi de progression

Streamez une réponse volumineuse et trackez le nombre de bytes envoyes. Le client peut interroger un endpoint pour connaître la progression.

## Ce qu'il faut observer

1. Les chunks arrivent progressivement (pas tout d'un coup)
2. Le header `Transfer-Encoding: chunked` est present
3. Le head HTML est envoye avant que le body ne soit pret
4. Le compteur de progression se met a jour en temps réel
5. La différence de TTFB entre streaming et non-streaming

## Indices

- `res.write()` envoie un chunk sans fermer la connexion
- `res.end()` envoie le dernier chunk et ferme la connexion
- Node.js utilise automatiquement `Transfer-Encoding: chunked` quand on appelle `res.write()`
- Pour le streaming SSR, utilisez `res.write(headHTML)` puis des `res.write(bodyChunk)` en boucle
- Pour la progression, utilisez un `Map` partage entre la route de download et la route de status
