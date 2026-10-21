import type { Locale, Retention, TemplateKey, Tone } from '@interim/types';

/** Text of the app's screens, for one language. `{name}` marks a value that `fillCopy` inserts. */
export interface UiCopy {
  common: {
    appName: string;
    back: string;
    continue: string;
    tryAgain: string;
    stepOf: string;
    themeToggle: string;
    skipToContent: string;
    genericError: string;
    networkError: string;
    notFoundTitle: string;
    notFoundBody: string;
    startAgain: string;
  };
  welcome: { title: string; intro: string; reassurance: string; start: string; footnote: string };
  language: { title: string; intro: string; moreComing: string; submit: string };
  situation: {
    title: string;
    intro: string;
    groupIllness: string;
    groupOther: string;
    blurbs: Record<TemplateKey, string>;
    submit: string;
  };
  setup: {
    title: string;
    intro: string;
    toneTitle: string;
    tones: Record<Tone, { label: string; description: string }>;
    hairTitle: string;
    headCoveringLabel: string;
    headCoveringHelp: string;
    ageTitle: string;
    ageLabel: string;
    ageHelp: string;
    submit: string;
    submitting: string;
  };
  consent: {
    title: string;
    intro: string;
    keepTitle: string;
    keepBody: string;
    helpersTitle: string;
    helperYoucam: string;
    helperGoogle: string;
    retentionTitle: string;
    retention: Record<Retention, { label: string; description: string }>;
    confirmTitle: string;
    confirmStore: string;
    confirmYoucam: string;
    confirmGoogle: string;
    confirmOwn: string;
    noRecovery: string;
    deleteAnytime: string;
    incomplete: string;
    submit: string;
    submitting: string;
    outdated: string;
  };
  ready: {
    title: string;
    intro: string;
    summaryTitle: string;
    situationLabel: string;
    toneLabel: string;
    photosLabel: string;
    next: string;
    deleteTitle: string;
    deleteBody: string;
    deleteAction: string;
    deleteConfirm: string;
    deleteCancel: string;
    deleting: string;
  };
}

/** Each language's name in that language, so a person can find theirs. */
export const localeNames: Record<Locale, string> = {
  en: 'English',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
  pt: 'Português',
  sw: 'Kiswahili',
  ha: 'Hausa',
  yo: 'Yorùbá',
  ig: 'Igbo',
  pcm: 'Naijá',
};

/**
 * Puts values into a copy string at its `{name}` marks, so a number or name never gets joined to a
 * sentence and each language can place it where its word order needs.
 * @example fillCopy('Step {current} of {total}', { current: 2, total: 5 }) // 'Step 2 of 5'
 * @throws Error when the string names a value that was not given.
 */
export function fillCopy(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_mark, name: string) => {
    const value = values[name];
    if (value === undefined) throw new Error(`Copy asks for {${name}} but it was not given`);
    return String(value);
  });
}
