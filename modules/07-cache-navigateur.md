---
titre: Le cache du navigateur
cours: 11-http-caching
notions: [memory cache vs disk cache, from memory cache vs from disk cache dans DevTools, cache HTTP du navigateur vs Cache API du Service Worker, heuristique de fraicheur, "Storage (localStorage sessionStorage IndexedDB)", Back-Forward Cache (bfcache), partition du cache double-key par site, "DevTools Application Storage et purge", cache et navigation reload vs lien vs back]
outcomes:
  - sait distinguer memory cache et disk cache dans DevTools Network
  - sait choisir entre cache HTTP, Cache API et Storage pour un besoin donné
  - sait diagnostiquer et purger un asset qui ne se met pas à jour
  - sait raisonner sur l'heuristique de fraîcheur et le partitionnement du cache par site
prerequis: [00-prerequis-et-vue-ensemble, 01-protocole-http, 02-http2-http3, 03-en-tetes-http, 04-cache-control, 05-etag-validation-conditionnelle, 06-stale-while-revalidate]
next: 08-cdn
libs: []
tribuzen: comportement du cache navigateur sur l'admin TribuZen — assets from disk cache, bfcache sur navigation back, debug et purge d'un asset périmé
last-reviewed: 2026-07
---

# Le cache du navigateur

> **Outcomes — tu sauras FAIRE :** distinguer memory cache et disk cache dans DevTools Network, choisir entre cache HTTP, Cache API et Storage pour un besoin donné, diagnostiquer et purger un asset qui ne se met pas à jour, raisonner sur l'heuristique de fraîcheur et le partitionnement du cache par site.
> **Difficulté :** :star::star::star:
>
> **Portée :** ce module reste **côté navigateur** : les deux niveaux physiques du cache HTTP (memory / disk), l'heuristique de fraîcheur, le bfcache, le partitionnement, les outils de purge dans DevTools. La **Cache API** (le cache programmable d'un Service Worker) est seulement **introduite** ici pour la distinguer du cache HTTP — ses stratégies (cache-first, network-first, offline) et son code sont le sujet du **module 15 (PWA / Service Workers)**.

## 1. Cas concret d'abord

Tu déploies une correction de style sur l'admin TribuZen. Le CSS a changé côté serveur, mais un collègue râle : chez lui, la sidebar est toujours cassée. Toi, sur ta machine, tu vois la version corrigée. Vous êtes sur la même URL.

Tu ouvres son DevTools > Network et tu vois ça :

```
Name                Status   Type    Size
main.css            200      css     (from disk cache)
app.js              200      js      (from memory cache)
logo.svg            200      svg     (from memory cache)
GET /admin          200      doc     4.2 kB
```

Le `main.css` est servi `(from disk cache)` — le navigateur n'est jamais allé chercher la nouvelle version sur le serveur. Il répond à partir d'une copie stockée sur le disque, parce que la réponse d'origine disait `Cache-Control: max-age=86400` et que la journée n'est pas écoulée.

**Trois questions que ce module va trancher :**
1. Pourquoi `main.css` est `(from disk cache)` mais `app.js` est `(from memory cache)` sur la même page ?
2. Pourquoi un simple `F5` ne suffit pas à récupérer le nouveau CSS, alors que `Ctrl+Shift+R` oui ?
3. Comment purger proprement chez le collègue, puis éviter durablement le problème (indice : le nommage des assets, pas la durée de cache) ?

Le cache navigateur n'est pas une boîte noire : il a des niveaux, des règles de fraîcheur, et des outils de debug et de purge précis.

---

## 2. Théorie complète, concise

### 2.1 « Le cache du navigateur » n'est pas une seule chose

Quand une page a besoin d'une ressource déjà vue, le navigateur regarde plusieurs stockages **côté client** avant d'aller sur le réseau. Ce module couvre les caches **liés au HTTP** et les distingue des mécanismes applicatifs :

