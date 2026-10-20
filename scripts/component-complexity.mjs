/**
 * component-complexity.mjs
 * ------------------------------------------------------------------
 * Analyse la complexité de mise en œuvre des composants React d'une
 * librairie TypeScript (Vanilla : aucune dépendance de runtime).
 *
 * Prérequis :  npm i -D typescript
 * Usage :      node scripts/component-complexity.mjs --src ./src --out ./complexity-report.json
 *              node scripts/component-complexity.mjs --src ./src --effort ./effort-anchors.json
 *              node scripts/component-complexity.mjs --src ./src --effort ./a.json --overhead 0.5 --lot-rate 0.5
 *              (--effort : estime les jours de traitement de TOUS les
 *               composants en calibrant une interpolation sur des durées
 *               réelles, ex. {"comboBox":6,"tabs":3,"button":1}
 *               --overhead  : coût fixe j/composant (hors ancres)
 *               --lot-rate  : coût marginal des composants ex æquo (0-1)
 *
 * Principe :
 *   1. Parcourt les fichiers .ts/.tsx et regroupe par composant
 *      (src/components/<Catégorie>/<Composant>/, ou catégorie plate).
 *   2. Extrait des métriques objectives via l'API TypeScript (AST).
 *   3. Construit le graphe de dépendances (fan-in / fan-out, modules
 *      partagés).
 *   4. Normalise chaque métrique sur 1-5, agrège avec des poids et
 *      produit un classement continu : indice pondéré + rang centile
 *      (pas de tiers, pas d'effet de frontière).
 *
 * Sorties : JSON détaillé, table console, Markdown prêt à coller
 * dans un README, et CSV pour les tableurs (pivots, filtrage).
 * ------------------------------------------------------------------
 */

import ts from "typescript";
import fs from "node:fs";
import path from "node:path";

/* ----------------------------------------------------------------- */
/* Configuration — ajustez ces valeurs à votre contexte               */
/* ----------------------------------------------------------------- */

const args = process.argv.slice(2);
const getArg = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const CONFIG = {
  srcDir: getArg("--src", "./src"),
  outFile: getArg("--out", "./complexity-report.json"),
  // Poids de l'agrégation (somme libre, normalisée automatiquement)
  weights: {
    code: 0.35,         // complexité cyclomatique + LOC
    interactions: 0.25, // handlers clavier/focus, hooks d'état
    a11y: 0.30,         // densité ARIA (rôles, aria-*, focus management)
    structure: 0.10,    // dépendances (fan-out) + surface d'API (props)
  },
  // Bornes de normalisation 1-5 par métrique, calibrées sur les
  // valeurs observées dans la librairie (rapport du 2026-10-20).
  bounds: {
    cyclomatic: [5, 100],      // observé : 3-113
    loc: [50, 1200],           // observé : ~30-2000
    keyboardHandlers: [0, 4],  // observé : 0-4
    ariaCount: [0, 17],        // observé : 0-17
    hooks: [0, 18],            // observé : 0-18
    fanOut: [0, 9],            // observé : 0-9
    propsCount: [0, 40],        // observé : 0-38 (rapport du 2026-10-20)
  },
  // Pas de seuils de tier : le classement est continu.
  // Chaque composant reçoit son rang (1 = plus complexe) et son
  // percentile (0-100 : part des composants moins complexes que lui).
};

/* ----------------------------------------------------------------- */
/* Collecte des fichiers                                              */
/* ----------------------------------------------------------------- */

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

/* ----------------------------------------------------------------- */
/* Métriques par fichier (analyse AST)                                */
/* ----------------------------------------------------------------- */

const DECISION_KINDS = new Set([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ConditionalExpression,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.CaseClause,
  ts.SyntaxKind.BinaryExpression,
  ts.SyntaxKind.CatchClause,
]);

const ARIA_RE = /aria-|^role$|tabIndex|ariaLive/;
const KEYBOARD_RE = /onKey|onFocus|onBlur/;
const POINTER_RE = /onClick|onMouse|onPointer|onTouch/;
const STATE_HOOKS_RE = /use(State|Reducer|Effect|Memo|Callback|Ref|Context|Id)/;

function isBinaryDecision(node) {
  return (
    node.kind === ts.SyntaxKind.BinaryExpression &&
    (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
      node.operatorToken.kind === ts.SyntaxKind.BarBarToken)
  );
}

