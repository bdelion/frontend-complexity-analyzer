import { Node, SyntaxKind, ts, type SourceFile, type Type } from 'ts-morph';
import type { Diagnostic, SourceUnit } from './models.js';
import {
  callable,
  componentExports,
  evidenceFor,
  importedReference,
  makeMetric,
  type MetricOptions,
} from './ast.js';

function objectDepth(type: Type, seen: Set<ts.Type>, level = 1): number | null {
  if (seen.has(type.compilerType) || type.isAny() || type.isUnknown()) return null;
  if (type.isUnion()) {
    const depths = type
      .getUnionTypes()
      .filter((t) => !t.isUndefined() && !t.isNull())
      .map((t) => objectDepth(t, new Set(seen), level));
    return depths.some((d) => d === null) ? null : Math.max(level - 1, ...(depths as number[]));
  }
  if (type.isArray()) return objectDepth(type.getArrayElementTypeOrThrow(), seen, level);
  if (!type.isObject() || type.getCallSignatures().length) return level - 1;
  seen.add(type.compilerType);
  const depths = type.getProperties().map((property) => {
    const declaration = property.getDeclarations()[0];
    return declaration
      ? objectDepth(property.getTypeAtLocation(declaration), new Set(seen), level + 1)
      : null;
  });
  return depths.some((d) => d === null) ? null : Math.max(level, ...(depths as number[]));
}

/** Mesure le code et l'API propres sans développer les imports.
 * @param source AST source.
 * @param unit Unité recevant les mesures.
 * @param diagnostics Limites rencontrées.
 * @returns Noms des exports de composants candidats.
 * @example analyzeCode(source, unit, diagnostics)
 */
