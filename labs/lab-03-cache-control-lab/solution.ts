// =============================================================================
// Lab 03 — Cache-Control Lab — SOLUTION
// =============================================================================
// Exécuter avec : npx tsx solution.ts
// Puis tester avec curl ou un navigateur
// =============================================================================

import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { createHash } from "node:crypto";

console.log("=== Lab 03 : Cache-Control Lab — SOLUTION ===\n");

const PORT: number = 3002;

// POURQUOI un compteur ? Pour observer combien de requêtes arrivent réellement
// au serveur. Avec max-age, le navigateur ne fait aucune requête → le compteur
// ne s'incrémente pas. Avec no-cache, le serveur reçoit la requête mais peut
// répondre 304. Avec no-store, chaque requête arrive et reçoit un 200 complet.
let requestCount: number = 0;

// =============================================================================
// Contenu simulé des fichiers
// =============================================================================
const CSS_CONTENT: string = `
body {
  font-family: system-ui, sans-serif;
  background-color: #f5f5f5;
  color: #333;
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}
`.trim();

const API_DATA = {
  users: [
    { id: 1, name: "Alice", role: "admin" },
    { id: 2, name: "Bob", role: "user" },
  ],
  generatedAt: null as string | null,
};

const SECRET_DATA = {
  token: "sk-secret-abc123def456",
  refreshToken: "rt-secret-xyz789",
};

const HTML_CONTENT: string = `<!DOCTYPE html>
<html lang="fr">
<head><title>Page avec s-maxage</title></head>
<body>
  <h1>Page servie par le CDN</h1>
  <p>Générée à : {{timestamp}}</p>
</body>
</html>`;

// =============================================================================
// PARTIE 1 : Servir avec max-age (assets immutables)
// =============================================================================
// POURQUOI max-age=31536000 + immutable ?
// - max-age=31536000 (1 an) est la durée maximale recommandée par les RFC.
// - "immutable" empêche le navigateur de faire des requêtes conditionnelles
//   même lors d'un refresh (F5). Sans "immutable", un refresh déclenche une
//   revalidation même si max-age n'est pas expiré.
// - "public" permet aux caches partagés (CDN) de stocker la réponse.
// - Stratégie : les fichiers avec un hash dans le nom (style.abc123.css)
//   peuvent être cachés indéfiniment car le nom change si le contenu change.
// =============================================================================

function handleAssets(req: IncomingMessage, res: ServerResponse): void {
  console.log("  📁 Servant un asset immutable (max-age=1an)");

  res.writeHead(200, {
    "Content-Type": "text/css; charset=utf-8",
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Request-Count": String(requestCount),
  });
  res.end(CSS_CONTENT);
}

// =============================================================================
// PARTIE 2 : Servir avec no-cache (toujours revalider)
// =============================================================================
// POURQUOI no-cache et pas max-age=0 ?
// - "no-cache" est plus explicite : "tu peux stocker, mais TOUJOURS revalider".
// - max-age=0 fait presque la même chose, mais no-cache est plus strict.
// - Le navigateur stocke la réponse ET l'ETag, puis envoie If-None-Match
//   lors de la prochaine requête. Si le contenu n'a pas changé → 304 (économie
//   de bande passante). Si changé → 200 avec le nouveau contenu.
// POURQUOI un ETag ? Sans ETag (ou Last-Modified), le serveur ne peut pas
// répondre 304. La directive no-cache sans mécanisme de revalidation est inutile.
// =============================================================================

function handleApiData(req: IncomingMessage, res: ServerResponse): void {
  const data = { ...API_DATA, generatedAt: new Date().toISOString() };
  const content: string = JSON.stringify(data, null, 2);

  // POURQUOI SHA-256 pour l'ETag ? C'est un hash fort et rapide.
  // L'ETag permet au client de dire "j'ai déjà cette version" via If-None-Match.
  const etag: string = `"${createHash("sha256").update(content).digest("hex").slice(0, 16)}"`;

  // POURQUOI vérifier If-None-Match ? C'est le mécanisme de revalidation.
  // Si le client envoie le même ETag → le contenu n'a pas changé → 304.
  const clientEtag: string | undefined = req.headers["if-none-match"];
  if (clientEtag === etag) {
    console.log(`  🔄 304 Not Modified (ETag match: ${etag})`);
    res.writeHead(304, {
      "Cache-Control": "no-cache",
      ETag: etag,
      "X-Request-Count": String(requestCount),
    });
    res.end();
    return;
  }

  console.log(`  📄 200 OK — Données API (ETag: ${etag})`);

  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache",
    ETag: etag,
    "X-Request-Count": String(requestCount),
  });
  res.end(content);
}