function analyzeFile(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

  const m = {
    files: 1,
    loc: 0,
    cyclomatic: 1,          // base 1 : un seul chemin sans décision
    keyboardHandlers: 0,
    pointerHandlers: 0,
    ariaCount: 0,
    hooks: 0,
    propsFromTypes: 0,
    propsFromBindings: 0,
    imports: [],
  };

  m.loc = source.split("\n").filter((l) => l.trim() && !l.trim().startsWith("//")).length;

  const visit = (node) => {
    if (DECISION_KINDS.has(node.kind) &&
      (node.kind !== ts.SyntaxKind.BinaryExpression || isBinaryDecision(node))) {
      m.cyclomatic += 1;
    }

    // JSX attributes : handlers, ARIA
    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sf);
      if (KEYBOARD_RE.test(name)) m.keyboardHandlers += 1;
      else if (POINTER_RE.test(name)) m.pointerHandlers += 1;
      if (ARIA_RE.test(name)) m.ariaCount += 1;
    }

    // Identifiants ARIA écrits en spread ou objets : role="...", tabIndex
    if (ts.isPropertyAssignment(node)) {
      const name = node.name.getText(sf).replace(/^["']|["']$/g, "");
      if (ARIA_RE.test(name)) m.ariaCount += 1;
    }

    // Hooks d'état / d'effet
    if (ts.isCallExpression(node)) {
      const expr = node.expression.getText(sf);
      if (STATE_HOOKS_RE.test(expr)) m.hooks += 1;
    }

    // Surface d'API : props déclarées en interface OU en alias de type
    // (type XProps = { ... }), destructurées en signature de composant.
    // Les deux sources ne s'additionnent pas : la déclaration de type
    // (surface complète) est préférée ; la destructuration (sous-
    // ensemble) ne sert que de repli si aucune n'est trouvée.
    if (ts.isInterfaceDeclaration(node) && /Props|Options|Config|Attributes|Params/i.test(node.name.text)) {
      m.propsFromTypes += node.members.length;
    }
    if (ts.isTypeAliasDeclaration(node) &&
        /Props|Options|Config|Attributes|Params/i.test(node.name.text) &&
        ts.isTypeLiteralNode(node.type)) {
      m.propsFromTypes += node.type.members.length;
    }
    // Props destructurées : function X({ a, b, ...rest }: Props) —
    // compte les éléments du binding pattern du premier paramètre des
    // fonctions/composants du fichier.
    if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) &&
        node.parameters.length > 0 &&
        ts.isObjectBindingPattern(node.parameters[0].name)) {
      m.propsFromBindings += node.parameters[0].name.elements.length;
    }

    // Imports résolus (relatifs uniquement = interne à la lib)
    if (ts.isImportDeclaration(node) && node.moduleSpecifier) {
      const spec = node.moduleSpecifier.text;
      if (spec.startsWith(".")) m.imports.push(path.resolve(path.dirname(filePath), spec));
    }

    ts.forEachChild(node, visit);
  };
  visit(sf);

  // Barrel : fichier ne contenant QUE des imports / re-exports.
  // (export const X = ... est un VariableStatement : du vrai code,
  //  donc un composant écrit entièrement dans index.tsx reste analysé.)
  m.isBarrel = sf.statements.length > 0 && sf.statements.every((st) =>
    ts.isImportDeclaration(st) ||
    ts.isExportDeclaration(st) ||
    st.kind === ts.SyntaxKind.ExportAssignment
  );

  // Surface d'API retenue : déclaration de type si présente, sinon
  // destructuration observée en signature.
  m.propsCount = m.propsFromTypes > 0 ? m.propsFromTypes : m.propsFromBindings;

  return m;
}

/* ----------------------------------------------------------------- */
/* Regroupement par composant                                         */
/*                                                                   */
/* Structure attendue :                                               */
/*   src/components/<Catégorie>/<Composant>/**  -> un composant        */
/*   src/components/<Catégorie>/** (plate)       -> un composant       */
/*     (fichiers directement dans le dossier, index.ts inclus :        */
/*      ré-exports et sous-fichiers sont rattachés à la catégorie)     */
/*   Tout ce qui est hors src/components/** (contexts, hooks,        */
/*   internal, utils…) forme une unité partagée par dossier racine   */
/*   (ex. src/hooks/** -> "hooks"), classée et estimée comme un      */
/*   composant (catégorie "shared"). Les dépendances d'un composant   */
/*   vers ces unités comptent dans son fan-out ET dans son           */
/*   sharedDeps ; les barrels partagés (ex. src/hooks/index.ts) ne   */
/*   contribuent qu'au graphe de dépendances.                        */
/* ----------------------------------------------------------------- */

/** Fichiers à exclure de l'analyse (tests). */
const EXCLUDE_RE = /\.(e2e|test|spec)\.(ts|tsx)$/;

/**
 * Renvoie le nom de l'unité pour un fichier, ou null pour le barrel
 * racine (components/index.ts).
 *
 * Règles (relatif à src/) :
 *   <dir>/<fichier>                     -> <dir> (unité partagée, hors components)
 *   <fichier> à la racine de src/       -> <fichier> sans extension (unité propre)
 *   components/index.ts                  -> null (barrel racine)
 *   components/<Cat>/<fichier>           -> <Cat> (catégorie plate fusionnée)
 *   components/<Cat>/<Compo>/<fichier>   -> <Compo> (index.ts compris)
 *   components/<Cat>/<fichier>           -> <Cat> SI la catégorie contient un
 *                                           sous-dossier composant du même nom
 *                                           (ex. dialog/DialogHeader.tsx ->
 *                                           composant dialog/), sinon null
 *                                           (annexe hors composant, ex.
 *                                           formElements/listBoxAndComboBoxBreakPoints.ts)
 *
 * Les barrels (fichiers ne contenant que des imports/re-exports) sont
 * détectés par analyse du contenu, pas par le nom : voir analyzeFile.
 * Un barrel de catégorie est ignoré ; un barrel de composant ne
 * contribue qu'au graphe de dépendances (métriques nulles).
 */

