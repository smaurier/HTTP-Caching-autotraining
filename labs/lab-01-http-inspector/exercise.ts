// =============================================================================
// Lab 01 — HTTP Inspector
// =============================================================================
// Exécuter avec : npx tsx exercise.ts
// Puis ouvrir http://localhost:3000 dans un navigateur
// =============================================================================

import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

console.log("=== Lab 01 : HTTP Inspector ===\n");

const PORT: number = 3000;

// =============================================================================
// PARTIE 1 : Créer un serveur HTTP basique
// =============================================================================
// Créez un serveur HTTP qui écoute sur le port 3000.
// Pour l'instant, répondez simplement "Hello HTTP!" à toute requête.
// 💡 Utilisez createServer() et passez un callback (req, res) => { ... }
// =============================================================================

// TODO: Créer le serveur HTTP
// const server = createServer((req: IncomingMessage, res: ServerResponse) => {
//   // TODO: Répondre "Hello HTTP!"
// });

// =============================================================================
// PARTIE 2 : Loguer les headers de la requête
// =============================================================================
// Dans le callback du serveur, loguez pour chaque requête :
//   - La méthode (req.method)
//   - L'URL (req.url)
//   - Tous les headers (req.headers)
// 💡 Utilisez Object.entries(req.headers) pour itérer sur les headers
// 💡 Formatez l'affichage pour qu'il soit lisible
// =============================================================================

// TODO: Ajouter le logging des headers dans le callback du serveur
// console.log(`\n📨 ${req.method} ${req.url}`);
// console.log("--- Headers ---");
// TODO: Itérer et afficher chaque header

// =============================================================================
// PARTIE 3 : Gérer différentes routes
// =============================================================================
// Remplacez la réponse unique par un routage :
//   - "/" → 200, "Bienvenue sur la page d'accueil"
//   - "/api" → 200, JSON { message: "API Response", timestamp: Date.now() }
//   - Autre → 404, "Page non trouvée"
// 💡 Utilisez un if/else ou un switch sur req.url
// =============================================================================

// TODO: Implémenter le routage dans le callback du serveur

// =============================================================================
// PARTIE 4 : Configurer les headers de réponse
// =============================================================================
// Ajoutez ces headers à chaque réponse :
//   - "X-Powered-By": "HTTP-Caching-Course"
//   - "X-Request-Id": un UUID unique (crypto.randomUUID())
//   - "Content-Type": adapté à la route (text/plain ou application/json)
// 💡 Utilisez res.writeHead(statusCode, { header: value, ... })
// =============================================================================

// TODO: Ajouter les headers personnalisés aux réponses

// =============================================================================
// Démarrage du serveur
// =============================================================================
// TODO: Décommenter quand le serveur est créé
// server.listen(PORT, () => {
//   console.log(`✅ Serveur démarré sur http://localhost:${PORT}`);
//   console.log("📋 Ouvrez cette URL dans votre navigateur et observez la console\n");
// });

console.log("\n=== Fin du Lab 01 ===");
