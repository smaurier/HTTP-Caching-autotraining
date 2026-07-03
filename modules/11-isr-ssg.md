---
titre: ISR & SSG — rendu statique et régénération incrémentale
cours: 11-http-caching
notions: [SSG, ISR, "generateStaticParams()", "export const revalidate", dynamicParams, "revalidate temporel (time-based)", on-demand revalidation, "revalidatePath()", "revalidateTag()", fetch next tags, SSG vs ISR vs SSR, "params async (Promise)"]
outcomes:
  - sait pré-rendre des pages au build avec generateStaticParams et servir du HTML statique
  - sait activer l'ISR avec export const revalidate et expliquer le flux stale-while-revalidate qui en découle
  - sait déclencher une régénération à la demande avec revalidatePath et revalidateTag depuis une route handler
  - sait choisir entre SSG, ISR et SSR selon la fréquence de changement et le besoin de personnalisation
prerequis: [00-prerequis-et-vue-ensemble, 01-protocole-http, 02-http2-http3, 03-en-tetes-http, 04-cache-control, 05-etag-validation-conditionnelle, 06-stale-while-revalidate, 07-cache-navigateur, 08-cdn, 09-cache-multi-couches, 10-ssr]
next: 12-edge-rendering
libs: [{ name: next, version: "15" }]
tribuzen: pages publiques TribuZen (annuaire d'activités) pré-rendues en SSG, fiches activité en ISR revalidate, régénération on-demand à la publication d'une nouvelle activité
last-reviewed: 2026-07
---

# ISR & SSG — rendu statique et régénération incrémentale

> **Outcomes — tu sauras FAIRE :** pré-rendre des pages au build avec `generateStaticParams`, activer l'ISR avec `export const revalidate`, déclencher une régénération à la demande avec `revalidatePath`/`revalidateTag`, et choisir entre SSG, ISR et SSR selon le contexte.
> **Difficulté :** :star::star::star:
>
> **Portée :** ce module couvre **uniquement** le rendu **statique** (SSG) et sa **régénération incrémentale** (ISR) dans Next.js App Router. Le **SSR** (rendu à chaque requête) est le sujet du **module 10** — on s'appuie dessus sans le redétailler. Le rendu **à la périphérie** (Edge runtime, géo-distribution du calcul) est le sujet du **module 12**. Le mécanisme HTTP `stale-while-revalidate` en profondeur a été vu au **module 06** ; ici on montre comment l'ISR s'appuie dessus.

## 1. Cas concret d'abord

TribuZen a une page publique `/activites/[slug]` : la fiche d'une activité (rando famille, atelier poterie…). Il y en a 1 200, elles changent rarement (une ou deux fois par semaine), et elles doivent être **ultra-rapides** et **indexables** par Google. Un collègue a d'abord codé ça en SSR pur (rendu à chaque requête) :

```tsx
// app/activites/[slug]/page.tsx — VERSION SSR (module 10), ici inadaptée
export const dynamic = 'force-dynamic' // rendu à CHAQUE requête

export default async function ActivitePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const activite = await fetch(`https://api.tribuzen.app/activites/${slug}`)
    .then((r) => r.json())
  return <article>{/* ... */}</article>
}
```

Trois problèmes en production :

1. **Lent pour rien.** Chaque visiteur déclenche un fetch API + un rendu serveur, alors que le contenu est **identique** pour tout le monde et ne change quasiment jamais. Le TTFB grimpe à 200-400 ms.
2. **L'API prend toute la charge.** 1 200 fiches × milliers de visites = l'API et la base encaissent un trafic qu'un fichier statique aurait absorbé gratuitement.
3. **Aucun cache partagé possible.** `force-dynamic` interdit au CDN de mettre en cache (cf. module 08) — chaque requête va jusqu'à l'origine.

Le contenu est **public, identique pour tous, rarement modifié**. C'est le cas d'école du rendu **statique** : générer le HTML **une fois**, le servir depuis un CDN, et le **régénérer** seulement quand il change. Ce module te donne les deux outils Next.js pour ça — SSG (statique au build) et ISR (statique + régénération) — et le critère pour choisir.

---

## 2. Théorie complète, concise

### 2.1 SSG — générer le HTML au build

Le **SSG** (Static Site Generation) consiste à générer le HTML de chaque page **au moment du build**, avant qu'aucun utilisateur n'arrive. Le serveur ne calcule plus rien à la requête : il sert un fichier déjà prêt, cachable agressivement sur un CDN (`Cache-Control: public, max-age=..., immutable` — module 04).

En App Router, une page est **statique par défaut** si elle n'utilise aucune API dynamique (`cookies()`, `headers()`, `searchParams`, ou un `fetch` en `no-store`). Pour une route dynamique `[slug]`, il faut dire à Next **quelles valeurs** pré-rendre.

### 2.2 `generateStaticParams()` — la liste des pages à pré-rendre

`generateStaticParams` retourne un **tableau d'objets**, un par page à générer. Chaque clé de l'objet correspond au nom du segment dynamique.

```tsx
// app/activites/[slug]/page.tsx
export async function generateStaticParams() {
  const activites = await fetch('https://api.tribuzen.app/activites')
    .then((r) => r.json())

  // Une entrée par page : { slug } remplit le segment [slug]
  return activites.map((a: { slug: string }) => ({ slug: a.slug }))
}
```

| Route | Type de retour attendu |
|---|---|
| `/activites/[slug]` | `{ slug: string }[]` |
| `/activites/[cat]/[slug]` | `{ cat: string, slug: string }[]` |
| `/activites/[...path]` (catch-all) | `{ path: string[] }[]` |

Au `next build`, Next appelle cette fonction, puis génère une page HTML pour **chaque** entrée retournée. `generateStaticParams` remplace le `getStaticPaths` de l'ancien Pages Router.

> **Next 15 — `params` est asynchrone.** Depuis Next 15, `params` (et `searchParams`) sont des **`Promise`** : dans le composant de page il faut `const { slug } = await params`. C'est un changement de signature par rapport à Next 14 (où `params` était un objet synchrone).

### 2.3 `dynamicParams` — que faire des slugs non pré-générés ?

Que se passe-t-il si un visiteur demande `/activites/nouvelle-rando` alors que ce slug n'était **pas** dans `generateStaticParams` (créé après le build) ? C'est `dynamicParams` qui tranche :

```tsx
export const dynamicParams = true  // DÉFAUT : génère la page à la volée au 1er accès (puis la cache)
// export const dynamicParams = false // les slugs non listés → 404
```

- `true` (défaut) : les slugs inconnus sont rendus **à la demande** au premier accès, puis mis en cache comme les autres. Idéal quand le catalogue grandit sans rebuild.
- `false` : seuls les slugs de `generateStaticParams` existent ; tout le reste → **404**. Utile pour un ensemble fermé (pages légales, docs versionnées).

### 2.4 ISR — `export const revalidate` (régénération temporelle)

Le SSG pur a une limite : le contenu est **figé au build**. Si un prix change, il faut re-builder tout le site. L'**ISR** (Incremental Static Regeneration) lève ça : la page reste statique, mais Next la **régénère en arrière-plan** après un délai que tu fixes.

```tsx
// app/activites/[slug]/page.tsx
export const revalidate = 3600 // secondes : régénérer au plus toutes les heures

