# Screencast 02 — HTTP/2, HTTP/3 et multiplexing

## Informations
- **Durée estimée** : 13-15 min
- **Module** : `modules/02-http2-http3.md`
- **Lab associé** : `labs/lab-02-http2-comparison/`
- **Prérequis** : Screencast 01 (Anatomie request/response, status codes)

## Setup
- [ ] Serveur HTTP/1.1 et serveur HTTP/2 prêts dans `labs/lab-02-http2-comparison/`
- [ ] Chrome DevTools avec le protocole visible dans l'onglet Network (colonne "Protocol")
- [ ] Page de test avec de nombreuses petites ressources (images, CSS, JS)
- [ ] Outil `nghttp` ou `curl` compilé avec support HTTP/2 (`curl --http2`)

## Script

### [00:00-01:30] Introduction — Pourquoi HTTP/2 et HTTP/3 ?

> Salut ! Jusqu'ici, on a parlé de HTTP/1.1, la version historique du protocole. Mais depuis 2015, on a HTTP/2, et depuis quelques années, HTTP/3. Pourquoi ces nouvelles versions ? Qu'est-ce qu'elles changent pour le cache ? C'est ce qu'on va voir aujourd'hui.

**Action** : Afficher le slide "Evolution de HTTP : 1.1 -> 2 -> 3".

> Le problème principal de HTTP/1.1, c'est la performance. Quand votre navigateur a besoin de charger 50 ressources — images, scripts, styles — il doit les demander une par une sur chaque connexion. Il y a des contournements, comme ouvrir plusieurs connexions en parallèle, mais c'est limité à 6 connexions par domaine.

### [01:30-05:00] HTTP/2 — Le multiplexing en action

> HTTP/2, c'est la révolution. La fonctionnalité phare : le multiplexing. Sur une seule connexion TCP, on peut envoyer et recevoir plusieurs requêtes et réponses en parallèle. Plus besoin d'attendre que la première se termine pour lancer la deuxième.

**Action** : Lancer le serveur HTTP/1.1 du lab.

```bash
cd labs/lab-02-http2-comparison
node server-h1.js
```

**Action** : Ouvrir Chrome, naviguer vers la page de test HTTP/1.1 avec DevTools ouverts.

> Regardez le waterfall dans les DevTools. Vous voyez comment les requêtes sont en escalier ? Les premières se lancent, les suivantes attendent. C'est le head-of-line blocking de HTTP/1.1. Le navigateur ouvre 6 connexions maximum et doit attendre qu'une se libère.

**Action** : Activer la colonne "Protocol" dans DevTools Network (clic droit sur les en-têtes de colonne).

> Toutes ces requêtes affichent "http/1.1" dans la colonne Protocol. Maintenant, passons à HTTP/2.

**Action** : Arrêter le serveur H1 et lancer le serveur H2.

```bash
node server-h2.js
```

**Action** : Naviguer vers la même page de test mais en HTTP/2, observer le waterfall.

> Et là, regardez la différence ! Le waterfall est complètement différent. Toutes les requêtes partent quasiment en même temps sur une seule connexion. C'est le multiplexing en action. On voit "h2" dans la colonne Protocol.

> Le gain de performance est significatif, surtout pour les pages avec beaucoup de petites ressources. Et ce qui est important pour nous : HTTP/2 ne change pas la sémantique des en-têtes de cache. Cache-Control, ETag, tout fonctionne exactement pareil. C'est le transport qui change, pas le protocole applicatif.

### [05:00-08:00] Les autres apports de HTTP/2

> Le multiplexing, c'est la star, mais HTTP/2 apporte d'autres améliorations.

**Action** : Afficher un slide comparatif HTTP/1.1 vs HTTP/2.

> Premièrement, la compression des en-têtes avec HPACK. En HTTP/1.1, les en-têtes sont envoyés en texte brut à chaque requête. Si vous avez 50 requêtes avec les mêmes cookies, c'est 50 fois la même donnée envoyée. HTTP/2 compresse tout ça intelligemment.

```bash
# Observer les en-têtes avec curl en HTTP/2
curl --http2 -v https://localhost:3001/
```

> Deuxièmement, le Server Push. Le serveur peut envoyer des ressources au client avant même que le client ne les demandé. Par exemple, quand le client demandé index.html, le serveur sait qu'il aura besoin de style.css et le pousse directement. En pratique, le Server Push est peu utilisé et même en cours de dépréciation dans certains navigateurs. Les techniques de prefetch et preload sont souvent préférées.

