import { type Db, profile, pushSubscription, snapshot } from '@interim/db';
import { findBannedWord, findCompanionPhrase } from '@interim/rules';
import { messages, wordsForDay } from '@interim/templates';
import { type SaveNotificationsInput, liveLocales } from '@interim/types';
import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../test/test-db';
import { NotificationsService } from './notifications.service';
import type { PushSender, PushTarget } from './push-sender';

const alice = { ref: 'alice' };
const bob = { ref: 'bob' };
const endpoint = (name: string) => `https://fcm.googleapis.com/fcm/send/${name}`;

class FakeSender implements PushSender {
  publicKey: string | null = 'public-key';
  sent: { target: PushTarget; payload: { title: string; body: string; tag: string; url: string } }[] = [];
  gone = new Set<string>();

  async send(target: PushTarget, payload: string) {
    if (this.gone.has(target.endpoint)) return 'gone' as const;
    this.sent.push({ target, payload: JSON.parse(payload) });
    return 'sent' as const;
  }
}

let db: Db;
let sender: FakeSender;
let service: NotificationsService;

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await db.execute(sql`truncate profile cascade`);
  sender = new FakeSender();
  service = new NotificationsService(db, sender);
});

async function makeProfile(values: Partial<typeof profile.$inferInsert> = {}) {
  const [row] = await db
    .insert(profile)
    .values({ templateKey: 'going_grey', ownerRef: alice.ref, consentVersion: '5', wordsSet: 'gentle', ...values })
    .returning({ id: profile.id });
  if (!row) throw new Error('no profile');
  return row.id;
}

const save = (profileId: string, name: string, timeZone: string, settings: Partial<SaveNotificationsInput> = {}) =>
  service.save(profileId, alice, {
    subscription: { endpoint: endpoint(name), keys: { p256dh: 'p', auth: 'a' } },
    timeZone,
    wordsAt: null,
    checkIn: false,
    showPassage: false,
    ...settings,
  });

describe('opting in and out', () => {
  it('starts with everything off', async () => {
    const id = await makeProfile();
    expect(await service.get(id, alice, endpoint('a'))).toEqual({ wordsAt: null, checkIn: false, showPassage: false });
  });

  it('switches each kind on and off on its own', async () => {
    const id = await makeProfile();
    await save(id, 'a', 'Africa/Lagos', { wordsAt: '08:00' });
    expect(await service.get(id, alice, endpoint('a'))).toEqual({ wordsAt: '08:00', checkIn: false, showPassage: false });

    await save(id, 'a', 'Africa/Lagos', { wordsAt: '08:00', checkIn: true });
    expect(await service.get(id, alice, endpoint('a'))).toMatchObject({ wordsAt: '08:00', checkIn: true });

    await save(id, 'a', 'Africa/Lagos', { checkIn: true });
    expect(await service.get(id, alice, endpoint('a'))).toEqual({ wordsAt: null, checkIn: true, showPassage: false });
  });

  it('deletes the subscription when the last kind is switched off', async () => {
    const id = await makeProfile();
    await save(id, 'a', 'Africa/Lagos', { checkIn: true });
    await save(id, 'a', 'Africa/Lagos');
    expect(await db.select().from(pushSubscription)).toEqual([]);
  });

  it('shows the passage only while words for today is on', async () => {
    const id = await makeProfile();
    expect(await save(id, 'a', 'Africa/Lagos', { checkIn: true, showPassage: true })).toMatchObject({ showPassage: false });
  });

  it('refuses words for today while no set is chosen', async () => {
    const id = await makeProfile({ wordsSet: null });
    await expect(save(id, 'a', 'Africa/Lagos', { wordsAt: '08:00' })).rejects.toThrow(ConflictException);
  });

  it('refuses while push is not set up, but still lets a device be switched off', async () => {
    const id = await makeProfile();
    sender.publicKey = null;
    await expect(save(id, 'a', 'Africa/Lagos', { checkIn: true })).rejects.toThrow(ServiceUnavailableException);
    await expect(save(id, 'a', 'Africa/Lagos')).resolves.toBeDefined();
  });

  it('keeps one profile out of another owner’s hands', async () => {
    const id = await makeProfile();
    await expect(service.get(id, bob, endpoint('a'))).rejects.toThrow(NotFoundException);
    await expect(service.save(id, bob, { subscription: { endpoint: endpoint('a'), keys: { p256dh: 'p', auth: 'a' } }, timeZone: 'UTC', wordsAt: null, checkIn: true, showPassage: false })).rejects.toThrow(NotFoundException);
    await expect(service.remove(id, bob, endpoint('a'))).rejects.toThrow(NotFoundException);
  });

  it('deletes subscriptions with the profile', async () => {
    const id = await makeProfile();
    await save(id, 'a', 'Africa/Lagos', { wordsAt: '08:00' });
    await db.delete(profile).where(eq(profile.id, id));
    expect(await db.select().from(pushSubscription)).toEqual([]);
  });
});

