---
titre: Prérequis et vue d'ensemble — HTTP & Caching
cours: 11-http-caching
notions: [modèle client-serveur requête-réponse, rôle central de HTTP, caching comme levier de perf n°1, latence et coût serveur, couches de cache navigateur CDN reverse-proxy application BDD, cache hit et cache miss, fresh vs stale, carte du cours, outils DevTools et curl]
outcomes: [expliquer le cycle requête-réponse HTTP, justifier pourquoi le caching est le premier levier de performance, situer chaque couche de cache dans la chaîne, observer les en-têtes de cache avec DevTools et curl]
prerequis: []
next: 01-protocole-http
libs: []
tribuzen: chaîne de cache complète de TribuZen (API + admin web + mobile) — réduire latence et coût serveur à chaque couche
last-reviewed: 2026-07
---

# Prérequis et vue d'ensemble — HTTP & Caching

> **Outcomes — tu sauras FAIRE :** expliquer le cycle requête-réponse HTTP, justifier pourquoi le caching est le premier levier de performance, situer chaque couche de cache dans la chaîne, observer les en-têtes de cache avec DevTools et curl.
> **Difficulté :** :star:

## 1. Cas concret d'abord

L'admin TribuZen affiche la liste des familles d'un espace. Chaque ouverture de page déclenche un `GET /api/families`. En prod, un pic est repéré : à l'heure d'affluence du soir, l'API sature et les temps de réponse passent de 120 ms à 900 ms. Le tableau de bord de coût cloud grimpe aussi : la même requête part vers la base de données des milliers de fois par minute, alors que la liste des familles change à peine une fois par jour.

Ouvre l'onglet **Network** de Chrome DevTools sur cette page et observe une requête réelle :

```
Name              Status  Type   Size            Time
families          200     xhr    18.4 kB         870 ms
avatar-42.png     200     png    (disk cache)    0 ms
app.css           304     css    (memory cache)  2 ms
```

Deux constats sautent aux yeux :

- `avatar-42.png` et `app.css` sont servis **depuis le cache** (`0 ms`, `304`) : le navigateur ne redemande rien au serveur.
- `families` repart **à chaque fois** vers l'API (`870 ms`, vraie taille en octets) : aucun cache ne l'intercepte.

La question du cours entier tient dans cet écart. Pourquoi certaines ressources coûtent 0 ms et d'autres 870 ms ? Comment fait-on pour que `families` — qui change une fois par jour — se comporte comme `app.css` ? Ce module pose la carte ; les suivants donnent les outils précis, en-tête par en-tête.

---

## 2. Théorie complète, concise

### 2.1 HTTP : le modèle client-serveur requête-réponse

**HTTP** (HyperText Transfer Protocol) est le protocole qui régit *toute* communication sur le web : page, image, feuille de style, appel d'API. Il fonctionne selon un modèle **client-serveur** en **requête-réponse** : le client (navigateur, app mobile, `curl`) envoie une requête, le serveur renvoie une réponse. Un aller, un retour. Jamais l'inverse spontanément.

```
Client (navigateur)                    Serveur (API TribuZen)
   |                                        |
   |  --- Requête ------------------------> |
   |  GET /api/families HTTP/1.1            |
   |  Host: api.tribuzen.app               |
   |  Accept: application/json             |
   |                                        |
   |  <-- Réponse ------------------------  |
   |  HTTP/1.1 200 OK                       |
   |  Content-Type: application/json        |
   |  Cache-Control: max-age=60             |
   |  [ { "id": 1, ... }, ... ]             |
```

Trois propriétés fondamentales structurent tout le reste du cours :

1. **Sans état (stateless)** : chaque requête est indépendante ; le serveur ne se souvient pas de la précédente. C'est *justement* ce qui rend le caching possible et sûr — une réponse peut être stockée et rejouée sans casser un contexte serveur.
2. **Basé sur du texte** : requêtes et réponses sont lisibles à l'œil. On peut inspecter et déboguer un cache en lisant les en-têtes bruts.
3. **Extensible via les en-têtes** : le comportement du cache se pilote entièrement par des en-têtes (`Cache-Control`, `ETag`, `Vary`…), pas par le corps du message.

### 2.2 Requête et réponse : anatomie minimale

