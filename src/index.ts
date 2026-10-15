/** API publique de l'analyseur ; aucune importation n'exécute les sources inspectées. */
export { analyze, TOOL_VERSION } from './engine.js';
export { loadConfiguration, configSchema, formats, fingerprint } from './configuration.js';
export type { Configuration, ConfigOptions, Format } from './configuration.js';
export {
  reportSchema,
  validateReport,
  evidenceSchema,
  diagnosticSchema,
  metricSchema,
  detailSchema,
  unitSchema,
  componentSchema,
} from './models.js';
export type {
  AnalysisReport,
  ComponentReport,
  SourceUnit,
  Metric,
  Evidence,
  Diagnostic,
  Detail,
} from './models.js';
export { render, readReport, writeReports } from './reporting.js';
export { compareReports, archiveReport, listHistory } from './comparison.js';
export type { Comparison, MetricDelta } from './comparison.js';
export { runCli } from './cli.js';
export type { CliIO } from './cli.js';
export { importCoverage, coverageSchema } from './coverage.js';
export { sonarIssues } from './sonar.js';
export type { ProgressObserver, ProgressUpdate } from './progress.js';
