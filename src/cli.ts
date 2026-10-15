#!/usr/bin/env node
import { Command } from 'commander';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import {
  loadConfiguration,
  formats,
  configSchema,
  type ConfigOptions,
  type Format,
} from './configuration.js';
import { analyze, TOOL_VERSION } from './engine.js';
import { readReport, writeReports } from './reporting.js';
import { archiveReport, compareReports, listHistory } from './comparison.js';
import { writeSafe } from './filesystem.js';
import { reportSchema } from './models.js';
import { importCoverage } from './coverage.js';
import { sonarIssues } from './sonar.js';
import { setImmediate } from 'node:timers/promises';
import { ProgressIndicator } from './progress.js';

/** Flux injectables pour tester les codes de sortie sans lancer de sous-processus. */
export interface CliIO {
  out: (text: string) => void;
  err: (text: string) => void;
  /** Active l'animation pour un terminal interactif ; faux pour les sorties injectées. */
  interactive?: boolean;
  /** Largeur du terminal utilisée pour conserver l'indicateur sur une ligne. */
  columns?: number;
}

/** Exécute une commande sans modifier le processus appelant.
 * @param argv Arguments sans le chemin de Node ni celui du script.
 * @param io Sorties injectables, stdout/stderr par défaut.
 * @returns Code de sortie : 0 complet, 1 partiel, 2 erreur d'entrée ou fatale.
 * @example await runCli(['analyze','--root','./library'])
 */
