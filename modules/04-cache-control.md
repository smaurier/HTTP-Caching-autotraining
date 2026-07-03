---
titre: Cache-Control — piloter la fraîcheur des réponses
cours: 11-http-caching
notions: [cache privé vs partagé, freshness lifetime, ordre s-maxage max-age Expires, header Age, max-age, s-maxage, public, private, no-cache, no-store, must-revalidate, proxy-revalidate, immutable, no-transform, must-understand, directives de requête, pattern immutable plus hash, HTML no-cache plus assets immutables, Expires et Pragma legacy]
outcomes:
  - sait choisir la bonne combinaison de directives Cache-Control par type de ressource
  - sait distinguer no-cache de no-store sans se tromper
  - sait distinguer public de private et protéger une donnée personnelle d'un CDN
  - sait appliquer le pattern immutable + hash aux assets et no-cache au HTML
prerequis: [00-prerequis-et-vue-ensemble, 01-protocole-http, 02-http2-http3, 03-en-tetes-http]
next: 05-etag-validation-conditionnelle
libs: []
tribuzen: stratégie Cache-Control TribuZen — assets immutables à hash, HTML no-cache, API privées no-store, annuaire public s-maxage au CDN
last-reviewed: 2026-07
---

# Cache-Control — piloter la fraîcheur des réponses

> **Outcomes — tu sauras FAIRE :** choisir la bonne combinaison de directives `Cache-Control` par type de ressource, distinguer `no-cache` de `no-store` sans jamais te tromper, distinguer `public` de `private`, appliquer le pattern immutable + hash aux assets et `no-cache` au HTML.
> **Difficulté :** :star::star:
>
> **Portée :** ce module couvre **uniquement** l'en-tête `Cache-Control` (et ses voisins legacy `Expires`/`Pragma`, plus `Age`). Le **mécanisme** de revalidation conditionnelle (`ETag`, `If-None-Match`, réponse `304`) est le sujet du **module 05**. La stratégie `stale-while-revalidate` en profondeur est le sujet du **module 06**. Ici on se contente de les **nommer** quand une directive les déclenche.

## 1. Cas concret d'abord

Tu déploies une nouvelle version du front TribuZen. Le fichier de config du serveur applique, partout, la même règle :

```nginx
# nginx.conf — AVANT (règle unique, catastrophique)
location / {
  add_header Cache-Control "public, max-age=31536000";  # 1 an, pour TOUT
}
```

Résultat en production, trois incidents le même jour :

1. **Le HTML est figé.** Les utilisateurs qui ont visité le site hier voient encore l'ancien `index.html` qui pointe vers `app.old.js` — supprimé au déploiement. Page blanche, 404 sur le bundle.
2. **Une donnée privée fuit.** `/api/profile` renvoie le profil d'Alice avec `public, max-age=31536000`. Le CDN le met en cache partagé et le sert à Bob. Fuite de données personnelles.
3. **Impossible de corriger.** Même en repoussant un fix, les navigateurs ne redemanderont rien avant un an — l'URL `/app.js` n'a pas changé.

Le problème n'est pas le caching : c'est d'appliquer **une seule** directive à des ressources qui ont des besoins **opposés**. Ce module te donne le vocabulaire exact de `Cache-Control` pour traiter chaque type de ressource correctement.

---

## 2. Théorie complète, concise

### 2.1 Le modèle : cache privé vs cache partagé

Une réponse HTTP peut être stockée à deux endroits :

| Type de cache | Où | Sert |
|---|---|---|
| **Privé** | Navigateur (mémoire, disque) | Un seul utilisateur |
| **Partagé** | CDN, proxy inverse, proxy d'entreprise | Tous les utilisateurs |

Cette distinction est **le** fil conducteur de tout `Cache-Control`. Certaines directives ne parlent qu'au cache **partagé** (`s-maxage`, `proxy-revalidate`), d'autres l'interdisent (`private`). Une donnée personnelle ne doit **jamais** entrer dans un cache partagé — d'où `private` (ou `no-store`).

### 2.2 La fraîcheur (freshness lifetime)

Une réponse en cache a trois états :

```
[FRESH] --------> [STALE] --------> revalidation
 fraîche          périmée           (demander à l'origine si c'est encore bon)
```

