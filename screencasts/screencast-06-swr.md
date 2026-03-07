# Screencast 06 — Stale-While-Revalidate : pattern et stratégies de cache

## Informations
- **Durée estimée** : 13-15 min
- **Module** : `modules/06-stale-while-revalidate.md`
- **Lab associé** : `labs/lab-06-swr-demo/`
- **Prérequis** : Screencast 04 (Cache-Control), Screencast 05 (ETag)

## Setup
- [ ] Serveur Express du lab prêt : `labs/lab-06-swr-demo/exercise.js`
- [ ] Chrome DevTools ouverts sur l'onglet Network
- [ ] Terminal avec curl pour les tests
- [ ] Un endpoint API qui renvoie l'heure actuelle pour visualiser la fraîcheur des données

## Script

### [00:00-01:30] Introduction — Le dilemme fraîcheur vs performance

> Salut ! Jusqu'ici, on a vu deux extrêmes : soit on sert du cache instantanément avec max-age, soit on revalide systématiquement avec no-cache. Mais dans la vraie vie, on veut souvent un entre-deux. Des données raisonnablement fraîches, servies rapidement. C'est exactement ce que propose stale-while-revalidate.

**Action** : Afficher le slide "Module 06 — Stale-While-Revalidate".

> Stale-while-revalidate, ou SWR, c'est un pattern qui dit : "sers la réponse en cache immédiatement, même si elle est un peu périmée, et en arrière-plan, revalide pour la prochaine fois". Le meilleur des deux mondes : vitesse ET fraîcheur.

### [01:30-04:30] La directive HTTP stale-while-revalidate

> Commençons par la directive HTTP native. Elle fait partie de Cache-Control.

**Action** : Lancer le serveur du lab.

```bash
cd labs/lab-06-swr-demo
node exercise.js
```

```bash
curl -I http://localhost:3000/api/news
# Cache-Control: public, max-age=10, stale-while-revalidate=30
```

> Décortiquons ça. `max-age=10` : la réponse est fraîche pendant 10 secondes. Pendant cette période, le cache la sert directement, sans aucune requête réseau. `stale-while-revalidate=30` : après les 10 secondes, la réponse est périmée (stale), mais pendant 30 secondes supplémentaires, le cache peut quand même la servir tout en lançant une revalidation en arrière-plan.

**Action** : Afficher un diagramme temporel montrant les trois phases.

> On a donc trois phases. Phase 1, de 0 à 10 secondes : cache frais, servi instantanément. Phase 2, de 10 à 40 secondes : cache périmé mais encore utilisable. Le navigateur sert le contenu périmé et revalide en background. Phase 3, après 40 secondes : le cache est vraiment trop vieux, le navigateur doit attendre la réponse du serveur.

### [04:30-07:30] Démo en temps réel — Observer le SWR dans les DevTools

> Voyons ça en pratique. J'ai un endpoint qui renvoie l'heure et un compteur, comme ça on peut voir quand les données changent.

**Action** : Ouvrir Chrome et naviguer vers la page de démo SWR.

> Première visite : je vois l'heure actuelle, disons 14:30:00. Le cache est frais. Si je rafraîchis dans les 10 secondes, l'heure ne change pas. C'est le cache frais qui est servi.

**Action** : Rafraîchir la page plusieurs fois pendant les 10 premières secondes.

> Toujours 14:30:00. Normal, c'est le cache. Maintenant, attendons 15 secondes...

**Action** : Attendre que le max-age expire, puis rafraîchir.

> Je rafraîchis. Et je vois... toujours 14:30:00 ! Mais attention, regardez le Network panel. Une requête a été envoyée en arrière-plan. Le navigateur m'a servi le contenu périmé instantanément, et en même temps, il a demandé au serveur une version fraîche.

> Maintenant, si je rafraîchis encore une fois...

**Action** : Rafraîchir une deuxième fois.

> Et là, 14:30:15 ! La nouvelle version récupérée en background est maintenant dans le cache. L'utilisateur a toujours eu une réponse instantanée, mais les données se sont mises à jour entre les deux requêtes. C'est ça la magie du SWR.

### [07:30-10:00] Comparaison des stratégies de cache

> Comparons les différentes stratégies pour bien comprendre les trade-offs.

**Action** : Afficher un tableau comparatif des stratégies.

> Stratégie 1 : `max-age=3600`. La réponse est servie instantanément pendant 1 heure. Avantage : performance maximale. Inconvénient : les données peuvent être périmées d'1 heure. Cas d'usage : ressources statiques, assets CSS/JS.

