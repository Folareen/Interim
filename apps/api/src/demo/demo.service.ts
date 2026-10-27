import { type Db, profile, stageCard } from '@interim/db';
import { type CardView, type Demo, templateKeySchema } from '@interim/types';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, max } from 'drizzle-orm';
import { DB } from '../db/db.token';
import type { Owner } from '../guard/owner.service';
import { RunsService } from '../runs/runs.service';

/** The `owner_ref` of every sample profile. No account has it, so no one ever owns one. */
export const SAMPLE_OWNER: Owner = { ref: 'sample' };

/**
 * What the public demo shows. It only reads: nothing here can start a run, so no visitor can spend
 * units, and the owner it reads as is `sample`, so a real person's card can never be reached.
 */
@Injectable()
export class DemoService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(RunsService) private readonly runs: RunsService,
  ) {}

  /** The sample people with their cards, oldest first. */
  async list(): Promise<Demo> {
    const people = await this.db
      .select({ id: profile.id, templateKey: profile.templateKey, recordedOn: max(stageCard.createdAt) })
      .from(profile)
      .innerJoin(stageCard, eq(stageCard.profileId, profile.id))
      .where(and(eq(profile.ownerRef, SAMPLE_OWNER.ref), eq(profile.judgeSample, true)))
      .groupBy(profile.id)
      .orderBy(asc(profile.createdAt));
    return Promise.all(
      people.map(async (person) => ({
        id: person.id,
        templateKey: templateKeySchema.parse(person.templateKey),
        recordedOn: (person.recordedOn ?? new Date()).toISOString(),
        cards: (await this.runs.cards(person.id, SAMPLE_OWNER)).reverse(),
      })),
    );
  }

  /** One sample card with links to its images, or a 404 for anything that is not a sample. */
  card(cardId: string): Promise<CardView> {
    return this.runs.card(cardId, SAMPLE_OWNER);
  }
}
