import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'HTTP & Caching Course',
  description: 'Formation complète HTTP et Caching : du protocole au cache multi-couches (débutant → expert)',
  lang: 'fr-FR',
  srcDir: '.',

  // Refonte v1 : liens internes non bloquants (labs renumérotés) ; intégrité
  // prereq/next enforcée par gate-course.ps1.
  ignoreDeadLinks: true,

  // Refonte v1 : le cours vit dans modules/ + labs/. cours/ (v0, archive) exclu.
  srcExclude: ['cours/**'],

  // Docs statiques : neutralise l'interpolation Vue `{{ }}` en prose.
  // NB : override `delimiters` retiré (il cassait le {{ }} du thème par défaut).
  // cf docs/curriculum/DETTE-vitepress-delimiters.md


  themeConfig: {
    nav: [
      { text: 'Modules', link: '/modules/00-prerequis-et-vue-ensemble' },
      { text: 'Labs', link: '/labs/lab-00-prerequis-et-vue-ensemble/README' },
      { text: 'Quizzes', link: '/quizzes/' },
      { text: 'Visualisations', link: '/visualizations/' },
      { text: 'Glossaire', link: '/glossaire' }
    ],

    sidebar: {
      '/modules/': [
        {
          text: 'Modules',
          items: [
            { text: '00 — Prérequis & Vue d\'ensemble', link: '/modules/00-prerequis-et-vue-ensemble' },
            { text: '01 — Le protocole HTTP', link: '/modules/01-protocole-http' },
            { text: '02 — HTTP/2 & HTTP/3', link: '/modules/02-http2-http3' },
            { text: '03 — Les en-têtes HTTP', link: '/modules/03-en-tetes-http' },
            { text: '04 — Cache-Control', link: '/modules/04-cache-control' },
            { text: '05 — ETag & Validation conditionnelle', link: '/modules/05-etag-validation-conditionnelle' },
            { text: '06 — Stale-While-Revalidate', link: '/modules/06-stale-while-revalidate' },
            { text: '07 — Cache navigateur', link: '/modules/07-cache-navigateur' },
            { text: '08 — CDN', link: '/modules/08-cdn' },
            { text: '09 — Cache multi-couches', link: '/modules/09-cache-multi-couches' },
            { text: '10 — SSR', link: '/modules/10-ssr' },
            { text: '11 — ISR & SSG', link: '/modules/11-isr-ssg' },
            { text: '12 — Edge Rendering', link: '/modules/12-edge-rendering' },
            { text: '13 — HTTP Streaming', link: '/modules/13-http-streaming' },
            { text: '14 — Performance Web', link: '/modules/14-performance-web' },
            { text: '15 — PWA & Service Workers', link: '/modules/15-pwa-service-workers' },
            { text: '16 — Push API & Notifications', link: '/modules/16-push-api-web-notifications' },
            { text: '17 — Projet final', link: '/modules/17-projet-final' }
          ]
        }
      ],
      '/labs/': [
        {
          text: 'Labs — pratique (énoncé + corrigé)',
          items: [
            { text: 'Lab 00 — Prérequis & vue d\'ensemble', link: '/labs/lab-00-prerequis-et-vue-ensemble/README' },
            { text: 'Lab 01 — Le protocole HTTP', link: '/labs/lab-01-protocole-http/README' },
            { text: 'Lab 02 — HTTP/2 & HTTP/3', link: '/labs/lab-02-http2-http3/README' },
            { text: 'Lab 03 — Les en-têtes HTTP', link: '/labs/lab-03-en-tetes-http/README' },
            { text: 'Lab 04 — Cache-Control', link: '/labs/lab-04-cache-control/README' },
            { text: 'Lab 05 — ETag & validation conditionnelle', link: '/labs/lab-05-etag-validation-conditionnelle/README' },
            { text: 'Lab 06 — Stale-While-Revalidate', link: '/labs/lab-06-stale-while-revalidate/README' },
            { text: 'Lab 07 — Cache navigateur', link: '/labs/lab-07-cache-navigateur/README' },
            { text: 'Lab 08 — CDN', link: '/labs/lab-08-cdn/README' },
            { text: 'Lab 09 — Cache multi-couches', link: '/labs/lab-09-cache-multi-couches/README' },
            { text: 'Lab 10 — SSR', link: '/labs/lab-10-ssr/README' },
            { text: 'Lab 11 — ISR & SSG', link: '/labs/lab-11-isr-ssg/README' },
            { text: 'Lab 12 — Edge Rendering', link: '/labs/lab-12-edge-rendering/README' },
            { text: 'Lab 13 — HTTP Streaming', link: '/labs/lab-13-http-streaming/README' },
            { text: 'Lab 14 — Performance Web', link: '/labs/lab-14-performance-web/README' },
            { text: 'Lab 15 — PWA & Service Workers', link: '/labs/lab-15-pwa-service-workers/README' },
            { text: 'Lab 16 — Push API & Notifications', link: '/labs/lab-16-push-api-web-notifications/README' },
            { text: 'Lab 17 — Projet final', link: '/labs/lab-17-projet-final/README' }
          ]
        }
      ],
      '/quizzes/': [
        {
          text: 'Quizzes',
          items: [
            { text: 'Tous les quizzes', link: '/quizzes/' },
            { text: 'Quiz 00 — Prérequis', link: '/quizzes/quiz-00-prerequis' },
            { text: 'Quiz 01 — HTTP Protocol', link: '/quizzes/quiz-01-http-protocol' },
            { text: 'Quiz 02 — HTTP/2 & HTTP/3', link: '/quizzes/quiz-02-http2-http3' },
            { text: 'Quiz 03 — Headers', link: '/quizzes/quiz-03-headers' },
            { text: 'Quiz 04 — Cache-Control', link: '/quizzes/quiz-04-cache-control' },
            { text: 'Quiz 05 — ETag', link: '/quizzes/quiz-05-etag' },
            { text: 'Quiz 06 — SWR', link: '/quizzes/quiz-06-swr' },
            { text: 'Quiz 07 — Browser Cache', link: '/quizzes/quiz-07-browser-cache' },
            { text: 'Quiz 08 — CDN', link: '/quizzes/quiz-08-cdn' },
            { text: 'Quiz 09 — Multi-layer', link: '/quizzes/quiz-09-multi-layer' },
            { text: 'Quiz 10 — SSR', link: '/quizzes/quiz-10-ssr' },
            { text: 'Quiz 11 — ISR', link: '/quizzes/quiz-11-isr' },
            { text: 'Quiz 12 — Edge', link: '/quizzes/quiz-12-edge' },
            { text: 'Quiz 13 — Streaming', link: '/quizzes/quiz-13-streaming' },
            { text: 'Quiz 14 — Performance', link: '/quizzes/quiz-14-performance' },
            { text: 'Quiz 15 — Projet final', link: '/quizzes/quiz-15-projet-final' }
          ]
        }
      ],
      '/visualizations/': [
        {
          text: 'Visualisations',
          items: [
            { text: 'Toutes les visualisations', link: '/visualizations/' },
            { text: 'HTTP Lifecycle', link: '/visualizations/http-lifecycle.html' },
            { text: 'Cache Decision Tree', link: '/visualizations/cache-decision-tree.html' },
            { text: 'Multi-Layer Cache', link: '/visualizations/multi-layer-cache.html' },
            { text: 'SSR & Hydration', link: '/visualizations/ssr-hydration.html' },
            { text: 'Stale-While-Revalidate', link: '/visualizations/stale-while-revalidate.html' }
          ]
        }
      ]
    },

    search: {
      provider: 'local'
    },

    outline: {
      level: [2, 3],
      label: 'Sur cette page'
    },

    docFooter: {
      prev: 'Précédent',
      next: 'Suivant'
    }
  }
})
