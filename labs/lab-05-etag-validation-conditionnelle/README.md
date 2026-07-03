# Lab 05 — ETag et validation conditionnelle

> **Outcome :** à la fin, tu sais écrire un endpoint **Express** qui émet un ETag, répond `304 Not Modified` sur une revalidation `If-None-Match` (liste inchangée), pose `Last-Modified` en fallback, et respecte la précédence `If-None-Match` > `If-Modified-Since`.
> **Vrai outil :** Node.js + **Express** + `curl -i`/`-v` pour lire les vrais statuts HTTP, puis l'onglet **Network** des DevTools pour voir un `304` en conditions navigateur.
> **Feedback :** le coach valide en session en lisant les statuts HTTP dans `curl -i` et la colonne *Status* du Network — pas de test-runner auto-correcteur.

---

## Énoncé

Tu construis un mini backend TribuZen à une route de lecture autour d'une **famille** (id `42`) :

**`GET /api/families/42/members`** — renvoie la liste des membres avec :
- un **ETag fort** (hash du corps JSON),
- un `Last-Modified` (date de dernière modif de la ressource),
- `Cache-Control: max-age=30`.

Comportement conditionnel attendu :
1. `If-None-Match` correspondant → `304` **sans corps**.
2. `If-Modified-Since` seul (pas d'ETag) et ressource non modifiée depuis → `304` (fallback).
3. **Les deux en-têtes ensemble** → l'ETag décide, `If-Modified-Since` est **ignoré**.
4. Une route de mutation `POST /api/families/42/members` change la liste **et** la date → l'ancien ETag ne produit plus de `304`, la réponse repasse en `200`.

**Objectif pédagogique fort à garder en tête :**
- Le `304` économise le **corps**, pas le round-trip (tu verras la requête partir quand même dans `curl -v`).
- `If-None-Match` a la **précédence** sur `If-Modified-Since` : tu dois évaluer l'ETag d'abord.

### Prérequis

```bash
mkdir lab-etag && cd lab-etag
npm init -y
npm install express
# package.json : ajoute  "type": "module"  pour utiliser import
```

### Starter minimal

Crée `server.js`. Point de départ **volontairement incomplet** — tu écris toute la logique conditionnelle :

```js
// server.js — STARTER (à compléter)
import express from 'express';
import crypto from 'node:crypto';

const app = express();
app.use(express.json());

// État en mémoire
const family = {
  members: [
    { id: 'm1', name: 'Alice', role: 'admin' },
    { id: 'm2', name: 'Bob', role: 'member' },
  ],
  lastModified: new Date('2026-03-07T10:30:00Z'),
};

// TODO 1 : strongEtag(body) -> `"<sha256 tronqué>"`

app.get('/api/families/42/members', (req, res) => {
  // TODO 2 : calculer body + ETag + Last-Modified
  // TODO 3 : If-None-Match d'abord (précédence) -> 304 sans corps
  // TODO 4 : sinon If-Modified-Since en fallback -> 304
  // TODO 5 : sinon 200 avec ETag + Last-Modified + Cache-Control + corps
  res.sendStatus(501);
});

app.post('/api/families/42/members', (req, res) => {
  // TODO 6 : ajouter un membre, mettre à jour lastModified, renvoyer 201
  res.sendStatus(501);
});

app.listen(3000, () => console.log('http://localhost:3000'));
```

> **Note Express :** on désactive/contourne l'ETag automatique d'Express (`app.set('etag', false)` dans le corrigé) pour **poser l'ETag à la main** — c'est l'objet du lab. En production tu peux laisser Express le générer, mais ici on veut voir le mécanisme.

Lance avec `node server.js`.

---

## Étapes (en friction)

1. **Écris `strongEtag(body)`** : `sha256` du corps, tronqué à 16 caractères hex, entouré de guillemets. Même corps → même ETag (c'est le cœur de la revalidation).
2. **Route GET, corps + validateurs** : sérialise `family.members`, calcule l'ETag, formate `Last-Modified` avec `.toUTCString()`.
3. **If-None-Match d'abord** : si présent et qu'un des ETags listés (séparés par des virgules) correspond → `res.status(304)` puis `res.end()` **sans argument**. La précédence impose d'ignorer `If-Modified-Since` dans ce cas.
4. **If-Modified-Since en fallback** : seulement si `If-None-Match` est **absent**. Compare à la seconde (`Math.floor(.../1000)`) ; si la ressource n'a pas changé après la date → `304`.
5. **Sinon 200** : `ETag`, `Last-Modified`, `Cache-Control: max-age=30`, puis le corps.
6. **Vérifie le 304 au curl** : premier `GET` pour lire l'ETag, second `GET` avec `-H 'If-None-Match: "…"'`. Confirme `304` et **zéro corps**. Ajoute `-v` : la requête part bien sur le réseau.
7. **Vérifie la précédence** : envoie les DEUX en-têtes, avec un `If-Modified-Since` volontairement ancien (`Thu, 01 Jan 1970…`). Tu dois quand même obtenir `304` (l'ETag décide).
8. **Écris le POST** : ajoute un membre, mets `lastModified = new Date()`. Après un POST, l'ancien ETag doit repartir en `200`, plus en `304`.
9. **DevTools** : ouvre `http://localhost:3000/api/families/42/members` dans le navigateur, onglet **Network**, coche *Disable cache* décoché, recharge (F5) et observe la colonne *Status* passer à `304` sur le second chargement.

---

## Corrigé complet commenté

```js
// server.js — CORRIGÉ complet
import express from 'express';
import crypto from 'node:crypto';

const app = express();
app.use(express.json());
// On gère l'ETag NOUS-MÊMES : on coupe celui qu'Express ajoute par défaut.
app.set('etag', false);

// --- État en mémoire (tient lieu de base de données) ---
const family = {
  members: [
    { id: 'm1', name: 'Alice', role: 'admin' },
    { id: 'm2', name: 'Bob', role: 'member' },
  ],
  lastModified: new Date('2026-03-07T10:30:00Z'),
};

// ETag FORT : dérivé des octets exacts du corps.
// Même corps -> même ETag ; un octet change -> ETag différent.
// Les guillemets font partie de la syntaxe de l'en-tête.
function strongEtag(body) {
  const hash = crypto.createHash('sha256').update(body).digest('hex').slice(0, 16);
  return `"${hash}"`;
}

app.get('/api/families/42/members', (req, res) => {
  const body = JSON.stringify(family.members);
  const etag = strongEtag(body);
  const lastModified = family.lastModified.toUTCString(); // format HTTP-date obligatoire

  const inm = req.headers['if-none-match'];
  const ims = req.headers['if-modified-since'];

  // Les en-têtes de validation qu'un 304 doit renvoyer (comme un 200 l'aurait fait).
  const validators = {
    ETag: etag,
    'Last-Modified': lastModified,
    'Cache-Control': 'max-age=30',
  };

  // 1) ETAG D'ABORD — précédence : si If-None-Match est présent,
  //    on l'évalue et on IGNORE If-Modified-Since.
  if (inm) {
    // If-None-Match peut lister plusieurs ETags séparés par des virgules.
    const match = inm.split(',').map((s) => s.trim()).includes(etag);
    if (match) {
      // Rien n'a changé : 304 SANS corps. Le round-trip a bien eu lieu ;
      // on économise seulement les octets du corps.
      res.writeHead(304, validators);
      return res.end(); // AUCUN argument -> pas de corps (obligatoire sur un 304)
    }
  } else if (ims) {
    // 2) FALLBACK par date — seulement si aucun ETag n'a été fourni.
    //    304 si la ressource n'a pas été modifiée APRÈS la date reçue.
    //    Comparaison à la seconde (Last-Modified n'a pas les millisecondes).
    const since = Math.floor(Date.parse(ims) / 1000);
    const modified = Math.floor(family.lastModified.getTime() / 1000);
    if (!Number.isNaN(since) && modified <= since) {
      res.writeHead(304, validators);
      return res.end();
    }
  }

  // 3) Réponse complète 200, avec LES DEUX validateurs.
  res.writeHead(200, { 'Content-Type': 'application/json', ...validators });
  res.end(body);
});

// Mutation : change la liste ET la date -> l'ancien ETag devient invalide.
app.post('/api/families/42/members', (req, res) => {
  const { name, role = 'member' } = req.body ?? {};
  if (!name) return res.status(400).json({ error: 'name requis' });

  family.members.push({ id: `m${family.members.length + 1}`, name, role });
  family.lastModified = new Date(); // nouvelle date -> nouvel ETag au prochain GET
  res.status(201).json(family.members);
});

app.listen(3000, () => console.log('http://localhost:3000'));
```

### Vérification manuelle (ce que le coach regarde)

```bash
# 1) Premier GET : 200 + ETag. Note la valeur EXACTE de l'ETag.
curl -i http://localhost:3000/api/families/42/members
# HTTP/1.1 200 OK
# ETag: "8d0c...."
# Last-Modified: Sat, 07 Mar 2026 10:30:00 GMT
# Cache-Control: max-age=30
# [corps JSON complet]

# 2) Revalidation avec l'ETag lu : 304, AUCUN corps.
curl -i -H 'If-None-Match: "8d0c...."' \
     http://localhost:3000/api/families/42/members
# HTTP/1.1 304 Not Modified
# (pas de corps -> la liste n'est pas transférée)

# 3) Preuve que le round-trip a bien lieu (économie = corps, pas aller-retour) :
curl -v -H 'If-None-Match: "8d0c...."' \
     http://localhost:3000/api/families/42/members 2>&1 | grep -E '> GET|< HTTP'

# 4) Fallback par date (aucun ETag envoyé) : 304 si non modifié depuis.
curl -i -H 'If-Modified-Since: Sat, 07 Mar 2026 10:30:00 GMT' \
     http://localhost:3000/api/families/42/members
# HTTP/1.1 304 Not Modified

# 5) PRÉCÉDENCE : les DEUX en-têtes, avec une date volontairement ancienne.
#    L'ETag décide -> 304 (If-Modified-Since ignoré).
curl -i -H 'If-None-Match: "8d0c...."' \
        -H 'If-Modified-Since: Thu, 01 Jan 1970 00:00:00 GMT' \
        http://localhost:3000/api/families/42/members
# HTTP/1.1 304 Not Modified

# 6) Mutation : la liste change -> ancien ETag ne matche plus.
curl -i -X POST -H 'Content-Type: application/json' \
     -d '{"name":"Cara"}' \
     http://localhost:3000/api/families/42/members
# HTTP/1.1 201 Created

# 7) Re-revalidation avec l'ANCIEN ETag -> maintenant 200 (le corps a changé).
curl -i -H 'If-None-Match: "8d0c...."' \
     http://localhost:3000/api/families/42/members
# HTTP/1.1 200 OK   (nouvel ETag dans les en-têtes)
```

**Dans les DevTools (étape 9) :** onglet Network, recharge la page deux fois. Le second chargement affiche `304 Not Modified` dans la colonne *Status* et une taille transférée minuscule (en-têtes seuls) — le navigateur a renvoyé l'`If-None-Match` tout seul à partir de l'ETag stocké.

**Pourquoi ce corrigé est correct :**
- Le `304` renvoie `res.end()` **sans argument** : aucun corps, conforme à la spec ; c'est là qu'est l'économie de bande passante.
- L'ETag fort du GET est un **hash du corps exact** : impossible de renvoyer `304` pour un contenu qui aurait changé (le POST le prouve).
- `If-None-Match` est évalué **avant** `If-Modified-Since` : la précédence de la spec est respectée (l'étape 5 le vérifie).
- `app.set('etag', false)` évite qu'Express pose un second ETag automatique qui masquerait le nôtre.

---

## Variante J+30 (fading)

**Même serveur, contraintes ajoutées — à reproduire de mémoire en 25 minutes, sans rouvrir ce corrigé :**

1. Fais accepter à `If-None-Match` la valeur `*` : réponds `304` si la ressource **existe** (quel que soit l'ETag), utile pour un client qui veut juste savoir « ai-je déjà une version quelconque ? ».
2. Bascule sur un **ETag faible** `W/"members-v<n>"` dérivé d'un compteur de version incrémenté à chaque POST, au lieu du hash. Vérifie qu'un `If-None-Match: "members-v3"` (sans `W/`) matche quand même `W/"members-v3"` (comparaison faible).
3. Ajoute un log `console.log` qui affiche pour chaque requête : `[304]` ou `[200]` + quel validateur a décidé (ETag ou date).

**Critère de réussite :** `If-None-Match: *` renvoie `304` sur la ressource existante ; l'ETag faible produit bien un `304` face à un `If-None-Match` fort équivalent ; le log distingue clairement les deux chemins.

---

## Application TribuZen

Dans le repo `smaurier/tribuzen`, ce lab se porte sur le vrai backend :

```
tribuzen/src/server/
  lib/
    etag.ts                 # strongEtag(body) + versionEtag(row) — extraits du lab
  routes/
    families.members.ts     # GET liste membres -> ETag + Last-Modified + 304 (If-None-Match)
```

**Différences par rapport au lab :**
- Les données viennent de la base (Postgres/Prisma) ; `Last-Modified` s'appuie sur la colonne `updatedAt` de la ligne famille, et `versionEtag` sur `version` (incrémentée à chaque `UPDATE`).
- Le framework HTTP réel (Fastify/Nest) fournit `reply.code(304)` / `res.status(304)` au lieu du `writeHead` natif — la logique conditionnelle est identique.
- Le client mobile envoie automatiquement `If-None-Match` sur le refresh 30 s ; sur un forfait limité, la quasi-totalité des refreshs repartent en `304` tant qu'aucun membre n'est ajouté.

**Commit cible :**
```
feat(cache): ETag + Last-Modified + 304 sur GET /families/:id/members (revalidation If-None-Match)
```
