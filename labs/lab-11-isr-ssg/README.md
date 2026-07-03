# Lab 11 — ISR & SSG : observer la régénération d'une app Next.js

> **Outcome :** à la fin, tu sais pré-rendre des pages avec `generateStaticParams`, activer l'ISR avec `export const revalidate`, exposer un endpoint `POST /api/revalidate`, et **observer** au terminal (`next build`) puis via `curl` qu'une page se régénère à la demande.
> **Vrai outil :** Next.js 15 (App Router) en local — `next build` + `next start` + `curl`. Aucun harnais de test simulé.
> **Feedback :** le coach valide en session, à partir de la sortie de `next build` et du comportement observé (le `Date` affiché change / ne change pas selon la stratégie). Pas de test-runner auto-correcteur.

---

## Énoncé

Tu construis une mini-app TribuZen « annuaire d'activités » avec **trois** routes qui illustrent SSG, ISR et la régénération on-demand. La source de données est un simple module en mémoire (pas de vraie API) pour que tout tourne en local, hors ligne.

Objectif observable : prouver, au terminal, que
1. une page **SSG** ne change jamais entre deux requêtes (contenu figé au build) ;
2. une page **ISR** se régénère après le délai `revalidate` ;
3. un `curl` sur `/api/revalidate` force la régénération **immédiate** de la page ISR au prochain accès.

### Mise en place (le vrai outil)

```bash
npx create-next-app@latest lab-isr --ts --app --no-tailwind --no-src-dir --no-eslint
cd lab-isr
# Le lab n'utilise que l'App Router et curl — rien d'autre à installer.
```

> Si `create-next-app` propose Turbopack, accepte les défauts. Vérifie dans `package.json` que `next` est en version **15.x** (ce lab suit les signatures Next 15 : `params` est une `Promise`, `revalidateTag('tag')` à un seul argument).

### Fichiers à produire

```
lab-isr/
  lib/activites.ts               # source de données en mémoire (fournie ci-dessous)
  app/activites/[slug]/page.tsx  # À TOI : ISR (revalidate + generateStaticParams)
  app/legal/page.tsx             # À TOI : SSG pur (aucun revalidate)
  app/api/revalidate/route.ts    # À TOI : endpoint on-demand (revalidatePath/Tag)
```

**Source de données (à copier telle quelle) :**

```ts
// lib/activites.ts
export interface Activite {
  slug: string
  titre: string
}

// Un tableau fixe : on n'a pas besoin de vraie API pour le lab.
export const ACTIVITES: Activite[] = [
  { slug: 'rando-lac-blanc', titre: 'Rando au lac Blanc' },
  { slug: 'atelier-poterie', titre: 'Atelier poterie en famille' },
  { slug: 'sortie-velo', titre: 'Sortie vélo découverte' },
]

export async function getActivites(): Promise<Activite[]> {
  return ACTIVITES
}

export async function getActivite(slug: string): Promise<Activite | undefined> {
  return ACTIVITES.find((a) => a.slug === slug)
}
```

**Pas de gap-fill** — tu écris les trois fichiers `page.tsx`/`route.ts` complets à partir des consignes.

---

## Étapes (en friction)

1. **Page SSG pure** — écris `app/legal/page.tsx` : un composant qui affiche un titre et `new Date().toISOString()`. **Ne mets aucun `revalidate`.** C'est ta référence « jamais régénérée ».
2. **Page ISR** — écris `app/activites/[slug]/page.tsx` :
   - `export const revalidate = 30` (30 s pour observer vite en session) ;
   - `generateStaticParams()` qui pré-rend les 3 slugs depuis `getActivites()` ;
   - le composant est `async`, `params` est une **`Promise`** → `await params` ;
   - affiche le titre de l'activité + `new Date().toISOString()` (le timestamp = preuve visuelle de régénération) ;
   - si le slug est inconnu, appelle `notFound()`.
