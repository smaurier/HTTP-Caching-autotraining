---
titre: Projet final — optimiser la chaîne de cache TribuZen de bout en bout
cours: 11-http-caching
notions: [audit de performance end-to-end, chaîne de cache multi-couches, "en-têtes Cache-Control et ETag", stratégies de rendu SSR/ISR/SSG, invalidation en cascade, "cache stampede et stale-while-revalidate", "Core Web Vitals (LCP/INP/CLS)", budgets de performance]
outcomes:
  - sait auditer la chaîne de cache d'une app réelle (curl -I, DevTools, Lighthouse)
  - sait choisir la bonne stratégie de rendu et de cache par type de contenu
  - sait invalider un cache multi-couches sans servir de contenu périmé
  - sait relier chaque optimisation de cache à un Core Web Vital mesurable
prerequis: [00-prerequis-et-vue-ensemble, 04-cache-control, 05-etag-validation-conditionnelle, 06-stale-while-revalidate, 08-cdn, 09-cache-multi-couches, 11-isr-ssg, 14-performance-web, 15-pwa-service-workers]
next: fin-parcours-11-http-caching
libs: []
tribuzen: chaîne de cache TribuZen de bout en bout — CDN avatars, ISR pages sorties, cache API feed, SW offline, budgets Core Web Vitals
last-reviewed: 2026-07
---

# Projet final — optimiser la chaîne de cache TribuZen de bout en bout

> **Outcomes — tu sauras FAIRE :** auditer la chaîne de cache complète d'une app réelle (`curl -I`, DevTools Network/Application, Lighthouse), choisir la stratégie de rendu et de cache par type de contenu, invalider un cache multi-couches sans régression, et relier chaque optimisation à un Core Web Vital mesuré.
> **Difficulté :** :star::star::star::star::star:

## 1. Cas concret d'abord

Vendredi, 16 h. Un beta-testeur TribuZen poste dans le canal support :

> « L'app rame. La page d'une sortie familiale met 3-4 secondes à s'afficher, les avatars clignotent à chaque navigation, et quand je reviens sur le feed il recharge tout. Sur mon 4G dans le train c'est inutilisable. »

Tu ouvres les DevTools et tu confirmes, chiffres à l'appui :

- **LCP à 4,1 s** sur `/sorties/:id` — au-dessus du seuil « poor » (> 4 s).
- Chaque avatar repart en `200 OK` du serveur au lieu d'un `304` ou d'un hit disque — regarde la colonne **Size** de l'onglet Network : `12,4 kB` à chaque fois, jamais `(disk cache)`.
- La réponse HTML de la page sortie sort en `Cache-Control: no-store` — le CDN ne la garde pas, chaque visiteur tape l'origine.
- L'API `/api/feed` répond sans aucun en-tête de cache : le feed refait un aller-retour complet à chaque retour sur l'onglet.

Personne n'a « cassé » quelque chose. Simplement, personne n'a **conçu** la chaîne de cache. Ton job dans ce module de clôture : reprendre TribuZen couche par couche — navigateur, Service Worker, CDN, cache applicatif, origine — poser la bonne stratégie sur chaque type de contenu, et **prouver** l'amélioration avec Lighthouse avant/après.

Tu ne vas rien apprendre de neuf ici. Tu vas **assembler** les 17 modules précédents en une décision d'architecture cohérente. C'est exactement le livrable qu'on attend d'un dev senior face à une app lente.

## 2. Théorie complète, concise

### 2.1 La méthode : mesurer → décider → invalider → re-mesurer

On n'optimise jamais à l'aveugle. La boucle canonique :

1. **Mesurer** l'existant : `curl -I` sur chaque type de ressource, onglet Network (colonnes Size/Time/Cache), Lighthouse (LCP/INP/CLS + TTFB).
2. **Classer** chaque ressource par volatilité (immuable / semi-statique / personnalisée / temps réel).
3. **Décider** la stratégie de rendu + les en-têtes de cache par classe (§2.3).
4. **Invalider** proprement quand la donnée change (§2.4).
5. **Re-mesurer** et comparer. Une optimisation non mesurée n'existe pas.

