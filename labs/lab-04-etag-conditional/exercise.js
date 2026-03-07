// =============================================================================
// Lab 04 — ETag & Requêtes Conditionnelles
// =============================================================================
// Exécuter avec : node exercise.js
// =============================================================================

import { createServer, request as httpRequest } from "node:http";
import { createHash } from "node:crypto";

console.log("=== Lab 04 : ETag & Requêtes Conditionnelles ===\n");

const PORT = 3003;

// =============================================================================
// Données simulées (modifiables pour tester le changement d'ETag)
// =============================================================================
let currentContent = "Bonjour, ceci est le contenu de la ressource v1.";
let lastModifiedDate = new Date("2025-01-15T10:30:00Z");

// =============================================================================
// PARTIE 1 : Générer des ETags avec crypto
// =============================================================================
// Implémentez une fonction qui :
//   - Prend une chaîne en entrée
//   - Calcule un hash SHA-256
//   - Retourne un ETag fort au format : "abcdef1234567890" (entre guillemets)
// 💡 Utilisez createHash("sha256").update(content).digest("hex")
// 💡 Tronquez à 16 caractères pour la lisibilité
// 💡 N'oubliez pas les guillemets autour du hash (convention HTTP)
// =============================================================================

function generateETag(content) {
  // TODO: Implémenter la génération d'ETag fort
  // return `"${hash}"`;
}

// Tests de la Partie 1
setTimeout(() => {
  console.log("--- Partie 1 : Génération d'ETags ---\n");

  const content1 = "Hello World";
  const content2 = "Hello World";
  const content3 = "Goodbye World";

  const etag1 = generateETag(content1);
  const etag2 = generateETag(content2);
  const etag3 = generateETag(content3);

  console.log(`Contenu 1: "${content1}" → ETag: ${etag1}`);
  console.log(`Contenu 2: "${content2}" → ETag: ${etag2}`);
  console.log(`Contenu 3: "${content3}" → ETag: ${etag3}`);

  // Vérifications
  const test1 = etag1 === etag2;
  const test2 = etag1 !== etag3;
  const test3 = etag1?.startsWith('"') && etag1?.endsWith('"');

  console.log(`\n${test1 ? "✅" : "❌"} Même contenu → même ETag`);
  console.log(`${test2 ? "✅" : "❌"} Contenu différent → ETag différent`);
  console.log(`${test3 ? "✅" : "❌"} ETag est entre guillemets`);
}, 0);

// =============================================================================
// PARTIE 2 : Gérer If-None-Match → 304
// =============================================================================
// Dans le handler du serveur :
//   1. Générez l'ETag du contenu actuel
//   2. Lisez le header "if-none-match" de la requête
//   3. Si l'ETag correspond → répondez 304 (sans corps)
//   4. Sinon → répondez 200 avec le contenu et l'ETag
// 💡 req.headers["if-none-match"] contient l'ETag du client
// 💡 La réponse 304 ne doit PAS avoir de corps (res.end() sans argument)
// =============================================================================

function handleRequest(req, res) {
  // TODO: Générer l'ETag du contenu actuel
  // TODO: Vérifier If-None-Match
  // TODO: Répondre 304 ou 200
}

// =============================================================================
// PARTIE 3 : Gérer Last-Modified / If-Modified-Since
// =============================================================================
// Ajoutez dans handleRequest :
//   1. Header "Last-Modified" dans les réponses 200
//   2. Vérification de "If-Modified-Since" dans les requêtes
//   3. Si la ressource n'a pas changé depuis → 304
// 💡 Formatez la date avec lastModifiedDate.toUTCString()
// 💡 Comparez avec new Date(req.headers["if-modified-since"]).getTime()
// 💡 ETag a priorité sur Last-Modified (vérifiez ETag d'abord)
// =============================================================================

// TODO: Intégrer la logique Last-Modified dans handleRequest

// =============================================================================
// PARTIE 4 : Comparer ETags forts vs faibles
// =============================================================================
// Implémentez generateWeakETag(content) :
//   - Même hash que l'ETag fort
//   - Préfixé par W/ : W/"abcdef1234567890"
// 💡 Un ETag faible signifie "sémantiquement équivalent" (pas identique octet par octet)
// 💡 Exemple : deux pages HTML avec un timestamp différent mais le même contenu utile
// =============================================================================

function generateWeakETag(content) {
  // TODO: Implémenter la génération d'ETag faible
  // return `W/${strongETag}`;
}

// Tests de la Partie 4
setTimeout(() => {
  console.log("\n--- Partie 4 : ETags forts vs faibles ---\n");

  const content = "Mon contenu de test";
  const strong = generateETag(content);
  const weak = generateWeakETag(content);

  console.log(`ETag fort   : ${strong}`);
  console.log(`ETag faible : ${weak}`);

  const test1 = weak?.startsWith('W/"');
  const test2 = weak?.includes(strong?.replace(/"/g, ""));

  console.log(`\n${test1 ? "✅" : "❌"} ETag faible commence par W/"`);
  console.log(`${test2 ? "✅" : "❌"} ETag faible contient le même hash`);
}, 0);

// =============================================================================
// Client de test
// =============================================================================

function makeRequest(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { hostname: "localhost", port: PORT, path, method: "GET", headers },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body,
          });
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

// =============================================================================
// Tests d'intégration (décommenter quand les parties 2-3 sont prêtes)
// =============================================================================

// TODO: Décommenter quand le serveur est implémenté
// const server = createServer(handleRequest);
//
// server.listen(PORT, async () => {
//   console.log(`\n✅ Serveur démarré sur le port ${PORT}\n`);
//   console.log("--- Tests d'intégration ---\n");
//
//   try {
//     // Test 1 : Première requête → 200
//     console.log("Test 1 : Première requête (pas d'ETag client)");
//     const res1 = await makeRequest("/resource");
//     console.log(`  Status: ${res1.status} — ETag: ${res1.headers.etag}`);
//     console.log(`  ${res1.status === 200 ? "✅" : "❌"} Première requête → 200`);
//
//     // Test 2 : Requête avec ETag → 304
//     console.log("\nTest 2 : Requête avec If-None-Match (même ETag)");
//     const res2 = await makeRequest("/resource", {
//       "If-None-Match": res1.headers.etag,
//     });
//     console.log(`  Status: ${res2.status} — Body length: ${res2.body.length}`);
//     console.log(`  ${res2.status === 304 ? "✅" : "❌"} ETag match → 304`);
//     console.log(`  ${res2.body.length === 0 ? "✅" : "❌"} Pas de corps dans le 304`);
//
//     // Test 3 : Requête avec mauvais ETag → 200
//     console.log("\nTest 3 : Requête avec mauvais ETag");
//     const res3 = await makeRequest("/resource", {
//       "If-None-Match": '"mauvais-etag"',
//     });
//     console.log(`  Status: ${res3.status}`);
//     console.log(`  ${res3.status === 200 ? "✅" : "❌"} Mauvais ETag → 200`);
//
//     // Test 4 : Last-Modified
//     console.log("\nTest 4 : Requête avec If-Modified-Since");
//     const res4 = await makeRequest("/resource", {
//       "If-Modified-Since": new Date("2025-12-01T00:00:00Z").toUTCString(),
//     });
//     console.log(`  Status: ${res4.status}`);
//     console.log(`  ${res4.status === 304 ? "✅" : "❌"} Pas modifié depuis → 304`);
//
//   } finally {
//     server.close();
//     console.log("\n🛑 Serveur arrêté.");
//   }
// });

console.log("\n=== Fin du Lab 04 ===");
