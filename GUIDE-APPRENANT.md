# Guide de l'apprenant -- HTTP & Caching

> **Ce guide est ta boussole.** Il t'aide a savoir ou tu en es, par ou passer,
> et quoi faire quand tu bloques. Lis-le avant de commencer, et reviens-y regulierement.
>
> **Temps estime** : ~90-130h (3-4 mois a 8-10h/semaine)
>
> **Philosophie** : HTTP est le langage du web. Le caching est l'art de ne pas repeter
> ce qui a deja ete dit. Maitriser les deux, c'est transformer une application lente
> en une application instantanee -- sans toucher au code applicatif.

---

## Avant de commencer -- Auto-diagnostic

Reponds honnetement. Ce n'est pas un examen -- c'est un GPS.

### Bases web

Coche ce que tu sais faire SANS chercher sur Google :
- [ ] Expliquer ce qu'est un header HTTP et en citer 3
- [ ] Decrire la difference entre GET et POST
- [ ] Expliquer ce qu'est un code de statut (200, 404, 500)
- [ ] Utiliser `fetch` en JavaScript pour faire un appel API
- [ ] Ouvrir l'onglet Network des DevTools et lire une requete
- [ ] Expliquer ce qu'est HTTPS (meme vaguement)

**6/6** -> Tu es pret. Attaque directement le module 00.
**4-5/6** -> Revise les bases HTTP (~2h), puis lance-toi.
**< 4/6** -> Fais d'abord un tutoriel HTTP basique. Ce cours suppose que tu sais ce qu'est une requete.

### HTTP & Cache -- ou en es-tu deja ?

- [ ] Tu sais ce qu'est `Cache-Control` et ses directives principales
- [ ] Tu sais ce qu'est un ETag et a quoi il sert
- [ ] Tu sais la difference entre HTTP/1.1 et HTTP/2
- [ ] Tu as deja configure un CDN (Cloudflare, Vercel, Netlify...)
- [ ] Tu sais ce qu'est le SSR (Server-Side Rendering)

**5/5** -> Tu peux probablement sauter a la Phase 3 (module 07). Fais le checkpoint Phase 2 d'abord.
**2-4/5** -> Commence par la Phase 1, tu as des bases a consolider.
**0-1/5** -> C'est normal. Peu de devs maitrisent vraiment HTTP. C'est tout l'interet de ce cours.

### Le test decisif

Un utilisateur te dit "le site est lent". Tu ouvres l'onglet Network.
Que regardes-tu en premier ?

- Si tu penses a : nombre de requetes, taille des reponses, cache hits/miss, waterfall, TTFB -> tu as de bons reflexes. Verifie la Phase 2.
- Si tu regardes juste "est-ce que ca repond ?" -> la Phase 1 va t'apprendre a lire le reseau.
- Si tu ne sais pas par ou commencer -> parfait, c'est exactement ce que ce cours enseigne.

---

## Les 4 phases de ta progression

### Phase 1 -- HTTP basics (modules 00-03) ~20-25h

> **Objectif** : Maitriser le protocole HTTP, comprendre HTTP/2 et HTTP/3,
> et savoir lire et manipuler les en-tetes.
>
> **Analogie** : C'est comme apprendre la grammaire d'une langue. Avant de cacher, il faut comprendre ce qu'on transporte.

| Module | Sujet | Temps | Note |
|---|---|---|---|
| 00 | Prerequis et vue d'ensemble | 1h30 | La carte du territoire |
| 01 | Protocole HTTP | 3h | **Cours cle** -- methodes, headers, status codes |
| 02 | HTTP/2 et HTTP/3 | 3h | Multiplexing, server push, QUIC |
| 03 | En-tetes HTTP | 3h | **Cours cle** -- les headers sont le langage du cache |

**Exercices Phase 1** : Utilise `curl -v` et l'onglet Network des DevTools
pour observer les headers en temps reel. Ne te contente pas de lire.

