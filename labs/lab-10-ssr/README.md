# Lab 10 — SSR et cache de rendu

> **Outcome :** à la fin, tu sais rendre une page publique **côté serveur** (contenu dans le premier octet), y ajouter un **cache de rendu** en mémoire, et **mesurer** l'effet sur le TTFB avec `curl -w` et l'onglet Network de DevTools (`Server-Timing`, `X-Render-Cache: HIT/MISS`).
> **Vrai outil :** serveur **Express** (TypeScript, lancé avec `tsx`) + `curl -w`/`curl -I` + Chrome DevTools (Network, colonne Waterfall / Timing). Aucun harnais simulé, aucune assertion automatique.
> **Feedback :** le coach valide en session à partir de ce que tu observes (TTFB au MISS vs HIT, en-têtes bruts) — pas de test-runner auto-correcteur.

---

## Énoncé

Tu écris le serveur SSR de la page publique d'une **sortie TribuZen**. Cahier des charges **exact** :

1. `GET /sorties/:slug` **rend le HTML côté serveur** : le titre, la date et le lieu de la sortie sont **dans le premier octet** (visibles sans exécuter de JavaScript), et un `<meta property="og:title">` est présent (aperçu social).
2. Le `fetch` des données de la sortie **simule 120 ms de latence** (API/DB).
3. Un **cache de rendu en mémoire** (clé = `slug`) évite de re-rendre : au 2ᵉ appel du même slug, on ressert le HTML stocké **sans** refetch ni réassemblage.
4. En-têtes attendus sur un HTML public :

   | Situation | En-têtes |
   |---|---|
   | Rendu servi (HIT ou MISS) | `Cache-Control: public, s-maxage=300, max-age=0` + `Vary: Accept-Encoding` |
   | MISS uniquement | `Server-Timing: render;dur=<ms>` + `X-Render-Cache: MISS` |
   | HIT uniquement | `X-Render-Cache: HIT` |
   | slug inconnu (404) | `Cache-Control: no-store` (on ne cache pas un 404) |

5. Tu **mesures** le TTFB avec `curl -w "%{time_starttransfer}"` : le 1ᵉʳ appel (MISS) inclut les 120 ms, le 2ᵉ (HIT) est nettement plus court.

**Contraintes :**
- Tu écris le serveur **complet** depuis le starter — pas de gap-fill.
- Portée **SSR + cache de rendu uniquement.** Pas de streaming (module 13), pas d'ISR/pré-rendu au build (module 11), pas d'edge (module 12).
- Le HTML rendu doit rester **100 % public** (aucune donnée personnelle dedans) → il est légitimement cachable en partagé.
- Tu dois **justifier oralement** : pourquoi `s-maxage=300` **et** `max-age=0` (pas l'inverse), et pourquoi un 404 est en `no-store`.

### Starter minimal

```bash
mkdir tribuzen-ssr-lab && cd tribuzen-ssr-lab
npm init -y
npm i express
npm i -D tsx typescript @types/node @types/express
```

```typescript
// server.ts — STARTER (à compléter)
import express from 'express';

const app = express();

// TODO 1 : fetchSortie(slug) — 120 ms de latence simulée, renvoie {titre,date,lieu} ou null
// TODO 2 : renderSortie(slug) — fetch + assemblage du HTML COMPLET (h1 + og:title)
// TODO 3 : cache de rendu en mémoire (Map slug -> { html, expiresAt }), TTL 5 min
// TODO 4 : GET /sorties/:slug -> HIT ressert sans re-rendre ; MISS rend, mesure, stocke
// TODO 5 : en-têtes (public s-maxage=300 max-age=0, Vary, Server-Timing, X-Render-Cache)

app.listen(3000, () =>
  console.log('http://localhost:3000/sorties/pique-nique-juin'),
);
```

```jsonc
// package.json — ajoute
{
  "scripts": { "dev": "tsx watch server.ts" }
}
```

Lance `npm run dev`, puis inspecte avec `curl` et DevTools > Network.

---

## Étapes (en friction)

1. **Écris `fetchSortie`** — `await new Promise(r => setTimeout(r, 120))` puis renvoie l'objet sortie (au moins le slug `pique-nique-juin`) ou `null`.
2. **Écris `renderSortie`** — assemble une **string HTML complète** : `<!DOCTYPE html>`, `<title>`, `<meta property="og:title">`, un `<h1>` avec le titre, un `<p>` avec date + lieu. **Échappe** les valeurs (`escapeHtml`) avant injection.
3. **Vérifie le SEO à la main** — `curl http://localhost:3000/sorties/pique-nique-juin` (sans `-I`) : le titre doit apparaître **dans le corps HTML brut**, pas seulement dans un `<div>` vide.
4. **Ajoute le cache de rendu** — une `Map`. Au MISS : rends, mesure `renderMs`, stocke `{ html, expiresAt: now + 300_000 }`. Au HIT : ressers `cached.html` sans appeler `renderSortie`.
5. **Pose les en-têtes** — `public, s-maxage=300, max-age=0` + `Vary: Accept-Encoding` dans les deux cas ; `Server-Timing` + `X-Render-Cache: MISS` au MISS ; `X-Render-Cache: HIT` au HIT ; `no-store` sur le 404.
6. **Mesure le TTFB** — deux fois de suite :
   ```
   curl -o NUL -s -w "TTFB=%{time_starttransfer}s  code=%{http_code}\n" http://localhost:3000/sorties/pique-nique-juin
   ```
   (sur macOS/Linux remplace `NUL` par `/dev/null`). Le 1ᵉʳ appel (MISS) ≈ 120 ms de plus que le 2ᵉ (HIT). Confirme aussi `X-Render-Cache` avec `curl -I`.
7. **Observe en DevTools** — recharge la page : dans Network > la requête `/sorties/...` > onglet **Timing**, lis « Waiting for server response » (TTFB). Le panneau **Server-Timing** affiche la phase `render` au MISS.

---

## Corrigé complet commenté

```typescript
// server.ts — CORRIGÉ
import express from 'express';

const app = express();

// ── Données simulées + latence de fetch réaliste (API/DB) ──────────
async function fetchSortie(slug: string) {
  await new Promise((r) => setTimeout(r, 120)); // 120 ms : coût du fetch
  const data: Record<string, { titre: string; date: string; lieu: string }> = {
    'pique-nique-juin': {
      titre: 'Pique-nique de juin',
      date: '2026-06-21',
      lieu: 'Parc de la Tête d\'Or',
    },
  };
  return data[slug] ?? null;
}

// Échappement HTML : indispensable, on injecte des valeurs dans du markup
function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Rendu = fetch + assemblage du HTML COMPLET ─────────────────────
// Le contenu (h1, og:title) est dans le 1er octet → SEO + aperçu social OK.
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
  <!-- Le JS ne fait qu'HYDRATER : le contenu est déjà là sans lui -->
  <script type="module" src="/assets/app.9f8e7d6c.js"></script>
</body>
</html>`;
}

