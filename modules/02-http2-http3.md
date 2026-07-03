---
titre: HTTP/2 et HTTP/3
cours: 11-http-caching
notions: [limites de HTTP/1.1, head-of-line blocking HTTP, limite 6 connexions par domaine, multiplexing HTTP/2, streams et frames, compression HPACK, server push déprécié, prioritization, head-of-line blocking TCP résiduel, QUIC sur UDP, HTTP/3, 0-RTT, migration de connexion, compression QPACK, obsolescence du bundling et sharding, vérifier la version négociée]
outcomes:
  - sait expliquer pourquoi HTTP/1.1 sérialise les réponses et sature les connexions
  - sait décrire le multiplexing HTTP/2 (streams, frames, HPACK) et le HOL blocking TCP résiduel
  - sait situer l'apport de QUIC/HTTP/3 (UDP, 0-RTT, migration de connexion, QPACK)
  - sait pourquoi le bundling/sharding/inlining devient contre-productif sous H2/H3
  - sait vérifier la version HTTP réellement négociée (DevTools Protocol, curl --http2/--http3)
prerequis: [00-prerequis-et-vue-ensemble, 01-protocole-http]
next: 03-en-tetes-http
libs: []
tribuzen: version HTTP servie à l'app TribuZen et impact du multiplexing sur le chargement de l'admin
last-reviewed: 2026-07
---

# HTTP/2 et HTTP/3

> **Outcomes — tu sauras FAIRE :** expliquer les limites de HTTP/1.1 et le multiplexing HTTP/2, situer QUIC/HTTP/3 et le HOL blocking résiduel de TCP, adapter les stratégies de bundling, et vérifier la version HTTP réellement négociée.
> **Difficulté :** :star::star:
>
> **Portée :** ce module traite du **transport** (comment les octets voyagent) et de son impact sur la **stratégie de découpage** des ressources. La **sémantique de cache** (`Cache-Control`, `ETag`, `Vary`) est identique dans les trois versions et fait l'objet des modules **03 à 06**. On ne touche pas ici aux en-têtes de cache eux-mêmes.

## 1. Cas concret d'abord

L'admin TribuZen charge lentement au premier affichage. Tu ouvres l'onglet **Network** de DevTools sur la page `/admin/familles` et tu comptes : 1 document HTML, 1 CSS, 1 bundle JS principal, 6 chunks lazy-loadés, 14 avatars de membres, 3 polices, 4 icônes SVG. Soit **29 ressources** servies par le même domaine.

Le waterfall montre des ressources qui démarrent **par vagues de 6**, les autres attendant qu'une connexion se libère :

```
index.html   [====]
app.css          [===]
app.js           [======]
chunk-1.js       [=====]
chunk-2.js       [====]
avatar-01.png    [===]
avatar-02.png         [===]   <-- attend qu'un slot se libère
avatar-03.png         [====]  <-- attend aussi
font-inter.woff2           [==]  <-- encore en attente
```

La réaction réflexe d'un dev formé sur HTTP/1.1 serait : « concatène tous les JS en un seul fichier, fusionne les avatars en un sprite, mets plusieurs sous-domaines pour paralléliser ». **En 2026 ce réflexe est faux** si le serveur parle HTTP/2 ou HTTP/3 — il peut même dégrader le cache et les perfs.

Avant d'optimiser, il faut répondre à une question que ce module va t'apprendre à trancher : **quelle version du protocole sert réellement cette page ?** La réponse change complètement la stratégie.

---

## 2. Théorie complète, concise

### 2.1 Ce qui coince en HTTP/1.1

HTTP/1.1 (1997) transporte des messages **texte**, un à la fois par connexion TCP. Trois limites structurelles en découlent.

**HOL blocking au niveau HTTP.** Sur une connexion, les réponses sortent dans l'ordre des requêtes. Une réponse lente bloque toutes celles derrière elle sur la même connexion — même si elles sont déjà prêtes.

```
Connexion 1 :
  GET /avatar-hd.png (2 Mo)  [==========================>]
  GET /app.css      (5 Ko)                              [>]   BLOQUÉE
  GET /app.js       (8 Ko)                               [>]  BLOQUÉE
```

Le pipelining HTTP/1.1 (envoyer plusieurs requêtes sans attendre) existait sur le papier mais était si mal supporté (proxies buggés, HOL blocking) qu'il est **désactivé par défaut partout**. En pratique : **une réponse à la fois par connexion**.