**Checkpoint Phase 1** :
- [ ] Tu sais lire une requete/reponse HTTP complete (methode, headers, body)
- [ ] Tu sais expliquer la difference entre HTTP/1.1, HTTP/2 et HTTP/3
- [ ] Tu sais ce que font `Content-Type`, `Authorization`, `Accept`, `Content-Length`
- [ ] Tu sais utiliser `curl` pour envoyer une requete avec des headers custom
- [ ] Tu peux expliquer pourquoi HTTP/2 est plus rapide (multiplexing, compression des headers)

> **Test** : Un collegue te montre un `fetch` qui ne fonctionne pas.
> Si ton premier reflexe est de regarder les headers de la reponse dans les DevTools, c'est bon.

---

### Phase 2 -- Cache (modules 04-06) ~20-30h

> **Objectif** : Maitriser `Cache-Control`, les ETags, la validation conditionnelle,
> et les strategies de cache modernes comme `stale-while-revalidate`.
>
> **Analogie** : Tu sais lire la langue HTTP. Maintenant tu apprends a ne pas repeter les memes phrases.

| Module | Sujet | Temps | Note |
|---|---|---|---|
| 04 | Cache-Control | 4h | **Cours cle** -- `max-age`, `no-cache`, `no-store`, `private`, `public` |
| 05 | ETag et validation conditionnelle | 3h | **Cours cle** -- `If-None-Match`, `304 Not Modified` |
| 06 | Stale-while-revalidate | 3h | La strategie qui change tout pour l'UX |

**Conseil** : Le module 04 (Cache-Control) est dense. Les directives sont nombreuses
et se combinent de facon subtile. Fais un tableau recapitulatif sur papier.

**Checkpoint Phase 2** :
- [ ] Tu sais expliquer chaque directive de `Cache-Control` avec un cas d'usage concret
- [ ] Tu sais la difference entre `no-cache` et `no-store` (piege classique !)
- [ ] Tu sais comment fonctionne la validation conditionnelle (ETag + `If-None-Match`)
- [ ] Tu sais ce que fait `stale-while-revalidate` et pourquoi c'est puissant
- [ ] Tu peux concevoir une strategie de cache pour un site avec des pages statiques et dynamiques

> **Test** : Quelle est la difference entre `no-cache` et `no-store` ?
> Si tu reponds : "`no-cache` stocke mais revalide toujours, `no-store` ne stocke jamais", c'est bon.

---

### Phase 3 -- Architecture cache (modules 07-09) ~25-30h

> **Objectif** : Comprendre le cache navigateur, les CDN, et les strategies
> de cache multi-couches. Tu passes de la theorie a l'architecture.
>
> **Analogie** : Tu ne caches plus une requete -- tu concois un systeme de cache complet.

| Module | Sujet | Temps | Note |
|---|---|---|---|
| 07 | Cache navigateur | 3h | Service workers, Cache API, strategies offline |
| 08 | CDN | 4h | **Cours cle** -- edge caching, invalidation, TTL |
| 09 | Cache multi-couches | 3h | Navigateur -> CDN -> reverse proxy -> application |

**Attention** : Le CDN (module 08) est souvent mal compris. L'invalidation de cache
est le probleme le plus difficile en informatique (avec le nommage).
Prends ton temps sur ce module.

**Checkpoint Phase 3** :
- [ ] Tu sais utiliser la Cache API et un Service Worker pour du cache offline
- [ ] Tu sais configurer un CDN avec les bons headers de cache
- [ ] Tu sais expliquer le probleme de l'invalidation de cache et les strategies pour le gerer
- [ ] Tu sais dessiner une architecture cache multi-couches et expliquer chaque niveau
- [ ] Tu sais quand utiliser `cache-busting` (hash dans le nom de fichier)

