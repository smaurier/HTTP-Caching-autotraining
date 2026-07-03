---
titre: CDN — cache edge, invalidation et lecture des headers
cours: 11-http-caching
notions: [proximité géographique et latence, offload origine, absorption de pics et DDoS, edge PoP, edge server, origine, origin shield, request collapsing, thundering herd, cache edge, TTL au CDN, s-maxage au CDN, clé de cache CDN, Vary, purge par URL, purge par tag, surrogate keys, Surrogate-Key et Cache-Tag, soft purge, stale-while-revalidate au CDN, "Cache-Status (RFC 9211)", "CDN-Cache-Control (RFC 9213)", CF-Cache-Status et X-Cache, HIT MISS EXPIRED BYPASS, assets versionnés vs dynamique vs perso, "CDN modernes (Cloudflare, Fastly, Vercel)"]
outcomes:
  - sait configurer les en-têtes d'une origine pour qu'un CDN cache correctement (s-maxage, surrogate keys)
  - sait invalider un cache CDN par tag après une mutation plutôt que d'attendre le TTL
  - sait lire les headers de cache (Cache-Status RFC 9211, CF-Cache-Status, X-Cache, Age) pour diagnostiquer un HIT/MISS
  - sait décider quel régime de cache CDN appliquer à un asset versionné, une liste publique, un contenu personnel
prerequis: [00-prerequis-et-vue-ensemble, 01-protocole-http, 02-http2-http3, 03-en-tetes-http, 04-cache-control, 05-etag-validation-conditionnelle, 06-stale-while-revalidate, 07-cache-navigateur]
next: 09-cache-multi-couches
libs: []
tribuzen: stratégie CDN TribuZen — assets immutables, listes publiques en s-maxage + purge par tag, contenu perso en bypass
last-reviewed: 2026-07
---

# CDN — cache edge, invalidation et lecture des headers

> **Outcomes — tu sauras FAIRE :** configurer une origine pour qu'un CDN cache (`s-maxage`, surrogate keys), invalider ce cache par tag après une mutation, lire les headers (`Cache-Status`, `CF-Cache-Status`, `X-Cache`, `Age`) pour diagnostiquer un HIT/MISS, et choisir le bon régime de cache CDN par type de ressource.
> **Difficulté :** :star::star::star:
>
> **Portée :** ce module couvre **uniquement le cache CDN** (le cache *partagé* posé devant ton origine). Il s'appuie sur `s-maxage`, appris au **module 04**, et sur `stale-while-revalidate`, appris au **module 06** — ici on les **applique** au CDN, on ne les réintroduit pas. L'articulation navigateur ↔ CDN ↔ origine en **une stratégie cohérente à plusieurs étages** est le sujet du **module 09 (cache multi-couches)**. Le code exécuté à l'edge (Workers, Edge Functions) est survolé ici et détaillé au **module 12**.

## 1. Cas concret d'abord

TribuZen sert la page publique d'une famille : `/familles/dupont`. Elle liste les membres et les événements à venir. Elle est **identique pour tous les visiteurs anonymes**, **lourde à générer** (plusieurs requêtes SQL + rendu), et TribuZen commence à avoir des familles virales partagées sur les réseaux — des pics de milliers de vues en quelques minutes.

Tu la mets derrière un CDN avec `s-maxage=600` (10 min de cache edge). Les pics passent sans effort : l'origine ne voit qu'une requête toutes les 10 minutes par région. Parfait.

Puis un admin de la famille **édite le nom d'un membre**. Et là, le vrai problème du CDN apparaît :

```
Sans invalidation : la page /familles/dupont reste FIGÉE dans le CDN
pendant 10 minutes. L'admin voit son changement en base, mais le
public voit l'ancienne version. Pire : la page /familles (index qui
liste toutes les familles) est AUSSI périmée, et /membres/42 aussi.
```

Baisser le TTL à 30 s casse tout l'intérêt du CDN (l'origine reprend la charge). La vraie solution : **au moment de la mutation, dire au CDN « purge tout ce qui porte le tag `family-dupont` »**. Une commande, et toutes les URLs liées (`/familles/dupont`, `/familles`, `/membres/42`…) redeviennent fraîches, sans toucher au reste du cache.

Ce module te donne les en-têtes pour cacher au bon endroit, le mécanisme d'**invalidation par tag** — le seul qui rend un CDN utilisable sur du contenu qui change — et la lecture des **headers de cache** pour vérifier que tout ça marche vraiment en production.

