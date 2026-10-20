import { createSnapshotSchema, createUploadsSchema } from '@interim/types';
import type { CreateSnapshotInput, CreateUploadsInput } from '@interim/types';
import { Body, Controller, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CurrentOwner, OwnerGuard } from '../guard/owner.guard';
import type { Owner } from '../guard/owner.service';
import { ZodPipe } from '../guard/zod.pipe';
import { SnapshotsService } from './snapshots.service';

const idPipe = new ZodPipe(z.string().uuid());

@UseGuards(OwnerGuard)
@Controller('profiles/:id')
export class SnapshotsController {
  constructor(@Inject(SnapshotsService) private readonly snapshots: SnapshotsService) {}

  @Post('uploads')
  createUploads(
    @Param('id', idPipe) id: string,
    @Body(new ZodPipe(createUploadsSchema)) body: CreateUploadsInput,
    @CurrentOwner() owner: Owner,
  ) {
    return this.snapshots.createUploads(id, owner, body);
  }

  @Post('snapshots')
  create(
    @Param('id', idPipe) id: string,
    @Body(new ZodPipe(createSnapshotSchema)) body: CreateSnapshotInput,
    @CurrentOwner() owner: Owner,
  ) {
    return this.snapshots.create(id, owner, body);
  }
}
