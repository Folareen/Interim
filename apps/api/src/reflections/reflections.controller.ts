import { createReflectionSchema } from '@interim/types';
import type { CreateReflectionInput } from '@interim/types';
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CurrentOwner, OwnerGuard } from '../guard/owner.guard';
import type { Owner } from '../guard/owner.service';
import { ZodPipe } from '../guard/zod.pipe';
import { ReflectionsService } from './reflections.service';

const idPipe = new ZodPipe(z.string().uuid());

@Controller('profiles/:id/reflections')
@UseGuards(OwnerGuard)
export class ReflectionsController {
  constructor(@Inject(ReflectionsService) private readonly reflections: ReflectionsService) {}

  @Get()
  list(@Param('id', idPipe) id: string, @CurrentOwner() owner: Owner) {
    return this.reflections.list(id, owner);
  }

  @Post()
  create(
    @Param('id', idPipe) id: string,
    @Body(new ZodPipe(createReflectionSchema)) body: CreateReflectionInput,
    @CurrentOwner() owner: Owner,
  ) {
    return this.reflections.create(id, owner, body.text);
  }

  @HttpCode(204)
  @Post('contacts/dismiss')
  dismiss(@Param('id', idPipe) id: string, @CurrentOwner() owner: Owner) {
    return this.reflections.dismissContacts(id, owner);
  }

  @HttpCode(204)
  @Delete(':reflectionId')
  remove(@Param('id', idPipe) id: string, @Param('reflectionId', idPipe) reflectionId: string, @CurrentOwner() owner: Owner) {
    return this.reflections.remove(id, reflectionId, owner);
  }
}