---

## 2. Théorie complète, concise

### 2.1 Pourquoi un CDN

Un **CDN** (Content Delivery Network) est un réseau de serveurs cache répartis dans le monde, placés **devant** ton origine. Il répond à trois problèmes distincts :

1. **Proximité géographique = latence.** La lumière dans la fibre plafonne à ~200 000 km/s. Un aller-retour Tokyo → Paris coûte ~250 ms de latence *incompressible*, avant même le traitement serveur. Un serveur cache à Tokyo répond en quelques millisecondes.
2. **Offload de l'origine.** Chaque réponse servie depuis le cache edge est une requête que ton serveur ne traite pas. L'origine passe de « tout le trafic » à « les seuls cache MISS ».
3. **Absorption de pics et de DDoS.** Un pic viral ou une attaque volumétrique frappe les centaines de serveurs edge du CDN, pas ton unique origine. Le CDN est dimensionné pour ça, ton serveur non.

### 2.2 Edge, PoP, origine

```
Visiteur Lyon  --qq ms-->  [PoP Paris]  --\
Visiteur Tokyo --qq ms-->  [PoP Tokyo]  ----> Origine (seulement si MISS)
Visiteur NYC   --qq ms-->  [PoP NYC]    --/
```

| Terme | Rôle |
|---|---|
| **PoP** (Point of Presence) | Un datacenter du CDN dans une région |
| **Edge server** | Le serveur cache, dans un PoP, qui répond au visiteur |
| **Origine** | Ton serveur, la source de vérité |
| **Origin shield** | Un PoP intermédiaire qui protège l'origine (§2.7) |

Le CDN est un **cache partagé** (shared cache) au sens du module 04 : une seule copie sert des milliers de visiteurs. Toute la stratégie découle de là.

### 2.3 Le TTL au CDN : `s-maxage` (rappel appliqué)

`s-maxage` (module 04) est **la** directive qui parle au CDN sans parler au navigateur :

```http
Cache-Control: public, max-age=60, s-maxage=600
```

- `max-age=60` : le **navigateur** garde sa copie 60 s.
- `s-maxage=600` : le **cache partagé** (CDN) la garde 600 s. `s-maxage` **prime sur `max-age` et `Expires`** pour les caches partagés, et est **ignoré** par le navigateur (source : MDN, RFC 9111).
- `public` : autorise explicitement le cache partagé à stocker la réponse.

Ordre de décision du TTL côté CDN : `s-maxage` → sinon `max-age` → sinon `Expires` → sinon heuristique sur `Last-Modified`.

