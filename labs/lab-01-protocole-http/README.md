# Lab 01 — Le protocole HTTP

> **Outcome :** à la fin, tu sais inspecter une requête/réponse HTTP réelle avec `curl -v` et l'onglet DevTools Network, forger chaque méthode à la main, lire le code de statut et diagnostiquer un `409` (invitation en double) et un `304` (asset en cache).
> **Vrai outil :** `curl` (déjà présent sur ton système) + l'onglet **Network** de Chrome/Firefox DevTools. Aucun harnais simulé, aucun serveur à écrire — tu observes du trafic HTTP **réel**.
> **Feedback :** le coach valide en session à partir de tes captures brutes (sorties `curl -v` et captures Network). Pas de test-runner auto-correcteur.

---

## Énoncé

Tu es en train de comprendre comment l'API TribuZen parle HTTP. Comme le backend TribuZen n'est pas déployé publiquement, tu t'entraînes sur des endpoints **réels et publics** qui exposent exactement les mêmes mécaniques (méthodes, codes, en-têtes) :

- `https://httpbin.org` — un miroir HTTP qui renvoie ta requête et sait produire n'importe quel code de statut.
- `https://developer.mozilla.org` — un vrai site avec des assets cachés (ETag, `304`).

Ton travail : produire, capturer et **interpréter** une série d'échanges, puis rapprocher chaque observation du cas TribuZen (invitation, asset).

**Contraintes :**
- Tu utilises `curl -v` (ou `-i`) pour chaque appel — pas de client graphique type Postman pour cette partie.
- Tu notes, pour chaque appel : la **méthode**, le **code de statut** et les **en-têtes clés** que tu observes.
- Tu ne consultes le corrigé qu'après avoir tenté chaque étape.

> Si `curl` n'est pas dans ton terminal : il est natif sur Windows 10/11 (`curl.exe`), macOS et Linux. Vérifie avec `curl --version`.

---

## Étapes (en friction)

