# Lab 01 — Stratégie de cache de zéro : headers, ETag, mesuré avant/après

> **Outcome :** à la fin, tu as construit un endpoint avec une vraie stratégie de cache
> HTTP : `Cache-Control` (fraîcheur), `ETag` (revalidation), `If-None-Match` (requête
> conditionnelle) — et tu as PROUVÉ que le cache sert vraiment, pas juste que les en-têtes
> ont l'air corrects. La preuve : un compteur d'appels au calcul coûteux, qui ne doit PAS
> grimper quand le cache fait son travail.
> **Vrai outil :** `node:crypto` pour un ETag fort (hash du contenu), une horloge injectable
> pour tester l'expiration sans `sleep`. Le store ici est une `Map` en mémoire — en vrai il
> vivrait dans Redis et/ou un edge CDN, mais le CONTRAT HTTP (ce que ce lab teste) est
> identique quel que soit l'endroit où le store vit réellement.
> **Feedback :** `npm run lab:01` — RED tant que `handleGetFamilySummary` ne satisfait pas
> l'oracle. `npm run solution:01` prouve l'oracle.

## Prérequis technique

`npm install` depuis `11-http-caching/labs`.

## Lire avant (une lecture bornée)

- Module [`04-cache-control.md`](../../modules/04-cache-control.md) — fraîcheur, `max-age`.
- Module [`05-etag-validation-conditionnelle.md`](../../modules/05-etag-validation-conditionnelle.md)
  — ETag fort vs faible, `If-None-Match`, flux 304 Not Modified, précédence sur
  `If-Modified-Since`.

## Énoncé

Lis les commentaires en tête de `src/summaryCache.ts`. Implémente
`handleGetFamilySummary(familyId, ifNoneMatch, cache, now)` : les règles exactes (ordre de
priorité rien en cache / cache frais + ETag qui correspond / cache frais sans correspondance)
y sont décrites.

**Le piège à éviter.** Un cache qui recalcule à CHAQUE requête mais pose quand même un
`ETag` et un `Cache-Control` "a l'air" fonctionnel à l'œil (les en-têtes sont là, un
navigateur les affiche) — mais ne sert RIEN depuis le cache. L'oracle ne regarde pas
seulement les en-têtes : il compte les appels réels à `computeExpensiveSummary`.

## Étapes (en friction)

1. `npm run lab:01` : RED — seuls les tests sur les utilitaires DONNÉS (`etagOf`,
   `computeExpensiveSummary`) passent déjà.
2. Implémente le chemin "rien en cache" : calcule, pose l'ETag, stocke avec une expiration à
   60 secondes.
3. Ajoute le chemin "cache frais, ETag qui correspond" → 304 sans body.
4. Ajoute le chemin "cache frais, sans `If-None-Match`" → 200 servi depuis le cache.
5. Relance : les 7 tests doivent passer.

## Vérifier

```bash
cd 11-http-caching/labs
npm install
npm run lab:01
npm run solution:01
```

**Ce que l'oracle vérifie**

Premier appel : calcule et pose les en-têtes (1 appel coûteux). Revalidation conditionnelle :
un `If-None-Match` qui correspond renvoie 304 sans body ET sans second calcul. Servi depuis
le cache : un second appel sans `If-None-Match` mais dans la fenêtre de fraîcheur renvoie le
même contenu sans recalcul. Expiration : au-delà de `max-age`, un nouvel appel déclenche un
VRAI recalcul. Clé de cache : deux familles différentes ont chacune leur propre entrée,
indépendamment.

## Variante J+30 (fading)

Le produit veut un ETag FAIBLE (`W/"..."`) pour cet endpoint plutôt que fort, parce que le
contenu contient un horodatage qui varie sans que la donnée "change" vraiment pour
l'utilisateur. Qu'est-ce que ça change dans la comparaison `If-None-Match` (module 05,
weak comparison algorithm) ?

## Application TribuZen

Même stratégie sur l'endpoint réel `GET /families/:id/members` de `tribuzen-api` (cours 09),
avec Redis comme store partagé entre plusieurs instances de l'API. Commit :
`feat(cache): ETag + Cache-Control + revalidation sur le résumé de famille, mesuré 1 calcul pour N requêtes`.