export default async function ActivitePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const activite = await fetch(`https://api.tribuzen.app/activites/${slug}`)
    .then((r) => r.json())
  return <article>{/* ... */}</article>
}
```

Valeurs de `export const revalidate` :

| Valeur | Comportement | Équivalent HTTP (module 04/06) |
|---|---|---|
| `false` (défaut) | SSG pur — jamais revalidé, figé jusqu'au prochain build | `immutable` |
| `0` | force le rendu dynamique (SSR) — pas de cache | `no-store` |
| `N` (nombre) | ISR — la page est régénérée au plus toutes les `N` s | `s-maxage=N, stale-while-revalidate` |

Le **flux ISR** reprend exactement le `stale-while-revalidate` du module 06 :

```
Requête avant expiration (age < revalidate)
  → sert la page en cache, instantanée (comme du SSG)

Première requête APRÈS expiration (age >= revalidate)
  → sert quand même la version en cache (STALE) immédiatement
  → EN ARRIÈRE-PLAN : refetch + re-render, met à jour le cache

Requête suivante
  → sert la nouvelle version (fraîche)
```

Personne n'attend jamais la régénération : l'utilisateur reçoit toujours du statique. La fraîcheur est **au plus** de `N` secondes de retard. On peut aussi poser `revalidate` **par fetch** (plus granulaire que la page entière) :

```tsx
const activite = await fetch(url, { next: { revalidate: 3600 } })
```

### 2.5 Régénération à la demande — `revalidatePath` & `revalidateTag`

Le délai temporel a un défaut : si un éditeur publie une correction **maintenant**, il faut attendre l'expiration. La **régénération à la demande** (on-demand) force l'invalidation immédiatement, typiquement via un **webhook** appelé par le CMS. Deux fonctions, importées de `next/cache`, utilisables dans une **route handler** ou une **server action** (jamais côté client) :

- `revalidatePath(path, type?)` — invalide **un chemin** précis.
- `revalidateTag(tag)` — invalide **toutes les pages** dont un `fetch` porte ce tag.

```tsx
// app/api/revalidate/route.ts — webhook appelé par le CMS TribuZen
import { revalidatePath, revalidateTag } from 'next/cache'
import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')
  if (secret !== process.env.REVALIDATE_SECRET) {
    return Response.json({ message: 'Secret invalide' }, { status: 401 })
  }

  const { slug, tag } = await request.json()

  if (slug) revalidatePath(`/activites/${slug}`) // une fiche précise
  if (tag) revalidateTag(tag)                     // ex. 'activites' → toutes les listes

  return Response.json({ revalidated: true, now: Date.now() })
}
```

Pour que `revalidateTag('activites')` ait un effet, il faut **taguer** les fetch concernés :

```tsx
// Ce fetch sera invalidé par revalidateTag('activites')
const activites = await fetch('https://api.tribuzen.app/activites', {
  next: { tags: ['activites'] },
})
```

`revalidatePath` cible une **URL** (« régénère cette fiche »), `revalidateTag` cible une **donnée logique** (« toute page qui affiche la liste des activités »). On les combine souvent : à la publication d'une activité, on `revalidatePath` sa fiche **et** on `revalidateTag('activites')` pour rafraîchir la page de liste.

> **Signatures — Next 15 vs Next 16.** Dans ce module (Next **15**), la forme est `revalidateTag('activites')` (un seul argument). Next **16** a introduit une seconde signature `revalidateTag(tag, 'max')` (sémantique stale-while-revalidate explicite) et une fonction `updateTag` pour l'expiration immédiate ; la forme à un argument y devient dépréciée. En Next 15, tiens-t'en à l'appel simple. <!-- FLAG-DOC: le passage exact Next15→16 de revalidateTag (1 arg → 2 args + updateTag) est daté des docs v16 ; revérifier à la montée de version du repo. -->

### 2.6 `params` async, un rappel qui casse les builds

Puisque `params` est une `Promise` en Next 15, l'oublier casse le typage **et** le runtime :

```tsx
// ❌ params traité en objet synchrone (habitude Next 14)
export default function Page({ params }: { params: { slug: string } }) {
  return <h1>{params.slug}</h1> // slug undefined / erreur de type
}

