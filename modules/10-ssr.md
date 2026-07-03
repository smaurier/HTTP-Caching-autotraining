---
titre: SSR et cache de rendu — HTML généré à la requête, mis en cache
cours: 11-http-caching
notions: ["rendu à la requête (SSR)", "CSR vs SSR", TTFB, FCP, "hydration (en survol)", "uncanny valley", "cache de page entière", "cache de fragment", "s-maxage au CDN pour le HTML SSR", "Vary sur le HTML", "Next.js App Router fetch cache", "cache: force-cache", "cache: no-store", "next.revalidate", "route segment dynamic/revalidate", "Full Route Cache", "Data Cache", "pages perso -> private/no-store"]
outcomes:
  - sait expliquer ce que le SSR change au TTFB et au FCP par rapport au CSR
  - sait décider quand un HTML rendu à la requête est cachable (page entière vs fragment)
  - sait poser les bons en-têtes de cache sur du HTML SSR (s-maxage au CDN, Vary, private/no-store pour le perso)
  - sait piloter le cache de rendu de Next.js 15 App Router (fetch force-cache/no-store, next.revalidate, route segment)
prerequis: [00-prerequis-et-vue-ensemble, 01-protocole-http, 02-http2-http3, 03-en-tetes-http, 04-cache-control, 05-etag-validation-conditionnelle, 06-stale-while-revalidate, 07-cache-navigateur, 08-cdn, 09-cache-multi-couches]
next: 11-isr-ssg
libs: [{ name: next, version: "15" }]
tribuzen: rendu SSR de la page publique d'une sortie TribuZen — HTML caché au CDN (s-maxage), en-tête du membre connecté laissé hors cache (private)
last-reviewed: 2026-07
---

# SSR et cache de rendu — HTML généré à la requête, mis en cache

> **Outcomes — tu sauras FAIRE :** expliquer ce que le SSR change au TTFB/FCP face au CSR, décider quand un HTML rendu à la requête est cachable, poser les bons en-têtes de cache sur du HTML SSR, piloter le cache de rendu de Next.js 15 App Router.
> **Difficulté :** :star::star::star:
>
> **Portée :** ce module couvre **uniquement** le SSR (HTML rendu **à la requête**) et la **mise en cache de ce rendu**. Le **pré-rendu au build** (SSG) et sa **régénération incrémentale** (ISR) sont le sujet du **module 11**. Le rendu **à la frontière** (edge) est le **module 12**. Le **streaming** du HTML (Suspense, envoi par morceaux) est le **module 13**. L'`hydration` est traitée **en survol** ici — sa mécanique profonde relève des cours de framework (Vue, React).

## 1. Cas concret d'abord

TribuZen a une page publique par sortie : `/sorties/pique-nique-juin`. Elle doit être **partageable** (aperçu réseaux sociaux, référencée par Google) et **rapide à afficher**. Aujourd'hui elle est en **CSR** (SPA Vite classique). Ce que le serveur envoie :

```html
<!-- Ce que reçoit Google et le premier octet de l'utilisateur -->
<!DOCTYPE html>
<html>
  <head><title>TribuZen</title></head>
  <body>
    <div id="app"></div>                         <!-- vide -->
    <script type="module" src="/assets/app.9f8e7d6c.js"></script>
  </body>
</html>
```

Trois problèmes, le même jour :

1. **SEO nul.** Le robot Google reçoit un `<div id="app">` **vide**. Le titre de la sortie, la date, le lieu ne sont dans le HTML **qu'après** exécution du JavaScript. La page ne remonte pas dans les résultats.
2. **Aperçu social cassé.** Quand on colle le lien dans un message, le crawler qui génère la vignette ne lit **que** le HTML initial → pas de titre, pas d'image. Vignette blanche.
3. **FCP lent.** L'utilisateur voit un écran blanc tant que `app.9f8e7d6c.js` (200 Ko) n'est pas téléchargé **puis** que l'API n'a pas répondu.

