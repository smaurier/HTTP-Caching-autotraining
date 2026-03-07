# Lab 01 — HTTP Inspector

## Objectifs
- Comprendre la structure d'une requête/réponse HTTP
- Savoir lire et loguer les headers HTTP entrants
- Configurer un serveur Node.js basique avec `node:http`
- Manipuler les headers de réponse

## Prérequis
- Node.js 20+

## Lancer l'exercice
```bash
node exercise.js
```

## Instructions

### Partie 1 — Créer un serveur HTTP basique
Créez un serveur HTTP qui écoute sur le port **3000** et répond `"Hello HTTP!"` à toute requête.

### Partie 2 — Loguer les headers de la requête
Pour chaque requête entrante, affichez dans la console :
- La méthode HTTP (`GET`, `POST`, etc.)
- L'URL demandée
- Tous les headers sous forme clé/valeur

### Partie 3 — Gérer différentes routes
Implémentez 3 routes :
- `/` → Répond `200` avec `"Bienvenue sur la page d'accueil"`
- `/api` → Répond `200` avec un objet JSON `{ "message": "API Response", "timestamp": ... }`
- Toute autre route → Répond `404` avec `"Page non trouvée"`

### Partie 4 — Configurer les headers de réponse
Ajoutez des headers personnalisés aux réponses :
- `X-Powered-By: HTTP-Caching-Course`
- `Content-Type` approprié pour chaque route (`text/plain`, `application/json`)
- `X-Request-Id` : un identifiant unique par requête (utilisez `crypto.randomUUID()`)

## Ce qu'il faut observer
1. Les headers envoyés automatiquement par le navigateur (User-Agent, Accept, Accept-Encoding, etc.)
2. La différence entre `Content-Type: text/plain` et `application/json`
3. Comment le serveur reçoit et traite chaque requête séquentiellement
4. Les headers personnalisés visibles dans l'onglet Network de DevTools

## Indices
- `http.createServer((req, res) => { ... })` crée le serveur
- `req.headers` est un objet contenant tous les headers de la requête
- `res.writeHead(statusCode, headers)` définit le statut et les headers de réponse
- `res.end(body)` envoie le corps et termine la réponse
- `crypto.randomUUID()` génère un UUID v4
