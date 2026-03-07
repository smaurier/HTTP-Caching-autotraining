# Screencast 14 — Performance web : Core Web Vitals et Lighthouse

## Informations
- **Durée estimée** : 14-15 min
- **Module** : `modules/14-performance-web.md`
- **Lab associé** : `labs/lab-14-lighthouse-audit/`
- **Prérequis** : Screencast 04 (Cache-Control), Screencast 10 (SSR), Screencast 13 (Streaming)

## Setup
- [ ] Application web de démo avec des problèmes de performance : `labs/lab-14-lighthouse-audit/`
- [ ] Chrome DevTools ouverts (onglets Lighthouse, Performance, Network)
- [ ] Connexion internet pour tester un vrai site avec PageSpeed Insights
- [ ] Version "avant" et "après" optimisation de la même page

## Script

### [00:00-01:30] Introduction — Mesurer avant d'optimiser

> Salut ! On a passé toute cette formation à parler de cache, de SSR, de CDN, de streaming. Mais comment savoir si tout ça fonctionne réellement ? Comment mesurer l'impact de nos optimisations ? C'est le sujet d'aujourd'hui : la performance web, les Core Web Vitals, et Lighthouse.

**Action** : Afficher le slide "Module 14 — Performance Web".

> La règle numéro un de la performance : on ne peut pas améliorer ce qu'on ne mesure pas. Avant de toucher à quoi que ce soit, il faut un diagnostic. Et pour ça, Google nous donne des outils et des métriques standardisées.

### [01:30-04:30] Les Core Web Vitals — Les métriques qui comptent

> Les Core Web Vitals, ce sont les trois métriques que Google considère comme les plus importantes pour l'expérience utilisateur. Elles impactent aussi votre SEO.

**Action** : Afficher un schéma des trois métriques.

> Première métrique : LCP, Largest Contentful Paint. C'est le temps qu'il faut pour que le plus gros élément visible de la page soit affiché. Une image hero, un titre principal, un bloc de texte. Un bon LCP est en dessous de 2,5 secondes.

> Et le lien avec le cache est direct. Si votre image hero est cachée localement, le LCP est quasi instantané. Si elle doit traverser l'Atlantique, le LCP explose. Le cache CDN, le cache navigateur, les en-têtes Cache-Control — tout ce qu'on a vu impacte directement le LCP.

> Deuxième métrique : INP, Interaction to Next Paint. C'est le temps entre une interaction utilisateur (clic, tap, touche clavier) et la mise à jour visuelle qui en résulte. Un bon INP est en dessous de 200ms.

> Le cache impacte INP indirectement : si les données d'une action sont en cache (via SWR par exemple), la réponse à l'interaction est plus rapide.

> Troisième métrique : CLS, Cumulative Layout Shift. C'est la stabilité visuelle de la page. Quand des éléments bougent de manière inattendue pendant le chargement, ça crée du layout shift. Un bon CLS est en dessous de 0,1.

> Le lien avec le cache ici : si les images n'ont pas de dimensions définies et arrivent depuis le réseau (pas de cache), elles provoquent un shift en s'affichant. Avec le cache, l'image est disponible immédiatement et le shift est réduit.

### [04:30-08:00] Lighthouse — L'audit en pratique

> Passons à Lighthouse, l'outil de diagnostic intégré dans Chrome.

**Action** : Lancer le serveur du lab.

```bash
cd labs/lab-14-lighthouse-audit
node exercise.js
```

**Action** : Ouvrir Chrome, naviguer vers la page de démo, et ouvrir l'onglet Lighthouse dans DevTools.

> Je suis dans les DevTools, onglet Lighthouse. Je sélectionne "Performance" et "Desktop" pour commencer. Et je lance l'audit.

**Action** : Lancer un audit Lighthouse et attendre les résultats.

