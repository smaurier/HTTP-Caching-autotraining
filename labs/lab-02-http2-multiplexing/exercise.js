// =============================================================================
// Lab 02 — HTTP/2 Multiplexing
// =============================================================================
// Exécuter avec : node exercise.js
// =============================================================================

import { createServer, request as httpRequest } from "node:http";

console.log("=== Lab 02 : HTTP/2 Multiplexing ===\n");

const PORT = 3001;
const RESOURCE_COUNT = 10;
const SIMULATED_LATENCY_MS = 100;

// =============================================================================
// PARTIE 1 : Créer un serveur HTTP/1.1 servant 10 fichiers
// =============================================================================
// Créez un serveur qui :
//   - Écoute sur le port 3001
//   - Gère les routes /resource/0 à /resource/9
//   - Simule 100ms de latence par ressource (setTimeout)
//   - Répond avec le contenu : "Contenu de la ressource N" (où N est le numéro)
//   - Répond 404 pour toute autre route
// 💡 Extraire le numéro de ressource avec req.url.split("/")
// 💡 Utiliser setTimeout pour simuler la latence
// =============================================================================

// TODO: Créer le serveur
// const server = createServer((req, res) => {
//   // TODO: Extraire le numéro de la ressource depuis l'URL
//   // TODO: Simuler la latence avec setTimeout
//   // TODO: Répondre avec le contenu
// });

// =============================================================================
// PARTIE 2 : Mesurer le chargement séquentiel (HTTP/1.1)
// =============================================================================
// Écrivez une fonction qui :
//   - Charge les 10 ressources UNE PAR UNE (séquentiel)
//   - Mesure le temps total avec performance.now()
//   - Affiche le temps de chaque requête
//   - Retourne le temps total
// 💡 Utilisez une boucle for...of avec await
// 💡 Encapsulez http.request dans une Promise
// =============================================================================

/**
 * Fait une requête HTTP GET et retourne le corps de la réponse.
 * @param {string} path - Le chemin de la requête (ex: "/resource/0")
 * @returns {Promise<string>} Le corps de la réponse
 */
function fetchResource(path) {
  // TODO: Implémenter cette fonction
  // 💡 Retournez une new Promise((resolve, reject) => { ... })
  // 💡 Utilisez httpRequest({ hostname: "localhost", port: PORT, path }, (res) => { ... })
  // 💡 Collectez les données avec res.on("data", ...) et res.on("end", ...)
}

/**
 * Charge toutes les ressources séquentiellement.
 * @returns {Promise<number>} Le temps total en millisecondes
 */
async function loadSequential() {
  console.log("📦 Chargement SÉQUENTIEL (HTTP/1.1 style)...\n");
  const start = performance.now();

  // TODO: Boucle for de 0 à RESOURCE_COUNT
  //   - Mesurer le temps de chaque requête
  //   - Appeler fetchResource(`/resource/${i}`)
  //   - Afficher le temps de chaque requête

  const totalTime = performance.now() - start;
  console.log(`\n⏱️  Temps total séquentiel : ${totalTime.toFixed(0)}ms\n`);
  return totalTime;
}

// =============================================================================
// PARTIE 3 : Simuler le multiplexage (chargement parallèle)
// =============================================================================
// Écrivez une fonction qui :
//   - Charge les 10 ressources EN PARALLÈLE (Promise.all)
//   - Mesure le temps total
//   - Compare avec le temps séquentiel
// 💡 Utilisez Promise.all() avec un Array.from() ou map()
// =============================================================================

/**
 * Charge toutes les ressources en parallèle (simulation HTTP/2 multiplexing).
 * @returns {Promise<number>} Le temps total en millisecondes
 */
async function loadParallel() {
  console.log("🚀 Chargement PARALLÈLE (HTTP/2 multiplexing style)...\n");
  const start = performance.now();

  // TODO: Créer un tableau de promesses pour les 10 ressources
  // TODO: Attendre toutes les promesses avec Promise.all()

  const totalTime = performance.now() - start;
  console.log(`\n⏱️  Temps total parallèle : ${totalTime.toFixed(0)}ms\n`);
  return totalTime;
}

// =============================================================================
// Exécution des tests
// =============================================================================

// TODO: Décommenter quand les parties sont implémentées
// server.listen(PORT, async () => {
//   console.log(`✅ Serveur démarré sur le port ${PORT}\n`);
//
//   try {
//     const seqTime = await loadSequential();
//     const parTime = await loadParallel();
//
//     console.log("=== Comparaison ===");
//     console.log(`Séquentiel : ${seqTime.toFixed(0)}ms`);
//     console.log(`Parallèle  : ${parTime.toFixed(0)}ms`);
//     console.log(`Gain        : ${((1 - parTime / seqTime) * 100).toFixed(0)}%`);
//     console.log(`Facteur     : ${(seqTime / parTime).toFixed(1)}x plus rapide\n`);
//
//     if (parTime < seqTime / 2) {
//       console.log("✅ Le chargement parallèle est significativement plus rapide !");
//     } else {
//       console.log("❌ Le gain n'est pas assez significatif, vérifiez l'implémentation.");
//     }
//   } finally {
//     server.close();
//     console.log("\n🛑 Serveur arrêté.");
//   }
//
//   console.log("\n=== Fin du Lab 02 ===");
// });

console.log("\n=== Fin du Lab 02 ===");
