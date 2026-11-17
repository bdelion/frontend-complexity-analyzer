import { z } from 'zod';

/** Localisation d'une preuve sans copie du code source. */
export const evidenceSchema = z
  .object({
    libraryId: z.string(),
    relativePath: z.string(),
    startLine: z.number().int().min(1),
    endLine: z.number().int().min(1),
    kind: z.enum(['ast', 'syntax', 'inventory', 'imported-report']),
  })
  .strict()
  .refine((e) => e.endLine >= e.startLine, 'Intervalle de lignes invalide');
/** Preuve localisée ou inventaire attestant une absence. */
export type Evidence = z.infer<typeof evidenceSchema>;

/** Diagnostic explicite d'erreur, d'ambiguïté ou de limite. */
export const diagnosticSchema = z
  .object({
    id: z.string(),
    code: z.string(),
    severity: z.enum(['info', 'warning', 'error']),
    message: z.string(),
    evidence: evidenceSchema.optional(),
  })
  .strict();
/** Diagnostic rattachable à plusieurs mesures. */
export type Diagnostic = z.infer<typeof diagnosticSchema>;

const observationSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('measured'), value: z.number().finite().nonnegative() }).strict(),
  z
    .object({
      status: z.literal('estimated'),
      value: z.number().finite().nonnegative(),
      rationale: z.string(),
    })
    .strict(),
  z.object({ status: z.literal('unavailable'), value: z.null(), reason: z.string() }).strict(),
]);

/** Mesure versionnée, avec statut et preuves. */
export const metricSchema = z
  .object({
    id: z.string(),
    algorithmVersion: z.string(),
    unit: z.enum(['count', 'lines', 'ratio', 'depth']),
    subjectId: z.string(),
    scope: z.enum(['own', 'shared', 'exposure']),
    observation: observationSchema,
    evidence: z.array(evidenceSchema),
    diagnosticIds: z.array(z.string()),
  })
  .strict()
  .superRefine((metric, ctx) => {
    if (
      metric.observation.value !== null &&
      metric.unit !== 'ratio' &&
      !Number.isInteger(metric.observation.value)
    ) {
      ctx.addIssue({ code: 'custom', message: 'Un comptage doit être entier' });
    }
    if (metric.observation.status !== 'unavailable' && metric.evidence.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Une mesure disponible exige une preuve' });
    }
  });
/** Valeur brute ; une absence ne devient jamais zéro. */
export type Metric = z.infer<typeof metricSchema>;

/** Observation détaillée d'un rôle, attribut, touche ou appel. */
export const detailSchema = z
  .object({
    metricId: z.string(),
    value: z.string(),
    evidence: evidenceSchema,
  })
  .strict();
/** Détail conservé en complément d'un comptage. */
export type Detail = z.infer<typeof detailSchema>;

/** Schéma d'une unité source unique et de ses observations. */
export const unitSchema = z
  .object({
    id: z.string(),
    libraryId: z.string(),
    relativePath: z.string(),
    kind: z.enum(['production', 'test', 'story']),
    ownerComponentId: z.string().nullable(),
    usedByComponentIds: z.array(z.string()),
    dependencies: z.array(z.string()),
    externalDependencies: z.array(z.string()),
    typeDependencies: z.array(z.string()),
    metrics: z.array(metricSchema),
    details: z.array(detailSchema),
    analysisStatus: z.enum(['complete', 'partial', 'failed']),
  })
  .strict();
/** Unité source unique, même lorsqu'elle est partagée. */
export type SourceUnit = z.infer<typeof unitSchema>;

/** Schéma du composant-répertoire et de ses profils. */
export const componentSchema = z
  .object({
    id: z.string(),
    libraryId: z.string(),
    relativeDirectory: z.string(),
    displayName: z.string(),
    exportSymbolIds: z.array(z.string()),
    ownUnitIds: z.array(z.string()),
    sharedUnitIds: z.array(z.string()),
    metrics: z.array(metricSchema),
    diagnosticIds: z.array(z.string()),
  })
  .strict();
/** Composant-répertoire, ses exports et ses dépendances partagées. */
export type ComponentReport = z.infer<typeof componentSchema>;

/** Contrat canonique du rapport JSON. */
export const reportSchema = z
  .object({
    schemaVersion: z.literal('1.0.0'),
    toolVersion: z.string(),
    runId: z.string().uuid(),
    generatedAt: z.iso.datetime(),
    status: z.enum(['complete', 'partial']),
    configurationFingerprint: z.string(),
    algorithmVersions: z.record(z.string(), z.string()),
    libraries: z.array(
      z.object({ id: z.string(), root: z.string(), metrics: z.array(metricSchema) }).strict(),
    ),
    units: z.array(unitSchema),
    components: z.array(componentSchema),
    coverage: z
      .object({
        discoveredFiles: z.number().int().nonnegative(),
        excludedFiles: z.number().int().nonnegative(),
        eligibleFiles: z.number().int().nonnegative(),
        analyzedFiles: z.number().int().nonnegative(),
        partialFiles: z.number().int().nonnegative(),
        failedFiles: z.number().int().nonnegative(),
        unresolvedCandidateIds: z.array(z.string()),
      })
      .strict(),
    diagnostics: z.array(diagnosticSchema),
    profiles: z
      .object({
        intrinsic: z.array(z.string()),
        accessibility: z.array(z.string()),
        maintenance: z.array(z.string()),
      })
      .strict(),
  })
  .strict();
