# Glossaire

Termes clés utilisés tout au long de la formation, classés par ordre alphabétique.

---

## B

### bfcache (Back/Forward Cache) {#bfcache}
Cache navigateur qui stocke un instantané complet de la page (DOM, JavaScript, état) quand l'utilisateur navigue en arrière ou en avant. La page est restaurée instantanément au lieu d'être re-téléchargée. Analogie : c'est comme mettre une page de livre en pause plutôt que de devoir la relire.

### Brotli {#brotli}
Algorithme de compression développé par Google, plus efficace que gzip pour les ressources web. Identifié par `Content-Encoding: br`. Réduit typiquement la taille des fichiers de 15-25% de plus que gzip.

## C

### Cache-Control {#cache-control}
L'en-tête HTTP le plus important pour le caching. Contient les directives qui dictent comment une réponse peut être cachée, par qui, et pour combien de temps. Analogie : c'est le chef d'orchestre du cache — il donne les instructions à toutes les couches.

### Cache-First {#cache-first}
Stratégie de cache qui vérifie d'abord le cache local avant de faire une requête réseau. Si le cache contient une réponse valide, elle est servie directement. Avantage : performances optimales. Risque : données potentiellement stale.

### CDN (Content Delivery Network) {#cdn}
Réseau de serveurs distribués géographiquement (edge servers) qui cachent le contenu au plus près des utilisateurs. Réduit la latence en servant les ressources depuis le POP le plus proche plutôt que depuis le serveur d'origine.

### CLS (Cumulative Layout Shift) {#cls}
Métrique Core Web Vitals qui mesure la stabilité visuelle d'une page. Un CLS élevé signifie que des éléments bougent de manière inattendue pendant le chargement, perturbant l'expérience utilisateur.

### Conditional Request {#conditional-request}
Requête HTTP qui inclut des en-têtes conditionnels (`If-None-Match`, `If-Modified-Since`) permettant au serveur de répondre 304 Not Modified si la ressource n'a pas changé, évitant de re-transférer le body.

### Content Negotiation {#content-negotiation}
Mécanisme HTTP ou le client indique ses préférences (format, langue, encoding) via les en-têtes `Accept-*`, et le serveur choisit la meilleure représentation de la ressource à envoyer.

### CORS (Cross-Origin Resource Sharing) {#cors}
Mécanisme de sécurité basé sur des en-têtes HTTP qui permet à un serveur d'indiquer quelles origines sont autorisées à accéder à ses ressources. Les requêtes cross-origin « complexes » déclenchent une requête preflight OPTIONS.

### Critical Rendering Path {#critical-rendering-path}
Séquence d'étapes que le navigateur suit pour transformer HTML, CSS et JavaScript en pixels à l'écran : HTML → DOM, CSS → CSSOM, DOM + CSSOM → Render Tree → Layout → Paint. Optimiser ce chemin est crucial pour le LCP.

## D

### Disk Cache {#disk-cache}
Cache du navigateur stocké sur le disque dur. Persiste après la fermeture du navigateur. Plus lent que le memory cache mais avec une capacité bien supérieure. Utilisé pour les ressources qui ne sont pas en mémoire.

## E

### Edge Function {#edge-function}
Code qui s'exécute sur les serveurs edge d'un CDN, au plus proche de l'utilisateur. Permet du compute léger (routing, auth, transformation) sans round-trip vers le serveur d'origine. Ex : Cloudflare Workers, Vercel Edge Runtime.

### Edge Rendering {#edge-rendering}
Technique de rendering qui exécute le SSR sur les serveurs edge plutôt que sur le serveur d'origine. Réduit drastiquement le TTFB en rapprochant le compute de l'utilisateur.

### ETag {#etag}
En-tête HTTP de réponse contenant un identifiant unique pour une version spécifique d'une ressource (souvent un hash du contenu). Utilisé avec `If-None-Match` pour la validation conditionnelle. Peut être strong (`"abc123"`) ou weak (`W/"abc123"`).

## F

### Fresh {#fresh}
État d'une réponse cachée dont le TTL (défini par `max-age` ou `Expires`) n'a pas encore expiré. Une réponse fresh est servie directement depuis le cache sans validation auprès du serveur d'origine.

## G

### Gzip {#gzip}
Algorithme de compression standard pour le web, identifié par `Content-Encoding: gzip`. Réduit typiquement la taille des fichiers texte (HTML, CSS, JS, JSON) de 60-80%.

