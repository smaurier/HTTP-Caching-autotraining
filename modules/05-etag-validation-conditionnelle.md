---
titre: ETag et validation conditionnelle
cours: 11-http-caching
notions: [revalidation d'une ressource stale, ETag fort vs faible, "préfixe W/ (weak)", génération d'ETag par hash de contenu vs version applicative, Last-Modified, If-Modified-Since, If-None-Match, weak comparison algorithm, flux 304 Not Modified, précédence de If-None-Match sur If-Modified-Since, combinaison Cache-Control plus ETag]
outcomes:
  - sait émettre un ETag (fort ou faible) et répondre 304 Not Modified sur une revalidation If-None-Match
  - sait choisir entre ETag fort et ETag faible et générer chacun (hash de contenu ou version applicative)
  - sait poser Last-Modified / If-Modified-Since en fallback et connaît sa précédence face à If-None-Match
  - sait combiner Cache-Control (fraîcheur) et ETag (revalidation) sur un même endpoint
prerequis: [00-prerequis-et-vue-ensemble, 01-protocole-http, 02-http2-http3, 03-en-tetes-http, 04-cache-control]
next: 06-stale-while-revalidate
libs: []
tribuzen: ETag et 304 sur les réponses API TribuZen — revalidation de la liste des membres d'une famille quand elle n'a pas changé
last-reviewed: 2026-07
---

# ETag et validation conditionnelle

> **Outcomes — tu sauras FAIRE :** émettre un ETag et répondre `304 Not Modified` sur une revalidation `If-None-Match`, choisir et générer un ETag fort ou faible, poser `Last-Modified`/`If-Modified-Since` en fallback, combiner `Cache-Control` et ETag sur un endpoint.
> **Difficulté :** :star::star::star:
>
> **Portée :** ce module couvre la **validation conditionnelle en lecture** — revalider une copie périmée sans re-télécharger le corps. Il s'appuie sur la **fraîcheur** (`Cache-Control`, `max-age`) vue au **module 04** sans la re-expliquer. Le motif symétrique côté écriture (`If-Match` → `412` pour la concurrence optimiste) sort de ce module. La suite logique (`stale-while-revalidate`, servir du stale pendant qu'on revalide) est le **module 06**.

## 1. Cas concret d'abord

Tu bosses sur l'API TribuZen. L'app mobile affiche la liste des membres d'une famille et la rafraîchit toutes les 30 secondes. Le module 04 (`Cache-Control: max-age=30`) rend la copie **fraîche** pendant 30 s — mais dès qu'elle devient **périmée** (`stale`), le mobile refait un `GET` complet.

Problème : la liste des membres ne change quasiment jamais. Pourtant, chaque rafraîchissement re-télécharge le JSON complet.

```
Sans validation conditionnelle — la liste est stable mais on la re-télécharge
=============================================================================
GET /api/families/42/members        -> 200 OK  (8 Ko)   [00:00]
... 30 s plus tard, copie stale ...
GET /api/families/42/members        -> 200 OK  (8 Ko)   [00:30]   rien n'a changé !
GET /api/families/42/members        -> 200 OK  (8 Ko)   [01:00]   rien n'a changé !
GET /api/families/42/members        -> 200 OK  (8 Ko)   [01:30]   rien n'a changé !

Transféré : 32 Ko dont 24 Ko strictement inutiles.
```

Sur un forfait mobile limité et un réseau lent, re-télécharger 8 Ko d'un contenu identique est du gaspillage pur. On voudrait que le serveur puisse répondre « c'est encore bon, garde ta copie » **sans renvoyer les octets**.

Ce module donne l'outil qui règle ça : la **revalidation** (valider la copie stale au lieu de la re-télécharger → `304 Not Modified`). Elle repose sur un **validateur** attaché à la réponse : l'ETag (ou, en fallback, la date `Last-Modified`).

---

## 2. Théorie complète, concise

### 2.1 Fresh, stale, revalidation