// ✅ Next 15 : await
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <h1>{slug}</h1>
}
```

### 2.7 SSG vs ISR vs SSR — le critère de choix

Deux axes décident : **fréquence de changement** du contenu et **besoin de personnalisation** par utilisateur.

| | SSG | ISR | SSR |
|---|---|---|---|
| HTML généré | au build | au build + régénéré | à chaque requête |
| Fraîcheur | figée au build | ≤ `revalidate` s de retard | temps réel |
| Personnalisation / user | non (identique pour tous) | non | oui (cookies, session) |
| Charge origine | nulle | minime (régénérations rares) | forte |
| Config Next | pas de `revalidate` (ou `false`) | `revalidate = N` | `revalidate = 0` / `force-dynamic` |

Règle rapide :
- **Contenu public, identique, quasi figé** (docs, mentions légales, landing) → **SSG**.
- **Contenu public, identique, qui évolue** (fiche produit, article, annuaire) → **ISR**.
- **Contenu personnalisé / temps réel** (dashboard, panier, feed) → **SSR** (module 10).

---

## 3. Worked examples

### Exemple 1 — La fiche activité TribuZen : de SSR à ISR

On corrige le cas concret du §1. Le contenu est public et rarement modifié → ISR avec régénération toutes les heures, plus pré-génération des fiches au build.

```tsx
// app/activites/[slug]/page.tsx — VERSION ISR
import { notFound } from 'next/navigation'

