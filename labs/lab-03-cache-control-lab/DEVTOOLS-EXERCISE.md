# Exercice Chrome DevTools — Observer le Cache-Control en action

## Objectif

Observer le comportement réel du caching HTTP dans Chrome DevTools en utilisant le serveur du Lab 03.

## Prérequis

- Chrome (où Edge/Brave basé sur Chromium)
- Node.js 20+
- Lab 03 solution : `node labs/lab-03-cache-control-lab/solution.js`

## Instructions pas-à-pas

### Étape 1 — Démarrer le serveur

```bash
node labs/lab-03-cache-control-lab/solution.js
```

Le serveur écoute sur `http://localhost:3002` avec 4 routes :
- `/assets/style.css` → `Cache-Control: public, max-age=31536000, immutable`
- `/api/data` → `Cache-Control: no-cache` (+ ETag)
- `/api/secret` → `Cache-Control: no-store`
- `/page` → `Cache-Control: public, max-age=0, s-maxage=300`

### Étape 2 — Ouvrir Chrome DevTools (onglet Network)

1. Ouvrir Chrome et naviguer vers `http://localhost:3002/assets/style.css`
2. Ouvrir DevTools : `F12` ou `Ctrl+Shift+I`
3. Aller à l'onglet **Network**
4. Cocher **Disable cache** pour commencer avec un cache vide
5. Recharger la page (`F5`)

### Étape 3 — Observer les différentes politiques de cache

#### Test A : Asset immutable (max-age=31536000)

1. Décocher **Disable cache**
2. Naviguer vers `http://localhost:3002/assets/style.css`
3. Observer dans Network : `Status: 200`, `Size: xxx bytes` (téléchargement complet)
4. **Recharger la page** (`F5`)
5. Observer : `Status: 200`, `Size: (memory cache)` ou `(disk cache)`
6. → Le navigateur ne fait AUCUNE requête réseau ! Le fichier est servi directement depuis le cache.

**Que regarder dans les headers de réponse :**
- `Cache-Control: public, max-age=31536000, immutable`
- `immutable` dit au navigateur de ne jamais revalider, même avec Ctrl+F5

#### Test B : no-cache (toujours revalider)

1. Naviguer vers `http://localhost:3002/api/data`
2. Observer : `Status: 200`, body JSON, ETag dans les headers de réponse
3. **Recharger** (`F5`)
4. Observer : `Status: 304 Not Modified`, `Size: très petit`
5. → Le navigateur a envoyé `If-None-Match` avec l'ETag. Le serveur a répondu 304.

**Que regarder :**
- Onglet **Headers** → Request Headers : `If-None-Match: "xxx"`
- Onglet **Headers** → Response Headers : `ETag: "xxx"`, `Status: 304`
- La colonne **Size** montre la différence : 200 = body complet, 304 = headers seulement

#### Test C : no-store (données sensibles)

1. Naviguer vers `http://localhost:3002/api/secret`
2. Observer : `Status: 200`
3. **Recharger** (`F5`)
4. Observer : `Status: 200` à nouveau, JAMAIS de cache
5. → Chaque requête va toujours au serveur. Pas de 304, pas de cache.

**Que regarder :**
- `Cache-Control: no-store`
- Le compteur `X-Request-Count` incrémente à chaque requête

#### Test D : Différence Hard Refresh vs Normal Refresh

1. Naviguer vers `http://localhost:3002/assets/style.css`
2. **Normal Refresh** (`F5`) → `(memory cache)` ou `(disk cache)`
3. **Hard Refresh** (`Ctrl+Shift+R`) → `200` (téléchargement complet)
4. → Hard Refresh envoie `Cache-Control: no-cache` dans la REQUÊTE, forçant le serveur à répondre

### Étape 4 — Observer le compteur de requêtes

Le serveur affiche un header `X-Request-Count` qui s'incrémente à chaque requête réelle (pas depuis le cache).

1. Ouvrir 4 onglets Chrome vers les 4 URLs
2. Recharger chaque onglet plusieurs fois
3. Observer quels onglets font monter le compteur (dans la console du serveur) et lesquels non

**Résultat attendu :**
- `/assets/style.css` → compteur stable après la 1ère requête (cache immutable)
- `/api/data` → compteur monte mais réponses 304 (revalidation)
- `/api/secret` → compteur monte à chaque requête (no-store)
- `/page` → compteur monte à chaque requête (max-age=0, pas de CDN en local)

### Étape 5 — Memory cache vs Disk cache

1. Naviguer vers `http://localhost:3002/assets/style.css`
2. Recharger → `(memory cache)` (la ressource est en RAM)
3. **Fermer l'onglet** puis en ouvrir un nouveau vers la même URL
4. Observer : `(disk cache)` (la ressource est lue depuis le disque)
5. → `memory cache` = onglet ouvert, `disk cache` = onglet fermé puis rouvert

## Tableau récapitulatif

| Route | Cache-Control | 1ère visite | Refresh (F5) | Hard Refresh |
|-------|--------------|-------------|--------------|-------------|
| `/assets/style.css` | `immutable, max-age=31536000` | 200 (download) | (memory cache) | 200 (download) |
| `/api/data` | `no-cache` + ETag | 200 (download) | 304 (revalidation) | 200 (download) |
| `/api/secret` | `no-store` | 200 (download) | 200 (download) | 200 (download) |
| `/page` | `max-age=0, s-maxage=300` | 200 (download) | 200 (download) | 200 (download) |

## Points clés à retenir

1. **`immutable`** = le navigateur ne fait JAMAIS de requête réseau (sauf Hard Refresh)
2. **`no-cache`** = le navigateur fait TOUJOURS une requête de revalidation (mais peut recevoir 304)
3. **`no-store`** = le navigateur ne stocke RIEN (toujours 200 complet)
4. **304 Not Modified** = le body n'est pas re-transféré, seulement les headers (~100 octets vs ~10 KB)
5. **Memory cache** = plus rapide que disk cache, mais disparaît à la fermeture de l'onglet