Rappel du module 04 : une réponse cachée est **fraîche** (`fresh`) tant que son âge est sous `max-age`, puis devient **périmée** (`stale`). Une copie stale n'est pas *fausse* — elle est juste *à vérifier*.

**Revalider**, c'est demander au serveur « ma copie est-elle toujours bonne ? » **sans re-télécharger le corps**. Deux issues :

- Rien n'a changé → `304 Not Modified`, sans corps. Le client réutilise sa copie et repart pour un cycle de fraîcheur.
- Ça a changé → `200 OK` avec le nouveau corps et un nouveau validateur.

> Point clé à ancrer tout de suite : le `304` **économise le corps (body), pas le round-trip**. Il y a toujours un aller-retour réseau. Ce qu'on économise, c'est le transfert des octets du corps — souvent 95 à 99,99 % de la réponse.

### 2.2 Le validateur ETag

Un **ETag** (Entity Tag) est une chaîne opaque qui identifie une version précise d'une ressource. MDN : *« Entity tag that uniquely represents the requested resource. It is a string of ASCII characters placed between double quotes »*. Les **guillemets doubles font partie de la syntaxe**.

```
ETag: "33a64df551425fcc"     <- souvent un hash tronqué du contenu
ETag: "v2"                   <- ou une version applicative
ETag: W/"33a64df551425fcc"   <- préfixe W/ = ETag faible (weak)
```

Règles :
- Le client ne doit **jamais interpréter** le contenu de l'ETag (c'est opaque). MDN : *« The method by which ETag values are generated is not specified. »*
- Deux représentations identiques doivent porter le **même** ETag.
- Un changement de contenu **doit** changer l'ETag.

### 2.3 ETag fort vs ETag faible (`W/`)

Le préfixe `W/` (**case-sensitive**, majuscule W + slash) marque un validateur **faible**. MDN, verbatim : *« Weak ETag values of two representations of the same resources might be semantically equivalent, but not byte-for-byte identical. This means weak ETags prevent caching when byte range requests are used, but strong ETags mean range requests can still be cached. »*

| | ETag fort | ETag faible (`W/`) |
|---|---|---|
| Écriture | `"abc"` | `W/"abc"` |
| Garantit | identité **octet par octet** | équivalence **sémantique** |
| Requêtes `Range` (téléchargement partiel) mises en cache | oui | non |
| Cas typique | fichier statique, réponse figée | HTML dynamique avec un timestamp ou un ordre de champs qui varie sans changer le sens |

Exemple : deux rendus HTML identiques à l'affichage mais dont un commentaire `<!-- généré à ... -->` diffère sont **différents en fort**, **équivalents en faible**. Pour la revalidation de cache classique, un ETag faible suffit et est même recommandé quand la sérialisation n'est pas déterministe. Dès que tu veux servir des requêtes `Range` mises en cache, il faut un ETag **fort**.

### 2.4 Générer un ETag : hash de contenu vs version applicative

Deux grandes stratégies.

```js
import crypto from 'node:crypto';

// STRATÉGIE A — hash du contenu (précision parfaite, coûte du CPU)
function etagFromContent(body) {
  const hash = crypto.createHash('sha256').update(body).digest('hex').slice(0, 16);
  return `"${hash}"`;               // fort : dérivé des octets exacts
}

// STRATÉGIE B — version applicative (zéro calcul, exige un champ version en base)
function etagFromVersion(row) {
  // row.version incrémenté à chaque UPDATE, ou updatedAt en base36
  return `W/"${row.id}-${row.version}"`;   // faible : on garantit le sens, pas les octets
}
```

- **Hash de contenu** : impossible de se tromper (même octets → même ETag), mais tu payes le hash à chaque réponse. Idéal pour des payloads petits/moyens (réponses API JSON).
- **Version** : gratuit à calculer si tu as déjà un `version`/`updatedAt` en base, mais tu dois discipliner **chaque écriture** pour incrémenter la version. Idéal quand la ressource vient d'une base de données versionnée.

