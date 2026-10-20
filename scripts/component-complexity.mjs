/**
 * Classement autonome de sources React/TypeScript, avec estimation facultative.
 * Les bibliothèques sont lues sans chargement ni exécution de leurs modules.
 */
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Command } from 'commander';
import { z } from 'zod';

const VERSION = '2.0.0';
const METRICS = [
  'files',
  'loc',
  'cyclomatic',
  'keyboardHandlers',
  'pointerHandlers',
  'ariaCount',
  'hooks',
  'propsCount',
];
const WEIGHTS = { code: 0.35, interactions: 0.25, a11y: 0.3, structure: 0.1 };
const BOUNDS = {
  cyclomatic: [5, 100],
  loc: [50, 1200],
  keyboardHandlers: [0, 4],
  ariaCount: [0, 17],
  hooks: [0, 18],
  fanOut: [0, 9],
  propsCount: [0, 40],
};
const portable = (value) => value.replaceAll('\\', '/');
const round = (value) => Math.round(value * 10) / 10;
const keyFor = (file) =>
  process.platform === 'win32' ? path.normalize(file).toLowerCase() : path.normalize(file);

/** Résout également les parents d'un futur fichier et refuse les liens pendants. */
function canonical(target) {
  const absolute = path.resolve(target);
  try {
    return fs.realpathSync(absolute);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    try {
      if (fs.lstatSync(absolute).isSymbolicLink()) throw new Error('Lien pendant : ' + absolute);
    } catch (statError) {
      if (statError.code !== 'ENOENT') throw statError;
    }
    const parent = path.dirname(absolute);
    if (parent === absolute) throw error;
    return path.join(canonical(parent), path.basename(absolute));
  }
}
function contains(parent, child) {
  const rel = path.relative(parent, child);
  return !rel || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel));
}

/** Valide toutes les destinations avant de préparer les remplacements atomiques par fichier. */
function writeOutputs(outputs, protectedPaths) {
  function safe(file) {
    const target = canonical(file);
    if (protectedPaths.some((input) => contains(input, target) || contains(target, input)))
      throw new Error('La sortie recouvre une entrée : ' + file);
    return target;
  }
  const destinations = outputs.map(([file]) => safe(file));
  if (new Set(destinations.map(keyFor)).size !== outputs.length)
    throw new Error('Destinations de sortie identiques');
  if (
    destinations.some((a, i) =>
      destinations.some((b, j) => i !== j && (contains(a, b) || contains(b, a))),
    )
  )
    throw new Error('Destinations de sortie superposées');
  if (destinations.some((file) => fs.existsSync(file) && !fs.statSync(file).isFile()))
    throw new Error('Une sortie doit être un fichier');
  const staged = [];
  try {
    for (const [i, [file, content]] of outputs.entries()) {
      fs.mkdirSync(path.dirname(destinations[i]), { recursive: true });
      if (safe(file) !== destinations[i]) throw new Error('Destination modifiée');
      const temporary = path.join(path.dirname(destinations[i]), `.complexity-${randomUUID()}.tmp`);
      fs.writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx' });
      staged.push({ temporary, destination: destinations[i], file });
    }
    for (const entry of staged) {
      if (safe(entry.file) !== entry.destination)
        throw new Error('Destination modifiée pendant l’écriture');
      fs.renameSync(entry.temporary, entry.destination);
    }
  } finally {
    // Nettoyage limité aux fichiers temporaires créés par cette exécution.
    for (const entry of staged) if (fs.existsSync(entry.temporary)) fs.unlinkSync(entry.temporary);
  }
}

/** Parcourt uniquement la production et ne suit aucun lien symbolique. */
function inventory(root, diagnostics) {
  function visit(directory) {
    return fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name, 'en'))
      .flatMap((entry) => {
        const file = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) {
          diagnostics.push({
            code: 'LINK_SKIPPED',
            path: portable(path.relative(root, file)),
            message: 'Lien non parcouru',
          });
          return [];
        }
        if (entry.isDirectory())
          return ['node_modules', 'dist', 'coverage', '.git', 'assets'].includes(entry.name)
            ? []
            : visit(file);
        return entry.isFile() &&
          /\.tsx?$/.test(entry.name) &&
          !/(?:\.d\.ts|\.(?:test|spec|e2e|stories)\.tsx?)$/.test(entry.name)
          ? [file]
          : [];
      });
  }
  return visit(root);
}

