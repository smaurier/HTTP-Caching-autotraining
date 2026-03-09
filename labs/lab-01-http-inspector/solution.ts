// =============================================================================
// Lab 01 — HTTP Inspector — SOLUTION
// =============================================================================
// Exécuter avec : npx tsx solution.ts
// Puis ouvrir http://localhost:3000 dans un navigateur
// =============================================================================

import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

console.log("=== Lab 01 : HTTP Inspector — SOLUTION ===\n");

const PORT: number = 3000;

// =============================================================================
// PARTIE 1 : Créer un serveur HTTP basique
// =============================================================================
// POURQUOI createServer ? C'est la brique fondamentale de Node.js pour HTTP.
// Le callback reçoit deux objets : req (IncomingMessage) et res (ServerResponse).
// Chaque requête entrante déclenche ce callback.
// =============================================================================

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  // ===========================================================================
  // PARTIE 2 : Loguer les headers de la requête
  // ===========================================================================
  // POURQUOI loguer les headers ? Pour comprendre ce que le navigateur envoie
  // automatiquement : User-Agent, Accept, Accept-Encoding, Connection, etc.
  // Ces headers influencent le comportement du cache HTTP.
  // ===========================================================================

  const requestId: string = randomUUID();

  console.log(`\n📨 ${req.method} ${req.url}`);
  console.log(`🆔 Request ID: ${requestId}`);
  console.log("--- Headers de la requête ---");

  // POURQUOI Object.entries ? req.headers est un objet simple clé/valeur.
  // Node.js normalise tous les noms de headers en minuscules.
  for (const [name, value] of Object.entries(req.headers)) {
    console.log(`  ${name}: ${value}`);
  }

  console.log("---");

  // ===========================================================================
  // PARTIE 3 : Gérer différentes routes
  // ===========================================================================
  // POURQUOI un routage ? Pour démontrer que les headers de réponse (notamment
  // Content-Type et les headers de cache) varient selon le type de ressource.
  // ===========================================================================

  // POURQUOI des headers communs ? Certains headers s'appliquent à toutes les
  // réponses : l'identifiant de requête pour le debugging, et X-Powered-By
  // pour identifier notre serveur.
  const commonHeaders: Record<string, string> = {
    "X-Powered-By": "HTTP-Caching-Course",
    "X-Request-Id": requestId,
  };

  if (req.url === "/") {
    // POURQUOI text/plain avec charset utf-8 ? Pour que le navigateur affiche
    // correctement les caractères accentués (français).
    res.writeHead(200, {
      ...commonHeaders,
      "Content-Type": "text/plain; charset=utf-8",
    });
    res.end("Bienvenue sur la page d'accueil");

    console.log("✅ 200 — Page d'accueil servie");
  } else if (req.url === "/api") {
    // POURQUOI application/json ? Le navigateur et les clients HTTP utilisent
    // Content-Type pour savoir comment parser la réponse. Une API doit toujours
    // indiquer qu'elle retourne du JSON.
    const payload = {
      message: "API Response",
      timestamp: Date.now(),
    };

    res.writeHead(200, {
      ...commonHeaders,
      "Content-Type": "application/json; charset=utf-8",
    });
    res.end(JSON.stringify(payload, null, 2));

    console.log("✅ 200 — Réponse API servie");
  } else {
    // POURQUOI 404 ? C'est le code standard pour "ressource non trouvée".
    // Le navigateur et les caches HTTP traitent différemment les réponses
    // selon leur code de statut (seuls 200, 301, etc. sont cachables par défaut).
    res.writeHead(404, {
      ...commonHeaders,
      "Content-Type": "text/plain; charset=utf-8",
    });
    res.end("Page non trouvée");

    console.log(`❌ 404 — Route inconnue : ${req.url}`);
  }
});

// =============================================================================
// Démarrage du serveur
// =============================================================================
// POURQUOI un callback dans listen() ? Pour confirmer que le serveur est bien
// démarré et prêt à recevoir des connexions.
// =============================================================================

server.listen(PORT, () => {
  console.log(`✅ Serveur démarré sur http://localhost:${PORT}`);
  console.log("📋 Ouvrez cette URL dans votre navigateur et observez la console");
  console.log("\nRoutes disponibles :");
  console.log(`  GET http://localhost:${PORT}/     → Page d'accueil (text/plain)`);
  console.log(`  GET http://localhost:${PORT}/api  → API JSON (application/json)`);
  console.log(`  GET http://localhost:${PORT}/xyz  → 404 (text/plain)`);
  console.log("\nAppuyez sur Ctrl+C pour arrêter le serveur\n");
});

console.log("\n=== Fin du Lab 01 ===");