## H

### Head-of-Line Blocking {#head-of-line-blocking}
Problème ou une requête lente bloque toutes les requêtes qui suivent sur la même connexion. En HTTP/1.1, cela se produit au niveau applicatif. En HTTP/2, le problème persiste au niveau TCP. HTTP/3 (QUIC/UDP) résout ce problème.

### HPACK {#hpack}
Algorithme de compression des en-têtes HTTP/2. Utilise une table statique et une table dynamique pour éviter de re-transmettre les en-têtes répétitifs entre requêtes, réduisant significativement l'overhead.

### HTTP/2 {#http2}
Version majeure du protocole HTTP introduisant le multiplexing (plusieurs requêtes/réponses sur une seule connexion TCP), les frames binaires, HPACK compression et server push.

### HTTP/3 {#http3}
Dernière version du protocole HTTP, basée sur QUIC (UDP) au lieu de TCP. Élimine le head-of-line blocking au niveau transport, supporte le 0-RTT connection establishment, et améliore la performance sur les réseaux instables.

### Hydration {#hydration}
Processus côté client ou JavaScript « réactive » le HTML statique reçu du serveur en attachant les event listeners et en synchronisant l'état. Le HTML devient interactif après l'hydration. L'« uncanny valley » est la période entre l'affichage et l'interactivité.

## I

### Immutable {#immutable}
Directive Cache-Control indiquant que la ressource ne changera jamais. Le navigateur ne revalidera jamais cette ressource pendant sa durée de vie. Typiquement utilisé avec des fichiers versionnés (ex: `app.a1b2c3.js`).

### INP (Interaction to Next Paint) {#inp}
Métrique Core Web Vitals qui mesure la réactivité de la page aux interactions utilisateur. Remplace FID. Mesure le temps entre une interaction (clic, tap, keypress) et le prochain rendu visuel.

### ISR (Incremental Static Regeneration) {#isr}
Pattern de rendering qui combine les avantages du SSG (pages pré-rendues, performances statiques) avec la fraîcheur du SSR (mise à jour automatique en background). La page statique est servie immédiatement, puis re-générée en arrière-plan quand elle est stale.

## L

### Last-Modified {#last-modified}
En-tête HTTP de réponse contenant la date de dernière modification de la ressource. Utilisé avec `If-Modified-Since` pour la validation conditionnelle. Moins précis que ETag (résolution à la seconde).

### LCP (Largest Contentful Paint) {#lcp}
Métrique Core Web Vitals qui mesure le temps de rendu du plus grand élément visible dans le viewport (image, bloc de texte, vidéo). Cible : < 2.5 secondes.

### Lighthouse {#lighthouse}
Outil d'audit de performance web de Google intégré à Chrome DevTools. Mesure les Core Web Vitals, identifie les opportunités d'optimisation et fournit des recommandations actionnables.

## M

### max-age {#max-age}
Directive Cache-Control spécifiant la durée de vie (en secondes) d'une réponse cachée avant qu'elle devienne stale. `max-age=3600` = la réponse est fresh pendant 1 heure.

