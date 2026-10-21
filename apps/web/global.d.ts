import type { Messages } from '@interim/templates';
import type { LiveLocale } from '@interim/types';

// Gives `useTranslations` and `getTranslations` the English keys, so a key that does not exist fails
// the typecheck. The lines for what to say are lists the app does not render yet.
declare module 'next-intl' {
  interface AppConfig {
    Locale: LiveLocale;
    Messages: Omit<Messages, 'whatToSay'>;
  }
}