### 2.5 Last-Modified et If-Modified-Since (le validateur par date)

Validateur alternatif, fondé sur une **date** :

```
Last-Modified: Thu, 07 Mar 2026 10:30:00 GMT
```

Le client revalide en renvoyant cette date dans `If-Modified-Since`. MDN, verbatim : *« The server sends back the requested resource, with a 200 status, only if it has been modified after the date in the If-Modified-Since header. If the resource has not been modified since, the response is a 304 without any body »*. `If-Modified-Since` **ne s'utilise qu'avec `GET` ou `HEAD`**.

Limites structurelles :
- **Précision à la seconde** : deux modifications dans la même seconde sont indistinguables.
- **`touch` sans changement** : un fichier re-touché change de date sans changer de contenu → fausse invalidation.
- **Horloges désynchronisées** entre serveurs derrière un load balancer → dates incohérentes.

Conclusion : `Last-Modified` est un **fallback** utile (pour les clients ou proxys qui ne gèrent pas l'ETag), pas le mécanisme principal. La spec recommande d'envoyer **les deux** quand c'est possible.

### 2.6 If-None-Match : le flux 304 de revalidation

`If-None-Match` est le pendant lecture de l'ETag. Le client renvoie l'ETag qu'il détient : « réponds-moi **sauf si** l'ETag correspond encore ».

```
1) Premier chargement
   GET /api/families/42/members
   -> 200 OK
      ETag: "m-42-v7"
      Cache-Control: max-age=30

2) Copie stale -> le client revalide
   GET /api/families/42/members
   If-None-Match: "m-42-v7"          <- "j'ai la v7, encore bonne ?"
   -> 304 Not Modified               <- PAS de corps, on garde la copie locale
      ETag: "m-42-v7"
      Cache-Control: max-age=30       <- le timer de fraîcheur repart

3) Un membre a été ajouté -> l'ETag a changé
   GET /api/families/42/members
   If-None-Match: "m-42-v7"
   -> 200 OK                         <- nouveau corps
      ETag: "m-42-v8"
```

**Ce que renvoie exactement le `304`** (MDN, verbatim) : *« the server must return a 304 Not Modified and any of the following header fields that would have been sent in a 200 response to the same request: `Cache-Control`, `Content-Location`, `Date`, `ETag`, `Expires`, and `Vary`. »* Aucun corps — c'est là qu'est l'économie des 8 Ko.

Deux détails de comparaison à connaître :
- **Comparaison faible.** MDN : *« The comparison with the stored ETag uses the weak comparison algorithm, meaning two files are considered identical if the content is equivalent »*. Un `If-None-Match: "abc"` matche donc aussi un ETag stocké `W/"abc"`.
- **Liste et wildcard.** `If-None-Match` peut lister plusieurs ETags séparés par des virgules (`If-None-Match: W/"67ab43", "54ed21"`), ou `*`. Le `*` sert surtout à l'upload (`PUT`) pour vérifier qu'une ressource n'existe pas déjà.

### 2.7 Précédence : If-None-Match l'emporte sur If-Modified-Since

Quand une requête porte **les deux** en-têtes, l'ETag gagne. MDN (page `If-None-Match`), verbatim : *« When used in combination with If-Modified-Since, If-None-Match has precedence if the server supports it. »* Réciproquement, page `If-Modified-Since` : *« When used in combination with If-None-Match, it is ignored, unless the server doesn't support If-None-Match. »*

Traduction pratique : un client envoie souvent les deux (l'ETag qu'il a stocké **et** la date). Un serveur qui gère l'ETag doit évaluer `If-None-Match` **d'abord** et **ignorer** `If-Modified-Since`. `If-Modified-Since` ne sert de filet que pour les serveurs qui ne savent pas comparer d'ETag.

### 2.8 Combiner Cache-Control et ETag

Les deux sont complémentaires, pas concurrents :

- **`Cache-Control`** décide **combien de temps** on peut servir sans même demander (fraîcheur / `max-age`).
- **ETag** décide **quoi faire** une fois stale : revalider peu coûteusement (`304`) au lieu de re-télécharger.

```
Cache-Control: no-cache, ETag: "v7"
  -> revalider À CHAQUE FOIS (jamais servi sans check), mais en 304 si inchangé.

Cache-Control: max-age=30, ETag: "v7"
  -> servi sans réseau pendant 30 s, puis revalidation 304/200 ensuite.
```

`no-cache` ne veut **pas** dire « ne cache pas » : il veut dire « cache, mais revalide avant chaque usage ». Combiné à un ETag, il donne toujours du contenu à jour au prix d'un simple `304` la plupart du temps. (La vraie désactivation, c'est `no-store`.)