/** Les ancres sont un objet JSON, un fichier JSON ou des paires identifiant:jours. */
function readAnchors(raw) {
  const trimmed = raw.trim();
  let parsed;
  if (trimmed.startsWith('{')) parsed = JSON.parse(trimmed);
  else if (fs.existsSync(trimmed)) parsed = JSON.parse(fs.readFileSync(trimmed, 'utf8'));
  else {
    const pairs = trimmed.split(',').map((pair) => pair.split(':'));
    if (pairs.some((pair) => pair.length !== 2 || !pair[0].trim() || !pair[1].trim()))
      throw new Error('Ancres invalides ou fichier introuvable');
    const names = pairs.map((pair) => pair[0].trim().toLowerCase());
    if (new Set(names).size !== names.length) throw new Error('Ancre dupliquée');
    parsed = Object.fromEntries(pairs.map(([name, value]) => [name.trim(), Number(value)]));
  }
  return z
    .record(z.string().min(1), z.number().finite().nonnegative())
    .refine((obj) => Object.keys(obj).length > 0, 'Au moins une ancre requise')
    .parse(parsed);
}

/** Une seule abscisse définit une constante ; les autres définissent une interpolation. */
function interpolator(points) {
  if (points.length === 1) return { segments: 0, predict: () => points[0].days };
  const slope = (points.at(-1).days - points[0].days) / (points.at(-1).x - points[0].x);
  return {
    segments: points.length - 1,
    predict: (x) => {
      if (x <= points[0].x) return points[0].days + slope * (x - points[0].x);
      if (x >= points.at(-1).x) return points.at(-1).days + slope * (x - points.at(-1).x);
      const end = points.findIndex((p) => p.x > x),
        a = points[end - 1],
        b = points[end];
      return a.days + ((b.days - a.days) * (x - a.x)) / (b.x - a.x);
    },
  };
}
function fibonacci(days) {
  if (days <= 0) return 0;
  const values = [0.5, 1, 2, 3];
  while (values.at(-1) < days && Number.isFinite(values.at(-1) + values.at(-2)))
    values.push(values.at(-1) + values.at(-2));
  return values.reduce(
    (best, n) => (Math.abs(Math.log(days / n)) < Math.abs(Math.log(days / best)) ? n : best),
    0.5,
  );
}

/** Calibre uniquement des indices disponibles ; une ancre ambiguë exige un chemin. */
function estimate(rows, anchors, overhead, lotRate, diagnostics) {
  if (rows.some((r) => r.index === null))
    throw new Error('Estimation impossible : métriques indisponibles, relancer sans --effort');
  const used = new Set();
  const points = [];
  for (const [name, days] of Object.entries(anchors)) {
    const exact = rows.filter((r) => r.id.toLowerCase() === name.toLowerCase());
    const matches = exact.length
      ? exact
      : rows.filter((r) => r.component.toLowerCase() === name.toLowerCase());
    if (matches.length !== 1)
      throw new Error(
        'Ancre absente ou ambiguë : ' + name + ' ; utiliser son identifiant de chemin',
      );
    const row = matches[0];
    if (used.has(row.id)) throw new Error('Ancre dupliquée : ' + row.id);
    used.add(row.id);
    points.push({ name, id: row.id, x: row.index, days });
  }
  points.sort((a, b) => a.x - b.x || a.id.localeCompare(b.id, 'en'));
  const groups = new Map();
  for (const p of points) groups.set(p.x, [...(groups.get(p.x) ?? []), p]);
  const unique = [...groups].map(([x, items]) => {
    if (items.length > 1)
      diagnostics.push({
        code: 'ANCHORS_MERGED',
        message: 'Ancres au même indice : moyenne utilisée',
        index: x,
        ids: items.map((p) => p.id),
      });
    return { x, days: items.reduce((sum, p) => sum + p.days, 0) / items.length };
  });
  const model = interpolator(unique);
  const min = unique[0].x,
    max = unique.at(-1).x;
  for (const r of rows) {
    r.estimatedDays = round(Math.max(0, model.predict(r.index)) + (used.has(r.id) ? 0 : overhead));
    if (!Number.isFinite(r.estimatedDays)) throw new Error('Estimation hors domaine numérique');
    r.effortBasis = r.index < min || r.index > max ? 'extrapolated' : 'interpolated';
    r.fibonacci = fibonacci(r.estimatedDays);
  }
  const totalDays = round(rows.reduce((sum, r) => sum + r.estimatedDays, 0));
  if (!Number.isFinite(totalDays)) throw new Error('Total hors domaine numérique');
  const byCategory = new Map();
  for (const r of rows) {
    const group = byCategory.get(r.category) ?? { components: 0, days: 0, points: 0 };
    group.components++;
    group.days = round(group.days + r.estimatedDays);
    group.points += r.fibonacci;
    byCategory.set(r.category, group);
  }
  const effort = {
    model: unique.length === 1 ? 'constant' : 'piecewise-linear',
    segments: model.segments,
    anchorsCount: points.length,
    anchors: Object.fromEntries(
      points.map((p) => [
        p.name,
        { id: p.id, index: p.x, days: p.days, estimated: round(Math.max(0, model.predict(p.x))) },
      ]),
    ),
    overhead,
    lotRate,
    totalDays,
    meanDays: round(totalDays / rows.length),
    totalPoints: rows.reduce((sum, r) => sum + r.fibonacci, 0),
    extrapolatedCount: rows.filter((r) => r.effortBasis === 'extrapolated').length,
    byCategory: Object.fromEntries([...byCategory].sort(([a], [b]) => a.localeCompare(b, 'en'))),
  };
  if (unique.length >= 4) {
    const errors = unique.map((p) => {
      const predicted = interpolator(unique.filter((q) => q !== p)).predict(p.x);
      return {
        index: p.x,
        actual: p.days,
        predicted: round(predicted),
        absError: round(Math.abs(p.days - predicted)),
      };
    });
    effort.crossValidation = {
      method: 'leave-one-out',
      errors,
      mae: round(errors.reduce((sum, p) => sum + p.absError, 0) / errors.length),
    };
  }
  const lots = new Map();
  for (const r of rows) lots.set(r.index, [...(lots.get(r.index) ?? []), r]);
  const repeated = [...lots.values()].filter((group) => group.length > 1);
  if (repeated.length && lotRate < 1) {
    // L'unité la plus coûteuse reste au plein tarif ; les suivantes sont marginales.
    const lotTotal = round(
      [...lots.values()].reduce(
        (sum, group) =>
          sum +
          group
            .map((r) => r.estimatedDays)
            .sort((a, b) => b - a)
            .reduce((subtotal, days, i) => subtotal + days * (i === 0 ? 1 : lotRate), 0),
        0,
      ),
    );
    effort.lotEstimate = {
      marginalRate: lotRate,
      groupsCount: repeated.length,
      componentsGrouped: repeated.reduce((sum, g) => sum + g.length, 0),
      totalDays: lotTotal,
      savingDays: round(totalDays - lotTotal),
    };
  }
  return effort;
}