La réponse : **rendre le HTML côté serveur** (SSR) pour que le premier octet contienne déjà le contenu, **puis mettre ce HTML en cache** (c'est une page publique, identique pour tous) pour ne pas payer le rendu à chaque visite. Ce module te donne les deux : le rendu à la requête **et** son cache.

---

## 2. Théorie complète, concise

### 2.1 CSR vs SSR : qui assemble le HTML, et quand

| | CSR (SPA) | SSR |
|---|---|---|
| Qui rend le HTML | le **navigateur**, après téléchargement du JS | le **serveur**, à chaque requête |
| Premier octet | HTML **vide** (`<div id="app">`) | HTML **complet** (contenu déjà là) |
| SEO / aperçu social | mauvais (robot voit du vide) | bon (robot voit le contenu) |
| TTFB | rapide (fichier statique) | plus lent (le serveur doit rendre) |
| FCP | tardif (JS + fetch avant tout pixel) | précoce (contenu dans le 1ᵉʳ octet) |
| Charge serveur | faible | plus élevée (CPU de rendu) → **d'où le cache** |

Le SSR **déplace** le rendu : du navigateur (une fois par utilisateur, tard) vers le serveur (une fois par requête, tôt). Le coût déplacé est un coût **CPU serveur** — que le cache de rendu vient précisément amortir.

### 2.2 TTFB et FCP : les deux métriques que le SSR bouge

- **TTFB** (Time To First Byte) : temps entre le début de la navigation et l'arrivée du **premier octet** de la réponse. Le SSR **augmente** le TTFB brut (le serveur prend le temps de rendre) — sauf si le HTML est **caché**, auquel cas le TTFB s'effondre (on sert un HTML déjà prêt). Cible web.dev : **TTFB ≤ 0,8 s** ; au-delà de **1,8 s** c'est mauvais.
- **FCP** (First Contentful Paint) : instant où le premier contenu réel s'affiche. Le SSR **améliore** le FCP : le contenu est dans le premier octet, le navigateur peut peindre **avant** de télécharger et exécuter le JS.

Le compromis SSR se résume ainsi : **on accepte un TTFB un peu plus élevé pour un FCP nettement plus tôt** — et le cache de rendu supprime le surcoût de TTFB.

### 2.3 Hydration — en survol

Le HTML SSR est d'abord **statique** : visible mais inerte (les boutons ne réagissent pas). Le JavaScript client se charge ensuite et **hydrate** la page : il rattache les gestionnaires d'événements au HTML existant pour le rendre interactif.

```
[HTML SSR reçu]  →  [contenu visible mais inerte]  →  [JS chargé + hydraté = interactif]
     FCP tôt              "uncanny valley"                    interactif
```

Entre l'affichage et la fin de l'hydration, la page **ressemble** à une page interactive mais ne l'est pas encore : c'est l'**« uncanny valley »**. Un clic dans cette fenêtre ne fait rien. La mécanique fine de l'hydration (partielle, progressive, resumability) appartient aux cours de framework — **retiens seulement** : SSR = HTML tôt, interactivité un peu plus tard.

### 2.4 Le cœur du module : quand un HTML SSR est-il cachable ?

Un rendu à la requête coûte du CPU. Si **deux requêtes produisent le même HTML**, on ne veut le rendre qu'**une fois** et resservir la copie. La question n'est donc pas « SSR ou pas », mais « ce HTML dépend-il de l'utilisateur ? ».

| Type de page SSR | Même HTML pour tous ? | Cachable ? | Stratégie |
|---|---|---|---|
| Page publique (sortie, article) | oui | **oui, fortement** | `s-maxage` long au CDN |
| Liste/recherche publique | oui, par jeu de paramètres | **oui** | cache par variante (`Vary`/query) |
| Page semi-perso (contenu public + en-tête « Bonjour Alice ») | non en l'état | **partiellement** | cache de **fragment** |
| Dashboard, panier | non (propre à l'utilisateur) | **non** | `private, no-store` |

### 2.5 Cache de page entière (full-page)

Quand tout le HTML est public, on le traite comme n'importe quelle réponse cachable (revois les modules 04, 08, 09) : le **CDN** garde le HTML rendu, l'origine ne rend qu'au premier hit.

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Cache-Control: public, s-maxage=300, max-age=0
Vary: Accept-Encoding
```

- `s-maxage=300` : le CDN sert le HTML rendu pendant 5 min sans toucher l'origine → TTFB quasi statique pour l'utilisateur, CPU de rendu divisé par le nombre de hits.
- `max-age=0` : le navigateur, lui, revalide (le HTML porte l'état de la page, on ne veut pas qu'il fige une version).
- On peut ajouter `stale-while-revalidate=60` (module 06) pour que le CDN serve du légèrement périmé pendant qu'il régénère en arrière-plan.

### 2.6 `Vary` sur le HTML SSR — une entrée de cache par variante

Le HTML rendu peut légitimement différer selon quelques axes. Le CDN a besoin de `Vary` pour ne pas servir la mauvaise variante :

```http
Vary: Accept-Encoding, Accept-Language
```

- `Accept-Encoding` : variante compressée vs non compressée.
- `Accept-Language` : HTML en français vs anglais → deux entrées de cache légitimes.

Deux `Vary` **interdits** sur du HTML SSR public : `Vary: *` (désactive tout cache) et surtout **`Vary: Cookie`** — une entrée de cache **par utilisateur**, donc aucun partage : le cache ne sert plus à rien. Si la page dépend d'un cookie de session, ce n'est plus une page cachable en cache **partagé** (voir 2.8).

### 2.7 Cache de fragment — la page mi-publique mi-personnalisée

Le cas le plus fréquent : la page de sortie est **publique à 90 %**, mais l'en-tête affiche « Bonjour Alice » et son avatar. On ne veut ni tout jeter, ni cacher le nom d'Alice pour le servir à Bob.

Trois stratégies, de la plus simple à la plus fine :

1. **Sortir le perso du HTML SSR.** Le serveur rend un en-tête **générique** (« Se connecter »). Le nom/avatar est injecté **côté client** après hydration, via un appel API `private`. Le HTML SSR redevient 100 % public → cachable en page entière. **C'est la stratégie par défaut recommandée.**
2. **Cache de fragment.** Le HTML public (corps de la sortie) est caché ; le fragment perso (`GET /api/me/greeting`, `private, no-store`) est demandé à part et assemblé. Le corps profite du `s-maxage`, le fragment reste hors cache partagé.
3. **Edge-Side Includes (ESI).** Le CDN assemble lui-même `<esi:include src="/fragment/greeting"/>` : corps public caché, fragment perso non caché. Puissant mais spécifique au CDN — à ne poser que si le volume le justifie.

Fil conducteur : **on ne cache que ce qui est identique pour tous ; on isole le personnel dans un fragment `private`.**

### 2.8 Ce qu'on ne cache jamais (rappel appliqué au HTML)

Un HTML SSR qui contient une donnée propre à l'utilisateur ne doit **jamais** entrer dans un cache **partagé** :

```http
Cache-Control: private, no-store
```

- Dashboard, panier, page de compte → `private` (jamais de CDN) + souvent `no-store` (rien sur le disque).
- Un **token CSRF** dans le HTML → catastrophe s'il est mis en cache partagé : il serait servi à un autre utilisateur. `no-store` obligatoire.

### 2.9 SSR piloté par framework : Next.js 15 App Router

Écrire un serveur SSR à la main (section 3) éclaire le mécanisme, mais en pratique un framework le fait. Next.js (App Router) est le cas de référence en entretien. **Deux notions à bien dissocier, vérifiées sur la doc officielle (Next 15) :**

> **1) Donnée.** Par défaut, dans Next 15, `fetch()` **n'est PAS mis dans le Data Cache** (changement vs Next 13/14 où il l'était). Le résultat du `fetch` n'est donc pas mémorisé d'une requête à l'autre : on active ce cache **explicitement**.
> **2) Rendu.** Un `fetch` non caché **ne rend PAS la route dynamique** pour autant. La route est toujours **prérendue statiquement au build** (le `fetch` s'exécute **une fois au build**). Ce qui bascule une route en **DYNAMIQUE** (rendue à chaque requête), c'est autre chose : une **API de requête** (`cookies()`/`headers()`/`searchParams`), `cache: 'no-store'`, `next: { revalidate: 0 }`, ou `export const dynamic = 'force-dynamic'`.

Autrement dit : « `fetch` non mis en Data Cache » ≠ « route rendue dynamiquement ». Les trois leviers de cache de rendu :

**a) Au niveau du `fetch` (Data Cache) :**

```tsx
// Donnée NON mise en Data Cache (défaut Next 15) : le fetch s'exécute au build,
// puis à chaque revalidation — mais la route reste prérendue statiquement.
const live = await fetch('https://api.tribuzen.app/sorties/42')

// Opt-in cache : ce fetch est mémorisé (Data Cache)
const stable = await fetch('https://api.tribuzen.app/sorties/42', {
  cache: 'force-cache',
})

// Cache avec revalidation temporelle : re-fetch au plus toutes les 60 s
const revalidated = await fetch('https://api.tribuzen.app/sorties/42', {
  next: { revalidate: 60 },
})

// Jamais caché, explicite
const always = await fetch('https://api.tribuzen.app/me', {
  cache: 'no-store',
})
```

**b) Au niveau du segment de route (Full Route Cache) :**

```tsx
// app/sorties/[slug]/page.tsx
export const dynamic = 'force-dynamic'  // toujours SSR à la requête, aucune mise en cache
// ou
export const revalidate = 60            // le rendu de la route est caché et revalidé toutes les 60 s
```

- **Full Route Cache** : Next peut cacher le **résultat rendu** (HTML + payload RSC) d'une route.
- **Data Cache** : Next cache le **résultat des `fetch`** opt-in, indépendamment de la route.

**c) Dynamique automatique.** Lire une **API de requête** — `cookies()`, `headers()`, `searchParams` — bascule la route en **dynamique** : elle est rendue à chaque requête, jamais cachée. C'est l'équivalent Next de notre règle 2.8 : dès que le rendu dépend de l'utilisateur, pas de cache.

> **Frontière de portée :** `next: { revalidate: N }` est un cache **de rendu avec péremption** — proche parent de l'ISR. Ici on l'utilise comme **cache d'un rendu à la requête**. La **régénération incrémentale de pages pré-rendues au build** (`generateStaticParams`, `revalidateTag`/`revalidatePath` sur du statique) est traitée au **module 11**.

---

## 3. Worked examples

### Exemple 1 — Un serveur SSR minimal, avec et sans cache de rendu (Express)

On rend la page de sortie TribuZen côté serveur, puis on ajoute un cache de rendu en mémoire pour ne pas re-rendre à chaque hit. C'est le vrai outil du lab.

```typescript
// server.ts — SSR + cache de rendu (Express, TypeScript, lancé avec tsx)
import express from 'express';

const app = express();

// "Base de données" simulée + latence de fetch réaliste
async function fetchSortie(slug: string) {
  await new Promise((r) => setTimeout(r, 120)); // 120 ms : fetch API/DB
  const data: Record<string, { titre: string; date: string; lieu: string }> = {
    'pique-nique-juin': { titre: 'Pique-nique de juin', date: '2026-06-21', lieu: 'Parc de la Tête d\'Or' },
  };
  return data[slug] ?? null;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Rendu = fetch + assemblage du HTML complet (le contenu est DANS le 1er octet)
async function renderSortie(slug: string): Promise<string | null> {
  const s = await fetchSortie(slug);
  if (!s) return null;
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(s.titre)} — TribuZen</title>
  <meta property="og:title" content="${escapeHtml(s.titre)}">
</head>
<body>
  <main>
    <h1>${escapeHtml(s.titre)}</h1>
    <p>Le ${escapeHtml(s.date)} — ${escapeHtml(s.lieu)}</p>
  </main>
  <script type="module" src="/assets/app.9f8e7d6c.js"></script>
</body>
</html>`;
}

// Cache de rendu en mémoire : clé = slug, valeur = { html, expiresAt }
const renderCache = new Map<string, { html: string; expiresAt: number }>();
const TTL_MS = 300_000; // 5 min, cohérent avec s-maxage=300

app.get('/sorties/:slug', async (req, res) => {
  const { slug } = req.params;
  const now = Date.now();

  // 1) HIT ? on ressert sans re-rendre (0 ms de CPU de rendu)
  const cached = renderCache.get(slug);
  if (cached && now < cached.expiresAt) {
    res.set('Cache-Control', 'public, s-maxage=300, max-age=0');
    res.set('Vary', 'Accept-Encoding');
    res.set('X-Render-Cache', 'HIT');
    return res.type('html').send(cached.html);
  }

  // 2) MISS : on rend (fetch + assemblage), on mesure, on stocke
  const start = Date.now();
  const html = await renderSortie(slug);
  const renderMs = Date.now() - start;

  if (!html) {
    res.set('Cache-Control', 'no-store'); // ne pas cacher un 404
    return res.status(404).type('html').send('<h1>Sortie introuvable</h1>');
  }

  renderCache.set(slug, { html, expiresAt: now + TTL_MS });
  res.set('Cache-Control', 'public, s-maxage=300, max-age=0');
  res.set('Vary', 'Accept-Encoding');
  res.set('X-Render-Cache', 'MISS');
  res.set('Server-Timing', `render;dur=${renderMs}`); // TTFB visible en DevTools
  res.type('html').send(html);
});

app.listen(3000, () => console.log('http://localhost:3000/sorties/pique-nique-juin'));
```

**Pourquoi c'est correct :**
- Le HTML contient déjà `<h1>` et `og:title` → SEO et aperçu social réparés (problèmes 1 et 2 du §1).
- Au **MISS**, le TTFB inclut les 120 ms de `fetchSortie`. Au **HIT**, on saute le fetch et l'assemblage : le TTFB s'effondre → c'est tout l'intérêt du cache de rendu.
- `s-maxage=300` fait porter le cache par le **CDN** (partagé) ; `max-age=0` empêche le navigateur de figer la page. `Server-Timing` rend le coût de rendu lisible dans l'onglet Network.

### Exemple 2 — La même page en Next.js 15, cachée puis rendue dynamique

```tsx
// app/sorties/[slug]/page.tsx — page publique, rendu caché + revalidé
// Le rendu de cette route est mis en cache et revalidé toutes les 5 min.
export const revalidate = 300;

export default async function SortiePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // fetch avec revalidation : Data Cache actif, re-fetch au plus toutes les 300 s.
  // Sans cette option, en Next 15, le fetch ne serait PAS mis en Data Cache
  // (mais la route resterait prérendue statiquement — un fetch non caché ne la rend pas dynamique).
  const res = await fetch(`https://api.tribuzen.app/sorties/${slug}`, {
    next: { revalidate: 300 },
  });
  const sortie = await res.json();

  return (
    <main>
      <h1>{sortie.titre}</h1>
      <p>Le {sortie.date} — {sortie.lieu}</p>
    </main>
  );
}
```

```tsx
// app/mon-compte/page.tsx — page perso : dynamique, jamais cachée
import { cookies } from 'next/headers';

