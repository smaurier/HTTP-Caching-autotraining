---
titre: Performance web et Core Web Vitals — mesurer, relier au cache
cours: 11-http-caching
notions: ["Core Web Vitals", "LCP (Largest Contentful Paint)", "INP (Interaction to Next Paint)", "CLS (Cumulative Layout Shift)", "seuils good/needs-improvement/poor", "INP a remplacé FID (mars 2024)", "TTFB comme diagnostic", "field data (RUM / CrUX)", "lab data (Lighthouse)", "75e percentile", "PageSpeed Insights", "impact du cache/CDN/streaming sur chaque métrique", "resource hints", "rel=preload", "rel=preconnect", "fetchpriority", "réservation de dimensions contre le CLS"]
outcomes:
  - sait nommer les trois Core Web Vitals actuels et leurs seuils exacts (LCP, INP, CLS)
  - sait relier cache navigateur, CDN et streaming à la métrique qu'ils améliorent
  - sait mesurer une page avec Lighthouse (lab) et PageSpeed Insights/CrUX (field) et distinguer les deux
  - sait poser les resource hints utiles (preload de l'image LCP, preconnect au CDN) et réserver les dimensions contre le CLS
prerequis: [00-prerequis-et-vue-ensemble, 01-protocole-http, 02-http2-http3, 03-en-tetes-http, 04-cache-control, 05-etag-validation-conditionnelle, 06-stale-while-revalidate, 07-cache-navigateur, 08-cdn, 09-cache-multi-couches, 10-ssr, 11-isr-ssg, 12-edge-rendering, 13-http-streaming]
next: 15-pwa-service-workers
libs: []
tribuzen: page publique d'une sortie TribuZen — mesurer LCP/INP/CLS, précharger l'avatar hero servi par le CDN, réserver les dimensions des images pour un CLS nul
last-reviewed: 2026-07
---

# Performance web et Core Web Vitals — mesurer, relier au cache

> **Outcomes — tu sauras FAIRE :** nommer les trois Core Web Vitals et leurs seuils, relier chaque technique de cache/CDN/streaming vue dans ce cours à la métrique qu'elle améliore, mesurer une page avec Lighthouse et PageSpeed Insights, poser les resource hints utiles.
> **Difficulté :** :star::star::star:
>
> **Portée :** ce module couvre **uniquement** la **performance web côté chargement/interaction** mesurée par les **Core Web Vitals**, et **comment le cache, le CDN et le streaming vus dans les modules 04→13 déplacent ces métriques**. Il **ne réintroduit pas** le fonctionnement du cache (modules 04-09), du SSR/ISR/edge (10-12) ni du streaming (13) : il les **relie** à la mesure. L'optimisation du bundle JavaScript, du CSS ou du rendu framework (tree-shaking, code-splitting, images responsives) relève des cours de front (Vue, build). Ici : **quelles métriques, quels seuils, comment les lire, ce que le cache y change.**

## 1. Cas concret d'abord

TribuZen a mis en ligne la page publique d'une sortie (`/sorties/pique-nique-juin`, celle du module 10). Elle est en SSR + cache CDN, tout marche « chez toi ». Puis le rapport **Google Search Console** arrive : la page est signalée **« à améliorer »** sur mobile. Trois chiffres, mesurés sur de **vrais utilisateurs** (pas ta machine) :

```
Champs (field data, 28 derniers jours, mobile, 75e percentile)
────────────────────────────────────────────────────────────
LCP   3,8 s   ❌ poor         (seuil bon : ≤ 2,5 s)
INP   240 ms  ⚠️ à améliorer  (seuil bon : ≤ 200 ms)
CLS   0,22    ⚠️ à améliorer  (seuil bon : ≤ 0,1)
```

Tu ouvres la page, tu la trouves « rapide ». Le problème : **ta mesure n'est pas la leur.** Toi = Wi-Fi fibre, cache chaud, top CPU. Eux = 4G, cache froid, mobile bas de gamme. Trois questions concrètes, auxquelles ce module répond :

1. **LCP à 3,8 s** — quel est l'élément « LCP » ici, et pourquoi le CDN qui sert déjà l'avatar hero ne suffit-il pas ? (réponse : il faut le **précharger**, §2.6).
2. **CLS à 0,22** — qu'est-ce qui **bouge** au chargement ? (réponse : l'avatar hero sans `width`/`height` **pousse** le texte quand il arrive, §2.5).
3. **Où lire ces chiffres, et pourquoi diffèrent-ils de ton Lighthouse local à 98/100 ?** (réponse : **field data** vs **lab data**, §2.4).

