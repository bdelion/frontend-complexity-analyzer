import { afterEach, expect, test, vi } from 'vitest';
import { ProgressIndicator } from '../src/progress.js';

afterEach(() => {
  vi.useRealTimers();
});

test('anime, affiche les compteurs et estime seulement la phase mesurable', () => {
  vi.useFakeTimers();
  let now = 0;
  let text = '';
  const indicator = new ProgressIndicator(
    (t) => {
      text += t;
    },
    true,
    true,
    () => now,
  );
  indicator.update({ phase: 'Analyse', completed: 0, total: 10 });
  expect(text).toContain('en calcul');
  now = 1000;
  indicator.update({ phase: 'Analyse', completed: 2, total: 10 });
  expect(text).toContain('2/10 (20 %)');
  expect(text).toContain('reste ~4 s');
  const before = text;
  vi.advanceTimersByTime(120);
  expect(text.length).toBeGreaterThan(before.length);
  indicator.update({ phase: 'Rapports' });
  expect(text.slice(before.length)).toContain('en calcul');
  indicator.stop();
  expect(vi.getTimerCount()).toBe(0);
  const stopped = text;
  indicator.stop();
  indicator.update({ phase: 'Ignorée' });
  vi.advanceTimersByTime(1000);
  expect(text).toBe(stopped);
});

test('phases inconnues, durées longues et compteurs bornés', () => {
  vi.useFakeTimers();
  let now = 0;
  let text = '';
  const indicator = new ProgressIndicator(
    (t) => {
      text += t;
    },
    true,
    true,
    () => now,
  );
  indicator.update({ phase: 'Découverte\n\u001btest', total: 0 });
  expect(text).not.toContain('Découverte\n');
  now = 120000;
  indicator.update({ phase: 'Découverte\n\u001btest', completed: 2, total: 4 });
  expect(text).toContain('écoulé 2 min 0 s');
  expect(text).toContain('~2 min 0 s');
  indicator.update({ phase: 'Découverte\n\u001btest', completed: 7, total: 4 });
  expect(text).toContain('4/4 (100 %)');
  expect(text).toContain('reste 0 s');
  indicator.stop();
});

test('CI sans séquences de contrôle, silence complet sur demande', () => {
  let text = '';
  const indicator = new ProgressIndicator((t) => {
    text += t;
  }, false);
  indicator.update({ phase: 'Analyse', completed: 0, total: 10 });
  indicator.update({ phase: 'Analyse', completed: 1, total: 10 });
  indicator.update({ phase: 'Rapports' });
  indicator.stop();
  expect(text).toBe('[en cours] Analyse\n[en cours] Rapports\n');
  const disabled = new ProgressIndicator(
    (t) => {
      text += t;
    },
    true,
    false,
  );
  const before = text;
  disabled.update({ phase: 'Silence' });
  disabled.stop();
  expect(text).toBe(before);
});

test('conserve une ligne dans les terminaux étroits et masque les titres trop longs', () => {
  const lines: string[] = [];
  const indicator = new ProgressIndicator(
    (t) => {
      lines.push(t);
    },
    true,
    true,
    () => 1000,
    40,
  );
  try {
    indicator.update({
      phase: 'Une très longue description de phase qui déborde le terminal',
      completed: 0,
      total: 100,
    });
    expect(lines.at(-1)!.replace('\r\u001b[2K', '').length).toBeLessThanOrEqual(39);
    expect(lines.at(-1)).not.toContain('description de phase qui');
  } finally {
    indicator.stop();
  }
});