---

## 3. Worked examples

### Exemple 1 — Endpoint TribuZen qui répond 304 (If-None-Match)

Liste des membres d'une famille, avec ETag fort par hash de contenu et revalidation.

```js
// members-endpoint.mjs — Node http natif, zéro dépendance
import http from 'node:http';
import crypto from 'node:crypto';

// "Base de données" en mémoire
const families = {
  42: [
    { id: 'm1', name: 'Alice', role: 'admin' },
    { id: 'm2', name: 'Bob', role: 'member' },
  ],
};

// ETag FORT dérivé du corps exact qu'on va renvoyer
function strongEtag(body) {
  const hash = crypto.createHash('sha256').update(body).digest('hex').slice(0, 16);
  return `"${hash}"`;                         // guillemets = partie de la syntaxe
}

const server = http.createServer((req, res) => {
  const m = (req.url ?? '').match(/^\/api\/families\/(\d+)\/members$/);
  if (req.method === 'GET' && m) {
    const members = families[m[1]];
    if (!members) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end('{"error":"famille inconnue"}');
    }

    const body = JSON.stringify(members);
    const etag = strongEtag(body);            // même corps -> même ETag

    // --- Revalidation : le client détient-il déjà cette version ? ---
    // If-None-Match peut lister plusieurs ETags séparés par des virgules.
    const inm = req.headers['if-none-match'];
    if (inm && inm.split(',').map((s) => s.trim()).includes(etag)) {
      // Rien n'a changé : 304 SANS corps. On renvoie les en-têtes qu'un 200
      // aurait portés (ETag + Cache-Control) pour relancer le cycle.
      res.writeHead(304, { ETag: etag, 'Cache-Control': 'max-age=30' });
      return res.end();                       // pas de body -> on économise les octets
    }

    // --- Réponse complète 200 ---
    res.writeHead(200, {
      'Content-Type': 'application/json',
      ETag: etag,                             // le client stockera cet ETag
      'Cache-Control': 'max-age=30',          // fraîcheur 30 s, puis revalidation
    });
    res.end(body);
  } else {
    res.writeHead(404).end();
  }
});

server.listen(3000);
```

Vérification au `curl` :

```bash
# 1) Premier GET : 200 + ETag
curl -i http://localhost:3000/api/families/42/members
# HTTP/1.1 200 OK
# ETag: "9f2c1a4b7d3e5f80"

# 2) Revalidation avec l'ETag : 304, aucun corps
curl -i -H 'If-None-Match: "9f2c1a4b7d3e5f80"' \
     http://localhost:3000/api/families/42/members
# HTTP/1.1 304 Not Modified
# (pas de corps)
```

Le second appel fait bien un aller-retour réseau, mais ne transfère pas les octets de la liste : c'est exactement l'économie visée.

### Exemple 2 — Ajouter Last-Modified/If-Modified-Since en fallback (et respecter la précédence)

On enrichit le même endpoint avec une date de dernière modification. La règle : si `If-None-Match` est présent, on l'évalue **et on ignore** `If-Modified-Since` (§2.7).