export default async function ComptePage() {
  // Lire cookies() bascule AUTOMATIQUEMENT la route en dynamique (SSR à chaque requête).
  const session = (await cookies()).get('session')?.value;

  // no-store explicite : ce fetch n'entre ni dans le Data Cache ni dans un cache partagé.
  const res = await fetch('https://api.tribuzen.app/me', {
    headers: { Authorization: `Bearer ${session}` },
    cache: 'no-store',
  });
  const me = await res.json();

  return <h1>Bonjour {me.prenom}</h1>;
}
```

**Ce que Next fait, mappé sur notre théorie :**
- `SortiePage` : `revalidate = 300` + `next: { revalidate: 300 }` → Full Route Cache + Data Cache actifs. Équivaut à notre `s-maxage=300` de l'exemple 1, mais géré par le framework.
- `ComptePage` : l'appel à `cookies()` rend la route dynamique ; `cache: 'no-store'` confirme qu'aucune donnée personnelle n'est cachée. C'est la règle 2.8 appliquée par Next.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Croire que « SSR » veut dire « plus rapide » partout

```
❌ "On passe en SSR, tout ira plus vite."
```

Le SSR **augmente** le TTFB brut (le serveur rend au lieu de servir un fichier statique). Ce qu'il améliore, c'est le **FCP** et le **SEO**. Le TTFB ne redevient bon **que** si le HTML est caché.

```
✅ SSR améliore FCP/SEO ; le TTFB reste bon UNIQUEMENT avec un cache de rendu (s-maxage / revalidate).
```

**Règle :** SSR sans cache = TTFB qui grimpe sous charge. Le cache de rendu n'est pas optionnel, c'est le complément du SSR.

### PIÈGE #2 — Cacher en partagé un HTML qui contient du perso

```http
❌ Cache-Control: public, s-maxage=300   # sur une page affichant "Bonjour Alice"
```

Le CDN met la page d'Alice en cache partagé et la sert à Bob. Fuite de données (nom, avatar, parfois plus).

```http
✅  Corps public → public, s-maxage=300   ; fragment perso → private, no-store (isolé, appelé à part)
```

**Règle :** on ne cache en partagé **que** ce qui est identique pour tous. Le perso sort dans un fragment `private`.

### PIÈGE #3 — `Vary: Cookie` pour « gérer » les pages connectées

```http
❌ Cache-Control: public, s-maxage=300
   Vary: Cookie
