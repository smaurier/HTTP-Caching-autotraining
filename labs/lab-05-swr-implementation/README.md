# Lab 05 — Stale-While-Revalidate Implementation

## Objectifs
- Comprendre la directive `stale-while-revalidate` de Cache-Control
- Implémenter un cache avec TTL (Time To Live)
- Servir des données périmées (stale) pendant la revalidation en arrière-plan
- Implémenter `stale-if-error` comme fallback en cas d'erreur

## Prérequis
- Node.js 20+

## Lancer l'exercice

### Approche progressive (recommandée)
```bash
node exercise-step1.js   # Étape 1 : Cache basique (5 tests)
node exercise-step2.js   # Étape 2 : + Stale serving (10 tests)
node exercise-step3.js   # Étape 3 : Full SWR (20 tests)
```

### Exercice complet
```bash
node exercise.js         # Implémentation complète
```

## Instructions

### Étape 1 — Cache basique (exercise-step1.js)
Implémentez une classe `Cache` avec :
- `set(key, value, ttlMs)` — stocker une valeur avec un TTL
- `get(key)` — récupérer une valeur (null si absente ou expirée)
- `has(key)` — vérifier si une clé existe et n'est pas expirée
- Stockage des métadonnées (timestamp, TTL)

### Étape 2 — Stale serving (exercise-step2.js)
Étendez le cache avec :
- `getWithMeta(key)` — retourne la valeur + métadonnées (fresh/stale)
- `isStale(key)` — vérifie si l'entrée est périmée mais encore dans la fenêtre SWR
- Configuration d'une fenêtre `staleWhileRevalidate` en plus du TTL
- Servant les données stale pendant la revalidation

### Étape 3 — Full SWR (exercise-step3.js)
Implémentation complète avec :
- Revalidation en arrière-plan (background revalidation)
- `stale-if-error` : servir le stale si la revalidation échoue
- Gestion des requêtes concurrentes (coalescing)
- Métriques : hits, misses, stale serves, revalidations

## Ce qu'il faut observer
1. Le premier appel est toujours un "miss" (le cache est vide)
2. Pendant le TTL, les réponses viennent du cache ("hit") — très rapide
3. Après le TTL mais dans la fenêtre SWR, le client reçoit le stale immédiatement
4. La revalidation se fait en arrière-plan sans bloquer le client
5. Après la fenêtre SWR, c'est un "miss" → le client attend la réponse fraîche

## Indices
- `Date.now()` pour les timestamps en millisecondes
- `setTimeout` et `Promise` pour la revalidation asynchrone
- Une entrée est "fresh" si `Date.now() - storedAt < ttl`
- Une entrée est "stale" si `Date.now() - storedAt < ttl + staleWhileRevalidate`
- Au-delà de `ttl + staleWhileRevalidate`, l'entrée est expirée
