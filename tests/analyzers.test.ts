import { describe, expect, test } from 'vitest';
import { fragment } from './helpers.js';
import { componentExports, importedReference } from '../src/ast.js';
import { SyntaxKind } from 'ts-morph';

describe('complexité versionnée et LOC', () => {
  test('sépare fonctions imbriquées, cases, branches et boucles', () => {
    const f = fragment(`// commentaire seul
export function branch(a: boolean, b: boolean) { if(a && b) return a ? 1 : 2; }
function cases(x: number) { switch(x) { case 1: break; case 2: break; default: break; } }
function parent() { function child() { if (true) return 1; } return child(); }
function loops() { for(;;) break; while(false) {} do {} while(false); for(const a of []) {} for(const b in {}) {} }
function catches() { try { return true || false; } catch {} }
class A { method(){ if(true){} } get x(){return 1} set x(v:number){} constructor(){} }
`);
    const distribution = f.unit.details
      .filter((d) => d.metricId === 'code.cc.distribution')
      .map((d) => Number(d.value));
    expect(distribution.slice(0, 6)).toEqual([4, 3, 1, 2, 1, 3]);
    expect(f.value('code.cc.max')).toBe(4);
    expect(f.value('code.loops')).toBe(5);
    expect(f.value('code.loc')).toBe(6);
    expect(f.unit.metrics.find((m) => m.id === 'code.cc.sum')?.algorithmVersion).toBe(
      'cc-v4-proposal-1',
    );
  });
  test('absence de fonction et commentaires', () => {
    const f = fragment('/** texte */\n\nexport const x = 1; // commentaire\n');
    expect(f.value('code.cc.max')).toBeNull();
    expect(f.value('code.loc')).toBe(1);
    expect(fragment('// rien\n').value('code.loc')).toBe(0);
  });
});

describe('React et API', () => {
  test('résout alias et namespace et exclut les homonymes locaux', () => {
    const f = fragment(`import React, {useState as state, memo as wrap} from 'react';
import * as R from 'react';
function useState() {} function useOwn() {}
export const Button = wrap((p: { value:string; onChange?:()=>void }) => { state(0); React.useEffect(()=>{}); R.useRef(null); useState(); useOwn(); return <button/>; });`);
    expect(f.value('react.useState')).toBe(1);
    expect(f.value('react.useEffect')).toBe(1);
    expect(f.value('react.useRef')).toBe(1);
    expect(f.value('react.memo')).toBe(1);
    expect(f.value('api.props')).toBe(2);
    expect(f.value('api.required')).toBe(1);
    expect(f.value('api.callbacks')).toBe(1);
    expect(f.value('react.customHookCalls')).toBe(2);
    const calls = f.source.getDescendantsOfKind(SyntaxKind.CallExpression);
    expect(
      importedReference(
        calls.find((c) => c.getExpression().getText() === 'useOwn')!.getExpression(),
      ),
    ).toBeUndefined();
  });
  test('union de props, génériques et objets imbriqués', () => {
    const f =
      fragment(`type P = { kind:'a'; a:string; config?: { sub:{ value:number } } } | { kind:'b'; b:number; callback:()=>void };
export function Button<T>(p: P) { return <button/> }`);
    expect(f.value('api.props')).toBe(5);
    expect(f.value('api.required')).toBe(1);
    expect(f.value('api.callbacks')).toBe(1);
    expect(f.value('api.configDepth')).toBe(2);
    expect(f.value('api.generics')).toBe(1);
  });
  test('types récursifs et any restent indisponibles', () => {
    expect(
      fragment(`interface P { next:P } export const Button=(p:P)=><button/>`).value(
        'api.configDepth',
      ),
    ).toBeNull();
    const f = fragment('export const Button=(p:any)=><button/>');
    expect(f.value('api.props')).toBeNull();
    expect(f.diagnostics[0]?.code).toBe('API_UNRESOLVED');
    const uncertain = fragment('export const Button=(p:{onChange:unknown})=><button/>');
    expect(uncertain.value('api.props')).toBe(1);
    expect(uncertain.value('api.callbacks')).toBeNull();
  });
  test('tableaux, types primitifs et propriétés optionnelles', () => {
    const f = fragment('export const Button=(p:{data:{a:number}[]; flag?:boolean})=><button/>');
    expect(f.value('api.configDepth')).toBe(1);
    expect(f.value('api.required')).toBe(1);
  });
  test('composants default, forwardRef et rendu nul', () => {
    expect(
      componentExports(fragment('export default function Button(){return null}').source).map(
        (e) => e.name,
      ),
    ).toEqual(['Button']);
    expect(
      componentExports(
        fragment(
          "import {forwardRef} from 'react'; export const Button=forwardRef((p:{x:number})=> <button/>);",
        ).source,
      ),
    ).toHaveLength(1);
    expect(
      componentExports(
        fragment(
          'export const Button = () => null; export const Utils=3; export function helper(){return 1}',
        ).source,
      ),
    ).toHaveLength(1);
  });
  test('TSDoc est compté sur exports locaux', () => {
    const f = fragment(
      '/** A */\nexport function A(){return null}\n/** B */\nexport const B=()=>null;',
    );
    expect(f.value('docs.documentedExports')).toBe(2);
    expect(f.value('docs.publicDocumented')).toBe(1);
    const extended = fragment(
      'export interface Props { onPress():void } export const Button=(p:Props)=><button/>',
    );
    expect(extended.value('api.interfaces')).toBe(1);
    expect(extended.value('api.events')).toBe(1);
  });
});