**Limite ~6 connexions par domaine.** Les navigateurs plafonnent à environ 6 connexions TCP simultanées par origine. Au-delà, les requêtes font la queue. Une page de 30 ressources se télécharge donc par lots de 6.

**Headers non compressés et répétés.** Chaque requête renvoie en clair les mêmes ~800 octets de `User-Agent`, `Accept`, `Cookie`… Sur 30 requêtes, des dizaines de Ko purement redondants.

Les contournements historiques — **concaténation** (bundles JS/CSS géants), **sprites** d'images, **domain sharding** (répartir les assets sur `static1.`, `static2.`…), **inlining** — existent uniquement pour contourner ces limites. Retiens-les : ils deviennent contre-productifs plus bas.

### 2.2 HTTP/2 : multiplexing sur une connexion

HTTP/2 (2015) garde la sémantique HTTP (mêmes méthodes, mêmes status, **mêmes en-têtes de cache**) mais change le transport en profondeur.

**Binaire, pas texte.** Tout est découpé en **frames** binaires. Chaque frame porte un `Stream ID` qui indique à quel échange requête/réponse elle appartient.

**Streams multiplexés.** Une **seule** connexion TCP porte des dizaines de **streams** concurrents. Les frames de streams différents s'entrelacent librement sur le fil. Le HOL blocking **HTTP** disparaît : une réponse lente n'empêche plus les autres de progresser.

```
CLIENT ── 1 seule connexion TCP ──> SERVEUR

envoi   : HEADERS(s1 GET /index.html)  HEADERS(s3 GET /app.css)  HEADERS(s5 GET /app.js)
retour  : DATA(s3 css) DATA(s1 html) DATA(s5 js) DATA(s1 html) DATA(s5 js) ...
          └── les réponses s'entrelacent, la petite CSS n'attend pas la grosse image
```

Les streams initiés par le client ont des **IDs impairs** (1, 3, 5…), ceux initiés par le serveur des IDs pairs.

**Compression d'en-têtes HPACK.** HPACK maintient une **table dynamique** partagée client/serveur. La 1re requête envoie les en-têtes (compressés Huffman) ; les suivantes ne renvoient que des **index** vers les valeurs déjà connues + les champs qui changent. HPACK **dépend de l'ordre de TCP** pour garder les tables synchronisées entre les deux côtés.

```
Requête 1 : envoie host, user-agent, accept, cookie...  (~200 o compressés)
Requête 2 : "index 62,63,64,65 + :path=/page2"          (~15 o)
```

**Prioritization.** Le client peut annoncer qu'un stream est plus important qu'un autre (CSS bloquant le rendu avant une image below-the-fold). L'implémentation était complexe et inégale ; HTTP/3 l'a repensée.

**Server push — DÉPRÉCIÉ, à ne pas utiliser.** HTTP/2 permettait au serveur de pousser une ressource *avant* que le client ne la demande (`PUSH_PROMISE`). En pratique : trop dur à configurer, pousse souvent des ressources déjà en cache (gaspillage), utilisé par ~1,25 % des sites seulement, sans gain net mesurable. **Chrome l'a désactivé par défaut dès la version 106 (2022)** et **Firefox l'a retiré en octobre 2024 (Firefox 132)** ; les CDN et la plupart des serveurs HTTP/3 ne l'implémentent plus. **Ne l'implémente pas.** L'alternative moderne est le status **`103 Early Hints`** : le serveur envoie tôt des `Link: rel=preload` et laisse le **client** décider s'il fetch, au lieu de lui imposer un push.

### 2.3 Le HOL blocking résiduel : au niveau TCP

HTTP/2 supprime le HOL blocking *HTTP*, mais il tourne sur **une seule connexion TCP**, et TCP garantit la livraison **ordonnée de tout le flux d'octets**. TCP ignore la notion de stream.

```
Frames de plusieurs streams empaquetées dans le flux TCP :
TCP : [P1 s1] [P2 s2] [P3 s1] [P4 s3] [P5 s2] ...

Si P2 est perdu sur le réseau :
TCP : [P1] [ X ] [P3] [P4] [P5] ...   -> TCP met TOUT en attente
                                          jusqu'à retransmission de P2,
                                          même les paquets de s1 et s3
                                          déjà arrivés.
```

