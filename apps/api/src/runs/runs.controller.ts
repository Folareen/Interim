import { hashToken } from '../guard/token';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { CurrentOwner, OwnerGuard } from '../guard/owner.guard';
import type { Owner } from '../guard/owner.service';
import { ZodPipe } from '../guard/zod.pipe';
import { RunsService } from './runs.service';
import { AssistantService } from '../agent/assistant.service';
import { assistantRequestSchema, type AssistantRequest } from '@interim/types';

const idPipe = new ZodPipe(z.string().uuid());

/** Owned runs, cards, and read-only help. All identifiers are checked against the signed-in account. */
@UseGuards(OwnerGuard)
@Controller()
export class RunsController {
  constructor(
    @Inject(RunsService) private readonly runs: RunsService,
    @Inject(AssistantService) private readonly assistant: AssistantService,
  ) {}

  @Get('assistant/config')
  assistantConfig() {
    return { available: this.assistant.available() };
  }

  @HttpCode(200)
  @Post('cards/:id/assistant')
  ask(
    @Param('id', idPipe) id: string,
    @Body(new ZodPipe(assistantRequestSchema)) body: AssistantRequest,
    @CurrentOwner() owner: Owner,
  ) {
    return this.assistant.ask(id, owner, body);
  }

  @Get('profiles/:id/latest-run')
  latest(@Param('id', idPipe) id: string, @CurrentOwner() owner: Owner) {
    return this.runs.latest(id, owner);
  }

  @Post('snapshots/:id/runs')
  start(@Param('id', idPipe) id: string, @CurrentOwner() owner: Owner, @Req() req: Request) {
    // The address is hashed before it is stored, so the per source cap holds no address.
    return this.runs.start(
      id,
      owner,
      hashToken(env.SESSION_SECRET, `source:${req.ip ?? 'unknown'}`),
    );
  }

  @Get('runs/:id')
  get(@Param('id', idPipe) id: string, @CurrentOwner() owner: Owner) {
    return this.runs.get(id, owner);
  }

  @Sse('runs/:id/events')
  events(@Param('id', idPipe) id: string, @CurrentOwner() owner: Owner) {
    return this.runs.events(id, owner);
  }

  @Get('cards/:id')
  card(@Param('id', idPipe) id: string, @CurrentOwner() owner: Owner) {
    return this.runs.card(id, owner);
  }

  @HttpCode(200)
  @Post('cards/:id/approve')
  approve(@Param('id', idPipe) id: string, @CurrentOwner() owner: Owner) {
    return this.runs.approve(id, owner);
  }

  @Get('profiles/:id/cards')
  cards(@Param('id', idPipe) id: string, @CurrentOwner() owner: Owner) {
    return this.runs.cards(id, owner);
  }
}