### Memory Cache {#memory-cache}
Cache du navigateur stocké en RAM. Extrêmement rapide mais volatile (disparaît à la fermeture de l'onglet). Utilisé pour les ressources récemment accédées ou preloadées.

### Multi-Layer Cache {#multi-layer-cache}
Architecture de cache ou plusieurs couches sont empilées : Browser → CDN → Reverse Proxy → Application → Base de données. Chaque couche réduit la charge sur la couche suivante.

### must-revalidate {#must-revalidate}
Directive Cache-Control qui force le cache à revalider auprès du serveur une fois que la réponse est stale. Sans cette directive, le cache peut servir du contenu stale dans certaines conditions (ex: réseau indisponible).

## N

### Network-First {#network-first}
Stratégie de cache qui tente d'abord une requête réseau. Si elle échoue (timeout, erreur), le cache local est consulté en fallback. Avantage : données toujours fraîches. Inconvénient : latence du réseau à chaque requête.

### no-cache {#no-cache}
Directive Cache-Control souvent mal comprise : elle ne signifie PAS « ne pas cacher ». Elle signifie « toujours revalider auprès du serveur avant de servir depuis le cache ». La ressource EST cachée, mais jamais servie sans validation.

### no-store {#no-store}
Directive Cache-Control qui interdit réellement au cache de stocker la réponse. Aucune copie n'est conservée, ni en mémoire, ni sur disque. À utiliser pour les données sensibles (bancaires, médicales).

## O

### On-Demand Revalidation {#on-demand-revalidation}
Mécanisme ISR ou la régénération d'une page est déclenchée par un événement externe (webhook, API call) plutôt que par un timer. Permet une mise à jour ciblée et instantanée du contenu statique.

### Origin Server {#origin-server}
Le serveur « source » qui génère le contenu original. Dans une architecture avec CDN, l'origin server est le serveur auquel le CDN fait appel quand il n'a pas la ressource en cache (cache miss).

## P

### Performance Budget {#performance-budget}
Limites définies pour les métriques de performance d'un site (taille JS < 300 KB, LCP < 2.5s, etc.). Permet de détecter les régressions et de maintenir des standards de performance.

### POP (Point of Presence) {#pop}
Emplacement physique d'un edge server dans le réseau CDN. Plus le POP est proche de l'utilisateur, plus la latence est faible. Les grands CDN ont 200+ POPs à travers le monde.

### Prefetch {#prefetch}
Hint navigateur (`<link rel="prefetch">`) qui télécharge en avance une ressource susceptible d'être nécessaire pour une navigation future. Priorité basse, ne bloque pas le rendu courant.

### Preload {#preload}
Hint navigateur (`<link rel="preload">`) qui force le téléchargement prioritaire d'une ressource nécessaire pour la page courante. Priorité haute, utilisé pour les ressources critiques (fonts, hero images).

### private {#private}
Directive Cache-Control indiquant que la réponse est destinée à un seul utilisateur et ne doit pas être cachée par les caches partagés (CDN, proxy). Seul le cache navigateur peut la stocker.

### Proxy-Revalidate {#proxy-revalidate}
Comme `must-revalidate`, mais s'applique uniquement aux caches partagés (CDN, proxy). Le cache navigateur peut servir du contenu stale, mais le proxy doit revalider.

### public {#public}
Directive Cache-Control indiquant que la réponse peut être cachée par n'importe quel cache (navigateur, CDN, proxy). Nécessaire si la réponse à un status code normalement non-cacheable ou si l'on veut s'assurer que le CDN cache la ressource.

### Purge {#purge}
Action d'invalider/supprimer du contenu dans un cache CDN. Peut se faire par URL exacte, par tag (surrogate key), ou globalement. Le soft purge marque le contenu comme stale sans le supprimer.

## Q

### QUIC {#quic}
Protocole de transport développé par Google, basé sur UDP, utilisé par HTTP/3. Fournit le multiplexing sans head-of-line blocking, le chiffrement intégré (TLS 1.3), et le 0-RTT connection establishment.

## R

### ReadableStream {#readablestream}
Interface Web Streams API représentant une source de données lisible chunk par chunk. Utilisée en streaming SSR, fetch streaming, et pour le traitement progressif de données volumineuses.

### Revalidation {#revalidation}
Processus par lequel un cache vérifie auprès du serveur d'origine si une réponse stale est encore valide. Utilise des requêtes conditionnelles (ETag/If-None-Match ou Last-Modified/If-Modified-Since).

### Reverse Proxy {#reverse-proxy}
Serveur intermédiaire qui se place devant le serveur d'origine, interceptant les requêtes des clients. Peut cacher les réponses, distribuer la charge, et ajouter des fonctionnalités (compression, SSL). Ex: Nginx, Varnish.

### RSC (React Server Components) {#rsc}
Composants React qui s'exécutent exclusivement sur le serveur. Ils n'envoient pas de JavaScript au client, permettant un rendu serveur sans coût d'hydration pour les parties non-interactives de l'interface.

## S

### s-maxage {#s-maxage}
Directive Cache-Control qui surcharge `max-age` uniquement pour les caches partagés (CDN, proxy). Permet de définir un TTL différent pour le CDN et pour le navigateur. Ex: `max-age=60, s-maxage=3600`.

### Server Push {#server-push}
Fonctionnalité HTTP/2 permettant au serveur d'envoyer des ressources au client avant que celui-ci ne les demandé. Peu utilisée en pratique car difficile à optimiser et souvent contre-productive.

### Service Worker {#service-worker}
Script JavaScript qui s'exécute en arrière-plan dans le navigateur, interceptant les requêtes réseau. Permet d'implémenter des stratégies de cache avancées (Cache-First, Network-First, SWR) et le fonctionnement offline.

### Soft Purge {#soft-purge}
Technique de purge CDN qui marque le contenu comme stale au lieu de le supprimer. Le contenu stale peut encore être servi pendant que le CDN récupère la nouvelle version, évitant un cache miss complet.

### SSE (Server-Sent Events) {#sse}
Protocole unidirectionnel (serveur → client) basé sur HTTP permettant au serveur d'envoyer un flux d'événements au navigateur. Plus simple que WebSocket pour les cas unidirectionnels. Utilise `text/event-stream`.

### SSG (Static Site Génération) {#ssg}
Pattern de rendering ou les pages HTML sont générées au moment du build et servies comme fichiers statiques. Performances optimales (TTFB minimal) mais contenu figé jusqu'au prochain build.

### SSR (Server-Side Rendering) {#ssr}
Pattern de rendering ou le HTML est généré sur le serveur à chaque requête. Avantages : SEO, TTFB prévisible, contenu toujours frais. Inconvénients : charge serveur, hydration côté client nécessaire.

### SSR Token {#ssr-token}
Marqueur dans le HTML rendu par le serveur qui transporte l'état initial de l'application vers le client. Typiquement `window.__INITIAL_STATE__ = {...}`. Évite au client de re-fetcher les données déjà récupérées par le serveur.

### Stale {#stale}
État d'une réponse cachée dont le TTL a expiré. La réponse est encore dans le cache mais nécessite une revalidation avant d'être servie (sauf si `stale-while-revalidate` ou `stale-if-error` sont configurés).

### stale-if-error {#stale-if-error}
Directive Cache-Control permettant de servir une réponse stale si le serveur d'origine retourne une erreur (5xx) ou est injoignable. Assure la disponibilité même quand l'origin est down.

### stale-while-revalidate {#stale-while-revalidate}
Directive Cache-Control qui permet de servir une réponse stale immédiatement tout en déclenchant une revalidation en arrière-plan. L'utilisateur actuel obtient la réponse stale rapide, le suivant obtient la version fraîche.

### Streaming SSR {#streaming-ssr}
Technique SSR ou le HTML est envoyé au client au fur et à mesure qu'il est généré, plutôt que d'attendre le rendu complet. Réduit le TTFB et permet au navigateur de commencer le parsing plus tôt.

### Surrogate Key {#surrogate-key}
Tag associé à une réponse cachée dans un CDN, permettant de purger un groupe de ressources partageant le même tag. Ex: purger toutes les pages liées à un produit en une seule opération.

### Surrogate-Control {#surrogate-control}
En-tête HTTP non-standard (proposé par Fastly/Akamai) permettant de donner des instructions de cache spécifiques aux reverse proxies et CDN, distinctes des instructions Cache-Control pour les navigateurs.

## T

### TLS (Transport Layer Security) {#tls}
Protocole de chiffrement utilisé pour sécuriser les connexions HTTPS. TLS 1.3 réduit le handshake à un seul round-trip (vs deux pour TLS 1.2), améliorant le TTFB.

### Transfer-Encoding {#transfer-encoding}
En-tête HTTP indiquant le type d'encodage de transfert utilisé. `Transfer-Encoding: chunked` permet d'envoyer la réponse en morceaux successifs sans connaître la taille totale à l'avance — fondamental pour le streaming.

### TTFB (Time to First Byte) {#ttfb}
Métrique mesurant le temps entre la requête du client et la réception du premier octet de la réponse. Inclut le DNS, TCP, TLS et le temps de traitement serveur. Cible : < 800ms.

## V

### Vary {#vary}
En-tête HTTP de réponse indiquant quels en-têtes de requête ont influencé la réponse, permettant au cache de stocker des variantes. `Vary: Accept-Encoding` signifie qu'il existe potentiellement une version gzip et une version brotli de la même ressource.

## W

### Waterfall {#waterfall}
Diagramme montrant le timing de chargement séquentiel de toutes les ressources d'une page. Outil essentiel pour identifier les bottlenecks (DNS lent, connexion lente, ressource bloquante, etc.).

### Web Vitals {#web-vitals}
Initiative de Google définissant les métriques de qualité d'expérience utilisateur. Les Core Web Vitals (LCP, INP, CLS) sont utilisés comme facteur de ranking SEO.

### Write-Through Cache {#write-through}
Pattern de cache ou chaque écriture met à jour simultanément le cache et le storage persistant. Garantit la cohérence mais ajoute de la latence aux écritures. L'alternative est write-behind (écriture asynchrone au storage).
