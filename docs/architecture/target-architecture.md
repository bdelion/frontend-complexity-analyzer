# Architecture cible — PROPOSITION, à valider

```text
CLI / configuration
  → découverte des librairies, composants, tests et stories
  → résolution d'appartenance (code propre / partagé / externe)
  → projet TypeScript et AST mutualisé
  → analyseurs : code, architecture, React/API, accessibilité/clavier,
                 Jest/Vitest, Playwright, Storybook/TSDoc, Git (optionnel)
  → registre versionné de métriques (valeur, unité, statut, preuve, diagnostic)
  → moteurs de scoring distincts (complexité / accessibilité / risque)
  → rapports JSON, CSV, Markdown, HTML
  → comparaison/historisation → intégrations Jenkins, SonarQube (optionnelles)
```

## Principes
- Les analyseurs ne dépendent pas des reporters ou du scoring.
- Un composant peut posséder plusieurs fichiers et utiliser du code partagé.
- Analyse statique par défaut ; import de résultats de tests existants sans exécuter les tests des librairies.
- Fichiers sources inspectés en lecture seule ; les rapports sont écrits uniquement dans le dossier de sortie.
- Le JSON est un contrat versionné et documenté ; identifiants stables par librairie/composant.
- Diagnostics non bloquants pour fichiers non analysables ; rapport de couverture de l'analyse elle-même.
- Calibrer les scores sur des composants réels avant de fixer les seuils.

## Commandes cibles (non implémentées)
```powershell
rcca analyze --root "D:\Git\ds-react" --output "./reports" --format json,html,md,csv
rcca analyze --root "D:\Git\ds-react" --component TreeView --explain
rcca compare --baseline ./reports/old.json --current ./reports/new.json
```

## Stack envisagée
Node.js LTS, TypeScript strict, ts-morph, commander, zod, fast-glob, vitest, ESLint, TypeDoc. Choix définitifs à confirmer dans la V4.
