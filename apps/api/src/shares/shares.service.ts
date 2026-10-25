import { type Db, profile, render, run, shareLink, stageCard } from '@interim/db';
import { shareableAdvice } from '@interim/rules';
import { type ShareCreated, type ShareList, type SharedCard, stageCardSchema } from '@interim/types';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, gt, inArray, isNull } from 'drizzle-orm';
import { DB } from '../db/db.token';
import type { Owner } from '../guard/owner.service';
import { hashToken, randomToken } from '../guard/token';
import { StorageService } from '../storage/storage.service';

/** Settings the shares module takes from the environment and the product rules. */
export interface SharesConfig {
  /** Keyed-hash secret, so a stored hash cannot be replayed from a leaked row. */
  secret: string;
  /** How long a new link works. */
  ttlDays: number;
}
export const SHARES_CONFIG = Symbol('SHARES_CONFIG');

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Share links for a Stage Card. A link opens the renders and some card text for anyone who holds it,
 * and nothing else: the view is built here from an allow list, never by trimming the owner's card.
 */
@Injectable()
export class SharesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(SHARES_CONFIG) private readonly config: SharesConfig,
  ) {}

  /** Makes a link for the person's card. The token is returned once; only its hash is stored. */
  async create(cardId: string, owner: Owner): Promise<ShareCreated> {
    await this.ownedCard(cardId, owner);
    const token = randomToken();
    const expiresAt = new Date(Date.now() + this.config.ttlDays * DAY_MS);
    const [row] = await this.db
      .insert(shareLink)
      .values({ cardId, tokenHash: hashToken(this.config.secret, token), expiresAt })
      .returning({ id: shareLink.id });
    if (!row) throw new Error(`Share link for card ${cardId} was not stored`);
    return { id: row.id, token, expiresAt: expiresAt.toISOString() };
  }

  /** The card's links that still work, oldest first. */
  async list(cardId: string, owner: Owner): Promise<ShareList> {
    await this.ownedCard(cardId, owner);
    const rows = await this.db
      .select({ id: shareLink.id, expiresAt: shareLink.expiresAt })
      .from(shareLink)
      .where(and(eq(shareLink.cardId, cardId), isNull(shareLink.revokedAt), gt(shareLink.expiresAt, new Date())))
      .orderBy(asc(shareLink.createdAt));
    return rows.map((r) => ({ id: r.id, expiresAt: r.expiresAt.toISOString() }));
  }

  /** Stops a link working. Revoking twice keeps the first time. */
  async revoke(shareId: string, owner: Owner): Promise<void> {
    const [row] = await this.db
      .select({ id: shareLink.id, revokedAt: shareLink.revokedAt })
      .from(shareLink)
      .innerJoin(stageCard, eq(stageCard.id, shareLink.cardId))
      .innerJoin(profile, eq(profile.id, stageCard.profileId))
      .where(and(eq(shareLink.id, shareId), eq(profile.ownerRef, owner.ref)));
    if (!row) throw new NotFoundException();
    if (!row.revokedAt) await this.db.update(shareLink).set({ revokedAt: new Date() }).where(eq(shareLink.id, shareId));
  }

  /**
   * What the holder of a token sees.
   * @throws NotFoundException for a token that is unknown, expired or revoked, so the three look the same.
   */
  async view(token: string): Promise<SharedCard> {
    const [row] = await this.db
      .select({ card: stageCard.card, expiresAt: shareLink.expiresAt, snapshotId: run.snapshotId })
      .from(shareLink)
      .innerJoin(stageCard, eq(stageCard.id, shareLink.cardId))
      .innerJoin(run, eq(run.id, stageCard.runId))
      .where(
        and(
          eq(shareLink.tokenHash, hashToken(this.config.secret, token)),
          isNull(shareLink.revokedAt),
          gt(shareLink.expiresAt, new Date()),
        ),
      );
    if (!row) throw new NotFoundException();
    const card = stageCardSchema.parse(row.card);

    const ids = [...card.options.map((o) => o.renderId), ...card.clothes.map((c) => c.renderId)];
    const keys = new Map<string, string>();
    if (ids.length > 0) {
      const renders = await this.db.select({ id: render.id, key: render.objectKey }).from(render).where(inArray(render.id, ids));
      for (const r of renders) if (r.key) keys.set(r.id, await this.storage.presignGet(r.key));
    }

    // A render whose image has expired is left out: the card text it belonged to would point at nothing.
    return {
      takenAt: card.takenAt,
      options: card.options.flatMap((o) => {
        const url = keys.get(o.renderId);
        return url ? [{ url, strategy: o.strategy, label: o.label, look: o.look }] : [];
      }),
      advice: shareableAdvice(card.advice),
      clothes: card.clothes.flatMap((c) => {
        const url = keys.get(c.renderId);
        return url ? [{ url, sku: c.sku }] : [];
      }),
      shoppingList: card.shoppingList,
      expiresAt: row.expiresAt.toISOString(),
    };
  }

  private async ownedCard(cardId: string, owner: Owner): Promise<void> {
    const [row] = await this.db
      .select({ id: stageCard.id })
      .from(stageCard)
      .innerJoin(profile, eq(profile.id, stageCard.profileId))
      .where(and(eq(stageCard.id, cardId), eq(profile.ownerRef, owner.ref)));
    if (!row) throw new NotFoundException();
  }
}
