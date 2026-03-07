// =============================================================================
// Test Utils — Mini framework de test pour les labs
// =============================================================================
// Utilitaire partagé par tous les labs pour un feedback structuré et cohérent.
// Zéro dépendance. Compatible ESM.
//
// Usage :
//   import { createTestRunner, httpGet, httpPost, measure } from '../test-utils.js';
//   const t = createTestRunner('Lab 07 — Mini CDN');
//   t.suite('Partie 1');
//   t.assert('Le serveur répond', status === 200);
//   t.assertEqual('Status code', status, 200);
//   t.summary();
// =============================================================================

import http from 'node:http';

// =============================================================================
// Test Runner
// =============================================================================

export function createTestRunner(labName) {
  const results = [];
  let currentSuite = '';

  console.log(`\n=== ${labName} ===\n`);

  return {
    // Définir la suite courante (groupe de tests)
    suite(name) {
      currentSuite = name;
      console.log(`\n--- ${name} ---`);
    },

    // Assertion booléenne simple
    assert(description, condition, details = '') {
      const passed = !!condition;
      results.push({ suite: currentSuite, description, passed, details });
      const icon = passed ? '✅' : '❌';
      const suffix = details && !passed ? ` (${details})` : '';
      console.log(`  ${icon} ${description}${suffix}`);
      return passed;
    },

    // Assertion d'égalité stricte
    assertEqual(description, actual, expected) {
      const passed = actual === expected;
      const details = passed
        ? ''
        : `attendu: ${JSON.stringify(expected)}, reçu: ${JSON.stringify(actual)}`;
      return this.assert(description, passed, details);
    },

    // Assertion "contient"
    assertIncludes(description, str, substring) {
      const passed = typeof str === 'string' && str.includes(substring);
      const details = passed ? '' : `"${substring}" non trouvé dans "${String(str).substring(0, 80)}"`;
      return this.assert(description, passed, details);
    },

    // Assertion numérique
    assertGreaterThan(description, actual, expected) {
      return this.assert(description, actual > expected, `${actual} devrait être > ${expected}`);
    },

    assertLessThan(description, actual, expected) {
      return this.assert(description, actual < expected, `${actual} devrait être < ${expected}`);
    },

    // Assertion "truthy" avec message personnalisé
    assertTrue(description, value) {
      return this.assert(description, value, `valeur falsy: ${JSON.stringify(value)}`);
    },

    // Assertion qu'une Promise rejette
    async assertRejects(description, asyncFn) {
      try {
        await asyncFn();
        return this.assert(description, false, 'devrait rejeter mais a résolu');
      } catch {
        return this.assert(description, true);
      }
    },

    // Résumé final
    summary() {
      const passed = results.filter((r) => r.passed).length;
      const failed = results.filter((r) => !r.passed).length;
      const total = results.length;
      console.log(`\n${'='.repeat(50)}`);
      console.log(`  ${passed}/${total} tests passés`);
      if (failed > 0) {
        console.log(`  ${failed} test(s) échoué(s)`);
      } else {
        console.log(`  Tous les tests passent !`);
      }
      console.log(`${'='.repeat(50)}\n`);
      return { passed, failed, total };
    },

    // Accès aux résultats bruts
    get results() {
      return [...results];
    },
  };
}

// =============================================================================
// Helpers HTTP
// =============================================================================

/**
 * GET HTTP simple retournant { status, headers, body }
 */
export function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = typeof url === 'string' ? new URL(url) : url;
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, body })
        );
      }
    );
    req.on('error', reject);
    req.end();
  });
}

/**
 * POST HTTP simple retournant { status, headers, body }
 */
export function httpPost(url, data = {}, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = typeof url === 'string' ? new URL(url) : url;
    const bodyStr = typeof data === 'string' ? data : JSON.stringify(data);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
          ...headers,
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, body })
        );
      }
    );
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

// =============================================================================
// Helpers de mesure
// =============================================================================

/**
 * Mesure le temps d'exécution d'une fonction async
 * Retourne { result, durationMs }
 */
export async function measure(fn) {
  const start = performance.now();
  const result = await fn();
  const durationMs = Math.round(performance.now() - start);
  return { result, durationMs };
}

/**
 * Attend un certain nombre de millisecondes
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Démarre un serveur HTTP et retourne une promesse qui résout quand il écoute
 */
export function startServer(server, port) {
  return new Promise((resolve) => {
    server.listen(port, () => resolve());
  });
}

/**
 * Arrête un serveur HTTP proprement
 */
export function stopServer(server) {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}
