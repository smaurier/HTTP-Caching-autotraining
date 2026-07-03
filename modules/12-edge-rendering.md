---
titre: Edge rendering — exécuter le code au plus près de l'utilisateur
cours: 11-http-caching
notions: ["Edge Runtime vs Node.js runtime", "V8 isolate", "cold start V8 isolate", "middleware au edge (middleware.ts)", "export const runtime = 'edge'", "exécution géo-distribuée", "limites de l'edge (pas de fs / node natif)", "no require / no eval", "Vercel Edge Functions", "Cloudflare Workers", "cache à l'edge", "request.geo retiré en Next 15", "@vercel/functions geolocation()", "headers géo (cf-ipcountry, x-vercel-ip-country)", "NextResponse.rewrite / redirect", "matcher du middleware", "waitUntil()", "edge ne supporte pas l'ISR"]
outcomes:
  - sait distinguer Edge Runtime et Node.js runtime et choisir le bon selon les APIs et la latence
  - sait écrire un middleware Next.js 15 qui s'exécute au edge (géo-redirection, A/B, gate) avant le rendu
  - sait lire la géolocalisation au edge en Next 15 (headers géo ou @vercel/functions) sans request.geo
  - sait énoncer les limites de l'edge (pas de fs, pas de node natif, pas d'ISR, cold start, taille) et quand ne PAS l'utiliser
  - sait poser un cache à l'edge sur une réponse edge sans casser le cache CDN des pages ISR
prerequis: [00-prerequis-et-vue-ensemble, 01-protocole-http, 02-http2-http3, 03-en-tetes-http, 04-cache-control, 05-etag-validation-conditionnelle, 06-stale-while-revalidate, 07-cache-navigateur, 08-cdn, 09-cache-multi-couches, 10-ssr, 11-isr-ssg]
next: 13-http-streaming
libs: [{ name: next, version: "15" }]
tribuzen: middleware au edge de TribuZen — géo-redirection de locale, gate de session et A/B exécutés dans le POP le plus proche, devant les pages d'activités déjà servies en ISR, sans round-trip à l'origine
last-reviewed: 2026-07
---

# Edge rendering — exécuter le code au plus près de l'utilisateur

> **Outcomes — tu sauras FAIRE :** distinguer Edge Runtime et Node.js runtime, écrire un middleware Next.js 15 qui s'exécute au edge, lire la géolocalisation au edge sans `request.geo`, énoncer les limites de l'edge et quand ne PAS l'utiliser, poser un cache à l'edge sans casser le cache CDN.
> **Difficulté :** :star::star::star::star:
>
> **Portée :** ce module couvre **uniquement** l'exécution de code **à la périphérie** (edge runtime, middleware au edge, calcul géo-distribué) et le **cache à l'edge**. Le **SSR** (rendu à la requête) est le **module 10**, l'**ISR/SSG** (rendu statique + régénération) le **module 11** — on s'appuie dessus sans les redétailler. Le **streaming** du HTML (Suspense, envoi par morceaux) est le **module 13**. Cloudflare Workers et Vercel Edge Functions sont vus **en survol**, pas en profondeur plateforme.

## 1. Cas concret d'abord

TribuZen sert ses fiches d'activité publiques (`/activites/[slug]`) en **ISR** (module 11) : le HTML est pré-rendu et **caché au CDN** dans tous les POP du monde. Un utilisateur à Tokyo reçoit le HTML de la fiche en ~5 ms depuis le POP de Tokyo. Parfait.

Mais deux règles doivent s'appliquer **avant** d'afficher la page :

1. **Redirection de locale** — un visiteur détecté au Japon doit atterrir sur `/ja/activites/...`, un Français sur `/fr/activites/...`.
2. **Gate de session** — `/app/*` (dashboard) exige un cookie de session valide, sinon redirection vers `/login`.

Aujourd'hui, cette logique tourne dans le **serveur Node.js d'origine**, hébergé dans **une seule région** (Paris). Résultat pour le visiteur de Tokyo :