3. **Endpoint on-demand** — écris `app/api/revalidate/route.ts` : un `POST` qui lit `slug` dans le body, appelle `revalidatePath('/activites/<slug>')`, et renvoie du JSON. (Bonus : protège par un secret en query string.)
4. **Build et observe** — `npm run build`. Repère dans la sortie le symbole de chaque route (statique `○` / SSG `●` / dynamique `ƒ`). Les 3 fiches doivent apparaître **prérendues**.
5. **Démarre en prod** — `npm start`. Ouvre `/activites/rando-lac-blanc`, note le timestamp. Recharge **avant** 30 s → timestamp **identique** (statique). Recharge **après** 30 s, deux fois → au 2e rechargement le timestamp a **changé** (ISR : le 1er post-expiration sert le stale et régénère, le 2e sert le frais).
6. **Force la régénération** — `curl -X POST` sur `/api/revalidate`, puis recharge la fiche → nouveau timestamp **immédiatement** au prochain accès, sans attendre les 30 s.
7. **Contraste SSG** — recharge `/legal` autant que tu veux : le timestamp ne bouge **jamais** (figé au build). C'est la différence SSG vs ISR, rendue visible.

---

## Corrigé complet commenté

```ts
// app/activites/[slug]/page.tsx — ISR + SSG des paramètres
import { notFound } from 'next/navigation'
import { getActivites, getActivite } from '../../../lib/activites'

// ISR : la page est fraîche 30 s. Après ça, la 1re requête déclenche
// une régénération en arrière-plan (stale-while-revalidate).
export const revalidate = 30

// Pré-génère les 3 fiches AU BUILD (SSG). Retour attendu : { slug: string }[]
export async function generateStaticParams() {
  const activites = await getActivites()
  return activites.map((a) => ({ slug: a.slug }))
}

// dynamicParams=true (défaut) : un slug ajouté après le build serait rendu
// à la volée. Ici on le laisse explicite pour la lisibilité.
export const dynamicParams = true

export default async function ActivitePage({
  params,
}: {
  params: Promise<{ slug: string }> // Next 15 : params est une Promise
}) {
  const { slug } = await params // ⚠️ await obligatoire en Next 15
  const activite = await getActivite(slug)

  if (!activite) notFound() // 404 propre pour un slug inconnu

  return (
    <article>
      <h1>{activite.titre}</h1>
      {/* Ce timestamp est figé au moment du RENDU de la page.
          S'il change entre deux rechargements, c'est qu'il y a eu régénération. */}
      <p>Rendu à : {new Date().toISOString()}</p>
    </article>
  )
}
```

```ts
// app/legal/page.tsx — SSG pur (référence "jamais régénérée")
// Aucun export revalidate → statique, figé jusqu'au prochain build.
export default function LegalPage() {
  return (
    <article>
      <h1>Mentions légales</h1>
      {/* Ce timestamp est celui du BUILD. Il ne changera qu'au prochain next build. */}
      <p>Généré au build : {new Date().toISOString()}</p>
    </article>
  )
}
```

```ts
// app/api/revalidate/route.ts — régénération on-demand
import { revalidatePath, revalidateTag } from 'next/cache'
import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  // Bonus sécurité : un secret partagé évite les régénérations non autorisées.
  const secret = request.nextUrl.searchParams.get('secret')
  if (secret !== 'dev-secret') {
    return Response.json({ message: 'Non autorisé' }, { status: 401 })
  }

  const { slug } = await request.json()
  if (!slug) {
    return Response.json({ message: 'slug manquant' }, { status: 400 })
  }

  // Invalide la fiche précise. (revalidateTag serait utile si un fetch
  // portait next: { tags: [...] } — ici les données sont locales, donc
  // revalidatePath suffit à marquer la page pour régénération.)
  revalidatePath(`/activites/${slug}`)

  // revalidateTag('activites') // ← à activer si tu passes par un fetch taggé
  void revalidateTag

  return Response.json({ revalidated: true, slug, now: Date.now() })
}
```

**Commandes d'observation :**

