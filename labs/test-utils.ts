// =============================================================================
// Test Utils — Mini framework de test pour les labs
// =============================================================================
// Utilitaire partagé par tous les labs pour un feedback structuré et cohérent.
// Zéro dépendance. Compatible ESM.
//
// Usage :
//   import { createTestRunner, httpGet, httpPost, measure } from '../test-utils.ts';
//   const t = createTestRunner('Lab 07 — Mini CDN');
//   t.suite('Partie 1');
//   t.assert('Le serveur répond', status === 200);
//   t.assertEqual('Status code', status, 200);
//   t.summary();
// =============================================================================

import type { Server, IncomingHttpHeaders } from 'node:http';
import http from 'node:http';

// =============================================================================
// Types
// =============================================================================

interface TestResult {
  suite: string;
  description: string;
  passed: boolean;
  details: string;
}

interface TestSummary {
  passed: number;
  failed: number;
  total: number;
}

export interface TestRunner {
  suite(name: string): void;
  assert(description: string, condition: unknown, details?: string): boolean;
  assertEqual(description: string, actual: unknown, expected: unknown): boolean;
  assertIncludes(description: string, str: string | undefined, substring: string): boolean;
  assertGreaterThan(description: string, actual: number, expected: number): boolean;
  assertLessThan(description: string, actual: number, expected: number): boolean;
  assertTrue(description: string, value: unknown): boolean;
  assertRejects(description: string, asyncFn: () => Promise<unknown>): Promise<boolean>;
  summary(): TestSummary;
  readonly results: TestResult[];
}

export interface HttpResponse {
  status: number | undefined;
  headers: IncomingHttpHeaders;
  body: string;
}

export interface MeasureResult<T> {
  result: T;
  durationMs: number;
}

// =============================================================================
// Test Runner
// =============================================================================

export function createTestRunner(labName: string): TestRunner {
  const results: TestResult[] = [];
  let currentSuite = '';

  console.log(`\n=== ${labName} ===\n`);

  return {
    // Définir la suite courante (groupe de tests)
    suite(name: string): void {
      currentSuite = name;
      console.log(`\n--- ${name} ---`);
    },

    // Assertion booléenne simple
    assert(description: string, condition: unknown, details: string = ''): boolean {
      const passed = !!condition;
      results.push({ suite: currentSuite, description, passed, details });
      const icon = passed ? '\u2705' : '\u274C';
      const suffix = details && !passed ? ` (${details})` : '';
      console.log(`  ${icon} ${description}${suffix}`);
      return passed;
    },

    // Assertion d'égalité stricte
    assertEqual(description: string, actual: unknown, expected: unknown): boolean {
      const passed = actual === expected;
      const details = passed
        ? ''
        : `attendu: ${JSON.stringify(expected)}, reçu: ${JSON.stringify(actual)}`;
      return this.assert(description, passed, details);
    },

    // Assertion "contient"
    assertIncludes(description: string, str: string | undefined, substring: string): boolean {
      const passed = typeof str === 'string' && str.includes(substring);
      const details = passed ? '' : `"${substring}" non trouvé dans "${String(str).substring(0, 80)}"`;
      return this.assert(description, passed, details);
    },

    // Assertion numérique
    assertGreaterThan(description: string, actual: number, expected: number): boolean {
      return this.assert(description, actual > expected, `${actual} devrait être > ${expected}`);
    },

    assertLessThan(description: string, actual: number, expected: number): boolean {
      return this.assert(description, actual < expected, `${actual} devrait être < ${expected}`);
    },

    // Assertion "truthy" avec message personnalisé
    assertTrue(description: string, value: unknown): boolean {
      return this.assert(description, value, `valeur falsy: ${JSON.stringify(value)}`);
    },

    // Assertion qu'une Promise rejette
    async assertRejects(description: string, asyncFn: () => Promise<unknown>): Promise<boolean> {
      try {
        await asyncFn();
        return this.assert(description, false, 'devrait rejeter mais a résolu');
      } catch {
        return this.assert(description, true);
      }
    },

    // Résumé final
    summary(): TestSummary {
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
    get results(): TestResult[] {
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
export function httpGet(url: string | URL, headers: Record<string, string> = {}): Promise<HttpResponse> {
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
        res.on('data', (chunk: Buffer) => (body += chunk));
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
export function httpPost(url: string | URL, data: Record<string, unknown> | string = {}, headers: Record<string, string> = {}): Promise<HttpResponse> {
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
        res.on('data', (chunk: Buffer) => (body += chunk));
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
export async function measure<T>(fn: () => Promise<T>): Promise<MeasureResult<T>> {
  const start = performance.now();
  const result = await fn();
  const durationMs = Math.round(performance.now() - start);
  return { result, durationMs };
}

/**
 * Attend un certain nombre de millisecondes
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Démarre un serveur HTTP et retourne une promesse qui résout quand il écoute
 */
export function startServer(server: Server, port: number): Promise<void> {
  return new Promise((resolve) => {
    server.listen(port, () => resolve());
  });
}

/**
 * Arrête un serveur HTTP proprement
 */
export function stopServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}