```js
// members-endpoint.mjs — extrait enrichi
const families = {
  42: {
    members: [
      { id: 'm1', name: 'Alice', role: 'admin' },
      { id: 'm2', name: 'Bob', role: 'member' },
    ],
    // date de dernière modification de CETTE ressource (mise à jour à chaque écriture)
    lastModified: new Date('2026-03-07T10:30:00Z'),
  },
};

function handleMembers(req, res, fam) {
  const body = JSON.stringify(fam.members);
  const etag = strongEtag(body);
  const lastModified = fam.lastModified.toUTCString(); // format HTTP-date obligatoire

  const inm = req.headers['if-none-match'];
  const ims = req.headers['if-modified-since'];

  // 1) ETAG D'ABORD — si présent, il a la précédence et If-Modified-Since est ignoré.
  if (inm) {
    if (inm.split(',').map((s) => s.trim()).includes(etag)) {
      res.writeHead(304, { ETag: etag, 'Last-Modified': lastModified, 'Cache-Control': 'max-age=30' });
      return res.end();
    }
  } else if (ims) {
    // 2) FALLBACK par date — seulement si aucun ETag n'a été fourni.
    //    304 si la ressource n'a pas changé APRÈS la date envoyée par le client.
    //    Comparaison à la seconde -> on tronque les millisecondes des deux côtés.
    const since = Math.floor(Date.parse(ims) / 1000);
    const modified = Math.floor(fam.lastModified.getTime() / 1000);
    if (!Number.isNaN(since) && modified <= since) {
      res.writeHead(304, { ETag: etag, 'Last-Modified': lastModified, 'Cache-Control': 'max-age=30' });
      return res.end();
    }
  }

  // Sinon : réponse complète, avec LES DEUX validateurs.
  res.writeHead(200, {
    'Content-Type': 'application/json',
    ETag: etag,
    'Last-Modified': lastModified,
    'Cache-Control': 'max-age=30',
  });
  res.end(body);
}
```

```bash
# Fallback par date : le client n'a pas d'ETag, seulement la date
curl -i -H 'If-Modified-Since: Thu, 07 Mar 2026 10:30:00 GMT' \
     http://localhost:3000/api/families/42/members
# HTTP/1.1 304 Not Modified   (la ressource n'a pas changé depuis cette date)

# Les DEUX en-têtes ensemble : l'ETag mène. Un If-Modified-Since même "vieux"
# est ignoré, seul le match d'ETag décide.
curl -i -H 'If-None-Match: "9f2c1a4b7d3e5f80"' \
        -H 'If-Modified-Since: Thu, 01 Jan 1970 00:00:00 GMT' \
        http://localhost:3000/api/families/42/members
# HTTP/1.1 304 Not Modified   (décidé par l'ETag, pas par la date)
```

`Date.parse` sur une HTTP-date GMT est fiable ; on tronque à la seconde des deux côtés pour coller à la précision réelle de `Last-Modified`.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Croire que le 304 économise le round-trip

```
Faux : "304 = pas de requête réseau"
Vrai : 304 = requête réseau BEL ET BIEN envoyée, mais réponse SANS corps.
```

Le `304` économise le transfert du **corps**, pas l'aller-retour. Pour supprimer aussi le round-trip, il faut de la **fraîcheur** (`max-age` non expiré) : tant que la copie est fraîche, le client la sert sans réseau. ETag et `max-age` couvrent donc deux moments différents (stale vs fresh) — d'où l'intérêt de les combiner (§2.8).

### PIÈGE #2 — Oublier les guillemets ou croire fort/faible interchangeables partout

```
❌ ETag: abc123           <- invalide : les guillemets font partie de la syntaxe
✅ ETag: "abc123"
```

Un ETag **faible** (`W/"…"`) empêche la mise en cache des requêtes `Range` (MDN) : la spec exige un ETag **fort** pour garantir que les octets partiels correspondent. Pour la revalidation simple d'un JSON d'API, fort comme faible conviennent — mais dès que du `Range` entre en jeu (vidéo, gros fichiers), il faut du fort.

### PIÈGE #3 — Ignorer la comparaison faible de If-None-Match

