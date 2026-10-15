# Dossier d'Architecture et Cahier des Charges V2

# Frontend Complexity Analyzer

## 1. Vision

Construire une plateforme d'analyse automatique de la complexité des composants React utilisés dans les librairies Design System de l'entreprise.

Objectifs :

- Objectiver les estimations.
- Identifier les composants stratégiques.
- Mesurer le coût de maintenance.
- Valoriser l'effort RGAA/WAI-ARIA.
- Alimenter les roadmaps produit et techniques.
- Fournir des indicateurs utilisables en CI/CD.

---

# 2. Périmètre

Analyse de :

- React
- TypeScript
- TSX
- Jest
- Vitest
- Playwright
- Storybook
- Documentation TSDoc

Hors périmètre V1 :

- Angular
- VueJS
- Applications métier

---

# 3. Architecture cible

```text
CLI
 |
 v
Configuration Layer
 |
 +-- Scanner
 +-- AST Engine
 +-- Metric Engine
 +-- Scoring Engine
 +-- Trend Engine
 |
 +-- Report JSON
 +-- Report CSV
 +-- Report HTML
 +-- Jenkins Export
 +-- Sonar Export
```

---

# 4. Modules

## scanner

Responsabilités :

- découverte des composants
- découverte des tests
- découverte des stories
- détection des librairies

## ast-engine

Responsabilités :

- parsing TS
- parsing TSX
- extraction informations composant

Technologie :

- ts-morph

## metrics-engine

Responsabilités :

Calcul des métriques.

## scoring-engine

Responsabilités :

Transformation métriques → score.

## report-engine

Responsabilités :

Production :

- JSON
- CSV
- HTML
- Markdown

---

# 5. Modèle de données

```ts
interface ComponentReport {
  name: string;
  category: string;
  score: number;
  apiScore: number;
  accessibilityScore: number;
  interactionScore: number;
  codeScore: number;
  testScore: number;
}
```

---

# 6. Métriques API

Mesurer :

- nombre de props
- callbacks
- interfaces publiques
- types génériques
- profondeur configuration
- événements exposés

Exemple :

```ts
interface ComboboxProps {
  value:string;
  options:Option[];
  onChange():void;
}
```

---

# 7. Métriques React

Mesurer :

- useState
- useEffect
- useReducer
- useMemo
- useCallback
- useRef
- forwardRef
- memo

---

# 8. Complexité cyclomatique

Mesurer :

- if
- else if
- switch
- case
- catch
- &&
- ||
- ternaires

Formule :

```text
CC = 1 + branches
```

---

# 9. Accessibilité

## Attributs ARIA

- aria-label
- aria-labelledby
- aria-controls
- aria-expanded
- aria-selected
- aria-activedescendant

## Rôles

- button
- dialog
- menu
- tree
- treeitem
- listbox
- option
- tab
- combobox

## Focus

Détection :

- focus()
- blur()
- tabIndex

---

# 10. Interactions clavier

Détection :

```text
ArrowUp
ArrowDown
ArrowLeft
ArrowRight
Enter
Escape
Space
Tab
Home
End
PageUp
PageDown
```

Scoring majoré pour TreeView, Menu et ComboBox.

---

# 11. Analyse Jest / Vitest

Mesures :

- fichiers de tests
- describe
- it
- test
- expect

Ratios :

```text
Tests / Props
Tests / LOC
```

---

# 12. Analyse Playwright

Mesures :

- scénarios
- interactions clavier
- interactions souris
- focus management

Détection :

```ts
page.keyboard.press()
page.locator()
page.click()
```

---

# 13. Analyse Storybook

Mesures :

- nombre de stories
- variantes
- états documentés

Fichiers :

```text
*.stories.tsx
```

---

# 14. Score global

```text
15% API
10% React
20% Complexité
25% Accessibilité
20% Clavier
10% Tests
```

Classification :

```text
0-20 Simple
21-40 Faible
41-60 Modéré
61-80 Complexe
81-100 Très complexe
```

---

# 15. Catégories Design System

## Niveau 1

- Button
- Link
- Badge
- Tag

## Niveau 2

- Modal
- Tabs
- Accordion

## Niveau 3

- Select
- Menu
- DatePicker

## Niveau 4

- Combobox
- TreeView
- DataTable

---

# 16. Dashboard HTML

Pages :

## Vue globale

- score global
- composants les plus complexes
- tendances

## Vue composant

- radar
- détails métriques
- score historique

## Vue accessibilité

- classement ARIA
- classement clavier

---

# 17. Historisation

Conserver les rapports JSON.

Structure :

```text
history/
  2026-10-01.json
  2026-11-01.json
```

Produire :

- évolution score
- dette technique

---

# 18. Jenkins

Pipeline :

```groovy
stage('Lint')
stage('Tests')
stage('Build')
stage('Analyze')
stage('Publish')
```

Artefacts :

- report.json
- report.csv
- report.html

---

# 19. SonarQube

Exporter :

- Generic Issues
- Mesures personnalisées

---

# 20. CLI

```bash
analyzer analyze
analyzer compare
analyzer report
analyzer history
```

Exemples :

```bash
analyzer analyze --config config.json
analyzer compare report1.json report2.json
```

---

# 21. Documentation

## Standard TSDoc obligatoire

Chaque export public documenté.

```ts
/**
 * Analyse un composant React.
 *
 * @param file Fichier source.
 * @returns Rapport.
 */
```

Génération :

```bash
npx typedoc
```

---

# 22. Backlog initial

## Epic 1

Framework d'analyse.

### US 1.1

Scanner les composants.

### US 1.2

Parser TSX.

---

## Epic 2

Métriques.

### US 2.1

Analyser les props.

### US 2.2

Analyser ARIA.

### US 2.3

Analyser clavier.

---

## Epic 3

Reporting.

### US 3.1

JSON.

### US 3.2

CSV.

### US 3.3

HTML.

---

## Epic 4

CI/CD.

### US 4.1

Jenkins.

### US 4.2

Publication artefacts.

---

# 23. Critères d'acceptation

- analyse de plusieurs librairies
- configuration externe
- score reproductible
- rapports générés automatiquement
- intégration Jenkins
- couverture de tests > 80%
- documentation TypeDoc générée
- exécution inférieure à 5 minutes sur une librairie standard

---

# 24. Livrables attendus

- code source TypeScript
- documentation architecture
- documentation développeur
- guide utilisateur
- Jenkinsfile exemple
- Dockerfile
- rapports exemple
- jeu de données démonstration
- documentation TypeDoc

---

# 25. Vision Long Terme

Le produit doit devenir l'outil de référence permettant de mesurer la valeur patrimoniale, la complexité technique et le coût de maintenance des composants Design System de la Squad Communs du Dev.