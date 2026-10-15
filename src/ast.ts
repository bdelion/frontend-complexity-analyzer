import {
  Node,
  SyntaxKind,
  type SourceFile,
  type FunctionDeclaration,
  type ArrowFunction,
  type FunctionExpression,
} from 'ts-morph';
import type { Evidence, Metric, SourceUnit } from './models.js';

/** Fonction possédant potentiellement un corps de rendu. */
export type Callable = FunctionDeclaration | ArrowFunction | FunctionExpression;

/** Reconnaît les fonctions de rendu.
 * @param node Nœud AST.
 * @returns Vrai pour une fonction ou une flèche.
 * @example callable(node)
 */
export function callable(node: Node): node is Callable {
  return (
    Node.isFunctionDeclaration(node) ||
    Node.isArrowFunction(node) ||
    Node.isFunctionExpression(node)
  );
}

/** Retrouve le nom original d'une référence importée, sans exécuter de module.
 * @param node Référence locale, renommée ou qualifiée.
 * @returns Module et nom original éventuels.
 * @example importedReference(call.getExpression())
 */
export function importedReference(node: Node): { module: string; name: string } | undefined {
  if (Node.isPropertyAccessExpression(node)) {
    const base = importedReference(node.getExpression());
    return base && ['*', 'default'].includes(base.name)
      ? { module: base.module, name: node.getName() }
      : undefined;
  }
  for (const declaration of node.getSymbol()?.getDeclarations() ?? []) {
    const statement = declaration.getFirstAncestorByKind(SyntaxKind.ImportDeclaration);
    if (!statement) continue;
    if (Node.isImportSpecifier(declaration))
      return { module: statement.getModuleSpecifierValue(), name: declaration.getName() };
    if (Node.isNamespaceImport(declaration))
      return { module: statement.getModuleSpecifierValue(), name: '*' };
    if (Node.isImportClause(declaration))
      return { module: statement.getModuleSpecifierValue(), name: 'default' };
  }
  return undefined;
}

/** Détecte les exports locaux de composants ; les réexports restent des liens.
 * @param source Fichier AST.
 * @returns Exports candidats et fonctions de rendu.
 * @example componentExports(source)
 */
export function componentExports(
  source: SourceFile,
): { name: string; node: Node; render: Callable }[] {
  const result: { name: string; node: Node; render: Callable }[] = [];
  function resolveRender(node: Node, seen = new Set<Node>()): Callable | undefined {
    if (seen.has(node)) return undefined;
    seen.add(node);
    if (callable(node)) return node;
    if (Node.isVariableDeclaration(node)) {
      const initializer = node.getInitializer();
      return initializer ? resolveRender(initializer, seen) : undefined;
    }
    if (Node.isCallExpression(node)) {
      const argument = node.getArguments()[0];
      return argument ? resolveRender(argument, seen) : undefined;
    }
    if (Node.isIdentifier(node)) {
      const declaration = node
        .getSymbol()
        ?.getDeclarations()
        .find((d) => d.getSourceFile() === source);
      return declaration ? resolveRender(declaration, seen) : undefined;
    }
    return undefined;
  }
  for (const [exportName, declarations] of source.getExportedDeclarations()) {
    for (const declaration of declarations) {
      if (declaration.getSourceFile() !== source) continue;
      const name =
        exportName === 'default' && Node.isFunctionDeclaration(declaration)
          ? (declaration.getName() ?? 'default')
          : exportName;
      if (name !== 'default' && !/^[A-Z]/.test(name)) continue;
      const render = resolveRender(declaration);
      const hasJsx = render
        ?.getDescendants()
        .some((n) => Node.isJsxElement(n) || Node.isJsxSelfClosingElement(n));
      const wrapper = declaration.getDescendantsOfKind(SyntaxKind.CallExpression).some((call) => {
        const ref = importedReference(call.getExpression());
        return (
          ref?.module === 'react' && ['memo', 'forwardRef', 'createElement'].includes(ref.name)
        );
      });
      const nullRender =
        render &&
        (render.getText().includes('return null') ||
          (Node.isArrowFunction(render) && render.getBody().getText() === 'null'));
      if (
        render &&
        (hasJsx || wrapper || nullRender) &&
        !result.some((r) => r.node === declaration)
      )
        result.push({ name, node: declaration, render });
    }
  }
  return result;
}

/** Produit une localisation AST portable.
 * @param unit Unité source.
 * @param node Nœud observé.
 * @returns Preuve sans contenu source.
 * @example evidenceFor(unit, source)
 */
export function evidenceFor(
  unit: Pick<SourceUnit, 'libraryId' | 'relativePath'>,
  node: Node,
): Evidence {
  return {
    libraryId: unit.libraryId,
    relativePath: unit.relativePath,
    startLine: node.getStartLineNumber(),
    endLine: node.getEndLineNumber(),
    kind: 'ast',
  };
}

/** Options d'une valeur absente ou estimée. */
export interface MetricOptions {
  unit?: Metric['unit'];
  reason?: string;
  estimated?: string;
}

/** Construit une mesure et une preuve d'inventaire pour les zéros.
 * @param unit Sujet propriétaire.
 * @param id Identifiant de métrique.
 * @param value Valeur ou absence explicite.
 * @param evidence Preuves.
 * @param options Unité et justification.
 * @returns Mesure versionnée.
 * @example makeMetric(unit, 'code.files', 1, [proof])
 */
export function makeMetric(
  unit: Pick<SourceUnit, 'id' | 'libraryId' | 'relativePath' | 'ownerComponentId'>,
  id: string,
  value: number | null,
  evidence: Evidence[],
  options: MetricOptions = {},
): Metric {
  return {
    id,
    algorithmVersion: id.startsWith('code.cc') ? 'cc-v4-proposal-1' : '1.0.0',
    unit: options.unit ?? 'count',
    subjectId: unit.id,
    scope: unit.ownerComponentId ? 'own' : 'shared',
    observation:
      value === null
        ? { status: 'unavailable', value: null, reason: options.reason ?? 'Mesure indisponible' }
        : options.estimated
          ? { status: 'estimated', value, rationale: options.estimated }
          : { status: 'measured', value },
    evidence: evidence.length
      ? evidence
      : [
          {
            libraryId: unit.libraryId,
            relativePath: unit.relativePath,
            startLine: 1,
            endLine: 1,
            kind: 'inventory',
          },
        ],
    diagnosticIds: [],
  };
}