> Troisièmement, la priorisation des flux. Le navigateur peut indiquer au serveur quelles ressources sont les plus importantes. Le CSS critique avant les images de fond, par exemple.

**Action** : Montrer dans les DevTools la différence de taille des en-têtes entre H1 et H2.

> Ce qu'il faut retenir : HTTP/2 améliore le transport mais ne change rien aux en-têtes de cache. Vos directives Cache-Control fonctionnent identiquement.

### [08:00-11:00] HTTP/3 — QUIC et UDP

> Et maintenant, HTTP/3. Si HTTP/2 réglait le multiplexing au niveau HTTP, il restait un problème au niveau TCP. Si un seul paquet est perdu, TCP bloque toute la connexion en attendant la retransmission. C'est le head-of-line blocking au niveau transport.

**Action** : Afficher un schéma comparant la pile TCP+TLS vs QUIC.

> HTTP/3 résout ça en abandonnant TCP au profit de QUIC, un protocole basé sur UDP. QUIC intègre TLS 1.3 directement, ce qui signifie que la connexion est établie plus rapidement — un seul aller-retour au lieu de trois.

> Avec QUIC, si un flux perd un paquet, seul ce flux est bloqué. Les autres continuent normalement. C'est du vrai multiplexing sans compromis.

**Action** : Ouvrir un site qui supporte HTTP/3 (par exemple google.com) et montrer "h3" dans la colonne Protocol.

> Regardez, Google utilise déjà HTTP/3. On voit "h3" dans la colonne Protocol des DevTools. Et si je regarde les en-têtes, les directives de cache sont les mêmes. `Cache-Control`, `ETag`, `Last-Modified` — tout est identique.

```bash
# Vérifier le support HTTP/3 d'un site
curl --http3 -I https://www.google.com/ 2>&1 | head -20
```

> En résumé, HTTP/3 c'est : connexion plus rapide, pas de head-of-line blocking au niveau transport, et une meilleure résilience au changement de réseau (par exemple quand vous passez du Wi-Fi à la 4G).

### [11:00-12:30] Impact sur le cache — Ce qui change et ce qui ne change pas

> Alors concrètement, qu'est-ce que HTTP/2 et HTTP/3 changent pour le cache ?

**Action** : Afficher un tableau récapitulatif.

> La réponse courte : presque rien au niveau des en-têtes. Cache-Control fonctionne pareil, les ETags fonctionnent pareil, les requêtes conditionnelles fonctionnent pareil. Ce qui change, c'est la performance du réseau sous-jacent, et ça à un impact indirect sur vos stratégies de cache.

> Par exemple, en HTTP/1.1, on avait l'habitude de concaténer tous les fichiers CSS en un seul gros fichier pour minimiser le nombre de requêtes. Avec HTTP/2, c'est moins nécessaire grâce au multiplexing. On peut servir plein de petits fichiers sans pénalité. Et ça change la granularité du cache : si un seul composant CSS change, on n'invalide que ce fichier au lieu de tout le bundle.

> C'est un point important pour l'architecture de cache moderne. On y reviendra quand on parlera de stratégies multi-couches.

### [12:30-14:30] Récap — L'essentiel à retenir

> Résumons. HTTP/2 apporte le multiplexing, la compression des en-têtes et la priorisation. HTTP/3 apporte QUIC sur UDP pour éliminer le head-of-line blocking au niveau transport. Pour le cache, les en-têtes restent identiques, mais l'architecture de vos ressources peut évoluer grâce au multiplexing.

**Action** : Mentionner le quiz et le lab associé.

> Filez faire le lab `labs/lab-02-http2-comparison/`. Vous allez comparer les performances HTTP/1.1 et HTTP/2 sur une même page avec beaucoup de ressources. C'est très visuel et très parlant. Et le quiz vous attend aussi ! Dans le prochain screencast, on entre dans le vif du sujet : les en-têtes HTTP en détail. A bientôt !

## Points d'attention pour l'enregistrement
- S'assurer que les certificats TLS auto-signés sont bien configurés pour le serveur HTTP/2
- Le waterfall dans les DevTools doit être bien visible, agrandir la fenêtre si nécessaire
- `curl --http2` et `curl --http3` nécessitent des versions récentes de curl, vérifier la compatibilité
- Bien insister sur le fait que la sémantique de cache est identique entre les versions HTTP
