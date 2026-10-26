import { describe, expect, it } from 'vitest';
import { isPushServiceUrl, saveNotificationsSchema } from './index';

describe('isPushServiceUrl', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/abc',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
  ])('accepts %s', (url) => {
    expect(isPushServiceUrl(url)).toBe(true);
  });

  // The API posts to this address, so anything else could point it at an internal service.
  it.each([
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://localhost/x',
    'https://127.0.0.1/x',
    'https://evilfcm.googleapis.com.example.com/x',
    'https://example.com/fcm.googleapis.com',
    'https://fcm.googleapis.com@example.com/x',
    'https://fcm.googleapis.com:8443/x',
    'not a url',
  ])('refuses %s', (url) => {
    expect(isPushServiceUrl(url)).toBe(false);
  });
});

describe('saveNotificationsSchema', () => {
  const base = {
    subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'p', auth: 'a' } },
    wordsAt: '08:00',
    checkIn: false,
    showPassage: false,
  };

  it('takes a real time zone and a 24 hour time', () => {
    expect(saveNotificationsSchema.safeParse({ ...base, timeZone: 'Africa/Lagos' }).success).toBe(true);
  });

  it('refuses an unknown time zone or a time that is not on the clock', () => {
    expect(saveNotificationsSchema.safeParse({ ...base, timeZone: 'Mars/Base' }).success).toBe(false);
    expect(saveNotificationsSchema.safeParse({ ...base, timeZone: 'UTC', wordsAt: '24:00' }).success).toBe(false);
  });
});