Une requête = une **méthode** (`GET`, `POST`…) + une **URL** + des **en-têtes** + un **corps** optionnel. Une réponse = un **status code** (200, 304, 404…) + des **en-têtes** + un **corps** optionnel. Le cache s'appuie presque uniquement sur les en-têtes ; c'est pour ça que le cours passe rapidement au décorticage des en-têtes.

```
# Requête brute
GET /api/families HTTP/1.1
Host: api.tribuzen.app
Accept: application/json
If-None-Match: "v3-families"     # "j'ai déjà la version v3, est-elle encore bonne ?"

# Réponse brute (le serveur confirme sans renvoyer le corps)
HTTP/1.1 304 Not Modified
ETag: "v3-families"
Cache-Control: max-age=60
```

### 2.3 Pourquoi le caching est LE levier de perf n°1

Le caching, c'est **garder une copie de la réponse** pour éviter de refaire le travail. Il attaque simultanément les trois coûts d'une requête web :

- **La latence.** Un aller-retour réseau coûte cher, et les ordres de grandeur sont impitoyables :

  | Opération | Latence typique |
  |---|---|
  | Lire depuis le cache mémoire (RAM) | ~1 ms |
  | Lire depuis le cache disque | ~5 ms |
  | Requête vers un CDN proche | ~30 ms |
  | Requête vers le serveur d'origine | ~100–300 ms |
  | Requête + calcul BDD lourd | ~500–2000 ms |

  Un cache hit en RAM est **100 à 1000× plus rapide** qu'un aller à l'origine. Aucune optimisation de code ne rivalise avec « ne pas faire la requête du tout ».

- **Le coût serveur.** Chaque requête évitée, c'est du CPU, de la BDD et de la bande passante non consommés. Sur `GET /api/families`, mettre 60 s de cache divise la charge origine par le nombre de lecteurs pendant cette minute. À l'échelle, c'est la différence entre 1 serveur et 10.

- **La scalabilité.** Un cache absorbe les pics. Si 5000 utilisateurs ouvrent le tableau de bord à 20 h, un cache partagé (CDN / reverse proxy) sert une seule réponse origine et la rejoue 5000 fois. Sans cache, ce sont 5000 requêtes qui frappent la base.

Les chiffres métier confirment l'enjeu : Google et Amazon estiment que **+100 ms de latence ≈ −1 % de revenus**, et 53 % des visiteurs mobiles abandonnent un site qui dépasse 3 s de chargement. La performance web *est* du chiffre d'affaires.

### 2.4 Les couches de cache : de l'utilisateur à la source de vérité

Le cache n'existe pas à un seul endroit. C'est une **chaîne**, ordonnée du plus proche de l'utilisateur (le plus rapide) au plus proche de la donnée (le plus lent). Une requête traverse ces couches et s'arrête à la première qui détient une copie fraîche.

```
UTILISATEUR
    |
    v
[1] Cache navigateur        ~1 ms    mémoire / disque, privé à un user
    |                                  (module 07)
    v
[2] CDN                     ~30 ms   réseau mondial, cache partagé en bordure
    |                                  (module 08)
    v
[3] Reverse proxy / cache   ~50 ms   Varnish, nginx, Redis en frontal
    |   serveur partagé                (modules 08-09)
    v
[4] Cache applicatif        ~5 ms    mémoïsation, cache in-process de l'API
    |                                  (module 09)
    v
[5] Base de données         variable source de vérité (module 09)
```

Deux points de vocabulaire structurants :

- **Cache privé vs partagé.** Le cache navigateur [1] est *privé* : réservé à un seul utilisateur, il peut donc stocker des données personnelles. Le CDN et le reverse proxy [2][3] sont *partagés* : une réponse mise en cache est servie à tous — d'où l'interdiction d'y stocker du contenu personnalisé sans précaution (en-tête `private`, vu au module 04).
- **Plus une couche est proche de l'utilisateur, plus le gain est grand mais plus le risque d'obsolescence est élevé.** Tout le cours consiste à trouver l'équilibre : cacher longtemps *sans* servir de données périmées.

### 2.5 Le vocabulaire de base du cache

| Terme | Signification |
|---|---|
| **Cache hit** | La copie demandée est trouvée dans le cache → réponse immédiate, pas d'aller à l'origine |
| **Cache miss** | La copie n'est pas là → il faut interroger la couche suivante |
| **Fresh (frais)** | La copie est encore dans sa durée de validité → servie directement |
| **Stale (périmé)** | La copie a dépassé sa validité → elle existe encore mais doit être revalidée |
| **Revalidation** | Demander à l'origine « ma copie périmée est-elle toujours bonne ? » → réponse `304` (oui) ou `200` (voici la neuve) |
| **TTL** | *Time To Live* — durée pendant laquelle une copie reste fraîche |
| **Origin server** | Le serveur d'origine, source de vérité de la ressource |
| **Invalidation** | Forcer l'expiration / suppression d'une entrée de cache |

