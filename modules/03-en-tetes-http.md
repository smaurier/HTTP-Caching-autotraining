---
titre: Les en-têtes HTTP
cours: 11-http-caching
notions: [en-têtes de représentation, Content-Type, Content-Encoding gzip/brotli, Content-Length, Content-Language, négociation de contenu, Accept/Accept-Encoding/Accept-Language, Vary comme clé de cache, en-têtes de cache en survol, CORS et Access-Control, en-têtes de sécurité, requêtes conditionnelles If-*, Range et Accept-Ranges, Set-Cookie et attributs]
outcomes: [catégoriser un en-tête HTTP par sa fonction, lire et écrire les en-têtes de représentation et de négociation, expliquer le rôle de Vary comme clé de cache et l'appliquer correctement]
prerequis: [02-http2-http3]
next: 04-cache-control
libs: []
tribuzen: en-têtes de l'API TribuZen (Content-Type JSON, Vary Accept-Encoding, CORS app mobile, compression brotli) et impact de Vary sur le cache CDN
last-reviewed: 2026-07
---

# Les en-têtes HTTP

> **Outcomes — tu sauras FAIRE :** catégoriser un en-tête HTTP par sa fonction (représentation, négociation, cache, CORS, sécurité, conditionnel, cookie), lire et écrire les en-têtes de représentation et de négociation, expliquer et appliquer `Vary` comme clé de cache.
> **Difficulté :** :star::star:

## 1. Cas concret d'abord

L'API TribuZen sert la liste des membres d'une famille à deux clients : l'app web (React) et l'app mobile (React Native). Un CDN est placé devant l'API pour soulager le serveur. Un dev a activé la compression et la traduction côté serveur, puis a constaté ce bug en production :

```bash
# 1er appel — app web, Chrome, veut du brotli, en français
curl -s -D - -o /dev/null https://api.tribuzen.app/families/42/members \
  -H "Accept-Encoding: br" \
  -H "Accept-Language: fr"
# HTTP/2 200
# content-type: application/json
# content-encoding: br
# content-language: fr
# cache-control: public, max-age=300
# (le CDN met cette réponse en cache sous la clé = URL)

# 2e appel — app mobile, ne gère pas brotli, veut de l'anglais
curl -s -D - -o /dev/null https://api.tribuzen.app/families/42/members \
  -H "Accept-Encoding: gzip" \
  -H "Accept-Language: en"
# HTTP/2 200  (age: 12)  <-- servi depuis le cache CDN !
# content-encoding: br   <-- BROTLI alors que le client a demandé gzip
# content-language: fr   <-- FRANÇAIS alors que le client a demandé en
# => l'app mobile reçoit des octets brotli qu'elle ne sait pas décompresser
#    => JSON illisible, écran blanc
```

Le serveur **adapte** sa réponse selon `Accept-Encoding` et `Accept-Language`, mais il n'a **pas dit au CDN** que la réponse dépendait de ces en-têtes. Le CDN a donc réutilisé la première version pour tout le monde.

La correction tient en un seul en-tête de réponse :

```
Vary: Accept-Encoding, Accept-Language
```

Ce module fait le panorama structuré des en-têtes HTTP par catégorie, puis insiste sur les deux points qui cassent le plus souvent le cache : la **négociation de contenu** et l'en-tête **`Vary`**, qui définit la clé de cache.

---

## 2. Théorie complète, concise

Un en-tête est une paire `Nom: valeur`. Le nom est insensible à la casse (en HTTP/2 et HTTP/3 il est toujours transmis en minuscules — voir module 02). On les classe par **fonction**, pas par direction. Voici les sept catégories utiles.

### 2.1 En-têtes de représentation — « quelle forme a le corps »

Ils décrivent les octets du body : format, compression, taille, langue.

```
Content-Type:     application/json; charset=utf-8   # format MIME (+ charset)
Content-Encoding: br                                # compression appliquée au body
Content-Length:   1834                              # taille EXACTE du body, en octets
Content-Language: fr                                # langue naturelle du contenu
```

- **`Content-Type`** — le type MIME. Un mauvais `Content-Type` casse tout : du HTML servi en `text/plain` s'affiche comme source ; du JSON sans `application/json` peut ne pas être parsé. Le `charset` fait partie de la valeur.
- **`Content-Encoding`** — la compression **de bout en bout** appliquée au body. Valeurs courantes : `gzip` (universel, ~70 %), `br` (brotli, moderne, ~80 % sur le texte), `zstd` (émergent). Le client doit décompresser lui-même. À distinguer de `Transfer-Encoding: chunked` qui est un encodage **de transport** (hop-by-hop), pas une compression de contenu.
- **`Content-Length`** — nombre d'octets du body (pas de caractères : un `é` UTF-8 = 2 octets). Absent quand la réponse est en `Transfer-Encoding: chunked` (taille inconnue à l'avance, ex. streaming).
- **`Content-Language`** — la langue du contenu renvoyé (résultat de la négociation).

