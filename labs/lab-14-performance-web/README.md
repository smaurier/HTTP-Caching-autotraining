# Lab 14 — Auditer les Core Web Vitals (Lighthouse + PageSpeed Insights)

> **Outcome :** à la fin, tu sais **mesurer** LCP/INP/CLS sur une vraie page (avec **Lighthouse dans les DevTools** et **PageSpeed Insights**), **distinguer field et lab**, **identifier l'élément LCP** et la cause d'un CLS, puis **appliquer** `preload`/`preconnect` + `width`/`height` et **re-mesurer le gain**.
> **Vrai outil :** **Chrome DevTools → onglet Lighthouse** (lab) + **`pagespeed.web.dev`** (field CrUX + lab) sur un **vrai site public**, et une **petite page HTML servie en local** que tu modifies. Aucun harnais simulé, aucune assertion automatique.
> **Feedback :** le coach valide en session à partir de **ce que tu observes** (captures des scores, élément LCP, chiffres avant/après) — pas de test-runner auto-correcteur.

---

## Énoncé

Tu joues le rôle du dev TribuZen qui reçoit le rapport « à améliorer » du module 14. Tu vas d'abord **apprendre à lire** les métriques sur une page que tu contrôles, puis **corriger** LCP et CLS et **prouver** le gain. Trois parties.

### Partie A — Mesurer une page volontairement imparfaite (lab)

On te fournit une page HTML avec **deux défauts installés exprès** : l'image hero (candidate LCP) **n'est pas préchargée** et **n'a pas de dimensions** (→ CLS). Tu la sers en local et tu la mesures.

Starter — crée le dossier et le fichier, puis sers-le :

```bash
mkdir tribuzen-perf-lab && cd tribuzen-perf-lab
# sers le dossier en statique (choisis l'un) :
npx serve .            # → http://localhost:3000
# ou : python -m http.server 3000
```

```html
<!-- index.html — page AVANT (2 défauts installés) -->
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pique-nique de juin — TribuZen</title>
  <!-- DÉFAUT 1 : aucun preconnect / preload de l'image hero (candidate LCP) -->
  <style>
    body { font-family: system-ui; max-width: 720px; margin: 0 auto; padding: 1rem; }
    .hero { width: 100%; }               /* pas de hauteur réservée */
    p { line-height: 1.6; }
  </style>
</head>
<body>
  <h1>Pique-nique de juin</h1>
  <!-- DÉFAUT 2 : <img> SANS width/height → pousse le texte quand elle arrive (CLS) -->
  <img class="hero"
       src="https://picsum.photos/1200/630"
       alt="Pique-nique au parc">
  <p>Rendez-vous le 21 juin au Parc de la Tête d'Or. Amenez de quoi partager,
     TribuZen s'occupe du reste. Cette page publique doit être rapide et stable
     pour bien remonter dans Google et donner un bel aperçu sur les réseaux.</p>
  <p>Le contenu ci-dessus est volontairement long pour rendre le décalage de
     mise en page visible quand l'image hero arrive en retard.</p>
</body>
</html>
```

> `https://picsum.photos/1200/630` renvoie une vraie image distante (utile pour voir le CLS et le chargement réseau). Si tu es hors ligne, remplace par une image locale **de gros poids** dans le même dossier.

Ce que tu dois **produire** (observations, pas du code) :

