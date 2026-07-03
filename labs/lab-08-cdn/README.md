# Lab 08 — Lire le cache d'un vrai CDN (curl + DevTools)

> **Outcome :** à la fin, tu sais interroger un asset réellement servi par un CDN public, lire ses en-têtes de cache (`Cache-Status`, `CF-Cache-Status` / `x-vercel-cache`, `X-Cache`, `Age`, `Cache-Control`), provoquer et reconnaître un **MISS** puis un **HIT**, et faire la même lecture dans l'onglet Network de Chrome DevTools.
> **Vrai outil :** `curl -I` (ou `curl -sI`) contre de **vrais** CDN publics (jsDelivr, cdnjs/unpkg, un site Vercel) + Chrome DevTools (onglet Network, colonnes *Status* / *Size* + en-têtes de réponse). Aucun harnais simulé, aucune assertion automatique.
> **Feedback :** le coach valide en session à partir de ce que tu observes réellement (sortie `curl` + panneau Headers de Network) — pas de test-runner auto-correcteur.

---

## Énoncé

Pas de serveur à écrire ici : tu **observes** des CDN de production. L'objectif est d'apprendre à **lire** un cache edge, compétence de diagnostic n°1 quand « la prod sert une vieille version ».

Tu vas produire un petit **rapport d'observation** (un fichier texte ou un tableau) répondant, pour chaque cible, à ces questions :

1. Quel CDN sert cette ressource, et quel **header de debug** l'indique ?
2. La réponse est-elle un **HIT** ou un **MISS** ? Comment le sais-tu (header + valeur) ?
3. Que vaut `Age` ? Que dit-il sur l'ancienneté de la copie edge ?
4. Quel `Cache-Control` l'origine a-t-elle posé (`max-age`, `s-maxage`, `immutable`) ?
5. Si tu rappelles l'URL 2-3 fois de suite, comment évoluent le statut et `Age` ?

**Cibles imposées** (toutes publiques, toutes derrière un CDN réel) :

| # | Cible | CDN attendu | Header de debug à chercher |
|---|---|---|---|
| A | `https://cdn.jsdelivr.net/npm/vue@3.5.13/dist/vue.global.prod.js` | jsDelivr (multi-CDN) | `x-cache`, `cache-status`, `x-served-by` |
| B | `https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js` | Cloudflare | `cf-cache-status`, `cf-ray` |
| C | Une page d'accueil d'un site hébergé sur **Vercel** (ex. `https://vercel.com/`) | Vercel | `x-vercel-cache` |

> Les URLs A et B pointent des versions **figées** (numéro de version + fichier `.min`/`.prod`) : ce sont des assets immuables, cas idéal du CDN → tu dois y voir un `Cache-Control` très long et un HIT stable. Si une version précise n'existe plus, remplace par n'importe quel paquet+version publié.