> **Test** : Tu deploies une nouvelle version de ton app. Les utilisateurs voient l'ancienne.
> Si tu penses a : cache navigateur, cache CDN, noms de fichiers hashes, `Cache-Control` des index.html -- c'est bon.

---

### Phase 4 -- Expert SSR & Performance (modules 10-15) ~30-40h

> **Objectif** : SSR, ISR, SSG, Edge rendering, HTTP streaming, et performance web.
> Tu maitrises l'ensemble de la chaine de rendu et de cache.
>
> **Analogie** : Tu ne caches plus -- tu architectures le rendu complet d'une application.

| Module | Sujet | Temps | Note |
|---|---|---|---|
| 10 | SSR (Server-Side Rendering) | 3h | Pourquoi, comment, et quand |
| 11 | ISR et SSG | 3h | **Cours cle** -- le meilleur des deux mondes |
| 12 | Edge rendering | 3h | Render au plus pres de l'utilisateur |
| 13 | HTTP streaming | 3h | Reponses progressives, chunked transfer |
| 14 | Performance web | 4h | Core Web Vitals, Lighthouse, budgets de performance |
| 15 | Projet final | 8h+ | Architecture cache complete pour une application reelle |

**Checkpoint Phase 4** :
- [ ] Tu sais expliquer SSR vs SSG vs ISR et choisir selon le cas
- [ ] Tu sais ce qu'est le edge rendering et quand l'utiliser
- [ ] Tu sais utiliser HTTP streaming pour ameliorer le TTFB percu
- [ ] Tu sais mesurer les Core Web Vitals et les ameliorer
- [ ] Tu as termine le projet final avec une strategie de cache documentee

> **Test** : Un site e-commerce a des pages produits (10 000) et une page d'accueil dynamique.
> Si tu proposes "ISR pour les produits, SSR pour l'accueil, CDN devant, stale-while-revalidate" -- tu es expert.

---

## Quand tu bloques

HTTP et le caching ont leurs pieges specifiques. Voici comment debloquer :

### "Les directives Cache-Control se melangent dans ma tete"
1. Fais un tableau a 2 colonnes : "Directive" | "Ce que ca fait en une phrase"
2. Retiens le trio de base : `no-store` (jamais cacher), `no-cache` (toujours verifier), `max-age=X` (cache X secondes)
3. Teste avec `curl -I` pour voir les headers de cache d'un vrai site

### "Je ne vois pas la difference entre cache navigateur, CDN et reverse proxy"
1. Dessine la chaine : Navigateur -> CDN -> Reverse Proxy -> Serveur
2. Chaque niveau a son propre cache avec ses propres regles
3. Une requete traverse les couches de gauche a droite, la premiere qui a la reponse en cache la renvoie

### "Mon cache ne fonctionne pas"
1. Ouvre l'onglet Network des DevTools, colonne "Size" : `(from disk cache)` ou `(from memory cache)` = ca marche
2. Verifie les headers `Cache-Control` de la reponse (pas de la requete)
3. Attention : le mode "Disable cache" des DevTools est peut-etre active (checkbox en haut)
4. Verifie que tu n'as pas `no-store` ou `private` quand tu ne le veux pas

### "SSR/SSG/ISR, je m'y perds"
1. SSG = genere au build, statique, ultra-rapide, mais pas frais
2. SSR = genere a chaque requete, toujours frais, mais plus lent
3. ISR = genere au build MAIS se regenere en arriere-plan apres un delai -- le meilleur compromis
4. Choisis selon la frequence de mise a jour des donnees

### "Le CDN me renvoie une vieille version"
1. Verifie le `Cache-Control` envoye par ton serveur -- le CDN le respecte
2. Utilise le purge/invalidation du CDN (chaque provider a son outil)
3. Mieux : utilise du cache-busting (hash dans le nom de fichier) pour les assets statiques
4. Pour les pages HTML : `Cache-Control: no-cache` force la revalidation

