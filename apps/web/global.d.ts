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

// YouCam's JS Camera Kit, loaded from its own script (docs.perfectcorp.com, "JS Camera Kit").
// Only what `lib/camera-kit.ts` uses is declared.
declare global {
  interface Window {
    YMKAsyncInit?: () => void;
    YMK?: {
      init(options: {
        faceDetectionMode: 'shadefinder' | 'hairtype' | 'hairdensity';
        imageFormat: 'blob';
        language: string;
        qualityLevel: 'relaxed' | 'moderate' | 'strict';
        countingDuration: number;
        hideFlipCameraButton?: boolean;
      }): void;
      openCameraKit(): void;
      close(): void;
      addEventListener(event: string, callback: (payload: unknown) => void): unknown;
      removeEventListener(id: unknown): void;
    };
  }
}
