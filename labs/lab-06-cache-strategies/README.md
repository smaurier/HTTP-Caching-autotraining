# Lab 06 — Stratégies de cache

## Objectifs

- Comprendre et implementer les 3 stratégies de cache principales
- **Cache-First** : regarder le cache d'abord, réseau en fallback
- **Network-First** : réseau d'abord, cache en fallback
- **Stale-While-Revalidate** : servir le stale, revalider en arriere-plan
- Predire l'ordre d'exécution et les hits/misses pour une sequence de requêtes

## Prérequis

- Node.js 18+
- Connaissance de `node:http` et des Promises
- Notions de base sur les en-tetes HTTP de cache

## Instructions

1. Ouvrir `exercise.js`
2. Completer les 4 parties dans l'ordre :
   - **PARTIE 1** : Implementer la stratégie Cache-First
   - **PARTIE 2** : Implementer la stratégie Network-First
   - **PARTIE 3** : Implementer le pattern Stale-While-Revalidate
   - **PARTIE 4** : Predire les hits/misses pour une sequence de requêtes
3. Exécuter avec `node exercise.js`
4. Vérifier que tous les tests affichent ✅

## Fichiers

| Fichier          | Description                                          |
| ---------------- | ---------------------------------------------------- |
| `exercise.js`    | Squelette a completer                                |
| `solution.js`    | Implementation complete avec commentaires POURQUOI   |
| `walkthrough.js` | Solution pas-a-pas avec sorties detaillees           |

## Ce qu'il faut observer

- Avec Cache-First, la première requête est toujours un MISS, les suivantes sont des HIT
- Avec Network-First, le cache ne sert que quand le réseau echoue
- Avec SWR, on recoit une réponse immediate (stale) puis le cache se met a jour en arriere-plan
- L'ordre d'exécution peut etre contre-intuitif avec les operations asynchrones

## Indices

1. Le cache est un simple `Map` avec des entrees `{ data, timestamp }`
2. Pour Cache-First : vérifier le cache, si absent faire la requête, stocker, retourner
3. Pour Network-First : tenter la requête, si echec chercher dans le cache
4. Pour SWR : retourner le stale immediatement, lancer la revalidation sans attendre
5. `Date.now()` permet de vérifier si une entree est encore fraiche