`If-None-Match` compare avec le **weak comparison algorithm** (MDN). Concrètement : `"abc"` et `W/"abc"` **matchent** pour une revalidation. Ne code pas une égalité stricte de chaîne qui distinguerait `"abc"` de `W/"abc"` — tu renverrais un `200` inutile là où un `304` était attendu.

### PIÈGE #4 — Renvoyer un corps avec un 304

```
❌ res.writeHead(304, {...}); res.end(JSON.stringify(data));  // corps sur un 304
✅ res.writeHead(304, {...}); res.end();                       // AUCUN corps
```

Un `304` **ne doit jamais** avoir de corps — c'est toute sa raison d'être. Il porte seulement les en-têtes qu'un `200` aurait renvoyés (`ETag`, `Cache-Control`, `Date`, `Vary`…). Un corps sur un `304` viole la spec et certains clients l'ignoreront ou planteront.

### PIÈGE #5 — Croire que `no-cache` désactive le cache

```
no-cache  = "cache autorisé, mais REVALIDE avant chaque usage" (souvent -> 304)
no-store  = "ne stocke rien du tout" (ça, c'est la vraie désactivation)
```

`no-cache` + ETag est une excellente combinaison pour du contenu qui doit toujours être à jour mais change rarement : on paie un `304` léger, pas un `200` complet.

### PIÈGE #6 — Laisser If-Modified-Since décider quand un ETag est présent

Si tu évalues `If-Modified-Since` **avant** `If-None-Match`, tu inverses la précédence de la spec. MDN : `If-None-Match` a la précédence ; `If-Modified-Since` est **ignoré** quand l'ETag est géré. Évalue toujours l'ETag d'abord ; la date n'est qu'un filet pour les clients sans ETag.

### PIÈGE #7 — `Last-Modified` comme validateur principal

La précision à la seconde et la sensibilité au `touch` en font un mauvais validateur primaire. Utilise l'ETag en premier, `Last-Modified` seulement en fallback complémentaire (et rappelle-toi : `If-Modified-Since` ne marche qu'avec `GET`/`HEAD`).

---

## 5. Ancrage TribuZen

Usage direct dans le produit : la **liste des membres** d'une famille.

**Lecture — 304 sur la liste des membres.** L'endpoint `GET /api/families/:id/members` renvoie un ETag (hash du JSON) **et** un `Last-Modified`. L'app mobile rafraîchit toutes les 30 s ; comme la liste change rarement, la quasi-totalité des rafraîchissements repartent en `304 Not Modified` sans corps. On combine `Cache-Control: max-age=30` (fraîcheur, zéro réseau les 30 premières secondes) et l'ETag (revalidation bon marché ensuite). Le client renvoie automatiquement l'ETag stocké en `If-None-Match` à chaque refresh.

Concrètement, sur un forfait mobile : au lieu de ~8 Ko toutes les 30 s, on transfère un `304` de quelques dizaines d'octets tant que personne n'ajoute ou ne retire de membre. Le jour où un parent invite un nouveau membre, la ressource change → nouvel ETag → le prochain refresh repart en `200` avec la liste à jour, puis re-cale sur des `304`.

Le validateur `Last-Modified` reste posé en fallback pour les vieux proxys d'entreprise (réseau d'une école, d'un club sportif) qui n'enverraient pas l'`If-None-Match` mais gèrent l'`If-Modified-Since`.

Fichiers cibles dans `smaurier/tribuzen` :
```
tribuzen/src/server/
  lib/
    etag.ts                 # strongEtag(body) + versionEtag(row)
  routes/
    families.members.ts     # GET liste -> ETag + Last-Modified + 304
```

---

## 6. Points clés

