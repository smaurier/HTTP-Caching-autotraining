# Lab 11 — ISR (Incremental Static Regeneration) Implementation

## Objectifs

- Comprendre le concept d'ISR (Incremental Static Regeneration) popularise par Next.js
- Pre-rendre des pages au "build time" a partir de templates et donnees
- Servir des pages pre-rendues avec des headers Cache-Control adaptes
- Implementer la revalidation en arriere-plan (background revalidation)
- Implementer la revalidation a la demande (on-demand revalidation)

## Prerequis

- Labs 1 a 10 completes
- Connaissance de `node:http`, `node:fs`, `node:crypto`
- Comprehension de `Cache-Control`, `stale-while-revalidate`
- Notions de SSR et generation statique

## Instructions

### PARTIE 1 — Pre-rendu au "build time"

Generez des fichiers HTML a partir de templates et de donnees. Simulez un build statique qui produit des pages HTML dans un dossier `.cache/`.

### PARTIE 2 — Servir les pages pre-rendues

Creez un serveur HTTP qui sert les pages pre-rendues avec des headers `Cache-Control` incluant `max-age` et `stale-while-revalidate`.

### PARTIE 3 — Revalidation en arriere-plan

Quand une page est "stale" (depassee), continuez a la servir mais declenchez une re-generation en arriere-plan. La prochaine requete recevra la version fraiche.

### PARTIE 4 — Revalidation a la demande

Implementez un endpoint `POST /revalidate?path=/...` qui force la re-generation immediate d'une page specifique.

## Ce qu'il faut observer

1. Les fichiers HTML generes dans `.cache/` au demarrage
2. Les headers `Cache-Control` sur les reponses
3. Le comportement "stale-while-revalidate" : la page stale est servie immediatement, puis regeneree
4. L'endpoint de revalidation qui force un refresh
5. Les timestamps dans le HTML qui prouvent que la page a ete regeneree

## Indices

- Utilisez `node:fs` pour lire/ecrire les fichiers HTML dans `.cache/`
- Stockez un timestamp de generation pour chaque page
- Comparez `Date.now()` au timestamp + TTL pour determiner si une page est stale
- La revalidation en arriere-plan utilise un simple appel asynchrone (pas besoin d'attendre)
- Pour la revalidation a la demande, supprimez le cache et regenerez immediatement