### 2.6 La carte du cours

Chaque module ajoute une pièce à la chaîne ci-dessus. Voici l'itinéraire, du fondamental à l'avancé :

```
00  Vue d'ensemble           <- tu es ici : le modèle + la chaîne de cache
01  Protocole HTTP           méthodes, status codes, connexions
02  HTTP/2 & HTTP/3          multiplexage, coût réduit des requêtes
03  En-têtes HTTP            le langage du cache (Vary, Content-*, ...)
04  Cache-Control            l'en-tête maître : max-age, private, no-store
05  ETag & validation        revalidation conditionnelle 304
06  Stale-While-Revalidate   servir périmé + rafraîchir en arrière-plan
07  Cache navigateur         couche [1] : mémoire, disque, Service Worker
08  CDN                      couche [2] : cache partagé mondial
09  Cache multi-couches      orchestrer [1]->[5] de façon cohérente
    ... puis SSR/ISR/edge, streaming, mesure de perf, PWA & push
```

Retiens la logique : on descend d'abord le protocole (00-02), puis on apprend le *langage du cache* (03-06), puis on l'applique couche par couche (07-09), puis on monte vers le rendu et la perf globale.

### 2.7 Les outils d'observation

Deux outils suffisent pour tout ce cours ; on les réutilise à chaque module.

**Chrome DevTools — onglet Network.** `F12` → Network. Les colonnes `Status` (200 vs 304), `Size` (`from disk cache` / `from memory cache` vs octets réels) et `Time` (`0 ms` = cache hit) racontent le comportement du cache d'un coup d'œil. La case *Disable cache* force le rechargement complet pour comparer.

**curl — les en-têtes bruts en ligne de commande.**

```bash
# -I : voir uniquement les en-têtes de réponse
curl -I https://api.tribuzen.app/api/families

# Requête conditionnelle : "j'ai déjà la version v3-families"
curl -H 'If-None-Match: "v3-families"' -I https://api.tribuzen.app/api/families
# -> HTTP/2 304 Not Modified  si la copie est toujours bonne

# Mesurer chaque phase du trajet (DNS, connexion, TLS, total)
curl -w 'DNS:%{time_namelookup} TLS:%{time_appconnect} Total:%{time_total}\n' \
     -o /dev/null -s https://api.tribuzen.app/api/families
```

Aucun code applicatif n'est nécessaire ici : ce module observe, les suivants construisent.

---

## 3. Worked examples

### Exemple 1 — Lire une réponse et décider si elle sera cachée

On reçoit cette réponse de l'API TribuZen. Question : sera-t-elle mise en cache, et pour combien de temps ?

```
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: max-age=60
ETag: "v3-families"
Content-Length: 18432

[ { "id": 1, "name": "Martin" }, ... ]
```

Raisonnement, ligne par ligne :

1. **Status `200 OK`** → réponse complète et valide : elle *peut* être mise en cache (contrairement à une erreur `500`).
2. **`Cache-Control: max-age=60`** → le serveur autorise le stockage pendant **60 secondes**. Pendant ce laps, toute nouvelle requête identique est un **cache hit** : réponse immédiate, `0 ms`, aucun aller à l'origine.
3. **Après 60 s** → la copie devient **stale**. Le navigateur ne la jette pas : il déclenche une **revalidation** en envoyant `If-None-Match: "v3-families"`.
4. **L'`ETag`** sert d'empreinte pour cette revalidation. Si la liste n'a pas changé, l'origine répond `304 Not Modified` (quelques octets, pas les 18 kB). Sinon, `200 OK` avec un nouvel `ETag`.

Conclusion : cette réponse revient de la BDD **au maximum une fois toutes les 60 s**, quel que soit le nombre de lecteurs. C'est exactement le traitement qui manquait à `families` dans le cas concret.

### Exemple 2 — Suivre une requête à travers les couches

Un utilisateur ouvre le tableau de bord. Voici le trajet du `GET /api/families` selon l'état des caches, avec le temps observé :

