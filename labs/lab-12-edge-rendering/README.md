# Lab 12 — Edge rendering : décider au edge avec un middleware Next.js 15

> **Outcome :** à la fin, tu sais écrire un `middleware.ts` Next.js 15 qui s'exécute au edge (géo-redirection de locale + gate de session sur cookie), plus une route `runtime='edge'` cachée à l'edge, et **prouver** au terminal avec `curl` que la décision est prise avant le rendu, sans `request.geo`.
> **Vrai outil :** Next.js 15 (App Router) en local — `next dev` + `curl`. Aucun harnais de test simulé.
> **Feedback :** le coach valide en session, à partir des réponses `curl` observées (codes 302, en-tête `Location`, en-têtes de cache). Pas de test-runner auto-correcteur.

---

## Énoncé

Tu construis la couche de décision edge de TribuZen : le code qui s'exécute **avant** le rendu des pages, dans le POP le plus proche de l'utilisateur. Trois comportements observables :

1. Une visite de `/activites/rando` **sans locale** est **redirigée** (302) vers `/{locale}/activites/rando`, la locale étant déduite d'un **header géo** (`x-vercel-ip-country`).
2. Une visite de `/app/dashboard` **sans cookie** de session est **redirigée** vers `/login?next=/app/dashboard` ; **avec** le cookie, elle passe.
3. Une route `GET /api/region` s'exécute **au edge** (`runtime='edge'`) et renvoie `{ country, currency }` avec des en-têtes de **cache à l'edge** (`s-maxage`, `CDN-Cache-Control`, `Vary`).

Contrainte clé : **interdiction d'utiliser `request.geo`** (retiré en Next 15) et **aucune API Node** dans le code edge.

### Mise en place (le vrai outil)

```bash
# On ÉPINGLE Next 15 : create-next-app@latest scaffolde désormais Next 16
# (proxy.ts, runtime Node par défaut), ce qui casse ce lab.
npx create-next-app@15 lab-edge --ts --app --no-tailwind --no-src-dir --no-eslint
cd lab-edge
# Si le scaffold a quand même tiré une version plus récente, force la 15 :
npm install next@15 react@19 react-dom@19
# Rien d'autre à installer : middleware + une route + curl suffisent.
```

> Vérifie dans `package.json` que `next` est bien en **15.x** (ce lab suit Next 15 : fichier `middleware.ts`, Edge Runtime par défaut, `request.geo` absent). En Next 16 le fichier serait `proxy.ts` (runtime Node par défaut) — hors périmètre de ce lab.

### Fichiers à produire

```
lab-edge/
  middleware.ts                 # À TOI : géo-redirect locale + gate /app (Edge Runtime)
  app/api/region/route.ts       # À TOI : route runtime='edge', cachée à l'edge
  app/[locale]/activites/[slug]/page.tsx  # page minimale (cible de la redirection)
  app/login/page.tsx            # page minimale (cible du gate)
```

**Pages minimales (à copier telles quelles) — juste pour que les redirections aient une cible :**

```tsx
// app/[locale]/activites/[slug]/page.tsx
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; slug: string }> // Next 15 : params est une Promise
}) {
  const { locale, slug } = await params
  return (
    <main>
      <h1>Activité {slug}</h1>
      <p>Locale : {locale}</p>
    </main>
  )
}
```

```tsx
// app/login/page.tsx
export default function Login() {
  return <h1>Connexion</h1>
}
```

**Pas de gap-fill** — tu écris `middleware.ts` et `route.ts` complets à partir des consignes.

---

## Étapes (en friction)