1. **Lighthouse (lab).** DevTools (F12) → onglet **Lighthouse** → *Performance*, appareil **Mobile**, *Analyze page load*. Relève : score Performance, **LCP**, **CLS**, et le **TBT** (proxy INP en lab). Ouvre la section **« Largest Contentful Paint element »** → **quel élément** est le LCP ?
2. **Cause du CLS.** Dans le rapport, ouvre **« Avoid large layout shifts »** : quel élément décale la page ? (attendu : l'`<img>` sans dimensions).
3. **Pourquoi Lighthouse n'affiche-t-il pas d'INP** ? Écris la réponse en une phrase.

### Partie B — Field vs lab sur un vrai site public

1. Va sur **`pagespeed.web.dev`**, entre l'URL d'un **vrai site public** de ton choix (un site connu, avec du trafic → il aura des données CrUX).
2. Repère les **deux blocs** :
   - **« Découvrez ce que vivent vos utilisateurs réels »** = **field** (CrUX, 75e percentile, 28 j) → note LCP/**INP**/CLS.
   - **« Diagnostiquer les problèmes de performances »** = **lab** (Lighthouse côté Google).
3. **Question de tri :** le field et le lab donnent-ils le **même** verdict ? Lequel compte pour le **SEO** ? Lequel te donne l'**élément LCP** et les **opportunités** ? (Réponds en 2-3 lignes.)

### Partie C — Corriger et prouver le gain (lab, avant/après)

Reprends `index.html` et applique **exactement** les deux correctifs du module :

1. **LCP** — dans le `<head>`, ajoute le `preconnect` à l'origine de l'image + le `preload` de l'image hero en `fetchpriority="high"`.
2. **CLS** — donne à l'`<img>` hero des attributs `width="1200"` et `height="630"` (et en CSS `height: auto` pour garder le ratio responsive).
3. **Re-mesure** avec Lighthouse (mêmes réglages Mobile) et **compare** LCP + CLS avant/après.

**Contraintes :**
- Tu écris/édites la page **toi-même** — pas de gap-fill.
- Tu **n'ajoutes ni ne touches aucun `Cache-Control`** : ce lab prouve que **LCP et CLS se règlent en HTML**, pas par le cache (rappel §2.7 / piège #1 du module).
- Tu dois **justifier oralement** : pourquoi le CDN qui sert l'image ne suffisait pas au LCP, et pourquoi le cache n'aurait pas réglé le CLS.

---

## Étapes (en friction)

1. **Sers la page AVANT** et lance Lighthouse Mobile. Note les 4 chiffres (Perf, LCP, CLS, TBT) et **l'élément LCP**. Recharge une fois avant de mesurer pour un état stable.
2. **Provoque le CLS à l'œil** : dans DevTools → **Network** → active le throttling **« Slow 4G »**, recharge, **regarde** le texte sauter quand l'image arrive. Relie ce que tu vois au chiffre CLS.
3. **Explique l'absence d'INP en lab** (personne ne clique pendant l'audit → Lighthouse donne le TBT).
4. **Partie B** : PageSpeed Insights sur un vrai site, repère field vs lab, tranche « qui décide ».
5. **Applique le preconnect + preload** de l'image hero (`as="image" fetchpriority="high"`). Recharge, ré-audite : le LCP doit **baisser** (l'image démarre son download dès le HTML).
6. **Applique `width`/`height`** sur l'`<img>`. Ré-audite : le **CLS doit tomber vers 0**.
7. **Consigne un tableau avant/après** (LCP, CLS) et prépare tes **2 justifications orales** pour le coach.

---

## Corrigé complet commenté

### Page APRÈS (les deux correctifs)

```html
<!-- index.html — APRÈS : LCP préchargé + dimensions réservées -->
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pique-nique de juin — TribuZen</title>

  <!-- CORRECTIF LCP #1 : ouvre la connexion à l'origine de l'image À L'AVANCE
       (DNS + TCP + TLS faits pendant qu'on parse le HTML). -->
  <link rel="preconnect" href="https://picsum.photos" crossorigin>

  <!-- CORRECTIF LCP #2 : découvre + télécharge l'image hero (élément LCP) TÔT,
       en priorité haute, sans attendre que le parseur atteigne le <img>. -->
  <link rel="preload" href="https://picsum.photos/1200/630"
        as="image" fetchpriority="high">

  <style>
    body { font-family: system-ui; max-width: 720px; margin: 0 auto; padding: 1rem; }
    /* height:auto garde le ratio tout en laissant width/height réserver la boîte */
    .hero { width: 100%; height: auto; }
    p { line-height: 1.6; }
  </style>
</head>
<body>
  <h1>Pique-nique de juin</h1>

  <!-- CORRECTIF CLS : width/height → le navigateur réserve la boîte 1200x630
       AVANT le téléchargement → le texte ne saute plus. -->
  <img class="hero"
       src="https://picsum.photos/1200/630"
       alt="Pique-nique au parc"
       width="1200" height="630">

  <p>Rendez-vous le 21 juin au Parc de la Tête d'Or. Amenez de quoi partager,
     TribuZen s'occupe du reste. Cette page publique doit être rapide et stable
     pour bien remonter dans Google et donner un bel aperçu sur les réseaux.</p>
  <p>Le contenu ci-dessus est volontairement long pour rendre le décalage de
     mise en page visible quand l'image hero arrive en retard.</p>
</body>
</html>
```

**Pourquoi ce corrigé est correct :**
- **`preload as="image" fetchpriority="high"`** : sans lui, le navigateur ne **découvre** l'image qu'après avoir parsé le HTML puis le CSS, et les images sont en priorité basse par défaut. Le preload la fait **démarrer dès la réception du HTML**, en priorité haute → l'élément LCP est peint plus tôt → **LCP en baisse**. Le CDN/serveur rendait l'image *rapide à servir*, pas *découverte tôt* : c'est deux choses différentes.
- **`preconnect`** : le handshake vers `picsum.photos` (DNS+TCP+TLS) est fait pendant le parsing au lieu d'être payé au moment du download → quelques centaines de ms gagnées sur le chemin critique du LCP.
- **`width`/`height` sur l'`<img>`** : le navigateur calcule la boîte (ratio 1200×630) **avant** de télécharger le fichier → le texte sous l'image ne bouge plus quand elle arrive → **CLS ≈ 0**. Aucun `Cache-Control` n'aurait produit cet effet : le cache change *quand* l'image arrive, pas le fait qu'on ait *réservé sa place*.
- **`height: auto` en CSS** : indispensable avec `width="100%"` pour conserver le ratio en responsive tout en gardant le bénéfice anti-CLS des attributs.

### Ce que tu dois observer (ordres de grandeur, pas des valeurs exactes)

```
Lighthouse Mobile, Slow 4G          AVANT          APRÈS
────────────────────────────────────────────────────────
LCP                                 ~3–4 s   →     nettement plus bas (preload)
CLS                                 ~0,2+    →     ~0 (dimensions réservées)
Élément LCP                         l'<img> hero (identique avant/après)
INP                                 non mesuré en lab (TBT affiché à la place)
```

Les valeurs absolues dépendent de ta machine/réseau : ce qui compte est le **sens** (LCP ⬇️, CLS ⬇️) et ta capacité à **l'expliquer**.

### Les 2 justifications orales attendues

1. **« Le CDN sert déjà l'image, pourquoi le LCP était-il mauvais ? »** → parce que le CDN rend l'image *rapide à servir* mais le navigateur la *découvre tard* (après HTML+CSS) et en priorité basse. Le `preload` corrige la **découverte**, pas la vitesse de service.
2. **« Pourquoi le cache n'aurait pas réglé le CLS ? »** → le CLS vient de l'**absence de place réservée**. Le cache change *quand* l'image arrive, pas le fait que le texte n'ait **aucune boîte** à sa place tant qu'elle n'est pas là. On règle ça en HTML (`width`/`height`), jamais avec `Cache-Control`.

---

## Variante J+30 (fading)

**Même objectif, contraintes ajoutées — à reproduire de mémoire, sans rouvrir ce corrigé, en 30 minutes :**

1. Pars d'une page **vierge** que tu écris toi-même (titre + image hero distante + 2 paragraphes), avec les **deux défauts** (pas de preload, pas de dimensions).
2. **Ajoute une police web** chargée dans le `<head>` et **préchargée correctement** : `rel="preload" as="font" type="font/woff2" crossorigin`. Explique oralement pourquoi **oublier `crossorigin`** provoquerait un **double téléchargement** de la police (et un re-flow → risque CLS).
3. **Mesure en field** un vrai site avec PageSpeed Insights et **relève l'INP réel** (impossible en lab). Explique en une phrase pourquoi le field est le seul à donner l'INP.
4. Corrige LCP (preconnect+preload) **et** CLS (dimensions) **et** la police (preload crossorigin), puis prouve le gain LCP/CLS avant/après.
5. **Sans regarder** le module 14 ni ce corrigé.

**Critères de réussite :**
- La page AVANT reproduit bien les 2 défauts (LCP tardif, CLS visible en Slow 4G).
- Le preload de police a `crossorigin` et tu sais dire ce qu'il évite.
- Tu as relevé un **INP field** sur un vrai site et tu sais pourquoi le lab ne le donne pas.
- Tableau avant/après : LCP ⬇️ et CLS → ~0, avec les 2 justifications orales.

---

## Application TribuZen

Dans le repo `smaurier/tribuzen`, ces réglages vivent ici :

```
tribuzen/
  ssr/src/render/head.ts            # preconnect cdn.tribuzen.app + preload avatar hero (LCP) + preload police
  src/lib/web-vitals-report.ts      # envoi field LCP/INP/CLS -> analytics (RUM, la vraie mesure SEO)
  .lighthouserc.json                # budgets CI : LCP, CLS, audits "uses-rel-preload" et "unsized-images"
```

**Différences par rapport au lab :**
- Le lab mesure **à la main** (DevTools + PageSpeed) ; en production, TribuZen **mesure en continu** en **field** via la librairie `web-vitals` (RUM) et surveille le rapport **CrUX / Search Console** — c'est ce qui décide du SEO, pas le Lighthouse local.
- Le Lighthouse du lab devient un **contrôle CI** (`.lighthouserc.json`) qui **bloque une PR** si l'image LCP n'est plus préchargée ou si une `<img>` perd ses dimensions — il attrape les **régressions de structure**, pas le SEO.
- L'image hero du lab (`picsum.photos`) est remplacée par l'**avatar/visuel de sortie servi par `cdn.tribuzen.app`** (module 08) ; le `preconnect` cible ce CDN.
- L'**INP** de TribuZen (bouton « Je participe ») n'est **pas** dans ce lab HTTP : il se traite dans le cours front (moins de JS bloquant). Le lab acte la frontière : ici on règle **LCP et CLS**, pas l'INP.

**Commit cible :**
```
perf(page-sortie): preconnect CDN + preload image LCP + dimensions images (CLS ~0)
```