### 2.2 En-têtes de négociation de contenu — « ce que le client préfère »

Le client exprime ses préférences via les en-têtes `Accept*` ; le serveur choisit la meilleure représentation. Le paramètre de qualité `q` (0 à 1, défaut 1) ordonne les préférences.

```
Accept:          application/json, text/html;q=0.9   # JSON préféré, HTML acceptable
Accept-Encoding: br, gzip                            # brotli préféré, gzip sinon
Accept-Language: fr-FR, fr;q=0.9, en;q=0.5           # français d'abord, anglais en secours
```

Chaque `Accept*` (requête) a son pendant de représentation (réponse) :

| Client demande (requête) | Serveur répond (réponse)            |
|--------------------------|-------------------------------------|
| `Accept`                 | `Content-Type`                      |
| `Accept-Encoding`        | `Content-Encoding`                  |
| `Accept-Language`        | `Content-Language`                  |

**Point crucial :** dès que la réponse **dépend** d'un de ces en-têtes de requête, le serveur DOIT le déclarer dans `Vary` (section 2.4) — sinon un cache partagé sert la mauvaise version. C'est le lien entre négociation et cache.

### 2.3 En-têtes de cache — vue d'ensemble

Détaillés dans les modules 04 (Cache-Control) et 05 (ETag / validation conditionnelle). Panorama minimal ici :

```
Cache-Control: public, max-age=300     # politique de fraîcheur (module 04)
ETag:          "a1b2c3"                 # empreinte de version (module 05)
Last-Modified: Wed, 01 Jul 2026 10:00:00 GMT  # date de dernière modif (module 05)
Age:           12                       # secondes passées dans un cache intermédiaire
Expires:       Wed, 01 Jul 2026 11:00:00 GMT  # ancien mécanisme, remplacé par Cache-Control
```

Retiens ici seulement : `Cache-Control` pilote la fraîcheur, `ETag`/`Last-Modified` permettent la revalidation, et **`Vary` définit la clé de cache** — le seul en-tête de cette famille qu'on approfondit dans ce module.

### 2.4 `Vary` — la clé de cache (le cœur du module)

Par défaut, la **clé de cache** d'une réponse est son URL. `Vary` ajoute des en-têtes **de la requête** à cette clé : « cette réponse varie selon ces en-têtes ; stocke une version distincte par combinaison ».

```
Vary: Accept-Encoding                       # 1 version par encodage
Vary: Accept-Encoding, Accept-Language      # 1 version par (encodage × langue)
Vary: Origin                                # 1 version par origine (réponses CORS)
Vary: *                                     # réponse NON cachable (chaque requête est unique)
```

Effet sur les clés de cache d'un CDN :

```
# Sans Vary : clé = URL seule
GET /families/42/members  -->  UNE seule version stockée (bug du cas concret)

# Vary: Accept-Encoding, Accept-Language : clé = URL + ces 2 en-têtes
GET /families/42/members + (br,   fr)  -->  version brotli / française
GET /families/42/members + (gzip, fr)  -->  version gzip   / française
GET /families/42/members + (br,   en)  -->  version brotli / anglaise
GET /families/42/members + (gzip, en)  -->  version gzip   / anglaise
# = 2 encodages × 2 langues = 4 entrées de cache pour la même URL
```

Deux erreurs symétriques :
- **Oublier `Vary`** quand on négocie → le cache sert la mauvaise version (langue/encodage faux).
- **Trop de `Vary`** → explosion combinatoire, taux de hit qui s'effondre. `Vary: User-Agent` (des milliers de valeurs) et `Vary: Cookie` (une valeur par utilisateur) rendent un cache partagé quasi inutile. Pour du contenu par utilisateur, préférer `Cache-Control: private` (module 04) plutôt que `Vary: Cookie`.

### 2.5 En-têtes CORS — « qui a le droit de lire cette réponse cross-origin »

