# Lab 04 — ETag & Requêtes Conditionnelles

## Objectifs
- Implémenter un système d'ETag from scratch avec `node:crypto`
- Comprendre le mécanisme `If-None-Match` → `304 Not Modified`
- Implémenter `Last-Modified` / `If-Modified-Since`
- Distinguer les ETags forts et faibles

## Prérequis
- Node.js 20+

## Lancer l'exercice
```bash
node exercise.js
```

## Fichier bonus
```bash
node walkthrough.js   # Walkthrough commenté pas à pas
```

## Instructions

### Partie 1 — Générer des ETags avec crypto
Créez une fonction `generateETag(content)` qui :
- Prend une chaîne de caractères en entrée
- Retourne un ETag fort au format `"hash"` (entre guillemets)
- Utilise SHA-256 tronqué à 16 caractères

Testez avec plusieurs contenus et vérifiez que :
- Le même contenu produit toujours le même ETag
- Un contenu différent produit un ETag différent

### Partie 2 — Gérer If-None-Match → 304
Créez un serveur HTTP qui :
- Sert du contenu avec un header `ETag`
- Vérifie le header `If-None-Match` des requêtes
- Répond `304 Not Modified` si l'ETag correspond
- Répond `200` avec le contenu complet sinon

### Partie 3 — Gérer Last-Modified / If-Modified-Since
Ajoutez au serveur :
- Un header `Last-Modified` avec la date de dernière modification
- La vérification de `If-Modified-Since` dans les requêtes
- Réponse `304` si la ressource n'a pas changé depuis la date indiquée

### Partie 4 — Comparer ETags forts vs faibles
Implémentez une fonction `generateWeakETag(content)` qui :
- Retourne un ETag faible au format `W/"hash"`
- Comparez le comportement avec les ETags forts
- Expliquez quand utiliser chaque type

## Ce qu'il faut observer
1. La première requête reçoit toujours un `200` avec le contenu complet
2. Les requêtes suivantes (avec `If-None-Match`) reçoivent un `304` sans corps
3. Le `304` économise de la bande passante (pas de corps dans la réponse)
4. `Last-Modified` est moins précis que `ETag` (précision à la seconde)

## Indices
- `crypto.createHash("sha256").update(content).digest("hex")` pour le hash
- Les ETags HTTP doivent être entre guillemets : `"abc123"` et non `abc123`
- Les ETags faibles commencent par `W/` : `W/"abc123"`
- `If-None-Match` peut contenir plusieurs ETags séparés par des virgules
- `new Date(dateString).getTime()` pour comparer des dates