| Stockage | Contenu | Piloté par | Portée |
|---|---|---|---|
| Memory cache | ressources de la page courante | le navigateur (opaque) | l'onglet, éphémère |
| Disk cache (HTTP cache) | réponses HTTP cachables | en-têtes `Cache-Control` / `ETag` | persistant, partitionné par site |
| Cache API (Service Worker) | réponses que **tu** stockes en JS | ton code SW | persistant, sous ton contrôle |
| Storage (localStorage…) | données applicatives (pas du HTTP) | ton code JS | persistant, par origine |
| bfcache | snapshot complet d'une page quittée | le navigateur | mémoire, courte durée |

Le piège de vocabulaire : « le cache » désigne le plus souvent le **HTTP cache** du navigateur (memory + disk), automatique et piloté par les en-têtes. La Cache API et Storage sont des mécanismes **programmables** distincts qu'on confond souvent avec lui.

### 2.2 Memory cache vs disk cache

Le HTTP cache du navigateur a **deux niveaux physiques**. Le navigateur choisit seul lequel utiliser — tu ne le contrôles pas directement.

**Memory cache** — stocké en RAM :
- Ultra-rapide (~0 ms), utilisé pour les ressources déjà chargées **dans le document courant**.
- Éphémère : vidé à la fermeture de l'onglet.
- Sert typiquement une image ou un script demandé **deux fois sur la même page**, ou après un rechargement doux quand l'onglet reste ouvert.
- **Ignore largement `Cache-Control`** : c'est une optimisation interne du process de rendu, pas le cache HTTP « officiel ».

**Disk cache** — stocké sur le système de fichiers :
- Plus lent que la RAM (~5-20 ms) mais **persistant** : il survit à la fermeture de l'onglet **et** du navigateur.
- C'est le **vrai** cache HTTP : il respecte `Cache-Control`, `Expires`, `ETag`, `Last-Modified` (cf. modules 04 et 05).
- Taille limitée, géré en LRU par le navigateur (les entrées les moins utilisées sont évincées).

```
Même page, deux <img src="/logo.svg"> :
  1er logo.svg     -> disk cache (ou réseau si absent)
  2e  logo.svg     -> memory cache (déjà décodé en RAM pour ce document)

F5 (onglet resté ouvert) :
  assets           -> souvent (from memory cache)

Fermer l'onglet, rouvrir l'URL :
  memory cache vidé -> assets (from disk cache)
```

Dans DevTools > Network, la colonne **Size** te dit lequel a répondu :

```
(memory cache)   -> servi depuis la RAM (onglet courant)
(disk cache)     -> servi depuis le disque (persistant)
(ServiceWorker)  -> servi par la Cache API d'un Service Worker
12.4 kB          -> téléchargé depuis le réseau (taille réelle)
```

> Règle mentale : **memory = tant que l'onglet vit**, **disk = tant que la fraîcheur HTTP tient**. C'est la réponse à la question 1 du cas concret.

### 2.3 L'heuristique de fraîcheur — quand aucun `Cache-Control` n'est fourni

Une réponse **sans** `Cache-Control` ni `Expires` n'est pas pour autant « jamais cachée ». Le navigateur applique alors une **heuristique de fraîcheur** : il *devine* une durée à partir de `Last-Modified`.

La formule recommandée par la spec (RFC 9111, reprise par MDN) :

```
freshness_heuristique ≈ (Date_maintenant − Last-Modified) × 0.1
```

Soit **~10 % du temps écoulé depuis la dernière modification**. Un fichier modifié il y a 100 jours et servi sans `Cache-Control` sera considéré frais ~10 jours.

```http
HTTP/1.1 200 OK
Last-Modified: Tue, 03 Jun 2026 10:00:00 GMT
# (pas de Cache-Control, pas de Expires)
# -> le navigateur cache quand même, pour ~10 % de l'âge du fichier
```

**Pourquoi ça mord en pratique :** tu crois qu'un endpoint « non caché » repart toujours au réseau, mais le navigateur le garde silencieusement plusieurs heures ou jours. C'est une des causes de « pourquoi mon `/api/config` ne bouge pas alors que je n'ai mis aucun cache ». **Correctif :** ne jamais laisser la fraîcheur au devinage — poser un `Cache-Control` explicite (`no-cache`, `no-store`, ou un `max-age` choisi) supprime l'heuristique. C'est le prolongement direct du module 04.

