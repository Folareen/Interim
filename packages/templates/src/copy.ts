import type { LiveLocale, Moment } from '@interim/types';
import en from './messages/en.json';
import es from './messages/es.json';
import fr from './messages/fr.json';
import ha from './messages/ha.json';
import ig from './messages/ig.json';
import it from './messages/it.json';
import pcm from './messages/pcm.json';
import pt from './messages/pt.json';
import sw from './messages/sw.json';
import yo from './messages/yo.json';

/**
 * Every fixed user facing string for one language, as `next-intl` reads it: the app's screens, the
 * situation names, the companion's fallback notes and the lines for what to say. English is the
 * reference and each other file must translate all of it (docs/frontend/README.md). `{name}` marks
 * a value filled in at run time. The lines for what to say are lists, so the JSON's empty list is
 * widened here.
 */
export type Messages = Omit<typeof en, 'whatToSay'> & { whatToSay: Record<Moment, string[]> };

/** The messages by language. Adding a live locale fails the build until its file is imported here. */
export const messages: Record<LiveLocale, Messages> = { en, fr, es, it, pt, sw, ha, yo, ig, pcm };

/** Each language's name in that language, so a person can find theirs. */
export const localeNames: Record<LiveLocale, string> = {
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