### 2.2 Rappel de la chaîne (modules 04-09)

Une requête traverse jusqu'à cinq couches de cache. Chacune a **sa** clé, **son** TTL, **son** mode d'invalidation.

```
Navigateur (Cache-Control, ETag, Service Worker)
   │  miss / revalidation
   ▼
CDN Edge (s-maxage, stale-while-revalidate, purge par tag)
   │  miss
   ▼
Reverse proxy / ISR (régénération incrémentale)
   │  miss
   ▼
Cache applicatif (Map/LRU, Redis)
   │  miss
   ▼
Base de données (origine)
```

Deux directives structurent tout le reste :

- `max-age` = fraîcheur pour le **cache privé** (navigateur).
- `s-maxage` = fraîcheur pour le **cache partagé** (CDN). Il l'emporte sur `max-age` côté CDN.

`ETag` + `If-None-Match` permet la **revalidation** : quand le cache est périmé, le client demande « toujours bon ? », le serveur répond `304 Not Modified` (corps vide) si rien n'a changé — on économise la bande passante sans se fier aveuglément au TTL.

### 2.3 La matrice de décision par type de contenu

C'est le cœur du projet : associer chaque ressource TribuZen à une stratégie.

| Contenu TribuZen | Rendu | Navigateur | CDN | Pourquoi |
|------------------|-------|-----------|-----|----------|
| Bundle JS/CSS hashé (`app.9f3a.js`) | build | `max-age=31536000, immutable` | `max-age=1 an` | L'URL change à chaque build → cache éternel sans risque |
| Avatar / image de sortie | statique | `max-age=86400` | `s-maxage=604800` | Change rarement ; purge on-demand si upload |
| Page d'accueil marketing | SSG | `no-cache` + ETag | `s-maxage=300, swr=3600` | Identique pour tous, régénérée rarement |
| Page sortie `/sorties/:id` | ISR | `no-cache` + ETag | `s-maxage=60, swr=600` | Semi-dynamique ; SWR absorbe les pics |
| API feed `/api/feed` | SSR + cache court | `no-cache` | `s-maxage=30, swr=300` | Varie souvent mais tolère 30 s de fraîcheur |
| Dashboard famille (données perso) | SSR dynamique | `private, no-store` | **PAS DE CACHE** | Personnalisé → jamais sur un cache partagé |

**Règle d'or de sécurité** : tout ce qui est personnalisé (session, panier, données famille privées) porte `private, no-store` **et** un `Vary: Cookie, Authorization`. Une seule fuite de cette page dans le CDN = données d'un membre servies à un autre.

### 2.4 Invalidation multi-couches : de l'intérieur vers l'extérieur

Quand une sortie est modifiée dans le back-office, il faut purger dans **cet ordre** :

1. **Origine / DB** — écrire la nouvelle donnée.
2. **Cache applicatif** — purger la clé `page:sortie:xxx`.
3. **CDN** — purger par cache tag (`sortie:xxx`).
4. **Navigateur** — impossible à purger directement. Solution : `no-cache` + ETag force une revalidation au prochain accès (le serveur renverra un nouvel ETag), ou URL versionnée pour les assets.

**Le piège fatal** : purger le CDN *avant* le cache applicatif. Le CDN re-fetch immédiatement, tape le cache applicatif encore périmé, et **re-cache l'ancienne version**. Toujours purger du plus proche de l'origine vers le plus proche de l'utilisateur.

### 2.5 Cache stampede & stale-while-revalidate (rappel module 06)

Une page ISR virale expire à t=60 s. À t=61 s, 10 000 requêtes arrivent :

- **Sans SWR** : toutes voient un cache expiré → 10 000 misses → 10 000 régénérations simultanées → l'origine s'écroule (« thundering herd »).
- **Avec `stale-while-revalidate=600`** : toutes reçoivent la version périmée (rapide), **une seule** requête de revalidation part vers l'origine, le cache se met à jour en arrière-plan. Zéro pic.