1. **Squelette du middleware** — crée `middleware.ts` à la racine, exporte `middleware(request: NextRequest)` et un `config.matcher` qui ne cible **que** `/activites/:path*` et `/app/:path*` (les assets ne doivent jamais déclencher le middleware).
2. **Gate `/app/*`** — si `pathname` commence par `/app` et que le cookie `tz_session` est **absent**, `redirect` vers `/login?next=<pathname>`. S'il est présent, `next()`.
3. **Géo-redirection** — si `pathname` commence par `/activites` et **n'a pas** déjà de préfixe de locale (`/fr`, `/ja`, `/en`), lis le pays via `request.headers.get('x-vercel-ip-country')` (fallback `cf-ipcountry`, puis `'FR'`), mappe-le vers une locale, et `redirect` vers `/{locale}<pathname>`. **Interdit :** `request.geo`.
4. **Route edge** — écris `app/api/region/route.ts` avec `export const runtime = 'edge'` : lis le même header géo, renvoie `Response.json({ country, currency })` avec `Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=300`, `CDN-Cache-Control: max-age=300` et `Vary: x-vercel-ip-country`.
5. **Lance et observe** — `npm run dev`, puis avec `curl` :
   - injecte le header géo (`-H "x-vercel-ip-country: JP"`) et vérifie le `302` + `Location: /ja/activites/...` ;
   - vérifie le gate avec et sans cookie (`-H "Cookie: tz_session=abc"`) ;
   - vérifie les en-têtes de cache de `/api/region`.
   Utilise `curl -i` (affiche les en-têtes) et **`-s -o /dev/null -D -`** pour ne voir que les headers, **sans** suivre la redirection (n'ajoute pas `-L`).
6. **Contre-preuve du matcher** — `curl -i` sur un asset (`/favicon.ico`) : aucune redirection, le middleware ne s'est pas déclenché.
7. **Contrainte edge** — tente d'ajouter `import fs from 'node:fs'` en haut de `app/api/region/route.ts`, relance le build (`npm run build`) : observe l'échec. Retire-le. (Preuve que le edge refuse les APIs Node.)

---

## Corrigé complet commenté

```ts
// middleware.ts — Next 15, s'exécute sur l'Edge Runtime par défaut
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Locales supportées + mapping pays → locale par défaut.
const LOCALES = ['fr', 'ja', 'en'] as const
const COUNTRY_TO_LOCALE: Record<string, (typeof LOCALES)[number]> = {
  FR: 'fr', BE: 'fr', JP: 'ja', US: 'en', GB: 'en',
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // --- 1) Gate de session sur /app/* : décidé AU EDGE, 0 round-trip origine ---
  if (pathname.startsWith('/app')) {
    const session = request.cookies.get('tz_session')?.value
    if (!session) {
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = '/login'
      loginUrl.searchParams.set('next', pathname) // pour revenir après login
      return NextResponse.redirect(loginUrl) // 302 émis depuis le POP local
    }
    return NextResponse.next() // cookie présent → on laisse passer
  }

  // --- 2) Géo-redirection de locale sur /activites/* ---
  const hasLocale = LOCALES.some(
    (l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`),
  )
  if (!hasLocale && pathname.startsWith('/activites')) {
    // Next 15 : request.geo n'existe plus → on lit un header géo du CDN.
    const country = (
      request.headers.get('x-vercel-ip-country') ?? // Vercel
      request.headers.get('cf-ipcountry') ??          // Cloudflare
      'FR'
    ).toUpperCase()

    const locale = COUNTRY_TO_LOCALE[country] ?? 'fr'
    const url = request.nextUrl.clone()
    url.pathname = `/${locale}${pathname}` // /activites/x → /ja/activites/x
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

// Restreint le middleware : jamais sur les assets statiques.
export const config = {
  matcher: ['/activites/:path*', '/app/:path*'],
}
```

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
        // Cache partagé (CDN/edge) 60 s ; le navigateur ne fige pas (max-age=0).
        'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300',
        // Ne parle qu'au CDN : 5 min à l'edge.
        'CDN-Cache-Control': 'max-age=300',
        // Une entrée de cache par pays.
        Vary: 'x-vercel-ip-country',
      },
    },
  )
}
```

**Commandes d'observation :**

```bash
npm run dev

# 1) Géo-redirect : header JP → 302 vers /ja/... (on ne suit PAS la redirection)
curl -s -o /dev/null -D - -H "x-vercel-ip-country: JP" \
  http://localhost:3000/activites/rando
#   HTTP/1.1 307 Temporary Redirect   (Next émet un redirect interne)
#   location: /ja/activites/rando

# Header US → locale en
curl -s -o /dev/null -D - -H "x-vercel-ip-country: US" \
  http://localhost:3000/activites/rando
#   location: /en/activites/rando

# Sans header → fallback FR → /fr/...
curl -s -o /dev/null -D - http://localhost:3000/activites/rando
#   location: /fr/activites/rando

# 2) Gate /app sans cookie → redirection vers /login
curl -s -o /dev/null -D - http://localhost:3000/app/dashboard
#   location: /login?next=%2Fapp%2Fdashboard

# Avec cookie → pas de redirection (200 / rendu de la page)
curl -s -o /dev/null -D - -H "Cookie: tz_session=abc123" \
  http://localhost:3000/app/dashboard
#   (pas de header location : la requête passe)

# 3) Route edge cachée : en-têtes de cache + devise par pays
curl -s -o /dev/null -D - -H "x-vercel-ip-country: JP" \
  http://localhost:3000/api/region
#   cache-control: public, max-age=0, s-maxage=60, stale-while-revalidate=300
#   cdn-cache-control: max-age=300
#   vary: x-vercel-ip-country
curl -s -H "x-vercel-ip-country: JP" http://localhost:3000/api/region
#   {"country":"JP","currency":"JPY"}

# 4) Contre-preuve matcher : le middleware NE touche PAS les assets
curl -s -o /dev/null -D - http://localhost:3000/favicon.ico
#   (aucune redirection : matcher ne cible ni favicon ni _next/static)
```

**Pourquoi ce corrigé est correct :**
- La décision (locale, session) est prise **avant le rendu**, dans le middleware edge — c'est le déplacement de latence du cas concret du module (plus de round-trip à l'origine pour une simple redirection).
- Le pays est lu dans un **header géo** (`x-vercel-ip-country` / `cf-ipcountry`), **jamais** via `request.geo`, retiré en Next 15. En local, `curl -H` **simule** ce que le CDN injecterait en production.
- Le `matcher` exclut les assets : l'étape 6 le prouve (aucune redirection sur `/favicon.ico`).
- `runtime='edge'` + `crypto`/`fetch`/`Response` uniquement → aucune API Node ; l'étape 7 montre que `node:fs` casse le build (garde-fou de l'Edge Runtime).
- `/api/region` est **cachable à l'edge** (`s-maxage` + `CDN-Cache-Control`) et varie par pays (`Vary`) : un second visiteur japonais est servi sans ré-exécuter la fonction, sans mélanger les devises.