1. **Inspecter une requête GET brute.** Lance un `GET` verbeux sur `httpbin.org/get` et repère, dans la sortie, les lignes préfixées `>` (ce que tu envoies) et `<` (ce que tu reçois). Identifie la start-line envoyée, le header `Host`, la status-line reçue et le `Content-Type`.
2. **Voir HEAD vs GET.** Lance un `HEAD` sur la même URL. Compare : mêmes en-têtes de réponse, **aucun body**. Note à quoi ça sert (tester l'existence/la taille sans télécharger).
3. **Forger un POST avec body JSON.** Envoie un `POST` sur `httpbin.org/post` avec `Content-Type: application/json` et un corps `{"email":"bob@example.com"}`. Vérifie dans la réponse que httpbin te ré-affiche ton `json` et tes `headers`. C'est la requête d'invitation TribuZen.
4. **Provoquer chaque classe de code.** httpbin sait renvoyer un code arbitraire via `/status/:code`. Provoque et capture : `201`, `204`, `301`, `400`, `401`, `403`, `404`, `409`, `422`, `429`, `500`, `503`. Pour chacun, note la classe (2/3/4/5xx) et le sens.
5. **Diagnostiquer le 409 « invitation en double ».** À partir de l'étape 4, explique par écrit (2-3 phrases) pourquoi TribuZen renvoie `409` sur une seconde invitation identique, et pas `400` ni `500`. Relie ta réponse à la non-idempotence de `POST`.
6. **Observer un 304 sur un asset (DevTools).** Ouvre `https://developer.mozilla.org` dans le navigateur, DevTools → **Network**, coche **Disable cache** décoché, recharge **deux fois** (F5). Sur un asset statique (`.css`, `.js`, `.woff2`), repère au 2ᵉ chargement le statut `304 Not Modified` et les en-têtes `if-none-match` (requête) / `etag` (réponse). Capture-le.
7. **Reproduire le conditionnel en curl.** Récupère l'`ETag` d'une ressource via `-I`, puis renvoie une requête avec `-H "If-None-Match: \"<etag>\""` et observe le `304`.
8. **Vérifier l'idempotence à la main.** Envoie **deux fois** le même `PUT` sur `httpbin.org/put`, puis **deux fois** le même `POST` sur `httpbin.org/post`. Explique par écrit lequel serait sûr à rejouer automatiquement après un timeout réseau, et pourquoi.

---

## Corrigé complet commenté

> Les commandes ci-dessous sont en syntaxe **bash**. Sous PowerShell, remplace les `\` de continuation de ligne par un backtick `` ` ``, ou mets tout sur une seule ligne.

```bash
# ─── Étape 1 — GET verbeux : lire une requête/réponse brute ──────────────
curl -v https://httpbin.org/get
# Sortie annotée :
#   > GET /get HTTP/2            ← start-line ENVOYÉE (méthode + cible + version)
#   > host: httpbin.org         ← header obligatoire en HTTP/1.1+
#   > accept: */*               ← négociation : j'accepte tout
#   >                           ← ligne vide = fin des headers de requête
#   < HTTP/2 200                ← status-line REÇUE (code = 200)
#   < content-type: application/json   ← le serveur annonce le format du body
#   < content-length: 220
#   <                           ← ligne vide = fin des headers de réponse
#   { ...json... }              ← body

# ─── Étape 2 — HEAD : mêmes headers, PAS de body ─────────────────────────
curl -I https://httpbin.org/get
# -I = HEAD. On récupère content-type, content-length... mais aucun corps.
# Usage TribuZen : vérifier la taille/version d'un asset avant de le télécharger.

# ─── Étape 3 — POST JSON : la requête d'invitation ───────────────────────
curl -i -X POST https://httpbin.org/post \
  -H "Content-Type: application/json" \
  -d '{"email":"bob@example.com"}'
# httpbin renvoie 200 et ré-affiche :
#   "json": { "email": "bob@example.com" }        ← ton body bien parsé
#   "headers": { "Content-Type": "application/json" }
# NB: -d force la méthode POST et met par défaut Content-Type: x-www-form-urlencoded ;
#     on le SURCHARGE explicitement en application/json (piège #4 du module).

# ─── Étape 4 — provoquer chaque code de statut ───────────────────────────
for code in 201 204 301 400 401 403 404 409 422 429 500 503; do
  printf '%s -> ' "$code"
  curl -s -o /dev/null -w '%{http_code}\n' "https://httpbin.org/status/$code"
done
# -s silencieux, -o /dev/null jette le body, -w imprime le code reçu.
# 201/204 = succès ; 301 = redirection ; 400-429 = erreurs client ; 500/503 = serveur.

# ─── Étape 6bis / 7 — reproduire un 304 en curl (validation conditionnelle) ─
# 1) récupérer l'ETag d'une ressource réelle
curl -I https://developer.mozilla.org/favicon.ico
#   ... etag: "3a2f1c..."   ← copie cette valeur
# 2) redemander AVEC l'ETag : si rien n'a changé -> 304 sans body
curl -i https://developer.mozilla.org/favicon.ico \
  -H 'If-None-Match: "3a2f1c..."'
#   < HTTP/2 304 Not Modified   ← ta copie est encore bonne, corps NON renvoyé

# ─── Étape 8 — idempotence à la main ─────────────────────────────────────
curl -s -o /dev/null -w 'PUT 1: %{http_code}\n' -X PUT  https://httpbin.org/put  -d '{"name":"Bob"}'
curl -s -o /dev/null -w 'PUT 2: %{http_code}\n' -X PUT  https://httpbin.org/put  -d '{"name":"Bob"}'
curl -s -o /dev/null -w 'POST 1: %{http_code}\n' -X POST https://httpbin.org/post -d '{"name":"Bob"}'
curl -s -o /dev/null -w 'POST 2: %{http_code}\n' -X POST https://httpbin.org/post -d '{"name":"Bob"}'
```

**Réponses écrites attendues**

- **Étape 5 — pourquoi 409 et pas 400/500 :** le format de la requête est valide (JSON correct, email correct), donc ce n'est **pas** un `400`. Le serveur fonctionne parfaitement, donc ce n'est **pas** un `500`. Le refus vient d'un **conflit avec l'état actuel** (une invitation pour cet email existe déjà) → `409 Conflict`. C'est le comportement correct d'un `POST`, qui n'est **pas idempotent** : deux envois identiques sont deux tentatives de création distinctes.

- **Étape 8 — lequel rejouer sans risque :** le `PUT` est **idempotent** — le rejouer après un timeout laisse la ressource dans le même état final, donc un client/proxy peut le retenter sans danger. Le `POST` n'est **pas idempotent** — le rejouer risque de créer un doublon (exactement le bug du cas concret). Conséquence pratique côté front TribuZen : on désactive le bouton *Inviter* après le premier clic, ou on utilise une clé d'idempotence.

**Pourquoi ce corrigé est correct :**
- Chaque appel observe du trafic HTTP **réel** — pas un serveur simulé ni un mock. Les codes viennent d'un vrai serveur (`httpbin`, MDN).
- Le `304` de l'étape 7 est déclenché par un vrai en-tête conditionnel `If-None-Match` sur un vrai `ETag` — c'est le mécanisme exact du cache TribuZen sur les assets (module 05).
- L'étape 8 démontre l'idempotence non pas par la théorie mais par deux exécutions comparées.

---

## Variante J+30 (fading)

**Même objectif, contrainte ajoutée — à refaire de mémoire, en 20 minutes, sans rouvrir le module ni ce corrigé :**

1. Sans copier-coller, forge un `POST` JSON puis un `PUT` JSON vers `httpbin.org`, et prouve par deux exécutions consécutives lequel est idempotent (utilise `-w '%{http_code}'`).
2. Provoque, **de mémoire**, les codes `201`, `409`, `422`, `304` et écris en une phrase le scénario TribuZen correspondant à chacun.
3. Capture un `304` réel via un `ETag` + `If-None-Match` sur l'asset de ton choix, sans relire les étapes 6-7.

**Critère de réussite :** tu produis les codes attendus, tu nommes correctement chaque scénario, et tu expliques l'idempotence sans hésiter — sans support.

---

## Application TribuZen

Dans le vrai backend `smaurier/tribuzen`, ces mécaniques sont implémentées côté API (NestJS) et lues côté front (React) :

```
tribuzen/
  apps/
    api/
      src/families/invitations.controller.ts  ← 201 / 409 / 422 sur POST invitation
      src/members/members.controller.ts        ← PUT idempotent, DELETE -> 204
    web/
      src/features/invite/InviteButton.tsx      ← désactive le bouton après 1er POST (anti-doublon)
      src/lib/http.ts                            ← lit response.status pour router 409 vs 422
```

**Ce que tu portes du lab vers le produit :**
- Le handler d'invitation renvoie `409` sur doublon (pas `400`/`500`) — testé en session avec `curl -v` contre l'API locale (`http://localhost:3000`).
- Les assets du front (`/assets/*`) servent un `ETag` ; le navigateur reçoit `304` au rechargement — vérifiable dans DevTools Network, exactement comme à l'étape 6.
- `InviteButton` passe en `disabled` après le premier envoi tant que la réponse n'est pas revenue, parce que `POST` n'est pas idempotent.

**Commit cible :**
```
feat(invitations): 201 + Location à la création, 409 sur doublon
fix(invite): désactive le bouton après le premier POST (anti-doublon)
```