```bash
npm run build
# Cherche dans la sortie :
#   ● /activites/[slug]   → SSG/ISR, 3 slugs prérendus listés dessous
#   ○ /legal              → statique
#   ƒ /api/revalidate     → dynamique (route handler)

npm start

# Fiche ISR : recharge deux fois après 30 s → le timestamp finit par changer
curl -s http://localhost:3000/activites/rando-lac-blanc | grep "Rendu à"

# Régénération on-demand : force l'invalidation immédiate
curl -X POST "http://localhost:3000/api/revalidate?secret=dev-secret" \
  -H "Content-Type: application/json" \
  -d '{"slug":"rando-lac-blanc"}'
# → {"revalidated":true,"slug":"rando-lac-blanc","now":...}

# Recharge la fiche : nouveau timestamp AU PROCHAIN accès, sans attendre 30 s
curl -s http://localhost:3000/activites/rando-lac-blanc | grep "Rendu à"

# Contraste : /legal ne change JAMAIS (figé au build)
curl -s http://localhost:3000/legal | grep "Généré au build"
```

**Pourquoi ce corrigé est correct :**
- Le timestamp `new Date().toISOString()` dans le rendu est un **oracle visuel** : il ne change que lors d'un (re)rendu de la page. SSG figé → constant ; ISR → change après `revalidate` ; on-demand → change au prochain accès après le `curl`.
- `generateStaticParams` prérend les 3 fiches → elles apparaissent statiques dans la sortie `next build`, ce qui prouve le SSG.
- `revalidatePath` **marque** la page pour régénération : l'effet est visible **au prochain accès**, pas au moment du `curl` — c'est le comportement attendu d'une route handler (évite un pic de régénérations).
- `params` est bien awaité : sans ça, en Next 15, `slug` serait indéfini et le build échouerait au typage.

---

## Variante J+30 (fading)

**Même app, contraintes ajoutées, sans rouvrir ce corrigé ni le module 11 :**

1. Reproduis les trois routes **de mémoire, en 30 minutes**.
2. Remplace la source locale par un `fetch` (utilise `https://jsonplaceholder.typicode.com/posts` comme fausse API, `slug` = `id`) **taggé** : `fetch(url, { next: { tags: ['activites'] } })`.
3. Dans `/api/revalidate`, ajoute `revalidateTag('activites')` **en plus** de `revalidatePath`, et prouve que la **page de liste** `/activites` (à créer, qui affiche tous les titres) se rafraîchit aussi.
4. Baisse `revalidate` à `10` et mesure au `curl` combien de rechargements il faut après expiration pour voir le nouveau timestamp (attendu : 2 — le 1er sert le stale).

**Critère de réussite :** au terminal, tu montres (a) une fiche ISR qui change après le délai, (b) `revalidateTag` qui rafraîchit **à la fois** la fiche et la liste, (c) `/legal` toujours figé.

---

## Application TribuZen

Dans `smaurier/tribuzen`, cette mécanique porte l'annuaire public d'activités :

```
tribuzen/
  web/app/activites/page.tsx           # liste ISR, fetch taggé 'activites'
  web/app/activites/[slug]/page.tsx    # fiche ISR (revalidate + generateStaticParams)
  web/app/api/revalidate/route.ts      # webhook appelé par le back-office à la publication
  web/app/(marketing)/cgu/page.tsx     # SSG pur (comme /legal du lab)
```

**Différences par rapport au lab :**
- La source n'est pas un tableau en mémoire mais l'API TribuZen (NestJS) ; les `fetch` sont taggés `activites` / `activite:${slug}` pour l'invalidation ciblée.
- Le secret de `/api/revalidate` vient de `process.env.REVALIDATE_SECRET` (pas de secret en clair) ; l'appelant est le back-office, pas un `curl` manuel.
- `revalidate` est fixé à `3600` (1 h) en production, pas `30` — le `30` du lab sert seulement à observer vite en session.

**Commit cible :**
```
feat(activites): annuaire public en ISR — generateStaticParams + revalidate + webhook on-demand
```