> **Note sur le code :** Next émet souvent un **307** (et non 302) pour les redirections de middleware — c'est normal (redirection temporaire qui **préserve la méthode**). L'oracle du lab est l'en-tête `location`, pas le chiffre exact.

---

## Variante J+30 (fading)

**Même middleware, contraintes ajoutées, sans rouvrir ce corrigé ni le module 12 :**

1. Reproduis `middleware.ts` **de mémoire, en 25 minutes**.
2. Ajoute un **A/B test** au edge sur `/` : si le cookie `ab` est absent, tire `a`/`b` (50/50), fais un `NextResponse.rewrite` de `/` vers `/variant-a` ou `/variant-b` (URL affichée **inchangée**), et **persiste** le tirage dans un cookie `ab` sur la réponse (`response.cookies.set`). Vérifie au `curl` que deux requêtes sans cookie peuvent tomber sur des variantes différentes, et qu'avec `-H "Cookie: ab=a"` on obtient toujours `a`.
3. Ajoute une **vérification de signature** légère au edge avec `crypto.subtle` (HMAC) sur un token en query — **sans** le module node `crypto` (preuve que tu programmes en Web APIs).

**Critère de réussite :** au terminal, tu montres (a) la géo-redirection par header, (b) le gate cookie, (c) l'A/B par `rewrite` + cookie persistant, (d) une vérif HMAC via `crypto.subtle` — le tout sur du code compatible Edge Runtime.

---

## Application TribuZen

Dans `smaurier/tribuzen`, cette couche edge vit devant les pages ISR/SSR :

```
tribuzen/
  web/middleware.ts                  # géo-redirect locale + gate /app (Edge Runtime)
  web/app/api/region/route.ts        # route edge géo, cachée à l'edge
  web/app/[locale]/activites/[slug]/page.tsx  # fiche ISR (module 11), runtime Node
  web/app/(app)/dashboard/page.tsx   # SSR perso (module 10), runtime Node
```

**Différences par rapport au lab :**
- En production, le header géo est **injecté par le CDN** (Vercel/Cloudflare) — pas par `curl -H`. Le code est identique : on lit le header, peu importe qui l'a posé.
- Le gate `/app/*` ne fait qu'un **pré-filtre** (présence du cookie) ; la vérification **cryptographique** de la session se fait ensuite (côté origine, ou au edge via `crypto.subtle` si le secret est distribué).
- Sur Vercel, la géo peut aussi se lire via `geolocation(request)` de `@vercel/functions` (city, region en plus du pays) plutôt que le header brut.

**Commit cible :**
```
feat(edge): middleware géo-redirect locale + gate /app, route edge /api/region cachée
```