export async function runCli(
  argv: string[],
  io: CliIO = {
    out: (text) => process.stdout.write(text),
    err: (text) => process.stderr.write(text),
    interactive: Boolean(process.stderr.isTTY),
    columns: process.stderr.columns ?? 80,
  },
): Promise<number> {
  const program = new Command();
  let exitCode = 0;
  let progress: ProgressIndicator | undefined;
  const output = (text: string): void => {
    progress?.stop();
    io.out(text);
  };
  program
    .name('analyzer')
    .description('Analyse statique React/TypeScript en lecture seule, sans score non calibré')
    .version(TOOL_VERSION);
  program.option('--no-progress', 'Masquer l’indicateur et les messages d’avancement');
  program.hook('preAction', async (_command, action) => {
    if (program.opts<{ progress: boolean }>().progress !== false) {
      progress = new ProgressIndicator(
        io.err,
        io.interactive ?? false,
        true,
        undefined,
        io.columns ?? 80,
      );
      const labels: Record<string, string> = {
        analyze: 'Lecture de la configuration',
        report: 'Génération des rapports',
        compare: 'Comparaison des rapports',
        sonar: 'Export Sonar',
        schema: 'Génération du schéma',
        'validate-config': 'Validation de la configuration',
        add: 'Archivage du rapport',
        list: 'Lecture de l’historique',
      };
      progress.update({ phase: labels[action.name()] ?? 'Préparation' });
      await setImmediate();
    }
  });
  program.hook('postAction', () => {
    progress?.stop();
  });
  program.exitOverride();
  program.configureOutput({ writeOut: output, writeErr: io.err });
  program
    .command('analyze')
    .description('Analyser des librairies sans exécuter leurs scripts')
    .option('-c, --config <file>', 'Configuration JSON')
    .option('-r, --root <directories...>', 'Racines des librairies')
    .option('-o, --output <directory>', 'Répertoire de sortie')
    .option('-f, --format <formats>', 'Formats séparés par virgule : json,md,csv,html')
    .option('--component <id>', 'Identifiant ou nom non ambigu')
    .option('--explain', 'Détails des diagnostics sur stderr')
    .option('--stdout', 'Rapport JSON sur stdout')
    .option('--history <directory>', 'Archiver aussi ce rapport')
    .option('--coverage <file>', 'Couverture existante avec empreintes SHA-256')
    .option('--stats', 'Temps et mémoire maximale du processus sur stderr')
    .action(
      async (
        options: ConfigOptions & {
          component?: string;
          explain?: boolean;
          stdout?: boolean;
          history?: string;
          coverage?: string;
          stats?: boolean;
        },
      ) => {
        const started = performance.now();
        const config = await loadConfiguration(options);
        let report = await analyze(
          config,
          options.component,
          progress ? (update) => progress!.update(update) : undefined,
        );
        if (options.coverage) {
          progress?.update({ phase: 'Import de la couverture' });
          report = await importCoverage(report, options.coverage);
        }
        progress?.update({ phase: 'Génération des rapports' });
        const files = await writeReports(
          report,
          config.outputDirectory,
          config.formats,
          [options.config, options.coverage].filter((f): f is string => Boolean(f)),
        );
        let archive: string | undefined;
        if (options.history) {
          progress?.update({ phase: 'Archivage du rapport' });
          archive = await archiveReport(report, options.history);
        }
        progress?.stop();
        if (archive) io.err(`Archive : ${archive}\n`);
        if (options.stdout) output(JSON.stringify(report, null, 2) + '\n');
        io.err(
          `${report.components.length} composants ; ${report.coverage.eligibleFiles} fichiers ; état ${report.status}.\n${files.join('\n')}\n`,
        );
        if (options.explain)
          for (const diagnostic of report.diagnostics)
            io.err(
              `${diagnostic.code} : ${diagnostic.message}${diagnostic.evidence ? ` (${diagnostic.evidence.relativePath}:${diagnostic.evidence.startLine})` : ''}\n`,
            );
        if (options.stats)
          io.err(
            JSON.stringify({
              durationMs: Math.round(performance.now() - started),
              maxRssBytes: process.resourceUsage().maxRSS * 1024,
            }) + '\n',
          );
        exitCode = report.status === 'partial' ? 1 : 0;
      },
    );
  program
    .command('validate-config')
    .description('Valider les paramètres et chemins sans analyser')
    .requiredOption('-c, --config <file>', 'Configuration JSON')
    .action(async (options: ConfigOptions) => {
      const config = await loadConfiguration(options);
      output(JSON.stringify(config, null, 2) + '\n');
    });
  program
    .command('report')
    .description('Régénérer les vues à partir d’un rapport JSON')
    .argument('<input>', 'Rapport JSON')
    .requiredOption('-o, --output <directory>', 'Répertoire de sortie')
    .option('-f, --format <formats>', 'Formats séparés par virgule', 'md,html,csv')
    .action(async (input: string, options: { output: string; format: string }) => {
      const requested = z.array(z.enum(formats)).min(1).parse(options.format.split(','));
      const report = await readReport(input);
      output(
        (await writeReports(report, options.output, requested as Format[], [input])).join('\n') +
          '\n',
      );
    });
  program
    .command('compare')
    .description('Comparer des rapports de périmètre et algorithmes compatibles')
    .argument('<baseline>')
    .argument('<current>')
    .option('-o, --output <file>', 'Écrire le résultat JSON dans ce fichier')
    .action(async (baseline: string, current: string, options: { output?: string }) => {
      const before = await readReport(baseline);
      const after = await readReport(current);
      const text = JSON.stringify(compareReports(before, after), null, 2) + '\n';
      if (options.output)
        await writeSafe(options.output, text, [
          baseline,
          current,
          ...before.libraries.map((l) => l.root),
          ...after.libraries.map((l) => l.root),
        ]);
      else output(text);
    });
  const history = program
    .command('history')
    .description('Archiver ou lister les rapports conservés');
  history
    .command('add')
    .argument('<input>')
    .requiredOption('-o, --output <directory>', 'Répertoire d’archives')
    .action(async (input: string, options: { output: string }) =>
      output((await archiveReport(await readReport(input), options.output)) + '\n'),
    );
  history
    .command('list')
    .argument('<directory>')
    .action(async (directory: string) =>
      output(JSON.stringify(await listHistory(directory), null, 2) + '\n'),
    );
  program
    .command('sonar')
    .description('Exporter les diagnostics au format Generic Issues, sans publication')
    .argument('<input>')
    .requiredOption('--project-base <directory>', 'sonar.projectBaseDir')
    .requiredOption('-o, --output <file>', 'Fichier JSON de sortie')
    .action(async (input: string, options: { projectBase: string; output: string }) => {
      const report = await readReport(input);
      await writeSafe(
        options.output,
        JSON.stringify(await sonarIssues(report, options.projectBase), null, 2) + '\n',
        [input, ...report.libraries.map((l) => l.root)],
      );
      output(`${options.output}\n`);
    });
  program
    .command('schema')
    .description('Afficher le JSON Schema de configuration ou de rapport')
    .argument('<kind>', 'config ou report')
    .action((kind: string) => {
      if (kind !== 'config' && kind !== 'report')
        throw new Error('Schéma attendu : config ou report');
      output(
        JSON.stringify(
          kind === 'config'
            ? z.toJSONSchema(configSchema, { io: 'input' })
            : z.toJSONSchema(reportSchema),
          null,
          2,
        ) + '\n',
      );
    });
  try {
    await program.parseAsync(argv, { from: 'user' });
    return exitCode;
  } catch (error) {
    progress?.stop();
    const commandError = error as { code?: string; message?: string };
    if (
      commandError.code === 'commander.helpDisplayed' ||
      commandError.code === 'commander.version'
    )
      return 0;
    if (!commandError.code?.startsWith('commander.'))
      io.err(`Erreur : ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  } finally {
    progress?.stop();
  }
}

function isMainModule(): boolean {
  try {
    return Boolean(
      process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href,
    );
  } catch {
    // Un argument d'un processus important l'API peut ne pas être un chemin existant.
    return false;
  }
}

if (isMainModule()) {
  process.exitCode = await runCli(process.argv.slice(2));
}
