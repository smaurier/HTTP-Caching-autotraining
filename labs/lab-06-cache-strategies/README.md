# Lab 06 — Strategies de cache

## Objectifs

- Comprendre et implementer les 3 strategies de cache principales
- **Cache-First** : regarder le cache d'abord, reseau en fallback
- **Network-First** : reseau d'abord, cache en fallback
- **Stale-While-Revalidate** : servir le stale, revalider en arriere-plan
- Predire l'ordre d'execution et les hits/misses pour une sequence de requetes

## Prerequis

- Node.js 18+
- Connaissance de `node:http` et des Promises
- Notions de base sur les en-tetes HTTP de cache

## Instructions

1. Ouvrir `exercise.js`
2. Completer les 4 parties dans l'ordre :
   - **PARTIE 1** : Implementer la strategie Cache-First
   - **PARTIE 2** : Implementer la strategie Network-First
   - **PARTIE 3** : Implementer le pattern Stale-While-Revalidate
   - **PARTIE 4** : Predire les hits/misses pour une sequence de requetes
3. Executer avec `node exercise.js`
4. Verifier que tous les tests affichent ✅

## Fichiers

| Fichier          | Description                                          |
| ---------------- | ---------------------------------------------------- |
| `exercise.js`    | Squelette a completer                                |
| `solution.js`    | Implementation complete avec commentaires POURQUOI   |
| `walkthrough.js` | Solution pas-a-pas avec sorties detaillees           |

## Ce qu'il faut observer

- Avec Cache-First, la premiere requete est toujours un MISS, les suivantes sont des HIT
- Avec Network-First, le cache ne sert que quand le reseau echoue
- Avec SWR, on recoit une reponse immediate (stale) puis le cache se met a jour en arriere-plan
- L'ordre d'execution peut etre contre-intuitif avec les operations asynchrones

## Indices

1. Le cache est un simple `Map` avec des entrees `{ data, timestamp }`
2. Pour Cache-First : verifier le cache, si absent faire la requete, stocker, retourner
3. Pour Network-First : tenter la requete, si echec chercher dans le cache
4. Pour SWR : retourner le stale immediatement, lancer la revalidation sans attendre
5. `Date.now()` permet de verifier si une entree est encore fraiche