/* Pré-passe sur l'arborescence (déclarée plus bas, après la collecte
 * `files`) :
 * - categoriesWithComponents : catégories contenant des sous-dossiers composants
 * - componentDirs : noms de ces composants (dossiers de niveau 2)
 */

function componentNameFor(relPath) {
  const parts = relPath.split(path.sep);
  if (parts[0] !== "components") {
    // Infrastructure partagée (contexts, hooks, internal, utils…) :
    // incluse dans le classement comme une unité à part entière,
    // nommée d'après son dossier racine sous src/ (ex. src/hooks/**
    // -> "hooks"). Un fichier directement à la racine de src/ forme
    // sa propre unité (nom de fichier sans extension).
    return parts.length === 1
      ? parts[0].replace(/\.(ts|tsx)$/, "")
      : parts[0];
  }

  const dirs = parts.slice(1, -1); // ex. ["formElements", "comboBox"]

  if (dirs.length === 0) return null; // components/index.ts
  if (dirs.length === 1) {
    // Fichier à la racine d'une catégorie
    if (!categoriesWithComponents.has(dirs[0])) return dirs[0]; // catégorie plate
    // Catégorie à composants : le fichier n'est un composant que si un
    // sous-dossier composant porte le même nom (annexes de la famille,
    // ex. dialog/DialogHeader.tsx -> composant dialog/). Sinon c'est
    // une annexe hors composant : ignorée.
    return componentDirs.has(dirs[0]) ? dirs[0] : null;
  }
  return dirs[dirs.length - 1]; // composant (niveau le plus profond)
}

/** Renvoie la catégorie d'appartenance d'un fichier sous components/. */
function categoryFor(relPath) {
  const parts = relPath.split(path.sep);
  if (parts[0] !== "components") return "shared"; // infrastructure partagée
  return parts.length >= 2 ? parts[1] : null;
}

/** Renvoie la clé de dépendance pour un import résolu. */
function dependencyKeyFor(relPath) {
  return componentNameFor(relPath); // composant OU unité partagée
}

const files = walk(CONFIG.srcDir);
if (files.length === 0) {
  console.error(`Aucun fichier .ts/.tsx trouvé dans ${CONFIG.srcDir}`);
  process.exit(1);
}

/* Pré-passe sur l'arborescence :
 * - categoriesWithComponents : catégories contenant des sous-dossiers composants
 *   (components/<Cat>/<Compo>/<fichier>)
 * - componentDirs : noms de ces composants (dossiers de niveau 2)
 */
const categoriesWithComponents = new Set();
const componentDirs = new Set();
for (const f of files) {
  if (EXCLUDE_RE.test(f)) continue;
  const parts = path.relative(CONFIG.srcDir, f).split(path.sep);
  if (parts[0] === "components" && parts.length >= 4) {
    categoriesWithComponents.add(parts[1]);
    componentDirs.add(parts[2]);
  }
}

/* Noms des unités partagées (hors src/components/**) : servent à
 * distinguer, dans le fan-out d'un composant, les dépendances vers
 * l'infrastructure (sharedDeps) des dépendances vers d'autres
 * composants. */
const sharedUnitNames = new Set();
for (const f of files) {
  if (EXCLUDE_RE.test(f)) continue;
  const rel = path.relative(CONFIG.srcDir, f);
  if (rel.split(path.sep)[0] !== "components") {
    const unit = componentNameFor(rel);
    if (unit) sharedUnitNames.add(unit);
  }
}

const components = new Map();  // name -> métriques agrégées (composants uniquement)
const pendingFanIn = [];       // [cible, source] pour imports vers composants non encore visités
const sharedUsage = new Map(); // composant -> Set de modules partagés utilisés

for (const file of files) {
  if (EXCLUDE_RE.test(file)) continue; // tests e2e/unitaires exclus
  const rel = path.relative(CONFIG.srcDir, file);
  const componentName = componentNameFor(rel);
  if (componentName === null) continue; // barrel racine components/index.ts

  const m = analyzeFile(file);
  const category = categoryFor(rel);
  const dirs = rel.split(path.sep).slice(1, -1);

  if (m.isBarrel && (dirs.length === 0 ||
      (dirs.length <= 1 && rel.split(path.sep)[0] === "components"))) {
    // Barrel racine (src/index.ts, components/index.ts) ou de catégorie
    // (ex. components/buttons/index.ts) : ré-export pur, ignoré — ni
    // métriques ni entrée fantôme. Un barrel racine qui ré-exporte
    // toute la librairie n'est pas une unité de travail.
    // (Les barrels de dossier partagé — ex. src/hooks/index.ts — ne sont
    //  pas ignorés : leurs imports comptent dans le fan-out de l'unité.)
    continue;
  }
  if (m.isBarrel) {
    // Barrel de composant (ex. components/<cat>/comboBox/index.ts) :
    // seul son graphe d'imports compte ; métriques neutralisées.
    m.files = 0; m.loc = 0; m.cyclomatic = 0;
  }

  if (!components.has(componentName)) {
    components.set(componentName, {
      name: componentName,
      category,
      files: 0, loc: 0, cyclomatic: 0, keyboardHandlers: 0,
      pointerHandlers: 0, ariaCount: 0, hooks: 0, propsCount: 0,
      importedBy: new Set(),
    });
  }
  const agg = components.get(componentName);
  for (const k of ["files", "loc", "cyclomatic", "keyboardHandlers",
    "pointerHandlers", "ariaCount", "hooks", "propsCount"]) {
    agg[k] += m[k];
  }

  // Fan-out : dépendances internes (autres composants + modules partagés)
  agg.imports = agg.imports || new Set();
  if (!sharedUsage.has(componentName)) sharedUsage.set(componentName, new Set());
  for (const imp of m.imports) {
    const relImp = path.relative(CONFIG.srcDir, imp);
    const target = dependencyKeyFor(relImp);
    if (!target || target === componentName) continue;
    agg.imports.add(target);
    if (sharedUnitNames.has(target)) {
      sharedUsage.get(componentName).add(target);
    } else {
      const dep = components.get(target);
      if (dep) dep.importedBy.add(componentName);
      // cible non encore visitée : file d'attente pour le fan-in
      else pendingFanIn.push([target, componentName]);
    }
  }
}

