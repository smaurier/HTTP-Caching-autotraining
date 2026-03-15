import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'HTTP & Caching Course',
  description: 'Formation complète HTTP et Caching : du protocole au cache multi-couches (débutant → expert)',
  lang: 'fr-FR',
  srcDir: '.',

  ignoreDeadLinks: [
    /\/quizzes\/quiz-\d{2}/,
    /\/visualizations\/(http-lifecycle|cache-decision-tree|multi-layer-cache|ssr-hydration|stale-while-revalidate)/,
    /\.\/(http-lifecycle|cache-decision-tree|multi-layer-cache|ssr-hydration|stale-while-revalidate)/,
    /\/labs\/lab-\d{2}/,
  ],

  themeConfig: {
    nav: [
      { text: 'Modules', link: '/modules/00-prerequis-et-vue-ensemble' },
      { text: 'Labs', link: '/labs/lab-01-http-inspector/README' },
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
            { text: '15 — Projet final', link: '/modules/15-projet-final' }
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