Quand une page d'une origine (protocole + domaine + port) appelle une autre origine, le navigateur applique la politique CORS. Le client envoie `Origin` ; le serveur autorise via les en-têtes `Access-Control-*`.

```
# Requête (le navigateur ajoute Origin automatiquement)
Origin: https://app.tribuzen.app

# Réponse simple
Access-Control-Allow-Origin: https://app.tribuzen.app
Access-Control-Allow-Credentials: true

# Réponse à un préflight (méthode OPTIONS, déclenché par requête « non simple »)
Access-Control-Allow-Methods: GET, POST, PUT, DELETE
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Max-Age: 86400        # cache du préflight côté navigateur, 24 h
```

| En-tête | Rôle |
|---|---|
| `Origin` (requête) | origine de la page appelante |
| `Access-Control-Allow-Origin` | origine(s) autorisée(s) — une URL précise, ou `*` |
| `Access-Control-Allow-Methods` | méthodes autorisées (réponse préflight) |
| `Access-Control-Allow-Headers` | en-têtes custom autorisés (réponse préflight) |
| `Access-Control-Allow-Credentials` | autorise l'envoi des cookies cross-origin |
| `Access-Control-Max-Age` | durée de cache du préflight, en secondes |
| `Access-Control-Expose-Headers` | en-têtes de réponse lisibles par le JS client |

Lien avec le cache : si `Access-Control-Allow-Origin` reflète l'`Origin` de la requête (au lieu d'un `*` fixe), la réponse **dépend** de l'origine → il faut `Vary: Origin` pour que le cache ne serve pas l'entête d'une mauvaise origine.

### 2.6 En-têtes de sécurité — survol

Détaillés dans le cours sécurité. Ce sont des en-têtes de **réponse** qui durcissent le comportement du navigateur :

```
Strict-Transport-Security: max-age=63072000; includeSubDomains   # HSTS : force HTTPS
Content-Security-Policy: default-src 'self'                       # CSP : sources autorisées
X-Content-Type-Options: nosniff                                   # interdit le MIME sniffing
X-Frame-Options: DENY                                             # anti-clickjacking (iframe)
Referrer-Policy: strict-origin-when-cross-origin                  # ce qui fuit dans Referer
```

À retenir ici : ils ne servent pas à la négociation ni au cache, mais `X-Content-Type-Options: nosniff` renforce le rôle de `Content-Type` (le navigateur n'essaie plus de deviner le type malgré l'en-tête).

### 2.7 En-têtes conditionnels, `Range`, cookies

**Requêtes conditionnelles `If-*`** (détaillées module 05) — le client conditionne la réponse à l'état de la ressource :

```
If-None-Match:     "a1b2c3"                           # « réponds 304 si l'ETag est inchangé »
If-Modified-Since: Wed, 01 Jul 2026 10:00:00 GMT      # « 304 si pas modifié depuis »
```

**`Range` / `Accept-Ranges`** — téléchargement partiel (reprise, lecture vidéo par morceaux) :

```
Accept-Ranges: bytes            # (réponse) le serveur supporte les requêtes partielles
Range: bytes=0-1023             # (requête) « envoie-moi les 1024 premiers octets »
# => réponse 206 Partial Content
```

**Cookies** — `Set-Cookie` (réponse) pose un cookie, `Cookie` (requête) le renvoie. Les attributs contrôlent portée et sécurité :

```
Set-Cookie: session=abc123; HttpOnly; Secure; SameSite=Lax; Max-Age=3600; Path=/
```

- `HttpOnly` — inaccessible au JS (anti-XSS).
- `Secure` — envoyé uniquement en HTTPS.
- `SameSite` — `Lax` / `Strict` / `None` : limite l'envoi cross-site (anti-CSRF).
- `Max-Age` / `Expires` — durée de vie ; `Path` / `Domain` — portée.

Lien avec le cache : une réponse avec `Set-Cookie` est spécifique à l'utilisateur — elle ne doit généralement pas finir dans un cache partagé (`Cache-Control: private`, module 04).

---

## 3. Worked examples

### Exemple 1 — Catégoriser les en-têtes d'une vraie réponse

On observe la réponse brute de l'API TribuZen. Objectif : ranger chaque en-tête dans sa catégorie et repérer ce qui touche le cache.