**Contrainte de rigueur :** tu ne recopies pas des valeurs « attendues » — tu **notes la sortie réelle** que tu obtiens. Les valeurs montrées dans le corrigé sont *illustratives* (elles dépendent du PoP qui te répond, de l'heure, du remplissage du cache) et peuvent différer chez toi. Ce qui compte, c'est de savoir **où lire** et **comment interpréter**.

---

## Étapes (en friction)

1. **Première lecture brute.** Pour la cible A, lance `curl -sI <url>` et repère à l'œil : `cache-control`, `age`, et le(s) header(s) de debug du CDN. Note si c'est un HIT ou un MISS.
2. **Isoler les headers de cache.** Relance en filtrant, pour ne garder que ce qui t'intéresse (voir corrigé pour la commande). Confirme le CDN via le header propriétaire.
3. **Provoquer un MISS puis un HIT.** Ajoute un paramètre de query bidon unique (`?nocache=<timestamp>`) : l'URL devient une **nouvelle clé de cache** → premier appel = MISS. Rappelle **la même URL bidon** aussitôt → HIT. Observe le header de statut passer de MISS à HIT et `Age` démarrer à 0 puis grimper.
4. **Comparer deux CDN.** Fais A (jsDelivr), B (cdnjs/Cloudflare), C (Vercel). Note que **le nom du header de statut change** d'un CDN à l'autre (`x-cache` vs `cf-cache-status` vs `x-vercel-cache`) mais que `Age` et `Cache-Control`, eux, sont **standards** et présents partout.
5. **Basculer dans DevTools.** Ouvre la cible A dans Chrome, onglet **Network**, coche *Disable cache* décoché, recharge. Clique la ressource → panneau **Headers** → section *Response Headers* : retrouve les **mêmes** en-têtes que dans `curl`. Recharge une 2ᵉ fois et regarde la colonne **Size** : `(disk cache)` / `(memory cache)` = servi sans réseau (cache navigateur), sinon la ressource repart au CDN (qui répond HIT).
6. **Rédige le rapport** : le tableau des 5 questions × 3 cibles. C'est ce que le coach relit.

---

## Corrigé complet commenté

> Rappel : ces sorties sont **illustratives**. Ta valeur de `Age`, ton PoP, ton statut HIT/MISS varieront. On explique **comment lire**, pas quoi mémoriser.

### Cible A — jsDelivr (asset versionné immuable)

```bash
# 1) Lecture brute des en-têtes de réponse (-s = silencieux, -I = HEAD seul)
curl -sI https://cdn.jsdelivr.net/npm/vue@3.5.13/dist/vue.global.prod.js
```

```http
HTTP/2 200
cache-control: public, max-age=31536000, s-maxage=31536000, immutable
age: 5217334
x-served-by: cache-fra-eddf8230065-FRA
x-cache: HIT
x-cache-hits: 1
cache-status: "Fastly"; hit
```

Lecture :
- `cache-control: ... max-age=31536000, immutable` → asset **immuable**, caché 1 an. Cas idéal du CDN : le numéro de version dans l'URL fait office de hash, l'URL ne sera jamais réutilisée pour un autre contenu (module 08 §2.8).
- `x-cache: HIT` **et** `cache-status: "Fastly"; hit` → servi depuis l'edge, l'origine (npm) n'a rien vu. jsDelivr expose **les deux** : le propriétaire `x-cache` et le standard `Cache-Status` (RFC 9211).
- `age: 5217334` → la copie edge a plusieurs semaines. Normal pour un asset immuable très demandé.

```bash
# 2) Ne garder que les lignes de cache (grep insensible à la casse)
curl -sI https://cdn.jsdelivr.net/npm/vue@3.5.13/dist/vue.global.prod.js \
  | grep -iE 'cache-control|cache-status|x-cache|age|x-served-by'
```

```bash
# 3) Forcer un MISS puis un HIT sur une clé de cache NEUVE.
#    Le ?v=... crée une URL jamais vue → le CDN doit aller à l'origine.
STAMP=$(date +%s)
echo "== 1er appel (attendu : MISS, age petit) =="
curl -sI "https://cdn.jsdelivr.net/npm/vue@3.5.13/dist/vue.global.prod.js?v=$STAMP" \
  | grep -iE 'x-cache|cache-status|age'
echo "== 2e appel, MÊME url bidon (attendu : HIT, age qui grimpe) =="
curl -sI "https://cdn.jsdelivr.net/npm/vue@3.5.13/dist/vue.global.prod.js?v=$STAMP" \
  | grep -iE 'x-cache|cache-status|age'
```

Sortie typique :

```
== 1er appel ==
x-cache: MISS
cache-status: "Fastly"; fwd=miss; stored
age: 0
== 2e appel ==
x-cache: HIT
cache-status: "Fastly"; hit
age: 3
```

C'est **la** manipulation clé du lab : `MISS` + `age: 0` + `stored` (le CDN vient de stocker), puis `HIT` + `age` qui monte. Tu as reproduit à la main le cycle MISS→HIT d'un CDN.

> PowerShell (Windows) — équivalent sans `grep` :
> ```powershell
> $u = "https://cdn.jsdelivr.net/npm/vue@3.5.13/dist/vue.global.prod.js?v=$(Get-Date -UFormat %s)"
> (Invoke-WebRequest -Method Head $u).Headers |
>   Format-Table @{n='h';e={$_.Key}}, @{n='v';e={$_.Value}}
> ```
> (ou installe `curl.exe`, présent par défaut sur Windows 10/11, et réutilise les commandes ci-dessus telles quelles.)

### Cible B — cdnjs (Cloudflare)

```bash
curl -sI https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js \
  | grep -iE 'cache-control|cf-cache-status|cf-ray|age'
```

```http
cache-control: public, max-age=30672000
cf-cache-status: HIT
cf-ray: 8f3a1c2d4e5f6789-CDG
age: 1832004
```

Lecture :
- Header de debug **différent** : `cf-cache-status: HIT` (propriétaire Cloudflare). Pas de `x-cache` ici.
- `cf-ray: ...-CDG` → le suffixe est le **code aéroport du PoP** qui t'a répondu (`CDG` = Paris). Utile pour savoir *quel* edge sert.
- `age` et `cache-control` restent **standards** → mêmes clés que sur jsDelivr, même si le header de statut change de nom.

### Cible C — Vercel

```bash
curl -sI https://vercel.com/ | grep -iE 'cache-control|x-vercel-cache|age'
```

```http
cache-control: public, max-age=0, must-revalidate
x-vercel-cache: HIT
age: 42
```

Lecture :
- `x-vercel-cache: HIT` → encore un **troisième** nom de header de statut. Valeurs possibles : `HIT`, `MISS`, `STALE`, `PRERENDER`, `REVALIDATED`.
- Ici `max-age=0, must-revalidate` côté navigateur, mais le CDN Vercel sert quand même un `HIT` : la durée edge est pilotée séparément (souvent via `s-maxage`/`CDN-Cache-Control` non exposé au client). Illustration directe du **découplage navigateur/CDN** du module 08 §2.3.

### Synthèse (le rapport attendu)

| Question | A — jsDelivr | B — cdnjs (CF) | C — Vercel |
|---|---|---|---|
| Header de debug | `x-cache` + `cache-status` | `cf-cache-status` (+`cf-ray`) | `x-vercel-cache` |
| HIT ou MISS | HIT | HIT | HIT |
| `Age` | grand (immuable) | grand | petit (page revalidée) |
| `Cache-Control` | `max-age=31536000, immutable` | `max-age=30672000` | `max-age=0, must-revalidate` |
| MISS→HIT avec `?v=` | oui, reproduit | oui | variable |

**Pourquoi ce corrigé est correct :** on ne fait **aucune** hypothèse sur les valeurs exactes ; on démontre les invariants : (1) chaque CDN a **son** header de statut, (2) `Age` + `Cache-Control` sont **standards** et lisibles partout, (3) une **clé de cache neuve** (`?v=<stamp>`) force un MISS observable, suivi d'un HIT. Ce sont exactement les gestes de diagnostic du module.

---

## Variante J+30 (fading)

**Même objectif, contraintes ajoutées — à reproduire de mémoire, sans rouvrir ce corrigé, en 25 minutes :**

1. Trouve **toi-même** un asset public dont le `Cache-Control` **n'a PAS** `immutable` (indice : une page HTML plutôt qu'un `.min.js` versionné) et explique pourquoi son `Age`/statut se comporte différemment d'un asset immuable.
2. Sur une des cibles, mesure le **temps de réponse** d'un HIT vs d'un MISS avec `curl -w`: 
   `curl -s -o /dev/null -w 'temps: %{time_total}s\n' <url>` — compare l'URL cachée (HIT) et une URL `?v=<stamp>` neuve (MISS). Écart attendu : le MISS est plus lent (aller-retour origine).
