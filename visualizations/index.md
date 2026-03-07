# Visualisations interactives

5 visualisations HTML animées pour comprendre les mécanismes du caching HTTP. Ouvrez-les directement dans votre navigateur — aucune dépendance requise.

| Visualisation | Description | Module associé |
|--------------|-------------|----------------|
| [HTTP Lifecycle](./http-lifecycle.html) | Cycle de vie HTTP complet animé (DNS → TCP → TLS → Request → Response → Cache decision) | Modules 00-01 |
| [Cache Decision Tree](./cache-decision-tree.html) | Arbre de décision Cache-Control interactif (cacheable? → fresh? → revalidate? → serve stale?) | Modules 03-06 |
| [Multi-Layer Cache](./multi-layer-cache.html) | Cache multi-couches animé (Browser → CDN → Origin) avec hit/miss/stale/revalidate | Modules 07-09 |
| [SSR & Hydration](./ssr-hydration.html) | Pipeline SSR animé (Server render → HTML stream → Client parse → Hydration → Interactive) | Modules 10-11 |
| [Stale-While-Revalidate](./stale-while-revalidate.html) | Timeline SWR animée montrant le serve stale + background revalidation + cache update | Modules 05-06 |

## Comment utiliser

1. Ouvrez le fichier `.html` directement dans votre navigateur
2. Utilisez les boutons **Play**, **Pause**, **Pas-à-pas** et **Reset**
3. Lisez le panneau d'explication en bas pour comprendre chaque étape
4. Essayez les différents scénarios via le menu déroulant ou les boutons

> **Conseil** : Utilisez ces visualisations pendant que vous lisez le module théorique correspondant.
