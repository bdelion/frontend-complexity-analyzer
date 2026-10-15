import { Node, SyntaxKind, type SourceFile } from 'ts-morph';
import type { Diagnostic, SourceUnit } from './models.js';
import { evidenceFor, makeMetric, type MetricOptions } from './ast.js';

/** Observe les signaux ARIA et clavier ; ne détermine aucune conformité.
 * @param source AST de production.
 * @param unit Unité recevant les mesures.
 * @param diagnostics Collecteur des limites.
 * @returns Aucun résultat autre que les mesures collectées.
 * @example analyzeInteractions(source, unit, diagnostics)
 */
export function analyzeInteractions(
  source: SourceFile,
  unit: SourceUnit,
  diagnostics: Diagnostic[],
): void {
  const add = (id: string, value: number, nodes: Node[], options: MetricOptions = {}) =>
    unit.metrics.push(
      makeMetric(
        unit,
        id,
        value,
        nodes.map((n) => evidenceFor(unit, n)),
        options,
      ),
    );
  const detail = (metricId: string, value: string, node: Node) =>
    unit.details.push({ metricId, value, evidence: evidenceFor(unit, node) });
  const warn = (code: string, message: string, node: Node) => {
    const id = `${unit.id}:${code}:${node.getStart()}`;
    diagnostics.push({ id, code, severity: 'warning', message, evidence: evidenceFor(unit, node) });
    unit.analysisStatus = 'partial';
    return id;
  };
  const attributes = source.getDescendantsOfKind(SyntaxKind.JsxAttribute);
  const aria = attributes.filter((a) => a.getNameNode().getText().startsWith('aria-'));
  add('a11y.ariaOccurrences', aria.length, aria);
  add('a11y.ariaNames', new Set(aria.map((a) => a.getNameNode().getText())).size, aria);
  for (const attribute of aria)
    detail('a11y.ariaOccurrences', attribute.getNameNode().getText(), attribute);
  for (const [id, names] of Object.entries({
    roles: ['role'],
    tabIndex: ['tabIndex'],
    live: ['aria-live'],
    relations: ['aria-controls', 'aria-labelledby', 'aria-describedby', 'aria-activedescendant'],
  })) {
    const selected = attributes.filter((a) => names.includes(a.getNameNode().getText()));
    add(`a11y.${id}`, selected.length, selected);
    for (const attribute of selected) {
      const initializer = attribute.getInitializer();
      if (initializer && Node.isStringLiteral(initializer))
        detail(`a11y.${id}`, initializer.getLiteralValue(), attribute);
      else if (initializer) {
        detail(`a11y.${id}`, '[dynamique]', attribute);
        warn(
          'DYNAMIC_A11Y',
          'Valeur accessible dynamique : vérification manuelle nécessaire',
          attribute,
        );
      }
    }
  }
  const spreads = source.getDescendantsOfKind(SyntaxKind.JsxSpreadAttribute);
  if (spreads[0]) {
    const id = warn(
      'JSX_SPREAD',
      'Attributs propagés : les signaux ARIA/clavier visibles peuvent être incomplets',
      spreads[0],
    );
    for (const metric of unit.metrics.filter((m) => m.id.startsWith('a11y.'))) {
      if (metric.observation.value !== null)
        metric.observation = {
          status: 'estimated',
          value: metric.observation.value,
          rationale: 'Comptage visible hors propagations',
        };
      metric.diagnosticIds.push(id);
    }
  }
  const focus = source.getDescendantsOfKind(SyntaxKind.CallExpression).filter((call) => {
    const expression = call.getExpression();
    return (
      Node.isPropertyAccessExpression(expression) &&
      ['focus', 'blur'].includes(expression.getName())
    );
  });
  add(
    'a11y.focusCalls',
    focus.length,
    focus,
    focus.length ? { estimated: 'Sites focus/blur ; cible DOM non garantie' } : {},
  );
  const handlers = attributes.filter((a) =>
    ['onKeyDown', 'onKeyUp', 'onKeyPress'].includes(a.getNameNode().getText()),
  );
  add(
    'keyboard.handlers',
    handlers.length,
    handlers,
    spreads.length ? { estimated: 'Gestionnaires visibles hors propagations' } : {},
  );
  const keys: Node[] = [];
  for (const node of source.getDescendants()) {
    if (!Node.isStringLiteral(node) && !Node.isNoSubstitutionTemplateLiteral(node)) continue;
    const parent = node.getParent();
    const comparison =
      parent &&
      Node.isBinaryExpression(parent) &&
      [
        SyntaxKind.EqualsEqualsToken,
        SyntaxKind.EqualsEqualsEqualsToken,
        SyntaxKind.ExclamationEqualsToken,
        SyntaxKind.ExclamationEqualsEqualsToken,
      ].includes(parent.getOperatorToken().getKind());
    const switchExpression =
      parent && Node.isCaseClause(parent)
        ? parent.getFirstAncestorByKind(SyntaxKind.SwitchStatement)?.getExpression().getText()
        : undefined;
    const condition = comparison ? parent.getText() : switchExpression;
    if (condition && /\.(?:key|code)\b/.test(condition)) {
      keys.push(node);
      const original = node.getLiteralValue();
      detail('keyboard.keys', [' ', 'Spacebar'].includes(original) ? 'Space' : original, node);
    }
  }
  add('keyboard.keyOccurrences', keys.length, keys);
  add(
    'keyboard.keys',
    new Set(unit.details.filter((d) => d.metricId === 'keyboard.keys').map((d) => d.value)).size,
    keys,
  );
}