// =============================================================================
// PARTIE 3 : Servir avec no-store (jamais cacher)
// =============================================================================
// POURQUOI no-store ?
// - "no-store" interdit TOUT stockage de la réponse : pas en mémoire, pas sur
//   disque, pas dans le cache navigateur, pas dans un CDN.
// - C'est la directive la plus restrictive de Cache-Control.
// - Utilisée pour : tokens d'authentification, données bancaires, informations
//   médicales, toute donnée sensible.
// - ATTENTION : "no-cache" ne suffit PAS pour les données sensibles ! Avec
//   no-cache, la réponse est quand même stockée (pour la revalidation).
// =============================================================================

function handleApiSecret(req: IncomingMessage, res: ServerResponse): void {
  console.log("  🔒 Servant des données sensibles (no-store)");

  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Request-Count": String(requestCount),
  });
  res.end(JSON.stringify(SECRET_DATA, null, 2));
}

// =============================================================================
// PARTIE 4 : Servir avec s-maxage (cache CDN)
// =============================================================================
// POURQUOI s-maxage séparé de max-age ?
// - max-age s'applique à TOUS les caches (navigateur + CDN).
// - s-maxage s'applique UNIQUEMENT aux caches partagés (shared = CDN, proxy).
// - Avec max-age=0, s-maxage=300 :
//   → Le navigateur revalide TOUJOURS (il voit max-age=0).
//   → Le CDN cache pendant 5 minutes (il utilise s-maxage en priorité).
// - POURQUOI cette stratégie ? L'utilisateur voit toujours une page "fraîche"
//   (servie par le CDN depuis son cache), et le serveur d'origine est protégé
//   (il ne reçoit qu'une requête toutes les 5 minutes).
// =============================================================================

function handlePage(req: IncomingMessage, res: ServerResponse): void {
  const html: string = HTML_CONTENT.replace("{{timestamp}}", new Date().toISOString());

  console.log("  📄 Servant une page HTML (s-maxage=300)");

  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "public, max-age=0, s-maxage=300",
    "X-Request-Count": String(requestCount),
  });
  res.end(html);
}

// =============================================================================
// Routeur principal
// =============================================================================
// POURQUOI un routeur centralisé ? Pour loguer toutes les requêtes et
// distribuer vers la bonne fonction de traitement. En production, on utiliserait
// un framework (Express, Fastify), mais ici on reste sur node:http pur.
// =============================================================================

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  requestCount++;
  console.log(`\n📨 [#${requestCount}] ${req.method} ${req.url}`);

  switch (req.url) {
    case "/assets/style.css":
      handleAssets(req, res);
      break;
    case "/api/data":
      handleApiData(req, res);
      break;
    case "/api/secret":
      handleApiSecret(req, res);
      break;
    case "/page":
      handlePage(req, res);
      break;
    default:
      // POURQUOI ne pas cacher les 404 ? Parce qu'une URL peut devenir valide
      // plus tard. On utilise no-store pour éviter de cacher les erreurs.
      res.writeHead(404, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Request-Count": String(requestCount),
      });
      res.end("404 — Route non trouvée");
      console.log("  ❌ 404");
  }
});

// =============================================================================
// Démarrage du serveur
// =============================================================================

server.listen(PORT, () => {
  console.log(`✅ Serveur démarré sur http://localhost:${PORT}`);
  console.log("\nRoutes disponibles :");
  console.log(`  GET /assets/style.css → Cache-Control: public, max-age=31536000, immutable`);
  console.log(`  GET /api/data         → Cache-Control: no-cache (+ ETag)`);
  console.log(`  GET /api/secret       → Cache-Control: no-store`);
  console.log(`  GET /page             → Cache-Control: public, max-age=0, s-maxage=300`);
  console.log("\nTestez avec :");
  console.log(`  curl -v http://localhost:${PORT}/assets/style.css`);
  console.log(`  curl -v http://localhost:${PORT}/api/data`);
  console.log(`  curl -v http://localhost:${PORT}/api/secret`);
  console.log(`  curl -v http://localhost:${PORT}/page`);
  console.log("\n📊 Observez le compteur X-Request-Count dans les réponses");
  console.log("   pour voir quand le serveur est réellement sollicité.\n");
  console.log("Appuyez sur Ctrl+C pour arrêter\n");
});

console.log("\n=== Fin du Lab 03 ===");