```

Chaque utilisateur a un cookie différent → une **entrée de cache par utilisateur** → taux de hit ≈ 0. Le cache ne sert à rien tout en donnant l'illusion d'exister.

```http
✅  Page dépendant du cookie → private, no-store (ou sortir le perso en fragment)
```

**Règle :** si le HTML dépend d'un cookie de session, ce n'est pas une page à cacher en partagé.

### PIÈGE #4 — Confondre « `fetch()` non caché » et « route rendue dynamiquement » (Next 15)

```tsx
❌ // "fetch sans option en Next 15 → route dynamique, SSR à chaque requête" — FAUX
const data = await fetch('https://api.tribuzen.app/sorties/42');
```

Deux choses distinctes. **(1) Donnée :** depuis Next 15, un `fetch` **sans option n'est plus mis dans le Data Cache** (il l'était en Next 13/14) — son résultat n'est pas mémorisé. **(2) Rendu :** ce même `fetch` non caché **ne rend PAS la route dynamique** — la route reste **prérendue statiquement au build** (le `fetch` s'exécute une fois au build). Beaucoup de code copié d'anciens tutoriels confond les deux.

```tsx
// Opt-in Data Cache (la donnée est mémorisée / revalidée) — le rendu reste statique :
✅ const data = await fetch('https://api.tribuzen.app/sorties/42', { cache: 'force-cache' });
✅ const data = await fetch('https://api.tribuzen.app/sorties/42', { next: { revalidate: 300 } });
```

**Règle :** en Next 15, le cache de **données** est opt-in explicite (`force-cache` ou `next.revalidate`). Ce qui rend une **route** dynamique, c'est une API de requête (`cookies()`/`headers()`/`searchParams`), `cache: 'no-store'`, `revalidate: 0` ou `force-dynamic` — pas un simple `fetch` non caché.

### PIÈGE #5 — `cookies()` / `headers()` posés « au cas où » dans une page qu'on voulait cacher

```tsx
❌ export const revalidate = 300;      // on croit cacher la route...
import { headers } from 'next/headers';
export default async function Page() {
  const ua = (await headers()).get('user-agent'); // ...mais ceci la rend dynamique
  // ...
}
```

Lire `headers()`/`cookies()` bascule la route en **dynamique** : le `revalidate` est ignoré, la page est rendue à chaque requête.

```tsx
✅  Ne lis les API de requête que si le rendu en dépend vraiment. Sinon, la route reste cachable.
```

**Règle :** toute lecture d'API de requête = route dynamique. C'est voulu pour le perso, subi si c'est un oubli.

---

## 5. Ancrage TribuZen

La page publique d'une sortie est le premier écran SSR de TribuZen — c'est le cas concret du §1, résolu.

| Élément | Rendu | Cache |
|---|---|---|
| `GET /sorties/:slug` (corps public) | SSR à la requête | `public, s-maxage=300, max-age=0` + `Vary: Accept-Encoding` |
| En-tête « Bonjour Alice » + avatar | hors HTML SSR (fragment client) | `GET /api/me/greeting` → `private, no-store` |
| `GET /mon-compte` (dashboard) | SSR dynamique | `private, no-store` (jamais de CDN) |
| Liste publique `GET /sorties?ville=lyon` | SSR à la requête | caché par variante de query, `s-maxage` court |

Décisions d'architecture :
- **La page de sortie sort le personnel du HTML.** Le corps (titre, date, lieu, description) est identique pour tous → caché au CDN 5 min. Le bandeau connecté est injecté côté client après hydration via un appel `private`. On garde ainsi un HTML 100 % cachable **et** un SEO/aperçu social corrects.
- **Le TTFB est surveillé** : `Server-Timing: render;dur=…` sur les MISS, `X-Render-Cache: HIT|MISS` pour vérifier le taux de hit du CDN en préproduction.
- **Version Next.js** (si TribuZen migre le front public vers Next 15) : `revalidate = 300` sur `app/sorties/[slug]/page.tsx`, `cookies()` réservé aux routes de compte pour les garder dynamiques.

Fichiers cibles dans `smaurier/tribuzen` :
```
tribuzen/
  ssr/src/routes/sortie.ts          # rendu SSR + cache de rendu (Express) — Exemple 1
  ssr/src/render/renderSortie.ts    # fetch + assemblage HTML (og:title inclus)
  infra/cdn.rules                   # s-maxage=300 sur /sorties/*, private sur /mon-compte