1. Revalider une copie stale, c'est demander « encore bonne ? » sans re-télécharger le corps ; deux issues : `304` (inchangé) ou `200` (nouveau contenu).
2. Le `304 Not Modified` économise le **corps**, pas le round-trip ; supprimer le round-trip relève de la fraîcheur (`max-age`), pas de l'ETag.
3. Un ETag est une chaîne opaque **entre guillemets** ; **fort** = identité octet par octet (requis pour cacher du `Range`), **faible** `W/"…"` = équivalence sémantique (suffit pour la revalidation).
4. On génère un ETag par **hash de contenu** (précision parfaite, coûte du CPU) ou par **version applicative** (gratuit, exige un champ version discipliné).
5. `If-None-Match` déclenche la revalidation en lecture ; sa comparaison est **faible** (`"abc"` matche `W/"abc"`) et le `304` ne renvoie **aucun corps**, seulement les en-têtes d'un `200`.
6. `Last-Modified`/`If-Modified-Since` (GET/HEAD seulement) est un fallback à précision limitée (seconde, `touch`, horloges) ; l'ETag est prioritaire.
7. Quand les deux sont envoyés, **`If-None-Match` a la précédence** et `If-Modified-Since` est ignoré — évalue toujours l'ETag d'abord.
8. `Cache-Control` (combien de temps sans check) et ETag (quoi faire une fois stale) sont complémentaires ; `no-cache` = revalider, pas désactiver (c'est `no-store`).

---

## 7. Seeds Anki

```
Qu'économise exactement une réponse 304 Not Modified ?|Le corps (body) de la réponse, pas le round-trip. La requête réseau est bien envoyée ; seul le transfert des octets du contenu est évité (souvent 95-99% de la réponse).
Différence entre ETag fort et ETag faible (W/) ?|Fort ("abc") = identité octet par octet, permet de cacher les requêtes Range. Faible (W/"abc") = équivalence sémantique, empêche le cache des requêtes Range mais suffit pour la revalidation classique.
Deux stratégies pour générer un ETag et leur compromis ?|Hash de contenu : précision parfaite mais coûte du CPU à chaque réponse. Version applicative (updatedAt/version en base) : gratuit à calculer mais exige d'incrémenter la version à chaque écriture.
À quoi sert If-None-Match et que renvoie le serveur si l'ETag correspond ?|C'est la revalidation en lecture : le client renvoie l'ETag qu'il détient. Si l'ETag correspond encore (comparaison faible), le serveur répond 304 Not Modified sans corps ; sinon 200 avec le nouveau contenu.
Quels en-têtes un 304 doit-il renvoyer, et lesquels sont interdits ?|Un 304 ne porte AUCUN corps. Il renvoie les en-têtes qu'un 200 aurait envoyés : Cache-Control, Content-Location, Date, ETag, Expires, Vary. Pas de corps ni de Content-Length du corps.
Que se passe-t-il si une requête envoie à la fois If-None-Match et If-Modified-Since ?|If-None-Match a la précédence : le serveur évalue l'ETag et IGNORE If-Modified-Since. La date ne sert de fallback que si le serveur ne gère pas l'ETag.
Pourquoi Last-Modified est-il un mauvais validateur principal ?|Précision à la seconde (deux modifs dans la même seconde indistinguables), sensible au touch (date change sans changement de contenu), incohérent avec des horloges désynchronisées, et limité à GET/HEAD. On l'utilise en fallback, l'ETag est prioritaire.
no-cache désactive-t-il le cache ?|Non : no-cache = "cache autorisé mais revalide avant chaque usage" (donne souvent des 304). no-store = ne rien stocker du tout. Combiné à un ETag, no-cache garantit du contenu à jour au prix d'un simple 304.
Comment Cache-Control et ETag se combinent-ils ?|Cache-Control décide combien de temps servir sans check (fraîcheur/max-age) ; l'ETag décide quoi faire une fois stale (revalider à moindre coût via 304). Complémentaires : max-age couvre le fresh, l'ETag couvre le stale.
```

---

## Pont vers le lab

> Lab associé : `11-http-caching/labs/lab-05-etag-validation-conditionnelle/README.md`. Construire un serveur Express qui émet un ETag, répond `304` sur `If-None-Match` (liste des membres inchangée), pose `Last-Modified` en fallback, et observer les statuts réels au `curl` et dans l'onglet Network des DevTools.