### "Je n'arrive pas a faire l'exercice"
1. Utilise `curl -v` pour voir exactement les headers envoyes et recus
2. L'onglet Network des DevTools est ton meilleur ami dans ce cours
3. Relis le cours -- les strategies de cache sont toujours dans les exemples

---

## Auto-evaluation par phase

Apres chaque phase, pose-toi ces questions. Si tu ne sais pas repondre,
reviens en arriere -- c'est un signe, pas un echec.

**Apres Phase 1** : "Pourquoi HTTP/2 n'a plus besoin de sprites CSS ou de domain sharding ?"
-> Si tu reponds "parce que le multiplexing envoie toutes les requetes en parallele sur une seule connexion", c'est bon.

**Apres Phase 2** : "Un fichier CSS change rarement. Quel `Cache-Control` lui donnes-tu ?"
-> Si tu reponds "`max-age=31536000, immutable` avec un hash dans le nom de fichier", c'est bon.

**Apres Phase 3** : "Comment invalider le cache CDN quand tu deploies ?"
-> Si tu parles de cache-busting pour les assets et de `no-cache` ou TTL court pour le HTML, c'est bon.

**Apres Phase 4** : "Un site a un LCP de 4 secondes. Par ou commences-tu ?"
-> Si tu analyses le waterfall, cherches les requetes bloquantes, verifies le cache,
et proposes SSR ou preload selon le cas -- c'est bon.

---

## Rythme recommande

| Rythme | Par semaine | Duree totale |
|---|---|---|
| **Decouverte** (a cote du boulot) | 4-6h | 4-5 mois |
| **Regulier** (motivation) | 8-10h | 3-4 mois |
| **Intensif** (objectif pro) | 12-15h | 2-3 mois |

### Conseils concrets

- **1 module = 1 a 2 sessions.** Les modules cache (04-06) meritent 2 sessions chacun.
- **Teste en vrai.** Apres chaque module, ouvre les DevTools et inspecte les headers de tes sites preferes.
- **Cache-Control (04) merite une semaine.** C'est la fondation de tout le reste.
- **Le projet final (15) vaut 2 semaines.** C'est la que tu architectures un vrai systeme de cache.
- **Fais un aide-memoire.** Les directives de cache s'oublient -- un tableau recapitulatif sur ton bureau aide.

### Quand faire une pause

- Si les directives se melangent -> fais ton tableau recapitulatif, dors, reviens demain
- Si "ca marche mais tu ne sais pas pourquoi" -> c'est un red flag, relis le cours
- Si le CDN te rend fou -> c'est normal, l'invalidation de cache est le probleme le plus dur du web

---

## Ressources complementaires

### Quand tu veux approfondir
- [MDN -- HTTP](https://developer.mozilla.org/fr/docs/Web/HTTP) -- la reference
- [web.dev -- Performance](https://web.dev/performance/) -- guides de performance de Google
- [Cache-Control for Civilians](https://csswizardry.com/2019/03/cache-control-for-civilians/) -- excellent article
- *High Performance Browser Networking* (Ilya Grigorik) -- gratuit en ligne, une reference

### Quand tu cherches une reponse rapide
- `curl -I url` -- voir les headers de reponse d'un site
- DevTools > Network > colonne Size -- voir si la reponse vient du cache
- DevTools > Application > Cache Storage -- voir le contenu du cache du Service Worker

---

## Et apres ?

Tu as fini les 16 modules ? Tu maitrises HTTP et le caching mieux que 90% des devs web.

Voici les prochaines etapes :
1. **Audite un vrai site** -- mesure les Core Web Vitals et optimise le cache
2. **Explore Next.js (cours React 08)** -- SSR, ISR, et cache prennent tout leur sens
3. **Configure un CDN pour un projet** -- Cloudflare, Vercel, ou AWS CloudFront
4. **Combine avec l'observabilite (cours 12)** -- mesure l'impact du cache en production
