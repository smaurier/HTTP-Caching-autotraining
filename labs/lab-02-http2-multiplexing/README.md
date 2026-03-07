# Lab 02 — HTTP/2 Multiplexing

## Objectifs
- Comprendre la différence entre HTTP/1.1 et HTTP/2 pour le chargement de ressources
- Observer le problème du head-of-line blocking en HTTP/1.1
- Simuler le multiplexage HTTP/2 avec des requêtes concurrentes
- Mesurer l'impact du parallélisme sur les temps de chargement

## Prérequis
- Node.js 20+

## Lancer l'exercice
```bash
node exercise.js
```

## Instructions

### Partie 1 — Créer un serveur HTTP/1.1 servant 10 fichiers
Créez un serveur HTTP qui sert 10 ressources simulées (`/resource/0` à `/resource/9`).
Chaque ressource prend **100ms** à générer (simulé avec un `setTimeout`).
Le serveur doit répondre avec un contenu textuel incluant le numéro de la ressource.

### Partie 2 — Mesurer le chargement séquentiel (HTTP/1.1)
Écrivez une fonction client qui charge les 10 ressources **séquentiellement** (une après l'autre).
Mesurez le temps total avec `performance.now()`.
Affichez le temps de chaque requête et le temps total.

### Partie 3 — Simuler le multiplexage (chargement parallèle)
Écrivez une seconde fonction client qui charge les 10 ressources **en parallèle** avec `Promise.all()`.
Mesurez le temps total et comparez avec le chargement séquentiel.
Affichez le gain de performance obtenu.

## Ce qu'il faut observer
1. Le chargement séquentiel prend environ 10x le temps d'une requête (~1000ms)
2. Le chargement parallèle prend environ le temps d'une seule requête (~100ms)
3. C'est exactement le problème que HTTP/2 résout avec le multiplexage
4. En HTTP/1.1, les navigateurs contournent cela en ouvrant 6 connexions TCP simultanées

## Indices
- `http.request(options, callback)` pour faire une requête client
- `Promise.all([...promises])` pour lancer des requêtes en parallèle
- `performance.now()` pour mesurer le temps (disponible globalement en Node.js 20+)
- `setTimeout(resolve, ms)` pour simuler la latence côté serveur
- N'oubliez pas de fermer le serveur après les tests avec `server.close()`