```
HTTP/2 200
content-type: application/json; charset=utf-8       # (A) représentation
content-encoding: br                                # (A) représentation
content-language: fr                                # (A) représentation
vary: accept-encoding, accept-language              # (B) NÉGOCIATION → clé de cache
cache-control: public, max-age=300                  # (C) cache (module 04)
etag: "7d3-fam42"                                   # (C) cache (module 05)
age: 42                                             # (C) cache (temps en cache CDN)
access-control-allow-origin: https://app.tribuzen.app  # (D) CORS
strict-transport-security: max-age=63072000         # (E) sécurité
set-cookie: sid=...; HttpOnly; Secure; SameSite=Lax # (F) cookie
```

Lecture experte, dans l'ordre :
1. **Représentation (A)** : c'est du JSON, en français, compressé brotli. Le client doit décompresser br avant de parser.
2. **`Vary` (B)** : la réponse dépend de `Accept-Encoding` **et** `Accept-Language`. Le CDN stockera donc une entrée par combinaison → pas de bug de version croisée. C'est la ligne qui manquait dans le cas concret.
3. **Cache (C)** : cachable 300 s (`public`), revalidable via l'`ETag`, et elle a déjà passé 42 s dans le CDN (`age`).
4. **Incohérence à repérer** : `set-cookie` (F) sur une réponse `cache-control: public`. Un cookie de session dans un cache **partagé** fuiterait la session d'un utilisateur vers un autre. Correctif : `Cache-Control: private` pour toute réponse posant un cookie de session.

### Exemple 2 — Un serveur qui négocie et pose `Vary` correctement

Serveur Node natif : il négocie encodage + langue et déclare `Vary`. C'est la version corrigée du cas concret.

```typescript
// server-vary.ts — négociation de contenu + Vary correct
import http from 'node:http';
import zlib from 'node:zlib';

const MEMBERS = {
  fr: JSON.stringify({ famille: 'Les Dupont', membres: ['Alice', 'Bob'] }),
  en: JSON.stringify({ family: 'The Duponts', members: ['Alice', 'Bob'] }),
};

const server = http.createServer((req, res) => {
  // --- 1. Négocier la langue à partir d'Accept-Language ---
  const acceptLang = (req.headers['accept-language'] ?? 'en') as string;
  const lang: 'fr' | 'en' = acceptLang.includes('fr') ? 'fr' : 'en';
  const json = MEMBERS[lang];

  // --- 2. Négocier la compression à partir d'Accept-Encoding ---
  const acceptEnc = (req.headers['accept-encoding'] ?? '') as string;
  let body: Buffer;
  let encoding: string | null = null;
  if (acceptEnc.includes('br')) {
    body = zlib.brotliCompressSync(Buffer.from(json)); // brotli préféré
    encoding = 'br';
  } else if (acceptEnc.includes('gzip')) {
    body = zlib.gzipSync(Buffer.from(json));           // gzip en secours
    encoding = 'gzip';
  } else {
    body = Buffer.from(json);                          // non compressé
  }

  // --- 3. En-têtes de représentation + Vary (CLÉ DE CACHE) ---
  const headers: Record<string, string | number> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Language': lang,
    'Content-Length': body.length,        // taille du body COMPRESSÉ, en octets
    'Cache-Control': 'public, max-age=300',
    // La réponse dépend de ces 2 en-têtes de requête → on DOIT le déclarer,
    // sinon le CDN sert une version pour la mauvaise langue/encodage.
    'Vary': 'Accept-Encoding, Accept-Language',
  };
  if (encoding) headers['Content-Encoding'] = encoding;

  res.writeHead(200, headers);
  res.end(body);
});

server.listen(3000, () => console.log('http://localhost:3000'));
```

Vérification manuelle : deux clients différents reçoivent bien deux représentations distinctes, et l'en-tête `vary` est présent.

```bash
curl -s -D - -o /dev/null http://localhost:3000 -H "Accept-Encoding: br"   -H "Accept-Language: fr"
# content-encoding: br   content-language: fr   vary: Accept-Encoding, Accept-Language

curl -s -D - -o /dev/null http://localhost:3000 -H "Accept-Encoding: gzip" -H "Accept-Language: en"
# content-encoding: gzip content-language: en   vary: Accept-Encoding, Accept-Language
```

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Confondre `Content-Encoding` (compression) et `Transfer-Encoding` (transport)