/** Construit les unités, preuves et arêtes à partir d'un programme TypeScript en lecture seule. */
function analyze(root, configPath, diagnostics) {
  const files = inventory(root, diagnostics);
  if (!files.length) throw new Error('Aucune source de production .ts/.tsx trouvée');
  let compilerOptions = {};
  if (configPath) {
    const read = ts.readConfigFile(configPath, ts.sys.readFile);
    if (read.error) throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, ' '));
    const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(configPath));
    const errors = parsed.errors.filter((e) => e.code !== 18003);
    if (errors.length) throw new Error(ts.flattenDiagnosticMessageText(errors[0].messageText, ' '));
    compilerOptions = parsed.options;
  }
  compilerOptions = {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    ...compilerOptions,
    noEmit: true,
    jsx: ts.JsxEmit.Preserve,
  };
  const program = ts.createProgram(files, compilerOptions),
    checker = program.getTypeChecker();
  const sources = new Map(files.map((file) => [keyFor(file), program.getSourceFile(file)]));
  const relative = (file) => portable(path.relative(root, file));
  const categories = new Set(
    files
      .map((file) => relative(file).split('/'))
      .filter((p) => p[0] === 'components' && p.length >= 4)
      .map((p) => p[1]),
  );
  const componentDirs = new Set(
    files
      .map((file) => relative(file).split('/'))
      .filter((p) => p[0] === 'components' && p.length >= 4)
      .map((p) => p.slice(0, 3).join('/')),
  );
  function identity(rel) {
    const parts = rel.split('/'),
      name = parts.at(-1).replace(/\.tsx?$/, '');
    if (parts[0] === 'components') {
      if (parts.length < 3) return null;
      const category = parts[1];
      if (parts.length >= 4)
        return { id: parts.slice(0, 3).join('/'), name: parts[2], category, kind: 'component' };
      if (categories.has(category))
        return componentDirs.has(`components/${category}/${category}`)
          ? {
              id: `components/${category}/${category}`,
              name: category,
              category,
              kind: 'component',
            }
          : null;
      return { id: `components/${category}`, name: category, category, kind: 'component' };
    }
    const perFile = ['hooks', 'contexts', 'internal'].includes(parts[0]) || parts.length === 1;
    return {
      id: perFile ? rel : parts.slice(0, -1).join('/'),
      name: perFile ? name : parts.slice(0, -1).join('/'),
      category: 'shared',
      kind: 'shared',
    };
  }
  const proof = (source, node = source) => ({
    path: relative(source.fileName),
    startLine: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
    endLine: source.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
  });
  const warn = (code, source, node, message) =>
    diagnostics.push({ code, message, ...proof(source, node) });
  function renderFunction(node, seen = new Set()) {
    if (!node || seen.has(node)) return undefined;
    seen.add(node);
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node))
      return node;
    if (ts.isVariableDeclaration(node)) return renderFunction(node.initializer, seen);
    if (
      ts.isExportAssignment(node) ||
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node)
    )
      return renderFunction(node.expression, seen);
    if (ts.isCallExpression(node)) return renderFunction(node.arguments[0], seen);
    if (ts.isIdentifier(node))
      return renderFunction(checker.getSymbolAtLocation(node)?.valueDeclaration, seen);
  }
  const decisions = new Set([
    ts.SyntaxKind.IfStatement,
    ts.SyntaxKind.ConditionalExpression,
    ts.SyntaxKind.ForStatement,
    ts.SyntaxKind.ForOfStatement,
    ts.SyntaxKind.ForInStatement,
    ts.SyntaxKind.WhileStatement,
    ts.SyntaxKind.DoStatement,
    ts.SyntaxKind.CaseClause,
    ts.SyntaxKind.CatchClause,
  ]);
  const hookNames = new Set([
    'useState',
    'useReducer',
    'useEffect',
    'useMemo',
    'useCallback',
    'useRef',
    'useContext',
    'useId',
  ]);
  const unresolvedFiles = new Set();
  const units = new Map(),
    owners = new Map(),
    barrels = new Set(),
    edges = new Map();
  for (const [file, source] of sources) {
    if (program.getSyntacticDiagnostics(source).length)
      throw new Error('Source non parsable : ' + relative(source.fileName));
    const barrel =
      source.statements.length > 0 &&
      source.statements.every((st) => ts.isImportDeclaration(st) || ts.isExportDeclaration(st));
    if (barrel) barrels.add(file);
    const info = identity(relative(source.fileName));
    const m = Object.fromEntries(METRICS.map((key) => [key, 0]));
    m.files = 1;
    m.cyclomatic = 1;
    m.loc = source.text
      .split('\n')
      .filter((line) => line.trim() && !line.trim().startsWith('//')).length;
    const proofs = new Map(),
      estimated = new Set();
    const hit = (key, node) => {
      m[key]++;
      proofs.set(key, [...(proofs.get(key) ?? []), proof(source, node)]);
    };
    const react = new Map(),
      namespaces = new Set();
    for (const st of source.statements)
      if (
        ts.isImportDeclaration(st) &&
        st.moduleSpecifier.text === 'react' &&
        !st.importClause?.isTypeOnly
      ) {
        if (st.importClause?.name) namespaces.add(st.importClause.name.text);
        const bindings = st.importClause?.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
        if (bindings && ts.isNamedImports(bindings))
          for (const el of bindings.elements)
            if (!el.isTypeOnly) react.set(el.name.text, el.propertyName?.text ?? el.name.text);
      }
    const visit = (node) => {
      if (
        decisions.has(node.kind) ||
        (ts.isBinaryExpression(node) &&
          [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken].includes(
            node.operatorToken.kind,
          ))
      )
        hit('cyclomatic', node);
      if (ts.isJsxAttribute(node)) {
        const name = node.name.getText(source);
        if (['onKeyDown', 'onKeyUp', 'onKeyPress', 'onFocus', 'onBlur'].includes(name))
          hit('keyboardHandlers', node);
        if (/^(onClick|onMouse\w*|onPointer\w*|onTouch\w*)$/.test(name))
          hit('pointerHandlers', node);
        if (name.startsWith('aria-') || ['role', 'tabIndex', 'ariaLive'].includes(name))
          hit('ariaCount', node);
      }
      if (ts.isPropertyAssignment(node)) {
        const name = node.name.getText(source).replace(/^["']|["']$/g, '');
        if (name.startsWith('aria-') || ['role', 'tabIndex', 'ariaLive'].includes(name))
          hit('ariaCount', node);
      }
      if (ts.isJsxSpreadAttribute(node)) {
        ['ariaCount', 'keyboardHandlers', 'pointerHandlers'].forEach((key) => estimated.add(key));
        warn('JSX_SPREAD', source, node, 'Attributs propagés non développés');
      }
      if (ts.isCallExpression(node)) {
        const expr = node.expression;
        const original = ts.isIdentifier(expr)
          ? react.get(expr.text)
          : ts.isPropertyAccessExpression(expr) && namespaces.has(expr.expression.getText(source))
            ? expr.name.text
            : undefined;
        if (hookNames.has(original)) {
          // Un paramètre local homonyme ne doit pas être confondu avec un import React.
          const base = ts.isPropertyAccessExpression(expr) ? expr.expression : expr;
          const declarations = checker.getSymbolAtLocation(base)?.declarations ?? [];
          if (
            declarations.some(
              (d) => ts.isImportSpecifier(d) || ts.isImportClause(d) || ts.isNamespaceImport(d),
            )
          )
            hit('hooks', node);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    const module = checker.getSymbolAtLocation(source),
      seen = new Set();
    for (const exported of module ? checker.getExportsOfModule(module) : []) {
      if (exported.name !== 'default' && !/^[A-Z]/.test(exported.name)) continue;
      const symbol =
        exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
      for (const declaration of symbol.declarations ?? []) {
        if (declaration.getSourceFile() !== source) continue;
        const fn = renderFunction(declaration);
        if (!fn?.body || seen.has(fn)) continue;
        seen.add(fn);
        let hasJsx = false;
        const find = (node) => {
          if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node))
            hasJsx = true;
          ts.forEachChild(node, find);
        };
        find(fn.body);
        const nullRender =
          fn.body.kind === ts.SyntaxKind.NullKeyword ||
          fn.body.getText(source).includes('return null');
        if (!hasJsx && !nullRender) continue;
        const param = fn.parameters[0];
        if (!param) continue;
        const type = checker.getTypeAtLocation(param);
        proofs.set('propsCount', [...(proofs.get('propsCount') ?? []), proof(source, param)]);
        if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) {
          if (ts.isObjectBindingPattern(param.name)) {
            if (m.propsCount !== null)
              m.propsCount += param.name.elements.filter((el) => !el.dotDotDotToken).length;
            estimated.add('propsCount');
            warn(
              'API_ESTIMATED',
              source,
              param,
              'Props destructurées visibles ; type non résolu, rest exclu',
            );
          } else {
            m.propsCount = null;
            warn('API_UNAVAILABLE', source, param, 'Type des props non résolu');
          }
        } else {
          const names = new Set();
          for (const part of type.isUnion() ? type.types : [type])
            for (const property of checker.getPropertiesOfType(part)) {
              const declaration = property.declarations?.[0];
              if (
                declaration &&
                /(?:@types[\\/]react[\\/]|lib\.dom\.d\.ts)/.test(
                  declaration.getSourceFile().fileName,
                )
              )
                continue;
              names.add(property.name);
            }
          if (m.propsCount !== null) m.propsCount += names.size;
        }
      }
    }
    if (!info || barrel) continue;
    let unit = units.get(info.id);
    if (!unit) {
      unit = {
        ...info,
        ...Object.fromEntries(METRICS.map((key) => [key, 0])),
        paths: [],
        observations: {},
        imports: new Set(),
        types: new Set(),
        incoming: new Set(),
        graphPartial: false,
      };
      units.set(info.id, unit);
    }
    owners.set(file, info.id);
    unit.paths.push(relative(source.fileName));
    for (const key of METRICS) {
      unit[key] = unit[key] === null || m[key] === null ? null : unit[key] + m[key];
      const previous = unit.observations[key];
      unit.observations[key] = {
        status:
          unit[key] === null
            ? 'unavailable'
            : estimated.has(key) || previous?.status === 'estimated'
              ? 'estimated'
              : 'measured',
        value: unit[key],
        evidence: [...(previous?.evidence ?? []), ...(proofs.get(key) ?? [proof(source)])],
      };
    }
  }
  // Les barrels de composants contribuent au graphe, sans ajouter de code propre.
  for (const file of barrels) {
    const info = identity(relative(sources.get(file).fileName));
    if (info && units.has(info.id)) {
      owners.set(file, info.id);
      units.get(info.id).paths.push(relative(sources.get(file).fileName));
    }
  }
  if (!units.size) throw new Error('Aucune unité de production classable');
  for (const [file, source] of sources) {
    const targets = [];
    for (const st of source.statements) {
      if (
        !(ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) ||
        !st.moduleSpecifier ||
        !ts.isStringLiteral(st.moduleSpecifier)
      )
        continue;
      const spec = st.moduleSpecifier.text,
        bindings = ts.isImportDeclaration(st) ? st.importClause?.namedBindings : st.exportClause;
      const typeOnly = Boolean(
        st.isTypeOnly ||
        st.importClause?.isTypeOnly ||
        ((!ts.isImportDeclaration(st) || !st.importClause?.name) &&
          bindings &&
          (ts.isNamedImports(bindings) || ts.isNamedExports(bindings)) &&
          bindings.elements.length &&
          bindings.elements.every((el) => el.isTypeOnly)),
      );
      const resolved = ts.resolveModuleName(spec, source.fileName, compilerOptions, ts.sys)
        .resolvedModule?.resolvedFileName;
      if (resolved && sources.has(keyFor(resolved)))
        targets.push({ file: keyFor(resolved), typeOnly });
      else if (
        spec.startsWith('.') ||
        Object.keys(compilerOptions.paths ?? {}).some((pattern) =>
          spec.startsWith(pattern.split('*')[0]),
        )
      ) {
        if (resolved?.endsWith('.d.ts')) continue;
        warn('IMPORT_UNRESOLVED', source, st, 'Import interne non analysé : ' + spec);
        unresolvedFiles.add(file);
        const owner = units.get(owners.get(file));
        if (owner) owner.graphPartial = true;
      }
    }
    edges.set(file, targets);
  }
  for (const [file, id] of owners) {
    const owner = units.get(id),
      visited = new Set(),
      pending = [...(edges.get(file) ?? [])];
    while (pending.length) {
      const edge = pending.pop(),
        key = edge.file + ':' + edge.typeOnly;
      if (visited.has(key)) continue;
      visited.add(key);
      const target = owners.get(edge.file);
      if (unresolvedFiles.has(edge.file) && barrels.has(edge.file)) owner.graphPartial = true;
      if (target && target !== id) (edge.typeOnly ? owner.types : owner.imports).add(target);
      if (barrels.has(edge.file))
        pending.push(
          ...(edges.get(edge.file) ?? []).map((next) => ({
            ...next,
            typeOnly: edge.typeOnly || next.typeOnly,
          })),
        );
    }
  }
  for (const unit of units.values())
    for (const id of unit.imports) units.get(id).incoming.add(unit.id);
  const norm = (value, [min, max]) =>
    1 + (4 * (Math.max(min, Math.min(max, value)) - min)) / (max - min);
  const rows = [...units.values()]
    .map((c) => {
      const fanOut = c.imports.size,
        fanIn = c.incoming.size,
        sharedDeps = [...c.imports].filter((id) => units.get(id).kind === 'shared').length;
      const subScores = {
        code: 0.6 * norm(c.cyclomatic, BOUNDS.cyclomatic) + 0.4 * norm(c.loc, BOUNDS.loc),
        interactions:
          0.6 * norm(c.keyboardHandlers, BOUNDS.keyboardHandlers) +
          0.4 * norm(c.hooks, BOUNDS.hooks),
        a11y: norm(c.ariaCount, BOUNDS.ariaCount),
        structure:
          c.propsCount === null
            ? null
            : 0.5 * norm(fanOut, BOUNDS.fanOut) + 0.5 * norm(c.propsCount, BOUNDS.propsCount),
      };
      const index =
        subScores.structure === null
          ? null
          : Math.round(
              Object.entries(WEIGHTS).reduce(
                (sum, [key, weight]) => sum + weight * subScores[key],
                0,
              ) * 100,
            ) / 100;
      return {
        id: c.id,
        component: c.name,
        kind: c.kind,
        category: c.category,
        index,
        indexStatus:
          index === null
            ? 'unavailable'
            : c.graphPartial || Object.values(c.observations).some((o) => o.status === 'estimated')
              ? 'estimated'
              : 'measured',
        details: {
          ...Object.fromEntries(METRICS.map((key) => [key, c[key]])),
          paths: c.paths,
          fanOut,
          fanIn,
          sharedDeps,
          dependencies: [...c.imports].sort(),
          typeDependencies: [...c.types].sort(),
          observations: {
            ...c.observations,
            fanOut: {
              status: c.graphPartial ? 'estimated' : 'measured',
              value: fanOut,
              evidence: c.paths.map((p) => ({ path: p, startLine: 1, endLine: 1 })),
            },
          },
          subScores,
        },
      };
    })
    .sort((a, b) => (b.index ?? -1) - (a.index ?? -1) || a.id.localeCompare(b.id, 'en'));
  const available = rows.filter((r) => r.index !== null);
  rows.forEach((r, i) => {
    r.rank = i + 1;
    r.percentile =
      r.index === null
        ? null
        : available.length <= 1
          ? 0
          : Math.round(
              (available.filter((p) => p.index < r.index).length / (available.length - 1)) * 100,
            );
  });
  return rows;
}

const mdEscape = (value) =>
  String(value ?? 'indisponible')
    .replaceAll('|', '\\|')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\n', ' ');
function csvEscape(value) {
  const raw = String(value ?? '');
  const text = typeof value === 'string' && /^[=+\-@\t\r]/.test(raw) ? "'" + raw : raw;
  return '"' + text.replaceAll('"', '""') + '"';
}
function views(report) {
  const { ranking: rows, effort } = report;
  const fields = [
    'rank',
    'id',
    'component',
    'kind',
    'category',
    'index',
    'indexStatus',
    'percentile',
    ...(effort ? ['estimatedDays', 'effortBasis', 'fibonacci'] : []),
    ...METRICS,
    'fanOut',
    'fanIn',
    'sharedDeps',
    'paths',
  ];
  const csv =
    '\uFEFF' +
    [
      fields,
      ...rows.map((r) =>
        fields.map((field) =>
          field === 'paths' ? r.details.paths.join(' | ') : (r[field] ?? r.details[field]),
        ),
      ),
    ]
      .map((row) => row.map(csvEscape).join(','))
      .join('\r\n') +
    '\r\n';
  const md = [
    '# Classement de complexité',
    '',
    `Schéma ${VERSION}. Signaux statiques : aucune conformité RGAA ni vélocité mesurée.`,
    '',
    '| Rang | Identifiant | Unité | Catégorie | Indice /5 | Statut | Percentile |' +
      (effort ? ' Jours | Points |' : ''),
    '|---|---|---|---|---|---|---|' + (effort ? '---|---|' : ''),
    ...rows.map(
      (r) =>
        `| ${r.rank} | ${mdEscape(r.id)} | ${mdEscape(r.component)} | ${mdEscape(r.category)} | ${r.index ?? 'indisponible'} | ${r.indexStatus} | ${r.percentile ?? 'indisponible'} |` +
        (effort ? ` ${r.estimatedDays} | ${r.fibonacci} |` : ''),
    ),
  ];
  md.push(
    '',
    '## Métriques de production',
    '',
    '| Identifiant | Fichiers | LOC | Complexité | Clavier/focus | Hooks | ARIA | Props | Fan-out | Fan-in | Partagées | Chemins |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map(
      (r) =>
        `| ${mdEscape(r.id)} | ${['files', 'loc', 'cyclomatic', 'keyboardHandlers', 'hooks', 'ariaCount', 'propsCount', 'fanOut', 'fanIn', 'sharedDeps'].map((key) => mdEscape(r.details[key])).join(' | ')} | ${mdEscape(r.details.paths.join(', '))} |`,
    ),
  );
  if (effort) {
    md.push(
      '',
      `Charge estimée : **${effort.totalDays} jours / ${effort.totalPoints} points dérivés** (${effort.model}, ${effort.anchorsCount} ancres).`,
      `Extrapolations : ${effort.extrapolatedCount}. Coût fixe : ${effort.overhead} jour(s), uniquement hors ancres.`,
      '',
      '| Catégorie | Unités | Jours | Points |',
      '|---|---|---|---|',
      ...Object.entries(effort.byCategory).map(
        ([name, g]) => `| ${mdEscape(name)} | ${g.components} | ${g.days} | ${g.points} |`,
      ),
      '',
      '| Ancre | Identifiant | Indice | Jours observés | Jours interpolés |',
      '|---|---|---|---|---|',
      ...Object.entries(effort.anchors).map(
        ([name, anchor]) =>
          `| ${mdEscape(name)} | ${mdEscape(anchor.id)} | ${anchor.index} | ${anchor.days} | ${anchor.estimated} |`,
      ),
    );
    if (effort.crossValidation) {
      md.push(
        '',
        `Validation croisée leave-one-out : MAE ${effort.crossValidation.mae} jour(s).`,
        '',
        '| Indice retiré | Jours observés | Prédiction sans cette ancre | Erreur absolue |',
        '|---|---|---|---|',
        ...effort.crossValidation.errors.map(
          (error) =>
            `| ${error.index} | ${error.actual} | ${error.predicted} | ${error.absError} |`,
        ),
      );
    }
    if (effort.lotEstimate)
      md.push(
        '',
        `Estimation en lot : ${effort.lotEstimate.totalDays} jours ; économie : ${effort.lotEstimate.savingDays} jours ; taux marginal : ${effort.lotRate}.`,
      );
  }
  md.push(
    '',
    '## Diagnostics',
    '',
    ...(report.diagnostics.length
      ? report.diagnostics.map(
          (d) =>
            `- ${mdEscape(d.code)} : ${mdEscape(d.message)}${d.path ? ` (${mdEscape(d.path)}:${d.startLine ?? 1})` : ''}`,
        )
      : ['Aucun diagnostic.']),
  );
  return { csv, md: md.join('\n') + '\n' };
}