// ── Cache de rendu en mémoire : clé = slug ─────────────────────────
const renderCache = new Map<string, { html: string; expiresAt: number }>();
const TTL_MS = 300_000; // 5 min, cohérent avec s-maxage=300

app.get('/sorties/:slug', async (req, res) => {
  const { slug } = req.params;
  const now = Date.now();

  // En-têtes communs à toute réponse publique cachable
  const publicHeaders = () => {
    // s-maxage=300 : le CDN (cache PARTAGÉ) garde le HTML rendu 5 min.
    // max-age=0    : le navigateur, lui, revalide (le HTML porte l'état de page).
    res.set('Cache-Control', 'public, s-maxage=300, max-age=0');
    res.set('Vary', 'Accept-Encoding');
  };

  // 1) HIT : on ressert le HTML stocké SANS re-rendre (0 ms de CPU de rendu)
  const cached = renderCache.get(slug);
  if (cached && now < cached.expiresAt) {
    publicHeaders();
    res.set('X-Render-Cache', 'HIT');
    return res.type('html').send(cached.html);
  }

  // 2) MISS : on rend (fetch 120 ms + assemblage), on mesure, on stocke
  const start = Date.now();
  const html = await renderSortie(slug);
  const renderMs = Date.now() - start;

  if (!html) {
    // On ne cache JAMAIS un 404 : no-store (sinon on figerait l'absence)
    res.set('Cache-Control', 'no-store');
    return res.status(404).type('html').send('<h1>Sortie introuvable</h1>');
  }

  renderCache.set(slug, { html, expiresAt: now + TTL_MS });
  publicHeaders();
  res.set('X-Render-Cache', 'MISS');
  // Server-Timing : le coût de rendu devient lisible dans l'onglet Timing de DevTools
  res.set('Server-Timing', `render;dur=${renderMs}`);
  res.type('html').send(html);
});