```
# ❌ Croire que gzip = Transfer-Encoding
Transfer-Encoding: gzip     # quasi jamais utilisé/supporté ; c'est du transport hop-by-hop

# ✅ La compression de contenu se déclare ainsi
Content-Encoding: gzip      # bout en bout : le client final décompresse
Transfer-Encoding: chunked  # transport : découpage en morceaux, taille inconnue
```

`Content-Encoding` survit à travers les proxys (c'est le contenu même) ; `Transfer-Encoding` est renégocié à chaque saut. La compression web, c'est **toujours** `Content-Encoding`.

### PIÈGE #2 — Négocier une réponse sans poser `Vary`

```
# ❌ Le serveur adapte selon Accept-Encoding mais ne le déclare pas
Content-Encoding: br
# (pas de Vary)  -> un cache partagé sert ces octets brotli à un client gzip-only => corruption

# ✅ Déclarer la dépendance
Content-Encoding: br
Vary: Accept-Encoding
```

Règle : **tout en-tête `Accept*` qui influence la réponse doit apparaître dans `Vary`**. C'est exactement le bug du cas concret.

### PIÈGE #3 — `Vary` trop large (`User-Agent`, `Cookie`, `*`)

```
# ❌ Explosion combinatoire : autant d'entrées que de User-Agents / de cookies
Vary: User-Agent
Vary: Cookie
Vary: *            # rend la ressource carrément non cachable

# ✅ Ne varier que sur ce qui change vraiment la représentation partageable
Vary: Accept-Encoding, Accept-Language
# Pour du contenu par utilisateur : ne pas varier sur Cookie, utiliser
Cache-Control: private
```

Chaque valeur distincte d'un en-tête de `Vary` crée une entrée de cache. `Cookie` et `User-Agent` ont trop de valeurs → taux de hit proche de zéro.

### PIÈGE #4 — `Content-Length` en caractères au lieu d'octets

```typescript
// ❌ .length compte les caractères (points de code), pas les octets
const body = 'Réservé aux modérateurs'; // accents = 2 octets chacun en UTF-8
res.setHeader('Content-Length', body.length); // FAUX : sous-estime la taille

// ✅ Compter les octets
res.setHeader('Content-Length', Buffer.byteLength(body, 'utf8'));
```

Un `Content-Length` erroné → réponse tronquée ou connexion qui traîne. Toujours mesurer en octets (`Buffer.byteLength`), et sur le body **après** compression.

### PIÈGE #5 — Cacher une réponse porteuse de `Set-Cookie` dans un cache partagé

```
# ❌ Cookie de session + cache public = fuite de session entre utilisateurs
Cache-Control: public, max-age=600
Set-Cookie: sid=abc123; HttpOnly

# ✅ Réponse personnalisée : cache navigateur seulement, jamais un CDN/proxy
Cache-Control: private, max-age=0
Set-Cookie: sid=abc123; HttpOnly; Secure; SameSite=Lax
```

`public` autorise les caches **partagés** ; un `Set-Cookie` y est spécifique à un utilisateur.

---

## 5. Ancrage TribuZen

L'API TribuZen (NestJS, module fil-rouge du back) et son CDN reposent directement sur ces en-têtes.

**Représentation** — toutes les routes JSON renvoient `Content-Type: application/json; charset=utf-8`. Les réponses volumineuses (liste de membres, historique d'événements) sont compressées en **brotli** (`Content-Encoding: br`) avec repli gzip pour les clients anciens, via le middleware de compression du serveur.

**Négociation + `Vary`** — l'API sert le français et l'anglais selon `Accept-Language`, et compresse selon `Accept-Encoding`. Chaque réponse cachable porte donc :

```
Vary: Accept-Encoding, Accept-Language
Cache-Control: public, max-age=300
```

C'est ce `Vary` qui permet au **CDN de TribuZen** de stocker sans les mélanger : version fr/br, fr/gzip, en/br, en/gzip. Sans lui, l'app mobile (souvent gzip-only, parfois en anglais) récupérerait la version web fr/brotli mise en cache en premier — le bug du cas concret, observé pour de vrai en preview.

**CORS pour l'app mobile et le web** — l'API TribuZen est appelée cross-origin par `app.tribuzen.app` (web) et par le bundle de l'app mobile. Les origines autorisées sont reflétées dynamiquement, donc la réponse ajoute `Vary: Origin` en plus, et le préflight est mis en cache 24 h côté client :

```
Access-Control-Allow-Origin: https://app.tribuzen.app
Access-Control-Allow-Credentials: true
Access-Control-Max-Age: 86400
Vary: Origin, Accept-Encoding, Accept-Language
```

**Cookies de session** — les routes d'auth posent `Set-Cookie: sid=...; HttpOnly; Secure; SameSite=Lax` et forcent `Cache-Control: private` pour ne jamais atterrir dans le CDN.

---

## 6. Points clés

1. On classe les en-têtes par **fonction** : représentation, négociation, cache, CORS, sécurité, conditionnels/Range, cookies.
2. **Représentation** : `Content-Type` (format MIME + charset), `Content-Encoding` (compression br/gzip), `Content-Length` (octets), `Content-Language` (langue).
3. **Négociation** : le client envoie `Accept` / `Accept-Encoding` / `Accept-Language` avec des poids `q` ; le serveur répond avec les `Content-*` correspondants.
4. **`Vary` est la clé de cache** : il ajoute des en-têtes de requête à la clé (URL par défaut) ; tout `Accept*` qui change la réponse doit y figurer.
5. Oublier `Vary` → mauvaise version servie ; `Vary` trop large (`User-Agent`, `Cookie`, `*`) → cache inefficace voire non cachable.
6. `Content-Encoding` (compression bout en bout) ≠ `Transfer-Encoding: chunked` (transport hop-by-hop, sans `Content-Length`).
7. **CORS** : `Origin` + `Access-Control-*` ; réponse reflétant l'origine → ajouter `Vary: Origin`. **Sécurité** (HSTS, CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`) et **cookies** (`Set-Cookie` + `HttpOnly`/`Secure`/`SameSite`) : une réponse à cookie de session reste `private`.

---

## 7. Seeds Anki

```
Comment classe-t-on les en-têtes HTTP dans ce module ?|Par fonction, pas par direction : représentation, négociation de contenu, cache, CORS, sécurité, conditionnels/Range, cookies.
Quels en-têtes décrivent la représentation (le body) d'une réponse ?|Content-Type (MIME + charset), Content-Encoding (compression br/gzip), Content-Length (taille en octets), Content-Language (langue).
Quelle est la différence entre Content-Encoding et Transfer-Encoding ?|Content-Encoding = compression de bout en bout du contenu (gzip, br), le client décompresse. Transfer-Encoding: chunked = encodage de transport hop-by-hop pour une taille inconnue, sans Content-Length. La compression web se déclare toujours via Content-Encoding.
À quoi sert l'en-tête Vary et pourquoi est-il la clé de cache ?|Vary liste les en-têtes de requête dont dépend la réponse. La clé de cache par défaut est l'URL ; Vary y ajoute ces en-têtes, donc le cache stocke une version distincte par combinaison (ex. Vary: Accept-Encoding, Accept-Language). C'est indispensable dès qu'on négocie le contenu.
Que se passe-t-il si un serveur négocie (Accept-Encoding/Language) sans poser Vary ?|Un cache partagé (CDN/proxy) réutilise la première version pour tous : un client gzip/anglais peut recevoir la version brotli/française mise en cache en premier → contenu corrompu ou mauvaise langue.
Pourquoi Vary: Cookie ou Vary: User-Agent sont-ils déconseillés ?|Ces en-têtes ont trop de valeurs distinctes (un cookie par utilisateur, des milliers de User-Agents) → explosion du nombre d'entrées et taux de hit qui s'effondre. Pour du contenu par utilisateur, utiliser Cache-Control: private plutôt que Vary: Cookie.
Quel en-tête CORS met en cache le préflight et lequel autorise les cookies cross-origin ?|Access-Control-Max-Age met en cache la réponse au préflight OPTIONS (en secondes). Access-Control-Allow-Credentials: true autorise l'envoi des cookies cross-origin. Si Access-Control-Allow-Origin reflète l'Origin, ajouter Vary: Origin.
Pourquoi ne faut-il pas cacher publiquement une réponse contenant Set-Cookie ?|Cache-Control: public autorise les caches partagés ; un Set-Cookie de session y serait spécifique à un utilisateur et fuiterait sa session vers d'autres. Utiliser Cache-Control: private pour toute réponse posant un cookie de session.
```

---

## Pont vers le lab

> Lab associé : `11-http-caching/labs/lab-03-en-tetes-http/README.md`. Catégoriser des en-têtes réels au curl, puis observer concrètement l'effet de `Vary` sur le cache. Corrigé complet inline + variante J+30 + application TribuZen.
