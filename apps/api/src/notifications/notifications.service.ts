import { type Db, profile, pushSubscription, snapshot } from '@interim/db';
import { checkInDue, localClock, wordsDue } from '@interim/rules';
import { messages, templates, wordsForDay } from '@interim/templates';
import { liveLocaleSchema, templateKeySchema } from '@interim/types';
import type { NotificationSettings, SaveNotificationsInput } from '@interim/types';
import { ConflictException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { and, eq, max } from 'drizzle-orm';
import { DB } from '../db/db.token';
import type { Owner } from '../guard/owner.service';
import { PUSH_SENDER, type PushSender } from './push-sender';

const OFF: NotificationSettings = { wordsAt: null, checkIn: false, showPassage: false };

/** What the service worker shows. Built from fixed text, so it never names the situation, a stage or a count of days. */
interface Payload {
  title: string;
  body: string;
  /** Collapses a second notification of the same kind into the first. */
  tag: 'words' | 'check-in';
  url: string;
}

/** Notification opt ins and the hourly send (docs/product/spec.md section 12a). */
@Injectable()
export class NotificationsService {
  private readonly log = new Logger(NotificationsService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(PUSH_SENDER) private readonly sender: PushSender,
  ) {}

  /** The public key the browser subscribes with. */
  publicKey(): string | null {
    return this.sender.publicKey;
  }

  /** The choices saved for one device, all off when it has none. */
  async get(profileId: string, owner: Owner, endpoint: string): Promise<NotificationSettings> {
    await this.ownedProfile(profileId, owner);
    const [row] = await this.db
      .select({ wordsAt: pushSubscription.wordsAt, checkIn: pushSubscription.checkIn, showPassage: pushSubscription.showPassage })
      .from(pushSubscription)
      .where(and(eq(pushSubscription.endpoint, endpoint), eq(pushSubscription.profileId, profileId)));
    return row ?? OFF;
  }

  /**
   * Saves one device's choices. With both kinds off the subscription is deleted instead, so nothing
   * is kept for a device that gets nothing.
   * @throws ConflictException when words for today is asked for while no set is chosen, since there would be nothing to send.
   */
  async save(profileId: string, owner: Owner, input: SaveNotificationsInput): Promise<NotificationSettings> {
    const { wordsSet } = await this.ownedProfile(profileId, owner);
    const settings = { wordsAt: input.wordsAt, checkIn: input.checkIn, showPassage: input.wordsAt !== null && input.showPassage };
    if (settings.wordsAt === null && !settings.checkIn) {
      await this.remove(profileId, owner, input.subscription.endpoint);
      return OFF;
    }
    if (settings.wordsAt !== null && !wordsSet) throw new ConflictException('Choose a words for today set first');
    if (!this.sender.publicKey) throw new ServiceUnavailableException('Notifications are not set up');

    const device = {
      profileId,
      p256dh: input.subscription.keys.p256dh,
      auth: input.subscription.keys.auth,
      timeZone: input.timeZone,
      ...settings,
    };
    // A browser keeps one endpoint, so signing in as someone else on it moves the subscription instead of sharing it.
    await this.db
      .insert(pushSubscription)
      .values({ endpoint: input.subscription.endpoint, ...device })
      .onConflictDoUpdate({ target: pushSubscription.endpoint, set: { ...device, lastWordsAt: null, lastCheckInAt: null } });
    return settings;
  }

  /** Deletes one device's subscription. Repeats safely. */
  async remove(profileId: string, owner: Owner, endpoint: string): Promise<void> {
    await this.ownedProfile(profileId, owner);
    await this.db
      .delete(pushSubscription)
      .where(and(eq(pushSubscription.endpoint, endpoint), eq(pushSubscription.profileId, profileId)));
  }

  /**
   * Sends every notification that is due at `now`. Run hourly: each device is judged on its own
   * time zone, and a failure for one device never stops the rest.
   * @returns How many notifications were sent, for the worker's log.
   */
  async sendDue(now: Date = new Date()): Promise<number> {
    if (!this.sender.publicKey) return 0;
    const rows = await this.db
      .select({
        id: pushSubscription.id,
        profileId: pushSubscription.profileId,
        endpoint: pushSubscription.endpoint,
        p256dh: pushSubscription.p256dh,
        auth: pushSubscription.auth,
        timeZone: pushSubscription.timeZone,
        wordsAt: pushSubscription.wordsAt,
        checkIn: pushSubscription.checkIn,
        showPassage: pushSubscription.showPassage,
        lastWordsAt: pushSubscription.lastWordsAt,
        lastCheckInAt: pushSubscription.lastCheckInAt,
        locale: profile.locale,
        templateKey: profile.templateKey,
        kind: profile.kind,
        wordsSet: profile.wordsSet,
        lastCheckIn: max(snapshot.takenAt),
      })
      .from(pushSubscription)
      .innerJoin(profile, eq(profile.id, pushSubscription.profileId))
      .leftJoin(snapshot, eq(snapshot.profileId, profile.id))
      .groupBy(pushSubscription.id, profile.id);

    let sent = 0;
    for (const row of rows) {
      const clock = localClock(now, row.timeZone);
      const locale = liveLocaleSchema.parse(row.locale);
      const text = messages[locale].notifications;
      const url = row.kind === 'style' ? `/style/${row.profileId}` : `/ready/${row.profileId}`;
      const due: { payload: Payload; mark: 'lastWordsAt' | 'lastCheckInAt' }[] = [];

      if (row.wordsSet && wordsDue({ wordsAt: row.wordsAt, lastSentAt: row.lastWordsAt }, clock, now)) {
        const passage = row.showPassage ? wordsForDay(row.wordsSet, clock.date, locale).text : null;
        due.push({ payload: { title: messages[locale].common.appName, body: passage ?? text.push.words, tag: 'words', url }, mark: 'lastWordsAt' });
      }
      // Style profiles have no check ins, so only words for today can be due for them.
      const everyDays = row.templateKey ? templates[templateKeySchema.parse(row.templateKey)].checkInEveryDays : undefined;
      if (row.checkIn && everyDays !== undefined && checkInDue({ lastCheckInAt: row.lastCheckIn, everyDays, lastSentAt: row.lastCheckInAt }, clock, now)) {
        due.push({ payload: { title: messages[locale].common.appName, body: text.push.checkIn, tag: 'check-in', url }, mark: 'lastCheckInAt' });
      }

      for (const { payload, mark } of due) {
        try {
          const result = await this.sender.send(row, JSON.stringify(payload));
          if (result === 'gone') {
            await this.db.delete(pushSubscription).where(eq(pushSubscription.id, row.id));
            break;
          }
          await this.db.update(pushSubscription).set({ [mark]: now }).where(eq(pushSubscription.id, row.id));
          sent += 1;
        } catch {
          // Not marked as sent. The send window is as wide as the job interval, so the next run does not retry it.
          this.log.warn(`Notification for subscription ${row.id} failed`);
        }
      }
    }
    return sent;
  }

  private async ownedProfile(id: string, owner: Owner) {
    const [row] = await this.db
      .select({ wordsSet: profile.wordsSet })
      .from(profile)
      .where(and(eq(profile.id, id), eq(profile.ownerRef, owner.ref)));
    if (!row) throw new NotFoundException();
    return row;
  }
}