**Découpler les deux TTL est tout l'intérêt :** navigateur court (l'utilisateur voit vite du frais), CDN long (l'origine est protégée).

> **En complément — `CDN-Cache-Control` (RFC 9213).** Certains CDN lisent un en-tête *targeted* dédié, `CDN-Cache-Control`, qu'ils consomment puis **retirent** avant de renvoyer au client. Il permet un TTL CDN totalement découplé du `Cache-Control` vu par le navigateur :
> ```http
> Cache-Control: max-age=600
> CDN-Cache-Control: max-age=3600
> ```
> Ici le CDN se considère frais 1 h, les autres caches 10 min (source : RFC 9213, httpwg.org). `s-maxage` reste le mécanisme standard, portable et suffisant pour ce module ; `CDN-Cache-Control` est l'outil quand tu veux que **seul** le CDN voie une durée différente.

### 2.4 La clé de cache CDN et `Vary`

Le CDN range chaque réponse sous une **clé de cache**. Par défaut : méthode + host + chemin + query string. Deux visiteurs qui demandent la même URL tombent sur la même entrée — c'est exactement l'effet recherché.

`Vary` ajoute des en-têtes de **requête** à la clé : le CDN stocke alors une variante par valeur.

```http
Vary: Accept-Encoding
```

Ici le CDN garde une variante `br`, une `gzip`, une non compressée. Sans ce `Vary`, il pourrait servir du Brotli à un client qui ne le décode pas.

**Piège majeur** (repris en §4) : `Vary: Cookie` ou `Vary: Authorization` explose la clé de cache — chaque utilisateur ayant un cookie/token unique, le hit ratio tombe à zéro. Pour du contenu personnalisé, on **bypass** le CDN, on ne le `Vary` pas.

### 2.5 L'invalidation — le vrai problème du CDN

Le TTL gère la fraîcheur *dans le temps*. Mais une **mutation** (édition, suppression) doit invalider *immédiatement*, sans attendre l'expiration. Trois stratégies.

**Purge par URL** — précise mais fastidieuse :

```bash
# Cloudflare — purge une URL exacte
curl -X POST "https://api.cloudflare.com/client/v4/zones/{zone}/purge_cache" \
  -H "Authorization: Bearer {token}" \
  -d '{"files":["https://tribuzen.app/familles/dupont"]}'
```

Problème : une mutation touche souvent **N URLs** (la page détail, l'index, le feed, la page du membre…). Il faudrait toutes les connaître et les lister.

**Purge par tag / surrogate keys** — la bonne méthode. L'origine attache des **étiquettes** à chaque réponse, et on purge par étiquette :

```http
HTTP/1.1 200 OK
Surrogate-Key: family-dupont member-42 families-index
Cache-Control: public, s-maxage=600
```

```bash
# Fastly — purge tout ce qui porte le tag family-dupont
curl -X POST "https://api.fastly.com/service/{id}/purge/family-dupont" \
  -H "Fastly-Key: {token}"
```

Une seule commande invalide **toutes** les URLs taguées `family-dupont`, sans les énumérer. C'est ce qui rend le CDN exploitable sur du contenu qui bouge.

L'en-tête de tag varie selon le CDN :

| CDN | En-tête de tag | Séparateur | Purge par tag |
|---|---|---|---|
| **Fastly** | `Surrogate-Key` | espaces | natif |
| **Cloudflare** | `Cache-Tag` | virgules | Enterprise |
| **Akamai** | `Edge-Cache-Tag` | espaces | oui |

```http
Surrogate-Key: family-dupont member-42     (Fastly : séparés par des espaces)
Cache-Tag: family-dupont,member-42          (Cloudflare : séparés par des virgules)
```

**Soft purge** — au lieu de supprimer l'entrée, on la **marque `stale`**. Combiné à `stale-while-revalidate` (§2.6), le CDN sert la version périmée instantanément et revalide en arrière-plan : pas de « trou » de cache où tous les visiteurs frappent l'origine d'un coup.

```bash
curl -X POST "https://api.fastly.com/service/{id}/purge/family-dupont" \
  -H "Fastly-Key: {token}" \
  -H "Fastly-Soft-Purge: 1"
```

### 2.6 `stale-while-revalidate` au CDN (rappel appliqué)

`stale-while-revalidate` (module 06) prend tout son sens au CDN :

```http
Cache-Control: public, s-maxage=600, stale-while-revalidate=86400
```

Après les 600 s de fraîcheur, pendant 24 h le CDN **sert immédiatement la version périmée** au visiteur et **revalide en arrière-plan** auprès de l'origine. Le visiteur ne paie jamais la latence d'un MISS ; l'origine reçoit une requête calme de revalidation. `stale-if-error` complète : servir du périmé si l'origine est en panne.

### 2.7 Origin shield et request collapsing

Sans shield, quand une entrée expire, **chaque PoP** va chercher à l'origine — 50 PoP = 50 requêtes simultanées. C'est le **thundering herd** (ruée massive de requêtes identiques quand un contenu populaire n'est pas/plus en cache).

```
Sans shield :  50 PoP  --50 MISS-->  Origine  (submergée)

Avec shield :  50 PoP  -->  [Shield]  --1 MISS-->  Origine
                             (1 PoP)   les 49 autres = HIT sur le shield
```

Le **shield** est un PoP désigné par lequel transitent tous les MISS. Combiné au **request collapsing** (aussi dit *request coalescing* : le CDN fusionne les requêtes identiques concurrentes en **une seule** vers l'amont et sert la réponse à tout le monde), l'origine ne voit qu'une poignée de requêtes même sous pic (source : httpwg / docs CDN).

### 2.8 Assets versionnés vs dynamique vs perso

Trois régimes de cache CDN, à ne jamais confondre :

```http
# 1. Asset statique versionné (hash dans le nom) — immutable, cache maximal
#    /assets/app.a1b2c3.js
Cache-Control: public, max-age=31536000, immutable

# 2. Contenu dynamique public (liste de familles) — s-maxage court + purge par tag
Cache-Control: public, s-maxage=600, stale-while-revalidate=86400
Surrogate-Key: families-index

# 3. Contenu personnalisé (dashboard perso) — JAMAIS au CDN
Cache-Control: private, no-store
```

`immutable` (régime 1) dit au navigateur de ne même pas revalider : le nom hashé change à chaque build, donc une nouvelle version = une nouvelle URL. C'est le cas idéal du CDN (hit ratio ~100 %, purge inutile).

### 2.9 Lire le cache : `Cache-Status` (standard) et les headers propriétaires

Comment savoir si le CDN a servi depuis son cache ? En lisant la réponse.

**Le standard — `Cache-Status` (RFC 9211).** En-tête de réponse *structuré* : une **liste**, un membre par cache traversé. **Le premier membre est le cache le plus proche de l'origine, le dernier le plus proche de l'utilisateur.** Chaque membre s'identifie (nom de produit, hostname…) et porte des paramètres (source : RFC 9211, httpwg.org) :

| Paramètre | Type | Sens |
|---|---|---|
| `hit` | booléen | la requête a été servie depuis ce cache (pas de forward) |
| `fwd` | token | la requête est repartie vers l'amont ; le token dit *pourquoi* : `uri-miss`, `vary-miss`, `miss`, `stale`, `bypass`, `method`, `request`, `partial` |
| `fwd-status` | entier | code de statut renvoyé par l'amont sur la requête forwardée |
| `ttl` | entier | fraîcheur restante en secondes (peut être négative) |
| `stored` | booléen | la réponse vient d'être mise en cache |
| `collapsed` | booléen | cette requête a été fusionnée avec d'autres (request collapsing) |
| `key` | string | la clé de cache utilisée |
| `detail` | string/token | info spécifique à l'implémentation |

```http
# HIT simple, 376 s de fraîcheur restante
Cache-Status: ExampleCache; hit; ttl=376

# Deux étages : l'edge a fait un MISS (uri-miss) et stocké ; le shield, un HIT
Cache-Status: "TribuZen Shield"; hit; ttl=545, "TribuZen Edge"; fwd=uri-miss; stored
```

**Les headers propriétaires (encore majoritaires en pratique).** Beaucoup de CDN exposent aussi leur propre en-tête de debug :

```
Cloudflare : CF-Cache-Status: HIT | MISS | EXPIRED | DYNAMIC | BYPASS
             CF-Ray: 7a12...-CDG   (identifiant + code PoP, CDG = Paris)

Fastly :     X-Cache: HIT | MISS
             X-Cache-Hits: 42
             X-Served-By: cache-cdg20734-CDG, cache-par-...  (shield, edge)

Vercel :     x-vercel-cache: HIT | MISS | STALE | PRERENDER | REVALIDATED
```

| Statut | Signification |
|---|---|
| `HIT` | servi depuis le cache edge (l'origine n'a rien vu) |
| `MISS` | absent du cache, allé chercher à l'origine puis stocké |
| `EXPIRED` / `STALE` | était en cache mais TTL dépassé → revalidé (ou servi stale) |
| `DYNAMIC` | non cacheable (l'origine a dit `no-store` / `private`) |
| `BYPASS` | une règle a contourné le cache (ex. cookie de session) |

Et le standard `Age` (module 04) traverse tout : `Age: 0` ou absent sur un MISS, `Age > 0` sur un HIT. Réflexe déploiement : `curl -sI <url>` et lire `Cache-Status` / `CF-Cache-Status` / `x-vercel-cache` + `Age`.

### 2.10 Edge compute (survol) et CDN modernes

Au-delà du cache, les CDN modernes exécutent du **code à l'edge** (Cloudflare Workers, Fastly Compute, AWS Lambda@Edge, Vercel Edge Functions) : personnalisation légère, A/B testing, auth, réécriture de headers — au plus près du visiteur. C'est le sujet du **module 12 (edge rendering)** ; ici, retiens seulement que l'edge n'est plus un cache passif.

**CDN modernes courants :** Cloudflare, Fastly, AWS CloudFront, Vercel, Netlify, Akamai. Tous parlent `s-maxage` et `Age` ; ils divergent sur l'en-tête de tag, l'API de purge (§2.5) et le header de debug propriétaire (§2.9). Le standard `Cache-Status` vise justement à unifier ce dernier point.

---

## 3. Worked examples

### Exemple 1 — Origine TribuZen coopérant avec le CDN (surrogate keys)

Objectif : une origine qui pose les bons en-têtes pour que le CDN cache **et** que la purge par tag soit possible. Vrai serveur Node, aucune dépendance.

```js
import { createServer } from 'node:http';

// Base simulée : familles et leurs membres
const familles = new Map([
  ['dupont', { nom: 'Les Dupont', membres: [42, 43] }],
  ['martin', { nom: 'Les Martin', membres: [50] }],
]);

// Construit les surrogate keys d'une page famille :
// on tague par la famille ET par chaque membre, pour purger finement.
function familyKeys(slug, famille) {
  return [
    `family-${slug}`,
    ...famille.membres.map((id) => `member-${id}`),
    'families-index', // la page famille apparaît aussi dans l'index
  ].join(' '); // Fastly : séparateur espace
}

const server = createServer((req, res) => {
  // ── Asset statique versionné : immutable, cache maximal ────────────
  if (req.url.startsWith('/assets/')) {
    res.writeHead(200, {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Surrogate-Key': 'static-assets',
    });
    res.end('/* bundle versionné */');
    return;
  }

  // ── Index public des familles : dynamique, s-maxage + tag ──────────
  if (req.url === '/familles') {
    const liste = [...familles].map(([slug, f]) => ({ slug, nom: f.nom }));
    res.writeHead(200, {
      'Content-Type': 'application/json',
      // navigateur 60 s, CDN 10 min, sert du périmé 24 h en revalidant
      'Cache-Control': 'public, max-age=60, s-maxage=600, stale-while-revalidate=86400',
      'Surrogate-Key': 'families-index',
      'Vary': 'Accept-Encoding', // variantes de compression uniquement
    });
    res.end(JSON.stringify(liste));
    return;
  }

  // ── Page détail d'une famille : dynamique, taguée famille+membres ──
  const m = req.url.match(/^\/familles\/([\w-]+)$/);
  if (m) {
    const slug = m[1];
    const famille = familles.get(slug);
    if (!famille) {
      res.writeHead(404, { 'Cache-Control': 'public, s-maxage=10' });
      res.end(JSON.stringify({ error: 'Famille inconnue' }));
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60, s-maxage=600, stale-while-revalidate=86400',
      'Surrogate-Key': familyKeys(slug, famille),
      'Vary': 'Accept-Encoding',
    });
    res.end(JSON.stringify({ slug, ...famille }));
    return;
  }

  // ── Contenu personnalisé : JAMAIS au CDN ───────────────────────────
  if (req.url === '/mon-espace') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store', // clé : private + no-store
    });
    res.end(JSON.stringify({ notifications: 3 }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(4000, () => console.log('Origine CDN-ready sur http://localhost:4000'));
```

Ce qu'il faut voir : `/familles/dupont` porte `Surrogate-Key: family-dupont member-42 member-43 families-index`. Éditer le membre 42 → purge `member-42` → cette page ET l'index tombent, sans purge par URL.

### Exemple 2 — Le cycle mutation → purge par tag, puis lecture du header

Scénario : l'admin renomme le membre 42. Enchaînement exact côté origine, puis vérification côté client.

```js
// Handler de mutation (PATCH /membres/42) côté origine
async function renameMembre(id, nouveauNom, cdn) {
  // 1. Écrire la source de vérité
  await db.membres.update(id, { nom: nouveauNom });

  // 2. Invalider le CDN par tag — soft purge pour éviter le trou de cache.
  //    On purge le membre ; toutes les pages qui le taguent tombent :
  //    /membres/42, /familles/dupont (qui le liste), /familles (index).
  await cdn.purgeByTag(`member-${id}`, { soft: true });

  return { ok: true };
}

// Implémentation purgeByTag pour Fastly
async function purgeByTag(tag, { soft = false } = {}) {
  const headers = { 'Fastly-Key': process.env.FASTLY_KEY };
  if (soft) headers['Fastly-Soft-Purge'] = '1';
  const res = await fetch(
    `https://api.fastly.com/service/${process.env.FASTLY_SERVICE}/purge/${tag}`,
    { method: 'POST', headers },
  );
  if (!res.ok) throw new Error(`Purge CDN échouée: ${res.status}`);
}
```

Vérifier ensuite que ça a marché, en lisant le header de cache sur deux requêtes successives :

```bash
# Juste après la purge : le CDN doit repartir à l'origine (MISS), puis stocker.
$ curl -sI https://tribuzen.app/familles/dupont | grep -i 'cache-status\|age'
Cache-Status: "TribuZen Edge"; fwd=uri-miss; stored
Age: 0

# Deuxième appel immédiat : servi depuis l'edge (HIT), Age qui grimpe.
$ curl -sI https://tribuzen.app/familles/dupont | grep -i 'cache-status\|age'
Cache-Status: "TribuZen Edge"; hit; ttl=598
Age: 2
```

`fwd=uri-miss; stored` puis `hit; ttl=598` : la preuve, en deux commandes, que la purge a bien vidé l'entrée et que le CDN recache. Sur un CDN propriétaire, tu lirais `CF-Cache-Status: MISS` puis `HIT` (ou `x-vercel-cache: MISS` puis `HIT`).

**Même chose côté Cloudflare :** l'en-tête d'origine devient `Cache-Tag: member-42,family-dupont,families-index` (virgules), et la purge :

```bash
curl -X POST "https://api.cloudflare.com/client/v4/zones/{zone}/purge_cache" \
  -H "Authorization: Bearer {token}" \
  -d '{"tags":["member-42"]}'
```

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Confondre `max-age` et `s-maxage` au CDN

```http
# ❌ On croit cacher 10 min au CDN — mais on ne fournit que max-age
Cache-Control: public, max-age=600
# Le CDN cache bien 600 s... mais le NAVIGATEUR aussi. Impossible de
# rafraîchir vite côté client tout en cachant longtemps au CDN.

# ✅ Découpler les deux publics
Cache-Control: public, max-age=60, s-maxage=600
# Navigateur : 60 s (frais). CDN : 600 s (offload). s-maxage prime au CDN.
```

`s-maxage` ne s'applique **qu'aux caches partagés** ; le navigateur l'ignore. C'est exactement ce qu'on veut : TTL court chez le client, long au CDN.

### PIÈGE #2 — Compter sur un TTL court au lieu d'invalider

```http
# ❌ « Je mets s-maxage=15 pour que ça soit toujours frais »
Cache-Control: public, s-maxage=15
# Résultat : l'origine reprend 1 requête / 15 s / région. Le CDN ne sert
# presque plus rien. On a payé un CDN pour rien, ET c'est encore périmé 15 s.

# ✅ TTL long + purge par tag à la mutation
Cache-Control: public, s-maxage=600
Surrogate-Key: family-dupont
# Frais 10 min, et invalidé À LA SECONDE où la donnée change.
```

La fraîcheur d'un contenu mutable ne se règle **pas** par le TTL, mais par l'invalidation événementielle. C'est le cœur du sujet.

### PIÈGE #3 — `Vary: Cookie` (ou `Authorization`) sur du contenu caché

```http
# ❌ On tente de cacher au CDN tout en variant par utilisateur
Cache-Control: public, s-maxage=600
Vary: Cookie
# Chaque cookie de session est unique → une entrée de cache PAR utilisateur.
# Hit ratio ≈ 0. Le CDN ne sert jamais deux fois la même entrée.
# Pire : risque de servir la session d'un user à un autre si mal configuré.

# ✅ Contenu personnalisé = bypass, pas Vary
Cache-Control: private, no-store
```

Règle : `Vary` est réservé à des dimensions **à faible cardinalité** (`Accept-Encoding`, parfois `Accept-Language`). Jamais sur des en-têtes uniques par utilisateur.

### PIÈGE #4 — Oublier de purger les pages agrégées

```js
// ❌ On purge seulement la page détail
await cdn.purgeByTag('family-dupont');
// La page /familles (index) qui LISTE dupont reste périmée : ancien nom.

// ✅ Taguer les pages agrégées avec les entités qu'elles contiennent
// L'index porte lui aussi un Surrogate-Key incluant chaque famille listée
// → purger family-dupont fait tomber l'index aussi.
```

Une entité apparaît dans plusieurs vues (détail, index, feed, page parent). Chaque vue doit **porter le tag de toutes les entités qu'elle affiche**. Sinon la purge est incomplète et laisse des pages fantômes.

### PIÈGE #5 — Cacher une réponse `Set-Cookie` au CDN

```http
# ❌ Réponse cacheable qui pose un cookie
Cache-Control: public, s-maxage=600
Set-Cookie: session=abc123
# Le CDN peut stocker la réponse AVEC le Set-Cookie et servir le MÊME
# cookie de session à tous les visiteurs suivants. Fuite de session.
```

Une réponse qui contient `Set-Cookie` (ou toute donnée personnelle) ne doit jamais être `public`. Les CDN sérieux refusent par défaut de cacher un `Set-Cookie`, mais ne compte pas dessus : marque explicitement `private, no-store`.

### PIÈGE #6 — Lire un HIT/MISS à l'envers dans `Cache-Status`

```http
# Cache-Status se lit dans l'ordre : 1er membre = plus proche de l'ORIGINE,
# dernier membre = plus proche de l'UTILISATEUR.
Cache-Status: "Shield"; hit; ttl=500, "Edge"; fwd=uri-miss; stored
# ❌ Lecture naïve : « c'est un hit ». En réalité l'EDGE (proche user) a
#    fait un MISS et est allé chercher au SHIELD, qui lui avait un HIT.
# ✅ Le visiteur a payé un aller-retour edge→shield, pas edge→origine.
#    C'est justement le rôle du shield (§2.7).
```

Sur les headers propriétaires (`CF-Cache-Status`, `x-vercel-cache`), il n'y a qu'**une** valeur : celle du PoP qui te répond. Le multi-étage n'est visible que dans le standard `Cache-Status`.

---

## 5. Ancrage TribuZen

TribuZen place un CDN (Cloudflare ou Fastly) devant l'API et le front. Trois régimes cohabitent, mappés directement sur §2.8 :

**Assets immutables** — le bundle front (`/assets/app.[hash].js`, images optimisées, polices) est servi en `max-age=31536000, immutable`, tag `static-assets`. Purge uniquement au déploiement (le hash change de toute façon). Hit ratio ~100 %.

**Listes publiques** — la page publique d'une famille (`/familles/:slug`), l'annuaire (`/familles`), les événements publics à venir : `public, s-maxage=600, stale-while-revalidate=86400`. Chaque réponse porte un `Surrogate-Key` incluant la famille et ses membres. **À chaque mutation** (renommage, ajout de membre, nouvel événement), le handler d'écriture déclenche un **soft purge par tag** `family-<slug>` — la page détail *et* toutes les vues agrégées qui la taguent tombent d'un coup.

**Contenu perso — bypass CDN** — le dashboard d'un membre connecté, ses notifications, son fil privé : `private, no-store`. Ces routes ne transitent jamais par le cache CDN (statut `BYPASS`/`DYNAMIC`). On ne les `Vary` **pas** par cookie ; on les exclut.

Invalider le cache d'une famille après édition, en pratique :

```
Admin édite « Les Dupont »
   │
   ▼
API TribuZen : UPDATE en base (source de vérité)
   │
   ▼
API TribuZen : POST purge/family-dupont (soft)  ──►  CDN
   │                                                    │
   ▼                                          /familles/dupont  → stale→revalidé
Réponse 200 à l'admin                         /familles         → stale→revalidé
                                              /membres/42       → stale→revalidé
```

Après le déploiement, l'ops vérifie chaque régime au `curl -sI` en lisant `Cache-Status` (ou `CF-Cache-Status`) + `Age` : les assets doivent être en `hit`, les listes publiques en `hit` (sauf juste après une purge), le contenu perso en `fwd=bypass` / `DYNAMIC`.

Fichiers cibles dans `smaurier/tribuzen` :

```
tribuzen/src/
  server/
    cdn/
      purge.ts          ← purgeByTag(tag, { soft }) — Fastly + Cloudflare
      surrogate-keys.ts ← familyKeys(slug), memberKeys(id)
    routes/
      familles.ts       ← pose Cache-Control + Surrogate-Key sur les GET
      familles.mutations.ts ← appelle purgeByTag après chaque write
```

---

## 6. Points clés

1. Un CDN sert trois buts : réduire la latence (proximité), décharger l'origine (offload), absorber pics et DDoS. C'est un **cache partagé** posé devant l'origine.
2. `s-maxage` fixe le TTL du CDN indépendamment de `max-age` (navigateur) ; il prime au CDN et est ignoré par le client. `CDN-Cache-Control` (RFC 9213) va plus loin : un TTL vu du seul CDN.
3. Clé de cache CDN = méthode + host + chemin + query ; `Vary` y ajoute des en-têtes de requête — jamais `Cookie`/`Authorization` (hit ratio détruit).
4. L'invalidation, pas le TTL, gère la fraîcheur du contenu mutable : purge par URL (fastidieux) vs **purge par tag / surrogate key** (une commande invalide toutes les URLs liées).
5. `Surrogate-Key` (Fastly, espaces) / `Cache-Tag` (Cloudflare, virgules) portent les tags ; chaque vue doit taguer **toutes** les entités qu'elle affiche, pages agrégées incluses.
6. **Soft purge** + `stale-while-revalidate` évitent le trou de cache : servir du périmé, revalider en arrière-plan.
7. **Origin shield** + request collapsing protègent l'origine du thundering herd (un seul MISS remonte).
8. Lecture du cache : le standard **`Cache-Status`** (RFC 9211, liste ordonnée origine→user, params `hit`/`fwd`/`ttl`/`stored`/`collapsed`…) et les headers propriétaires (`CF-Cache-Status`, `X-Cache`, `x-vercel-cache`) + `Age`. Réflexe `curl -sI` après déploiement.
9. Trois régimes distincts : assets versionnés `immutable`, dynamique public `s-maxage`+tag, perso `private, no-store` (bypass).

---

## 7. Seeds Anki

```
Quelle directive fixe le TTL au CDN sans toucher au navigateur, et pourquoi ?|s-maxage : elle ne s'applique qu'aux caches PARTAGÉS (CDN, proxy) et prime sur max-age/Expires pour eux ; le navigateur l'ignore. On met un s-maxage long (offload origine) et un max-age court (utilisateur voit du frais). CDN-Cache-Control (RFC 9213) permet un TTL vu du seul CDN.
Pourquoi la purge par tag (surrogate key) bat-elle la purge par URL ?|Une mutation touche N URLs (détail, index, feed, page parent). La purge par URL exige de toutes les connaître et les lister. La purge par tag invalide en une commande toutes les URLs portant l'étiquette, sans les énumérer — seul mécanisme viable pour du contenu mutable.
Quels en-têtes portent les tags de cache selon le CDN ?|Fastly : Surrogate-Key (valeurs séparées par des espaces). Cloudflare : Cache-Tag (séparées par des virgules). Akamai : Edge-Cache-Tag. On purge ensuite via l'API du CDN par ce tag.
Pourquoi ne jamais mettre Vary: Cookie sur une réponse cachée au CDN ?|Chaque cookie de session étant unique, Vary: Cookie crée une entrée de cache par utilisateur → hit ratio ≈ 0, et risque de fuite de session entre users. Le contenu personnalisé doit être en private, no-store (bypass), pas Vary.
Qu'apporte le soft purge combiné à stale-while-revalidate ?|Le soft purge marque l'entrée comme stale au lieu de la supprimer. Avec stale-while-revalidate, le CDN sert immédiatement la version périmée et revalide en arrière-plan : pas de MISS synchrone pour le visiteur, l'origine ne reçoit qu'une revalidation par PoP (pas de trou de cache).
À quoi sert un origin shield et le request collapsing ?|Le shield est un PoP intermédiaire par lequel transitent tous les MISS. Sans lui, chaque PoP frappe l'origine à l'expiration (thundering herd : 50 PoP = 50 requêtes). Le request collapsing fusionne les requêtes identiques concurrentes en une seule vers l'amont. Résultat : une poignée de requêtes à l'origine même sous pic.
Comment lire le header standard Cache-Status (RFC 9211) ?|C'est une liste : 1er membre = cache le plus proche de l'origine, dernier = le plus proche de l'utilisateur. Chaque membre porte hit (booléen), fwd (pourquoi on est reparti à l'amont : uri-miss, vary-miss, stale, bypass…), ttl, stored, collapsed, key. Ex : "Edge"; fwd=uri-miss; stored = MISS puis mise en cache.
Quels Cache-Control pour un asset versionné, une liste publique, du contenu perso ?|Asset versionné (nom hashé) : public, max-age=31536000, immutable. Liste publique : public, s-maxage=600, stale-while-revalidate=86400 + Surrogate-Key. Contenu perso : private, no-store (bypass CDN, jamais caché).
```

---

## Pont vers le lab

> Lab associé : `11-http-caching/labs/lab-08-cdn/README.md`. Interroger au `curl -I` un asset réel derrière un CDN public, lire ses headers de cache (`Cache-Status`, `CF-Cache-Status`/`x-vercel-cache`, `Age`, `Cache-Control`), forcer un HIT puis observer via l'onglet Network de DevTools — sans aucun harnais de test.