- **Fresh** : `age < freshness lifetime` → servi directement, **zéro requête réseau**.
- **Stale** : `age >= freshness lifetime` → le cache doit revalider (ou servir stale si c'est explicitement autorisé).

La durée de fraîcheur est calculée avec cet **ordre de priorité** (le premier présent gagne) :

```
Cache partagé (CDN/proxy) :   s-maxage > max-age > Expires > heuristique
Cache privé (navigateur)  :              max-age > Expires > heuristique
```

`Cache-Control: max-age` (et `s-maxage`) gagne **toujours** sur `Expires` quand les deux sont présents. L'heuristique n'intervient que si aucune durée explicite n'est fournie : le cache **devine** (souvent ~10 % du temps écoulé depuis `Last-Modified`). On ne veut pas dépendre du devinage → on pose toujours un `Cache-Control` explicite.

### 2.3 L'en-tête `Age`

Un cache partagé ajoute `Age` : le nombre de secondes depuis que la réponse a été générée par le serveur d'**origine** (temps passé dans les caches intermédiaires inclus).

```http
HTTP/1.1 200 OK
Cache-Control: public, max-age=3600
Age: 1800
```

Ici la réponse a `max-age=3600` mais elle est déjà en cache depuis `1800` s. Fraîcheur restante ≈ `3600 - 1800 = 1800` s. En DevTools, `Age` te dit si une réponse vient du serveur (`Age: 0` ou absent) ou d'un CDN (`Age` élevé).

### 2.4 Directives de RÉPONSE (serveur → cache)

```http
Cache-Control: public, max-age=3600, must-revalidate
```

| Directive | Effet | Portée |
|---|---|---|
| `max-age=N` | Fraîche pendant N secondes | tous les caches |
| `s-maxage=N` | Idem mais **écrase `max-age`** | cache **partagé** uniquement |
| `public` | Peut être stockée par un cache partagé (débloque aussi le cache des réponses protégées par `Authorization`) | partagé |
| `private` | Cache **privé** seulement — interdit au CDN/proxy | privé |
| `no-cache` | Peut être stockée **mais doit être revalidée** auprès de l'origine avant chaque réutilisation | tous |
| `no-store` | Ne **rien** stocker, nulle part, jamais | tous |
| `must-revalidate` | Une fois stale, interdit de servir sans revalider (même hors-ligne → erreur) | tous |
| `proxy-revalidate` | Comme `must-revalidate` | cache **partagé** uniquement |
| `immutable` | Le corps ne changera pas tant qu'elle est fraîche → pas de revalidation, même au rechargement | tous |
| `no-transform` | Interdit aux intermédiaires de transformer/recompresser le corps | tous |
| `must-understand` | Le cache ne stocke que s'il comprend les règles de cache liées au code de statut | tous |

Deux directives supplémentaires — `stale-while-revalidate=N` et `stale-if-error=N` — autorisent à servir une réponse **stale** dans certaines conditions. On les **nomme** ici ; `stale-while-revalidate` est détaillée au **module 06**.

### 2.5 no-cache VS no-store — la confusion n°1

Les noms mentent. **Martèle cette distinction :**

```
no-cache  = "STOCKE, mais REVALIDE auprès de l'origine avant de servir"
            (le cache garde la copie ; il demande "toujours bon ?" à l'origine.
             Le mécanisme exact — ETag / If-None-Match / 304 — est le module 05.)

no-store  = "NE STOCKE RIEN. Jamais. Nulle part."
            (chaque requête repart de zéro vers l'origine → 200 complet)
```

Piège fatal : écrire `no-cache` en croyant empêcher le **stockage**. `no-cache` **stocke bel et bien** la réponse — y compris sur le disque du navigateur. Pour une donnée sensible (solde bancaire, token), il faut `no-store`, sinon la donnée reste écrite en clair sur la machine de l'utilisateur.

```
no-cache : la copie est gardée, mais revalidée à chaque usage
           → souvent un 304 léger (rien à re-télécharger) si rien n'a changé
           → l'optimisation existe (économise le corps), la fraîcheur est garantie

no-store : rien n'est gardé
           → 200 complet à chaque requête, aucune optimisation possible
           → mais aucune trace ne subsiste
```

`no-cache` optimise (un `304` pèse ~200 octets au lieu de 50 Ko). `no-store` n'optimise jamais, mais garantit qu'aucune trace ne reste.

### 2.6 public VS private

```http
Cache-Control: public, max-age=86400    # image, CSS, JS → partageable
Cache-Control: private, no-cache         # profil, dashboard → navigateur seulement
```

- `public` : la **même** réponse peut être servie à tous → idéal images, CSS, JS, pages publiques. `public` débloque aussi le cache de réponses qui, par défaut, ne seraient pas caches partagées (réponses à une requête avec en-tête `Authorization`).
- `private` : réponse propre à un utilisateur → le CDN a **interdiction** de la stocker. Le navigateur, lui, peut.

Sans `private`, une page contenant nom/email/solde peut être capturée par un CDN et resservie à un autre utilisateur. `private` empêche cette fuite ; `no-store` va plus loin en interdisant même le navigateur.

### 2.7 immutable + hash dans le nom de fichier

Le pattern le plus important pour la performance web.

```http
GET /assets/app.a1b2c3d4.js
Cache-Control: public, max-age=31536000, immutable
```

`immutable` dit au navigateur : « ce corps ne changera pas tant qu'il est frais, ne me redemande rien, même sur F5 ». Sans lui, un rechargement déclenche une revalidation conditionnelle inutile (un `304` qui coûte quand même 1 aller-retour).

Ça n'est **valide que** si l'URL contient un hash du contenu :

```
app.a1b2c3d4.js  → si le code change, le build produit app.9f8e7d6c.js
                    l'URL change → le HTML pointe vers la nouvelle URL
                    l'ancienne URL n'est plus jamais demandée → son cache meurt seul
```

Le hash rend le cache-busting **automatique** : plus besoin de « vider le cache ».

### 2.8 HTML no-cache + assets immutables — la stratégie gagnante

De 2.7 découle la stratégie standard de tout front moderne (Vite, Next, Nuxt) :

```
index.html            → Cache-Control: no-cache
                        (toujours revalidé → l'utilisateur reçoit vite
                         le HTML qui pointe vers les DERNIERS hashes)

/assets/*.[hash].js   → Cache-Control: public, max-age=31536000, immutable
/assets/*.[hash].css  → (jamais revalidé, servis instantanément)
```

Le HTML est petit et change à chaque déploiement (nouveaux hashes) → `no-cache` : coût d'un `304`, mais toujours à jour. Les assets sont lourds et immuables (leur nom change avec leur contenu) → `immutable` : coût zéro. On combine ainsi **fraîcheur** (le HTML pilote la version) et **vitesse** (les assets ne repartent jamais). C'est exactement ce qui aurait évité les trois incidents du §1.

### 2.9 `Expires` et `Pragma` — les vestiges HTTP/1.0

Avant `Cache-Control` (HTTP/1.1), on pilotait le cache avec deux en-têtes désormais **legacy** :

```http
Expires: Wed, 03 Jul 2026 12:00:00 GMT   # date absolue de péremption
Pragma: no-cache                          # ancêtre de Cache-Control: no-cache
```

- `Expires` est une **date absolue** (sensible à l'horloge du client) et **perd toujours** face à `max-age`/`s-maxage` si les deux sont présents.
- `Pragma: no-cache` est une directive de **requête** HTTP/1.0 ; en HTTP/1.1 elle est superflue.

**Règle :** en HTTP/1.1, pilote le cache avec `Cache-Control` seul. N'ajoute `Expires`/`Pragma` que pour un compat HTTP/1.0 explicitement demandée — jamais « par sécurité ».

### 2.10 Directives de REQUÊTE (client → cache/serveur)

Le client peut aussi imposer des directives, surtout au rechargement.

| Directive requête | Sens |
|---|---|
| `no-cache` | « Ne me sers pas du cache sans revalider auprès de l'origine » (émis par un hard refresh) |
| `no-store` | « Ne stocke pas cette requête/réponse » |
| `max-age=N` | « Je n'accepte pas une réponse plus vieille que N s » (`max-age=0` → force la revalidation) |
| `max-stale=N` | « J'accepte une réponse stale, jusqu'à N s au-delà de sa péremption » |
| `min-fresh=N` | « Je veux une réponse encore fraîche au moins N s » |
| `only-if-cached` | « Réponds uniquement si tu as une copie, sinon 504 » (mode hors-ligne) |

Un `Ctrl+Shift+R` (hard refresh) envoie `Cache-Control: no-cache` en **requête** : c'est le navigateur, pas le serveur, qui parle.

---

## 3. Worked examples

### Exemple 1 — Un serveur Express qui applique la bonne directive par type de ressource

On corrige le cas concret : chaque route reçoit son `Cache-Control`. On utilise Express (le vrai outil du lab).

```typescript
// server.ts — stratégie Cache-Control par type de ressource
import express from 'express';

const app = express();

// 1) ASSET À HASH → immuable, caché 1 an, jamais revalidé.
//    Le nom (app.a1b2c3d4.js) change si le contenu change → aucun risque.
app.get(/\/assets\/.+\.[a-f0-9]{8}\.(js|css)$/, (req, res) => {
  res.set('Content-Type', req.path.endsWith('.js') ? 'text/javascript' : 'text/css');
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.send('/* contenu du bundle */');
});

// 2) HTML → no-cache : stocké MAIS revalidé à chaque fois.
//    L'utilisateur reçoit toujours le HTML pointant vers les derniers hashes.
//    (Le mécanisme ETag/304 qui rend cette revalidation légère = module 05.)
app.get(['/', '/index.html'], (_req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.type('html').send('<!doctype html><html><body>TribuZen</body></html>');
});

// 3) ANNUAIRE PUBLIC → cache partagé long, navigateur court.
//    s-maxage=300 pour le CDN, max-age=30 pour le navigateur.
app.get('/api/families', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=30, s-maxage=300');
  res.json([{ id: 1, name: 'Les Dupont' }]);
});

// 4) DONNÉE PERSONNELLE → private, no-store : jamais sur un CDN,
//    et rien écrit sur le disque du navigateur.
app.get('/api/profile', (_req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json({ name: 'Alice', email: 'alice@tribuzen.app' });
});

app.listen(3000, () => console.log('http://localhost:3000'));
```

**Pourquoi c'est correct :**
- L'asset a un hash → `immutable` sans risque : un nouveau build = une nouvelle URL.
- Le HTML `no-cache` reste toujours à jour et pointe vers les bons hashes → l'incident « page blanche » disparaît.
- L'annuaire sépare `s-maxage` (CDN, 5 min) de `max-age` (navigateur, 30 s) : le CDN absorbe la charge, l'utilisateur voit du frais.
- Le profil `private, no-store` ne peut plus fuiter via le CDN ni rester sur un disque partagé → l'incident « fuite Bob » disparaît.

### Exemple 2 — Décoder une réponse observée en DevTools

Tu vois cette réponse sur `/api/families` dans l'onglet Network :

```http
HTTP/1.1 200 OK
Cache-Control: public, max-age=30, s-maxage=300
Age: 120
Date: Wed, 03 Jul 2026 10:00:00 GMT
```

Lecture pas à pas :

1. `Age: 120` → la réponse est en cache partagé depuis 120 s.
2. Pour le **CDN**, la fraîcheur est pilotée par `s-maxage=300` (prioritaire sur `max-age`). `120 < 300` → **encore fraîche** côté CDN, il sert sans toucher l'origine.
3. Pour le **navigateur**, c'est `max-age=30` qui s'applique. Mais il reçoit une réponse déjà âgée de 120 s : `age (120) >= max-age (30)` → **stale** pour lui, il devra revalider avant de resservir.

Conclusion : le CDN sert vite (il protège l'origine 5 min), mais chaque navigateur revalide après 30 s. On sépare volontairement les deux durées — c'est tout l'intérêt de `s-maxage`.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Croire que `no-cache` empêche le stockage

```http
❌ Cache-Control: no-cache      # "comme ça rien n'est gardé"
```

Faux. `no-cache` **stocke** la réponse (y compris sur le disque du navigateur) et se contente de la revalider avant usage. Pour une donnée sensible, elle reste donc écrite en clair sur la machine.

```http
✅ Cache-Control: no-store      # rien n'est jamais écrit
```

**Règle :** `no-cache` = *revalide* ; `no-store` = *jamais stocké*. Sensible → `no-store`.

### PIÈGE #2 — `immutable` sur un fichier sans hash

```http
❌ /style.css → Cache-Control: public, max-age=31536000, immutable
```

Tu modifies `style.css`, l'URL ne change pas → les utilisateurs gardent l'ancienne version **un an**, sans moyen de forcer la mise à jour.

```http
✅ /style.7f3a9c1e.css → Cache-Control: public, max-age=31536000, immutable
```

**Règle :** `immutable` + `max-age` long **uniquement** si un hash de contenu est dans le nom. Sinon, `max-age` court (ex. `max-age=3600`).

### PIÈGE #3 — `public` sur une donnée personnelle

```http
❌ /api/profile → Cache-Control: public, max-age=600
```

Un CDN met la réponse d'Alice en cache partagé et la sert à Bob. Fuite de données.

```http
✅ /api/profile → Cache-Control: private, no-store
```

**Règle :** dès qu'une réponse dépend de l'identité de l'utilisateur, jamais `public`. `private` au minimum, `no-store` si sensible.

### PIÈGE #4 — `private` avec `s-maxage` (contradiction)

```http
❌ Cache-Control: private, s-maxage=3600
```

`private` interdit le cache partagé ; `s-maxage` ne parle **qu'au** cache partagé. La directive est ignorée — signal d'incompréhension.

```http
✅ Cache-Control: private, max-age=3600
✅ Cache-Control: public, max-age=60, s-maxage=3600
```

**Règle :** `s-maxage` et `proxy-revalidate` n'ont de sens qu'avec `public`.

### PIÈGE #5 — HTML mis en cache long

```http
❌ index.html → Cache-Control: public, max-age=31536000
```

Le HTML pointe vers `app.[hash].js`. Figé un an, il continue de réclamer un bundle supprimé → 404, page blanche après déploiement.

```http
✅ index.html → Cache-Control: no-cache
```

**Règle :** le HTML est le point d'entrée versionné → `no-cache` (revalidé). Ce sont les **assets à hash** qu'on cache pour toujours, pas le HTML.

### PIÈGE #6 — La ceinture ET les bretelles

```http
❌ Cache-Control: no-store, no-cache, max-age=0, must-revalidate, private
   Expires: 0
   Pragma: no-cache
```

`no-store` rend tout le reste inutile. `Expires`/`Pragma` sont du legacy HTTP/1.0.

```http
✅ Cache-Control: no-store
```

**Règle :** `no-store` seul suffit. En HTTP/1.1, oublie `Expires` et `Pragma`.

---

## 5. Ancrage TribuZen

La stratégie `Cache-Control` de TribuZen suit exactement les patterns de ce module, ressource par ressource :

| Ressource | Cache-Control | Raison |
|---|---|---|
| `/assets/*.[hash].js`, `.css` | `public, max-age=31536000, immutable` | Bundle Vite à hash → immuable, jamais revalidé |
| `index.html` | `no-cache` | Point d'entrée versionné → toujours à jour, pointe vers les bons hashes |
| `GET /api/families` (annuaire public) | `public, max-age=30, s-maxage=300` | Liste publique → CDN 5 min, navigateur frais |
| `GET /api/me`, `/api/profile` | `private, no-store` | Données personnelles → jamais sur un CDN, rien sur le disque |
| `GET /api/invoices/:id.pdf` | `private, no-store` | Document confidentiel par utilisateur |
| Images publiques `/img/*.png` (sans hash) | `public, max-age=86400` | Change rarement, mais pas de hash → 1 jour, pas 1 an |

Points d'implémentation dans `smaurier/tribuzen` :
- **Front (Vite + nginx/CDN)** : `nginx.conf` route les `/assets/*` en `immutable` et `index.html` en `no-cache` — corrige les trois incidents du cas concret.
- **API (NestJS)** : un intercepteur pose `private, no-store` par défaut sur toute route authentifiée ; les routes publiques opt-in avec `public, s-maxage=...`.
- **CDN** : le `s-maxage` protège l'origine sur les listes publiques ; le `private` garantit qu'aucune réponse authentifiée n'entre dans le cache partagé.

Fichiers cibles :
```
tribuzen/
  infra/nginx.conf                              # règles assets immutables + HTML no-cache
  api/src/common/cache-control.interceptor.ts   # private, no-store par défaut
  api/src/families/families.controller.ts       # opt-in public, s-maxage sur l'annuaire
```

---

## 6. Points clés

1. Deux caches : **privé** (navigateur) et **partagé** (CDN/proxy) — `s-maxage` et `proxy-revalidate` ne concernent que le partagé ; `private` interdit le partagé.
2. Fraîcheur : ordre `s-maxage` > `max-age` > `Expires` > heuristique (partagé) ; `max-age` bat toujours `Expires` (legacy).
3. `no-cache` = **stocké mais revalidé** à chaque usage ; `no-store` = **jamais stocké** — ne jamais confondre.
4. `public` = partageable par un CDN ; `private` = navigateur seulement ; donnée personnelle → jamais `public`.
5. `immutable` + `max-age` long **uniquement** si le nom de fichier contient un hash de contenu (cache-busting automatique).
6. Stratégie front standard : `index.html` en `no-cache`, assets à hash en `public, max-age=31536000, immutable`.
7. `Age` révèle depuis quand une réponse est en cache partagé ; `Expires`/`Pragma` sont du legacy HTTP/1.0 à éviter.

---

## 7. Seeds Anki

```
Quelle est la différence entre no-cache et no-store ?|no-cache STOCKE la réponse mais la REVALIDE auprès de l'origine avant chaque réutilisation (souvent un 304 léger). no-store ne stocke RIEN, nulle part, jamais — chaque requête repart en 200 complet. Pour une donnée sensible, il faut no-store (no-cache laisse la donnée sur le disque).
Quand peut-on utiliser immutable + max-age=31536000 sur un asset ?|Uniquement si le nom du fichier contient un hash de son contenu (app.a1b2c3d4.js). Si le contenu change, le build produit une nouvelle URL, donc l'ancienne n'est jamais redemandée. Sans hash, on figerait l'ancienne version un an sans pouvoir la corriger.
Quelle est la stratégie Cache-Control standard d'un front moderne (Vite, Next) ?|index.html en no-cache (léger à revalider, pointe toujours vers les derniers hashes) + assets à hash en public, max-age=31536000, immutable (jamais revalidés). On combine fraîcheur du HTML et vitesse des assets.
Quelle est la différence entre public et private ?|public : la réponse peut être stockée par un cache partagé (CDN, proxy) et servie à tous. private : cache privé (navigateur) seulement, interdit au CDN. Une donnée dépendant de l'utilisateur ne doit jamais être public, sinon un CDN peut la resservir à un autre utilisateur.
Quel est l'ordre de priorité pour calculer la fraîcheur côté cache partagé ?|s-maxage > max-age > Expires > heuristique. Le premier présent gagne. Cache-Control (max-age/s-maxage) est toujours prioritaire sur Expires. Côté cache privé, s-maxage est ignoré : max-age > Expires.
À quoi sert la directive s-maxage et pourquoi la combiner avec max-age ?|s-maxage ne s'applique qu'au cache PARTAGÉ (CDN/proxy) et y écrase max-age. On met un s-maxage long (le CDN absorbe la charge) et un max-age court (l'utilisateur voit du frais). Elle n'a de sens qu'avec public — private + s-maxage est contradictoire.
Que signifie l'en-tête de réponse Age ?|Le nombre de secondes depuis que la réponse a été générée par le serveur d'origine, ajouté par un cache partagé. Age élevé = servi depuis un CDN ; Age absent ou 0 = vient de l'origine. Fraîcheur restante ≈ max-age - Age.
Que fait un hard refresh (Ctrl+Shift+R) côté Cache-Control ?|Le navigateur envoie Cache-Control: no-cache en directive de REQUÊTE, forçant une revalidation de toutes les ressources. C'est le client qui parle, pas le serveur.
```

---

## Pont vers le lab

> Lab associé : `11-http-caching/labs/lab-04-cache-control/README.md`. Configurer les bons `Cache-Control` pour chaque type de ressource (asset à hash, HTML, annuaire public, profil privé, données sensibles) sur un vrai serveur Express, puis observer le comportement avec `curl -I` et l'onglet Network de DevTools.