3. Dans DevTools, active **Disable cache** puis recharge : observe que la ressource **repart au réseau** (plus de `(disk cache)`), mais que le CDN, lui, peut toujours répondre `HIT`. Explique la différence entre *cache navigateur* et *cache CDN*.
4. **Sans regarder** le module 08 ni ce corrigé.

**Critères de réussite :**
- Tu cites une ressource `no-cache`/`must-revalidate` réelle et expliques son comportement.
- Ton `time_total` MISS > `time_total` HIT, chiffres à l'appui (tes propres mesures, pas des valeurs inventées).
- Tu distingues clairement « cache du navigateur » (que *Disable cache* contourne) et « cache du CDN » (qui répond HIT indépendamment).

---

## Application TribuZen

Ce lab est un lab de **diagnostic** : le geste appris ici sert le jour où la prod TribuZen « sert une vieille version ». Dans le repo `smaurier/tribuzen`, le pendant *production* de ces observations :

```
tribuzen/
  scripts/
    check-cdn.sh          # curl -sI sur les URLs clés + grep des headers de cache
  src/server/cdn/
    purge.ts              # purgeByTag(tag, { soft }) — Fastly + Cloudflare
    surrogate-keys.ts     # familyKeys(slug), memberKeys(id)
```

**Comment ça se branche :**
- Après chaque déploiement, `check-cdn.sh` fait un `curl -sI` sur `/assets/app.[hash].js` (doit être `HIT`, `immutable`), sur `/familles` (doit être `HIT` sauf juste après purge) et sur `/mon-espace` (doit être `BYPASS`/`DYNAMIC`, jamais caché).
- Après une mutation, le même script vérifie que `/familles/:slug` repasse en **MISS puis HIT** (preuve que le soft purge a bien vidé l'entrée) — exactement le cycle que tu as reproduit à l'étape 3 avec `?v=`.
- La lecture de `Cache-Status` (standard) est privilégiée car elle marche que TribuZen soit derrière Fastly **ou** Cloudflare, sans réécrire le script.

**Commit cible :**
```
chore(cdn): script check-cdn — vérifie HIT/MISS + Cache-Control par route après déploiement
```