/* Fan-in différé (imports vers des composants visités après) */
for (const [target, from] of pendingFanIn) {
  const dep = components.get(target);
  if (dep) dep.importedBy.add(from);
}

/* ----------------------------------------------------------------- */
/* Normalisation et agrégation                                        */
/* ----------------------------------------------------------------- */

function norm(value, [min, max]) {
  if (max === min) return 1;
  const clamped = Math.max(min, Math.min(max, value));
  return 1 + (4 * (clamped - min)) / (max - min); // échelle 1-5
}

function percentileFor(indicesDescending, value) {
  // Part (0-100) des composants strictement moins complexes.
  // indicesDescending : indices triés par complexité décroissante.
  const n = indicesDescending.length;
  // Nombre de composants plus complexes = position dans le tri descendant
  let above = 0;
  for (const v of indicesDescending) {
    if (v > value) above++;
    else break;
  }
  // Ex æquo : moyenne des positions possibles
  let equal = 0;
  for (const v of indicesDescending) if (v === value) equal++;
  const below = n - above - equal; // strictement moins complexes
  return Math.round((below / (n - 1)) * 100);
}

const rows = [];
for (const c of components.values()) {
  const fanOut = c.imports ? c.imports.size : 0;
  const fanIn = c.importedBy.size;
  const sharedDeps = sharedUsage.get(c.name) ? sharedUsage.get(c.name).size : 0;

  const codeScore = (
    0.6 * norm(c.cyclomatic, CONFIG.bounds.cyclomatic) +
    0.4 * norm(c.loc, CONFIG.bounds.loc)
  );
  const interactionScore = (
    0.6 * norm(c.keyboardHandlers, CONFIG.bounds.keyboardHandlers) +
    0.4 * norm(c.hooks, CONFIG.bounds.hooks)
  );
  const a11yScore = norm(c.ariaCount, CONFIG.bounds.ariaCount);
  const structureScore = (
    0.5 * norm(fanOut, CONFIG.bounds.fanOut) +
    0.5 * norm(c.propsCount, CONFIG.bounds.propsCount)
  );

  const index =
    CONFIG.weights.code * codeScore +
    CONFIG.weights.interactions * interactionScore +
    CONFIG.weights.a11y * a11yScore +
    CONFIG.weights.structure * structureScore;

  rows.push({
    component: c.name,
    category: c.category || "",
    index: Math.round(index * 100) / 100,
    percentile: 0, // calculé après le tri
    details: {
      files: c.files, loc: c.loc, cyclomatic: c.cyclomatic,
      keyboardHandlers: c.keyboardHandlers, hooks: c.hooks,
      ariaCount: c.ariaCount, propsCount: c.propsCount,
      fanOut, fanIn, sharedDeps,
      subScores: {
        code: Math.round(codeScore * 100) / 100,
        interactions: Math.round(interactionScore * 100) / 100,
        a11y: Math.round(a11yScore * 100) / 100,
        structure: Math.round(structureScore * 100) / 100,
      },
    },
  });
}

rows.sort((a, b) => b.index - a.index);

/* ----------------------------------------------------------------- */
/* Estimation de charge (--effort)                                     */
/*                                                                   */
/* Principe : calibrer la relation indice -> jours sur des durées     */
/* RÉELLES constatées sur quelques composants (points d'ancrage),     */
/* puis extrapoler à l'ensemble du classement.                        */
/*                                                                   */
/* Usage :                                                           */
/*   --effort '{"comboBox":6,"tabs":3,"button":1}'                    */
/*   --effort ./effort-anchors.json   (même format, un objet)        */
/*                                                                   */
/* Modèle : interpolation linéaire par morceaux. Les ancres, triées    */
/* par indice croissant, délimitent des segments ; l'estimation        */
/* interpole entre les deux ancres voisines. Contrairement à une      */
/* régression globale, ce modèle passe EXACTEMENT par chaque ancre :  */
/* le réel et l'estimé coïncident pour tous les composants fournis.   */
/* Hors domaine (indice < première ancre ou > dernière), on extrapole */
/* avec la pente globale (première -> dernière ancre) : plus robuste   */
/* que la pente du segment extrême, très raide si deux ancres sont    */
/* voisines en indice mais éloignées en jours.                        */
/*                                                                   */
/* Cas particuliers :                                                 */
/*   - 1 ancre      : durée constante (avec avertissement).           */
/*   - 2 ancres     : droite passant par les deux points.             */
/*   - indices égaux avec jours différents : fit impossible, on       */
/*     prend la moyenne et on avertit (l'indice seul ne suffit pas    */
/*     à les distinguer).                                            */
/*                                                                   */
/* Fiabilité : avec < 4 ancres, l'estimation est indicative ;         */
/* 4 à 6 ancres réparties sur l'échelle (1 très simple, 1-2 moyens,   */
/* 1-2 complexes, idéalement 1 très complexe) donnent une base        */
/* solide. Le rapport liste chaque ancre (réel = estimé) pour         */
/* vérification.                                                     */
/* ----------------------------------------------------------------- */