```

---

## 6. Points clés

1. Le SSR rend le HTML **à la requête** : le contenu est dans le premier octet → SEO et aperçu social corrects, **FCP précoce**.
2. Le SSR **augmente le TTFB brut** ; il ne redevient bon **qu'avec un cache de rendu** (`s-maxage` au CDN, ou `revalidate` côté framework).
3. L'**hydration** rend le HTML SSR interactif après coup — entre les deux, l'« uncanny valley » : visible mais inerte.
4. On ne cache en **partagé** que ce qui est **identique pour tous** : page entière si publique, sinon **cache de fragment** (le perso sort dans un fragment `private`).
5. `Vary: Accept-Encoding`/`Accept-Language` = variantes légitimes ; **`Vary: Cookie` et `Vary: *` tuent le cache** — page dépendant du cookie → `private, no-store`.
6. Next 15 : `fetch()` **n'est plus caché par défaut** — opt-in via `cache: 'force-cache'` ou `next: { revalidate: N }` ; `revalidate`/`dynamic` pilotent le Full Route Cache.
7. Lire `cookies()`/`headers()` rend une route Next **dynamique** (jamais cachée) — équivalent framework de la règle « pas de cache partagé pour le perso ».

---

## 7. Seeds Anki

```
Le SSR rend-il une page « plus rapide » ? Sur quelle métrique exactement ?|Le SSR améliore le FCP et le SEO (le contenu est dans le premier octet). Il AUGMENTE le TTFB brut (le serveur rend au lieu de servir un statique). Le TTFB ne redevient bon qu'avec un cache de rendu (s-maxage au CDN / revalidate). SSR ≠ « plus rapide partout ».
Pourquoi un HTML SSR public se cache-t-il avec s-maxage=300, max-age=0 ?|s-maxage=300 fait porter le cache par le CDN (partagé) : l'origine ne rend qu'au premier hit, TTFB quasi statique pour l'utilisateur. max-age=0 empêche le navigateur de figer sa propre copie du HTML (qui porte l'état de la page).
Comment cacher une page SSR à la fois publique et personnalisée (« Bonjour Alice ») ?|On sort le perso du HTML SSR : le corps public est rendu et caché (s-maxage), le nom/avatar est injecté côté client via un appel API private (cache de fragment). Alternative : ESI, où le CDN assemble corps public caché + fragment perso non caché.
Pourquoi Vary: Cookie est-il un anti-pattern sur du HTML SSR à cacher ?|Chaque utilisateur a un cookie différent → une entrée de cache par utilisateur → taux de hit ≈ 0. Le cache ne partage plus rien. Si la page dépend du cookie de session, elle n'est pas cachable en cache partagé : private, no-store.
Quel est le défaut de cache de fetch() dans Next 15 App Router, et rend-il la route dynamique ?|fetch() n'est PAS mis dans le Data Cache par défaut (changement vs Next 13/14) : son résultat n'est pas mémorisé. Mais un fetch non caché NE rend PAS la route dynamique — elle reste prérendue statiquement au build (le fetch s'exécute une fois au build). On active le Data Cache explicitement : cache: 'force-cache' ou next: { revalidate: N }. Ce qui rend une route dynamique = cookies()/headers()/searchParams, cache: 'no-store', revalidate: 0 ou force-dynamic.
Que se passe-t-il si on lit cookies() ou headers() dans une page Next qu'on voulait cacher ?|La route bascule automatiquement en dynamique : rendue à chaque requête, jamais cachée. Un export revalidate est alors ignoré. C'est voulu pour le perso, mais un oubli casse le cache d'une page publique.
Qu'est-ce que l'« uncanny valley » de l'hydration ?|La fenêtre entre l'affichage du HTML SSR (visible) et la fin de l'hydration (interactif). La page ressemble à une page interactive mais ne l'est pas : un clic ne fait rien tant que le JS n'a pas rattaché les gestionnaires d'événements.
Différence entre Full Route Cache et Data Cache dans Next.js ?|Data Cache : cache le résultat des fetch opt-in (cache: 'force-cache' ou next.revalidate), indépendamment de la route. Full Route Cache : cache le résultat rendu d'une route (HTML + payload RSC), piloté par revalidate/dynamic sur le segment.
```

---

## Pont vers le lab

> Lab associé : `11-http-caching/labs/lab-10-ssr/README.md`. Construire un vrai serveur SSR Express qui rend la page publique d'une sortie TribuZen (contenu dans le premier octet), y ajouter un cache de rendu en mémoire, puis mesurer l'effet sur le TTFB avec `curl -w` et l'onglet Network de DevTools (`Server-Timing`, `X-Render-Cache: HIT/MISS`).
