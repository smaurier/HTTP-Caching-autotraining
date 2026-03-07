// =============================================================================
// Lab 03 — Cache-Control Lab
// =============================================================================
// Exécuter avec : node exercise.js
// Puis tester avec curl ou un navigateur
// =============================================================================

import { createServer } from "node:http";
import { createHash } from "node:crypto";

console.log("=== Lab 03 : Cache-Control Lab ===\n");

const PORT = 3002;

// Compteur de requêtes pour observer quand le serveur est réellement sollicité
let requestCount = 0;

// =============================================================================
// Contenu simulé des fichiers
// =============================================================================
const CSS_CONTENT = `
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
  generatedAt: null, // sera rempli dynamiquement
};

const SECRET_DATA = {
  token: "sk-secret-abc123def456",
  refreshToken: "rt-secret-xyz789",
};

const HTML_CONTENT = `<!DOCTYPE html>
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
// Route : /assets/style.css
// Headers à configurer :
//   - Cache-Control: public, max-age=31536000, immutable
//   - Content-Type: text/css; charset=utf-8
// 💡 "immutable" dit au navigateur de ne même pas faire de requête conditionnelle
// 💡 31536000 secondes = 365 jours
// =============================================================================

function handleAssets(req, res) {
  // TODO: Configurer les headers Cache-Control pour un asset immutable
  // TODO: Servir CSS_CONTENT avec le bon Content-Type
}

// =============================================================================
// PARTIE 2 : Servir avec no-cache (toujours revalider)
// =============================================================================
// Route : /api/data
// Headers à configurer :
//   - Cache-Control: no-cache
//   - Content-Type: application/json; charset=utf-8
//   - ETag: un hash du contenu (pour permettre la revalidation)
// 💡 "no-cache" ne signifie PAS "ne pas cacher" — ça signifie "revalide avant d'utiliser"
// 💡 Générez un ETag avec createHash("sha256").update(content).digest("hex")
// =============================================================================

function handleApiData(req, res) {
  // TODO: Générer le contenu JSON avec un timestamp dynamique
  // TODO: Calculer un ETag du contenu
  // TODO: Configurer Cache-Control: no-cache
  // TODO: Ajouter le header ETag
  // TODO: Servir le JSON
}

// =============================================================================
// PARTIE 3 : Servir avec no-store (jamais cacher)
// =============================================================================
// Route : /api/secret
// Headers à configurer :
//   - Cache-Control: no-store
//   - Content-Type: application/json; charset=utf-8
// 💡 "no-store" interdit TOUT stockage — même en mémoire
// 💡 Utilisé pour les tokens, données personnelles sensibles
// =============================================================================

function handleApiSecret(req, res) {
  // TODO: Configurer Cache-Control: no-store
  // TODO: Servir SECRET_DATA en JSON
}

// =============================================================================
// PARTIE 4 : Servir avec s-maxage (cache CDN)
// =============================================================================
// Route : /page
// Headers à configurer :
//   - Cache-Control: public, max-age=0, s-maxage=300
//   - Content-Type: text/html; charset=utf-8
// 💡 max-age=0 : le navigateur revalide toujours
// 💡 s-maxage=300 : le CDN cache pendant 5 minutes
// 💡 Remplacez {{timestamp}} dans HTML_CONTENT par la date courante
// =============================================================================

function handlePage(req, res) {
  // TODO: Remplacer le placeholder {{timestamp}} par Date.now()
  // TODO: Configurer Cache-Control avec s-maxage
  // TODO: Servir le HTML
}

// =============================================================================
// Routeur principal
// =============================================================================

// TODO: Créer le serveur et implémenter le routage
// const server = createServer((req, res) => {
//   requestCount++;
//   console.log(`\n📨 [#${requestCount}] ${req.method} ${req.url}`);
//
//   // TODO: Router vers la bonne fonction selon req.url
//   //   /assets/style.css → handleAssets
//   //   /api/data         → handleApiData
//   //   /api/secret       → handleApiSecret
//   //   /page             → handlePage
//   //   autre             → 404
//
//   // 💡 Ajoutez un header X-Request-Count à chaque réponse
//   //    pour observer combien de fois le serveur est sollicité
// });

// =============================================================================
// Démarrage du serveur
// =============================================================================

// TODO: Décommenter quand le serveur est prêt
// server.listen(PORT, () => {
//   console.log(`✅ Serveur démarré sur http://localhost:${PORT}`);
//   console.log("\nRoutes disponibles :");
//   console.log(`  GET /assets/style.css → max-age=31536000, immutable`);
//   console.log(`  GET /api/data         → no-cache (revalidation)`);
//   console.log(`  GET /api/secret       → no-store (jamais cacher)`);
//   console.log(`  GET /page             → s-maxage=300 (cache CDN)`);
//   console.log("\nTestez avec :");
//   console.log(`  curl -v http://localhost:${PORT}/assets/style.css`);
//   console.log(`  curl -v http://localhost:${PORT}/api/data`);
//   console.log(`  curl -v http://localhost:${PORT}/api/secret`);
//   console.log(`  curl -v http://localhost:${PORT}/page`);
//   console.log("\nAppuyez sur Ctrl+C pour arrêter\n");
// });

console.log("\n=== Fin du Lab 03 ===");
