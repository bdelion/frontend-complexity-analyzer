import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { type AnalysisReport, type Metric, validateReport } from './models.js';
import type { Format } from './configuration.js';
import { safeOutput, writeSafe } from './filesystem.js';

const disclaimer =
  'Signaux statiques : aucune conformité RGAA, efficacité de tests ou charge en jours ne peut être déduite de ces comptages. Les trois axes sont des profils de métriques, sans score numérique calibré.';

function display(metric: Metric): string {
  return metric.observation.value === null
    ? `indisponible (${metric.observation.reason})`
    : `${metric.observation.value} (${metric.observation.status})`;
}

/** Échappe les données affichées dans le document HTML autonome.
 * @param value Texte non fiable.
 * @returns Texte encodé.
 * @example escapeHtml('<Button>')
 */
export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );
}

function markdown(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('|', '\\|')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\n', ' ');
}
function csv(value: string): string {
  const protectedValue = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${protectedValue.replaceAll('"', '""')}"`;
}

/** Transforme le rapport canonique en une vue locale.
 * @param report Rapport validé.
 * @param format Format de destination.
 * @returns Contenu complet de l'artefact.
 * @example render(report, 'md')
 */
export function render(report: AnalysisReport, format: Format): string {
  if (format === 'json') return JSON.stringify(report, null, 2) + '\n';
  const subjects = [
    ...report.libraries.map((l) => ({ ...l, label: `Librairie ${l.id}` })),
    ...report.components.map((c) => ({ ...c, label: c.id })),
  ];
  if (format === 'csv') {
    const rows = [
      ['Subject', 'Metric', 'Scope', 'Value', 'Status', 'Reason', 'Unit', 'Algorithm', 'Evidence'],
      ...subjects.flatMap((s) =>
        s.metrics.map((m) => [
          s.id,
          m.id,
          m.scope,
          String(m.observation.value ?? ''),
          m.observation.status,
          m.observation.status === 'unavailable'
            ? m.observation.reason
            : m.observation.status === 'estimated'
              ? m.observation.rationale
              : '',
          m.unit,
          m.algorithmVersion,
          m.evidence.map((e) => `${e.relativePath}:${e.startLine}`).join(';'),
        ]),
      ),
    ];
    return '\uFEFF' + rows.map((row) => row.map(csv).join(',')).join('\r\n') + '\r\n';
  }
  if (format === 'md') {
    return (
      `# Frontend Complexity Analyzer\n\n${disclaimer}\n\nÉtat : **${report.status}**. Composants : ${report.components.length}. Fichiers analysés : ${report.coverage.analyzedFiles}/${report.coverage.eligibleFiles} ; partiels : ${report.coverage.partialFiles} ; échecs : ${report.coverage.failedFiles}.\n\n` +
      subjects
        .map(
          (s) =>
            `## ${markdown(s.label)}\n\n| Métrique | Portée | Valeur et statut | Preuves |\n|---|---|---|---|\n` +
            s.metrics
              .map(
                (m) =>
                  `| ${markdown(m.id)} | ${m.scope} | ${markdown(display(m))} | ${markdown(m.evidence.map((e) => `${e.relativePath}:${e.startLine}`).join(', '))} |`,
              )
              .join('\n'),
        )
        .join('\n\n') +
      '\n\n## Diagnostics\n\n' +
      (report.diagnostics
        .map(
          (d) =>
            `- **${markdown(d.code)}** : ${markdown(d.message)}${d.evidence ? ` (${markdown(d.evidence.relativePath)}:${d.evidence.startLine})` : ''}`,
        )
        .join('\n') || 'Aucun diagnostic.') +
      '\n'
    );
  }
  const tables = subjects
    .map(
      (s) =>
        `<section><h2>${escapeHtml(s.label)}</h2><table><thead><tr><th>Métrique</th><th>Portée</th><th>Valeur et statut</th><th>Preuves</th></tr></thead><tbody>${s.metrics.map((m) => `<tr><td>${escapeHtml(m.id)}</td><td>${m.scope}</td><td>${escapeHtml(display(m))}</td><td>${escapeHtml(m.evidence.map((e) => `${e.relativePath}:${e.startLine}`).join(', '))}</td></tr>`).join('')}</tbody></table></section>`,
    )
    .join('');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Frontend Complexity Analyzer</title><style>body{font:16px system-ui;margin:2rem auto;max-width:1200px;padding:0 1rem;color:#18263b;background:#f6f8fc}header,section{background:white;padding:1.5rem;margin:1rem 0;border:1px solid #dce3ec;border-radius:12px}table{width:100%;border-collapse:collapse;font-size:14px}td,th{text-align:left;padding:.5rem;border-bottom:1px solid #ddd;overflow-wrap:anywhere}p{line-height:1.6}nav a{margin-right:1rem;color:#2457a6}details{margin:1rem 0}</style></head><body><header><h1>Frontend Complexity Analyzer</h1><p>${disclaimer}</p><p>État : <strong>${report.status}</strong> · ${report.components.length} composants · ${report.coverage.analyzedFiles}/${report.coverage.eligibleFiles} fichiers complets · ${report.coverage.partialFiles} partiels · ${report.coverage.failedFiles} échecs.</p><p>Profils : complexité intrinsèque · signaux d'accessibilité · risque de maintenance.</p></header>${tables}<section><h2>Diagnostics</h2><ul>${report.diagnostics.map((d) => `<li><strong>${escapeHtml(d.code)}</strong> ${escapeHtml(d.message)}${d.evidence ? ` — ${escapeHtml(d.evidence.relativePath)}:${d.evidence.startLine}` : ''}</li>`).join('')}</ul></section></body></html>\n`;
}

/** Lit et valide un rapport avant toute comparaison ou restitution.
 * @param filename Rapport JSON existant.
 * @returns Rapport canonique.
 * @throws Si le JSON ou ses références sont invalides.
 * @example await readReport('reports/report.json')
 */
export async function readReport(filename: string): Promise<AnalysisReport> {
  return validateReport(JSON.parse(await readFile(filename, 'utf8')) as unknown);
}

/** Écrit toutes les vues après contrôle de l'ensemble des destinations.
 * @param report Rapport canonique.
 * @param output Répertoire de sortie.
 * @param formats Formats souhaités.
 * @param protectedFiles Autres entrées à préserver.
 * @returns Liste des fichiers écrits.
 * @throws Si une destination recouvre les entrées.
 * @example await writeReports(report, './reports', ['json','html'])
 */
export async function writeReports(
  report: AnalysisReport,
  output: string,
  formats: readonly Format[],
  protectedFiles: readonly string[] = [],
): Promise<string[]> {
  const roots = report.libraries.map((l) => l.root);
  await safeOutput(output, roots);
  const files = [...new Set(formats)].map((format) => ({
    format,
    file: path.join(output, format === 'html' ? 'index.html' : `report.${format}`),
  }));
  for (const { file } of files) await safeOutput(file, [...roots, ...protectedFiles]);
  for (const { file, format } of files)
    await writeSafe(file, render(report, format), [...roots, ...protectedFiles]);
  return files.map((f) => f.file);
}