Une seule perte de paquet gèle **tous** les streams. Sur un réseau propre (Wi-Fi, fibre) l'effet est négligeable ; sur mobile avec 2–5 % de perte, il redevient sensible. C'est **précisément** ce que HTTP/3 vient corriger.

### 2.4 HTTP/3 : QUIC sur UDP

HTTP/3 (standardisé 2022) remplace TCP+TLS par **QUIC**, un transport bâti sur **UDP**.

**Pourquoi UDP ?** QUIC réimplémente lui-même fiabilité, ordre et contrôle de flux, mais **par stream**. UDP ne sert que de socle minimal pour traverser routeurs et pare-feux. Résultat : **plus de HOL blocking transport**. Une perte sur un stream ne bloque QUE ce stream ; les autres continuent.

```
QUIC connaît les streams :
  stream 1 : [P1] [P2] [P3]        -> continue
  stream 2 : [P4] [ X ] [P6]       -> seul lui attend la retransmission
  stream 3 : [P7] [P8] [P9]        -> continue
```

**TLS 1.3 intégré.** Le chiffrement fait partie de QUIC (pas de couche TLS séparée à empiler). La connexion s'établit en **1 RTT** au lieu de 2–3 pour TCP+TLS.

**0-RTT.** À une reconnexion vers un serveur déjà visité, le client peut envoyer sa requête **dans le tout premier paquet**, en présentant un ticket de session TLS 1.3 mémorisé. Latence d'établissement : **0 RTT**. Attention sécurité : les données 0-RTT n'ont **aucune protection contre le rejeu** (un attaquant qui capture le paquet peut le rejouer), donc réservées aux requêtes **idempotentes** (GET/lecture), jamais aux POST/mutations.

**Migration de connexion.** QUIC identifie une connexion par un **Connection ID** (nombre aléatoire), pas par le tuple `(IP source, port, IP dest, port)`. Quand un mobile passe du Wi-Fi à la 4G et change d'IP, TCP casse la connexion ; QUIC la **poursuit** de façon transparente — même Connection ID, même état de stream, pas de re-handshake, pas de coupure de téléchargement.

**Compression QPACK.** Équivalent HPACK adapté à QUIC. HPACK exigeait l'ordre de TCP pour synchroniser ses tables ; QUIC livre les streams **hors ordre**. QPACK résout ça avec des **streams dédiés encodeur/décodeur** unidirectionnels, découplant les mises à jour de compression du flux requête/réponse — les en-têtes peuvent être décompressés hors ordre, sans réintroduire de HOL blocking.

### 2.5 Impact sur les stratégies : le bundling/sharding devient contre-productif

Puisque le multiplexing rend « 30 petits fichiers » aussi rapide que « 1 gros fichier » sur une connexion, les vieux contournements HTTP/1.1 **nuisent** en H2/H3.

| Pratique HTTP/1.1 | En HTTP/2 / HTTP/3 |
|---|---|
| Domain sharding (`static1.`, `static2.`) | **Nuisible** — force plusieurs connexions QUIC/TLS et casse la compression d'en-têtes partagée (HPACK/QPACK) |
| Concaténation en un gros bundle | **Contre-productif** — 1 octet changé invalide tout le bundle en cache |
| Sprites d'images | Inutile — le multiplexing sert les images en parallèle |
| Inlining CSS/JS dans le HTML | Inutile voire nuisible — l'inline n'est pas caché séparément |

**Le point cache, crucial pour ce cours :** des fichiers plus **granulaires** = un cache plus **efficace**. Si tu changes une ligne de CSS d'un module, tu n'invalides que ce petit fichier (et son hash de nom), pas un mégabundle que tout le monde doit re-télécharger. HTTP/2+ récompense le **code splitting**, pas la concaténation.

> HTTP/2 et HTTP/3 ne changent **rien** aux en-têtes de cache (`Cache-Control`, `ETag`, `Vary`) — sujet des modules 03 à 06. Ils changent seulement le **transport** et donc la **stratégie de découpage**.

### 2.6 Vérifier la version négociée

La version n'est pas un choix figé côté code : elle est **négociée** à la connexion.

