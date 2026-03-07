# Screencast 00 — Introduction HTTP, modèle mental et DevTools

## Informations
- **Durée estimée** : 12-15 min
- **Module** : `modules/00-prerequis.md`
- **Lab associé** : Aucun lab dédié
- **Prérequis** : Connaissances de base en développement web (HTML, JavaScript)

## Setup
- [ ] Navigateur Chrome ou Firefox ouvert avec DevTools fermés
- [ ] Un site web simple en local (par exemple un serveur Node.js basique sur `localhost:3000`)
- [ ] Terminal prêt avec `curl` installé
- [ ] Slides d'introduction sur le modèle client-serveur

## Script

### [00:00-02:00] Introduction — Pourquoi comprendre HTTP ?

> Salut à tous ! Bienvenue dans cette formation sur le caching HTTP. Avant de plonger dans le cache, on va prendre un moment pour s'assurer qu'on a tous les mêmes bases sur le protocole HTTP. Parce que sans comprendre HTTP, impossible de comprendre comment le cache fonctionne.

**Action** : Afficher le slide d'introduction avec le titre de la formation.

> Vous utilisez HTTP tous les jours, chaque fois que vous ouvrez un navigateur, chaque fois qu'une app mobile communique avec un serveur. Mais est-ce que vous savez vraiment ce qui se passe sous le capot ? C'est exactement ce qu'on va voir ensemble.

**Action** : Afficher un schéma simple client-serveur.

> HTTP, c'est un protocole de communication. En gros, un client — souvent votre navigateur — envoie une requête à un serveur, et le serveur lui répond. C'est tout. C'est un échange de messages texte, rien de magique.

### [02:00-05:00] Le modèle mental — Comment penser HTTP

> Pour bien comprendre la suite de cette formation, on va se construire un modèle mental. Imaginez HTTP comme une conversation au restaurant : vous, le client, vous passez une commande au serveur. Le serveur va en cuisine, prépare votre plat, et vous le rapporte. Simple, non ?

**Action** : Dessiner ou afficher un schéma avec les étapes : Requête -> Traitement -> Réponse.

> Maintenant, la commande, c'est la requête HTTP. Elle contient plusieurs informations : quelle ressource vous voulez (l'URL), comment vous la voulez (les en-têtes), et parfois des données supplémentaires (le corps de la requête). La réponse, c'est le plat : elle contient un code de statut, des en-têtes de réponse, et le contenu demandé.

**Action** : Ouvrir le terminal et lancer le serveur local.

```bash
node server.js
```

> Là, j'ai lancé un petit serveur Node.js en local. Rien de compliqué, il sert juste quelques pages HTML et des fichiers statiques. On va s'en servir pour observer les échanges HTTP.

> Ce qui est important à retenir, c'est que chaque échange HTTP est indépendant. Le serveur ne se souvient pas de vous entre deux requêtes. C'est ce qu'on appelle un protocole "stateless". Et c'est justement pour ça que le cache va devenir si important : il permet de ne pas redemander au serveur ce qu'on a déjà.

### [05:00-09:00] DevTools — Votre meilleur ami pour débugger HTTP

> Maintenant, passons à la pratique. On va ouvrir les DevTools de Chrome. C'est l'outil indispensable pour comprendre ce qui se passe au niveau HTTP.

**Action** : Ouvrir Chrome, naviguer sur `http://localhost:3000`, puis ouvrir les DevTools avec F12.

> J'appuie sur F12 — ou clic droit, Inspecter — et je vais directement dans l'onglet Network. C'est ici que toute la magie opère.

**Action** : Cliquer sur l'onglet Network dans les DevTools.

> Pour le moment, c'est vide. Normal, les DevTools n'enregistrent les requêtes que quand ils sont ouverts. Je vais rafraîchir la page.

**Action** : Rafraîchir la page avec F5.

> Et là, on voit apparaître toutes les requêtes HTTP que le navigateur a envoyées. La page HTML, les fichiers CSS, les scripts JavaScript, les images... Chaque ligne, c'est un échange HTTP complet.

**Action** : Cliquer sur la requête principale (le document HTML) pour afficher les détails.

> Si je clique sur la première requête, je vois les détails. En haut : l'URL, la méthode (GET ici), le code de statut (200 OK). Ensuite, les en-têtes de la requête et les en-têtes de la réponse.

**Action** : Pointer les sections "Request Headers" et "Response Headers".

> Regardez les en-têtes de réponse. On voit déjà des choses intéressantes : `Content-Type`, `Content-Length`, et peut-être déjà un `Cache-Control`. C'est exactement ces en-têtes qu'on va manipuler tout au long de cette formation.

> Un petit truc utile : je peux faire un clic droit sur les colonnes et ajouter des informations supplémentaires. Par exemple, je vais ajouter la colonne "Size" et "Time" pour voir la taille des réponses et le temps de chargement.

**Action** : Personnaliser les colonnes du tableau Network en ajoutant Size et Time.

### [09:00-12:00] Anatomie d'une requête — Premier contact avec les en-têtes

> Maintenant qu'on sait utiliser les DevTools, regardons de plus près une requête. Je vais ouvrir le terminal et faire un `curl` vers notre serveur.

**Action** : Basculer sur le terminal.

```bash
curl -v http://localhost:3000/
```

> Avec l'option `-v` pour verbose, `curl` nous montre tout : la connexion TCP, la requête HTTP envoyée, et la réponse reçue. C'est plus brut que les DevTools, mais c'est très instructif.

> On voit la ligne de requête : `GET / HTTP/1.1`. Ensuite les en-têtes que `curl` envoie automatiquement : `Host`, `User-Agent`, `Accept`. Et après le séparateur, la réponse du serveur : `HTTP/1.1 200 OK`, suivie des en-têtes de réponse et du corps HTML.

**Action** : Surligner dans le terminal la ligne de requête et la ligne de statut.

> L'idée ici, c'est que HTTP c'est du texte. Ce sont des lignes de texte échangées entre le client et le serveur. Pas de binaire, pas de format propriétaire. Du texte lisible par un humain. Et c'est ce qui rend HTTP si accessible et si puissant.

```bash
curl -I http://localhost:3000/
```

> Avec `-I`, on ne récupère que les en-têtes. C'est super pratique quand on veut juste vérifier les en-têtes de cache sans télécharger tout le contenu.

### [12:00-14:00] Récap — Ce qu'on retient

> Bon, on a couvert pas mal de choses. Résumons.

**Action** : Afficher un slide récapitulatif.

> Premièrement, HTTP c'est un protocole texte de type requête-réponse. Deuxièmement, chaque échange est indépendant, HTTP est stateless. Troisièmement, les DevTools et curl sont vos meilleurs amis pour observer ce qui se passe. Et enfin, les en-têtes HTTP sont la clé de voûte du caching — c'est là que tout se joue.

**Action** : Mentionner le quiz du module 00.

> Dans le quiz associé à ce module, on va vérifier que ces bases sont bien en place. Et dès le prochain screencast, on plonge dans le protocole HTTP en détail : méthodes, codes de statut, anatomie complète d'une requête. A tout de suite !

## Points d'attention pour l'enregistrement
- S'assurer que le serveur Node.js local tourne avant de commencer la démo DevTools
- Agrandir la taille de la police dans le terminal et les DevTools pour la lisibilité
- Ne pas aller trop vite sur les DevTools, le public est potentiellement débutant
- Vérifier que les en-têtes de réponse du serveur local sont bien visibles (pas de compression gzip qui masquerait les choses)