// 1) ISR : la page est régénérée au plus toutes les heures.
//    L'utilisateur reçoit TOUJOURS du HTML statique (instantané).
export const revalidate = 3600

// 2) Pré-générer les fiches connues au build (SSG des 1 200 slugs).
export async function generateStaticParams() {
  const activites = await fetch('https://api.tribuzen.app/activites', {
    next: { tags: ['activites'] }, // taggé pour l'invalidation on-demand
  }).then((r) => r.json())

  return activites.map((a: { slug: string }) => ({ slug: a.slug }))
}

// 3) Un slug créé APRÈS le build sera rendu à la volée au 1er accès, puis caché.
export const dynamicParams = true

export default async function ActivitePage({
  params,
}: {
  params: Promise<{ slug: string }> // Next 15 : params est une Promise
}) {
  const { slug } = await params

  const res = await fetch(`https://api.tribuzen.app/activites/${slug}`, {
    next: { tags: ['activites', `activite:${slug}`] },
  })
  if (!res.ok) notFound() // 404 propre pour un slug inexistant

  const activite = await res.json()

  return (
    <article>
      <h1>{activite.titre}</h1>
      <p>{activite.description}</p>
    </article>
  )
}
```

**Pourquoi c'est correct :**
- `revalidate = 3600` : les visiteurs reçoivent du statique (TTFB minimal, cachable CDN via `s-maxage`), et le contenu a au plus 1 h de retard — acceptable pour une fiche qui change une fois par semaine.
- `generateStaticParams` pré-rend les 1 200 fiches au build → premier accès déjà instantané, pas de « cold render ».
- Les `fetch` sont **taggés** (`activites`, `activite:${slug}`) → on pourra les invalider ciblément (exemple 2).
- L'API n'encaisse plus qu'une régénération par fiche et par heure au lieu d'un hit par visite : la charge du §1 disparaît.

### Exemple 2 — Publication immédiate via webhook on-demand

L'éditrice corrige une faute sur la fiche `rando-lac-blanc` et veut la voir en ligne **tout de suite**, sans attendre l'heure d'ISR. Le CMS appelle la route handler de revalidation.

```tsx
// app/api/revalidate/route.ts
import { revalidatePath, revalidateTag } from 'next/cache'
import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  // Sécurité : un secret partagé empêche n'importe qui de forcer des régénérations
  const secret = request.nextUrl.searchParams.get('secret')
  if (secret !== process.env.REVALIDATE_SECRET) {
    return Response.json({ message: 'Non autorisé' }, { status: 401 })
  }

  const { slug } = await request.json()
  if (!slug) {
    return Response.json({ message: 'slug manquant' }, { status: 400 })
  }

  // Invalide la fiche précise ET la page de liste (qui utilise le tag 'activites')
  revalidatePath(`/activites/${slug}`)
  revalidateTag('activites')

  return Response.json({ revalidated: true, slug, now: Date.now() })
}
```

Test au terminal (le vrai outil du lab) :

```bash
curl -X POST "http://localhost:3000/api/revalidate?secret=dev-secret" \
  -H "Content-Type: application/json" \
  -d '{"slug":"rando-lac-blanc"}'
