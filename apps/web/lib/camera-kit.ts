import type { LiveLocale } from '@interim/types';

const SDK_URL = 'https://plugins-media.makeupar.com/v2.5-camera-kit/sdk.js';
const LOAD_TIMEOUT_MS = 10_000;

/** What the kit is asked to capture: a front photo, the three hair type angles, or the head lowered for density. */
export type KitMode = 'shadefinder' | 'hairtype' | 'hairdensity';

/** Why the kit could not give a photo, so the wizard can offer the file input instead. */
export type KitFailure = 'permission' | 'unavailable';

/** Hooks for one use of the kit. `onPhotos` gets the captured photos in the kit's own order (front, right, left for hair type). */
export interface KitHandlers {
  onPhotos(photos: Blob[]): void;
  onFailure(reason: KitFailure): void;
  onClosed(): void;
}

// The kit speaks five of the app's languages; the rest show its English.
const kitLanguage: Partial<Record<LiveLocale, string>> = { fr: 'fra', es: 'esp', pt: 'ptb', it: 'ita' };

let loading: Promise<void> | undefined;

/** Loads the kit's script once. Rejects when it does not arrive in time, so the caller can fall back. */
function loadKit(): Promise<void> {
  loading ??= new Promise<void>((resolve, reject) => {
    if (window.YMK) return resolve();
    const timer = setTimeout(() => reject(new Error('Camera Kit did not load')), LOAD_TIMEOUT_MS);
    // The kit requires this to exist before its script runs.
    window.YMKAsyncInit = () => {
      clearTimeout(timer);
      resolve();
    };
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.onerror = () => {
      clearTimeout(timer);
      reject(new Error('Camera Kit failed to load'));
    };
    document.head.append(script);
  }).catch((error: unknown) => {
    loading = undefined; // allow another try
    throw error;
  });
  return loading;
}

/**
 * Opens the kit into `#YMK-module` and hands back what it captures. The kit checks angle, light and
 * distance live, so a photo it returns has already passed the device check; the server asks again.
 * @returns A function that closes the kit and removes its listeners.
 */
export function openCameraKit(mode: KitMode, locale: LiveLocale, handlers: KitHandlers): () => void {
  let cancelled = false;
  const listeners: unknown[] = [];
  const close = () => {
    cancelled = true;
    const kit = window.YMK;
    if (!kit) return;
    for (const id of listeners) kit.removeEventListener(id);
    listeners.length = 0;
    kit.close();
  };

  loadKit().then(
    () => {
      const kit = window.YMK;
      if (cancelled || !kit) return;
      listeners.push(
        kit.addEventListener('faceDetectionCaptured', (payload) => {
          const images = (payload as { images?: { image?: unknown }[] }).images ?? [];
          const photos = images.flatMap((i) => (i.image instanceof Blob ? [i.image] : []));
          if (photos.length === 0) return handlers.onFailure('unavailable');
          handlers.onPhotos(photos);
        }),
        kit.addEventListener('cameraFailed', (error) => {
          handlers.onFailure(JSON.stringify(error).includes('permission') ? 'permission' : 'unavailable');
        }),
        kit.addEventListener('closed', () => handlers.onClosed()),
      );
      kit.init({
        faceDetectionMode: mode,
        imageFormat: 'blob',
        language: kitLanguage[locale] ?? 'enu',
        qualityLevel: 'moderate',
        // The top photo is taken alone, so the kit counts down for five seconds before it captures.
        countingDuration: mode === 'hairdensity' ? 5000 : 800,
      });
      kit.openCameraKit();
    },
    () => handlers.onFailure('unavailable'),
  );
  return close;
}
