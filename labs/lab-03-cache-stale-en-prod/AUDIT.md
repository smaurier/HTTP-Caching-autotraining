# Audit — `localizedCache.ts`

À remplir en lisant UNIQUEMENT `src/localizedCache.ts` — rien d'autre. Le correcteur lit ce
fichier avant ton code.

1. **La clé de cache est `familyId` seul.** `getFamilySummary` reçoit pourtant `locale` en
   paramètre. Que se passe-t-il si on appelle `getFamilySummary("f1", "fr", cache)` PUIS
   `getFamilySummary("f1", "en", cache)`, avec le MÊME `cache` (Map partagée) ?

2. **Pourquoi ce bug ne se voit JAMAIS en dev** si le développeur teste toujours avec la même
   locale ? Et pourquoi il se voit forcément en prod, avec de vrais utilisateurs de langues
   différentes ?

3. Relis le module 09 (cache multi-couches) — quel concept nomme précisément "une dimension
   qui fait varier la réponse, absente de la clé de cache" ? (Indice : c'est le rôle d'un
   en-tête HTTP réel, `Vary`.)

4. La correction minimale, en une phrase.