# → {"revalidated":true,"slug":"rando-lac-blanc","now":...}
```

Au **prochain accès** à `/activites/rando-lac-blanc`, Next sert la version fraîche : le cache a été marqué invalide, la page est régénérée. Note bien : `revalidatePath`/`revalidateTag` **marquent** l'invalidation ; la régénération effective a lieu **à la visite suivante**, pas au moment de l'appel — ça évite un pic de 1 200 régénérations simultanées.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Croire que l'ISR régénère « toutes les N secondes »

`revalidate = 60` **ne** lance **pas** un rebuild toutes les 60 s en tâche de fond. La régénération n'est déclenchée que par une **requête qui arrive après expiration**. Une page jamais visitée n'est jamais régénérée. `revalidate` est un **âge maximum toléré**, pas un cron.

```
❌ « revalidate = 60 → la page se reconstruit chaque minute »
✅ « après 60 s, la PROCHAINE requête sert le stale et déclenche la régénération »
```

### PIÈGE #2 — Oublier que `params` est une `Promise` (Next 15)

```tsx
// ❌ habitude Next 14 : casse en Next 15
export default function Page({ params }: { params: { slug: string } }) {
  return <h1>{params.slug}</h1>
}
```

En Next 15, `params` est asynchrone : il faut `async` + `await params`. Sinon erreur de type et `slug` indéfini. Même chose pour `searchParams`.

### PIÈGE #3 — `revalidateTag` sans avoir tagué les `fetch`

```tsx
// ❌ le fetch n'est pas taggé…
const data = await fetch(url)
// …donc cet appel ne fait rien d'utile :
revalidateTag('activites')
```

`revalidateTag(tag)` n'invalide que les `fetch` déclarés avec `next: { tags: [tag] }`. Sans tag posé côté fetch, l'appel est un no-op silencieux. **Règle :** tag au fetch **et** tag à l'invalidation, exactement la même chaîne (sensible à la casse).

### PIÈGE #4 — Confondre `revalidatePath` et `revalidateTag`

```tsx
revalidatePath('/activites/rando')  // UNE url précise
revalidateTag('activites')          // TOUTE page qui lit la donnée taguée 'activites'
```

`revalidatePath` cible une **route** ; `revalidateTag` cible une **donnée logique** qui peut apparaître sur plusieurs pages (fiche + liste + page d'accueil). Invalider seulement la fiche laisse la **page de liste** périmée. Pour une cohérence complète, combine les deux.

### PIÈGE #5 — Rendre dynamique une page qu'on croyait statique

Utiliser `cookies()`, `headers()`, `searchParams`, ou un `fetch` en `{ cache: 'no-store' }` **bascule** la page en rendu dynamique (SSR) — le `generateStaticParams` et le `revalidate` deviennent inopérants pour la partie dynamique.

```tsx
// ❌ ce headers() rend TOUTE la page dynamique, l'ISR ne s'applique plus
import { headers } from 'next/headers'
const h = await headers()
```

**Règle :** garde les pages statiques **pures** (aucune API par-requête). Si tu as besoin d'un bout personnalisé, isole-le dans un Client Component ou un segment dynamique dédié, sans contaminer la page statique.

### PIÈGE #6 — Mettre en SSG un contenu personnalisé

```tsx
// ❌ dashboard utilisateur en SSG/ISR : tout le monde verrait les mêmes données !
export const revalidate = 60 // sur /dashboard → fuite entre utilisateurs
```

SSG et ISR produisent **une seule** version partagée par tous. Une page qui dépend de l'utilisateur (session, panier, solde) **doit** être en SSR (module 10). L'ISR est réservé au contenu **public et identique pour tous**.

---

## 5. Ancrage TribuZen

TribuZen sépare nettement ses trois familles de pages selon les critères du §2.7 :

| Page | Stratégie | Config Next 15 | Raison |
|---|---|---|---|
| `/` accueil marketing, `/cgu`, `/a-propos` | **SSG** | pas de `revalidate` | Contenu figé → statique pur, cache CDN maximal |
| `/activites` (liste), `/activites/[slug]` (fiche) | **ISR** | `revalidate = 3600` + `generateStaticParams` | Public, identique, évolue lentement → statique + fraîcheur ≤ 1 h |
| `/app/dashboard`, `/app/famille/[id]` | **SSR** | `revalidate = 0` / `force-dynamic` | Données personnelles par utilisateur → module 10 |

Chaîne de régénération de l'annuaire :
- **Build** : `generateStaticParams` pré-rend les fiches connues ; les `fetch` de l'annuaire portent le tag `activites`.
- **Temporel** : `revalidate = 3600` garantit qu'une modif API apparaît en ≤ 1 h même sans webhook.
- **On-demand** : quand un animateur publie une activité dans le back-office, celui-ci appelle `POST /api/revalidate` → `revalidatePath('/activites/<slug>')` + `revalidateTag('activites')` → la fiche **et** la liste sont fraîches au prochain accès, sans rebuild.

Fichiers cibles dans `smaurier/tribuzen` :
```
tribuzen/
  web/app/activites/[slug]/page.tsx      # revalidate + generateStaticParams (ISR)
  web/app/activites/page.tsx             # liste taguée 'activites'
  web/app/api/revalidate/route.ts        # webhook on-demand (secret + revalidatePath/Tag)
  web/app/(marketing)/cgu/page.tsx       # SSG pur (aucun revalidate)
