/**
 * component-complexity.mjs
 * ------------------------------------------------------------------
 * Analyse la complexité de mise en œuvre des composants React d'une
 * librairie TypeScript (Vanilla : aucune dépendance de runtime).
 *
 * Prérequis :  npm i -D typescript
 * Usage :      node scripts/component-complexity.mjs --src ./src --out ./complexity-report.json
 *              node scripts/component-complexity.mjs --src ./src --effort ./effort-anchors.json
 *              (--effort : estime les jours de traitement de TOUS les
 *               composants en calibrant une régression sur des durées
 *               réelles fournies pour quelques composants, ex.
 *               {"comboBox":6,"tabs":3,"button":1})
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

  // Barrel : fichier ne contenant QUE des imports / re-exports.
  // (export const X = ... est un VariableStatement : du vrai code,
  //  donc un composant écrit entièrement dans index.tsx reste analysé.)
  m.isBarrel = sf.statements.length > 0 && sf.statements.every((st) =>
    ts.isImportDeclaration(st) ||
    ts.isExportDeclaration(st) ||
    st.kind === ts.SyntaxKind.ExportAssignment
  );

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
  if (parts[0] !== "components") return null;

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
  const dirs = rel.split(path.sep).slice(1, -1);

  if (m.isBarrel && dirs.length <= 1) {
    // Barrel de catégorie ou racine (ex. components/buttons/index.ts) :
    // ré-export pur, ignoré — ni métriques ni entrée fantôme.
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
/* Principe : calibrer une relation indice -> jours sur des durées     */
/* RÉELLES constatées sur quelques composants (points d'ancrage),     */
/* puis extrapoler à l'ensemble du classement.                        */
/*                                                                   */
/* Usage :                                                           */
/*   --effort '{"comboBox":6,"tabs":3,"button":1}'                    */
/*   --effort ./effort-anchors.json   (même format, un objet)        */
/*                                                                   */
/* Modèles testés, meilleur R² retenu :                                */
/*   - linéaire  : jours = a * indice + b                             */
/*   - puissance : jours = a * indice ^ b   (ajustement log-log)       */
/*                                                                   */
/* Fiabilité : avec < 4 ancres, l'estimation est indicative ;         */
/* 4 à 6 ancres réparties sur l'échelle (1 très simple, 1-2 moyens,   */
/* 1-2 complexes, idéalement 1 très complexe) donnent une base        */
/* solide. Le rapport expose le R² et les résidus par ancre pour      */
/* juger de la qualité de l'ajustement.                              */
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

function fitLinear(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const a = den === 0 ? 0 : num / den;
  const b = my - a * mx;
  const predict = (x) => a * x + b;
  return { type: "linear", a, b, predict };
}

function fitPower(xs, ys) {
  // jours = a * indice^b  <=>  ln(jours) = ln(a) + b * ln(indice)
  const lx = xs.map((x) => Math.log(x));
  const ly = ys.map((y) => Math.log(y));
  const lin = fitLinear(lx, ly);
  const a = Math.exp(lin.b);
  const b = lin.a;
  const predict = (x) => a * x ** b;
  return { type: "power", a, b, predict };
}

function r2Of(model, xs, ys) {
  const my = ys.reduce((s, v) => s + v, 0) / ys.length;
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < xs.length; i++) {
    ssRes += (ys[i] - model.predict(xs[i])) ** 2;
    ssTot += (ys[i] - my) ** 2;
  }
  return ssTot === 0 ? 1 : 1 - ssRes / ssTot;
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
  const xs = [], ys = [], missing = [];
  for (const [name, days] of Object.entries(anchors)) {
    const row = indexByName.get(name.toLowerCase());
    if (!row) { missing.push(name); continue; }
    xs.push(row.index);
    ys.push(Number(days));
  }
  if (missing.length > 0) {
    console.warn(`⚠ Ancres inconnues (absentes du rapport) : ${missing.join(", ")}`);
  }
  if (xs.length < 2) {
    console.error("✖ --effort : au moins 2 ancres valides sont nécessaires pour calibrer un modèle.");
    process.exit(1);
  }
  if (xs.length < 4) {
    console.warn(`⚠ Seulement ${xs.length} ancres : estimation indicative. Visez 4-6 ancres réparties sur l'échelle de complexité.`);
  }

  const models = [fitLinear(xs, ys)];
  if (xs.every((x) => x > 0) && ys.every((y) => y > 0)) models.push(fitPower(xs, ys));
  const best = models.reduce((m, cand) => (r2Of(cand, xs, ys) > r2Of(m, xs, ys) ? cand : m));

  effort = {
    model: best.type,
    r2: Math.round(r2Of(best, xs, ys) * 1000) / 1000,
    anchors: Object.fromEntries(
      Object.entries(anchors)
        .filter(([n]) => !missing.includes(n))
        .map(([n, d]) => {
          const row = indexByName.get(n.toLowerCase());
          return [n, { days: d, estimated: Math.round(best.predict(row.index) * 10) / 10 }];
        })
    ),
    anchorsCount: xs.length,
  };

  for (const r of rows) {
    const raw = Math.max(0, best.predict(r.index)); // plancher 0
    r.estimatedDays = Math.round(raw * 10) / 10;
  }
  effort.totalDays = Math.round(rows.reduce((s, r) => s + r.estimatedDays, 0) * 10) / 10;
  effort.meanDays = Math.round((effort.totalDays / rows.length) * 10) / 10;
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
    ...(r.estimatedDays !== undefined ? { Jours: r.estimatedDays } : {}),
    Code: r.details.subScores.code,
    Interac: r.details.subScores.interactions,
    A11y: r.details.subScores.a11y,
    Struct: r.details.subScores.structure,
  }))
);
if (effort) {
  console.log(`\nCharge estimée (modèle ${effort.model}, R² = ${effort.r2}, ${effort.anchorsCount} ancres)`);
  console.log(`  Total : ${effort.totalDays} jours — Moyenne : ${effort.meanDays} jours/composant`);
  for (const [name, a] of Object.entries(effort.anchors)) {
    console.log(`  Ancre ${name} : réel ${a.days} j / estimé ${a.estimated} j`);
  }
}

const md = [
  "## Indice de complexité des composants\n",
  `| Rang | Composant | Catégorie | Indice /5 | Percentile |${effort ? " Jours estimés |" : ""} Cyclomatic | LOC | ARIA | Clavier | Props | Fan-out |`,
  `|---|---|---|---|---|${effort ? "---|" : ""}---|---|---|---|---|---|`,
  ...rows.map((r) =>
    `| ${r.rank} | ${r.component} | ${r.category} | ${r.index} | ${r.percentile}% |${effort ? ` ${r.estimatedDays} |` : ""} ${r.details.cyclomatic} | ${r.details.loc} | ${r.details.ariaCount} | ${r.details.keyboardHandlers} | ${r.details.propsCount} | ${r.details.fanOut} |`
  ),
  ...(effort ? [
    "",
    `**Charge totale estimée : ${effort.totalDays} jours** (modèle ${effort.model}, R² = ${effort.r2}, ${effort.anchorsCount} ancres réelles).`,
  ] : []),
].join("\n");
fs.writeFileSync(
  path.join(path.dirname(CONFIG.outFile) || ".", "complexity-report.md"),
  md, "utf8"
);

console.log(`\n✔ Rapport JSON : ${CONFIG.outFile}`);
console.log(`✔ Table Markdown : ${path.join(path.dirname(CONFIG.outFile) || ".", "complexity-report.md")}`);