# HTTP & Caching — Maîtriser le protocole et le cache web

Formation complète sur HTTP et le caching web : du protocole aux architectures cache multi-couches (débutant → expert).

**Ce cours couvre tout le spectre** : le protocole HTTP, les headers, Cache-Control, ETag, CDN, SSR, ISR, edge rendering, streaming, et la performance web.

## Prérequis

- JavaScript courant (ES2020+, async/await, Promises)
- Notions de base en développement web (HTML, CSS, JS)
- Node.js 20+ installé
- Chrome DevTools (onglet Network)

## Structure

```
modules/     → 16 cours théoriques (Markdown)
labs/        → 15 labs pratiques exécutables (Node.js)
quizzes/     → 16 quizzes interactifs (HTML)
visualizations/ → 5 visualisations animées (HTML)
screencasts/ → 16 scripts de screencast (Markdown)
```

## Programme

| # | Module | Lab | Thème |
|---|--------|-----|-------|
| 00 | Prérequis & Vue d'ensemble | — | Introduction |
| 01 | Le protocole HTTP en profondeur | HTTP Inspector | Protocole |
| 02 | HTTP/2 & HTTP/3 | HTTP/2 Multiplexing | Protocole |
| 03 | Les en-têtes HTTP | Cache-Control Lab | Headers |
| 04 | Cache-Control — Le chef d'orchestre | ETag Conditional | Cache |
| 05 | ETag & Validation conditionnelle | SWR Implementation | Cache |
| 06 | Stale-While-Revalidate & stratégies | Cache Strategies | Cache |
| 07 | Cache navigateur | Mini CDN | Browser |
| 08 | CDN | Reverse Proxy Cache | Infra |
| 09 | Cache multi-couches | Multi-Layer Cache | Infra |
| 10 | SSR | SSR from Scratch | Rendering |
| 11 | ISR & SSG | ISR Implementation | Rendering |
| 12 | Edge Rendering | Edge Middleware | Rendering |
| 13 | HTTP Streaming | Streaming Responses | Streaming |
| 14 | Performance Web | Performance Audit | Performance |
| 15 | Projet final | Full Architecture | Synthèse |

## Exécution des labs

```bash
# Exécuter un lab
node labs/lab-01-http-inspector/exercise.js

# Comparer avec la solution
node labs/lab-01-http-inspector/solution.js

# Lab progressif (SWR en 3 étapes)
node labs/lab-05-swr-implementation/exercise-step1.js
node labs/lab-05-swr-implementation/exercise-step2.js
node labs/lab-05-swr-implementation/exercise-step3.js
```

## Durée estimée

~48h (16 modules : 1 module d'introduction + 15 modules × ~3h : lecture + lab + défi)

## Objectifs de sortie

À la fin de ce cursus, tu es capable de :
- Expliquer le protocole HTTP en détail (méthodes, status codes, headers, HTTP/2, HTTP/3)
- Configurer Cache-Control correctement pour chaque type de ressource
- Implémenter ETag et la validation conditionnelle (304 Not Modified)
- Comprendre et utiliser stale-while-revalidate et les stratégies de cache
- Concevoir une architecture cache multi-couches (Browser → CDN → Reverse Proxy → App)
- Implémenter du SSR avec streaming et hydration
- Comprendre ISR, SSG et le edge rendering
- Mesurer et optimiser les Core Web Vitals (TTFB, LCP, INP, CLS)
- Mener un audit de performance complet et concevoir l'architecture cache adaptée

## Niveau

**Débutant → Expert.** Ce cours part des bases HTTP et progresse jusqu'aux architectures cache avancées et au rendering au edge.
