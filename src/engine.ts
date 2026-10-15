import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { Project, ts, Node, SyntaxKind, type SourceFile } from 'ts-morph';
import { type Configuration, fingerprint, matcher } from './configuration.js';
import { portable, walk, contains } from './filesystem.js';
import { type AnalysisReport, type SourceUnit, validateReport } from './models.js';
import { componentExports, evidenceFor, makeMetric } from './ast.js';
import { analyzeCode } from './code-analyzer.js';
import { analyzeInteractions } from './interaction-analyzer.js';
import { analyzeTests } from './test-analyzer.js';
import { aggregate } from './aggregation.js';
import { setImmediate } from 'node:timers/promises';
import type { ProgressObserver, ProgressUpdate } from './progress.js';

/** Version des résultats et algorithmes publiés. */
export const TOOL_VERSION = '0.1.0';

/** Analyse une configuration sans écrire ni exécuter les entrées.
 * @param config Configuration déjà validée.
 * @param componentFilter Identifiant ou nom non ambigu d'un composant.
 * @param onProgress Observateur facultatif, sans effet sur les métriques.
 * @returns Rapport canonique validé.
 * @throws Si le périmètre ou le filtre est invalide.
 * @example await analyze(config, 'ds:src/Button')
 */
export async function analyze(
  config: Configuration,
  componentFilter?: string,
  onProgress?: ProgressObserver,
): Promise<AnalysisReport> {
  const notify = async (update: ProgressUpdate): Promise<void> => {
    if (onProgress) {
      onProgress(update);
      await setImmediate();
    }
  };
  const report: AnalysisReport = {
    schemaVersion: '1.0.0',
    toolVersion: TOOL_VERSION,
    runId: randomUUID(),
    generatedAt: new Date().toISOString(),
    status: 'complete',
    configurationFingerprint: fingerprint(config, componentFilter),
    algorithmVersions: {
      code: '1.0.0',
      cyclomatic: 'cc-v4-proposal-1',
      api: '1.0.0',
      react: '1.0.0',
      accessibility: '1.0.0',
      keyboard: '1.0.0',
      tests: '1.0.0',
      ownership: '1.0.0',
      graph: '1.0.0',
    },
    libraries: [],
    units: [],
    components: [],
    diagnostics: [],
    coverage: {
      discoveredFiles: 0,
      excludedFiles: 0,
      eligibleFiles: 0,
      analyzedFiles: 0,
      partialFiles: 0,
      failedFiles: 0,
      unresolvedCandidateIds: [],
    },
    profiles: {
      intrinsic: ['code.', 'api.', 'react.'],
      accessibility: ['a11y.', 'keyboard.'],
      maintenance: ['graph.', 'tests.', 'coverage.', 'docs.'],
    },
  };
  const ast = new Map<string, SourceFile>();
  const absoluteUnits = new Map<string, SourceUnit>();
  const sourcePaths = new Map<string, string>();
  const forcedFramework = new Map<string, string>();
  const projects = new Map<string, Project>();
  const excluded = matcher(config.exclusions);
  for (const library of config.libraries) {
    await notify({ phase: `Découverte ${library.id}` });
    report.libraries.push({ id: library.id, root: library.root, metrics: [] });
    const inventory = await walk(
      library.root,
      (relative) =>
        excluded(relative) ||
        ['node_modules', 'dist', 'coverage', '.git'].some((segment) =>
          relative.split('/').includes(segment),
        ),
    );
    report.coverage.excludedFiles += inventory.excluded + inventory.links.length;
    for (const link of inventory.links)
      report.diagnostics.push({
        id: `${library.id}:LINK:${link}`,
        code: 'SYMLINK_SKIPPED',
        severity: 'info',
        message: `Lien non parcouru : ${link}`,
      });
    const cases = new Set<string>();
    let indexed = 0;
    for (const file of inventory.files) {
      await notify({
        phase: `Indexation ${library.id}`,
        completed: indexed++,
        total: inventory.files.length,
      });
      const relative = portable(path.relative(library.root, file));
      if (cases.has(relative.toLowerCase())) throw new Error(`Collision de casse : ${relative}`);
      cases.add(relative.toLowerCase());
      let framework: string | undefined;
      for (const [name, patterns] of Object.entries(config.testPatterns))
        if (matcher(patterns)(relative)) {
          if (framework) throw new Error(`Frameworks configurés en conflit : ${relative}`);
          framework = name;
        }
      const text = await readFile(file, 'utf8');
      const kind = /\.stories\.[jt]sx?$/.test(file)
        ? 'story'
        : framework || /\.(?:test|spec)\.[jt]sx?$/.test(file)
          ? 'test'
          : 'production';
      const unit: SourceUnit = {
        id: `${library.id}:${relative}`,
        libraryId: library.id,
        relativePath: relative,
        kind,
        ownerComponentId: null,
        usedByComponentIds: [],
        dependencies: [],
        externalDependencies: [],
        typeDependencies: [],
        metrics: [],
        details: [],
        analysisStatus: 'complete',
      };
      const configPath =
        library.tsconfig ?? (await nearestConfig(path.dirname(file), library.root));
      const projectKey = `${library.id}:${configPath ?? 'default'}`;
      let project = projects.get(projectKey);
      if (!project) {
        project = new Project({
          ...(configPath
            ? { tsConfigFilePath: configPath, skipAddingFilesFromTsConfig: true }
            : {}),
          skipFileDependencyResolution: true,
          compilerOptions: {
            jsx: ts.JsxEmit.Preserve,
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            allowJs: true,
            noEmit: true,
          },
        });
        projects.set(projectKey, project);
      }
      const source = project.createSourceFile(file, text, { overwrite: true });
      ast.set(unit.id, source);
      absoluteUnits.set(path.normalize(file).toLowerCase(), unit);
      sourcePaths.set(unit.id, file);
      if (framework) forcedFramework.set(unit.id, framework);
      report.units.push(unit);
    }
  }
  // Les options effectives font partie du périmètre de comparaison.
  const normalizeOption = (key: string, value: unknown): unknown => {
    if (key === 'configFile') return undefined;
    if (typeof value !== 'string') return value;
    let normalized = portable(value);
    for (const library of config.libraries)
      normalized = normalized.replaceAll(portable(library.root), `<${library.id}>`);
    return normalized;
  };
  const projectOptions = [...projects]
    .map(
      ([key, project]) =>
        [
          normalizeOption('', key),
          JSON.parse(JSON.stringify(project.getCompilerOptions(), normalizeOption)),
        ] as const,
    )
    .sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'en'));
  report.configurationFingerprint = createHash('sha256')
    .update(report.configurationFingerprint + JSON.stringify(projectOptions))
    .digest('hex');
  // Tous les fichiers du projet sont présents avant la résolution des symboles.
  let detected = 0;
  for (const unit of report.units) {
    await notify({
      phase: 'Détection des composants',
      completed: detected++,
      total: report.units.length,
    });
    const source = ast.get(unit.id)!;
    const syntax = source
      .getProject()
      .getProgram()
      .compilerObject.getSyntacticDiagnostics(source.compilerNode);
    if (syntax.length) {
      unit.analysisStatus = 'failed';
      for (const issue of syntax)
        report.diagnostics.push({
          id: `${unit.id}:PARSE:${issue.start ?? 0}`,
          code: 'PARSE_ERROR',
          severity: 'error',
          message: ts.flattenDiagnosticMessageText(issue.messageText, ' '),
          evidence: {
            ...evidenceFor(unit, source),
            startLine: source.getLineAndColumnAtPos(issue.start ?? 0).line,
            endLine: source.getLineAndColumnAtPos(issue.start ?? 0).line,
          },
        });
    }
    if (unit.kind !== 'production' || unit.analysisStatus === 'failed') continue;
    const library = config.libraries.find((l) => l.id === unit.libraryId)!;
    const directory = portable(path.dirname(unit.relativePath));
    if (componentExports(source).length && matcher(library.componentGlobs)(directory)) {
      const id = `${unit.libraryId}:${directory}`;
      let component = report.components.find((c) => c.id === id);
      if (!component) {
        component = {
          id,
          libraryId: unit.libraryId,
          relativeDirectory: directory,
          displayName: directory === '.' ? library.id : path.basename(directory),
          exportSymbolIds: [],
          ownUnitIds: [],
          sharedUnitIds: [],
          metrics: [],
          diagnosticIds: [],
        };
        report.components.push(component);
      }
      component.exportSymbolIds.push(
        ...componentExports(source).map((e) => `${unit.id}#${e.name}`),
      );
    }
  }
  let linked = 0;
  for (const unit of report.units) {
    await notify({
      phase: 'Résolution des dépendances',
      completed: linked++,
      total: report.units.length,
    });
    const candidates = report.components
      .filter(
        (c) =>
          c.libraryId === unit.libraryId &&
          (c.relativeDirectory === '.' || unit.relativePath.startsWith(`${c.relativeDirectory}/`)),
      )
      .sort((a, b) => b.relativeDirectory.length - a.relativeDirectory.length);
    const override = config.ownershipOverrides[unit.id];
    const owner =
      override === undefined
        ? (candidates[0]?.id ?? null)
        : override === null
          ? null
          : `${unit.libraryId}:${portable(override)}`;
    if (owner && !report.components.some((c) => c.id === owner))
      throw new Error(`Propriétaire configuré inconnu : ${owner}`);
    unit.ownerComponentId = owner;
    const source = ast.get(unit.id)!;
    const file = sourcePaths.get(unit.id)!;
    const imports = [
      ...source.getImportDeclarations(),
      ...source.getExportDeclarations().filter((e) => e.getModuleSpecifier()),
    ];
    for (const declaration of imports) {
      const specifier = declaration.getModuleSpecifierValue();
      if (!specifier) continue;
      const resolved = ts.resolveModuleName(
        specifier,
        file,
        source.getProject().getCompilerOptions(),
        ts.sys,
      ).resolvedModule?.resolvedFileName;
      const target = resolved
        ? absoluteUnits.get(path.normalize(resolved).toLowerCase())
        : undefined;
      const configuredAlias = Object.keys(
        source.getProject().getCompilerOptions().paths ?? {},
      ).some((pattern) => {
        const [prefix, suffix = ''] = pattern.split('*');
        return pattern.includes('*')
          ? specifier.startsWith(prefix!) && specifier.endsWith(suffix)
          : specifier === pattern;
      });
      if (target) {
        unit.dependencies.push(target.id);
        if (declaration.isTypeOnly()) unit.typeDependencies.push(target.id);
      } else if (
        resolved?.endsWith('.d.ts') &&
        config.libraries.some((l) => contains(l.root, resolved))
      ) {
        unit.details.push({
          metricId: 'graph.typeDeclarations',
          value: portable(
            path.relative(config.libraries.find((l) => l.id === unit.libraryId)!.root, resolved),
          ),
          evidence: evidenceFor(unit, declaration),
        });
      } else if (
        specifier.startsWith('.') ||
        configuredAlias ||
        (resolved && !resolved.includes('node_modules') && !resolved.endsWith('.d.ts'))
      ) {
        unit.analysisStatus = unit.analysisStatus === 'failed' ? 'failed' : 'partial';
        report.diagnostics.push({
          id: `${unit.id}:IMPORT:${declaration.getStart()}`,
          code: 'IMPORT_UNRESOLVED',
          severity: 'warning',
          message: `Import interne non analysé : ${specifier}`,
          evidence: evidenceFor(unit, declaration),
        });
      } else
        unit.externalDependencies.push(
          specifier.startsWith('@')
            ? specifier.split('/').slice(0, 2).join('/')
            : specifier.split('/')[0]!,
        );
    }
    for (const call of source.getDescendantsOfKind(SyntaxKind.CallExpression))
      if (
        call.getExpression().getKind() === SyntaxKind.ImportKeyword ||
        (Node.isIdentifier(call.getExpression()) && call.getExpression().getText() === 'require')
      ) {
        unit.analysisStatus = unit.analysisStatus === 'failed' ? 'failed' : 'partial';
        report.diagnostics.push({
          id: `${unit.id}:DYNAMIC_IMPORT:${call.getStart()}`,
          code: 'DYNAMIC_IMPORT',
          severity: 'warning',
          message: 'Import dynamique/require non suivi dans le graphe',
          evidence: evidenceFor(unit, call),
        });
      }
    unit.dependencies = [...new Set(unit.dependencies)].sort();
    unit.externalDependencies = [...new Set(unit.externalDependencies)].sort();
    unit.typeDependencies = [...new Set(unit.typeDependencies)].sort();
    const incomplete =
      unit.analysisStatus === 'failed' ||
      report.diagnostics.some(
        (d) =>
          d.id.startsWith(`${unit.id}:`) &&
          ['IMPORT_UNRESOLVED', 'DYNAMIC_IMPORT'].includes(d.code),
      );
    unit.metrics.push(
      makeMetric(
        unit,
        'graph.importDeclarations',
        imports.length,
        imports.map((n) => evidenceFor(unit, n)),
      ),
    );
    unit.metrics.push(
      makeMetric(
        unit,
        'graph.dependencies',
        unit.dependencies.length,
        imports.map((n) => evidenceFor(unit, n)),
        incomplete ? { estimated: 'Dépendances visibles ; résolution incomplète' } : {},
      ),
    );
  }
  // Les tests multi-composants sont conservés comme unités partagées uniques.
  await notify({ phase: 'Attribution des fichiers partagés' });
  for (const unit of report.units.filter((u) => u.kind !== 'production')) {
    const owners = [
      ...new Set(
        unit.dependencies
          .map((id) => report.units.find((u) => u.id === id)?.ownerComponentId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (owners.length > 1 && !(unit.id in config.ownershipOverrides)) unit.ownerComponentId = null;
    if (!unit.ownerComponentId) unit.usedByComponentIds = owners;
  }
  if (componentFilter) {
    const selected = report.components.filter(
      (c) => c.id === componentFilter || c.displayName === componentFilter,
    );
    if (selected.length !== 1)
      throw new Error(
        `Composant absent ou ambigu : ${componentFilter}. Utiliser libraryId:chemin.`,
      );
    report.components = selected;
  }
  const selectedIds = new Set(report.components.map((c) => c.id));
  const byId = new Map(report.units.map((u) => [u.id, u]));
  for (const component of report.components) {
    component.ownUnitIds = report.units
      .filter((u) => u.ownerComponentId === component.id)
      .map((u) => u.id)
      .sort();
    const seeds = [
      ...component.ownUnitIds,
      ...report.units.filter((u) => u.usedByComponentIds.includes(component.id)).map((u) => u.id),
    ];
    const visited = new Set<string>();
    const pending = [...seeds];
    while (pending.length) {
      const id = pending.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const unit = byId.get(id)!;
      if (!unit.usedByComponentIds.includes(component.id))
        unit.usedByComponentIds.push(component.id);
      pending.push(...unit.dependencies);
    }
    component.sharedUnitIds = [...visited]
      .filter((id) => !component.ownUnitIds.includes(id))
      .sort();
  }
  if (componentFilter) {
    const retained = new Set(
      report.components.flatMap((c) => [...c.ownUnitIds, ...c.sharedUnitIds]),
    );
    report.units = report.units.filter((u) => retained.has(u.id));
    for (const unit of report.units) {
      if (unit.ownerComponentId && !selectedIds.has(unit.ownerComponentId))
        unit.ownerComponentId = null;
      unit.usedByComponentIds = unit.usedByComponentIds.filter((id) => selectedIds.has(id));
    }
    report.diagnostics = report.diagnostics.filter(
      (d) =>
        !d.evidence ||
        report.units.some(
          (u) =>
            u.libraryId === d.evidence!.libraryId && u.relativePath === d.evidence!.relativePath,
        ),
    );
  }
  let measured = 0;
  for (const unit of report.units) {
    await notify({
      phase: 'Analyse des fichiers',
      completed: measured++,
      total: report.units.length,
    });
    const source = ast.get(unit.id)!;
    if (unit.analysisStatus === 'failed') {
      unit.metrics.push(makeMetric(unit, 'code.files', 1, [evidenceFor(unit, source)]));
      unit.metrics.push(
        makeMetric(unit, 'code.loc', null, [], { unit: 'lines', reason: 'Fichier non parsable' }),
      );
      if (unit.kind === 'production' && /\.tsx$/.test(unit.relativePath))
        report.coverage.unresolvedCandidateIds.push(unit.id);
      continue;
    }
    analyzeCode(source, unit, report.diagnostics);
    if (unit.kind === 'production') analyzeInteractions(source, unit, report.diagnostics);
    else if (unit.kind === 'test')
      analyzeTests(source, unit, report.diagnostics, forcedFramework.get(unit.id));
    else {
      const stories = [...source.getExportedDeclarations()].filter(([name]) => name !== 'default');
      unit.metrics.push(
        makeMetric(
          unit,
          'stories.exports',
          stories.length,
          stories.flatMap(([, nodes]) => nodes.map((n) => evidenceFor(unit, n))),
        ),
      );
      unit.metrics.push(
        makeMetric(unit, 'stories.states', null, [], {
          reason: 'Exhaustivité des états non déterminable statiquement',
        }),
      );
    }
    if (
      !unit.ownerComponentId &&
      unit.kind === 'production' &&
      /\.tsx$/.test(unit.relativePath) &&
      !unit.usedByComponentIds.length
    ) {
      report.coverage.unresolvedCandidateIds.push(unit.id);
      report.diagnostics.push({
        id: `${unit.id}:UNASSIGNED`,
        code: 'COMPONENT_UNASSIGNED',
        severity: 'warning',
        message:
          'Fichier TSX sans composant exporté attribuable ; vérifier componentGlobs ou les conventions',
        evidence: evidenceFor(unit, source),
      });
      unit.analysisStatus = 'partial';
    }
    unit.metrics.sort((a, b) => a.id.localeCompare(b.id, 'en'));
    unit.usedByComponentIds.sort();
  }
  // Une sélection ou un test partagé peut modifier l'appartenance après l'indexation du graphe.
  await notify({
    phase: 'Analyse des fichiers',
    completed: report.units.length,
    total: report.units.length,
  });
  for (const unit of report.units)
    for (const metric of unit.metrics) metric.scope = unit.ownerComponentId ? 'own' : 'shared';
  let aggregated = 0;
  for (const component of report.components) {
    await notify({
      phase: 'Agrégation des composants',
      completed: aggregated++,
      total: report.components.length,
    });
    const own = report.units.filter((u) => component.ownUnitIds.includes(u.id));
    component.metrics = aggregate(component.id, own, 'own');
    const shared = report.units.filter((u) => component.sharedUnitIds.includes(u.id));
    if (shared.length) component.metrics.push(...aggregate(component.id, shared, 'exposure'));
    component.diagnosticIds = report.diagnostics
      .filter(
        (d) =>
          d.evidence &&
          [...own, ...shared].some(
            (u) =>
              u.libraryId === d.evidence!.libraryId && u.relativePath === d.evidence!.relativePath,
          ),
      )
      .map((d) => d.id);
  }
  await notify({ phase: 'Agrégation des librairies' });
  for (const library of report.libraries)
    library.metrics = aggregate(
      library.id,
      report.units.filter((u) => u.libraryId === library.id),
      'own',
    );
  report.coverage.eligibleFiles = report.units.length;
  report.coverage.discoveredFiles = report.coverage.eligibleFiles + report.coverage.excludedFiles;
  report.coverage.analyzedFiles = report.units.filter(
    (u) => u.analysisStatus === 'complete',
  ).length;
  report.coverage.partialFiles = report.units.filter((u) => u.analysisStatus === 'partial').length;
  report.coverage.failedFiles = report.units.filter((u) => u.analysisStatus === 'failed').length;
  report.status =
    report.coverage.partialFiles || report.coverage.failedFiles ? 'partial' : 'complete';
  report.units.sort((a, b) => a.id.localeCompare(b.id, 'en'));
  report.components.sort((a, b) => a.id.localeCompare(b.id, 'en'));
  report.diagnostics.sort((a, b) => a.id.localeCompare(b.id, 'en'));
  await notify({ phase: 'Validation du rapport' });
  return validateReport(report);
}

async function nearestConfig(directory: string, root: string): Promise<string | undefined> {
  let current = directory;
  while (contains(root, current)) {
    const candidate = path.join(current, 'tsconfig.json');
    try {
      await access(candidate);
      return candidate;
    } catch {
      /* Poursuivre vers le parent sans écrire. */
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return undefined;
}