C'est la directive qui rend l'ISR robuste en production.

### 2.6 Relier cache et Core Web Vitals (rappel module 14)

L'optimisation de cache n'est pas une fin — c'est un levier sur des métriques mesurées (seuils web.dev) :

| Métrique | « good » | Levier cache |
|----------|----------|--------------|
| **TTFB** | < 800 ms | CDN hit + `s-maxage` → réponse depuis l'edge, pas l'origine |
| **LCP** | < 2,5 s | Image LCP en cache long + `preload` + `fetchpriority="high"` |
| **INP** | < 200 ms | JS hashé `immutable` → pas de re-download → main thread libre |
| **CLS** | < 0,1 | `width`/`height` sur images cachées → pas de reflow au chargement |

Le lien direct : un CDN hit fait chuter le TTFB, et **LCP contient TTFB**. Cacher l'image hero de la page sortie déplace directement le LCP sous 2,5 s.

## 3. Worked examples

### Exemple 1 — Auditer la page sortie avec `curl -I`

On inspecte les en-têtes réels sans télécharger le corps (`-I` = HEAD) :

```bash
# 1er appel : on lit la stratégie de cache annoncée
curl -sI https://tribuzen.app/sorties/rando-vercors

# Réponse observée AVANT optimisation :
# HTTP/2 200
# content-type: text/html; charset=utf-8
# cache-control: no-store          ← problème : le CDN ne garde rien
# (pas d'ETag, pas d'Age, pas de x-cache)
```

Le diagnostic est immédiat : `no-store` sur une page semi-statique = chaque visiteur tape l'origine, TTFB élevé. On corrige côté serveur :

```
cache-control: public, max-age=0, s-maxage=60, stale-while-revalidate=600
etag: "a1b2c3d4"
```

Puis on re-mesure et on vérifie que le CDN sert bien la ressource au 2ᵉ appel :

```bash
curl -sI https://tribuzen.app/sorties/rando-vercors | grep -i -E 'cache|age|etag'
# cache-control: public, max-age=0, s-maxage=60, stale-while-revalidate=600
# etag: "a1b2c3d4"
# age: 12                          ← servi depuis le CDN (12 s dans le cache)
# x-cache: HIT

# Revalidation conditionnelle : on renvoie l'ETag, on doit recevoir 304
curl -sI https://tribuzen.app/sorties/rando-vercors \
  -H 'If-None-Match: "a1b2c3d4"'
# HTTP/2 304                       ← Not Modified, corps vide, économie réseau
```

**Lecture :** `age: 12` + `x-cache: HIT` prouvent que le CDN répond à la place de l'origine. Le `304` prouve que la revalidation par ETag fonctionne — le navigateur garde sa copie au lieu de re-télécharger.

### Exemple 2 — Auditer les assets dans DevTools puis budgétiser

Dans l'onglet **Network** de DevTools, colonne **Size**, on distingue :

- `(disk cache)` / `(memory cache)` → servi localement, zéro octet réseau — **objectif**.
- `304` → revalidé, en-têtes seulement, corps non re-téléchargé.
- Une taille en kB (ex. `12.4 kB`) → **re-téléchargé** — cache absent ou périmé.

Constat avant : les avatars sortent en `12.4 kB` à chaque navigation → aucun `Cache-Control`. Correction : `Cache-Control: max-age=86400` sur `/avatars/*`. Après rechargement, ils passent en `(disk cache)`.

On formalise ensuite un **budget de performance** — une limite qu'on refuse de dépasser :

```
Budget TribuZen (page sortie, mobile 4G) :
  LCP    ≤ 2.5 s     (actuel après fix : 2.1 s ✅)
  INP    ≤ 200 ms
  CLS    ≤ 0.1
  TTFB   ≤ 200 ms    (CDN hit)
  Poids JS transféré ≤ 300 kB (hors cache)
  Cache hit rate CDN ≥ 70 %
```

