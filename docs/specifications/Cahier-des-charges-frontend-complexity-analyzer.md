# Frontend Component Complexity Analyzer

## Contexte

La Squad « Communs du Dev » maintient des librairies React exposant des composants conformes au Design System de l'entreprise, aux exigences RGAA et aux pratiques WAI-ARIA.

L'objectif est de construire un outil autonome permettant :

- d'analyser automatiquement les composants React/TypeScript ;
- de mesurer leur complexité selon plusieurs axes ;
- de produire des rapports exploitables par les développeurs, PO et managers ;
- de s'intégrer dans Jenkins ;
- de suivre l'évolution du patrimoine logiciel dans le temps.

---

# Objectifs

## Fonctionnels

- Scanner une ou plusieurs librairies React.
- Détecter automatiquement les composants.
- Calculer un score de complexité par composant.
- Générer un score global des librairies.
- Produire des rapports HTML, JSON et CSV.
- Publier les résultats dans Jenkins.
- Permettre une configuration externe.

## Non fonctionnels

- TypeScript strict.
- Compatible Node LTS.
- Exécution locale et CI.
- Sans dépendance à SonarQube.
- Documentation générée automatiquement via TypeDoc.
- Couverture de tests >80%.

---

# Architecture cible

```text
frontend-complexity-analyzer/
│
├── src/
│   ├── analyzers/
│   ├── scoring/
│   ├── reporters/
│   ├── configuration/
│   ├── models/
│   ├── utils/
│   └── cli/
│
├── tests/
├── config/
├── reports/
├── docs/
├── templates/
├── package.json
├── tsconfig.json
├── typedoc.json
├── eslint.config.js
├── prettier.config.js
└── Jenkinsfile
```

---

# Technologies recommandées

## Runtime

- Node.js LTS
- TypeScript

## Analyse AST

- ts-morph
- TypeScript Compiler API

## CLI

- commander

## Reporting

- handlebars
- chart.js
- csv-writer

## Tests

- vitest

## Qualité

- eslint
- prettier
- husky

## Documentation

- TSDoc
- TypeDoc

---

# Critères d'analyse

## 1. API publique

Mesures :

- nombre de props
- callbacks
- types génériques
- profondeur des objets de configuration

## 2. Complexité React

Mesures :

- useState
- useEffect
- useMemo
- useCallback
- useReducer
- useRef

## 3. Complexité cyclomatique

Mesures :

- if
- switch
- case
- catch
- opérateurs conditionnels
- expressions ternaires

## 4. Accessibilité

Mesures :

- nombre d'attributs aria-*
- rôles ARIA
- gestion du focus
- relations aria-controls / labelledby

## 5. Navigation clavier

Mesures :

- onKeyDown
- onKeyUp
- onKeyPress
- Arrow*
- Home
- End
- Enter
- Escape
- Space
- Tab

## 6. Tests Jest/Vitest

Mesures :

- nombre de suites
- nombre de tests
- ratio tests / props

## 7. Tests Playwright

Mesures :

- scénarios utilisateur
- interactions clavier
- parcours focus

## 8. Maintenabilité

Mesures :

- LOC
- nombre de fichiers
- dépendances internes
- dépendances externes

---

# Formule de score recommandée

```text
ScoreGlobal =
  15% API
+ 10% React
+ 20% Complexité cyclomatique
+ 25% Accessibilité
+ 20% Interactions clavier
+ 10% Tests
```

Classification :

```text
0-20   Simple
21-40  Faible
41-60  Modéré
61-80  Complexe
81-100 Très complexe
```

---

# Sorties attendues

## JSON

```json
{
  "component":"TreeView",
  "score":95
}
```

## CSV

```csv
Component,Score
TreeView,95
```

## HTML

Contenu :

- dashboard
- top composants complexes
- tendances
- radar par composant
- histogrammes

---

# Configuration

Fichier : analyzer.config.json

```json
{
  "sourceFolders": ["libs"],
  "thresholds": {
    "warning": 70,
    "error": 90
  }
}
```

---

# Intégration Jenkins

Étapes :

1. npm ci
2. npm run lint
3. npm run test
4. npm run build
5. npm run analyze
6. publication des rapports HTML
7. archivage JSON/CSV

---

# Documentation

## Standard TSDoc obligatoire

Chaque élément exporté doit posséder :

- description
- @param
- @returns
- @example

Exemple :

```ts
/**
 * Calcule le score global d'un composant.
 *
 * @param input Données analysées.
 * @returns Score calculé.
 *
 * @example
 * computeScore(data)
 */
```

## Génération

```bash
npx typedoc
```

---

# Vision Produit

Le résultat attendu n'est pas uniquement un outil technique.

L'application doit permettre :

- d'objectiver les estimations ;
- d'identifier les composants stratégiques ;
- de suivre la dette technique ;
- d'alimenter les roadmaps ;
- de comparer les versions successives d'une librairie ;
- de valoriser l'effort lié aux composants RGAA/WAI-ARIA les plus sophistiqués (TreeView, ComboBox, DataTable, DatePicker, etc.).
