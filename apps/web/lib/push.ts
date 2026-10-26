/** Whether this browser can show notifications, and if not, whether adding the app to the home screen would fix it. */
export type PushSupport = 'ok' | 'unsupported' | 'install';

/** Checked in the browser only. */
export function pushSupport(): PushSupport {
  if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) return 'ok';
  // iPhone and iPad hide the push APIs until the app is on the home screen (iOS 16.4 or later).
  const apple = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return apple ? 'install' : 'unsupported';
}

/** The device's IANA time zone, so "8 in the morning" follows the person when they travel. */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64Url.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

async function registration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register('/sw.js');
  return navigator.serviceWorker.ready;
}

/** This device's subscription, if it has one. Asks for nothing. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  return (await registration()).pushManager.getSubscription();
}

/**
 * This device's subscription, made if needed. Must run from a tap, because the permission prompt
 * only appears after one.
 * @returns null when the person did not allow notifications.
 */
export async function subscribe(publicKey: string): Promise<PushSubscription | null> {
  const existing = await currentSubscription();
  if (existing) return existing;
  if ((await Notification.requestPermission()) !== 'granted') return null;
  return (await registration()).pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
}

/** Whether the browser has blocked notifications for this site, which only its own settings can undo. */
export function permissionBlocked(): boolean {
  return Notification.permission === 'denied';
}