> Voilà les résultats. Un score de performance global sur 100. Et le détail des métriques : FCP, LCP, TBT (Total Blocking Time, lié à l'INP), CLS, et Speed Index.

> En dessous, Lighthouse nous donne des recommandations. "Serve images in next-gen formats", "Eliminate render-blocking resources", "Enable text compression"... Chaque recommandation a un impact estimé.

**Action** : Cliquer sur les recommandations une par une.

> Regardez cette recommandation : "Serve static assets with an efficient cache policy". Lighthouse a détecté que certaines ressources n'ont pas de Cache-Control approprié. Il nous dit exactement quels fichiers sont concernés.

```bash
# Avant optimisation
curl -I http://localhost:3000/images/hero.jpg
# Pas de Cache-Control !

# Après optimisation
curl -I http://localhost:3000/images/hero.jpg
# Cache-Control: public, max-age=31536000, immutable
```

> Et celle-ci : "Enable text compression". Le serveur n'envoie pas de gzip. C'est lié à notre sujet : la compression réduit la taille des transferts, et l'en-tête `Vary: Accept-Encoding` garantit que le cache stocke les bonnes variantes.

### [08:00-11:00] Optimisation en direct — Avant/Après

> Faisons une optimisation en direct et mesurons l'impact.

**Action** : Modifier la configuration du serveur pour ajouter les optimisations.

```javascript
// Ajout du cache sur les assets statiques
app.use('/assets', express.static('public/assets', {
  maxAge: '1y',
  immutable: true
}));

// Compression gzip
app.use(compression());

// Cache sur les images
app.use('/images', express.static('public/images', {
  maxAge: '1y',
  immutable: true
}));

// Cache-Control sur le HTML
app.get('/', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile('index.html');
});
```

**Action** : Relancer le serveur et refaire l'audit Lighthouse.

```bash
# Redémarrer le serveur avec les optimisations
node exercise-optimized.js
```

> Deuxième audit Lighthouse...

**Action** : Montrer la comparaison des scores.

> Et voilà ! Le score est passé de 62 à 91. Le LCP a baissé de 3,8s à 1,2s. Le FCP de 2,1s à 0,6s. Et la recommandation sur le cache a disparu. Les images et les assets sont maintenant correctement cachés.

> Notez que l'amélioration est encore plus flagrante au deuxième chargement, quand le cache navigateur est rempli. Lighthouse teste le premier chargement (cache vide), mais en utilisation réelle, vos utilisateurs reviennent et bénéficient du cache.

### [11:00-12:30] PageSpeed Insights et données terrain

> Lighthouse en local, c'est bien pour le développement. Mais pour les données de vrais utilisateurs, il y a PageSpeed Insights.

**Action** : Ouvrir PageSpeed Insights dans le navigateur et tester un site public.

> PageSpeed Insights combine les données de laboratoire (comme Lighthouse) et les données terrain (Field Data) collectées via le Chrome User Experience Report (CrUX). Les données terrain, c'est ce que vivent réellement vos utilisateurs.

> La différence est importante. En laboratoire, vous testez dans des conditions contrôlées. Les données terrain reflètent la diversité des appareils, des connexions, et des localisations de vos vrais utilisateurs. Un bon score lab ne garantit pas un bon score terrain.

```bash
# Vous pouvez aussi utiliser l'API PageSpeed Insights
curl "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://example.com&strategy=mobile"
```

**Action** : Montrer les métriques terrain vs lab et les différences.

> Les données terrain montrent le 75ème percentile. Ça veut dire que 75% de vos utilisateurs ont un LCP en dessous de cette valeur. C'est le seuil que Google utilise pour le SEO.

### [12:30-14:00] Checklist performance et cache

> Pour conclure, voici une checklist performance liée au cache.

**Action** : Afficher la checklist.

> Un : Assets statiques avec hash et max-age d'un an + immutable. Deux : HTML avec no-cache ou max-age court pour garantir les mises à jour. Trois : compression gzip/brotli activée avec Vary: Accept-Encoding. Quatre : images optimisées (format WebP/AVIF) avec cache long. Cinq : CDN devant votre serveur pour réduire la latence. Six : Service Worker pour le cache offline et la performance au retour.

> Sept : preload des ressources critiques. Le `<link rel="preload">` indique au navigateur de télécharger une ressource en priorité, avant même que le CSS ou le JS la demande.

```html
<!-- Preload de la police critique -->
<link rel="preload" href="/fonts/main.woff2" as="font" type="font/woff2" crossorigin>
<!-- Preload de l'image hero -->
<link rel="preload" href="/images/hero.webp" as="image">
```

> Huit : surveillez vos métriques en continu. Un déploiement peut faire régresser les performances. Mettez en place du monitoring avec des alertes sur les Core Web Vitals.

### [14:00-14:30] Récap — Mesurer, optimiser, mesurer

> Résumons. Les Core Web Vitals (LCP, INP, CLS) sont les métriques clés. Lighthouse est votre outil de diagnostic. Le cache impacte directement le LCP et le FCP. Et PageSpeed Insights donne les données de vrais utilisateurs.

**Action** : Mentionner le quiz et le lab.

> Le lab `labs/lab-14-lighthouse-audit/` vous fait auditer une application, identifier les problèmes, appliquer les optimisations de cache, et mesurer l'amélioration. C'est un exercice très concret et satisfaisant. Prochain et dernier screencast : le projet final, où on met tout ensemble. A tout de suite !

## Points d'attention pour l'enregistrement
- Lancer Lighthouse en mode incognito pour éviter les extensions qui faussent les résultats
- La comparaison avant/après doit être faite dans les mêmes conditions (même mode, même throttling)
- PageSpeed Insights nécessite une connexion internet et un site accessible publiquement
- Les scores Lighthouse varient entre les runs, faire plusieurs audits et prendre la moyenne
