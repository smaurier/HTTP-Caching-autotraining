# Lab 02 — Observer le multiplexing HTTP/2 vs HTTP/1.1

> **Outcome :** à la fin, tu sais lire le protocole négocié dans DevTools et avec curl, distinguer un waterfall HTTP/1.1 (vagues de 6) d'un waterfall HTTP/2/3 (démarrage parallèle), et confirmer une bascule HTTP/3 via `Alt-Svc`.
> **Vrai outil :** Chrome DevTools (colonnes **Protocol** + **Connection ID** du panneau Network) + `curl` 8+ (`--http1.1`, `--http2`, `--http3`) sur des serveurs réels — pas de harnais de test simulé, pas de gap-fill.
> **Feedback :** le coach valide en session (observation directe, pas de test-runner auto-correcteur).

## Énoncé

Tu vas **observer**, en vrai, sur le réseau, la différence entre les versions du protocole HTTP. Aucun code applicatif à écrire : tu conduis des mesures sur des serveurs publics et tu **notes** ce que tu vois. La page blanche ici, c'est ton carnet d'observations — tu **prédis avant de mesurer**, puis tu compares (l'écart prédiction/mesure est ce qui ancre la notion).

Quatre observations à mener :

1. **Lire le protocole négocié** de trois sites dans la colonne Protocol de DevTools.
2. **Comparer deux waterfalls** : un site HTTP/1.1 (vagues de 6) contre un site HTTP/2 (parallèle).
3. **Confirmer la version avec curl** en forçant `--http1.1`, `--http2`, `--http3`.
4. **Repérer la bascule HTTP/3** via l'en-tête `Alt-Svc`.

## Étapes (en friction)

1. Ouvre Chrome DevTools (F12) → onglet **Network**. Clic droit sur l'en-tête des colonnes → coche **Protocol** (et **Connection ID**). Recharge (Ctrl+Maj+R) sur ces trois pages et **note le protocole de la ligne du document principal** :
   - `https://www.cloudflare.com`
   - `https://en.wikipedia.org`
   - un endpoint HTTP/1.1, ex. `https://httpbin.org/html`

   **Avant de regarder**, écris ta prédiction pour chacun (h1/h2/h3).
2. Sur le site HTTP/1.1 et sur le site HTTP/2, compare la forme du **waterfall** (colonne Waterfall). Repère : les requêtes démarrent-elles toutes ensemble, ou par lots de ~6 avec des barres « Queued/Stalled » ? Note la différence visuelle.
3. Dans un terminal, mesure la version négociée par défaut, puis force chaque version. Note la 1re ligne de réponse à chaque fois.
4. Sur le site HTTP/2, cherche l'en-tête `Alt-Svc` dans la réponse (curl ou onglet Headers de DevTools). S'il contient `h3`, force `--http3` et vérifie que QUIC répond. Explique à voix haute pourquoi la 1re visite était en h2 alors que le site « est » en h3.

> Astuce : la colonne **Connection ID** de DevTools révèle combien de connexions TCP/QUIC sont réellement ouvertes — un seul ID pour tout un site H2/H3, plusieurs pour un site H1.1.

## Corrigé complet commenté

```bash
# ── Étape 3 : version négociée par défaut ────────────────────────────
curl -I https://www.cloudflare.com 2>&1 | head -1
# HTTP/2 200        <- ALPN a choisi h2 pour la 1re connexion (voir étape 4)

# ── Forcer chaque version pour confirmer ce que le serveur supporte ──
curl -I --http1.1 https://www.cloudflare.com 2>&1 | head -1
# HTTP/1.1 200      <- le serveur sait retomber en HTTP/1.1 si on l'exige

curl -I --http2 https://www.cloudflare.com 2>&1 | head -1
# HTTP/2 200        <- h2 négocié via ALPN dans le handshake TLS

curl -I --http3 https://www.cloudflare.com 2>&1 | head -1
# HTTP/3 200        <- QUIC/UDP répond directement quand on le demande
#                      (nécessite un curl compilé avec le support HTTP/3)

# ── Étape 4 : repérer l'annonce HTTP/3 ───────────────────────────────
curl -I https://www.cloudflare.com 2>&1 | grep -i alt-svc
# alt-svc: h3=":443"; ma=86400
#   -> "je supporte aussi h3 sur le port 443, mémorise-le 24h (ma=86400)"
#   C'est POURQUOI la 1re visite part en h2 : le navigateur ne connaît
#   pas encore le support h3, il l'apprend via Alt-Svc, puis bascule
#   sur la connexion suivante (arrière-plan, sur QUIC/UDP).

# ── Voir la négociation ALPN en détail (le cœur du choix h2 vs h1.1) ─
curl -v --http2 https://www.cloudflare.com 2>&1 | grep -Ei "ALPN|< HTTP"
# * ALPN: curl offers h2,http/1.1
# * ALPN: server accepted h2
# < HTTP/2 200

# ── Comparer le coût transport h1.1 vs h2 sur la même page ───────────
# time_starttransfer = temps jusqu'au 1er octet (inclut DNS+TCP+TLS+serveur)
curl -o /dev/null -s -w "h1.1  ttfb=%{time_starttransfer}s total=%{time_total}s\n" \
     --http1.1 https://www.cloudflare.com
curl -o /dev/null -s -w "h2    ttfb=%{time_starttransfer}s total=%{time_total}s\n" \
     --http2   https://www.cloudflare.com
# Sur UNE ressource l'écart est faible : le gain de h2 vient du MULTIPLEXING
# de dizaines de ressources en parallèle (visible dans le waterfall DevTools),
# pas d'une requête isolée. C'est la leçon clé du lab.
```

> Windows : le shell par défaut est PowerShell. `head` et `grep` n'existent pas — remplace par `curl -I https://www.cloudflare.com | Select-Object -First 1` et `curl -I https://www.cloudflare.com | Select-String alt-svc`. Ou utilise Git Bash / WSL pour reprendre les commandes telles quelles. `/dev/null` devient `$null`.

**Ce que tu dois avoir observé et su expliquer :**
- **Étape 1** : Cloudflare et Wikipedia servent en `h2`/`h3` sous **un seul Connection ID** ; httpbin en `http/1.1` avec **plusieurs** connexions.
- **Étape 2** : en HTTP/1.1, le waterfall montre des barres décalées par lots de ~6 (temps « Queued/Stalled ») ; en HTTP/2, presque tout démarre en même temps — c'est le multiplexing.
- **Étape 3** : le serveur accepte plusieurs versions ; c'est **ALPN** (dans TLS) qui tranche h2 vs http/1.1, et `--http3` bascule sur QUIC/UDP.
- **Étape 4** : la 1re connexion est en h2 **même sur un site h3**, car h3 s'apprend via `Alt-Svc` puis s'active à la connexion suivante. Rien à voir avec un « push » : **le server push est mort** (désactivé par Chrome 106 en 2022, retiré de Firefox 132 en 2024), on ne l'observe nulle part ici.

## Variante J+30 (fading)

Reprends l'exercice **sans relire ce corrigé** et avec deux contraintes :

1. En moins de 15 minutes, uniquement en ligne de commande (pas de DevTools).
2. Choisis **toi-même** trois domaines dont tu ignores la version, et pour chacun : détermine la version par défaut, prouve qu'il supporte (ou non) h3 via `Alt-Svc`, et **prédis par écrit** si son support h3 marchera avant de lancer `--http3`. Bonus : sur un domaine, mesure `time_starttransfer` en `--http1.1` vs `--http3` et explique pourquoi l'écart sur une seule requête ne reflète pas le vrai gain (multiplexing).

## Application TribuZen

Porte l'observation dans le vrai produit. Dans `smaurier/tribuzen` :

1. Lance `curl -I https://tribuzen.app | head -1` puis `curl -I https://tribuzen.app | grep -i alt-svc`. **Note** la version servie et si h3 est annoncé. Ouvre l'admin `/admin/familles` dans DevTools (colonnes Protocol + Connection ID) et confirme qu'un seul Connection ID sert tous les assets.
2. Ouvre `vite.config.ts`. Vérifie que le build **splitte** `vendor` des chunks de features (`familles`, `evenements`, `membres`) plutôt que de tout concaténer. Si un `manualChunks` fusionne tout en un mégabundle, ouvre une issue : sous H2/H3 le multiplexing rend le splitting gagnant (parallélisme + cache granulaire).
3. Documente le constat dans `infra/cdn/http-version.md` (protocole servi, `Alt-Svc`, rappel : **pas de server push**, préférer `103 Early Hints`), puis commit :

```
docs(cdn): documente la version HTTP servie et la stratégie de splitting sous H2/H3
```
