---
titre: Stale-while-revalidate et stratégies de fraîcheur
cours: 11-http-caching
notions: [directive stale-while-revalidate, servir le stale immédiatement plus revalidation en arrière-plan, latence 0 perçue, fenêtre stale comptée depuis la fin du max-age, directive stale-if-error, erreur = statut 500 502 503 504 ou erreur locale, résilience quand l'origine est down, combinaison max-age plus SWR plus SIE, RFC 5861, SWR HTTP au niveau CDN et navigateur vs SWR applicatif au niveau client, pont vers TanStack Query, choix d'une stratégie de fraîcheur selon la tolérance au décalage]
outcomes:
  - sait écrire un Cache-Control qui sert du stale puis revalide en arrière-plan
  - sait ajouter stale-if-error pour survivre à une origine en panne
  - sait calculer la fenêtre stale à partir de la fin du max-age
  - sait distinguer le SWR HTTP du SWR applicatif d'une lib client
prerequis: [00-prerequis-et-vue-ensemble, 01-protocole-http, 02-http2-http3, 03-en-tetes-http, 04-cache-control, 05-etag-validation-conditionnelle]
next: 07-cache-navigateur
libs: []
tribuzen: SWR sur les listes de familles et d'activités TribuZen (fraîcheur bornée, latence 0 perçue) et stale-if-error pour la résilience quand l'API est momentanément down
last-reviewed: 2026-07
---

# Stale-while-revalidate et stratégies de fraîcheur

> **Outcomes — tu sauras FAIRE :** écrire un `Cache-Control` qui sert du contenu stale puis revalide en arrière-plan, ajouter `stale-if-error` pour survivre à une origine en panne, calculer correctement la fenêtre stale, distinguer le SWR **HTTP** (CDN/navigateur) du SWR **applicatif** (lib client type TanStack Query).
> **Difficulté :** :star::star::star:
>
> **Portée :** ce module couvre **uniquement** les deux directives `Cache-Control` de contenu stale — `stale-while-revalidate` et `stale-if-error` (extensions définies par la **RFC 5861**). Il s'appuie sur `max-age`/`s-maxage` (**module 04**) et sur la revalidation conditionnelle `ETag`/`If-None-Match`/`304` (**module 05**), qu'il ne réexplique pas. Le SWV **applicatif** (TanStack Query) n'est ici qu'un **pont** de vocabulaire, détaillé dans le cours React (module 23).

## 1. Cas concret d'abord

Tu bosses sur l'API TribuZen. L'écran d'accueil de l'app mobile affiche la **liste des activités** d'une famille. Le module 04 t'a donné `Cache-Control: max-age=60` ; le module 05 t'a donné la revalidation `304`. Mais un problème demeure.

```
Avec max-age + ETag seuls — la revalidation stale BLOQUE l'affichage
====================================================================
t=0s    GET /api/families/42/activities -> 200 OK (frais 60 s)
t=61s   copie stale -> le mobile DOIT revalider avant d'afficher
        GET ... If-None-Match: "a-42-v7"
        ... 400 ms d'aller-retour réseau (origine lente / 4G) ...
        <- 304 Not Modified
        => l'utilisateur a fixé un écran vide 400 ms
```

Le `304` économise bien le corps (module 05), mais l'utilisateur **attend quand même** l'aller-retour avant de voir quoi que ce soit. Pour une liste d'activités qui tolère 2-3 minutes de décalage, faire patienter l'utilisateur est absurde : on a une copie parfaitement affichable sous la main.

Pire : si l'API TribuZen tombe (déploiement raté, pic de charge), la copie stale expire complètement et l'écran affiche une **erreur** — alors qu'une liste vieille de 5 minutes aurait très bien fait l'affaire.