/** Rapport complet ou partiel, sans score numérique non calibré. */
export type AnalysisReport = z.infer<typeof reportSchema>;

/** Vérifie les références et invariants en complément du schéma structurel.
 * @param input Données JSON non fiables.
 * @returns Rapport validé.
 * @throws Si le rapport est incohérent.
 * @example validateReport(JSON.parse(json))
 */
export function validateReport(input: unknown): AnalysisReport {
  const report = reportSchema.parse(input);
  const unique = (values: string[], label: string) => {
    if (new Set(values).size !== values.length)
      throw new Error(`Identifiants dupliqués : ${label}`);
  };
  unique(
    report.units.map((u) => u.id),
    'unités',
  );
  unique(
    report.components.map((c) => c.id),
    'composants',
  );
  unique(
    report.libraries.map((l) => l.id),
    'librairies',
  );
  unique(
    report.diagnostics.map((d) => d.id),
    'diagnostics',
  );
  const units = new Set(report.units.map((u) => u.id));
  const components = new Set(report.components.map((c) => c.id));
  const libraries = new Set(report.libraries.map((l) => l.id));
  const diagnostics = new Set(report.diagnostics.map((d) => d.id));
  const unitsById = new Map(report.units.map((unit) => [unit.id, unit]));
  const componentsById = new Map(report.components.map((component) => [component.id, component]));
  const requireIds = (ids: string[], allowed: Set<string>) => {
    if (ids.some((id) => !allowed.has(id))) throw new Error('Référence inconnue dans le rapport');
  };
  const validateEvidenceLibrary = (evidence: Evidence) =>
    requireIds([evidence.libraryId], libraries);
  for (const unit of report.units) {
    requireIds([unit.libraryId], libraries);
    requireIds(unit.dependencies, units);
    requireIds(unit.usedByComponentIds, components);
    if (unit.ownerComponentId !== null) requireIds([unit.ownerComponentId], components);
    unique(unit.usedByComponentIds, 'appartenances de composants');
    requireIds(unit.typeDependencies, new Set(unit.dependencies));
    for (const componentId of unit.usedByComponentIds) {
      const component = componentsById.get(componentId)!;
      if (!component.ownUnitIds.includes(unit.id) && !component.sharedUnitIds.includes(unit.id)) {
        throw new Error('Appartenance de composant incohérente');
      }
    }
    for (const detail of unit.details) validateEvidenceLibrary(detail.evidence);
  }
  for (const diagnostic of report.diagnostics) {
    if (diagnostic.evidence) validateEvidenceLibrary(diagnostic.evidence);
  }
  for (const component of report.components) {
    requireIds([component.libraryId], libraries);
    requireIds([...component.ownUnitIds, ...component.sharedUnitIds], units);
    requireIds(component.diagnosticIds, diagnostics);
    unique(component.ownUnitIds, 'unités propres');
    unique(component.sharedUnitIds, 'unités partagées');
    const ownUnitIds = new Set(component.ownUnitIds);
    if (component.sharedUnitIds.some((id) => ownUnitIds.has(id)))
      throw new Error('Une unité ne peut pas être propre et partagée');
    for (const unitId of component.ownUnitIds) {
      const unit = unitsById.get(unitId)!;
      if (unit.libraryId !== component.libraryId || unit.ownerComponentId !== component.id) {
        throw new Error('Propriétaire ou librairie de l’unité propre incohérent');
      }
      if (!unit.usedByComponentIds.includes(component.id))
        throw new Error('Référence inverse d’unité propre manquante');
    }
    for (const unitId of component.sharedUnitIds) {
      const unit = unitsById.get(unitId)!;
      if (
        unit.ownerComponentId === component.id ||
        !unit.usedByComponentIds.includes(component.id)
      ) {
        throw new Error('Référence d’unité partagée incohérente');
      }
    }
  }
  for (const unit of report.units) {
    if (
      unit.ownerComponentId !== null &&
      !componentsById.get(unit.ownerComponentId)!.ownUnitIds.includes(unit.id)
    ) {
      throw new Error('Unité absente de la liste de son propriétaire');
    }
  }
  for (const subject of [...report.units, ...report.components, ...report.libraries]) {
    unique(
      subject.metrics.map((m) => `${m.id}:${m.scope}:${m.algorithmVersion}`),
      'métriques',
    );
    for (const metric of subject.metrics) {
      if (metric.subjectId !== subject.id) throw new Error('Sujet de métrique incohérent');
      requireIds(metric.diagnosticIds, diagnostics);
      for (const evidence of metric.evidence) validateEvidenceLibrary(evidence);
    }
  }
  const c = report.coverage;
  if (
    c.eligibleFiles !== c.analyzedFiles + c.partialFiles + c.failedFiles ||
    c.discoveredFiles !== c.eligibleFiles + c.excludedFiles
  ) {
    throw new Error('Couverture d’analyse incohérente');
  }
  requireIds(c.unresolvedCandidateIds, units);
  if (report.status !== (c.partialFiles || c.failedFiles ? 'partial' : 'complete')) {
    throw new Error('Statut du rapport incohérent avec sa couverture');
  }
  return report;
}