### 2.4 Cache HTTP du navigateur vs Cache API (Service Worker) — introduction

Deux caches persistants coexistent côté client, souvent confondus :

| | Disk cache (HTTP, navigateur) | Cache API (Service Worker) |
|---|---|---|
| Qui décide du contenu | le navigateur, selon les en-têtes | **ton code** JS |
| Comment on écrit dedans | automatique à chaque réponse cachable | explicite : `cache.put()`, `cache.add()`, `cache.addAll()` |
| Comment on lit | transparent, avant le réseau | explicite : `cache.match()` dans le handler `fetch` |
| Respecte `Cache-Control` | oui | **non** — la Cache API n'honore pas les en-têtes HTTP |
| Visible dans DevTools | Network (colonne Size) | Application > Cache Storage |
| Cours | **ce module** (04, 05) | **module 15** (PWA / Service Workers) |

Le disk cache est **passif** : tu poses des en-têtes, le navigateur gère. La Cache API est **active et programmable** : c'est un magasin de paires `Request`/`Response` que *ton* code remplit et interroge, disponible dans un Service Worker (et les workers). Point crucial à retenir dès maintenant : **la Cache API n'honore pas les en-têtes HTTP** — un `Cache-Control: no-store` ne l'empêche ni de stocker, ni de servir. Ce module s'arrête à cette distinction ; le code SW et les stratégies (cache-first, network-first, SWR côté client, offline) sont le **module 15**.

### 2.5 Storage : localStorage, sessionStorage, IndexedDB

Ces API stockent des **données applicatives**, pas des réponses HTTP. Ne les confonds pas avec le cache : elles ne mettent pas en cache tes requêtes, elles gardent l'état de ton appli.