describe('signaux ARIA et clavier', () => {
  test('conserve les observations et ignore les chaînes arbitraires', () => {
    const f = fragment(
      `export function Button(){const text='Escape'; const e={key:'x'}; if(e.key===' '){}; switch(e.key){case 'Spacebar':break}; const x={focus(){}}; x.focus(); x.blur?.(); return <button role="button" aria-label="x" aria-controls="id" aria-live="polite" tabIndex={0} onKeyUp={()=>{}}/>}`,
    );
    expect(f.value('a11y.ariaOccurrences')).toBe(3);
    expect(f.value('a11y.roles')).toBe(1);
    expect(f.value('a11y.relations')).toBe(1);
    expect(f.value('a11y.live')).toBe(1);
    expect(f.value('keyboard.keys')).toBe(1);
    expect(f.value('keyboard.keyOccurrences')).toBe(2);
    expect(f.value('keyboard.handlers')).toBe(1);
    expect(
      f.unit.details.filter((d) => d.metricId === 'keyboard.keys').map((d) => d.value),
    ).toEqual(['Space', 'Space']);
    expect(f.unit.metrics.find((m) => m.id === 'a11y.focusCalls')?.observation.status).toBe(
      'estimated',
    );
  });
  test('spreads et rôles dynamiques signalent une analyse partielle', () => {
    const f = fragment(
      'export const Button=(p:{role:string})=><button {...p} role={p.role} aria-label="x"/>',
    );
    expect(f.diagnostics.map((d) => d.code)).toContain('JSX_SPREAD');
    expect(f.diagnostics.map((d) => d.code)).toContain('DYNAMIC_A11Y');
    expect(f.unit.metrics.find((m) => m.id === 'a11y.ariaOccurrences')?.observation.status).toBe(
      'estimated',
    );
  });
});

describe('tests statiques', () => {
  test('Jest/Vitest : each, skip, todo, only et assertions', () => {
    const f = fragment(
      `import {test as check, describe, expect} from 'vitest';
describe('suite',()=>{ check('a',()=>{expect(1).toBe(1); expect({}).toMatchSnapshot()}); check.skip('b',()=>{}); check.todo('c'); check.only('d',()=>{}); check.each([1,2])('e',()=>{}); });`,
      'test',
    );
    expect(f.value('tests.declarations')).toBe(3);
    expect(f.value('tests.disabled')).toBe(2);
    expect(f.value('tests.focused')).toBe(1);
    expect(f.value('tests.assertions')).toBe(2);
    expect(f.value('tests.snapshots')).toBe(1);
    expect(f.value('tests.suites')).toBe(1);
    expect(f.value('coverage.executed')).toBeNull();
  });
  test('Playwright : actions, clavier et assertions', () => {
    const f = fragment(
      `import {test,expect} from '@playwright/test';
test('x',async({page})=>{await page.click('b'); await page.fill('b','x'); await page.keyboard.press('Tab'); await expect(page).toBeFocused(); await expect(page).toMatchAriaSnapshot('x'); test.step('s',()=>{});});`,
      'test',
    );
    expect(f.value('tests.declarations')).toBe(1);
    expect(f.value('playwright.actions')).toBe(2);
    expect(f.value('playwright.keyboard')).toBe(1);
    expect(f.value('playwright.focusAssertions')).toBe(1);
    expect(f.value('playwright.accessibilityAssertions')).toBe(1);
  });
  test('framework global ambigu et homonymes locaux', () => {
    const ambiguous = fragment(`test('x',()=>{});`, 'test');
    expect(ambiguous.diagnostics[0]?.code).toBe('TEST_FRAMEWORK_AMBIGUOUS');
    expect(
      ambiguous.unit.metrics.find((m) => m.id === 'tests.declarations')?.observation.status,
    ).toBe('estimated');
    expect(
      fragment(`function test(a:string,b:()=>void){}; test('x',()=>{});`, 'test').value(
        'tests.declarations',
      ),
    ).toBe(0);
    expect(fragment(`it('x',()=>{});`, 'test', 'jest').diagnostics).toEqual([]);
  });
  test('suites ignorées et annotations Playwright ne gonflent pas les tests actifs', () => {
    const f = fragment(
      `import {test,describe} from 'vitest'; describe.skip('suite',()=>{test('x',()=>{});});`,
      'test',
    );
    expect(f.value('tests.declarations')).toBe(0);
    expect(f.value('tests.disabled')).toBe(1);
    const p = fragment(
      `import {test} from '@playwright/test'; test('x',()=>{test.skip(true,'raison');});`,
      'test',
    );
    expect(p.value('tests.declarations')).toBe(1);
    expect(p.value('tests.disabled')).toBe(0);
  });
  test('namespace Playwright : describe reste une suite et les annotations restent distinctes', () => {
    const f = fragment(
      `import * as pw from '@playwright/test'; pw.test.describe('suite',()=>{pw.test('x',()=>{pw.test.slow();pw.test.fail(true,'raison');pw.expect(1).toBe(1)});pw.test.describe.configure({mode:'parallel'});pw.test.skip('ignoré',()=>{});});`,
      'test',
    );
    expect(f.value('tests.declarations')).toBe(1);
    expect(f.value('tests.suites')).toBe(1);
    expect(f.value('tests.disabled')).toBe(1);
    expect(f.value('tests.assertions')).toBe(1);
    const aliased = fragment(
      `import {describe as suite,test} from 'vitest';suite.skip('x',()=>{test('y',()=>{});});`,
      'test',
    );
    expect(aliased.value('tests.declarations')).toBe(0);
    expect(aliased.value('tests.disabled')).toBe(1);
    const tagged = fragment(
      "import {test} from 'vitest'; test.each`a | b\\n${1} | ${2}`('cas',()=>{});",
      'test',
    );
    expect(tagged.value('tests.declarations')).toBe(1);
  });
});