- **HTTP/2** se négocie via **ALPN** dans le handshake TLS : le client annonce `h2, http/1.1`, le serveur choisit.
- **HTTP/3** s'annonce via l'en-tête **`Alt-Svc: h3=":443"`** renvoyé sur une réponse HTTP/2. Le navigateur tente alors QUIC en arrière-plan et bascule sur la visite suivante.
- **Fallback** : si UDP est bloqué (pare-feu d'entreprise), le navigateur retombe sur HTTP/2, puis HTTP/1.1.

Sigles dans DevTools et curl : `h2` = HTTP/2, `h3` = HTTP/3, `http/1.1` = HTTP/1.1.

---

## 3. Worked examples

### Exemple 1 — Diagnostiquer la version servie à TribuZen (curl)

Objectif : savoir, sans supposer, quelle version sert l'app. On interroge le domaine avec curl.

```bash
# 1) Quelle version est négociée par défaut ? (-I = requête HEAD, en-têtes seuls)
curl -I https://tribuzen.app 2>&1 | head -1
# Réponse possible : HTTP/2 200

# 2) Le serveur annonce-t-il HTTP/3 ? On cherche l'en-tête Alt-Svc
curl -I https://tribuzen.app 2>&1 | grep -i alt-svc
# alt-svc: h3=":443"; ma=86400
#          ^ le serveur propose HTTP/3 sur le port 443, mémorisable 24h

# 3) Forcer HTTP/3 pour confirmer que QUIC répond vraiment
curl -I --http3 https://tribuzen.app 2>&1 | head -1
# HTTP/3 200   -> QUIC opérationnel

# 4) Voir la négociation ALPN en détail
curl -v --http2 https://tribuzen.app 2>&1 | grep -Ei "ALPN|< HTTP"
# * ALPN: server accepted h2
# < HTTP/2 200
```

**Lecture du résultat.** Si l'étape 1 renvoie `HTTP/2` et l'étape 2 montre `alt-svc: h3`, alors : la 1re connexion se fait en H2, et le navigateur basculera en H3 aux visites suivantes. Si l'étape 1 renvoie `HTTP/1.1` et qu'il n'y a pas d'`Alt-Svc`, **le serveur est en HTTP/1.1** — et là, oui, le bundling reste pertinent. La stratégie d'optimisation dépend entièrement de ce diagnostic.

### Exemple 2 — Pourquoi concaténer les bundles n'aide plus (raisonnement chiffré)

Cas : l'admin TribuZen a un `vendor.js` (300 Ko, change rarement) et un `admin.js` (40 Ko, change à chaque déploiement).

```
STRATÉGIE HTTP/1.1 — tout concaténer en un seul app.js (340 Ko)
=================================================================
Déploiement : on corrige 1 bouton dans admin.js
  -> le hash de app.js change  -> 340 Ko réinvalidés
  -> chaque utilisateur re-télécharge 340 Ko pour 2 lignes modifiées

STRATÉGIE HTTP/2 / HTTP/3 — 2 fichiers séparés, multiplexés
=================================================================
Déploiement : on corrige 1 bouton dans admin.js
  -> vendor.js (300 Ko) : hash inchangé  -> servi depuis le cache, 0 octet réseau
  -> admin.js  (40 Ko)  : hash changé    -> seul lui est re-téléchargé
  -> les 2 fichiers partaient de toute façon en parallèle sur 1 connexion
```

**Conclusion.** Sous H2/H3, séparer `vendor` et `admin` fait économiser **300 Ko par déploiement et par utilisateur**, sans coût de latence (multiplexing). Le bundling monolithique, lui, transforme chaque petit correctif en re-téléchargement massif. Le multiplexing rend le **code splitting gagnant sur tous les tableaux** : perfs *et* cache.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — « HTTP/2 supprime tout le head-of-line blocking »

Faux. HTTP/2 supprime le HOL blocking **au niveau HTTP** (les streams s'entrelacent), mais **pas** celui de **TCP** : une seule perte de paquet gèle tous les streams, car TCP livre le flux dans l'ordre et ignore les streams. C'est **HTTP/3 (QUIC)** qui élimine le HOL blocking **transport**, en gérant l'ordre par stream sur UDP. Discrimination clé : HOL **HTTP** ≠ HOL **TCP**.

### PIÈGE #2 — Compter sur le server push

Le server push HTTP/2 est **mort** : désactivé par défaut dans Chrome 106 (2022), retiré de Firefox 132 (oct. 2024), mal supporté par les CDN et absent de la plupart des piles HTTP/3. Toute doc ou tuto qui te dit « pousse ton CSS avec `PUSH_PROMISE` / `stream.pushStream()` » est périmé. L'alternative vivante est **`103 Early Hints`** avec des `Link: rel=preload`. Ne construis rien sur `pushStream`.

### PIÈGE #3 — Garder les optimisations HTTP/1.1 sous HTTP/2/3

```
❌ Réflexe hérité de HTTP/1.1, appliqué à tort sous H2/H3
   - domain sharding : static1.tribuzen.app, static2.tribuzen.app
   - un mégabundle app.js de 340 Ko
   - un sprite PNG de tous les avatars

✅ Adapté à HTTP/2 / HTTP/3
   - un seul domaine (une connexion, en-têtes partagés, QUIC réutilisé)
   - code splitting : vendor.js + admin.js + chunks lazy
   - images séparées, multiplexées, cachées individuellement
```

Le sharding est le pire des trois : il **force** plusieurs connexions QUIC/TLS et casse le bénéfice de la connexion unique. Ce qui accélérait HTTP/1.1 **ralentit** HTTP/2/3.

### PIÈGE #4 — « HTTP/3 est toujours plus rapide, activons-le partout sans réfléchir »

HTTP/3 gagne surtout sur réseaux **avec perte** (mobile, 4G, Wi-Fi saturé) et sur la **migration de connexion**. Sur une fibre stable, l'écart H2 vs H3 est faible. Et si le réseau **bloque UDP** (pare-feu d'entreprise), le client retombe sur H2 : HTTP/3 n'est jamais garanti, seulement *proposé* via `Alt-Svc`. Ne « désactive » jamais H2 en croyant forcer H3 — tu casserais le fallback.

### PIÈGE #5 — Confondre 0-RTT et « toujours 0 aller-retour »

Le **0-RTT** ne s'applique qu'à une **reconnexion** vers un serveur déjà visité (ticket de session en main). La **première** connexion QUIC coûte **1 RTT**. Et le 0-RTT est **interdit** aux requêtes non idempotentes (POST) à cause du risque de rejeu — le paquet 0-RTT n'a aucune protection anti-replay.

---

## 5. Ancrage TribuZen

TribuZen est servie derrière un CDN (Cloudflare/Fastly selon l'environnement). Trois décisions concrètes de ce module.

**Vérifier la version servie.** Avant toute optimisation front, on lance `curl -I https://tribuzen.app` et on lit la 1re ligne + `Alt-Svc`. En prod derrière Cloudflare : `h2` par défaut, `h3` annoncé — donc **H2/H3**, jamais HTTP/1.1. Cela conditionne toute la stratégie de build Vite.

**Ne pas concaténer, splitter.** La config Vite de l'admin doit **séparer** `vendor` (dépendances stables) des chunks de features (`familles`, `evenements`, `membres`) chargés en lazy via les routes. Sous H2/H3 c'est gagnant : parallélisme au chargement **et** cache granulaire à chaque déploiement (voir Exemple 2). Un `manualChunks` qui regrouperait tout annulerait ce bénéfice.

**Multiplexing et chargement de l'admin.** La page `/admin/familles` charge document + CSS + chunks + avatars + polices sur **une** connexion multiplexée. Aucune raison de sharder les avatars sur un sous-domaine, ni de fusionner en sprite : chaque avatar est caché individuellement (`Cache-Control: immutable` + hash), et le multiplexing les sert en parallèle.

Fichiers concernés dans `smaurier/tribuzen` :
```
tribuzen/
  vite.config.ts          # code splitting (build.rollupOptions.output.manualChunks)
  src/routes/admin/*      # routes lazy -> chunks séparés
  infra/cdn/*.md          # doc CDN : H2/H3 activés, Alt-Svc, pas de push
```

---

## 6. Points clés

1. HTTP/1.1 sérialise les réponses par connexion (HOL blocking HTTP), plafonne à ~6 connexions/domaine et répète des en-têtes non compressés.
2. HTTP/2 multiplexe des streams sur **une** connexion TCP, compresse les en-têtes avec HPACK et supprime le HOL blocking **HTTP**.
3. Le **server push HTTP/2 est déprécié et retiré** des navigateurs (Chrome 106 en 2022, Firefox 132 en 2024) — utiliser `103 Early Hints` à la place.
4. HTTP/2 garde un HOL blocking **résiduel au niveau TCP** : une perte de paquet gèle tous les streams.
5. HTTP/3 tourne sur **QUIC/UDP**, élimine le HOL blocking transport, intègre TLS 1.3, offre le 0-RTT (reconnexion, GET seulement) et la migration de connexion (Connection ID).
6. Sous H2/H3, le **bundling/sharding/inlining/sprites de HTTP/1.1 devient contre-productif** : préférer le code splitting pour un cache granulaire.
7. La version est **négociée** (ALPN pour H2, `Alt-Svc` pour H3) et se vérifie avec DevTools (colonne Protocol) ou `curl -I` / `--http3`.

---

## 7. Seeds Anki

```
Quelle est la différence entre le HOL blocking HTTP et le HOL blocking TCP ?|Le HOL blocking HTTP (réponses sérialisées sur une connexion) est résolu par le multiplexing de HTTP/2. Le HOL blocking TCP (une perte de paquet gèle tout le flux ordonné) subsiste en HTTP/2 et n'est éliminé qu'en HTTP/3 grâce à QUIC, qui gère l'ordre par stream.
Pourquoi le multiplexing HTTP/2 rend-il le bundling monolithique contre-productif ?|Le multiplexing sert 30 petits fichiers aussi vite qu'un gros sur une seule connexion. Un mégabundle fait qu'1 octet modifié invalide tout le fichier en cache ; des fichiers séparés (code splitting) ne réinvalident que la partie changée -> cache bien plus efficace.
Quel est le statut du server push HTTP/2 en 2026 ?|Mort : désactivé par défaut dans Chrome 106 (2022), retiré de Firefox 132 (oct. 2024), non supporté par la plupart des CDN et piles HTTP/3. Alternative moderne : 103 Early Hints avec des Link rel=preload. Ne rien construire sur pushStream/PUSH_PROMISE.
Qu'apporte QUIC (HTTP/3) que TCP (HTTP/2) ne peut pas offrir ?|Pas de HOL blocking transport (ordre par stream sur UDP), TLS 1.3 intégré (1 RTT), 0-RTT à la reconnexion, et migration de connexion via Connection ID (changement Wi-Fi->4G sans coupure car l'identité ne dépend plus de l'IP).
À quoi sert l'en-tête Alt-Svc et comment vérifier la version HTTP servie ?|Alt-Svc: h3=":443" annonce que le serveur supporte HTTP/3 ; le navigateur tente QUIC et bascule à la visite suivante. On vérifie la version avec la colonne Protocol de DevTools (h2/h3/http/1.1) ou curl -I (1re ligne) et curl -I --http3.
Pourquoi le domain sharding est-il nuisible en HTTP/2/3 ?|Il force l'ouverture de plusieurs connexions QUIC/TLS au lieu d'une seule, casse la compression d'en-têtes partagée (HPACK/QPACK) et empêche la réutilisation de la connexion — l'inverse du bénéfice recherché. Un seul domaine est optimal.
Quelles sont les limites du 0-RTT de QUIC ?|Il ne s'applique qu'à une reconnexion vers un serveur déjà visité (ticket de session), pas à la 1re connexion (1 RTT). Il est réservé aux requêtes idempotentes (GET) car les données 0-RTT n'ont aucune protection anti-rejeu (replay attack) — jamais pour un POST.
Pourquoi HTTP/3 utilise-t-il QPACK au lieu de HPACK ?|HPACK dépend de l'ordre de TCP pour synchroniser ses tables de compression entre client et serveur. QUIC livre les streams hors ordre, ce qui casserait HPACK. QPACK utilise des streams dédiés encodeur/décodeur pour découpler l'état de compression du flux de données et rester correct hors ordre.
HTTP/2 et HTTP/3 changent-ils les en-têtes de cache ?|Non. Cache-Control, ETag, Vary fonctionnent à l'identique dans les trois versions. HTTP/2 et HTTP/3 ne changent que le transport et donc la stratégie de découpage des ressources, pas la sémantique du cache.
```

---

## Pont vers le lab

> Lab associé : `11-http-caching/labs/lab-02-http2-http3/README.md`. Observer le multiplexing HTTP/2 vs HTTP/1.1 dans DevTools et confirmer la version négociée avec `curl --http2` / `--http3`, corrigé + variante J+30 + portage TribuZen.
