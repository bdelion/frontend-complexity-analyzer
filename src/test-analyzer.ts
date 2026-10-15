import { Node, SyntaxKind, type SourceFile } from 'ts-morph';
import type { Diagnostic, SourceUnit } from './models.js';
import { evidenceFor, importedReference, makeMetric, type MetricOptions } from './ast.js';

/** Compte les déclarations de tests sans exécuter leurs corps.
 * @param source AST de test.
 * @param unit Unité recevant les mesures.
 * @param diagnostics Collecteur des ambiguïtés.
 * @param framework Framework imposé par la configuration.
 * @returns Aucun résultat hors du collecteur.
 * @example analyzeTests(source, unit, diagnostics, 'jest')
 */
export function analyzeTests(
  source: SourceFile,
  unit: SourceUnit,
  diagnostics: Diagnostic[],
  framework?: string,
): void {
  const modules = ['@jest/globals', 'vitest', '@playwright/test', 'playwright/test'];
  const frameworks = new Set(
    source
      .getImportDeclarations()
      .map((i) => i.getModuleSpecifierValue())
      .filter((m) => modules.includes(m)),
  );
  const inferred = framework ?? (frameworks.size === 1 ? [...frameworks][0] : undefined);
  const globalNames = new Set([
    'describe',
    'it',
    'test',
    'expect',
    'xdescribe',
    'xit',
    'xtest',
    'fdescribe',
    'fit',
  ]);
  const selected: Record<string, Node[]> = {
    declarations: [],
    disabled: [],
    focused: [],
    suites: [],
    assertions: [],
    snapshots: [],
  };
  const actions: Node[] = [];
  const keyboard: Node[] = [];
  const focusAssertions: Node[] = [];
  const a11yAssertions: Node[] = [];
  let implicit = false;
  function resolveApi(initial: Node) {
    let expression: Node = initial;
    const modifiers: string[] = [];
    while (
      Node.isPropertyAccessExpression(expression) ||
      Node.isCallExpression(expression) ||
      Node.isTaggedTemplateExpression(expression)
    ) {
      if (Node.isPropertyAccessExpression(expression)) {
        const imported = importedReference(expression);
        if (imported && modules.includes(imported.module) && globalNames.has(imported.name)) break;
        modifiers.push(expression.getName());
        expression = expression.getExpression();
      } else if (Node.isTaggedTemplateExpression(expression)) expression = expression.getTag();
      else expression = expression.getExpression();
    }
    const ref = importedReference(expression);
    let name = ref?.name;
    let recognized = ref !== undefined && modules.includes(ref.module);
    let global = false;
    if (!ref && Node.isIdentifier(expression) && globalNames.has(expression.getText())) {
      const declarations = expression.getSymbol()?.getDeclarations() ?? [];
      if (!declarations.some((d) => d.getSourceFile() === source)) {
        name = expression.getText();
        recognized = true;
        global = true;
      }
    }
    return { name, recognized, global, modifiers };
  }
  for (const call of source.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const { name, recognized, global, modifiers } = resolveApi(call.getExpression());
    const parent = call.getParent();
    if (
      Node.isCallExpression(parent) ||
      (Node.isPropertyAccessExpression(parent) && modifiers.includes('each'))
    )
      continue;
    if (global && !inferred) implicit = true;
    if (recognized && name) {
      const configuration = modifiers.some((m) =>
        ['step', 'extend', 'use', 'setTimeout', 'configure', 'info', 'slow'].includes(m),
      );
      const suite =
        ['describe', 'xdescribe', 'fdescribe'].includes(name) ||
        (name === 'test' && modifiers.includes('describe'));
      if (suite && !configuration) selected.suites!.push(call);
      if (['it', 'test', 'xit', 'xtest', 'fit'].includes(name) && !suite && !configuration) {
        // Les annotations Playwright test.skip(condition, raison) ne déclarent pas de scénario.
        const first = call.getArguments()[0];
        if (
          modifiers.some((m) => ['skip', 'fixme', 'fail'].includes(m)) &&
          (!first ||
            (!Node.isStringLiteral(first) &&
              !Node.isNoSubstitutionTemplateLiteral(first) &&
              !call
                .getArguments()
                .some((arg) => Node.isArrowFunction(arg) || Node.isFunctionExpression(arg))))
        )
          continue;
        const skippedSuite = call
          .getAncestors()
          .filter(Node.isCallExpression)
          .some((ancestor) => {
            const api = resolveApi(ancestor.getExpression());
            return (
              api.recognized &&
              (api.name === 'xdescribe' ||
                ((api.name === 'describe' ||
                  (api.name === 'test' && api.modifiers.includes('describe'))) &&
                  api.modifiers.includes('skip')))
            );
          });
        if (
          skippedSuite ||
          modifiers.includes('skip') ||
          modifiers.includes('fixme') ||
          modifiers.includes('todo') ||
          ['xit', 'xtest'].includes(name)
        )
          selected.disabled!.push(call);
        else selected.declarations!.push(call);
        if (modifiers.includes('only') || name === 'fit') selected.focused!.push(call);
      }
      if (name === 'expect' && modifiers.length > 0) {
        selected.assertions!.push(call);
        if (modifiers.some((m) => m.includes('Snapshot'))) selected.snapshots!.push(call);
        if (modifiers.includes('toBeFocused')) focusAssertions.push(call);
        if (modifiers.some((m) => /(?:ARIA|Aria|Accessible)/.test(m))) a11yAssertions.push(call);
      }
    }
    if (inferred?.includes('playwright') || [...frameworks].some((f) => f.includes('playwright'))) {
      const access = call.getExpression();
      if (Node.isPropertyAccessExpression(access)) {
        if (['click', 'fill', 'hover', 'check', 'selectOption'].includes(access.getName()))
          actions.push(call);
        if (access.getName() === 'press' && /\.keyboard$/.test(access.getExpression().getText()))
          keyboard.push(call);
      }
    }
  }
  if (implicit) {
    unit.analysisStatus = 'partial';
    diagnostics.push({
      id: `${unit.id}:TEST_FRAMEWORK_AMBIGUOUS`,
      code: 'TEST_FRAMEWORK_AMBIGUOUS',
      severity: 'warning',
      message: 'API globale sans framework identifiable : préciser testPatterns',
      evidence: evidenceFor(unit, source),
    });
  }
  const options: MetricOptions = implicit
    ? { estimated: 'Déclarations globales sans framework confirmé' }
    : {};
  const add = (id: string, nodes: Node[], opts: MetricOptions = {}) =>
    unit.metrics.push(
      makeMetric(
        unit,
        id,
        nodes.length,
        nodes.map((n) => evidenceFor(unit, n)),
        opts,
      ),
    );
  add('tests.files', [source]);
  for (const [id, nodes] of Object.entries(selected)) add(`tests.${id}`, nodes, options);
  add('playwright.actions', actions);
  add('playwright.keyboard', keyboard);
  add('playwright.focusAssertions', focusAssertions);
  add('playwright.accessibilityAssertions', a11yAssertions);
  unit.metrics.push(
    makeMetric(unit, 'coverage.executed', null, [], {
      unit: 'ratio',
      reason: 'Aucun résultat de couverture exécutée importé',
    }),
  );
}