Lighthouse en mode « Mobile / Slow 4G » donne le verdict avant/après. On archive les deux rapports pour prouver le gain au chef produit.

## 4. Pièges & misconceptions

### PIÈGE #1 — Croire que `Cache-Control: no-cache` = « ne pas cacher »

`no-cache` **autorise** le stockage mais impose une **revalidation** avant chaque réutilisation (l'ETag décidera). Ce qui interdit tout stockage, c'est `no-store`. Mettre `no-cache` sur une page publique + ETag est excellent (revalidation cheap). Mettre `no-store` sur cette même page tue le CDN inutilement.

### PIÈGE #2 — Personnaliser une réponse mise en cache partagé

```
# ❌ Page dashboard avec données famille, mais cache partagé
cache-control: public, s-maxage=60
# → le CDN sert la page d'Alice à Bob. Fuite de données.

# ✅ Contenu personnalisé = jamais de cache partagé
cache-control: private, no-store
vary: Cookie, Authorization
```

`private` interdit les caches partagés (CDN, proxy) mais autorise le navigateur. Pour des données sensibles, ajouter `no-store`.

### PIÈGE #3 — Invalider le CDN avant le cache applicatif

Voir §2.4. Purger de l'extérieur vers l'intérieur re-cache l'ancienne version. Sens correct : **origine → app → CDN → (navigateur via revalidation)**.

### PIÈGE #4 — Optimiser sans re-mesurer

« J'ai ajouté `s-maxage`, ça doit aller mieux. » Sans Lighthouse avant/après ni vérification du `x-cache: HIT`, tu ne sais rien. Un `Vary: Cookie` mal placé, une query string aléatoire (`?t=timestamp`), ou un cookie qui varie la réponse peuvent réduire le hit rate à ~0 % malgré des en-têtes « corrects ». **La preuve, c'est la mesure**, pas l'intention.

### PIÈGE #5 — Confondre TTL long et `immutable`

`max-age=31536000` seul autorise quand même une **revalidation** au rechargement (F5). `immutable` dit au navigateur « ne revalide jamais, même sur reload ». Réservé aux assets à URL hashée (le hash change si le contenu change). Le poser sur une ressource dont l'URL est stable = servir de l'obsolète pendant un an.

## 5. Ancrage TribuZen

Ce module est le **livrable d'intégration** : tu appliques la matrice §2.3 sur l'app réelle. Cartographie cible de la chaîne de cache TribuZen :

```
tribuzen/
  public/
    avatars/*                 ← max-age=86400 (nav) / s-maxage=7j (CDN), purge à l'upload
  app/
    (marketing)/page.tsx      ← SSG, s-maxage=300, swr=3600
    sorties/[id]/page.tsx     ← ISR, revalidate=60, s-maxage=60, swr=600
    api/feed/route.ts         ← SSR + Cache-Control s-maxage=30, swr=300
    (app)/dashboard/page.tsx  ← SSR dynamique, private, no-store, Vary: Cookie
  public/sw.js                ← Service Worker : cache-first sur assets, network-first sur API
```

Traduction des 4 symptômes du beta-testeur (§1) en corrections :

1. **Page sortie à 4,1 s** → passer de `no-store` à ISR `s-maxage=60, swr=600` + preload de l'image hero → LCP repasse sous 2,5 s.
2. **Avatars qui clignotent** → `Cache-Control: max-age=86400` → `(disk cache)`, plus de re-download.
3. **HTML non caché par le CDN** → `s-maxage=60` + ETag → `x-cache: HIT`, TTFB chute.
4. **Feed rechargé à chaque retour** → `s-maxage=30, swr=300` sur `/api/feed` + Service Worker network-first → réponse instantanée depuis le SW, revalidation en fond.

Le livrable final = **deux rapports Lighthouse** (avant/après) commités dans `tribuzen/docs/perf/`, chacun montrant LCP/INP/CLS, plus un tableau de la matrice de décision appliquée.

## 6. Points clés

1. On optimise en boucle : mesurer (`curl -I`, Network, Lighthouse) → classer → décider les en-têtes → invalider → re-mesurer. Une optim non mesurée n'existe pas.
2. La matrice de décision associe chaque type de contenu à un couple (stratégie de rendu, en-têtes de cache) : immuable/SSG/ISR/SSR-cache/SSR-dynamique.
3. `s-maxage` pilote le CDN, `max-age` pilote le navigateur ; `immutable` réservé aux URL hashées ; `private, no-store` obligatoire pour tout contenu personnalisé.
4. `stale-while-revalidate` neutralise le cache stampede : version périmée servie tout de suite, une seule revalidation en fond.
5. L'invalidation multi-couches va de l'origine vers l'utilisateur (DB → app → CDN → navigateur) ; l'inverse re-cache l'obsolète.
6. Chaque optimisation de cache vise un Core Web Vital mesuré : CDN hit → TTFB → LCP ; asset `immutable` → INP ; dimensions d'image → CLS.
7. La preuve du gain est le rapport Lighthouse avant/après + `x-cache: HIT`, jamais l'intention.

## 7. Seeds Anki

```
Dans quel ordre invalider un cache multi-couches quand une donnée change ?|De l'origine vers l'utilisateur : DB → cache applicatif → CDN (par tag) → navigateur (revalidation via no-cache + ETag). Inverser re-cache l'ancienne version.
Différence entre Cache-Control: no-cache et no-store ?|no-cache autorise le stockage mais impose une revalidation avant chaque réutilisation (ETag décide). no-store interdit tout stockage. no-cache + ETag = revalidation cheap et recommandée.
Quelle directive protège du cache stampede et comment ?|stale-while-revalidate : à l'expiration, la version périmée est servie immédiatement et une seule requête de revalidation part en arrière-plan, au lieu de N misses simultanés vers l'origine.
Quels en-têtes pour une page contenant des données personnelles ?|Cache-Control: private, no-store + Vary: Cookie, Authorization. Jamais de cache partagé (CDN/proxy) sinon fuite des données d'un utilisateur à un autre.
Quel Core Web Vital le CDN hit améliore-t-il en priorité, et par quel chemin ?|Le TTFB (réponse servie depuis l'edge, pas l'origine). Comme LCP inclut le TTFB, réduire le TTFB fait mécaniquement baisser le LCP.
Comment lire dans DevTools Network qu'un asset est bien caché ?|Colonne Size : (disk cache)/(memory cache) = servi localement (0 octet réseau) ; 304 = revalidé sans re-download ; une taille en kB = re-téléchargé (cache absent ou périmé).
Quand utiliser immutable et quel est le risque de mauvais usage ?|Uniquement sur des URL hashées (le hash change avec le contenu). immutable supprime la revalidation même au reload. Sur une URL stable, il sert du contenu obsolète pendant toute la durée de max-age.
Que prouvent age et x-cache: HIT dans une réponse curl -I ?|Que la réponse vient du CDN et non de l'origine : x-cache: HIT = servi par le cache edge, age = nombre de secondes passées dans ce cache. C'est la preuve mesurée qu'un CDN hit a lieu.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-17-projet-final/README.md`. **Projet final intégrateur** : tu audites une app réelle avec `curl -I` + DevTools + Lighthouse, tu appliques la matrice de décision couche par couche, et tu prouves le gain LCP/INP/CLS avant/après. Feedback coach, variante J+30, zéro harnais.

---

> **Note :** ce module est le **dernier module du parcours 11-http-caching**. Le `next` pointe vers `fin-parcours-11-http-caching` — tu as couvert l'intégralité du curriculum, du protocole HTTP jusqu'à l'optimisation end-to-end de la chaîne de cache.

← [Module 16 — Push API & Web Notifications](16-push-api-web-notifications.md)