Ce module apporte deux directives qui règlent exactement ces deux problèmes : `stale-while-revalidate` (afficher le stale **tout de suite**, revalider en tâche de fond → latence 0 perçue) et `stale-if-error` (servir le stale **si l'origine est down** → résilience). Et il dissout une confusion fréquente : la directive HTTP `stale-while-revalidate` n'est **pas** la même chose que la librairie `SWR` / TanStack Query côté client.

---

## 2. Théorie complète, concise

### 2.1 Rappel — fresh, stale, et le coût de la revalidation

Du module 04/05 : une réponse cachée est **fraîche** tant que son âge est sous `max-age`, puis devient **stale**. Une fois stale, le comportement par défaut est de **revalider avant de servir** — donc d'attendre l'aller-retour réseau (même s'il finit en `304`).

Les deux directives de ce module, définies par la **RFC 5861** (« HTTP Cache-Control Extensions for Stale Content »), assouplissent ce défaut : elles autorisent le cache à **servir du stale** dans des conditions précises.

### 2.2 La directive `stale-while-revalidate=N`

MDN la définit ainsi : *« the cache could reuse a stale response while it revalidates it »* — le cache peut réutiliser une réponse stale **pendant qu'il** la revalide.

```
Cache-Control: max-age=60, stale-while-revalidate=120
```

Trois phases dans le temps :

```
      0s            60s                      180s
      |─────────────|────────────────────────|──────────────►
      |    FRAIS    |  STALE-WHILE-REVALIDATE |   EXPIRÉ
      | (max-age)   |  (fenêtre SWV = 120 s)  | (revalidation
      |             |                         |  bloquante)
      | sert direct | sert le stale IMMÉDIAT  | on attend
      | zéro réseau | + revalide en tâche fond| l'origine
```

- **0 → 60 s (frais)** : servi directement, aucun réseau.
- **60 → 180 s (fenêtre SWV)** : le cache renvoie **immédiatement** la copie stale à l'utilisateur, **puis** lance une requête de revalidation en arrière-plan « d'une manière qui ne retarde pas l'utilisation de la réponse cachée » (web.dev). La réponse fraîche remplace la copie en cache pour la **prochaine** requête. L'utilisateur courant, lui, n'a rien attendu → **latence 0 perçue**. MDN : la revalidation rend le cache à nouveau frais, *« so it appears to clients that it was always fresh… effectively hiding the latency penalty of revalidation »*.
- **au-delà de 180 s (expiré)** : la fenêtre SWV est dépassée, on revient au comportement bloquant — on attend l'origine.

> **Calcul de la fenêtre, à ancrer :** la fenêtre SWV se compte **à partir de la fin du `max-age`**, pas à partir du stockage. `max-age=60, stale-while-revalidate=120` signifie « stale servable jusqu'à 60 + 120 = **180 s** après stockage », pas jusqu'à 120 s. (Idem dans l'exemple MDN `max-age=604800, stale-while-revalidate=86400` : frais 7 jours, **puis** 1 jour de stale servable.)

### 2.3 Le mécanisme « servir puis revalider »

Ce que fait un cache conforme (navigateur ou CDN) quand la copie est dans la fenêtre SWV :

```
1. répond à l'utilisateur avec la copie stale  <- immédiat, non bloquant
2. déclenche en arrière-plan un GET de revalidation (avec If-None-Match)
3. la réponse (304 ou 200) rafraîchit l'entrée de cache
4. la PROCHAINE requête bénéficiera de la version rafraîchie
```

L'ordre est le point clé : on **répond d'abord**, on **revalide ensuite**. Le premier utilisateur après expiration voit du stale ; les suivants voient du frais. C'est un compromis assumé : on échange un peu de fraîcheur contre une latence perçue nulle.

### 2.4 La directive `stale-if-error=N` — résilience

`stale-while-revalidate` gère le cas normal (origine joignable). `stale-if-error` gère le cas **panne**. MDN : *« the cache can reuse a stale response when an upstream server generates an error, or when the error is generated locally »*.

```
Cache-Control: max-age=60, stale-if-error=86400
```

Signification : si, une fois la copie stale, la revalidation vers l'origine **échoue**, le cache est autorisé à **servir le stale** pendant 86400 s (24 h) plutôt que de propager l'erreur. Ce que MDN considère comme une **erreur**, précisément :

- une réponse d'origine de statut **500, 502, 503 ou 504** ;
- **ou** une erreur générée **localement** par le cache (timeout, origine injoignable, coupure réseau).

Passé la fenêtre `stale-if-error`, le cache cesse de couvrir et le client reçoit l'erreur.

```
Origine DOWN, copie stale de 5 min disponible
==============================================
        sans stale-if-error         avec stale-if-error
utilisateur <- 502 Bad Gateway      utilisateur <- 200 (copie stale)
```

La philosophie : **des données de 5 minutes valent mieux que pas de données du tout**. C'est un filet de sécurité, pas une stratégie de fraîcheur.

### 2.5 Combiner les trois directives

`max-age`, `stale-while-revalidate` et `stale-if-error` couvrent trois moments distincts et se combinent dans **un seul** en-tête :

```
Cache-Control: max-age=60, stale-while-revalidate=300, stale-if-error=86400
```

- **0 → 60 s** : frais, servi sans réseau.
- **60 → 360 s** : stale servi immédiatement + revalidation en tâche de fond (SWV).
- **origine en erreur (500/502/503/504 ou timeout), jusqu'à 24 h** : on sert le stale plutôt qu'une erreur (SIE).

Chaque fenêtre part de la **fin du `max-age`** et elles sont indépendantes : les 300 s de SWV et les 86400 s de SIE se comptent toutes deux à partir de `t = 60 s`. Ce n'est pas seulement valide, c'est **recommandé** pour du contenu qui tolère un décalage : vitesse (SWV) + résilience (SIE) sur la même ressource.

### 2.6 SWR **HTTP** vs SWR **applicatif** — la distinction centrale

C'est le piège de vocabulaire le plus courant du domaine. Deux choses différentes portent le nom « SWR ».

| | **SWR HTTP** (cette directive) | **SWR applicatif** (lib client) |
|---|---|---|
| Ce que c'est | la directive `Cache-Control: stale-while-revalidate` | une **librairie** JS : `swr` (Vercel), TanStack Query |
| Défini par | RFC 5861 (protocole HTTP) | l'API de la lib (`useQuery`, `useSWR`) |
| Où il tourne | dans le **cache HTTP** : navigateur, CDN, proxy | dans le **JS de l'app** : mémoire du composant React |
| Qui décide | l'**en-tête envoyé par le serveur** | le **code client** (`staleTime`, `refetchOnFocus`…) |
| Portée du cache | partagé (CDN) ou par navigateur | par onglet / instance d'app, en RAM |
| Survit à un reload | oui (cache disque navigateur / CDN) | non (RAM vidée au reload) |
| Exemple | `Cache-Control: max-age=60, stale-while-revalidate=300` | `useQuery({ staleTime: 60_000 })` |

Le **pattern** est le même dans les deux cas — *servir ce qu'on a, rafraîchir en fond* — mais la **couche** diffère :

- **SWR HTTP** : le serveur pose la politique dans l'en-tête ; le cache HTTP (CDN, navigateur) l'applique. Le client n'écrit **aucun code**. Idéal pour du contenu servi par un CDN.
- **SWR applicatif** : le client gère lui-même un cache en mémoire et décide quand refetch. Aucun en-tête HTTP n'est nécessaire ; ça marche même si l'API répond `no-store`. Idéal pour de l'état serveur riche dans une SPA.

> **Pont vers le module React 23** (TanStack Query) : la lib reprend exactement l'idée de cette directive, mais côté client et avec un contrôle beaucoup plus fin (invalidation ciblée, `refetchOnWindowFocus`, mutations optimistes). Quand tu verras `staleTime` là-bas, souviens-toi : c'est le `max-age` du SWR HTTP, transposé en mémoire. Les deux ne s'excluent pas — on peut avoir un CDN en SWR HTTP **et** TanStack Query par-dessus.

### 2.7 Quand utiliser SWR (et quand l'éviter)

SWR (HTTP ou applicatif) convient au contenu qui **tolère un léger décalage** :

| Contenu | SWR adapté ? | Pourquoi |
|---|---|---|
| Liste d'activités, catalogue, fil d'actu | oui | un décalage de quelques minutes est invisible |
| Profil public, page « à propos » | oui | change rarement |
| Solde bancaire, panier au checkout | **non** | un stale trompe l'utilisateur → `no-store` |
| Notifications temps réel, chat | **non** | fraîcheur = la fonctionnalité elle-même |
| Fichier hashé `app.a1b2c3.js` | inutile | `immutable` : jamais stale par construction |

Règle : **SWR est le bon défaut dès qu'un léger stale est acceptable**. Dès qu'un stale peut induire l'utilisateur en erreur ou une décision (argent, sécurité), passe en `no-store` ou revalidation bloquante (`no-cache` + ETag du module 05).

---

## 3. Worked examples

### Exemple 1 — Endpoint TribuZen en SWR + stale-if-error (Node natif)

Liste des activités d'une famille : `max-age` court, fenêtre SWV généreuse, filet SIE de 24 h. Ici le serveur ne fait qu'**émettre l'en-tête** — c'est le cache en aval (navigateur/CDN) qui applique le SWR. On ajoute un ETag (module 05) pour que la revalidation en tâche de fond finisse en `304`.

```js
// activities-endpoint.mjs — Node http natif, zéro dépendance
import http from 'node:http';
import crypto from 'node:crypto';

// "Base de données" en mémoire
const activities = {
  42: [
    { id: 'a1', title: 'Pique-nique parc', date: '2026-07-12' },
    { id: 'a2', title: 'Ciné en famille', date: '2026-07-15' },
  ],
};

function strongEtag(body) {
  const hash = crypto.createHash('sha256').update(body).digest('hex').slice(0, 16);
  return `"${hash}"`;
}

const server = http.createServer((req, res) => {
  const m = (req.url ?? '').match(/^\/api\/families\/(\d+)\/activities$/);
  if (req.method === 'GET' && m) {
    const list = activities[m[1]];
    if (!list) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end('{"error":"famille inconnue"}');
    }

    const body = JSON.stringify(list);
    const etag = strongEtag(body);

    // La revalidation SWV arrivera avec If-None-Match -> on répond 304 sans corps.
    const inm = req.headers['if-none-match'];
    if (inm && inm.split(',').map((s) => s.trim()).includes(etag)) {
      res.writeHead(304, {
        ETag: etag,
        // On REPOSE la politique complète pour relancer les timers du cache aval.
        'Cache-Control': 'max-age=60, stale-while-revalidate=300, stale-if-error=86400',
      });
      return res.end();
    }

    res.writeHead(200, {
      'Content-Type': 'application/json',
      ETag: etag,
      // 60 s frais, 300 s de stale servable en tâche de fond, 24 h de filet si down.
      'Cache-Control': 'max-age=60, stale-while-revalidate=300, stale-if-error=86400',
    });
    return res.end(body);
  }
  res.writeHead(404).end();
});

server.listen(3000, () => console.log('http://localhost:3000'));
```

Point important : **le code serveur ne « fait » pas le SWR**. Il déclare la politique. C'est le cache HTTP en aval (le navigateur, ou un CDN comme dans le module 08) qui, en lisant l'en-tête, décide de servir le stale et de revalider en fond. Le serveur ne voit qu'un `GET` normal quand la revalidation arrive.

### Exemple 2 — Simuler le comportement d'un cache SWR (le « moteur » côté aval)

Pour **comprendre** ce que le CDN/navigateur fait de l'en-tête, voici le moteur, en clair. C'est ce que le lab te fera reproduire.

```js
// swr-cache.mjs — modélise un cache HTTP qui APPLIQUE stale-while-revalidate
// (c'est le rôle du navigateur/CDN, pas du serveur d'origine)

const store = new Map(); // key -> { body, etag, storedAt, maxAge, swr, sie }

// Revalidation en arrière-plan : NON attendue par l'appelant.
function revalidateInBackground(key, fetchOrigin) {
  fetchOrigin(store.get(key)?.etag)
    .then((fresh) => {
      if (fresh.status === 304) {
        store.get(key).storedAt = Date.now(); // inchangé : on réarme les timers
      } else {
        store.set(key, {
          ...store.get(key),
          body: fresh.body,
          etag: fresh.etag,
          storedAt: Date.now(),
        });
      }
    })
    .catch(() => {
      /* échec ignoré ici : stale-if-error gère la LECTURE, pas ce fetch de fond */
    });
}

// Retourne { body, cacheStatus } — immédiat du point de vue de l'utilisateur.
async function get(key, fetchOrigin) {
  const entry = store.get(key);
  const now = Date.now();

  // 1) Rien en cache : on doit attendre l'origine (miss bloquant).
  if (!entry) {
    const fresh = await fetchOrigin(null);
    store.set(key, {
      body: fresh.body, etag: fresh.etag, storedAt: now,
      maxAge: 60_000, swr: 300_000, sie: 86_400_000,
    });
    return { body: fresh.body, cacheStatus: 'MISS' };
  }

  const age = now - entry.storedAt;

  // 2) Frais : servi direct, zéro réseau.
  if (age < entry.maxAge) {
    return { body: entry.body, cacheStatus: 'HIT (fresh)' };
  }

  // 3) Dans la fenêtre SWV : on SERT LE STALE puis on revalide en fond.
  if (age < entry.maxAge + entry.swr) {
    revalidateInBackground(key, fetchOrigin); // <- NON awaité : latence 0 perçue
    return { body: entry.body, cacheStatus: 'HIT (stale, revalidating)' };
  }

  // 4) Au-delà de SWV : revalidation bloquante, avec filet stale-if-error.
  try {
    const fresh = await fetchOrigin(entry.etag);
    if (fresh.status !== 304) {
      store.set(key, { ...entry, body: fresh.body, etag: fresh.etag, storedAt: now });
    } else {
      entry.storedAt = now;
    }
    return { body: store.get(key).body, cacheStatus: 'MISS (revalidated)' };
  } catch (err) {
    // Origine DOWN (5xx/timeout) : stale-if-error autorise le stale jusqu'à sie.
    if (age < entry.maxAge + entry.sie) {
      return { body: entry.body, cacheStatus: 'HIT (stale-if-error)' };
    }
    throw err; // hors fenêtre SIE : on propage l'erreur
  }
}

export { get, store };
```

Trace de lecture — c'est ce que le coach te fera commenter :

- **Étape 3** est le cœur du SWV : `revalidateInBackground` n'est **pas** `await`é. L'utilisateur reçoit `entry.body` immédiatement ; le fetch continue derrière. C'est là qu'est la latence 0 perçue.
- **Étape 4 → `catch`** est le cœur de SIE : quand `fetchOrigin` rejette (origine down) et qu'on est encore dans la fenêtre `sie`, on renvoie le stale au lieu de throw.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Confondre le SWR HTTP (directive) et le SWR applicatif (lib)

```
"J'utilise stale-while-revalidate"  <- AMBIGU
  -> la directive Cache-Control (RFC 5861), appliquée par le navigateur/CDN ?
  -> ou la lib swr / TanStack Query, qui cache en RAM côté React ?
```

Ce sont deux couches distinctes (voir 2.6). La directive vit dans le **cache HTTP** (survit au reload, partageable par un CDN) et ne demande **aucun code client**. La lib vit dans la **mémoire de l'app** (vidée au reload, par onglet) et ignore les en-têtes HTTP. On peut utiliser les deux ensemble. Quand quelqu'un dit « SWR », demande **quelle couche**.

### PIÈGE #2 — Croire que le premier utilisateur après expiration voit du frais

```
Faux : "stale-while-revalidate rend le contenu toujours frais"
Vrai : le premier accès dans la fenêtre SWV voit du STALE ; c'est le SUIVANT qui voit du frais.
```

Le SWR **répond d'abord, revalide ensuite**. Il échange délibérément un peu de fraîcheur contre une latence nulle. Si le contenu ne doit **jamais** être servi périmé, SWR est le mauvais outil : passe en `no-cache` + ETag (revalidation bloquante) ou `no-store`.

### PIÈGE #3 — Mal calculer la fenêtre stale

```
Cache-Control: max-age=60, stale-while-revalidate=120

❌ "le stale est servable jusqu'à 120 s"
✅ le stale est servable de 60 s à 60+120 = 180 s après stockage.
```

La fenêtre SWV (et SIE) part de la **fin du `max-age`**, pas du stockage. `stale-while-revalidate` seul, sans `max-age`, équivaut à `max-age=0` → tout est stale immédiatement, revalidé en fond dès la 1re requête suivante.

### PIÈGE #4 — Utiliser SWR sur des données sensibles

```
❌ Cache-Control: max-age=30, stale-while-revalidate=300   sur /api/checkout/total
```

Servir un montant, un solde ou un stock périmé peut induire une **décision erronée** de l'utilisateur. Pour tout ce qui touche argent/sécurité/temps réel : `no-store` (jamais caché) ou `no-cache` + ETag (toujours revalidé avant usage). SWR est réservé au contenu qui **tolère** un décalage.

### PIÈGE #5 — Croire que `stale-if-error` remplace `stale-while-revalidate`

```
stale-while-revalidate  -> cas NORMAL : origine joignable, on masque la latence
stale-if-error          -> cas PANNE  : origine renvoie 500/502/503/504 ou timeout
```

Ce sont deux moments différents (fonctionnement normal vs incident). L'un n'implique pas l'autre. La combinaison des deux + `max-age` couvre les trois cas (frais / stale normal / panne) et c'est la configuration recommandée pour du contenu tolérant au décalage.

### PIÈGE #6 — Attendre (`await`) la revalidation en arrière-plan

```
❌ await revalidateInBackground(key)   // on retombe dans une revalidation bloquante !
✅ revalidateInBackground(key)         // fire-and-forget : c'est ça, le SWR
```

Si tu `await` le fetch de revalidation, tu détruis tout l'intérêt : l'utilisateur attend de nouveau l'origine. Le SWR **repose** sur le fait que la revalidation n'est pas attendue.

---

## 5. Ancrage TribuZen

Deux usages directs dans le produit, sur la même famille de directives.

**Vitesse — SWR sur les listes de familles et d'activités.** Les endpoints `GET /api/families/:id/activities` et `GET /api/families` renvoient `Cache-Control: max-age=60, stale-while-revalidate=300`. Une liste d'activités tolère parfaitement 1 à 5 minutes de décalage : l'utilisateur voit **instantanément** la dernière liste connue (latence 0 perçue), et la revalidation `304`/`200` se fait en tâche de fond via l'ETag du module 05. Combiné au CDN du module 08, ces réponses sont même partagées entre familles là où c'est du contenu public.

**Résilience — stale-if-error si l'API est down.** On ajoute `stale-if-error=86400` sur ces mêmes listes. Si l'API TribuZen renvoie `502`/`503` (déploiement, incident) ou n'est pas joignable (timeout), l'app continue d'afficher la dernière liste connue au lieu d'un écran d'erreur. Pour une app familiale consultée en mobilité (réseau instable, API pas toujours joignable), c'est la différence entre « l'app marche encore » et « l'app est cassée ».

Ce qu'on **ne** met **jamais** en SWR côté TribuZen : les notifications temps réel (`no-store`), et toute vue de solde/paiement éventuelle (`no-store`). Le curseur SWR est réservé au contenu affichable-même-un-peu-vieux.

En parallèle, le **front** React de TribuZen utilisera le SWR **applicatif** (TanStack Query, module React 23) par-dessus ces endpoints : `staleTime` aligné sur le `max-age`, `refetchOnWindowFocus` pour rafraîchir au retour sur l'app. Les deux couches se cumulent — le CDN masque la latence réseau, la lib masque la latence entre navigations.

Fichiers cibles dans `smaurier/tribuzen` :
```
tribuzen/src/server/
  routes/
    families.list.ts        # GET /families        -> max-age + SWR + SIE
    families.activities.ts  # GET /families/:id/activities -> max-age + SWR + SIE
  lib/
    cacheControl.ts         # helper qui assemble la politique (fresh/swr/sie)
```

---

## 6. Points clés

1. `stale-while-revalidate=N` autorise le cache à servir la copie stale **immédiatement** puis à revalider en arrière-plan → latence 0 perçue, au prix d'un stale pour le premier accès.
2. La fenêtre SWV se compte **à partir de la fin du `max-age`** : `max-age=60, stale-while-revalidate=120` = stale servable de 60 s à 180 s.
3. Le SWR **répond d'abord, revalide ensuite** : le premier accès après expiration voit du stale, les suivants du frais.
4. `stale-if-error=N` sert le stale quand l'origine renvoie **500/502/503/504** ou une erreur locale (timeout, injoignable) → résilience ; des données un peu vieilles valent mieux qu'une erreur.
5. `max-age` + `stale-while-revalidate` + `stale-if-error` se combinent dans un seul en-tête et couvrent frais / stale normal / panne — configuration recommandée pour du contenu tolérant.
6. **SWR HTTP** = la directive `Cache-Control` (RFC 5861), appliquée par le navigateur/CDN, sans code client. **SWR applicatif** = une lib (`swr`, TanStack Query) qui cache en RAM côté client. Couches différentes, même pattern, cumulables.
7. SWR convient au contenu qui **tolère un décalage** (listes, catalogues, fils) ; il est proscrit pour l'argent, la sécurité et le temps réel (`no-store` / `no-cache`).
8. La revalidation en arrière-plan ne doit **jamais** être `await`ée : la nature fire-and-forget est ce qui donne la latence 0.

---

## 7. Seeds Anki

```
Que fait la directive Cache-Control: stale-while-revalidate=N ?|Elle autorise le cache à servir la copie stale immédiatement (sans attendre le réseau) puis à revalider en arrière-plan pendant N secondes après la fin du max-age. Résultat : latence 0 perçue, au prix d'un stale pour le premier accès. Définie par la RFC 5861.
À partir de quand se compte la fenêtre stale-while-revalidate ?|À partir de la FIN du max-age, pas du stockage. max-age=60, stale-while-revalidate=120 => stale servable de 60 s à 60+120=180 s après stockage.
Qui voit du contenu frais et qui voit du stale avec SWR ?|Le premier accès après expiration du max-age voit du STALE (on répond d'abord, on revalide ensuite). Les accès suivants bénéficient de la version rafraîchie en arrière-plan.
À quoi sert stale-if-error=N et sur quelles erreurs s'active-t-il ?|Si la revalidation échoue, le cache sert la copie stale pendant N secondes au lieu de propager l'erreur. MDN considère comme erreur un statut 500/502/503/504 OU une erreur générée localement (timeout, origine injoignable). Filet de résilience : mieux vaut des données un peu vieilles qu'une erreur.
Différence entre stale-while-revalidate et stale-if-error ?|SWR gère le cas NORMAL (origine joignable) en masquant la latence de revalidation. SIE gère le cas PANNE (origine down / 5xx / timeout) en masquant l'erreur. Moments différents ; on les combine avec max-age pour couvrir frais/stale/panne.
Quelle est la différence entre le SWR HTTP et le SWR applicatif ?|SWR HTTP = la directive Cache-Control (RFC 5861), appliquée par le cache HTTP (navigateur/CDN), sans code client, survit au reload. SWR applicatif = une lib JS (swr, TanStack Query) qui cache en RAM côté client, vidée au reload, ignore les en-têtes. Même pattern, couches différentes, cumulables.
Quand NE PAS utiliser SWR ?|Quand un contenu stale peut tromper l'utilisateur ou fausser une décision : argent (solde, panier, checkout), sécurité/auth, temps réel (chat, notifications). Là on met no-store ou no-cache + ETag. SWR est réservé au contenu qui tolère un décalage.
Pourquoi ne faut-il jamais await la revalidation en arrière-plan du SWR ?|Parce que await la rend bloquante : l'utilisateur attend de nouveau l'origine, ce qui détruit la latence 0. Le SWR repose sur un fetch fire-and-forget déclenché APRÈS avoir déjà répondu au client.
Comment écrire un Cache-Control qui masque à la fois la latence ET les pannes ?|Combiner les trois directives : Cache-Control: max-age=60, stale-while-revalidate=300, stale-if-error=86400. Frais 60 s, stale servi + revalidé en fond jusqu'à 360 s, et stale servi jusqu'à 24 h si l'origine est down.
```

---

## Pont vers le lab

> Lab associé : `11-http-caching/labs/lab-06-stale-while-revalidate/README.md`. Configurer une politique SWR + stale-if-error sur un endpoint Node, observer avec `curl -I` et l'onglet Network de DevTools, puis écrire le **moteur de cache aval** (le rôle du CDN/navigateur) et voir, au fil du temps, le stale servi puis la revalidation en tâche de fond — et le stale-if-error quand l'origine est coupée.
