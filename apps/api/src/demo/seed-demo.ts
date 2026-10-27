import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { type Db, garment, measurement, photo, profile, render, run, selfReport, snapshot, stageCard, traceEntry } from '@interim/db';
import { templates } from '@interim/templates';
import { stageCardSchema, templateKeySchema } from '@interim/types';
import { NestFactory } from '@nestjs/core';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { AppModule } from '../app.module';
import { DB } from '../db/db.token';
import { StorageService } from '../storage/storage.service';
import { SAMPLE_OWNER } from './demo.service';

// Copies profiles that were recorded through the real app into the public demo. The copy has its own
// rows and its own stored images, so deleting the original account leaves the demo intact, and its
// check in dates are spread a fortnight apart and end today so the timeline reads naturally. A recording
// made before a template changed keeps only the previews the situation still offers.
// Replaces every existing sample. Usage: pnpm --filter @interim/api seed-demo <profile id>...

const DAY_MS = 86_400_000;
const FAR = () => new Date(Date.now() + 10 * 365 * DAY_MS);
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;

async function main() {
  const sources = process.argv.slice(2);
  if (sources.length === 0) throw new Error('Usage: seed-demo <profile id>...');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const db = app.get<Db>(DB);
  const storage = app.get(StorageService);

  const copyObject = async (from: string, to: string) => {
    const bytes = await storage.readCapped(from, MAX_IMAGE_BYTES);
    if (bytes === undefined || bytes === 'too_large') throw new Error(`Cannot read ${from}`);
    await storage.put(to, bytes, 'image/jpeg');
  };

  // Clear the old samples and their images first, so a rerun never leaves two of the same person.
  const old = await db.select({ id: profile.id }).from(profile).where(and(eq(profile.ownerRef, SAMPLE_OWNER.ref), eq(profile.judgeSample, true)));
  for (const { id } of old) {
    await storage.deletePrefix(`photos/${id}/`);
    await storage.deletePrefix(`renders/${id}/`);
  }
  if (old.length > 0) await db.delete(profile).where(inArray(profile.id, old.map((o) => o.id)));

  for (const sourceId of sources) {
    const [src] = await db.select().from(profile).where(eq(profile.id, sourceId));
    if (!src) throw new Error(`No profile ${sourceId}`);
    const profileId = randomUUID();
    const offered = new Set(Object.values(templates[templateKeySchema.parse(src.templateKey)].strategies).flat());
    const dropped = new Set<string>(); // render tools no longer offered, so their trace lines go too
    const ids = new Map<string, string>(); // old id -> new id, for the card's references
    const mapId = (old: string) => {
      const found = ids.get(old);
      if (found) return found;
      const fresh = randomUUID();
      ids.set(old, fresh);
      return fresh;
    };

    await db.insert(profile).values({ ...src, id: profileId, ownerRef: SAMPLE_OWNER.ref, judgeSample: true, createdAt: new Date() });
    for (const g of await db.select().from(garment).where(eq(garment.profileId, sourceId))) {
      await db.insert(garment).values({ profileId, catalogSku: g.catalogSku, savedAt: g.savedAt });
    }

    const snaps = await db.select().from(snapshot).where(eq(snapshot.profileId, sourceId)).orderBy(asc(snapshot.createdAt));
    const takenAt = new Map<string, Date>();
    for (const [i, snap] of snaps.entries()) {
      const day = new Date(Date.now() - (snaps.length - 1 - i) * 14 * DAY_MS);
      takenAt.set(snap.id, new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 9)));
    }

    const measuredAt = new Map<string, string>(); // old measurement id -> new date, for "measured on" lines
    for (const snap of snaps) {
      const when = takenAt.get(snap.id) as Date;
      const snapshotId = mapId(snap.id);
      await db.insert(snapshot).values({ ...snap, id: snapshotId, profileId, takenAt: when, createdAt: when });

      for (const p of await db.select().from(photo).where(eq(photo.snapshotId, snap.id))) {
        const objectKey = `photos/${profileId}/${snapshotId}/${p.kind}.jpg`;
        await copyObject(p.objectKey, objectKey);
        await db.insert(photo).values({ ...p, id: randomUUID(), snapshotId, objectKey, expiresAt: FAR(), createdAt: when });
      }
      for (const r of await db.select().from(selfReport).where(eq(selfReport.snapshotId, snap.id))) {
        await db.insert(selfReport).values({ ...r, id: randomUUID(), snapshotId, createdAt: when });
      }
      for (const m of await db.select().from(measurement).where(eq(measurement.snapshotId, snap.id))) {
        measuredAt.set(m.id, when.toISOString());
        await db.insert(measurement).values({ ...m, id: mapId(m.id), snapshotId, youcamTaskId: null, createdAt: when });
      }
      for (const r of await db.select().from(render).where(eq(render.snapshotId, snap.id))) {
        if (r.strategy && !offered.has(r.strategy)) {
          dropped.add(r.tool);
          continue;
        }
        const renderId = mapId(r.id);
        const objectKey = r.objectKey ? `renders/${profileId}/${snapshotId}/${renderId}.jpg` : null;
        if (r.objectKey && objectKey) await copyObject(r.objectKey, objectKey);
        await db.insert(render).values({ ...r, id: renderId, snapshotId, objectKey, expiresAt: FAR(), createdAt: when });
      }

      for (const r of await db.select().from(run).where(eq(run.snapshotId, snap.id))) {
        const runId = mapId(r.id);
        await db.insert(run).values({ ...r, id: runId, snapshotId, sourceHash: null, createdAt: when });
        const shown = (line: { step: string; tool: string | null }) => !(line.step === 'act' && line.tool !== null && dropped.has(line.tool));
        for (const t of (await db.select().from(traceEntry).where(eq(traceEntry.runId, r.id))).filter(shown)) {
          await db.insert(traceEntry).values({ ...t, id: randomUUID(), runId, createdAt: when });
        }
        for (const c of await db.select().from(stageCard).where(eq(stageCard.runId, r.id))) {
          // Every id in the card is swapped for its copy's, then the dates follow the new timeline.
          let text = JSON.stringify(c.card);
          for (const [oldId, newId] of ids) text = text.replaceAll(oldId, newId);
          const card = stageCardSchema.parse(JSON.parse(text));
          const dated = {
            ...card,
            takenAt: when.toISOString(),
            options: card.options.filter((option) => offered.has(option.strategy)),
            trace: card.trace.filter(shown),
            changes: card.changes.map((change) => {
              const oldId = [...ids].find(([, fresh]) => fresh === change.measurementId)?.[0];
              return { ...change, measuredAt: (oldId && measuredAt.get(oldId)) || when.toISOString() };
            }),
          };
          await db.insert(stageCard).values({ runId, profileId, card: dated, approvedAt: null, createdAt: when });
        }
      }
    }
    console.log(`copied ${sourceId} -> ${profileId} (${src.templateKey}, ${snaps.length} check ins)`);
  }
  await app.close();
}

void main();