| API | Capacité | Persistance | Type de données | Usage TribuZen |
|---|---|---|---|---|
| `localStorage` | ~5-10 MB | permanente (jusqu'à effacement) | chaînes clé/valeur | préférence de thème, dernier onglet ouvert |
| `sessionStorage` | ~5-10 MB | durée de l'onglet | chaînes clé/valeur | brouillon de formulaire en cours |
| `IndexedDB` | large (100s de MB) | permanente | objets structurés, index | liste de membres offline, files d'attente |

```js
// localStorage : synchrone, chaînes uniquement -> on sérialise en JSON
localStorage.setItem('tz.theme', JSON.stringify({ mode: 'dark' }));
const theme = JSON.parse(localStorage.getItem('tz.theme') ?? '{}');

// sessionStorage : même API, effacé à la fermeture de l'onglet
sessionStorage.setItem('tz.draft', formValue);

// IndexedDB : asynchrone, objets structurés (via une lib type idb-keyval en pratique)
```

**Distinction clé :** le HTTP cache accélère le **chargement des ressources** (CSS, JS, images, réponses d'API GET). Storage garde des **données métier** que ton code lit et écrit. Mettre une réponse d'API dans `localStorage` « pour cacher », c'est réinventer (mal) le HTTP cache : tu perds la revalidation `ETag`, l'expiration automatique, l'éviction LRU.

### 2.6 Le Back-Forward Cache (bfcache)

Le **bfcache** gèle un snapshot complet d'une page quand l'utilisateur la quitte (DOM, JS heap, position de scroll, état des inputs). Sur « Précédent » / « Suivant », la page est restaurée **instantanément**, sans re-télécharger ni ré-exécuter le JS.

```
Page /admin/membres  --clic sur une fiche-->  /admin/membre/42
   [/admin/membres gelée en bfcache : DOM + scroll + état]

/admin/membre/42  --bouton Précédent-->
   [/admin/membres restaurée depuis bfcache]
   Aucune requête réseau, aucun re-render, scroll conservé.
```

C'est différent du disk/memory cache : le bfcache ne stocke pas des **ressources** mais une **page vivante entière**. Détection en JS :

```js
// pageshow : event.persisted = true si restauré depuis le bfcache
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    // La page revient du bfcache : rafraîchir les données sensibles au temps
    // (ex: badge de notifications, données qui ont pu changer)
    refreshNotifications();
  }
});

// pagehide : préparer la mise en bfcache (fermer WebSocket, etc.)
window.addEventListener('pagehide', (event) => {
  if (event.persisted) {
    closeLiveConnections();
  }
});
```

Ce qui **bloque** le bfcache (donc dégrade la navigation « back ») :

| Bloqueur | Pourquoi | Correctif |
|---|---|---|
| listener `unload` | incompatible avec la mise en cache d'une page vivante | utiliser `pagehide` |
| `Cache-Control: no-store` sur le document | interdit toute conservation de la réponse | `no-cache` si possible (revalide sans interdire) |
| WebSocket / connexion ouverte | état réseau non restaurable | fermer dans `pagehide` |
| `window.opener` accessible | référence inter-fenêtre | ouvrir avec `rel="noopener"` |

### 2.7 La partition du cache (double-key) — le point à signaler

**Changement majeur depuis 2020** (Chrome 85, Firefox, Safari) : le HTTP cache du navigateur est **partitionné par site**. Avant, une ressource était indexée par sa seule URL. Un fichier `jquery.min.js` servi par un CDN public était donc **partagé entre tous les sites** : si `site-a.com` l'avait déjà mis en cache, `site-b.com` le récupérait gratuitement.

Aujourd'hui, la clé de cache est **double** (voire triple) :

```
AVANT 2020 (single-key) :
  clé = URL de la ressource
  https://cdn.jsdelivr.net/jquery.js
  -> partagé entre site-a.com, site-b.com, tous les sites

DEPUIS 2020 (double-key / cache partitioning) :
  clé = (site de la page top-level, URL de la ressource)
  ( site-a.com , https://cdn.jsdelivr.net/jquery.js )   <- entrée A
  ( site-b.com , https://cdn.jsdelivr.net/jquery.js )   <- entrée B distincte
  -> chaque site retélécharge la ressource pour son propre compte
```

**Pourquoi ce changement** : le cache partagé permettait des attaques de vie privée. Un site pouvait mesurer le temps de chargement d'une ressource pour **déduire** que tu avais visité un autre site (l'ayant déjà mise en cache) — un traçage cross-site sans cookie.

**Impact perf à connaître (audit-first) :** le vieux conseil « utilise un CDN public partagé (Google Fonts, jsDelivr, cdnjs) pour profiter du cache déjà rempli des autres sites » est **mort**. Ce bénéfice n'existe plus : chaque site paie son propre premier téléchargement, quel que soit le nombre d'autres sites qui utilisent le même CDN. Conséquences pratiques :
- Auto-héberger tes polices et libs critiques est souvent **aussi rapide ou plus rapide** qu'un CDN public (une connexion de moins, un `preconnect` en moins).
- Le seul cache réellement partagé restant est le **CDN dédié à ton propre site** (module 08) — mais côté navigateur, chaque visiteur repart d'un cache vide pour ton origine.

> À retenir : « CDN public = cache gratuit hérité des autres » était vrai avant 2020, faux aujourd'hui. C'est le point que tu dois signaler en audit de perf.

### 2.8 DevTools : inspecter, vider, purger

Le HTTP cache est la première cause de « ça marche chez moi » sur les assets. Deux zones de DevTools, et des outils du plus doux au plus radical :

- **Network** : la colonne **Size** révèle la source de chaque requête (memory / disk / ServiceWorker / réseau).
- **Application > Storage** : vue d'ensemble de *tout* ce qui est stocké pour le site (Cache Storage de la Cache API, Local/Session Storage, IndexedDB, Cookies) + le bouton **Clear site data**.

| Action | Effet |
|---|---|
| `F5` / rechargement normal | revalide le document ; les sous-ressources encore « fraîches » restent servies du cache (memory/disk) |
| `Ctrl+Shift+R` / `Cmd+Shift+R` (hard reload) | force le réseau pour le document **et** ses sous-ressources, en ignorant la fraîcheur |
| DevTools > Network > **Disable cache** (coché) | tant que DevTools est ouvert, aucune ressource n'est servie du cache HTTP |
| DevTools > **Application > Storage > Clear site data** | vide disk cache + Cache API + Storage (local/session/IndexedDB) + cookies pour ce site |
| Clic droit sur le bouton recharger (DevTools ouvert) > **Empty Cache and Hard Reload** | vide le cache HTTP puis recharge tout depuis le réseau |

> **Purge ciblée de la Cache API :** `Clear site data` et `Empty Cache and Hard Reload` vident aussi la Cache API. Mais tant qu'un **Service Worker actif** re-remplit son cache, la purge peut sembler sans effet : il faut aussi *unregister* le SW (Application > Service Workers > Unregister) — détail au module 15.

Méthode de diagnostic d'un asset qui ne se met pas à jour :
1. Ouvre Network, coche **Disable cache**, recharge. L'asset est-il correct maintenant ? → c'est bien un problème de cache HTTP.
2. Décoche Disable cache, recharge. Regarde la colonne **Size** : `(disk cache)` confirme que le navigateur ne consulte pas le serveur.
3. Clique la requête > onglet **Headers** : lis le `Cache-Control` de la **réponse d'origine**. Un `max-age` élevé sans stratégie de versionnage est la cause racine.
4. Solution durable : **versionner l'URL de l'asset** (`main.a1b2c3.css` avec hash de contenu). Une nouvelle version = une nouvelle URL = une nouvelle entrée de cache. On peut alors mettre `max-age=31536000, immutable` sans jamais servir de version périmée. C'est la réponse à la question 3 du cas concret — le problème se règle par le **nommage**, pas par une durée de cache plus courte.

### 2.9 Cache et navigation : reload vs lien vs back

Le **type de navigation** change le comportement du cache. Même URL, résultats différents :

| Navigation | Comportement cache | Requête émise |
|---|---|---|
| Saisie d'URL / clic sur un lien | consultation normale du HTTP cache (memory/disk selon fraîcheur) | rien si frais |
| `F5` (reload) | revalide le document ; certaines sous-ressources peuvent être revalidées aussi | `Cache-Control: max-age=0` + conditionnel |
| `Ctrl+Shift+R` (hard reload) | bypass complet du cache HTTP | `Cache-Control: no-cache` (200 forcé) |
| Bouton **Précédent / Suivant** | tente d'abord le **bfcache** ; sinon le HTTP cache | rien si bfcache |

Côté Fetch API, ces comportements correspondent aux options `cache: 'no-cache'` (comme un `F5`) et `cache: 'reload'` (comme un hard reload). C'est pour ça qu'un même contenu peut apparaître instantané via « Précédent » (bfcache), rapide via un lien (disk cache), et lent via hard reload (réseau forcé).

---

## 3. Worked examples

### Exemple 1 — Diagnostiquer et purger l'asset TribuZen périmé (le cas concret, résolu)

Reprise du problème d'ouverture : le `main.css` corrigé n'apparaît pas chez le collègue.

**Étape 1 — reproduire et confirmer que c'est le cache.**
DevTools > Network, coche **Disable cache**, `F5`. La sidebar se corrige. → C'est bien du cache HTTP, pas un bug de déploiement.

**Étape 2 — identifier le niveau et la cause.**
Décoche Disable cache, `F5`. La colonne Size affiche :

```
main.css   200   (from disk cache)
```

Clique la requête > **Headers** > Response Headers :

```
Cache-Control: max-age=86400
```

La réponse d'origine a demandé 24 h de fraîcheur. L'URL `main.css` n'a pas changé → le navigateur estime sa copie disque encore fraîche → il ne contacte même pas le serveur. `F5` ne suffit pas car il ne bypass pas une sous-ressource encore fraîche ; `Ctrl+Shift+R` marche car il force le réseau.

**Étape 3 — purge immédiate pour le collègue.**
Clic droit sur recharger (DevTools ouvert) > **Empty Cache and Hard Reload** (ou Application > Storage > **Clear site data**). Il voit la version corrigée.

**Étape 4 — correctif durable (le vrai fix).**
Ne pas baisser le `max-age` (on perdrait tout le bénéfice cache). On **versionne l'URL par hash de contenu** au build :

```
Avant :  /assets/main.css            Cache-Control: max-age=86400
Après :  /assets/main.a1b2c3d4.css   Cache-Control: max-age=31536000, immutable
```

À chaque changement du CSS, le hash change → nouvelle URL → nouvelle entrée de cache, jamais de collision avec l'ancienne. Le HTML (lui en `no-cache`, donc toujours revalidé) pointe vers la nouvelle URL. Plus jamais de « ça marche chez moi » sur les assets — et plus besoin de demander à qui que ce soit de purger.

### Exemple 2 — Rafraîchir des données au retour bfcache

Sur `/admin/membres`, un badge affiche le nombre de demandes d'adhésion en attente. L'admin clique une fiche (`/admin/membre/42`), traite la demande, puis fait « Précédent ». Grâce au bfcache, la liste revient **instantanément** — mais le badge affiche encore l'ancien compte, car le JS n'a pas été ré-exécuté.

```js
// src/pages/MembersPage : au montage on charge le compte...
async function loadPendingCount() {
  const res = await fetch('/api/admin/pending-count');
  const { count } = await res.json();
  document.querySelector('#pending-badge').textContent = String(count);
}
loadPendingCount();

// ...mais un retour bfcache NE relance PAS ce code.
// pageshow avec persisted=true est le seul signal fiable.
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    // Page ressortie du bfcache : le compte a pu changer -> on rafraîchit
    loadPendingCount();
  }
});
```

**Pourquoi c'est correct :** `pageshow` se déclenche à chaque affichage de la page, y compris après restauration bfcache ; `event.persisted` distingue une restauration bfcache (`true`) d'un chargement normal (`false`). On ne rafraîchit **que** la donnée sensible au temps, sans jeter le bénéfice de navigation instantanée du bfcache.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Croire que `Cache-Control` pilote le memory cache

`Cache-Control` pilote le **disk cache** (le cache HTTP persistant). Le **memory cache** est une optimisation interne du process de rendu : il peut servir une ressource depuis la RAM même avec des en-têtes restrictifs, tant que l'onglet vit et que le document courant l'utilise. Ne t'attends pas à contrôler finement le memory cache par en-têtes — pour tester le vrai comportement HTTP, **ferme l'onglet** (vide la RAM) ou coche **Disable cache**.

### PIÈGE #2 — Croire qu'« aucun `Cache-Control` » = « aucun cache »

```
❌ « Je n'ai mis aucun en-tête de cache sur /api/config, donc le navigateur redemande à chaque fois. »
```

Faux : sans directive, le navigateur applique l'**heuristique de fraîcheur** (~10 % du temps depuis `Last-Modified`) et garde silencieusement la réponse. Pour vraiment forcer un aller-retour, il faut un `Cache-Control` **explicite** (`no-cache` pour revalider, `no-store` pour ne rien garder). L'absence d'en-tête n'est pas neutre.

### PIÈGE #3 — Confondre Cache API et HTTP cache

```
❌ « J'ai mis Cache-Control: max-age=0, mais mon Service Worker sert quand même l'ancienne version. »
```

Les deux caches sont indépendants et la **Cache API n'honore pas les en-têtes HTTP**. Un Service Worker qui a fait `cache.put('/data', response)` sert **sa** copie, quels que soient les `Cache-Control` — c'est **ton** code qui décide. `Cache-Control` ne vide pas la Cache API. Pour purger, il faut du code SW (`caches.delete(...)`) ou, en debug, Application > Cache Storage + Unregister du SW. (Détail au module 15.)

### PIÈGE #4 — Utiliser `localStorage` comme cache de réponses d'API

```js
// ❌ Réinvente (mal) le HTTP cache
const cached = localStorage.getItem('members');
if (cached) return JSON.parse(cached);          // jamais revalidé, jamais expiré
const data = await fetch('/api/members').then(r => r.json());
localStorage.setItem('members', JSON.stringify(data));
```

Problèmes : pas de revalidation `ETag`, pas d'expiration, pas d'éviction, sérialisation synchrone bloquante, quota ~5 MB vite atteint. Pour cacher des réponses HTTP, laisse le **HTTP cache** faire son travail (en-têtes) ou utilise la **Cache API** (contrôle explicite, asynchrone). Storage est pour l'**état applicatif** (préférences, brouillons), pas pour cacher du réseau.

### PIÈGE #5 — Compter sur le cache partagé d'un CDN public

```
❌ « On met jQuery/Google Fonts depuis un CDN public : les visiteurs l'ont déjà en cache
   d'autres sites, ça charge gratuitement. »
```

Faux depuis 2020. Le **cache partitionné (double-key)** isole chaque site : `( ton-site.com , url-cdn )` est une entrée distincte de celle des autres sites. Ton visiteur retélécharge la ressource pour ton compte, même si 1000 autres sites servent le même fichier depuis le même CDN. Souvent, **auto-héberger** est aussi rapide (une connexion de moins). Le seul cache utilement partagé aujourd'hui est le **CDN dédié à ton site** (module 08), pas le cache navigateur cross-site.

### PIÈGE #6 — Un listener `unload` qui tue le bfcache

Ajouter `window.addEventListener('unload', ...)` (souvent copié pour de l'analytics) **désactive le bfcache** sur toute la page : la navigation « Précédent » redevient un rechargement complet. Utilise `pagehide` (ou `visibilitychange`) à la place. Vérifie dans DevTools > Application > Back/forward cache.

---

## 5. Ancrage TribuZen

Sur l'admin TribuZen, le cache navigateur se manifeste à trois endroits concrets :

**Assets `from disk cache`.** Le bundle Vite (`/assets/*.js`, `/assets/*.css`) est servi avec un hash de contenu dans le nom (`main.a1b2c3.js`) et `Cache-Control: max-age=31536000, immutable`. Résultat : au deuxième chargement, DevTools > Network affiche `(disk cache)` pour tout le bundle, et le `document` HTML (en `no-cache`) est le seul aller-retour réseau. C'est le comportement cible : assets figés, HTML frais.

**bfcache sur navigation back.** Les pages de liste (`/admin/membres`, `/admin/familles`) doivent rester compatibles bfcache pour que le « Précédent » soit instantané et conserve le scroll. On y interdit tout listener `unload`, on ferme la connexion temps-réel (badge de présence) dans `pagehide`, et on rafraîchit les compteurs sensibles via `pageshow` + `event.persisted` (Exemple 2).

**Debug et purge d'un asset périmé.** Après un déploiement, le protocole de vérification est : Network > **Disable cache** pour confirmer que le nouveau code est bon, puis lecture de la colonne Size + des Response Headers pour distinguer un cache trop agressif d'un vrai bug. Si un fichier non hashé (favicon, manifest, `/api/config` sans en-tête → heuristique) traîne en `disk cache`, on purge via Application > **Clear site data** en dépannage, puis on règle par le versionnage d'URL ou un `Cache-Control` explicite — pas par un `max-age` plus court.

Fichiers cibles dans `smaurier/tribuzen` :
```
tribuzen/
  vite.config.ts                 # hash de contenu sur les assets (build.rollupOptions)
  src/lib/bfcache.ts             # helpers pageshow/pagehide (refresh compteurs)
  src/pages/MembersPage.tsx      # loadPendingCount + pageshow persisted
  server/headers.ts              # Cache-Control immutable sur /assets, no-cache sur le HTML
```

---

## 6. Points clés

1. « Le cache navigateur » regroupe des mécanismes distincts : memory cache, disk cache (HTTP), Cache API (Service Worker), Storage, bfcache.
2. Memory cache = RAM, éphémère (vidé à la fermeture de l'onglet), largement opaque aux en-têtes ; disk cache = persistant, piloté par `Cache-Control`/`ETag`.
3. Dans DevTools > Network, la colonne Size révèle la source : `(memory cache)`, `(disk cache)`, `(ServiceWorker)`, ou la taille réelle si réseau.
4. Sans `Cache-Control`, le navigateur applique l'heuristique de fraîcheur (~10 % du temps depuis `Last-Modified`) — l'absence d'en-tête n'est pas « pas de cache ».
5. Le HTTP cache est passif (en-têtes) ; la Cache API est active, programmable et **n'honore pas les en-têtes HTTP** — deux caches indépendants (Cache API détaillée au module 15).
6. Storage (localStorage/sessionStorage/IndexedDB) sert à l'état applicatif, pas à cacher des réponses HTTP.
7. Le bfcache gèle une page entière pour un « Précédent » instantané ; `unload` et `no-store` le bloquent ; on rafraîchit via `pageshow` + `event.persisted`.
8. Depuis 2020, le cache est partitionné par site (double-key) : le cache partagé cross-site des CDN publics n'existe plus — auto-héberger est souvent aussi rapide.
9. On purge via DevTools (Disable cache, Clear site data, Empty Cache and Hard Reload) ; on règle durablement par le versionnage d'URL (hash + `immutable`), pas par un `max-age` plus court.

---

## 7. Seeds Anki

```
Pourquoi une même ressource peut-elle être servie (from memory cache) puis (from disk cache) ?|Memory cache = RAM liée à l'onglet courant (2e usage sur la même page, ou F5 onglet ouvert). Dès que l'onglet est fermé, la RAM est vidée : au rechargement, la ressource repart du disk cache, qui lui est persistant.
Que fait le navigateur avec une réponse qui n'a AUCUN Cache-Control ni Expires ?|Il applique l'heuristique de fraîcheur : il devine une durée valide ≈ 10 % du temps écoulé depuis Last-Modified. L'absence d'en-tête ne veut donc pas dire "pas de cache". Pour forcer un aller-retour, poser un Cache-Control explicite (no-cache ou no-store).
Quelle est la différence entre le disk cache HTTP et la Cache API d'un Service Worker ?|Le disk cache est passif : le navigateur écrit/lit selon Cache-Control/ETag. La Cache API est active et programmable : ton code JS décide quoi mettre (cache.put) et quoi servir (cache.match), et elle N'HONORE PAS les en-têtes HTTP. Cache-Control ne la vide pas.
Pourquoi ne faut-il pas utiliser localStorage pour cacher des réponses d'API ?|Pas de revalidation ETag, pas d'expiration, pas d'éviction LRU, API synchrone bloquante, quota ~5 MB. Storage est pour l'état applicatif (préférences, brouillons). Pour cacher du HTTP, utiliser le HTTP cache (en-têtes) ou la Cache API.
Qu'est-ce que la partition du cache (double-key) et depuis quand ?|Depuis 2020, la clé de cache est (site de la page top-level, URL de la ressource) au lieu de l'URL seule. Chaque site a sa propre entrée : le cache d'un CDN public n'est plus partagé entre sites. But : bloquer le traçage cross-site par timing.
Comment purger un asset périmé dans DevTools, et comment régler ça durablement ?|Purge de dépannage : Disable cache, Empty Cache and Hard Reload, ou Application > Clear site data. Fix durable : versionner l'URL par hash de contenu (main.a1b2c3.css) + max-age=31536000, immutable. Nouvelle version = nouvelle URL = nouvelle entrée. Pas besoin de baisser le max-age.
Qu'est-ce que le bfcache et comment détecter une restauration en JS ?|Le Back-Forward Cache gèle une page entière (DOM, JS heap, scroll) pour restaurer instantanément au « Précédent ». On détecte via l'event pageshow avec event.persisted === true, où l'on rafraîchit seulement les données sensibles au temps.
Qu'est-ce qui bloque le bfcache ?|Un listener unload (utiliser pagehide à la place), Cache-Control no-store sur le document, des connexions ouvertes non fermées (WebSocket), un window.opener accessible (utiliser rel=noopener). DevTools > Application > Back/forward cache liste les causes.
Quelle est la différence de comportement cache entre F5 et Ctrl+Shift+R ?|F5 revalide le document (envoie Cache-Control: max-age=0 + conditionnel) mais peut servir des sous-ressources encore fraîches. Ctrl+Shift+R (hard reload) envoie Cache-Control: no-cache et force un 200 réseau pour le document ET ses sous-ressources.
```

---

## Pont vers le lab

> Lab associé : `11-http-caching/labs/lab-07-cache-navigateur/README.md`. Observer en direct dans DevTools la bascule memory/disk cache, l'heuristique de fraîcheur sur une réponse sans en-tête, la restauration bfcache, et purger le cache — corrigé inline, variante J+30, portage TribuZen.
