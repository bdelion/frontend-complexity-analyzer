# Instructions agents — Frontend Complexity Analyzer

## Mission
Construire, après validation de la conception, une CLI autonome Node.js/TypeScript d'analyse de composants React/TypeScript de Design System. Les librairies sont organisées par répertoire de composant, avec tests Jest/Playwright proches des sources.

## Ordre de référence
1. `docs/specifications/` : cinq documents originaux **inchangés** ; leurs divergences ne sont pas arbitrées.
2. `docs/context/conversation-handoff.md` : décisions et recommandations issues des échanges ; distinguer explicitement propositions et décisions.
3. `docs/decisions/` : ADR validées ; les ADR marquées PROPOSED ne sont pas des décisions définitives.
4. `docs/architecture/target-architecture.md` : architecture **proposée**.

## Avant de coder
- Lire les cinq spécifications et la transmission de contexte.
- Proposer une V4 consolidée avec traçabilité par document, écarts, questions ouvertes et arbitrages.
- Ne pas inventer de consensus sur les pondérations ou sur la conformité RGAA.
- Attendre validation explicite avant d'implémenter les analyseurs.

## Contraintes techniques
- TypeScript strict, Node.js LTS, analyse AST via ts-morph envisagée.
- Analyse des librairies en lecture seule ; aucun changement des dépôts inspectés.
- Métriques brutes, preuves (fichier/ligne), statuts (mesuré/estimé/indisponible), diagnostics et versions d'algorithmes.
- Différencier complexité intrinsèque, obligations/effort d'accessibilité et risque de maintenance.
- Pas de score de conformité RGAA déduit du simple comptage des attributs ARIA.
- Éviter le double comptage des hooks et utilitaires partagés.

## Qualité de chaque patch
- Toute modification de code inclut ses tests pertinents dans le même patch.
- Commentaires et TSDoc en français pour le code créé/modifié.
- Mettre à jour README et docs si la modification l'exige.
- Exécuter typecheck, lint, tests et build lorsque les scripts existent ; ne jamais annoncer GREEN sans les avoir exécutés.
- Résumer les fichiers modifiés, validations réellement effectuées, limites et proposer un message de commit.

## Sécurité et confidentialité
- Ne pas transmettre de code interne ni de données métier à des services externes sans autorisation.
- Ne pas modifier les sources analysées, ne pas exécuter leurs scripts sans accord explicite.
- Demander confirmation avant suppression, publication ou push.