Aucune de ces réponses n'est « ajoute du cache ». Le cache que tu maîtrises déjà (modules 04-13) agit sur certaines métriques et **pas d'autres** — savoir lesquelles est le cœur de ce module.

---

## 2. Théorie complète, concise

### 2.1 Ce qu'on mesure : trois Core Web Vitals + un diagnostic

Les **Core Web Vitals (CWV)** sont les trois métriques que Google retient pour l'expérience réelle et utilise comme signal SEO. Depuis 2024, ce sont **LCP, INP, CLS** — une par grande sensation de l'utilisateur :

| Métrique | Question posée | Sensation utilisateur |
|---|---|---|
| **LCP** — Largest Contentful Paint | « Quand le contenu principal est-il **affiché** ? » | vitesse de chargement perçue |
| **INP** — Interaction to Next Paint | « Quand je clique/tape, l'écran **répond-il** vite ? » | réactivité |
| **CLS** — Cumulative Layout Shift | « Est-ce que le contenu **saute** pendant que ça charge ? » | stabilité visuelle |

Le **TTFB** (Time To First Byte, module 10) **n'est pas** un Core Web Vital : c'est une métrique **de diagnostic** en amont. Un mauvais TTFB plombe le LCP (rien ne peut s'afficher avant le premier octet), mais un bon TTFB ne garantit pas un bon LCP. On l'utilise pour **expliquer** un LCP, pas pour le remplacer.

### 2.2 Les seuils exacts (à connaître par cœur)

Chaque métrique a trois zones. La frontière **bon / à améliorer** et **à améliorer / mauvais** :

| Métrique | 🟢 Bon | 🟠 À améliorer | 🔴 Mauvais | Unité |
|---|---|---|---|---|
| **LCP** | **≤ 2,5 s** | 2,5 – 4,0 s | **> 4,0 s** | secondes |
| **INP** | **≤ 200 ms** | 200 – 500 ms | **> 500 ms** | millisecondes |
| **CLS** | **≤ 0,1** | 0,1 – 0,25 | **> 0,25** | score sans unité |

Diagnostic associé (pas un CWV) :

| Métrique | 🟢 Bon | 🔴 Mauvais |
|---|---|---|
| **TTFB** | ≤ 800 ms | > 1 800 ms |

Ces seuils sont ceux de web.dev. Retiens le trio : **LCP 2,5 s — INP 200 ms — CLS 0,1**. C'est la cible « verte ».

### 2.3 INP a remplacé FID (mars 2024)

Beaucoup de contenus en ligne parlent encore du **FID (First Input Delay)**. **FID est retiré** : depuis **mars 2024**, le Core Web Vital de réactivité est l'**INP**. La différence est importante :

- **FID** ne mesurait que le **délai avant traitement** de la **première** interaction. Facile à passer, peu représentatif.
- **INP** mesure la **latence complète** (délai + traitement + peinture) de **toutes** les interactions de la visite, et retient ~la pire. Beaucoup plus exigeant, et plus fidèle au ressenti.

```
INP d'une interaction = délai d'entrée + temps de traitement + délai de peinture
  clic ─▶ [main thread occupé] ─▶ [handler] ─▶ [layout+paint] ─▶ écran mis à jour
         └──────────────────────── INP ─────────────────────────┘
```

**Conséquence pour toi :** si une source dit « FID », elle est **datée**. Raisonne INP.

### 2.4 Deux façons de mesurer : field (RUM) vs lab

C'est LA distinction du module. Les chiffres du §1 (Search Console) et ton Lighthouse local ne mesurent **pas la même chose** :

| | **Field data** (RUM) | **Lab data** |
|---|---|---|
| Source | vrais utilisateurs, vraies conditions | une exécution contrôlée, ta machine ou un data-center |
| Outils | **CrUX** (Chrome UX Report), **PageSpeed Insights** (bloc « Découvrez… utilisateurs réels »), Search Console, l'API `web-vitals` | **Lighthouse** (onglet DevTools), PageSpeed Insights (bloc « Diagnostiquer »), WebPageTest |
| Agrégation | **75e percentile** sur 28 jours | une seule mesure |
| INP mesurable ? | **oui** (interactions réelles) | **non directement** (pas d'utilisateur qui clique) → Lighthouse donne le **TBT** comme proxy |
| Verdict SEO Google | **oui** (c'est CrUX qui compte) | non |

Points cruciaux :

- **Le 75e percentile** : Google prend la valeur telle que **75 % des visites font mieux**. Optimiser la médiane ne suffit pas ; c'est la **queue lente** (mobiles modestes, réseau faible) qui décide.
- **Lighthouse ne peut pas mesurer l'INP** : personne ne clique pendant l'audit. Il affiche le **TBT (Total Blocking Time)** comme indicateur de remplacement en lab. Pour un vrai INP, il faut du **field**.
- Ton « 98/100 Lighthouse » local est du **lab** dans des conditions idéales. Le « à améliorer » de Search Console est du **field** au 75e percentile. **Les deux peuvent être vrais en même temps.** La vérité SEO est le field.

### 2.5 CLS : réserver la place (le cache n'y peut presque rien)

Le CLS additionne les **décalages inattendus** de mise en page pendant le chargement. Cause n°1 en pratique : une **image ou une pub sans dimensions réservées**. Quand l'élément arrive, il **pousse** le contenu déjà affiché.

```
Sans réservation (mauvais CLS)      Avec width/height (CLS = 0)
┌───────────────┐                   ┌───────────────┐
│ [titre]       │                   │ [titre]       │
│ [texte] ◀ ici │  l'image arrive   │ [zone image]  │ ◀ place réservée
└───────────────┘  et POUSSE ▼      │ [texte]       │   le texte ne bouge pas
        ▼                           └───────────────┘
┌───────────────┐
│ [image tardive]│
│ [titre] décalé │  ◀ saut = CLS
│ [texte] décalé │
└───────────────┘
```

Corrections (aucune n'est « du cache ») :
- **Toujours** mettre `width` et `height` (ou `aspect-ratio` CSS) sur les `<img>`/`<video>` → le navigateur réserve la boîte avant même de télécharger le fichier.
- Réserver la place des bannières/embeds insérés dynamiquement.
- Précharger la police (`rel="preload" as="font" crossorigin`) pour éviter le **re-flow** au swap de police.

**Nuance cache :** un **fichier en cache arrive plus vite**, donc « moins tard », ce qui **réduit la fenêtre** de saut — mais si les dimensions ne sont pas réservées, le saut reste possible. **Le CLS se règle par le HTML/CSS, pas par le `Cache-Control`.**

### 2.6 Resource hints : preload et preconnect (le levier LCP)

Le CDN sert déjà l'avatar hero **vite** (module 08) — mais le navigateur ne **découvre** cette image qu'**après** avoir parsé le HTML puis le CSS. Le **resource hint** dit au navigateur de commencer **plus tôt**.

**`rel="preload"`** — télécharge une ressource critique **en priorité**, avant que le parseur ne l'atteigne. C'est le levier direct du **LCP** quand l'élément LCP est une image :

```html
<!-- Précharge l'image hero (candidate LCP) — démarre le download immédiatement -->
<link rel="preload" href="https://cdn.tribuzen.app/hero/pique-nique.avif"
      as="image" type="image/avif" fetchpriority="high">
```

- `as` **obligatoire** : indique le type (`image`, `style`, `script`, `font`, `fetch`…) → bonne priorité, bon cache, bon en-tête `Accept`.
- `fetchpriority="high"` : monte encore la priorité de l'image LCP (par défaut les images sont en priorité basse).
- Pour une **police** : `as="font"` **et** `crossorigin` obligatoire (les fonts sont chargées en mode CORS anonyme, même en same-origin) :
  ```html
  <link rel="preload" href="/fonts/inter.woff2" as="font" type="font/woff2" crossorigin>
  ```

**`rel="preconnect"`** — ouvre **à l'avance** la connexion (DNS + TCP + TLS) vers une **origine tierce** dont tu vas avoir besoin (ton CDN d'avatars sur un autre domaine, une police Google). Ça élimine le coût de handshake du chemin critique :

```html
<link rel="preconnect" href="https://cdn.tribuzen.app" crossorigin>
```

Voisins (à distinguer, ne pas confondre) :

| Hint | Fait quoi | Quand |
|---|---|---|
| `preconnect` | DNS + TCP + TLS d'avance vers une origine | tu vas **sûrement** charger depuis ce domaine tôt |
| `dns-prefetch` | DNS seul (plus léger, moins puissant) | fallback / domaines moins critiques |
| `preload` | **télécharge** une ressource précise en priorité | ressource critique de **cette** page (image LCP, police) |
| `prefetch` | télécharge en **basse** priorité pour une **navigation future** | la page **suivante** probable |

**Règle d'or :** ne précharge **que** le petit nombre de ressources vraiment critiques (typiquement l'image LCP + la police du titre). Tout précharger revient à ne rien prioriser.

### 2.7 La grille qui relie ce cours entier à chaque métrique

C'est la synthèse du module : **ce que chaque technique déjà apprise fait — et ne fait pas — sur les CWV.**

| Technique (module) | LCP | INP | CLS | Pourquoi |
|---|---|---|---|---|
| **Cache navigateur** (07) | ⬇️ fort au retour | ⬇️ (JS/CSS déjà en cache = parse plus tôt) | neutre | ressources locales, 0 réseau à la 2e visite |
| **CDN** (08) | ⬇️ (asset servi près de l'utilisateur) | neutre | neutre | réduit la distance/latence, baisse le TTFB → LCP |
| **`Cache-Control immutable` + hash** (04) | ⬇️ au retour | ⬇️ | neutre | JS/CSS jamais re-téléchargés ni revalidés |
| **SSR + cache de rendu** (10) | ⬇️ (contenu dans le 1er octet, TTFB bas) | neutre | neutre | LCP peint avant le JS |
| **ISR/SSG** (11) | ⬇️⬇️ (HTML pré-rendu, TTFB minimal) | neutre | neutre | zéro rendu à la requête |
| **Edge rendering** (12) | ⬇️ (rendu proche de l'utilisateur) | neutre | neutre | TTFB plus bas géographiquement |
| **HTTP streaming / Suspense** (13) | ⬇️ (shell + LCP tôt, reste en flux) | neutre | ⚠️ risque si le contenu injecté n'a pas de place réservée | premier octet utile plus tôt |
| **`preload` image LCP** (ce module) | ⬇️⬇️⬇️ | neutre | neutre | découverte anticipée de l'élément LCP |
| **`width`/`height` sur images** (ce module) | neutre | neutre | ⬇️⬇️⬇️ | réserve la boîte → pas de saut |

Deux enseignements à emporter :
- **Le cache et le CDN attaquent surtout le LCP** (via le TTFB et le temps de chargement des assets). Ils sont **quasi sans effet sur l'INP** (qui dépend du **travail JavaScript** sur le main thread) et **sur le CLS** (qui dépend de la **réservation de place** en HTML/CSS).
- Pour **INP** et **CLS**, le levier n'est pas dans ce cours HTTP : c'est le **code front** (moins de JS bloquant, dimensions réservées). Savoir **qu'un cache n'y changera rien** t'évite d'optimiser au mauvais endroit.

---

## 3. Worked examples

### Exemple 1 — Diagnostiquer les 3 chiffres du §1 et poser les bons correctifs

On reprend la page de sortie TribuZen : LCP 3,8 s, INP 240 ms, CLS 0,22. Démarche, métrique par métrique.

**LCP 3,8 s (mauvais).** On ouvre Lighthouse → l'audit indique l'élément LCP : l'**avatar hero** `hero/pique-nique.avif`. Il est déjà servi par le CDN, mais **découvert tard** (après HTML + CSS). Correctif : le **précharger** et le prioriser.

```html
<!-- Dans le <head> du HTML SSR de la page de sortie -->
<link rel="preconnect" href="https://cdn.tribuzen.app" crossorigin>
<link rel="preload" href="https://cdn.tribuzen.app/hero/pique-nique.avif"
      as="image" type="image/avif" fetchpriority="high">
```

Effet attendu : l'image démarre son download **dès la réception du HTML**, en parallèle du CSS, à haute priorité → LCP qui passe sous les 2,5 s. **Le CDN ne suffisait pas** parce qu'il rend le fichier *rapide à servir*, pas *découvert tôt*.

**CLS 0,22 (à améliorer).** L'avatar hero n'a **pas** de dimensions → quand il arrive, il pousse le titre et le texte. Correctif : réserver la boîte.

```html
<!-- ❌ avant : l'image arrive et POUSSE le contenu -->
<img src="https://cdn.tribuzen.app/hero/pique-nique.avif" alt="Pique-nique">

<!-- ✅ après : width/height réservent la place → 0 saut -->
<img src="https://cdn.tribuzen.app/hero/pique-nique.avif" alt="Pique-nique"
     width="1200" height="630">
```

Effet : le navigateur calcule la boîte (ratio 1200×630) **avant** le téléchargement → le texte ne bouge plus, CLS → ~0. Noter qu'**aucun changement de `Cache-Control`** n'aurait réglé ça.

**INP 240 ms (à améliorer).** Rien dans le cache HTTP ne l'améliorera. L'INP se règle côté JavaScript (moins de travail sur le main thread au clic « Je participe »). On le **mesure** en field (le clic réel), on l'**optimise** dans le cours front. Ici on **constate** que ce n'est **pas** un problème de caching — et c'est une conclusion valable.

**Bilan :** deux des trois problèmes (LCP, CLS) se règlent avec des balises `<head>`/`<img>` de **ce** module ; le troisième (INP) est explicitement **hors** du levier cache. Savoir trier, c'est l'objectif.

### Exemple 2 — Lire une page réelle : Lighthouse (lab) puis PageSpeed Insights (field)

But : mesurer la **même** page des deux façons et comprendre l'écart.

1. **Lab — Lighthouse dans DevTools.** Chrome → F12 → onglet **Lighthouse** → catégorie *Performance*, appareil *Mobile* → *Analyze page load*. On lit :
   - **LCP** et **CLS** : mesurés directement (chiffres verts/orange/rouges).
   - **INP** : **absent** de la mesure directe → Lighthouse affiche le **TBT** comme proxy.
   - L'onglet **Élément LCP** et les **opportunités** (« Preload Largest Contentful Paint image », « Serve static assets with an efficient cache policy ») pointent les correctifs — dont, en boucle, ceux du cours.

2. **Field — PageSpeed Insights.** Aller sur `pagespeed.web.dev`, coller l'URL. Deux blocs distincts :
   - En haut, **« Découvrez ce que vivent vos utilisateurs réels »** → données **CrUX** (field, 75e percentile, 28 jours) : **LCP, INP, CLS réels**. C'est ce que Google utilise pour le SEO.
   - En dessous, **« Diagnostiquer les problèmes de performances »** → un **Lighthouse** exécuté côté Google (lab).

Interprétation : si le bloc field est vert mais le lab orange (ou l'inverse), **le field prime** pour le SEO et le ressenti. Le lab sert à **reproduire et déboguer** (il donne l'élément LCP, les opportunités), pas à juger. C'est exactement la situation du §1 : Lighthouse local flatteur, field Search Console sévère → **on croit le field, on débogue avec le lab.**

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Croire que « mettre du cache » améliore tous les Core Web Vitals

```
❌ "La page est lente sur les 3 métriques → on ajoute/renforce le cache."
```

Le cache HTTP et le CDN agissent surtout sur le **LCP** (via TTFB et temps de chargement des assets). Ils sont **quasi sans effet sur l'INP** (travail JS sur le main thread) et **sur le CLS** (réservation de place). Renforcer le cache pour corriger un INP/CLS, c'est optimiser au mauvais endroit.

```
✅ LCP → cache/CDN/preload ; INP → moins de JS bloquant (cours front) ; CLS → width/height + place réservée.
```

**Règle :** identifie la métrique **avant** de choisir le levier. Une métrique, un levier.

### PIÈGE #2 — Juger la performance sur son Lighthouse local

```
❌ "Lighthouse me met 98/100, la page est parfaite."
```

Ton Lighthouse local est du **lab** dans des conditions idéales (ton CPU, ton réseau, cache chaud). Google juge le SEO sur le **field (CrUX, 75e percentile)** : de vrais mobiles, de vrais réseaux, cache froid. Les deux peuvent diverger tout en étant justes.

```
✅ Mesure aussi en field (PageSpeed « utilisateurs réels » / Search Console). Le field décide, le lab débogue.
```

**Règle :** un bon score lab ne prouve rien sur le terrain. Vérifie le **75e percentile field** avant de conclure.

### PIÈGE #3 — Raisonner encore avec le FID

```
❌ "Le FID est bon, la réactivité est OK."
```

**FID est retiré depuis mars 2024.** Il ne mesurait que le délai de la **première** interaction (facile à passer). Le CWV de réactivité est désormais l'**INP**, qui mesure **toutes** les interactions, latence complète — bien plus exigeant.

```
✅ Cible INP ≤ 200 ms. Toute source qui parle de FID est datée.
```

**Règle :** réactivité = **INP**, plus jamais FID.

### PIÈGE #4 — Précharger tout et n'importe quoi

```html
❌ <link rel="preload" href="/a.js" as="script">
   <link rel="preload" href="/b.js" as="script">
   <link rel="preload" href="/c.png" as="image">   <!-- + 15 autres -->
```

Le `preload` est une **priorité relative**. Si tout est prioritaire, plus rien ne l'est : tu retardes justement l'image LCP en la mettant en concurrence avec 15 ressources non critiques.

```html
✅ <link rel="preload" href="/hero.avif" as="image" fetchpriority="high">  <!-- l'élément LCP -->
✅ <link rel="preload" href="/inter.woff2" as="font" crossorigin>          <!-- la police du titre -->
```

**Règle :** précharge **le** (peu de) chemin critique — image LCP et police. Rien d'autre par défaut.

### PIÈGE #5 — Oublier `crossorigin` sur le preload de police

```html
❌ <link rel="preload" href="/inter.woff2" as="font" type="font/woff2">
```

Les polices sont **toujours** chargées en mode CORS anonyme (spec CSS Fonts), **même en same-origin**. Sans `crossorigin`, le preload et la requête réelle de la police **ne correspondent pas** → le fichier est **téléchargé deux fois**, et le preload n'a servi à rien (et peut aggraver le CLS via le re-flow).

```html
✅ <link rel="preload" href="/inter.woff2" as="font" type="font/woff2" crossorigin>
```

**Règle :** `as="font"` implique **toujours** `crossorigin`. Vérifie-le systématiquement.

### PIÈGE #6 — Confondre TTFB et LCP

```
❌ "Mon TTFB est excellent (150 ms), donc mon LCP est bon."
```

Le TTFB est le **point de départ**, pas l'arrivée. Après le premier octet il reste : télécharger le HTML, le CSS, **découvrir et charger l'image LCP**, peindre. Un TTFB de 150 ms avec une image LCP découverte tard et non préchargée donne un LCP à 3,8 s (le §1 !).

```
✅ TTFB bas est nécessaire mais pas suffisant. LCP = TTFB + chargement/rendu de l'élément le plus grand.
```

**Règle :** le TTFB **explique** le LCP, il ne le **remplace** pas.

---

## 5. Ancrage TribuZen

La page publique d'une sortie (le SSR du module 10) est aussi le terrain de mesure de perf de TribuZen. Objectif produit : **les 3 CWV au vert au 75e percentile mobile**.

| Élément de la page | Métrique visée | Levier (module) |
|---|---|---|
| Avatar hero de la sortie (`cdn.tribuzen.app`) | **LCP** | `preconnect` au CDN + `preload as=image fetchpriority=high` (ce module) |
| Corps SSR (titre, date, lieu) | **LCP** / TTFB | SSR + cache de rendu `s-maxage=300` (module 10) |
| Assets JS/CSS hashés | LCP au retour | `Cache-Control: immutable` (module 04) + cache navigateur (07) |
| Images de la galerie | **CLS** | `width`/`height` réservés sur chaque `<img>` (ce module) |
| Police du titre | **CLS** | `preload as=font crossorigin` (ce module) |
| Bouton « Je participe » | **INP** | **hors cours HTTP** → optimisation JS côté front |

Décisions d'architecture :
- **On mesure en field, pas seulement en lab.** TribuZen embarque la librairie `web-vitals` qui envoie LCP/INP/CLS réels à un endpoint d'analytics, et on surveille le rapport CrUX/Search Console. Le Lighthouse de CI sert à **détecter les régressions de structure** (image LCP non préchargée, `<img>` sans dimensions), pas à valider le SEO.
- **Le `<head>` de la page de sortie** porte le `preconnect` CDN + le `preload` de l'avatar hero + le `preload` de la police du titre. Rien d'autre n'est préchargé.
- **Toutes les `<img>`** du produit ont `width`/`height` (règle de lint) → CLS structurellement nul.
- **On accepte** que l'INP se joue ailleurs : aucun ticket « ajouter du cache pour l'INP » n'est ouvert ; l'INP est un ticket **front**.

Fichiers cibles dans `smaurier/tribuzen` :
```
tribuzen/
  ssr/src/render/head.ts            # preconnect CDN + preload avatar LCP + preload police
  src/lib/web-vitals-report.ts      # envoi field LCP/INP/CLS -> analytics (RUM)
  .lighthouserc.json                # budgets CI : LCP, CLS, "uses-rel-preload", "unsized-images"
```

---

## 6. Points clés

1. Les trois **Core Web Vitals** actuels sont **LCP, INP, CLS** ; le **TTFB** est un **diagnostic**, pas un CWV.
2. Seuils « bon » à connaître par cœur : **LCP ≤ 2,5 s**, **INP ≤ 200 ms**, **CLS ≤ 0,1** (au 75e percentile).
3. **INP a remplacé FID en mars 2024** : il mesure **toutes** les interactions, latence complète — toute source parlant de FID est datée.
4. **Field (CrUX/PageSpeed « utilisateurs réels »/Search Console)** décide du SEO au **75e percentile** ; **lab (Lighthouse)** sert à déboguer et ne peut **pas** mesurer l'INP (il donne le TBT).
5. **Cache et CDN attaquent surtout le LCP** (via TTFB et chargement d'assets) ; ils sont **quasi sans effet sur INP et CLS**.
6. **INP** se règle côté **JavaScript** (main thread), **CLS** se règle par la **réservation de dimensions** (`width`/`height`, place réservée) — pas par le `Cache-Control`.
7. `preload` de l'image LCP (`as="image" fetchpriority="high"`) + `preconnect` au CDN = leviers directs du LCP ; **ne précharger que le chemin critique**.
8. Preload de **police** = **toujours** `as="font"` **et** `crossorigin`, sinon double téléchargement.

---

## 7. Seeds Anki

```
Quels sont les 3 Core Web Vitals actuels et leurs seuils « bon » ?|LCP (Largest Contentful Paint) ≤ 2,5 s, INP (Interaction to Next Paint) ≤ 200 ms, CLS (Cumulative Layout Shift) ≤ 0,1 — mesurés au 75e percentile. Le TTFB n'est PAS un CWV : c'est un diagnostic (bon ≤ 800 ms).
Qu'est-ce qui a remplacé le FID, et quand ? En quoi est-ce plus strict ?|L'INP a remplacé le FID en mars 2024. Le FID ne mesurait que le délai de la 1re interaction ; l'INP mesure la latence complète (délai + traitement + peinture) de TOUTES les interactions et retient ~la pire. Toute source parlant de FID est datée.
Différence entre field data et lab data pour les Web Vitals ?|Field (RUM) = vrais utilisateurs, vraies conditions, agrégé au 75e percentile sur 28 jours (CrUX, PageSpeed « utilisateurs réels », Search Console) → c'est ce que Google utilise pour le SEO, et le seul qui mesure l'INP. Lab = une exécution contrôlée (Lighthouse) pour déboguer ; il ne mesure pas l'INP (il donne le TBT).
Sur quelles métriques le cache HTTP / le CDN agissent-ils, et sur lesquelles non ?|Surtout LCP (via TTFB bas et chargement rapide des assets), un peu l'INP au retour (JS déjà en cache = parse plus tôt). Quasi AUCUN effet sur le CLS (réservation de place, HTML/CSS) ni sur le fond de l'INP (travail JS sur le main thread). INP → optimisation JS ; CLS → width/height.
Comment corriger un LCP trop élevé quand l'image hero est déjà servie par le CDN ?|La précharger : <link rel="preload" as="image" fetchpriority="high"> (+ preconnect à l'origine du CDN). Le CDN rend l'image rapide à SERVIR mais elle est DÉCOUVERTE tard (après HTML+CSS). Le preload la fait démarrer dès la réception du HTML, à haute priorité.
Comment corriger un CLS causé par une image, et pourquoi le cache n'aide pas ?|Mettre width/height (ou aspect-ratio) sur l'<img> : le navigateur réserve la boîte avant le téléchargement → le contenu ne saute plus. Le cache fait arriver l'image plus tôt mais ne réserve pas la place : sans dimensions, le saut reste possible. Le CLS se règle en HTML/CSS.
Pourquoi un preload de police doit-il toujours avoir crossorigin ?|Les polices sont chargées en mode CORS anonyme (spec CSS Fonts), même en same-origin. Sans crossorigin, le preload ne correspond pas à la requête réelle → la police est téléchargée deux fois et le preload ne sert à rien.
Un bon TTFB garantit-il un bon LCP ?|Non. Le TTFB est le point de départ ; après lui il reste à charger HTML+CSS, découvrir et charger l'élément LCP, puis peindre. LCP = TTFB + chargement/rendu du plus grand élément. Le TTFB explique le LCP, il ne le remplace pas.
```

---

## Pont vers le lab

> Lab associé : `11-http-caching/labs/lab-14-performance-web/README.md`. Auditer une **vraie** page (la tienne en local + un site public) avec **Lighthouse dans DevTools** puis **PageSpeed Insights** : lire LCP/INP/CLS, identifier l'élément LCP, opposer field et lab, puis appliquer `preload`/`preconnect` et `width`/`height` et re-mesurer le gain.
