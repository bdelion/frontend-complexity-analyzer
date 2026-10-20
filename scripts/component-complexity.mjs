/**
 * component-complexity.mjs
 * ------------------------------------------------------------------
 * Analyse la complexité de mise en œuvre des composants React d'une
 * librairie TypeScript (Vanilla : aucune dépendance de runtime).
 *
 * Prérequis :  npm i -D typescript
 * Usage :      node scripts/component-complexity.mjs --src ./src --out ./complexity-report.json
 *
 * Principe :
 *   1. Parcourt les fichiers .ts/.tsx et regroupe par composant
 *      (src/components/<Catégorie>/<Composant>/, ou catégorie plate).
 *   2. Extrait des métriques objectives via l'API TypeScript (AST).
 *   3. Construit le graphe de dépendances (fan-in / fan-out, modules
 *      partagés).
 *   4. Normalise chaque métrique sur 1-5, agrège avec des poids et
 *      produit un classement + tiers (faible / moyenne / élevée).
 *
 * Sorties : JSON détaillé, table console, et Markdown prêt à coller
 * dans un README ou une page de documentation.
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
    propsCount: [2, 25],
  },
  // Seuils des tiers sur l'indice final (échelle 1-5)
  tiers: { high: 3.5, medium: 2.2 },
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
    propsCount: 0,
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

    // Surface d'API : membres d'interfaces Props/OwnProps
    if (ts.isInterfaceDeclaration(node) && /Props|Options|Config/i.test(node.name.text)) {
      m.propsCount += node.members.length;
    }

    // Imports résolus (relatifs uniquement = interne à la lib)
    if (ts.isImportDeclaration(node) && node.moduleSpecifier) {
      const spec = node.moduleSpecifier.text;
      if (spec.startsWith(".")) m.imports.push(path.resolve(path.dirname(filePath), spec));
    }

    ts.forEachChild(node, visit);
  };
  visit(sf);

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
/*   Tout ce qui est hors src/components/** est traité comme          */
/*   infrastructure partagée (hooks, internal, contexts, assets…) :   */
/*   exclue du classement, mais comptée dans le fan-out de chaque      */
/*   composant qui en dépend (clé "shared/<dir>").                    */
/* ----------------------------------------------------------------- */

/** Fichiers à exclure de l'analyse (tests). */
const EXCLUDE_RE = /\.(e2e|test|spec)\.(ts|tsx)$/;

/**
 * Renvoie le nom du composant pour un fichier, ou null si le fichier
 * n'appartient pas à src/components/** (infrastructure partagée).
 *
 * Règles (relatif à src/) :
 *   components/index.ts                    -> null (barrel racine)
 *   components/<Cat>/index.ts              -> <Cat> (barrel : fusionné dans la
 *                                            catégorie plate, ou ignoré si la
 *                                            catégorie contient des composants)
 *   components/<Cat>/fichier.ts            -> <Cat> (catégorie plate)
 *   components/<Cat>/<Compo>/index.ts      -> <Compo> (barrel de composant)
 *   components/<Cat>/<Compo>/fichier.ts    -> <Compo>
 *   components/<Cat>/<Compo>/sous/...      -> <Compo>
 *
 * Un index.ts de catégorie n'est JAMAIS analysé comme un composant :
 * c'est un barrel de ré-export. S'il est le seul fichier rattaché à la
 * clé (catégorie à composants), l'entrée disparaît du classement.
 */
function componentNameFor(relPath) {
  const parts = relPath.split(path.sep);
  if (parts[0] !== "components") return null;

  const fileName = parts[parts.length - 1];
  const dirs = parts.slice(1, -1); // ex. ["formElements", "comboBox"]

  if (dirs.length === 0) return null;  // components/index.ts
  // Barrel de catégorie : ré-export pur, jamais un composant
  if (dirs.length === 1 && fileName === "index.ts") return null;
  if (dirs.length === 1) return dirs[0];       // catégorie plate
  return dirs[dirs.length - 1];                // composant (niveau le plus profond)
}

/** Renvoie la catégorie d'appartenance d'un fichier sous components/. */
function categoryFor(relPath) {
  const parts = relPath.split(path.sep);
  return parts[0] === "components" && parts.length >= 2 ? parts[1] : null;
}

/** Renvoie la clé de dépendance pour un import résolu. */
function dependencyKeyFor(relPath) {
  const comp = componentNameFor(relPath);
  if (comp) return comp;
  const parts = relPath.split(path.sep);
  return "shared/" + parts[0];
}

const files = walk(CONFIG.srcDir);
if (files.length === 0) {
  console.error(`Aucun fichier .ts/.tsx trouvé dans ${CONFIG.srcDir}`);
  process.exit(1);
}

const components = new Map();  // name -> métriques agrégées (composants uniquement)
const pendingFanIn = [];       // [cible, source] pour imports vers composants non encore visités
const sharedUsage = new Map(); // composant -> Set de modules partagés utilisés

for (const file of files) {
  if (EXCLUDE_RE.test(file)) continue; // tests e2e/unitaires exclus
  const rel = path.relative(CONFIG.srcDir, file);
  const componentName = componentNameFor(rel);
  if (componentName === null) continue; // infrastructure partagée : pas un composant

  const m = analyzeFile(file);
  const category = categoryFor(rel);

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
    if (target.startsWith("shared/")) {
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

function tierFor(index) {
  if (index >= CONFIG.tiers.high) return "élevée";
  if (index >= CONFIG.tiers.medium) return "moyenne";
  return "faible";
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
    tier: tierFor(index),
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
/* Sorties : JSON, console, Markdown                                   */
/* ----------------------------------------------------------------- */

const report = {
  generatedAt: new Date().toISOString(),
  config: CONFIG,
  ranking: rows,
};
fs.writeFileSync(CONFIG.outFile, JSON.stringify(report, null, 2), "utf8");

console.log("\nClassement de complexité de mise en œuvre\n");
console.table(
  rows.map((r) => ({
    Composant: r.component,
    Indice: r.index,
    Tier: r.tier,
    Code: r.details.subScores.code,
    Interac: r.details.subScores.interactions,
    A11y: r.details.subScores.a11y,
    Struct: r.details.subScores.structure,
  }))
);

const md = [
  "## Indice de complexité des composants\n",
  "| Composant | Catégorie | Indice /5 | Tier | Cyclomatic | LOC | ARIA | Clavier | Props | Fan-out |",
  "|---|---|---|---|---|---|---|---|---|---|",
  ...rows.map((r) =>
    `| ${r.component} | ${r.category} | ${r.index} | ${r.tier} | ${r.details.cyclomatic} | ${r.details.loc} | ${r.details.ariaCount} | ${r.details.keyboardHandlers} | ${r.details.propsCount} | ${r.details.fanOut} |`
  ),
].join("\n");
fs.writeFileSync(
  path.join(path.dirname(CONFIG.outFile) || ".", "complexity-report.md"),
  md, "utf8"
);

console.log(`\n✔ Rapport JSON : ${CONFIG.outFile}`);
console.log(`✔ Table Markdown : ${path.join(path.dirname(CONFIG.outFile) || ".", "complexity-report.md")}`);