```
Scénario A — tout froid (premier chargement de la journée)
  navigateur [miss] -> CDN [miss] -> reverse proxy [miss] -> API -> BDD
  Résultat : 200 OK, ~870 ms. Chaque couche stocke la réponse au passage.

Scénario B — 10 s plus tard, même utilisateur
  navigateur [HIT fresh]
  Résultat : 0 ms, aucune requête réseau. La copie navigateur est encore fraîche.

Scénario C — un AUTRE utilisateur, 10 s plus tard
  navigateur [miss] -> CDN [HIT fresh]
  Résultat : ~30 ms. Le CDN (cache partagé) sert la copie déjà stockée en A.
  L'API et la BDD ne sont PAS sollicitées.
```

Ce que l'exemple démontre :

- Le cache **privé** (B) élimine totalement le réseau pour le même utilisateur.
- Le cache **partagé** (C) fait bénéficier *tous* les utilisateurs du travail fait une seule fois.
- La charge BDD s'effondre : sur des centaines d'ouvertures en une minute, l'origine ne voit qu'**une** requête. C'est le mécanisme qui règle le pic du soir décrit au §1.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — « Le cache, c'est uniquement le navigateur »

**Faux.** Le cache navigateur n'est que la couche [1]. Le plus gros gain de scalabilité vient des caches **partagés** (CDN, reverse proxy) qui protègent l'origine pour *tous* les utilisateurs à la fois. Un débutant qui ne pense qu'au cache navigateur laisse son API encaisser chaque visiteur. Le cours consacre les modules 08-09 aux couches partagées précisément pour cette raison.

### PIÈGE #2 — Confondre « cache hit » et « status 200 »

Un `200 OK` peut être servi **depuis le cache** *ou* fraîchement téléchargé — le status seul ne le dit pas. Il faut lire la colonne `Size` : `(from disk cache)` / `(from memory cache)` = hit ; une taille en octets = téléchargement réel. Le `304 Not Modified`, lui, signale une **revalidation réussie** (la copie locale est réutilisée), pas un hit direct. Trois situations distinctes qu'on confond souvent :

```
200 + Size en octets        -> téléchargé depuis l'origine (miss)
200 + (from ... cache)      -> servi localement, PAS de réseau (hit frais)
304 Not Modified            -> revalidé : petit aller-retour, corps réutilisé
```

### PIÈGE #3 — « Fresh/stale » = « bon/mauvais »

**Faux.** Une copie **stale** n'est pas fausse ni inutilisable : elle a seulement dépassé son TTL. Selon la stratégie (notamment *stale-while-revalidate*, module 06), on peut **servir la copie stale immédiatement** tout en la rafraîchissant en arrière-plan. Assimiler stale à « à jeter » fait rater l'une des stratégies de perf les plus puissantes.

### PIÈGE #4 — Cacher du contenu personnalisé dans un cache partagé