describe('the hourly send', () => {
  it('sends words for today at each device’s own local time, in two time zones', async () => {
    const id = await makeProfile();
    await save(id, 'lagos', 'Africa/Lagos', { wordsAt: '08:00' });
    await save(id, 'newyork', 'America/New_York', { wordsAt: '08:00' });

    // 07:05 UTC is 08:05 in Lagos and 03:05 in New York.
    expect(await service.sendDue(new Date('2026-10-26T07:05:00Z'))).toBe(1);
    expect(sender.sent.map((s) => s.target.endpoint)).toEqual([endpoint('lagos')]);

    // 12:05 UTC is 08:05 in New York (daylight time).
    expect(await service.sendDue(new Date('2026-10-26T12:05:00Z'))).toBe(1);
    expect(sender.sent.map((s) => s.target.endpoint)).toEqual([endpoint('lagos'), endpoint('newyork')]);
    expect(sender.sent.map((s) => s.payload.tag)).toEqual(['words', 'words']);
  });

  it('sends a check in reminder in two time zones once the cadence is due', async () => {
    const id = await makeProfile(); // going_grey: every 45 days
    await db.insert(snapshot).values({ profileId: id, takenAt: new Date('2026-09-01T12:00:00Z') });
    await save(id, 'lagos', 'Africa/Lagos', { checkIn: true });
    await save(id, 'newyork', 'America/New_York', { checkIn: true });

    // 09:10 UTC is 10:10 in Lagos; 14:10 UTC is 10:10 in New York.
    expect(await service.sendDue(new Date('2026-10-26T09:10:00Z'))).toBe(1);
    expect(await service.sendDue(new Date('2026-10-26T14:10:00Z'))).toBe(1);
    expect(sender.sent.map((s) => [s.target.endpoint, s.payload.tag])).toEqual([
      [endpoint('lagos'), 'check-in'],
      [endpoint('newyork'), 'check-in'],
    ]);
  });

  it('does not remind before the cadence is due or before a first check in', async () => {
    const id = await makeProfile();
    await save(id, 'a', 'Africa/Lagos', { checkIn: true });
    expect(await service.sendDue(new Date('2026-10-26T09:10:00Z'))).toBe(0);

    await db.insert(snapshot).values({ profileId: id, takenAt: new Date('2026-10-20T12:00:00Z') });
    expect(await service.sendDue(new Date('2026-10-26T09:10:00Z'))).toBe(0);
  });

  it('sends each notification once, even if the job runs twice in the hour', async () => {
    const id = await makeProfile();
    await save(id, 'a', 'Africa/Lagos', { wordsAt: '08:00' });
    expect(await service.sendDue(new Date('2026-10-26T07:05:00Z'))).toBe(1);
    expect(await service.sendDue(new Date('2026-10-26T07:40:00Z'))).toBe(0);
    expect(await service.sendDue(new Date('2026-10-27T07:05:00Z'))).toBe(1);
  });

  it('sends nothing for words for today while the set is off', async () => {
    const id = await makeProfile({ wordsSet: null });
    await db.insert(pushSubscription).values({ profileId: id, endpoint: endpoint('a'), p256dh: 'p', auth: 'a', timeZone: 'Africa/Lagos', wordsAt: '08:00' });
    expect(await service.sendDue(new Date('2026-10-26T07:05:00Z'))).toBe(0);
  });

  it('keeps the passage off the lock screen unless asked, and shows it when asked', async () => {
    const id = await makeProfile({ wordsSet: 'christian', locale: 'en' });
    await save(id, 'plain', 'Africa/Lagos', { wordsAt: '08:00' });
    await save(id, 'passage', 'Africa/Lagos', { wordsAt: '08:00', showPassage: true });
    await service.sendDue(new Date('2026-10-26T07:05:00Z'));

    const byEndpoint = Object.fromEntries(sender.sent.map((s) => [s.target.endpoint, s.payload.body]));
    expect(byEndpoint[endpoint('plain')]).toBe(messages.en.notifications.push.words);
    expect(byEndpoint[endpoint('passage')]).toBe(wordsForDay('christian', '2026-10-26', 'en').text);
  });

  it('writes in the profile’s language and never names the situation, a stage or a count', async () => {
    const id = await makeProfile({ locale: 'fr', templateKey: 'hair_loss_ahead' });
    await db.insert(snapshot).values({ profileId: id, takenAt: new Date('2026-08-01T12:00:00Z'), stageKey: 'thinning' });
    await save(id, 'a', 'Africa/Lagos', { wordsAt: '10:00', checkIn: true });
    // 09:10 UTC is 10:10 in Lagos, which is both kinds' hour.
    await service.sendDue(new Date('2026-10-26T09:10:00Z'));

    expect(sender.sent.map((s) => s.payload.body).sort()).toEqual([messages.fr.notifications.push.checkIn, messages.fr.notifications.push.words].sort());
    for (const { payload, target } of sender.sent) {
      expect(JSON.stringify(payload)).not.toMatch(/thinning|hair|cheveux|\d+ (days?|jours?)/i);
      expect(payload.title).toBe('Interim');
      expect(target.p256dh).toBe('p');
    }
  });

  it('deletes a subscription the push service says has expired, and keeps sending to the rest', async () => {
    const id = await makeProfile();
    await save(id, 'expired', 'Africa/Lagos', { wordsAt: '08:00' });
    await save(id, 'live', 'Africa/Lagos', { wordsAt: '08:00' });
    sender.gone.add(endpoint('expired'));

    expect(await service.sendDue(new Date('2026-10-26T07:05:00Z'))).toBe(1);
    const left = await db.select({ endpoint: pushSubscription.endpoint }).from(pushSubscription);
    expect(left).toEqual([{ endpoint: endpoint('live') }]);
  });

  it('sends nothing while push is not set up', async () => {
    const id = await makeProfile();
    await save(id, 'a', 'Africa/Lagos', { wordsAt: '08:00' });
    sender.publicKey = null;
    expect(await service.sendDue(new Date('2026-10-26T07:05:00Z'))).toBe(0);
  });
});

describe('notification text', () => {
  it.each(liveLocales)('passes both language scans in %s', (locale) => {
    const { push } = messages[locale].notifications;
    for (const text of [push.words, push.checkIn]) {
      expect(findBannedWord(text, locale)).toBeUndefined();
      expect(findCompanionPhrase(text, locale)).toBeUndefined();
    }
  });
});