```

---

## 6. Points clés

1. **SSG** = HTML généré au build, servi comme un fichier statique (cache CDN agressif, TTFB minimal). Statique **par défaut** en App Router tant qu'aucune API dynamique n'est utilisée.
2. `generateStaticParams()` retourne un tableau `{ segment: valeur }[]` : la liste des pages d'une route dynamique à pré-rendre au build.
3. **ISR** = SSG + régénération. `export const revalidate = N` fixe l'âge maximum ; la régénération suit le flux `stale-while-revalidate` (module 06) et n'est déclenchée que par une requête post-expiration.
4. `revalidate` : `false` = SSG figé, `0` = SSR dynamique, `N` = ISR ; posable aussi par `fetch` via `next: { revalidate }`.
5. `dynamicParams` : `true` (défaut) rend à la volée les slugs non pré-générés ; `false` les renvoie en 404.
6. **On-demand** : `revalidatePath(path)` invalide une URL, `revalidateTag(tag)` invalide toute donnée taguée (`fetch(..., { next: { tags } })`) — depuis `next/cache`, en route handler ou server action.
7. En **Next 15**, `params`/`searchParams` sont des `Promise` → `async` + `await params`.
8. Choix : contenu figé → SSG ; public et évolutif → ISR ; personnalisé/temps réel → SSR (module 10).

---

## 7. Seeds Anki

```
Quelle est la différence entre SSG et ISR dans Next App Router ?|SSG génère le HTML au build et le fige jusqu'au prochain build (pas de revalidate, ou revalidate=false). ISR ajoute une régénération : export const revalidate=N régénère la page en arrière-plan après N secondes, en gardant le comportement statique (l'utilisateur reçoit toujours du HTML pré-rendu).
À quoi sert generateStaticParams() et que retourne-t-elle ?|Elle liste les pages d'une route dynamique à pré-rendre au build. Elle retourne un tableau d'objets, un par page, dont les clés sont les noms des segments : pour /activites/[slug], retourne { slug: string }[]. Next génère une page HTML par entrée au next build. Remplace getStaticPaths du Pages Router.
Que fait export const revalidate = 3600 et quand la régénération a-t-elle lieu ?|C'est de l'ISR : la page est considérée fraîche 1 h. La régénération n'est PAS un cron — elle est déclenchée par la première requête arrivant APRÈS expiration : cette requête reçoit la version stale, la régénération se fait en arrière-plan, la requête suivante reçoit la version fraîche (stale-while-revalidate).
Quelle est la différence entre revalidatePath et revalidateTag ?|revalidatePath(path) invalide une URL précise (ex. /activites/rando). revalidateTag(tag) invalide toutes les pages dont un fetch porte ce tag (fetch(url, { next: { tags: [tag] } })). L'un cible une route, l'autre une donnée logique présente sur plusieurs pages. On les combine pour une cohérence complète (fiche + liste).
Pourquoi revalidateTag('activites') peut-il ne rien faire ?|Parce qu'il n'invalide que les fetch tagués avec next: { tags: ['activites'] }. Sans tag posé côté fetch, l'appel est un no-op. Il faut le même tag (sensible à la casse) au fetch ET à l'invalidation.
Quelle nouveauté de signature params impose Next 15 ?|params (et searchParams) sont désormais des Promise : dans le composant de page il faut une fonction async et const { slug } = await params. En Next 14, params était un objet synchrone.
Quand choisir SSG, ISR ou SSR ?|SSG pour du contenu public figé (docs, mentions légales). ISR pour du contenu public identique pour tous mais qui évolue (fiche produit, annuaire). SSR pour du contenu personnalisé ou temps réel (dashboard, panier), car SSG/ISR produisent une seule version partagée par tous les utilisateurs.
Que fait dynamicParams pour un slug absent de generateStaticParams ?|dynamicParams=true (défaut) rend la page à la volée au premier accès puis la met en cache. dynamicParams=false renvoie une 404 pour tout slug non pré-généré (ensemble fermé).
```

---

## Pont vers le lab

> Lab associé : `11-http-caching/labs/lab-11-isr-ssg/README.md`. Construire une app Next.js 15 minimale avec une route ISR (`generateStaticParams` + `export const revalidate`) et un endpoint `POST /api/revalidate`, puis **observer** au terminal la régénération : `next build` (voir les pages marquées statiques/ISR), navigation, puis `curl` sur l'endpoint de revalidation pour forcer une régénération à la demande.
