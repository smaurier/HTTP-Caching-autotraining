# Lab 02 — PWA de zéro : les trois stratégies de cache d'un Service Worker

> **Outcome :** à la fin, tu as implémenté et prouvé les trois stratégies de cache qu'un
> vrai handler `fetch` de Service Worker utilise : cache-first, network-first,
> stale-while-revalidate. Tu sais LAQUELLE choisir pour quel type de ressource (le shell de
> l'app vs les données qui changent).
> **Vrai outil :** la logique exacte que tu écrirais dans un vrai `sw.js` — extraite pour
> être testable sans navigateur.
> **Feedback :** `npm run lab:02` — RED tant que les trois stratégies ne satisfont pas
> l'oracle. `npm run solution:02` prouve l'oracle.

## Portée de ce lab (honnêteté)

`navigator.serviceWorker`, l'événement `fetch` d'un vrai Service Worker et la Cache API du
navigateur n'existent que dans un VRAI navigateur — `jsdom` ne les implémente pas, et un
Service Worker ne peut de toute façon pas s'exécuter dans un processus de test Node. Ce lab
prouve donc la LOGIQUE des trois stratégies (ce qui compte vraiment, et ce qui se réutilise
tel quel dans un vrai `sw.js`), avec un cache et un `fetch` fidèles à l'interface réelle mais
injectés — pas la partie "cycle de vie d'un Service Worker dans un navigateur" (`register`,
`install`, `activate`), qui reste théorique dans ce cours (module 15) faute d'environnement
de test adapté. Même décision honnête que pour Tamagui/WebAuthn plus tôt dans ce curriculum.

## Prérequis technique

`npm install` depuis `11-http-caching/labs`.

## Lire avant (une lecture bornée)

- Module [`15-pwa-service-workers.md`](../../modules/15-pwa-service-workers.md) — les trois
  stratégies, quand choisir laquelle (le shell de l'app en cache-first, les données très
  fraîches en network-first, un compromis en stale-while-revalidate).
- Module [`06-stale-while-revalidate.md`](../../modules/06-stale-while-revalidate.md) — le
  principe : servir immédiatement le périmé, rafraîchir en arrière-plan.

## Énoncé

Lis les commentaires en tête de `src/strategies.ts`. Implémente `cacheFirst`,
`networkFirst`, `staleWhileRevalidate`.

**Le piège à éviter.** Dans `staleWhileRevalidate`, `await`er le fetch de rafraîchissement
avant de retourner le résultat annule tout l'intérêt de la stratégie : l'utilisateur attend
alors le réseau exactement comme en network-first. Le fetch de fond doit être
FIRE-AND-FORGET (pas de `await` sur lui dans le chemin de retour), et ses erreurs ne doivent
JAMAIS remonter à l'appelant — un réseau capricieux en arrière-plan ne doit jamais casser
l'affichage du contenu déjà servi.

## Étapes (en friction)

1. `npm run lab:02` : RED partout.
2. Implémente `cacheFirst` en premier (le plus simple).
3. Implémente `networkFirst` (essai réseau, repli sur cache en cas d'échec).
4. Implémente `staleWhileRevalidate` en dernier — c'est celle où le piège du fetch
   fire-and-forget se joue.
5. Relance : les 9 tests doivent passer.

## Vérifier

```bash
cd 11-http-caching/labs
npm install
npm run lab:02
npm run solution:02
```

**Ce que l'oracle vérifie**

`cacheFirst` : sert le cache sans jamais appeler le réseau s'il y a une entrée ; va chercher
le réseau et remplit le cache sinon. `networkFirst` : sert et met à jour depuis le réseau
quand il répond ; bascule sur le cache s'il échoue ; relance l'erreur si aucun repli n'existe.
`staleWhileRevalidate` : sert le cache IMMÉDIATEMENT sans attendre un réseau volontairement
lent (preuve par une promesse contrôlée manuellement) ; rafraîchit le cache en arrière-plan
après coup ; une erreur du fetch de fond ne fait jamais échouer l'appel principal ; sans
cache, attend le réseau comme cache-first.

## Variante J+30 (fading)

Le shell de l'app (HTML/CSS/JS du bundle) et le endpoint `/families/:id/members` ont des
besoins de fraîcheur très différents. Laquelle des trois stratégies pour chacun, et
pourquoi ? Écris la règle dans un vrai `sw.js` (fichier hors oracle, pour toi).

## Application TribuZen

Même logique branchée dans le vrai `sw.js` de `tribuzen-admin` (PWA) : shell en
cache-first, dashboard famille en stale-while-revalidate, notifications en network-first
(jamais de données périmées sur une alerte). Commit :
`feat(pwa): trois stratégies de cache testées, prêtes pour le Service Worker réel`.
