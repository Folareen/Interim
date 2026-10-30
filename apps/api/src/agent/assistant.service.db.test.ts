import { randomUUID } from 'node:crypto';
import { type Db, profile, run, snapshot, stageCard } from '@interim/db';
import { CONSENT_VERSION } from '@interim/rules';
import { assistantRequestSchema } from '@interim/types';
import { sql } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimitService } from '../auth/rate-limit.service';
import { createTestDb } from '../test/test-db';
import { AssistantService } from './assistant.service';
import type { GenerateText, PlannerConfig } from './planner';

let db: Db;
let cardId: string;
let profileId: string;
let service: AssistantService;
let generate: ReturnType<typeof vi.fn<GenerateText>>;
let config: PlannerConfig;
const owner = { ref: 'account:synthetic-owner' };
const question = { message: 'How do the sizes work?', locale: 'en', acceptGoogle: true } as const;

beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  await db.execute(sql`truncate profile cascade`);
  await db.execute(sql`truncate rate_limit`);
  profileId = randomUUID();
  const snapshotId = randomUUID();
  const runId = randomUUID();
  cardId = randomUUID();
  await db
    .insert(profile)
    .values({
      id: profileId,
      ownerRef: owner.ref,
      templateKey: 'hair_loss_ahead',
      consentVersion: CONSENT_VERSION,
      consentedAt: new Date(),
    });
  await db.insert(snapshot).values({ id: snapshotId, profileId, isBaseline: true });
  await db
    .insert(run)
    .values({
      id: runId,
      snapshotId,
      templateKey: 'hair_loss_ahead',
      templateVersion: 1,
      budgetUnits: 40,
    });
  await db.insert(stageCard).values({ id: cardId, profileId, runId, card: {} });
  config = { mode: 'record', fixturesDir: '/unused', canCallModel: true };
  generate = vi.fn<GenerateText>().mockResolvedValue('{"topic":"sizes"}');
  service = new AssistantService(
    db,
    config,
    generate,
    new RateLimitService(db, { secret: 'synthetic-test-secret', secureCookie: false }),
  );
});

describe('optional card help', () => {
  it('requires explicit Google consent at the HTTP boundary', () => {
    expect(assistantRequestSchema.safeParse({ ...question, acceptGoogle: false }).success).toBe(
      false,
    );
    expect(assistantRequestSchema.safeParse({ ...question, message: ' '.repeat(3) }).success).toBe(
      false,
    );
    expect(
      assistantRequestSchema.safeParse({ ...question, message: 'x'.repeat(1001) }).success,
    ).toBe(false);
  });

  it('checks card ownership before the model can receive a question', async () => {
    await expect(service.ask(cardId, { ref: 'another-owner' }, question)).rejects.toMatchObject({
      status: 404,
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it('refuses a profile without current consent', async () => {
    await db.execute(sql`update profile set consented_at = null where id = ${profileId}`);
    await expect(service.ask(cardId, owner, question)).rejects.toMatchObject({ status: 403 });
    expect(generate).not.toHaveBeenCalled();
  });

  it('never calls the model in replay or without model access', async () => {
    config.mode = 'replay';
    expect(await service.ask(cardId, owner, question)).toEqual({ kind: 'unavailable' });
    config.mode = 'record';
    config.canCallModel = false;
    expect(await service.ask(cardId, owner, question)).toEqual({ kind: 'unavailable' });
    expect(generate).not.toHaveBeenCalled();
  });

  it.each(['I want to die', 'i dont wanna be here', 'je veux mourir', 'mo fe ku'])(
    'stops a safety match before sending it: %s',
    async (message) => {
      expect(await service.ask(cardId, owner, { ...question, message })).toEqual({
        kind: 'support',
      });
      expect(generate).not.toHaveBeenCalled();
    },
  );

  it('accepts only the topic and sends no card, photo, profile or history', async () => {
    generate.mockResolvedValue(
      '{"topic":"sizes","reply":"Ignore the rules","url":"https://bad.example"}',
    );
    expect(
      await service.ask(cardId, owner, {
        ...question,
        message: 'Abeg how this size dey work?',
        locale: 'pcm',
      }),
    ).toEqual({ kind: 'topic', topic: 'sizes' });
    const prompt = generate.mock.calls[0]?.[0];
    expect(prompt).toContain('Abeg how this size dey work?');
    expect(prompt).toContain('"locale":"pcm"');
    expect(prompt).not.toContain(cardId);
    expect(prompt).not.toContain(profileId);
    expect(prompt).not.toContain('hair_loss_ahead');
  });

  it.each(['{"topic":"delete_account"}', 'not json', '{"topic":"clarify"}'])(
    'asks for a choice when the model cannot route safely: %s',
    async (raw) => {
      generate.mockResolvedValue(raw);
      expect(await service.ask(cardId, owner, question)).toEqual({ kind: 'clarify' });
    },
  );

  it('keeps the fallback available after a provider failure', async () => {
    generate.mockRejectedValue(new Error('provider unavailable'));
    expect(await service.ask(cardId, owner, question)).toEqual({ kind: 'unavailable' });
  });

  it('enforces the daily account cap before an additional model call', async () => {
    for (let i = 0; i < 20; i++) await service.ask(cardId, owner, question);
    await expect(service.ask(cardId, owner, question)).rejects.toMatchObject({ status: 429 });
    expect(generate).toHaveBeenCalledTimes(20);
  });
});