async function main() {
  const command = new Command()
    .name('component-complexity')
    .version(VERSION)
    .description('Classement statique autonome et estimation facultative')
    .exitOverride()
    .option('--src <dossier>', 'Racine source', './src')
    .option('--out <fichier>', 'Rapport JSON et vues de même nom', './complexity-report.json')
    .option('--tsconfig <fichier>', 'Configuration TypeScript ; recherche automatique sinon')
    .option('--effort <ancres>', 'Objet JSON, paires identifiant:jours ou fichier JSON')
    .option('--overhead <jours>', 'Coût fixe des unités non ancres', '0')
    .option('--lot-rate <taux>', 'Coût marginal des ex æquo', '0.5');
  command.parse(process.argv);
  const options = command.opts();
  for (const name of ['src', 'out', 'tsconfig', 'effort', 'overhead', 'lotRate']) {
    if (options[name] !== undefined) z.string().trim().min(1).parse(options[name]);
  }
  const number = z.coerce.number().finite().nonnegative();
  const overhead = number.parse(options.overhead),
    lotRate = number.max(1).parse(options.lotRate);
  if (
    !options.effort &&
    (command.getOptionValueSource('overhead') === 'cli' ||
      command.getOptionValueSource('lotRate') === 'cli')
  )
    throw new Error('--overhead et --lot-rate nécessitent --effort');
  const root = canonical(options.src);
  if (!fs.statSync(root).isDirectory()) throw new Error('Racine source non répertoire');
  const configPath = options.tsconfig
    ? canonical(options.tsconfig)
    : ts.findConfigFile(root, ts.sys.fileExists);
  const anchors = options.effort ? readAnchors(options.effort) : null;
  const diagnostics = [],
    ranking = analyze(root, configPath, diagnostics);
  const effort = anchors ? estimate(ranking, anchors, overhead, lotRate, diagnostics) : null;
  const report = {
    schemaVersion: VERSION,
    algorithmVersions: {
      metrics: VERSION,
      ownership: VERSION,
      graph: VERSION,
      scoring: VERSION,
      effort: VERSION,
    },
    generatedAt: new Date().toISOString(),
    config: {
      srcDir: root,
      outFile: path.resolve(options.out),
      tsconfig: configPath ?? null,
      weights: WEIGHTS,
      bounds: BOUNDS,
    },
    diagnostics,
    ranking,
    ...(effort ? { effort } : {}),
  };
  const out = path.resolve(options.out),
    base = out.replace(/\.json$/i, '');
  const protectedPaths = [
    root,
    ...(configPath ? [canonical(configPath)] : []),
    ...(options.effort && fs.existsSync(options.effort) ? [canonical(options.effort)] : []),
  ];
  const { csv, md } = views(report);
  writeOutputs(
    [
      [
        out,
        JSON.stringify(
          report,
          (_key, value) => {
            if (typeof value === 'number' && !Number.isFinite(value)) {
              throw new Error('Résultat hors domaine numérique');
            }
            return value;
          },
          2,
        ) + '\n',
      ],
      [base + '.md', md],
      [base + '.csv', csv],
    ],
    protectedPaths,
  );
  console.table(
    ranking.map((r) => ({
      Identifiant: r.id,
      Indice: r.index,
      Statut: r.indexStatus,
      Percentile: r.percentile,
      ...(effort ? { Jours: r.estimatedDays } : {}),
    })),
  );
  if (effort)
    console.log(
      `Charge estimée : ${effort.totalDays} jours ; points dérivés : ${effort.totalPoints}`,
    );
  for (const diagnostic of diagnostics) console.error(`${diagnostic.code} : ${diagnostic.message}`);
  console.log(`Rapports : ${out}, ${base}.md, ${base}.csv`);
}
main().catch((error) => {
  if (error.code === 'commander.helpDisplayed' || error.code === 'commander.version') return;
  console.error('Erreur : ' + error.message);
  process.exitCode = 1;
});
