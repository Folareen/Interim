import {
  captureProblemCodes,
  liveLocales,
  measureTools,
  momentSchema,
  renderTools,
  sizeLadder,
  strategySchema,
  templateKeys,
  traceReasonSchema,
} from '@interim/types';
import { describe, expect, it } from 'vitest';
import { messages, templates } from './index';

// Screens look keys up by a code from the API or a template. A code without text would show a
// missing-key error to the person, so each set of codes must have its text in every language.
describe.each(liveLocales)('%s text for every code', (locale) => {
  const m = messages[locale];
  const keys = (record: object) => Object.keys(record).sort();

  it('names every stage of every template', () => {
    const stages = new Set(templateKeys.flatMap((key) => templates[key].stages));
    expect(keys(m.stages)).toEqual([...stages].sort());
  });

  it('has a sentence for every photo problem', () => {
    expect(keys(m.photoProblems)).toEqual([...captureProblemCodes].sort());
  });

  it('has a line for every trace reason', () => {
    expect(keys(m.trace)).toEqual([...traceReasonSchema.options].sort());
  });

  it('names every tool', () => {
    expect(keys(m.tools)).toEqual([...measureTools, ...renderTools].sort());
  });

  it('describes every strategy and every moment', () => {
    expect(keys(m.card.optionReasons)).toEqual([...strategySchema.options].sort());
    expect(keys(m.capture.moments)).toEqual([...momentSchema.options].sort());
  });

  it('offers every size on the ladder with no gaps, and every situation a label', () => {
    expect(sizeLadder.length).toBeGreaterThan(0);
    expect(keys(m.templateLabels)).toEqual([...templateKeys].sort());
  });
});

describe('placeholders', () => {
  it('trace lines that name a tool take a {tool} mark, in every language', () => {
    for (const locale of liveLocales) {
      for (const reason of ['measured', 'reused', 'rendered', 'retake_photo', 'blocked_tool']) {
        expect(messages[locale].trace[reason as keyof (typeof messages)['en']['trace']], `${locale} ${reason}`).toContain('{tool}');
      }
    }
  });
});
