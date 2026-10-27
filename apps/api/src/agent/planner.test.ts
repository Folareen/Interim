import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { messages } from '@interim/templates';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type GenerateText, Planner, type PlannerConfig, plannerFixtureName } from './planner';
import { type PlannerInput, plannerPrompt } from './prompts/planner.v2';

const input: PlannerInput = {
  templateKey: 'hair_loss_ahead',
  stage: 'thinning',
  previousStage: 'full',
  facts: [
    { ref: 'm1', about: 'hair density', term: 'medium density', direction: 'lower' },
    { ref: 'r1', about: 'what the person reported', term: 'some change', direction: null },
  ],
  moment: 'back_to_work',
  tone: 'warm',
  locale: 'en',
  strategies: ['volume', 'cut', 'colour'],
};
const good = { strategy: 'cut', citation: 'm1', note: 'Your hair looks {m:m1} today. That is common at this stage. Try a soft part for your first day.' };

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'planner-'));
});
afterAll(async () => rm(dir, { recursive: true, force: true }));

const build = (config: Partial<PlannerConfig>, answers: string[] = []) => {
  const generate = vi.fn<GenerateText>(() => Promise.resolve(answers.shift() ?? ''));
  return { planner: new Planner({ mode: 'live', fixturesDir: dir, canCallModel: true, ...config }, generate), generate };
};

describe('replay', () => {
  it('serves a recorded plan and never calls the model', async () => {
    await writeFile(path.join(dir, plannerFixtureName(input)), JSON.stringify(good));
    const { planner, generate } = build({ mode: 'replay' });

    expect(await planner.plan(input)).toEqual({ ...good, source: 'fixture' });
    expect(generate).not.toHaveBeenCalled();
  });

  it('falls back to the fixed text for the tone when nothing was recorded', async () => {
    const other = { ...input, stage: 'short' };
    const { planner, generate } = build({ mode: 'replay' });

    expect(await planner.plan(other)).toEqual({
      strategy: 'volume',
      citation: 'm1',
      note: messages.en.companionFallback.warm,
      source: 'fallback',
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it('refuses a recording that now fails the checks', async () => {
    const stale = { ...input, stage: 'none' };
    await writeFile(path.join(dir, plannerFixtureName(stale)), JSON.stringify({ ...good, note: 'About 3 weeks in.' }));
    const { planner } = build({ mode: 'replay' });
    expect((await planner.plan(stale)).source).toBe('fallback');
  });
});

describe('live', () => {
  it('accepts a good answer, including inside a code fence', async () => {
    const { planner } = build({}, ['```json\n' + JSON.stringify(good) + '\n```']);
    expect(await planner.plan(input)).toEqual({ ...good, source: 'model' });
  });

  it('asks once more when the first answer breaks a rule, then uses it', async () => {
    const { planner, generate } = build({}, [JSON.stringify({ ...good, note: 'You have 3 options.' }), JSON.stringify(good)]);
    expect((await planner.plan(input)).source).toBe('model');
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('uses the fixed text after two bad answers (acceptance 14)', async () => {
    const bad = [
      JSON.stringify({ ...good, note: 'Try {m:m9} today.' }), // unknown placeholder
      JSON.stringify({ ...good, strategy: 'hold' }), // a strategy eligibility did not allow
    ];
    const { planner, generate } = build({}, bad);
    expect((await planner.plan(input)).source).toBe('fallback');
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('rejects a citation that is not one of the facts, a number word and a banned word', async () => {
    for (const answer of [
      { ...good, citation: 'm7' },
      { ...good, note: 'About three weeks in.' },
      { ...good, note: 'This is a treatment option.' },
    ]) {
      const { planner } = build({}, [JSON.stringify(answer), JSON.stringify(answer)]);
      expect((await planner.plan(input)).source, JSON.stringify(answer)).toBe('fallback');
    }
  });

  it('treats text that is not JSON as no answer', async () => {
    const { planner } = build({}, ['Sure! Here is a plan.', 'Another plan']);
    expect((await planner.plan(input)).source).toBe('fallback');
  });

  it('uses the fixed text when the model call itself fails, without retrying', async () => {
    const { planner, generate } = build({});
    generate.mockRejectedValue(new Error('model is retired'));
    expect((await planner.plan(input)).source).toBe('fallback');
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('does not call the model when live calls are not allowed', async () => {
    const { planner, generate } = build({ canCallModel: false });
    expect((await planner.plan(input)).source).toBe('fallback');
    expect(generate).not.toHaveBeenCalled();
  });

  it('records an accepted plan so replay can serve it', async () => {
    const fresh = { ...input, moment: 'date' as const };
    const { planner } = build({ mode: 'record' }, [JSON.stringify(good)]);
    await planner.plan(fresh);
    expect(JSON.parse(await readFile(path.join(dir, plannerFixtureName(fresh)), 'utf8'))).toEqual(good);
  });
});

describe('plannerPrompt', () => {
  const prompt = plannerPrompt(input);

  it('lists the banned words from the rules package', () => {
    expect(prompt).toContain('treatment');
    expect(prompt).toContain('regrow');
  });

  it('carries only what the planner may see', () => {
    expect(prompt).toContain('hair_loss_ahead');
    expect(prompt).toContain('back_to_work');
    expect(prompt).not.toMatch(/head.?covering|words.?set|reflection|photo/i);
    // The refs (m1, r1) name facts; apart from them no figure reaches the model.
    expect(prompt.split('Facts:')[1]?.replace(/\b[mr]\d+\b/g, '')).not.toMatch(/\d/);
  });
});
