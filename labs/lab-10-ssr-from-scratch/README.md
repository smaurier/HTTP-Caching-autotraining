# Lab 10 — SSR from Scratch

## Objectifs

- Construire un serveur SSR (Server-Side Rendering) de zero
- Comprendre le cycle : donnees → template → HTML complet
- Implementer l'hydration avec `window.__INITIAL_STATE__`
- Implementer le streaming SSR (envoi par morceaux)
- Ajouter les headers de cache adaptes aux réponses SSR

## Prérequis

- Node.js 18+
- Connaissance de `node:http`
- Bases du HTML et du JavaScript cote client

## Instructions

1. Ouvrir `exercise.js`
2. Completer les 4 parties dans l'ordre :
   - **PARTIE 1** : Construire le SSR basique (template + donnees → HTML)
   - **PARTIE 2** : Ajouter le script d'hydration (`window.__INITIAL_STATE__`)
   - **PARTIE 3** : Implementer le streaming SSR (envoi par morceaux)
   - **PARTIE 4** : Ajouter les headers Cache-Control aux réponses SSR
3. Exécuter avec `node exercise.js`
4. Vérifier que tous les tests affichent ✅

## Ce qu'il faut observer

- Le HTML généré contient les donnees pre-rendues (pas de chargement cote client)
- Le script d'hydration injecte les donnees dans `window.__INITIAL_STATE__`
- En mode streaming, le HTML arrive en plusieurs morceaux (Transfer-Encoding: chunked)
- Les headers Cache-Control différent selon le type de page :
  - Pages publiques : `public, max-age=60, s-maxage=300`
  - Pages privees : `private, no-store`
  - Pages avec SWR : `public, max-age=10, stale-while-revalidate=50`

## Indices

1. Le template HTML est une simple string avec des placeholders `${variable}`
2. L'hydration consiste a serialiser les donnees en JSON dans un tag `<script>`
3. Pour le streaming, utiliser `res.write()` pour envoyer des morceaux puis `res.end()`
4. `Transfer-Encoding: chunked` est automatique quand on utilise `res.write()`
5. `s-maxage` est pour les caches partages (CDN), `max-age` pour le navigateur
