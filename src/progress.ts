import { performance } from 'node:perf_hooks';

/** Avancement d'une phase dont le volume peut être inconnu. */
export interface ProgressUpdate {
  phase: string;
  completed?: number;
  total?: number;
}
/** Observateur indépendant des métriques et des rapports. */
export type ProgressObserver = (update: ProgressUpdate) => void;

/** Indicateur animé en terminal, avec estimation limitée à la phase courante. */
export class ProgressIndicator {
  private timer: ReturnType<typeof setInterval> | undefined;
  private state: ProgressUpdate = { phase: 'Préparation' };
  private phaseStarted: number;
  private readonly started: number;
  private frame = 0;
  private stopped = false;
  private lastPhase = '';

  /** Configure la sortie, sans écrire sur stdout.
   * @param write Sortie stderr injectable.
   * @param interactive Activer les retours de curseur.
   * @param enabled Activer l'indicateur.
   * @param now Horloge monotone injectable.
   * @param columns Largeur du terminal, pour éviter les retours à la ligne.
   */
  constructor(
    private readonly write: (text: string) => void,
    private readonly interactive: boolean,
    private readonly enabled = true,
    private readonly now: () => number = () => performance.now(),
    private readonly columns = 80,
  ) {
    this.started = this.phaseStarted = this.now();
  }

  /** Actualise la phase et les compteurs.
   * @param update Phase et volume connu.
   * @returns Aucun résultat.
   * @example indicator.update({ phase: 'Analyse', completed: 5, total: 10 })
   */
  update(update: ProgressUpdate): void {
    if (!this.enabled || this.stopped) return;
    const changed = update.phase !== this.lastPhase;
    if (changed) this.phaseStarted = this.now();
    this.state = update;
    this.lastPhase = update.phase;
    if (this.interactive) {
      if (!this.timer) {
        this.timer = setInterval(() => this.render(), 120);
        this.timer.unref();
      }
      this.render();
    } else if (changed) this.write(`[en cours] ${update.phase.replace(/\p{Cc}/gu, ' ')}\n`);
  }

  /** Arrête l'animation avant le résultat ou une erreur.
   * @returns Aucun résultat.
   * @example indicator.stop()
   */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    if (this.enabled && this.interactive && this.lastPhase) this.write('\r\u001b[2K');
  }

  private render(): void {
    const elapsed = Math.max(0, this.now() - this.started);
    const { phase, completed, total } = this.state;
    const determinate = total !== undefined && total > 0 && completed !== undefined;
    const done = determinate ? Math.max(0, Math.min(completed, total)) : 0;
    const phaseElapsed = Math.max(0, this.now() - this.phaseStarted);
    const remaining =
      determinate && done === total
        ? '0 s'
        : determinate && done >= 2 && phaseElapsed >= 500
          ? `~${duration((phaseElapsed / done) * (total - done))}`
          : 'en calcul';
    const count = determinate ? ` ${done}/${total} (${Math.floor((done / total) * 100)} %)` : '';
    const safePhase = phase.replace(/\p{Cc}/gu, ' ');
    const suffix = `${count} | écoulé ${duration(elapsed)} | reste ${remaining}`;
    const width = Math.max(1, Math.floor(this.columns) - 1);
    const phaseWidth = Math.max(0, width - suffix.length - 2);
    const title =
      safePhase.length <= phaseWidth
        ? safePhase
        : phaseWidth > 1
          ? safePhase.slice(0, phaseWidth - 1) + '…'
          : '';
    const line = `${['|', '/', '-', '\\'][this.frame++ % 4]} ${title}${suffix}`.slice(0, width);
    this.write(`\r\u001b[2K${line}`);
  }
}
function duration(milliseconds: number): string {
  const seconds = Math.ceil(milliseconds / 1000);
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}