Mettre une réponse personnalisée (données d'un utilisateur donné) dans un cache **partagé** (CDN, proxy) la ferait servir à *d'autres* utilisateurs → fuite de données. La règle : contenu personnalisé → cache **privé** uniquement (`Cache-Control: private`), jamais partagé. Ce point, esquissé ici, est détaillé au module 04 ; le retenir dès maintenant évite l'erreur de sécurité classique du caching.

### PIÈGE #5 — « HTTP est obsolète, tout passe en temps réel / WebSocket »

**Faux.** L'écrasante majorité du trafic web reste du requête-réponse HTTP, et HTTP/2 puis HTTP/3 (module 02) l'ont modernisé, pas remplacé. Le temps réel (WebSocket, SSE) répond à un besoin *différent* et complémentaire. Maîtriser HTTP et son cache reste le socle de toute perf web.

---

## 5. Ancrage TribuZen

TribuZen se compose de trois clients d'une même API : l'**admin web** (React), l'**app mobile** et l'**API** elle-même. Les trois partagent la même chaîne de cache — c'est le terrain d'entraînement de tout le cours.

- **Couche [1] navigateur (admin web)** : les assets statiques (`app.css`, avatars, icônes) doivent être servis `from cache` en `0 ms`. C'est le cas de `avatar-42.png` / `app.css` au §1.
- **Couche [2] CDN** : l'app mobile et l'admin tapent une API géo-distribuée. La liste des familles, quasi statique, se cache en bordure pour couper la latence transcontinentale.
- **Couches [3]-[4] reverse proxy / applicatif** : devant l'API, un cache partagé absorbe le pic du soir sur `GET /api/families` pour que la couche [5] BDD ne voie qu'une requête par intervalle de TTL.
- **Couche [5] BDD** : source de vérité, sollicitée le moins possible. Tout l'objectif du cours est de réduire le nombre de requêtes qui l'atteignent.

Le fil rouge des modules suivants : reprendre chaque endpoint de l'API TribuZen et lui appliquer la bonne stratégie de cache à la bonne couche, pour faire tomber à la fois la latence perçue et la facture cloud.

Endpoint témoin suivi tout au long du cours :
```
GET /api/families   -> aujourd'hui : 870 ms, 1 requête BDD par ouverture
                    -> objectif fin de cours : ~30 ms (CDN), 1 requête BDD / minute
```

---

## 6. Points clés

1. HTTP est un protocole **client-serveur requête-réponse**, sans état, textuel, piloté par ses **en-têtes** — c'est le socle de tout le web.
2. Le **caching est le levier de perf n°1** : il attaque simultanément la latence (100-1000× plus rapide), le coût serveur et la scalabilité.
3. Un cache hit en RAM (~1 ms) est incomparablement plus rapide qu'un aller à l'origine (~100-300 ms) : « ne pas faire la requête » bat toute optimisation de code.
4. Le cache est une **chaîne de couches** : navigateur → CDN → reverse proxy → applicatif → BDD, du plus rapide/proche au plus lent/source de vérité.
5. Cache **privé** (navigateur, un seul user) vs **partagé** (CDN/proxy, tous les users) : ne jamais mettre de contenu personnalisé dans un cache partagé.
6. Vocabulaire socle : **hit/miss**, **fresh/stale**, **revalidation** (`304`), **TTL**, **invalidation**.
7. On observe tout ça avec **DevTools > Network** (`Status`, `Size`, `Time`) et **curl -I** — aucun code requis pour comprendre le comportement du cache.

---

## 7. Seeds Anki

```
Quelles sont les 3 propriétés fondamentales de HTTP ?|Sans état (stateless), basé sur du texte, extensible via les en-têtes. Le stateless est précisément ce qui rend le caching sûr.
Pourquoi le caching est-il le levier de performance n°1 ?|Il élimine des allers-retours réseau (un hit RAM ~1 ms vs origine ~100-300 ms, soit 100-1000× plus rapide), réduit le coût serveur (moins de CPU/BDD) et absorbe les pics de charge (scalabilité).
Cite les couches de cache dans l'ordre, de l'utilisateur à la source de vérité.|Cache navigateur -> CDN -> reverse proxy/cache serveur partagé -> cache applicatif -> base de données.
Quelle est la différence entre un cache privé et un cache partagé ?|Privé (navigateur) = réservé à un seul utilisateur, peut stocker des données personnelles. Partagé (CDN, reverse proxy) = servi à tous, donc jamais de contenu personnalisé sans en-tête private.
Différence entre cache hit et cache miss ?|Hit = la copie demandée est trouvée dans le cache, réponse immédiate sans aller à l'origine. Miss = absente, il faut interroger la couche suivante.
Que signifient "fresh" et "stale" pour une entrée de cache ?|Fresh = encore dans sa durée de validité (TTL), servie directement. Stale = TTL dépassé ; la copie existe encore mais doit être revalidée (elle n'est pas forcément fausse).
Qu'est-ce qu'une revalidation et quel status l'accompagne ?|Demander à l'origine si une copie stale est toujours bonne. Réponse 304 Not Modified (copie réutilisée, corps non renvoyé) ou 200 OK (nouvelle version).
Dans DevTools > Network, comment distingue-t-on un cache hit d'un téléchargement ?|Colonne Size : "(from disk/memory cache)" et Time ~0 ms = hit ; une taille en octets = téléchargé depuis l'origine. Le 304 = revalidation réussie, pas un hit direct.
```

---

## Pont vers le lab

> Lab associé : [`../labs/lab-00-prerequis-et-vue-ensemble/README.md`](../labs/lab-00-prerequis-et-vue-ensemble/README.md). Tu observes le comportement du cache sur de vraies ressources avec `curl -I` et DevTools > Network, puis tu déclenches toi-même un `304` de revalidation sur un mini-serveur Node — sans écrire une ligne de logique de cache. Pratique guidée + corrigé complet.
