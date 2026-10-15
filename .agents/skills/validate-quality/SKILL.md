---
name: validate-quality
description: Vérifier les tests, la documentation et la qualité avant livraison d'un patch TypeScript.
---

# Validation qualité

1. Examiner les fichiers modifiés et vérifier les tests associés au même patch.
2. Vérifier TSDoc/commentaires en français et mise à jour pertinente du README/docs.
3. Exécuter, si disponibles, `npm run typecheck`, `npm run lint`, `npm test` et `npm run build`.
4. Signaler séparément réussites, échecs et vérifications non exécutées.
5. Contrôler les modifications non désirées dans les librairies analysées.
6. Proposer un message de commit après validation ; ne pas annoncer GREEN sans exécution réelle.
