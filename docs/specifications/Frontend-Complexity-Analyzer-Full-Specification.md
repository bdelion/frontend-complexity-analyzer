# Frontend Complexity Analyzer

# Dossier de spécifications complet

## 1. Vision

Le Frontend Complexity Analyzer est un outil destiné à mesurer, comparer et historiser la complexité des composants React/TypeScript d'un Design System.

Objectifs :
- Objectiver les estimations.
- Valoriser les efforts RGAA/WAI-ARIA.
- Suivre le patrimoine frontend.
- Produire des indicateurs de maintenance.
- Fournir des métriques exploitables par les PO, Lead Dev, Architectes et Managers.

## 2. Périmètre

Analyse :
- React
- TypeScript
- TSX
- Jest
- Vitest
- Playwright
- Storybook
- Documentation TSDoc

## 3. Architecture logistique

### Flux général
1. Lecture configuration.
2. Scan des répertoires.
3. Construction AST via ts-morph.
4. Extraction des métriques.
5. Calcul des scores.
6. Génération rapports.
7. Historisation.
8. Publication Jenkins.

## 4. Arborescence cible

src/
  cli/
  configuration/
  scanner/
  analyzers/
    api/
    react/
    accessibility/
    keyboard/
    tests/
    maintainability/
  scoring/
  reporting/
  history/
  sonar/
  models/
  utils/

## 5. Technologies

- Node.js LTS
- TypeScript strict
- ts-morph
- commander
- handlebars
- chart.js
- vitest
- prettier
- eslint
- typedoc
- husky

## 6. Configuration

### analyzer.config.json

```json
{
  "sourceFolders": ["libs"],
  "excludedFolders": ["node_modules","dist","coverage"],
  "reportFolder": "reports",
  "historyFolder": "history",
  "thresholds": {
    "warning": 70,
    "error": 90
  }
}
```

## 7. Modèle de données

```ts
export interface ComponentMetrics {
  componentName:string;
  filePath:string;
  loc:number;
  propsCount:number;
  requiredPropsCount:number;
  callbackPropsCount:number;
  hooksCount:number;
  ariaAttributesCount:number;
  ariaRoleCount:number;
  keyboardInteractionsCount:number;
  cyclomaticComplexity:number;
  jestTestsCount:number;
  playwrightTestsCount:number;
  storiesCount:number;
  maintainabilityScore:number;
  score:number;
}
```

## 8. Détection composants

Critères :
- export function
- export const
- memo
- forwardRef

## 9. Analyse API

Mesures :
- props
- callbacks
- génériques
- profondeur des objets
- interfaces publiques

### Pondération

apiScore =
props + callbacks*2 + generics*3

## 10. Analyse React

Comptages :
- useState
- useEffect
- useMemo
- useCallback
- useReducer
- useRef
- useContext
- memo
- forwardRef

## 11. Analyse accessibilité

### ARIA
- aria-label
- aria-labelledby
- aria-describedby
- aria-controls
- aria-expanded
- aria-selected
- aria-current
- aria-live
- aria-activedescendant

### Rôles
- button
- dialog
- alert
- tab
- menu
- menuitem
- listbox
- option
- combobox
- tree
- treeitem

### Focus
- focus()
- blur()
- tabIndex

## 12. Analyse clavier

Touches :
ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
Home, End, Enter, Escape, Space, Tab,
PageUp, PageDown.

## 13. Analyse Jest / Vitest

Mesures :
- describe
- it
- test
- expect
- snapshots

Ratios :
- tests / props
- tests / LOC

## 14. Analyse Playwright

Mesures :
- nombre de scénarios
- navigation clavier
- click
- fill
- assertions accessibilité

## 15. Analyse Storybook

Mesures :
- stories
- variantes
- états
- playgrounds

## 16. Complexité cyclomatique

Compter :
- if
- else if
- switch
- case
- catch
- &&
- ||
- ternaires

Formule :
CC = 1 + branches

## 17. Maintenabilité

Mesures :
- LOC
- fichiers
- imports
- dépendances internes
- dépendances externes

## 18. Score global

API 15%
React 10%
Complexité 20%
Accessibilité 25%
Clavier 15%
Tests 10%
Maintenabilité 5%

### Niveaux
0-20 Simple
21-40 Faible
41-60 Modéré
61-80 Complexe
81-100 Très complexe

## 19. Typologie Design System

### Niveau 1
Button
Link
Badge
Tag

### Niveau 2
Accordion
Tabs
Modal

### Niveau 3
Menu
Select
DatePicker

### Niveau 4
Combobox
TreeView
DataTable

## 20. JSON Report

```json
{
  "component":"TreeView",
  "score":94
}
```

## 21. CSV Report

Component,Score
TreeView,94

## 22. HTML Dashboard

Pages :
- Executive Summary
- Components Ranking
- Accessibility Ranking
- Technical Ranking
- Historical Trends
- Component Details

## 23. Historisation

history/
 yyyy-mm-dd.json

Fonctions :
- comparaison
- régression
- tendance

## 24. CLI

analyzer analyze
analyzer report
analyzer compare
analyzer history
analyzer validate-config

## 25. Jenkins

Stages :
- Install
- Lint
- Test
- Build
- Analyze
- Publish

## 26. SonarQube

Export :
- Generic Issue Format
- Mesures personnalisées

## 27. Docker

Image Node LTS.

## 28. Documentation

TSDoc obligatoire.
TypeDoc généré automatiquement.

## 29. Règles TSDoc

@param
@returns
@example
@throws

## 30. Standards qualité

- ESLint
- Prettier
- Husky
- TS Strict
- Couverture > 80%

## 31. Plan de tests

Unitaires : scanner, analyzers, scoring.

Intégration : analyse librairies réelles.

E2E : exécution CLI complète.

## 32. Backlog

Epic 1 Scanner
Epic 2 AST
Epic 3 Metrics
Epic 4 Scoring
Epic 5 Reporting
Epic 6 Jenkins
Epic 7 Sonar
Epic 8 Historisation

## 33. Critères d'acceptation

- Multi-librairies
- Multi-reports
- Jenkins compatible
- Docker compatible
- Documentation générée
- Historisation disponible
- Dashboard HTML disponible

## 34. Évolutions futures

- Export Power BI
- GitHub Action
- GitLab CI
- Classement patrimoine
- Score RGAA avancé
- Analyse churn Git
- Tendances trimestrielles

## 35. Conclusion

Le produit doit devenir la référence de pilotage de la complexité des composants Design System de la Squad Communs du Dev.