function parseEffortArg(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    try { return JSON.parse(trimmed); } catch { return null; }
  }
  // Format inline "comboBox:6,tabs:3"
  const out = {};
  for (const pair of trimmed.split(",")) {
    const [k, v] = pair.split(":");
    if (k && v && !Number.isNaN(Number(v))) out[k.trim()] = Number(v);
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Interpolation linéaire par morceaux sur des points (x, y) triés par x.
 * Hors domaine : prolongation de la corde globale (première -> dernière
 * ancre), plus stable que le segment extrême quand deux ancres sont
 * voisines en indice mais éloignées en jours.
 * Renvoie null si les x ne sont pas uniques (fit ambigu).
 */
function buildInterpolator(points) {
  // points : [{ x, y }] triés par x croissant
  const n = points.length;
  if (n === 0) return null;
  if (n === 1) return { segments: null, constant: points[0].y };
  for (let i = 1; i < n; i++) {
    if (points[i].x === points[i - 1].x) return null; // x dupliqués
  }
  const slope = (i) => (points[i].y - points[i - 1].y) / (points[i].x - points[i - 1].x);
  const globalSlope = (points[n - 1].y - points[0].y) / (points[n - 1].x - points[0].x);
  const predict = (x) => {
    if (x <= points[0].x) return points[0].y + globalSlope * (x - points[0].x);
    if (x >= points[n - 1].x) return points[n - 1].y + globalSlope * (x - points[n - 1].x);
    // Interpolation stricte : segment [i-1, i] tel que x(i-1) <= x < x(i)
    for (let i = 1; i < n; i++) {
      if (x < points[i].x) return points[i - 1].y + slope(i) * (x - points[i - 1].x);
    }
    return points[n - 1].y; // x exactement égal au dernier point
  };
  return { segments: n - 1, constant: null, predict };
}

/* ----------------------------------------------------------------- */
/* Échelle de Fibonacci (story points)                                */
/*                                                                   */
/* Échelle standard de planning poker : 0.5 (demi-point), puis la      */
/* suite de Fibonacci 1, 2, 3, 5, 8, 13, 21… prolongée tant que       */
/* nécessaire.                                                        */
/* Attribution au point le plus proche en distance géométrique :      */
/* fibFor(d) = la valeur F minimisant |ln(d / F)|. Sur une échelle   */
/* exponentielle, c'est le choix naturel (une distance absolue        */
/* écraserait les petits points au profit des grands).               */
/* Exemples : 0.7 j -> 0.5 ; 1.9 j -> 2 ; 3.8 j -> 3 ; 5.9 j -> 5.    */
/* Les points s'additionnent par lot (contrairement aux jours, qui    */
/* se lisent individuellement) : c'est la mesure de "vélocité".       */
/* ----------------------------------------------------------------- */

function buildFibonacciScale() {
  // Demi-point, puis suite de Fibonacci classique (1, 2, 3, 5, 8…)
  const scale = [0.5, 1, 2, 3];
  while (scale[scale.length - 1] < 1e6) {
    scale.push(scale[scale.length - 1] + scale[scale.length - 2]);
  }
  return scale;
}

const FIB_SCALE = buildFibonacciScale();

function fibFor(days) {
  if (days <= 0) return 0;
  let best = FIB_SCALE[0];
  let bestDist = Infinity;
  for (const f of FIB_SCALE) {
    const dist = Math.abs(Math.log(days / f));
    if (dist < bestDist) { bestDist = dist; best = f; }
    else break; // échelle croissante : plus besoin de chercher
  }
  return best;
}

let effort = null;
const effortRaw = getArg("--effort", null);
if (effortRaw) {
  const anchors = parseEffortArg(effortRaw);
  if (!anchors) {
    console.error("✖ --effort : format invalide. Attendu JSON objet composant→jours, inline \"comboBox:6,tabs:3\" ou chemin de fichier.");
    process.exit(1);
  }
  const indexByName = new Map(rows.map((r) => [r.component.toLowerCase(), r]));
  const missing = [];
  const anchorPoints = []; // { name, x, days }
  for (const [name, days] of Object.entries(anchors)) {
    const row = indexByName.get(name.toLowerCase());
    if (!row) { missing.push(name); continue; }
    anchorPoints.push({ name, x: row.index, days: Number(days) });
  }
  if (missing.length > 0) {
    console.warn(`⚠ Ancres inconnues (absentes du rapport) : ${missing.join(", ")}`);
  }
  if (anchorPoints.length < 1) {
    console.error("✖ --effort : au moins 1 ancre valide est nécessaire.");
    process.exit(1);
  }
  if (anchorPoints.length < 4) {
    console.warn(`⚠ Seulement ${anchorPoints.length} ancre(s) : estimation indicative. Visez 4-6 ancres réparties sur l'échelle de complexité.`);
  }

  anchorPoints.sort((a, b) => a.x - b.x || a.days - b.days);

  // Ancres avec le même indice mais des jours différents : la relation
  // indice -> jours est ambiguë ; on moyenne et on avertit.
  const deduped = [];
  for (const p of anchorPoints) {
    const last = deduped[deduped.length - 1];
    if (last && last.x === p.x) {
      const same = anchorPoints.filter((q) => q.x === p.x);
      if (last.merged !== true) {
        console.warn(`⚠ Ancres au même indice (${p.x}) avec des jours différents (${same.map((q) => `${q.name}=${q.days}`).join(", ")}) : moyenne utilisée.`);
        last.merged = true;
      }
      last.days = same.reduce((s, q) => s + q.days, 0) / same.length;
    } else {
      deduped.push({ ...p });
    }
  }

  const interp = buildInterpolator(deduped.map((p) => ({ x: p.x, y: p.days })));
  if (!interp) {
    console.error("✖ --effort : ancres incohérentes (indices identiques, jours différents) — impossible de faire passer le modèle par tous les points.");
    process.exit(1);
  }
  if (interp.constant !== null) {
    console.warn(`⚠ Une seule ancre (indice ${deduped[0].x} -> ${deduped[0].days} j) : durée constante appliquée à tous les composants.`);
  }

  effort = {
    model: interp.constant !== null ? "constant" : "piecewise-linear",
    segments: interp.segments,
    anchors: Object.fromEntries(
      anchorPoints.map((p) => [p.name, {
        index: p.x,
        days: p.days,
        estimated: Math.round(interp.predict(p.x) * 10) / 10,
      }])
    ),
    anchorsCount: anchorPoints.length,
  };

  // Domaine couvert par les ancres : en dehors, l'estimation est une
  // extrapolation (corde globale), moins fiable qu'une interpolation.
  const anchorMinX = Math.min(...deduped.map((p) => p.x));
  const anchorMaxX = Math.max(...deduped.map((p) => p.x));

  // --overhead N : coût fixe incompressible par composant (audit,
  // tests, doc, storybook). Il est appliqué à tous les composants
  // SAUF les ancres : leurs jours réels incluent déjà ce coût, on
  // ne les retouche donc pas (days == estimated reste garanti).
  const overheadRaw = getArg("--overhead", null);
  let overhead = 0;
  if (overheadRaw !== null) {
    overhead = Number(overheadRaw);
    if (Number.isNaN(overhead) || overhead < 0) {
      console.error("✖ --overhead : valeur invalide (nombre de jours >= 0 attendu).");
      process.exit(1);
    }
    console.warn(`⚠ Coût fixe de ${overhead} j ajouté à chaque composant non-ancre (les ancres gardent leur durée réelle).`);
  }

  const anchorNames = new Set(anchorPoints.map((p) => p.name.toLowerCase()));
  for (const r of rows) {
    const raw = Math.max(0, interp.predict(r.index)); // plancher 0
    const fixed = anchorNames.has(r.component.toLowerCase()) ? 0 : overhead;
    r.estimatedDays = Math.round((raw + fixed) * 10) / 10;
    r.effortBasis = (r.index < anchorMinX || r.index > anchorMaxX) ? "extrapolated" : "interpolated";
    r.fibonacci = fibFor(r.estimatedDays);
  }
  effort.overhead = overhead;
  effort.extrapolatedCount = rows.filter((r) => r.effortBasis === "extrapolated").length;
  effort.totalDays = Math.round(rows.reduce((s, r) => s + r.estimatedDays, 0) * 10) / 10;
  effort.meanDays = Math.round((effort.totalDays / rows.length) * 10) / 10;

  /* Agrégats par catégorie : découpage direct en lots de travail. */
  const byCategory = {};
  for (const r of rows) {
    const cat = r.category || "(sans catégorie)";
    if (!byCategory[cat]) byCategory[cat] = { components: 0, days: 0, points: 0 };
    byCategory[cat].components += 1;
    byCategory[cat].days = Math.round((byCategory[cat].days + r.estimatedDays) * 10) / 10;
    byCategory[cat].points += r.fibonacci;
  }
  effort.byCategory = Object.fromEntries(
    Object.entries(byCategory).sort((a, b) => b[1].days - a[1].days)
  );
  effort.totalPoints = rows.reduce((s, r) => s + r.fibonacci, 0);

  /* Validation croisée leave-one-out (>= 4 ancres dédupliquées) :
   * retirer chaque ancre, recalibrer sans elle, prédire son jour réel.
   * L'erreur absolue moyenne (MAE) mesure honnêtement la fiabilité
   * du modèle avec peu de données — plus utile qu'un R² sur 3 points. */
  if (deduped.length >= 4 && interp.segments !== null) {
    const errors = [];
    for (const p of deduped) {
      const others = deduped.filter((q) => q !== p).map((q) => ({ x: q.x, y: q.days }));
      const loo = buildInterpolator(others);
      if (!loo || loo.constant !== null) continue; // retrait ambigu : ignoré
      errors.push({ anchor: p.name, actual: p.days, predicted: Math.round(loo.predict(p.x) * 10) / 10 });
    }
    if (errors.length > 0) {
      const mae = errors.reduce((s, e) => s + Math.abs(e.actual - e.predicted), 0) / errors.length;
      effort.crossValidation = {
        method: "leave-one-out",
        errors: errors.map((e) => ({ ...e, absError: Math.round(Math.abs(e.actual - e.predicted) * 10) / 10 })),
        mae: Math.round(mae * 10) / 10,
      };
    }
  }

  /* Gain de groupement de la longue traîne : les composants ex æquo
   * (même indice = même profil de traitement) partagent l'audit et
   * les patterns. Le 1er coûte son estimation pleine, les suivants
   * un coût marginal (--lot-rate, 0-1, défaut 0.5 = 50 %). */
  const lotRateRaw = getArg("--lot-rate", null);
  let lotRate = 0.5;
  if (lotRateRaw !== null) {
    lotRate = Number(lotRateRaw);
    if (Number.isNaN(lotRate) || lotRate < 0 || lotRate > 1) {
      console.error("✖ --lot-rate : valeur invalide (taux 0-1 attendu, ex. 0.5).");
      process.exit(1);
    }
  }
  const byIndex = new Map(); // index -> [rows]
  for (const r of rows) byIndex.set(r.index, [...(byIndex.get(r.index) || []), r]);
  let lotTotal = 0;
  for (const group of byIndex.values()) {
    group.forEach((r, i) => {
      const factor = i === 0 ? 1 : lotRate;
      lotTotal += Math.max(0, Math.round((interp.predict(r.index) + overhead) * 10) / 10) * factor;
    });
  }
  // Le total "lot" n'a de sens que s'il existe effectivement des ex æquo.
  const groups = [...byIndex.values()].filter((g) => g.length > 1);
  if (groups.length > 0 && lotRate < 1) {
    effort.lotEstimate = {
      marginalRate: lotRate,
      groupsCount: groups.length,
      componentsGrouped: groups.reduce((s, g) => s + g.length, 0),
      totalDays: Math.round(lotTotal * 10) / 10,
      savingDays: Math.round((effort.totalDays - lotTotal) * 10) / 10,
    };
  }
}

/* Rang (1 = plus complexe) et percentile, calculés après le tri.
 * Le percentile se lit : "X % des composants sont moins complexes". */
const sortedValues = rows.map((r) => r.index);
rows.forEach((r, i) => {
  r.rank = i + 1;
  r.percentile = percentileFor(sortedValues, r.index);
});

/* ----------------------------------------------------------------- */
/* Sorties : JSON, console, Markdown                                   */
/* ----------------------------------------------------------------- */

const report = {
  generatedAt: new Date().toISOString(),
  config: CONFIG,
  ...(effort ? { effort } : {}),
  ranking: rows,
};
fs.writeFileSync(CONFIG.outFile, JSON.stringify(report, null, 2), "utf8");

console.log("\nClassement de complexité de mise en œuvre\n");
console.table(
  rows.map((r) => ({
    Composant: r.component,
    Indice: r.index,
    Pct: `${r.percentile}%`,
    ...(r.estimatedDays !== undefined ? {
      Jours: `${r.estimatedDays}${r.effortBasis === "extrapolated" ? "*" : ""}`,
      Pts: r.fibonacci,
    } : {}),
    Code: r.details.subScores.code,
    Interac: r.details.subScores.interactions,
    A11y: r.details.subScores.a11y,
    Struct: r.details.subScores.structure,
  }))
);
if (effort) {
  const modelLabel = effort.model === "constant"
    ? "constante"
    : `interpolation par morceaux, ${effort.segments} segment(s)`;
  console.log(`\nCharge estimée (modèle : ${modelLabel}, ${effort.anchorsCount} ancres)`);
  console.log(`  Total : ${effort.totalDays} jours — Moyenne : ${effort.meanDays} jours/composant`);
  console.log(`  Total vélocité : ${effort.totalPoints} points (échelle de Fibonacci 0.5, 1, 2, 3, 5, 8…)`);
  console.log(`  * estimation extrapolée (hors domaine des ancres) : ${effort.extrapolatedCount} composant(s)`);
  if (effort.overhead > 0) console.log(`  Coût fixe par composant : ${effort.overhead} j (hors ancres)`);
  if (effort.crossValidation) {
    console.log(`  Validation croisée leave-one-out : MAE = ${effort.crossValidation.mae} j`);
    for (const e of effort.crossValidation.errors) {
      console.log(`    ${e.anchor} : réel ${e.actual} j / prédit sans cette ancre ${e.predicted} j`);
    }
  }
  if (effort.lotEstimate) {
    const l = effort.lotEstimate;
    console.log(`  Traitement en lot des ${l.componentsGrouped} composants ex æquo (${l.groupsCount} groupes, coût marginal ${Math.round(l.marginalRate * 100)} %) : ${l.totalDays} j (économie ${l.savingDays} j)`);
  }
  console.log("  Charge par catégorie :");
  for (const [cat, agg] of Object.entries(effort.byCategory)) {
    console.log(`    ${cat.padEnd(24)} ${String(agg.components).padStart(2)} composant(s) — ${agg.days} j — ${agg.points} pts`);
  }
  for (const [name, a] of Object.entries(effort.anchors)) {
    console.log(`  Ancre ${name} : réel ${a.days} j / estimé ${a.estimated} j`);
  }
}

const md = [
  "## Indice de complexité des composants\n",
  `| Rang | Composant | Catégorie | Indice /5 | Percentile |${effort ? " Jours | Pts |" : ""} Cyclomatic | LOC | ARIA | Clavier | Props | Fan-out |`,
  `|---|---|---|---|---|${effort ? "---|---|" : ""}---|---|---|---|---|---|`,
  ...rows.map((r) =>
    `| ${r.rank} | ${r.component} | ${r.category} | ${r.index} | ${r.percentile}% |${effort ? ` ${r.estimatedDays}${r.effortBasis === "extrapolated" ? "\\*" : ""} | ${r.fibonacci} |` : ""} ${r.details.cyclomatic} | ${r.details.loc} | ${r.details.ariaCount} | ${r.details.keyboardHandlers} | ${r.details.propsCount} | ${r.details.fanOut} |`
  ),
  ...(effort ? [
    "",
    `**Charge totale estimée : ${effort.totalDays} jours / ${effort.totalPoints} points** (modèle : ${effort.model === "constant" ? "constante" : `interpolation par morceaux, ${effort.segments} segment(s)`}, ${effort.anchorsCount} ancres réelles${effort.overhead > 0 ? `, coût fixe ${effort.overhead} j/composant hors ancres` : ""}). Les points suivent l'échelle de Fibonacci (0.5, 1, 2, 3, 5, 8…) : c'est l'unité de vélocité, additive par lot.`,
    "",
    `\\* Estimation extrapolée (hors domaine couvert par les ancres) : ${effort.extrapolatedCount} composant(s), à considérer avec prudence.`,
    ...(effort.crossValidation ? [
      "",
      `Validation croisée (leave-one-out) : erreur absolue moyenne **${effort.crossValidation.mae} j**. ${effort.crossValidation.errors.map((e) => `${e.anchor} : réel ${e.actual} j / prédit ${e.predicted} j`).join(" ; ")}.`,
    ] : []),
    ...(effort.lotEstimate ? [
      "",
      `Traitement en lot des composants ex æquo (${effort.lotEstimate.componentsGrouped} composants, ${effort.lotEstimate.groupsCount} groupes, coût marginal ${Math.round(effort.lotEstimate.marginalRate * 100)} %) : **${effort.lotEstimate.totalDays} j**, économie de ${effort.lotEstimate.savingDays} j.`,
    ] : []),
    "",
    "### Charge par catégorie",
    "",
    "| Catégorie | Composants | Jours estimés | Points |",
    "|---|---|---|---|",
    ...Object.entries(effort.byCategory).map(([cat, agg]) =>
      `| ${cat} | ${agg.components} | ${agg.days} | ${agg.points} |`
    ),
  ] : []),
].join("\n");
fs.writeFileSync(
  path.join(path.dirname(CONFIG.outFile) || ".", "complexity-report.md"),
  md, "utf8"
);

/* ----------------------------------------------------------------- */
/* Export CSV (tableur / pivot)                                        */
/*                                                                   */
/* Sortie : complexity-report.csv à côté du JSON. Séparateur virgule  */
/* (standard international, s'ouvre directement dans Excel/LibreOffice ;
 * en France, "Données > Importer" si le séparateur régional est ";"  */
/* est un paramètre tableur, pas de fichier).                         */
/* Champs : identification, indice, percentile, jours/points si      */
/* --effort, métriques détaillées. Encodage : nombres avec point      */
/* décimal, texte sans guillemets sauf virgule (échappée "").        */
/* ----------------------------------------------------------------- */

function csvEscape(value) {
  const s = String(value ?? "");
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const csv = [
  [
    "rang", "composant", "categorie", "indice", "percentile",
    ...(effort ? ["jours_estimes", "base_estimation", "points_fibonacci"] : []),
    "fichiers", "loc", "cyclomatic", "handlers_clavier", "hooks",
    "aria", "props", "fan_out", "fan_in", "deps_partagees",
    "score_code", "score_interactions", "score_a11y", "score_structure",
  ].join(","),
  ...rows.map((r) => [
    r.rank, r.component, r.category, r.index, r.percentile,
    ...(effort ? [r.estimatedDays, r.effortBasis, r.fibonacci] : []),
    r.details.files, r.details.loc, r.details.cyclomatic,
    r.details.keyboardHandlers, r.details.hooks, r.details.ariaCount,
    r.details.propsCount, r.details.fanOut, r.details.fanIn, r.details.sharedDeps,
    r.details.subScores.code, r.details.subScores.interactions,
    r.details.subScores.a11y, r.details.subScores.structure,
  ].map(csvEscape).join(",")),
].join("\n");

const csvPath = path.join(path.dirname(CONFIG.outFile) || ".", "complexity-report.csv");
fs.writeFileSync(csvPath, csv, "utf8");

console.log(`\n✔ Rapport JSON : ${CONFIG.outFile}`);
console.log(`✔ Table Markdown : ${path.join(path.dirname(CONFIG.outFile) || ".", "complexity-report.md")}`);
console.log(`✔ Export CSV : ${csvPath}`);