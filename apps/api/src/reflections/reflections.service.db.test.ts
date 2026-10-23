import { type Db, profile, reflection, safetyReview } from '@interim/db';
import { CONSENT_VERSION } from '@interim/rules';
import { ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { SafetyVerdict } from '../agent/safety-reviewer';
import { createTestDb } from '../test/test-db';
import { REFLECTIONS_PER_DAY, ReflectionsService } from './reflections.service';

const key = 'c'.repeat(64);
const alice = { ref: 'alice' };
const bob = { ref: 'bob' };

let db: Db;
let queued: string[];
let answer: SafetyVerdict | Error;
let reflections: ReflectionsService;
let profileId: string;

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await db.execute(sql`truncate profile cascade`);
  queued = [];
  answer = 'clear';
  reflections = new ReflectionsService(
    db,
    key,
    { enqueue: async (id) => void queued.push(id) },
    {
      review: async () => {
        if (answer instanceof Error) throw answer;
        return answer;
      },
    },
  );
  const [row] = await db
    .insert(profile)
    .values({ templateKey: 'going_grey', ownerRef: alice.ref, consentVersion: CONSENT_VERSION, consentedAt: new Date() })
    .returning({ id: profile.id });
  if (!row) throw new Error('no profile');
  profileId = row.id;
});

const reviewOf = async (reflectionId: string) =>
  (await db.select().from(safetyReview).where(eq(safetyReview.reflectionId, reflectionId)))[0];

describe('saving', () => {
  it('stores the text encrypted and reads it back', async () => {
    const { reflection: saved, contacts } = await reflections.create(profileId, alice, 'I looked in the mirror and smiled');
    expect(contacts).toBe(false);
    expect(saved.safety).toBe('none');
    const [raw] = await db.select({ text: reflection.text }).from(reflection);
    expect(raw?.text).not.toContain('mirror');
    expect((await reflections.list(profileId, alice)).reflections.map((r) => r.text)).toEqual(['I looked in the mirror and smiled']);
    expect(await db.select().from(safetyReview)).toEqual([]);
    expect(queued).toEqual([]);
  });

  it('keeps an exact match as a concern without asking a model', async () => {
    const { reflection: saved, contacts } = await reflections.create(profileId, alice, 'Some days I want to die');
    expect(saved.safety).toBe('match');
    expect(contacts).toBe(true);
    expect(await reviewOf(saved.id)).toMatchObject({ reason: 'match', verdict: 'concern' });
    expect(queued).toEqual([]);
    expect((await reflections.list(profileId, alice)).contacts).toBe(true);
  });

  it('flags a near match, queues it and shows the contacts while it waits', async () => {
    const { reflection: saved, contacts } = await reflections.create(profileId, alice, 'I wish I could just disappear');
    expect(saved.safety).toBe('flagged');
    expect(contacts).toBe(true);
    const review = await reviewOf(saved.id);
    expect(review).toMatchObject({ reason: 'near', verdict: 'pending' });
    expect(queued).toEqual([review?.id]);
    expect((await reflections.list(profileId, alice)).contacts).toBe(true);
  });

  it('still saves when the queue is down', async () => {
    const down = new ReflectionsService(db, key, { enqueue: async () => Promise.reject(new Error('redis')) }, { review: async () => 'clear' });
    const { reflection: saved } = await down.create(profileId, alice, 'I wish I could just disappear');
    expect(await reviewOf(saved.id)).toMatchObject({ verdict: 'pending' });
    expect(await down.pendingReviewIds()).toHaveLength(1);
  });

  it('caps how many a profile can save in a day', async () => {
    for (let i = 0; i < REFLECTIONS_PER_DAY; i++) await reflections.create(profileId, alice, `note ${i}`);
    const error = await reflections.create(profileId, alice, 'one more').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
  });
});

describe('the model review', () => {
  const flag = async () => {
    const { reflection: saved } = await reflections.create(profileId, alice, 'I wish I could just disappear');
    const review = await reviewOf(saved.id);
    if (!review) throw new Error('no review');
    return review.id;
  };

  it('clear takes the contacts card away', async () => {
    answer = 'clear';
    await reflections.review(await flag());
    expect((await reflections.list(profileId, alice)).contacts).toBe(false);
  });

  it('concern, unsure and a failed call keep it', async () => {
    for (const verdict of ['concern', 'unsure', new Error('quota')] as const) {
      await db.execute(sql`truncate reflection cascade`);
      answer = verdict;
      const id = await flag();
      await reflections.review(id);
      expect((await reflections.list(profileId, alice)).contacts, String(verdict)).toBe(true);
    }
  });

  it('writes a verdict once and never changes a match', async () => {
    const id = await flag();
    answer = 'clear';
    await reflections.review(id);
    answer = 'concern';
    await reflections.review(id);
    expect((await db.select().from(safetyReview).where(eq(safetyReview.id, id)))[0]?.verdict).toBe('clear');

    const { reflection: matched } = await reflections.create(profileId, alice, 'I want to die');
    const review = await reviewOf(matched.id);
    answer = 'clear';
    await reflections.review(review?.id ?? '');
    expect((await reviewOf(matched.id))?.verdict).toBe('concern');
  });
});

describe('dismissing, deleting and owning', () => {
  it('dismiss hides the card until the next flag', async () => {
    await reflections.create(profileId, alice, 'I want to die');
    await reflections.dismissContacts(profileId, alice);
    expect((await reflections.list(profileId, alice)).contacts).toBe(false);
    await reflections.create(profileId, alice, 'I wish I could just disappear');
    expect((await reflections.list(profileId, alice)).contacts).toBe(true);
  });

  it('deletes one reflection with its review, and a profile with all of them', async () => {
    const { reflection: saved } = await reflections.create(profileId, alice, 'I want to die');
    await reflections.remove(profileId, saved.id, alice);
    expect(await db.select().from(reflection)).toEqual([]);
    expect(await db.select().from(safetyReview)).toEqual([]);
    await reflections.create(profileId, alice, 'one');
    await db.delete(profile).where(eq(profile.id, profileId));
    expect(await db.select().from(reflection)).toEqual([]);
  });

  it('answers 404 for another owner and 403 without current consent', async () => {
    await expect(reflections.list(profileId, bob)).rejects.toThrow(NotFoundException);
    await expect(reflections.create(profileId, bob, 'hi')).rejects.toThrow(NotFoundException);
    await db.update(profile).set({ consentedAt: null }).where(eq(profile.id, profileId));
    await expect(reflections.create(profileId, alice, 'hi')).rejects.toThrow(ForbiddenException);
  });

  it('skips a reflection it cannot decrypt instead of hiding the rest', async () => {
    await reflections.create(profileId, alice, 'readable');
    const other = new ReflectionsService(db, 'd'.repeat(64), { enqueue: async () => {} }, { review: async () => 'clear' });
    expect((await other.list(profileId, alice)).reflections).toEqual([]);
    expect((await reflections.list(profileId, alice)).reflections).toHaveLength(1);
  });
});