app.listen(3000, () =>
  console.log('http://localhost:3000/sorties/pique-nique-juin'),
);
```

**Pourquoi ce corrigé est correct :**
- Le HTML contient `<h1>` et `og:title` **dans le premier octet** → un robot ou un crawler social lit le contenu sans exécuter de JS. C'est ce que le CSR ne pouvait pas offrir.
- Au **MISS**, le TTFB inclut les 120 ms de `fetchSortie` ; au **HIT**, on saute le fetch **et** l'assemblage → le TTFB s'effondre. C'est exactement l'intérêt du cache de rendu (amortir le CPU de rendu du SSR).
- `s-maxage=300` fait porter le cache par le **CDN** (partagé, un rendu pour tous), `max-age=0` empêche le navigateur de figer le HTML. Inverser (`max-age` long, pas de `s-maxage`) laisserait chaque navigateur figer sa copie sans soulager l'origine.
- Le 404 est en `no-store` : on ne veut pas qu'un slug momentanément absent reste « introuvable » en cache.

**Vérification attendue avec `curl -I` :**
```
$ curl -I http://localhost:3000/sorties/pique-nique-juin      # 1er appel
Cache-Control: public, s-maxage=300, max-age=0
Vary: Accept-Encoding
X-Render-Cache: MISS
Server-Timing: render;dur=12x

$ curl -I http://localhost:3000/sorties/pique-nique-juin      # 2e appel
X-Render-Cache: HIT
                                                             # (pas de Server-Timing)

$ curl -I http://localhost:3000/sorties/inconnue
HTTP/1.1 404 Not Found
Cache-Control: no-store
```

**Vérification attendue du TTFB (`curl -w`) :**
```
$ curl -o NUL -s -w "TTFB=%{time_starttransfer}s\n" http://localhost:3000/sorties/pique-nique-juin
TTFB=0.13x s      # MISS : ~120 ms de fetch + rendu

$ curl -o NUL -s -w "TTFB=%{time_starttransfer}s\n" http://localhost:3000/sorties/pique-nique-juin
TTFB=0.00x s      # HIT : le fetch est sauté → TTFB effondré
```

**Vérification du SEO (contenu dans le 1er octet) :**
```
$ curl -s http://localhost:3000/sorties/pique-nique-juin | Select-String "Pique-nique de juin"
# Le titre APPARAÎT dans le HTML brut (impossible en CSR : <div> vide)
```

---

## Variante J+30 (fading)

**Même objectif, contraintes ajoutées — à reproduire de mémoire, sans rouvrir ce corrigé, en 30 minutes :**

1. Ajoute un **`stale-while-revalidate=60`** aux en-têtes publics et explique oralement ce que le CDN fait entre `s-maxage` (300 s) et `s-maxage + swr` (360 s) — voir module 06.
2. La page affiche désormais un bandeau **« Bonjour Alice »**. **Ne le mets pas dans le HTML SSR.** Garde le corps 100 % public/cachable et expose un `GET /api/me/greeting` en `private, no-store` (renvoie `{ prenom: 'Alice' }`) que le client irait chercher après hydration. Justifie pourquoi cacher « Bonjour Alice » dans le HTML partagé serait une fuite.
3. Ajoute un **compteur de rendus** (`renderCount`) incrémenté uniquement au MISS, exposé via `GET /_stats`. Lance 10 requêtes sur le même slug et vérifie que `renderCount` vaut **1** (le cache a absorbé les 9 autres).
4. **Sans regarder** le module 10 ni ce corrigé.

**Critères de réussite :**
- Les en-têtes publics contiennent `stale-while-revalidate=60`.
- `/api/me/greeting` renvoie `private, no-store` ; aucune donnée personnelle n'est dans le HTML de `/sorties/:slug`.
- Après 10 hits sur le même slug, `/_stats` montre `renderCount = 1`.

---

## Application TribuZen

Dans le repo `smaurier/tribuzen`, ce SSR vit ici :

```
tribuzen/
  ssr/src/routes/sortie.ts          # rendu SSR + cache de rendu (Express) — ce lab
  ssr/src/render/renderSortie.ts    # fetch + assemblage HTML (og:title inclus)
  infra/cdn.rules                   # s-maxage=300 sur /sorties/*, private sur /mon-compte
```

**Différences par rapport au lab :**
- Le cache de rendu en mémoire du lab est **pédagogique** : en production, c'est le **CDN** qui garde le HTML (via `s-maxage`), et éventuellement un cache partagé type Redis en amont de l'origine (module 09). Le serveur pose les en-têtes, le CDN fait le stockage.
- Le corps de la sortie sort **tout** le personnel du HTML : le bandeau connecté est un fragment client appelé en `private` (variante J+30) → le HTML reste 100 % cachable.
- Si le front public migre vers **Next.js 15**, la même logique s'écrit `export const revalidate = 300` + `fetch(..., { next: { revalidate: 300 } })` sur `app/sorties/[slug]/page.tsx`, et `cookies()` reste réservé aux routes de compte (pour les garder dynamiques). En Next 15, ne pas oublier que `fetch` **n'est pas caché par défaut** : le `next.revalidate` est obligatoire pour activer le cache.

**Commit cible :**
```
feat(ssr): page publique de sortie rendue côté serveur (og:title) + cache de rendu s-maxage=300
```