export function analyzeCode(
  source: SourceFile,
  unit: SourceUnit,
  diagnostics: Diagnostic[],
): string[] {
  const add = (
    id: string,
    value: number | null,
    selected: Node[] = [],
    options: MetricOptions = {},
  ) =>
    unit.metrics.push(
      makeMetric(
        unit,
        id,
        value,
        selected.map((n) => evidenceFor(unit, n)),
        options,
      ),
    );
  add('code.files', 1, [source]);
  const lines = new Set<number>();
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    ts.LanguageVariant.JSX,
    source.getFullText(),
  );
  while (scanner.scan() !== ts.SyntaxKind.EndOfFileToken) {
    const start = source.getLineAndColumnAtPos(scanner.getTokenPos()).line;
    const end = source.getLineAndColumnAtPos(
      Math.max(scanner.getTokenPos(), scanner.getTextPos() - 1),
    ).line;
    for (let line = start; line <= end; line++) lines.add(line);
  }
  add('code.loc', lines.size, [source], { unit: 'lines' });
  if (unit.kind !== 'production') return [];
  const functions = source
    .getDescendants()
    .filter(
      (n) =>
        callable(n) ||
        Node.isMethodDeclaration(n) ||
        Node.isConstructorDeclaration(n) ||
        Node.isGetAccessorDeclaration(n) ||
        Node.isSetAccessorDeclaration(n),
    );
  const complexities: number[] = [];
  for (const fn of functions) {
    if (!('getBody' in fn) || !fn.getBody()) continue;
    let branches = 0;
    fn.forEachDescendant((node, traversal) => {
      if (functions.some((fn) => fn === node)) {
        traversal.skip();
        return;
      }
      if (
        Node.isIfStatement(node) ||
        Node.isCaseClause(node) ||
        Node.isCatchClause(node) ||
        Node.isConditionalExpression(node)
      )
        branches++;
      if (
        Node.isBinaryExpression(node) &&
        [SyntaxKind.AmpersandAmpersandToken, SyntaxKind.BarBarToken].includes(
          node.getOperatorToken().getKind(),
        )
      )
        branches++;
    });
    complexities.push(1 + branches);
    unit.details.push({
      metricId: 'code.cc.distribution',
      value: String(1 + branches),
      evidence: evidenceFor(unit, fn),
    });
  }
  add('code.functions', complexities.length, functions);
  add(
    'code.cc.sum',
    complexities.reduce((a, b) => a + b, 0),
    functions,
  );
  add('code.cc.max', complexities.length ? Math.max(...complexities) : null, functions, {
    reason: 'Aucune fonction',
  });
  const loops = source
    .getDescendants()
    .filter(
      (n) =>
        Node.isForStatement(n) ||
        Node.isForInStatement(n) ||
        Node.isForOfStatement(n) ||
        Node.isWhileStatement(n) ||
        Node.isDoStatement(n),
    );
  add('code.loops', loops.length, loops);
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  for (const name of [
    'useState',
    'useEffect',
    'useMemo',
    'useCallback',
    'useReducer',
    'useRef',
    'useContext',
    'useLayoutEffect',
    'useImperativeHandle',
    'useId',
    'useTransition',
    'useDeferredValue',
    'useSyncExternalStore',
    'memo',
    'forwardRef',
    'createContext',
  ]) {
    const selected = calls.filter((call) => {
      const ref = importedReference(call.getExpression());
      return ref?.module === 'react' && ref.name === name;
    });
    add(`react.${name}`, selected.length, selected);
  }
  const custom = calls.filter(
    (call) =>
      /^use[A-Z]/.test(call.getExpression().getText()) &&
      importedReference(call.getExpression())?.module !== 'react',
  );
  add('react.customHookCalls', custom.length, custom);
  const exports = componentExports(source);
  const props = new Map<string, Node>();
  const required = new Map<string, Node>();
  const callbacks = new Map<string, Node>();
  const inherited = new Map<string, Node>();
  let unresolved = false;
  let callbackUnresolved = false;
  let depth: number | null = 0;
  let generics = 0;
  for (const candidate of exports) {
    generics += candidate.render.getTypeParameters().length;
    const parameter = candidate.render.getParameters()[0];
    if (!parameter) continue;
    const type = parameter.getType();
    if (type.isAny() || type.isUnknown()) {
      unresolved = true;
      unit.analysisStatus = 'partial';
      diagnostics.push({
        id: `${unit.id}:API_UNRESOLVED:${parameter.getStart()}`,
        code: 'API_UNRESOLVED',
        severity: 'warning',
        message: 'Type des props non résolu',
        evidence: evidenceFor(unit, parameter),
      });
      continue;
    }
    const parts = type.isUnion() ? type.getUnionTypes() : [type];
    for (const name of new Set(parts.flatMap((t) => t.getProperties().map((p) => p.getName())))) {
      const symbols = parts.map((t) => t.getProperty(name));
      const symbol = symbols.find((s) => s !== undefined);
      if (!symbol) continue;
      const declaration = symbol.getDeclarations()[0] ?? parameter;
      const key = `${candidate.name}:${name}`;
      if (
        /(?:@types[\\/]react[\\/]|lib\.dom\.d\.ts)/.test(declaration.getSourceFile().getFilePath())
      ) {
        inherited.set(key, parameter);
        continue;
      }
      props.set(key, parameter);
      if (symbols.every((s) => s && !s.isOptional())) required.set(key, parameter);
      const propertyType = symbol.getTypeAtLocation(parameter);
      const variants = propertyType.isUnion() ? propertyType.getUnionTypes() : [propertyType];
      if (variants.some((t) => t.isAny() || t.isUnknown())) callbackUnresolved = true;
      if (variants.some((t) => t.getCallSignatures().length > 0)) callbacks.set(key, parameter);
      const childDepth = objectDepth(propertyType, new Set());
      depth = childDepth === null || depth === null ? null : Math.max(depth, childDepth);
    }
  }
  for (const [id, map] of [
    ['props', props],
    ['required', required],
    ['callbacks', callbacks],
  ] as const)
    add(
      `api.${id}`,
      unresolved || (id === 'callbacks' && callbackUnresolved) ? null : map.size,
      [...map.values()],
      { reason: 'Props ou signatures de callbacks non résolues dans une API exportée' },
    );
  add('api.inheritedProps', inherited.size, [...inherited.values()]);
  const events = [...callbacks].filter(([name]) => /:on[A-Z]/.test(name));
  add(
    'api.events',
    unresolved || callbackUnresolved ? null : events.length,
    events.map(([, node]) => node),
    { reason: 'Signatures de callbacks non résolues' },
  );
  add(
    'api.generics',
    generics,
    exports.map((e) => e.node),
  );
  add(
    'api.configDepth',
    unresolved ? null : depth,
    exports.map((e) => e.node),
    { unit: 'depth', reason: 'Type récursif ou non résolu' },
  );
  add(
    'api.components',
    exports.length,
    exports.map((e) => e.node),
  );
  const publicNodes = [
    ...new Set(
      [...source.getExportedDeclarations().values()]
        .flat()
        .filter((n) => n.getSourceFile() === source),
    ),
  ];
  add('api.exports', publicNodes.length, publicNodes);
  const interfaces = publicNodes.filter(Node.isInterfaceDeclaration);
  add('api.interfaces', interfaces.length, interfaces);
  const documented = publicNodes.filter((n) => {
    const parent = Node.isVariableDeclaration(n)
      ? n.getFirstAncestorByKind(SyntaxKind.VariableStatement)
      : n;
    return parent?.getLeadingCommentRanges().some((c) => c.getText().startsWith('/**'));
  });
  add('docs.documentedExports', documented.length, documented);
  add(
    'docs.publicDocumented',
    publicNodes.length ? documented.length / publicNodes.length : null,
    documented,
    { unit: 'ratio', reason: 'Aucun export public' },
  );
  return exports.map((e) => e.name);
}