> Stratégie 2 : `no-cache`. Chaque requête est revalidée auprès du serveur. Avantage : données toujours à jour. Inconvénient : temps de latence à chaque requête (même si c'est juste un 304). Cas d'usage : pages HTML, APIs critiques.

> Stratégie 3 : `max-age=10, stale-while-revalidate=50`. Compromis entre fraîcheur et performance. Avantage : réponse toujours instantanée, données relativement fraîches. Inconvénient : l'utilisateur peut voir des données périmées de quelques secondes. Cas d'usage : fil d'actualités, liste de produits, dashboards.

```bash
# Stratégie 1 : Cache long
curl -I http://localhost:3000/api/static-config
# Cache-Control: public, max-age=3600

# Stratégie 2 : Revalidation systématique
curl -I http://localhost:3000/api/user-profile
# Cache-Control: no-cache

# Stratégie 3 : SWR
curl -I http://localhost:3000/api/news
# Cache-Control: public, max-age=10, stale-while-revalidate=30
```

**Action** : Montrer dans les DevTools le comportement de chaque stratégie.

> Le choix dépend de votre cas d'usage. La question à se poser : "est-ce grave si l'utilisateur voit des données vieilles de X secondes ?" Si la réponse est non, SWR est probablement le bon choix.

### [10:00-12:00] stale-if-error — La résilience

> Il y a une directive complémentaire à connaître : `stale-if-error`.

```bash
curl -I http://localhost:3000/api/resilient
# Cache-Control: public, max-age=60, stale-while-revalidate=300, stale-if-error=86400
```

> `stale-if-error=86400` signifie : si la revalidation échoue (serveur down, timeout, erreur 500), le cache peut servir la version périmée pendant 24 heures. C'est une assurance contre les pannes serveur.

**Action** : Simuler une panne du serveur.

```bash
# Arrêter le serveur et observer le comportement
# Le navigateur sert le cache stale au lieu d'afficher une erreur
```

> Imaginez : votre API est down, mais vos utilisateurs voient quand même du contenu — un peu vieux, certes, mais c'est mieux qu'une page d'erreur. Pour un e-commerce, la différence entre des prix de ce matin et une page blanche, c'est énorme.

> Combiné avec SWR, ça donne une stratégie très robuste. En fonctionnement normal, les données sont fraîches à quelques secondes près. En cas de panne, les utilisateurs ont toujours quelque chose à voir.

### [12:00-13:30] SWR côté application — React et bibliothèques

> Un petit aparté sur le SWR côté applicatif. Le pattern SWR a aussi été popularisé par des bibliothèques comme SWR de Vercel ou React Query/TanStack Query.

**Action** : Montrer un code React rapide utilisant le pattern SWR.

> Ces bibliothèques implémentent le même pattern au niveau de l'application : elles servent les données en cache immédiatement et revalidate en background. C'est complémentaire au SWR HTTP. Le SWR HTTP gère le cache entre le navigateur et le serveur. Le SWR applicatif gère le cache entre le composant React et le fetch.

> L'idéal, c'est de combiner les deux. Mais attention à ne pas dupliquer la logique de cache. Si votre bibliothèque gère déjà le SWR, vous n'avez peut-être pas besoin de `stale-while-revalidate` au niveau HTTP.

### [13:30-14:30] Récap — SWR, le pattern pragmatique

> Résumons. `stale-while-revalidate` permet de servir du contenu périmé instantanément tout en revalidant en arrière-plan. Les trois phases : frais, périmé-mais-utilisable, expiré. `stale-if-error` ajoute la résilience en cas de panne. Et le pattern SWR existe aussi au niveau applicatif avec des bibliothèques dédiées.

**Action** : Mentionner le quiz et le lab.

> Le lab `labs/lab-06-swr-demo/` vous fait mettre en place SWR sur différents endpoints et observer le comportement dans les DevTools. Vous allez aussi simuler des pannes pour tester stale-if-error. Prochain screencast : le cache navigateur en profondeur. A bientôt !

## Points d'attention pour l'enregistrement
- Utiliser des max-age courts (5-10s) pour que la démo soit visible en temps réel
- Bien montrer le diagramme des trois phases temporelles
- La démo de panne serveur (stale-if-error) nécessite d'arrêter le serveur au bon moment
- Vérifier que le navigateur supporte bien stale-while-revalidate (Chrome/Edge OK, Firefox OK depuis v68)