```
Requête Tokyo  ──(200ms RTT)──▶  Origine Node.js (Paris)
                                  décision : "tu es au Japon → /ja/..."
               ◀──(200ms RTT)──  302 Location: /ja/activites/...
Puis SEULEMENT là, le HTML ISR est servi depuis le POP de Tokyo (~5ms).
```

On paie **~400 ms de round-trip vers Paris juste pour décider d'une redirection** — alors que le HTML final, lui, est déjà à Tokyo. La décision (lire un header géo, lire un cookie, choisir une URL) est **triviale en CPU** mais **coince en latence** parce qu'elle s'exécute au mauvais endroit.

La réponse : déplacer cette décision **dans le POP de Tokyo**, avant le rendu. C'est le **edge** — exécuter du code léger dans le datacenter le plus proche de l'utilisateur. En Next.js, c'est le **middleware**, qui tourne sur l'**Edge Runtime**. Ce module te donne : le modèle d'exécution edge, comment y router/personnaliser sans round-trip, ses **limites** (pas de `fs`, pas de node natif, pas d'ISR), et comment y cacher **sans** casser le cache CDN des pages ISR déjà en place.

---

## 2. Théorie complète, concise

### 2.1 Deux runtimes : Node.js vs Edge

Une plateforme moderne (Vercel, Netlify, Cloudflare) t'offre **deux environnements** pour exécuter ton code serveur :

| | **Node.js runtime** | **Edge Runtime** |
|---|---|---|
| Environnement | processus Node complet | **V8 isolate** (comme un Service Worker) |
| Où il tourne | 1 (ou quelques) région(s) | **tous les POP** (géo-distribué) |
| Démarrage à froid | ~100-250 ms (cold start conteneur) | **~1-5 ms** (cold start d'isolate) |
| APIs disponibles | tout Node (`fs`, `net`, `crypto` node, npm lourd) | **Web APIs seulement** (`fetch`, `Request`, `Response`, `crypto.subtle`, streams…) |
| Taille du bundle | ~illimitée | limitée (~1-10 Mo selon plateforme) |
| Cas d'usage | rendu lourd, ORM, image, gros calcul | routing, redirect, auth légère, personnalisation, A/B |

Le **V8 isolate** est l'idée-clé : plutôt qu'un conteneur Node par requête, la plateforme garde un moteur V8 unique et y exécute chaque requête dans un **isolat** mémoire léger. C'est ce qui rend le cold start quasi nul et le déploiement mondial possible — mais c'est aussi ce qui **retire** l'accès aux APIs système de Node.

### 2.2 L'Edge Runtime : ce qu'il a, ce qu'il n'a pas

L'Edge Runtime expose un sous-ensemble **standard Web** (vérifié sur la doc Next.js) :

- ✅ **Réseau/HTTP** : `fetch`, `Request`, `Response`, `Headers`, `URL`, `URLPattern`, `URLSearchParams`, `WebSocket`, `FormData`, `Blob`.
- ✅ **Crypto Web** : `crypto`, `crypto.subtle` (hash, signature, chiffrement), `CryptoKey`.
- ✅ **Encodage/streams** : `TextEncoder`/`TextDecoder`, `atob`/`btoa`, `ReadableStream`/`WritableStream`/`TransformStream`.
- ✅ **Standard JS** : `Intl`, `structuredClone`, `setTimeout`, `queueMicrotask`, `process.env`.

Et surtout, ce qu'il **n'a pas** :

- ❌ **APIs natives Node** : pas de `fs` (système de fichiers), pas de `net`/`dgram` (sockets bruts), pas de `child_process`.
- ❌ **`require()`** : ES Modules uniquement.
- ❌ **`eval()` et `new Function(string)`** : évaluation dynamique de code interdite (sécurité de l'isolate).
- ❌ **Bundles npm lourds** qui dépendent de Node natif (`sharp`, `puppeteer`, la plupart des drivers DB TCP).

> **Conséquence directe pour ce cours :** l'Edge Runtime **ne supporte pas l'ISR** (module 11). Une page qui veut être régénérée de façon incrémentale reste sur le Node.js runtime. Le edge sert à **décider et personnaliser**, pas à faire du rendu statique régénérable.

### 2.3 Middleware au edge : le code exécuté AVANT le rendu

En Next.js 15, un fichier **`middleware.ts`** à la racine du projet s'exécute **au edge, avant chaque requête** matchée, dans le POP le plus proche de l'utilisateur. C'est l'outil du cas concret §1.

```ts
// middleware.ts — Next.js 15, s'exécute sur l'Edge Runtime par défaut
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Décision légère : rewrite / redirect / next / réponse directe
  return NextResponse.next()
}

// Ne cibler QUE certaines routes (sinon le middleware tourne sur TOUS les assets)
export const config = {
  matcher: ['/activites/:path*', '/app/:path*'],
}
```

Ce que le middleware peut renvoyer :

- `NextResponse.next()` — laisse passer la requête vers le rendu.
- `NextResponse.redirect(url)` — redirige (302) ; c'est notre géo-redirection.
- `NextResponse.rewrite(url)` — **réécrit** l'URL cible **sans changer l'URL affichée** (idéal A/B : `/landing` → `/landing/b` en interne).
- `Response.json(...)` / `new Response(...)` — répond **directement** au edge, sans jamais toucher l'origine (ex. bloquer une requête non authentifiée).

Le **`matcher`** est non négociable : sans lui, le middleware s'exécute aussi sur `_next/static`, les images, le CSS — ce qui ajoute de la latence à chaque asset. On exclut typiquement les fichiers statiques.

> **Frontière de version (Next 15 → 16).** Ce module suit **Next 15** : le fichier est `middleware.ts` et s'exécute sur l'Edge Runtime par défaut ; depuis 15.5 on peut opter pour le Node.js runtime (stable). En **Next 16**, `middleware` a été **renommé `proxy`** (fichier `proxy.ts`, fonction `proxy`) et **bascule par défaut sur le Node.js runtime** — un codemod (`@next/codemod middleware-to-proxy`) automatise la migration. Tiens-toi à `middleware.ts` tant que le repo est en Next 15.

### 2.4 Lire la géolocalisation au edge — le piège Next 15

C'est le changement qui casse le plus de tutoriels. **En Next 15, `request.geo` et `request.ip` ont été RETIRÉS** de `NextRequest` (PR vercel/next.js #68379). Ces valeurs viennent désormais de **l'hébergeur**, pas du framework.

Deux façons correctes de lire le pays au edge en Next 15 :

```ts
// A) Via les en-têtes injectés par le CDN (portable, aucune dépendance)
const country =
  request.headers.get('x-vercel-ip-country') ?? // Vercel
  request.headers.get('cf-ipcountry') ??          // Cloudflare
  'FR'

// B) Sur Vercel : helper dédié de @vercel/functions
import { geolocation } from '@vercel/functions'
const { country, city } = geolocation(request)
```

`geolocation(request)` renvoie `country`, `city`, `region`, `latitude`, `longitude`. Le point à retenir : **la géo n'est plus une propriété du framework, c'est un service de la plateforme** — soit un header (`cf-ipcountry`, `x-vercel-ip-country`), soit un helper hébergeur.

### 2.5 Route Handler et page au edge : `export const runtime = 'edge'`

Le middleware n'est pas le seul code edge. On peut aussi faire tourner une **route handler** ou une **page** sur l'Edge Runtime via un export de segment :

```ts
// app/api/hello/route.ts
export const runtime = 'edge' // cette route s'exécute au edge, pas à l'origine Node
```

- `runtime = 'edge'` (valeur ancienne `experimental-edge` **supprimée** en Next 15 → utilise `edge`).
- `runtime = 'nodejs'` (défaut) pour tout ce qui a besoin de Node natif ou d'ISR.

Attention : passer une route en `edge` t'oblige aux **contraintes** du §2.2. Un `import fs from 'node:fs'` dans une route `edge` échoue **au build**, pas au runtime — c'est un garde-fou.

### 2.6 Plateformes edge, en survol

| Plateforme | Runtime | CPU / temps | Taille | Géo & cache |
|---|---|---|---|---|
| **Vercel Edge Functions** | V8 (Edge Runtime) | court, orienté requête | ~1-4 Mo | headers `x-vercel-ip-*`, cache CDN Vercel |
| **Cloudflare Workers** | V8 isolate | 10 ms CPU (gratuit) / 5 min (payant) | 3 Mo gz (gratuit) / 10 Mo (payant) | `request.cf` + header `cf-ipcountry`, Cache API + Workers KV |

> Chiffres Cloudflare vérifiés sur la doc officielle (limites Workers) : mémoire **128 Mo** par isolate ; **50 sous-requêtes** par invocation (gratuit), 1000+ (payant). L'important n'est pas de retenir les nombres exacts, mais l'**ordre de grandeur** : le edge est fait pour du **court et léger**, pas pour du calcul lourd ni des gros bundles.

Un Worker Cloudflare minimal (survol), pour montrer que c'est le **même modèle Web** que le middleware Next :

```js
// worker.js — Cloudflare Worker (survol) : même Web API que l'Edge Runtime
export default {
  async fetch(request) {
    const country = request.headers.get('cf-ipcountry') ?? 'FR'
    return new Response(JSON.stringify({ country, pop: 'edge' }), {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, s-maxage=60', // cache à l'edge Cloudflare
      },
    })
  },
}
```

### 2.7 Cache à l'edge — sans casser le cache CDN existant

Le edge peut **cacher ses propres réponses**, en réutilisant exactement les en-têtes des modules 04/06/08 : `s-maxage` (cache partagé), `stale-while-revalidate`, et l'en-tête spécifique `CDN-Cache-Control` (qui ne parle **qu'aux** caches CDN, sans affecter le navigateur).

```http
Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=300
CDN-Cache-Control: max-age=300
```

Deux règles pour ne pas se tirer une balle dans le pied :

1. **Le middleware ne doit pas empêcher le cache CDN de la page.** Si le middleware fait un `rewrite` propre et ne pose pas d'en-tête `no-store`, la page ISR reste cachée au CDN comme avant. Un middleware qui `set` un cookie **par utilisateur** sur une réponse publique, en revanche, peut forcer le CDN à ne plus la partager — à éviter sur les routes cachables.
2. **Ne cache au edge que ce qui est identique pour tous** — exactement la règle du module 10 (§2.8). Une réponse edge personnalisée (dépend du cookie de session) → `private, no-store`.

### 2.8 Quand NE PAS utiliser le edge

Le edge n'est pas « toujours plus rapide ». Il l'est **quand la donnée nécessaire est proche** (headers, KV, API géo-distribuée). Il devient **plus lent** dès que le code edge doit rappeler une ressource centralisée :

```
Ta DB est dans une seule région (Paris).
Edge à Tokyo → doit fetch la DB de Paris → 200ms de RTT PAR requête edge.
Ici, le edge AJOUTE un saut au lieu d'en retirer un.
```

À garder sur le Node.js runtime : rendu lourd, ORM/driver DB TCP, traitement d'image, dépendances npm natives, **et l'ISR**. Au edge : routing, redirect, géo/A/B, auth légère (vérif JWT stateless via `crypto.subtle`), réécriture de headers.

---

## 3. Worked examples

### Exemple 1 — Le middleware edge de TribuZen (géo-redirect + gate), Next 15

On résout le §1. La décision (locale + session) passe du Node d'origine de Paris au **POP le plus proche** de l'utilisateur.

```ts
// middleware.ts — s'exécute au edge, AVANT le rendu ISR de la fiche
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Locales supportées ; on mappe un pays vers une locale par défaut.
const LOCALES = ['fr', 'ja', 'en'] as const
const COUNTRY_TO_LOCALE: Record<string, (typeof LOCALES)[number]> = {
  FR: 'fr', BE: 'fr', JP: 'ja', US: 'en', GB: 'en',
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // --- 1) Gate de session sur /app/* : décidée AU EDGE, 0 round-trip origine ---
  if (pathname.startsWith('/app')) {
    const session = request.cookies.get('tz_session')?.value
    if (!session) {
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = '/login'
      loginUrl.searchParams.set('next', pathname)
      return NextResponse.redirect(loginUrl) // 302 émis depuis le POP local
    }
    // Session présente : on laisse passer (la vérif fine se fait côté origine).
    return NextResponse.next()
  }

  // --- 2) Géo-redirection de locale sur les fiches publiques ---
  const hasLocale = LOCALES.some(
    (l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`),
  )
  if (!hasLocale && pathname.startsWith('/activites')) {
    // Next 15 : request.geo n'existe plus → on lit un header géo du CDN.
    const country = (
      request.headers.get('x-vercel-ip-country') ??
      request.headers.get('cf-ipcountry') ??
      'FR'
    ).toUpperCase()

    const locale = COUNTRY_TO_LOCALE[country] ?? 'fr'
    const url = request.nextUrl.clone()
    url.pathname = `/${locale}${pathname}` // /activites/x → /ja/activites/x
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

// Ne PAS matcher les assets statiques (sinon latence sur chaque CSS/JS/image).
export const config = {
  matcher: ['/activites/:path*', '/app/:path*'],
}
```

**Pourquoi c'est correct :**
- La redirection et le gate sont émis **depuis le POP local** : le visiteur de Tokyo ne fait plus l'aller-retour de 400 ms vers Paris (problème du §1 réglé).
- On lit le pays via **header géo** (`x-vercel-ip-country` / `cf-ipcountry`) — pas via `request.geo`, **retiré en Next 15**.
- Le `matcher` exclut les assets : le middleware ne tourne que sur les deux familles de routes concernées.
- Le middleware fait une **décision légère** puis `redirect`/`next` : aucune API Node, aucun rendu lourd → parfaitement compatible Edge Runtime. La page finale reste servie en **ISR** (module 11), cachée au CDN.

### Exemple 2 — Une route edge géo, cachée à l'edge (sans casser le CDN)

TribuZen veut une petite API `/api/region` qui renvoie la région détectée, utilisée par le front pour afficher la devise. Publique, identique pour tous les visiteurs d'un même pays → **cachable à l'edge**.

```ts
// app/api/region/route.ts — route handler sur l'Edge Runtime
export const runtime = 'edge' // exécutée au edge, pas à l'origine Node

export function GET(request: Request) {
  const country = (
    request.headers.get('x-vercel-ip-country') ??
    request.headers.get('cf-ipcountry') ??
    'FR'
  ).toUpperCase()

  const CURRENCY: Record<string, string> = { FR: 'EUR', JP: 'JPY', US: 'USD' }
  const currency = CURRENCY[country] ?? 'EUR'

  return Response.json(
    { country, currency },
    {
      headers: {
        // Cache partagé (CDN/edge) 60 s, revalidation douce ; le navigateur ne fige pas.
        'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300',
        // Ne parle qu'au CDN : 5 min à l'edge, indépendamment du navigateur.
        'CDN-Cache-Control': 'max-age=300',
        // Une entrée de cache par pays (le CDN varie sur ce header géo).
        Vary: 'x-vercel-ip-country',
      },
    },
  )
}
```

**Pourquoi c'est correct :**
- `runtime = 'edge'` : la réponse est calculée dans le POP local — TTFB minimal, aucun aller-retour origine.
- `s-maxage=60` + `CDN-Cache-Control: max-age=300` : la réponse est **cachée à l'edge** (module 04/08) ; un second visiteur du même pays est servi sans ré-exécuter la fonction.
- `Vary: x-vercel-ip-country` : le CDN garde **une entrée par pays** — un Japonais et un Français ne se partagent pas la mauvaise devise (règle `Vary` du module 10, §2.6).
- Aucune API Node utilisée : compatible Edge Runtime. Si on avait eu besoin d'un driver DB TCP, il aurait fallu rester sur `runtime = 'nodejs'`.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Croire que « edge = toujours plus rapide »

```
❌ "On met tout au edge, ce sera plus rapide partout."
```

Le edge rapproche le **calcul** de l'utilisateur, pas la **donnée**. Si la fonction edge doit rappeler une base centralisée (une seule région), elle **ajoute** un saut réseau au lieu d'en retirer un.

```
✅ Edge = gain UNIQUEMENT si la donnée nécessaire est proche (headers, KV, API géo-distribuée).
   Donnée centralisée → le calcul reste près de la donnée (Node.js runtime).
```

**Règle :** rapproche le calcul de **là où est la donnée**. Le edge gagne sur les décisions qui n'ont besoin que de la requête (géo, cookie, header).

### PIÈGE #2 — Utiliser une API Node dans du code `runtime = 'edge'`

```ts
❌ export const runtime = 'edge'
   import fs from 'node:fs'          // échoue AU BUILD : fs indisponible au edge
   import { createHmac } from 'crypto' // idem : crypto node ≠ crypto.subtle
```

L'Edge Runtime n'a **ni** `fs`, `net`, `child_process`, **ni** `require`, `eval`, `new Function(string)`. Un tel import casse le build.

```ts
✅ // au edge : Web Crypto (crypto.subtle), pas le module node 'crypto'
   const sig = await crypto.subtle.sign('HMAC', key, data)
```

**Règle :** au edge, on programme en **Web APIs**. Besoin de Node natif → `runtime = 'nodejs'`.

### PIÈGE #3 — Lire `request.geo` / `request.ip` (habitude Next 14)

```ts
❌ export function middleware(request: NextRequest) {
     const country = request.geo?.country // undefined en Next 15 : la propriété a été RETIRÉE
   }
```

Depuis Next 15, `geo` et `ip` ne sont plus sur `NextRequest` (fournis par l'hébergeur, pas le framework).

```ts
✅ const country = request.headers.get('x-vercel-ip-country')
                ?? request.headers.get('cf-ipcountry') ?? 'FR'
   // ou, sur Vercel : import { geolocation } from '@vercel/functions'
```

**Règle :** la géo au edge se lit dans un **header du CDN** (ou via `@vercel/functions`), plus dans `request.geo`.

### PIÈGE #4 — Vouloir faire de l'ISR (ou du rendu lourd) au edge

```ts
❌ export const runtime = 'edge'
   export const revalidate = 3600  // l'ISR N'est PAS supporté sur l'Edge Runtime
```

L'Edge Runtime **ne supporte pas l'ISR** (doc Next.js). Le edge décide et personnalise ; la régénération incrémentale (module 11) reste sur le Node.js runtime.

```ts
✅ // page ISR → runtime Node (défaut) ; edge → middleware/route de décision
   export const revalidate = 3600 // sur une page en runtime 'nodejs'
```

**Règle :** edge = décision légère et géo-distribuée. ISR/SSG régénérable = Node.js runtime.

### PIÈGE #5 — Middleware sans `matcher`

```ts
❌ export function middleware(request) { /* ... */ }
   // pas de config.matcher → s'exécute sur _next/static, images, CSS, favicon…
```

Sans `matcher`, le middleware tourne sur **chaque** requête, y compris les assets : latence ajoutée partout.

```ts
✅ export const config = {
     matcher: ['/activites/:path*', '/app/:path*'], // seulement ce qui en a besoin
   }
```

**Règle :** toujours restreindre le middleware avec `matcher` (et exclure les statiques).

### PIÈGE #6 — Confondre middleware au edge et rendu au edge

Le **middleware** s'exécute **avant** le rendu : il redirige, réécrit, gate. Il ne **rend pas** la page. Une **route/page** `runtime = 'edge'`, elle, **produit** la réponse au edge. Croire que « mon middleware rend la page » mène à y coller du rendu lourd — qui n'a rien à y faire.

```
✅ middleware  = décision (redirect / rewrite / next), avant le rendu
   runtime='edge' sur route/page = la réponse est PRODUITE au edge
```

**Règle :** middleware = aiguillage ; `runtime='edge'` = production de réponse. Deux rôles distincts.

---

## 5. Ancrage TribuZen

TribuZen garde ses pages sur le Node.js runtime (ISR, module 11) et déporte au **edge** uniquement les décisions qui gagnent à être prises près de l'utilisateur.

| Élément | Runtime | Rôle | Cache |
|---|---|---|---|
| `middleware.ts` (géo-redirect locale) | Edge | rediriger `/activites/*` → `/{locale}/activites/*` depuis le POP local | n/a (302, léger) |
| `middleware.ts` (gate `/app/*`) | Edge | rediriger vers `/login` si pas de cookie `tz_session` | n/a |
| `GET /api/region` | Edge (`runtime='edge'`) | renvoyer pays/devise détectés | `s-maxage=60` + `CDN-Cache-Control: max-age=300`, `Vary: x-vercel-ip-country` |
| `/activites/[slug]` (fiche) | **Node.js** | rendu **ISR** (module 11) | `s-maxage` via ISR, caché CDN |
| `/app/dashboard` | **Node.js** | SSR perso (module 10) | `private, no-store` |

Décisions d'architecture :
- **La logique de routing quitte l'origine de Paris** et s'exécute au edge → le visiteur lointain ne paie plus le round-trip pour une simple redirection (cas §1).
- **La géo se lit dans un header** (`x-vercel-ip-country` / `cf-ipcountry`), jamais dans `request.geo` (retiré en Next 15) → code portable Vercel/Cloudflare.
- **Le middleware reste léger** : décision + `redirect`/`rewrite`/`next`, aucune API Node, aucun rendu → compatible Edge Runtime, cold start négligeable.
- **Le cache CDN des pages ISR est préservé** : le middleware ne pose pas d'en-tête ni de cookie qui rendrait les pages publiques non partageables.

Fichiers cibles dans `smaurier/tribuzen` :
```
tribuzen/
  web/middleware.ts                       # géo-redirect locale + gate /app (Edge)
  web/app/api/region/route.ts             # route edge géo, cachée à l'edge
  web/app/activites/[slug]/page.tsx       # ISR, runtime Node (module 11)
  web/app/app/dashboard/page.tsx          # SSR perso, runtime Node (module 10)
```

---

## 6. Points clés

1. Le **edge** exécute du code dans un **V8 isolate** géo-distribué (tous les POP), au cold start quasi nul — mais **sans** les APIs natives de Node.
2. **Edge Runtime = Web APIs** (`fetch`, `Response`, `crypto.subtle`, streams…) ; pas de `fs`/`net`/`child_process`, pas de `require`/`eval`, bundle limité, **pas d'ISR**.
3. En **Next 15**, `middleware.ts` s'exécute au edge **avant** le rendu ; il `redirect`/`rewrite`/`next`/répond, avec un `matcher` obligatoire pour épargner les assets.
4. **`request.geo`/`request.ip` sont retirés en Next 15** : la géo se lit dans un header CDN (`x-vercel-ip-country`, `cf-ipcountry`) ou via `@vercel/functions`.
5. `export const runtime = 'edge'` fait tourner une route/page au edge (valeur `experimental-edge` supprimée) ; `'nodejs'` (défaut) pour Node natif et l'ISR.
6. **Vercel Edge Functions** et **Cloudflare Workers** partagent le modèle V8 isolate ; retiens l'ordre de grandeur (court, léger, ~128 Mo, quelques Mo de bundle), pas les nombres exacts.
7. On **cache à l'edge** avec `s-maxage`/`CDN-Cache-Control`/`Vary` (modules 04/08/10), en ne cachant que ce qui est **identique pour tous**, sans casser le cache CDN des pages ISR.
8. Le edge **n'est pas toujours plus rapide** : si la donnée est centralisée, il ajoute un saut → rapproche le calcul de **la donnée**.
9. **Next 16 (forward-compat)** : `middleware` → `proxy` (fichier `proxy.ts`), défaut Node.js runtime ; migration par codemod. Le repo reste en Next 15.

---

## 7. Seeds Anki

```
Quelle est la différence entre l'Edge Runtime et le Node.js runtime ?|L'Edge Runtime tourne dans un V8 isolate géo-distribué (tous les POP), cold start ~1-5 ms, mais n'expose que des Web APIs (fetch, Response, crypto.subtle, streams) — pas de fs/net/child_process, pas de require/eval, bundle limité, pas d'ISR. Le Node.js runtime a tout Node mais tourne dans 1 région avec un cold start plus élevé. Edge = décision/personnalisation légère ; Node = rendu lourd, ORM, ISR.
Pourquoi déplacer une redirection de locale dans un middleware edge plutôt qu'à l'origine ?|Parce que la décision (lire un header géo, choisir une URL) est triviale en CPU mais coûte cher en latence si elle s'exécute dans une seule région. Au edge, elle est prise dans le POP le plus proche : un visiteur lointain ne paie plus le round-trip vers l'origine (ex. ~400 ms Tokyo↔Paris) juste pour être redirigé.
Comment lit-on la géolocalisation au edge en Next 15 ?|Pas avec request.geo : cette propriété (et request.ip) a été RETIRÉE de NextRequest en Next 15. On lit un header injecté par le CDN — x-vercel-ip-country (Vercel) ou cf-ipcountry (Cloudflare) — ou, sur Vercel, le helper geolocation(request) de @vercel/functions (country, city, region…).
Que se passe-t-il si on importe fs ou le module node 'crypto' dans une route runtime='edge' ?|Le build échoue : l'Edge Runtime n'a pas les APIs natives de Node (fs, net, child_process) ni require/eval/new Function(string). Au edge on utilise les Web APIs — par ex. crypto.subtle au lieu du module node crypto. Besoin de Node natif → runtime='nodejs'.
Peut-on faire de l'ISR au edge ?|Non. L'Edge Runtime ne supporte pas l'Incremental Static Regeneration (module 11). Les pages ISR/SSG régénérables restent sur le Node.js runtime. Le edge sert à décider et personnaliser (middleware, routing, A/B, géo, auth légère), pas à faire du rendu statique régénérable.
À quoi sert le matcher d'un middleware Next et que risque-t-on sans lui ?|Le matcher (export const config = { matcher: [...] }) restreint les routes sur lesquelles le middleware s'exécute. Sans matcher, il tourne sur CHAQUE requête, y compris _next/static, images et CSS — ce qui ajoute de la latence à chaque asset. On cible les routes utiles et on exclut les statiques.
Comment cacher une réponse edge sans casser le cache CDN des pages ISR ?|On réutilise s-maxage / CDN-Cache-Control / stale-while-revalidate (modules 04/06/08) en ne cachant QUE ce qui est identique pour tous, avec un Vary sur le header discriminant (ex. Vary: x-vercel-ip-country pour une réponse par pays). Le middleware ne doit pas poser d'en-tête no-store ni de cookie par utilisateur sur une route publique, sinon le CDN cesse de la partager.
Le edge est-il toujours plus rapide que l'origine ?|Non. Le edge rapproche le calcul de l'utilisateur, pas la donnée. Si la fonction edge doit rappeler une base centralisée dans une seule région, elle AJOUTE un saut réseau par requête au lieu d'en retirer un. Règle : rapprocher le calcul de là où est la donnée ; le edge gagne quand il n'a besoin que de la requête (header, cookie, géo) ou d'une donnée déjà distribuée (KV).
Qu'est-ce qui change entre Next 15 et Next 16 pour le middleware ?|En Next 15 : fichier middleware.ts, exécuté sur l'Edge Runtime par défaut (Node.js runtime opt-in stable depuis 15.5). En Next 16 : middleware est renommé proxy (fichier proxy.ts, fonction proxy) et bascule par défaut sur le Node.js runtime ; un codemod (@next/codemod middleware-to-proxy) automatise la migration.
```

---

## Pont vers le lab

> Lab associé : `11-http-caching/labs/lab-12-edge-rendering/README.md`. Construire un `middleware.ts` Next.js 15 qui géo-redirige selon un header (`x-vercel-ip-country`) et gate `/app/*` sur un cookie, plus une route `runtime='edge'` cachée à l'edge, puis **observer** au terminal avec `curl` (en injectant le header géo et le cookie via `-H`) les redirections 302, l'URL réécrite et les en-têtes `Cache-Control`/`CDN-Cache-Control`.
