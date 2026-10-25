import { consentRequestSchema, createProfileSchema, preferencesSchema, wordsQuerySchema } from '@interim/types';
import type { ConsentRequest, CreateProfileInput, Preferences, WordsQuery } from '@interim/types';
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentOwner, OwnerGuard } from '../guard/owner.guard';
import type { Owner } from '../guard/owner.service';
import { ZodPipe } from '../guard/zod.pipe';
import { ReflectionsService } from '../reflections/reflections.service';
import { ProfilesService } from './profiles.service';

const idPipe = new ZodPipe(z.string().uuid());

@Controller('profiles')
export class ProfilesController {
  constructor(
    @Inject(ProfilesService) private readonly profiles: ProfilesService,
    @Inject(ReflectionsService) private readonly reflections: ReflectionsService,
  ) {}

  @UseGuards(OwnerGuard)
  @Post()
  create(@Body(new ZodPipe(createProfileSchema)) body: CreateProfileInput, @CurrentOwner() owner: Owner) {
    return this.profiles.create(owner, body);
  }

  @UseGuards(OwnerGuard)
  @Get()
  list(@CurrentOwner() owner: Owner) {
    return this.profiles.list(owner);
  }

  @UseGuards(OwnerGuard)
  @Get(':id')
  get(@Param('id', idPipe) id: string, @CurrentOwner() owner: Owner) {
    return this.profiles.get(id, owner);
  }

  @UseGuards(OwnerGuard)
  @HttpCode(200)
  @Post(':id/consent')
  consent(
    @Param('id', idPipe) id: string,
    @Body(new ZodPipe(consentRequestSchema)) body: ConsentRequest,
    @CurrentOwner() owner: Owner,
  ) {
    return this.profiles.consent(id, owner, body);
  }

  @UseGuards(OwnerGuard)
  @Get(':id/preferences')
  preferences(@Param('id', idPipe) id: string, @CurrentOwner() owner: Owner) {
    return this.profiles.preferences(id, owner);
  }

  @UseGuards(OwnerGuard)
  @Put(':id/preferences')
  setPreferences(
    @Param('id', idPipe) id: string,
    @Body(new ZodPipe(preferencesSchema)) body: Preferences,
    @CurrentOwner() owner: Owner,
  ) {
    return this.profiles.setPreferences(id, owner, body);
  }

  @UseGuards(OwnerGuard)
  @Get(':id/words')
  words(
    @Param('id', idPipe) id: string,
    @Query(new ZodPipe(wordsQuerySchema)) query: WordsQuery,
    @CurrentOwner() owner: Owner,
  ) {
    return this.profiles.words(id, owner, query.date);
  }

  @UseGuards(OwnerGuard)
  @HttpCode(204)
  @Delete(':id')
  remove(@Param('id', idPipe) id: string, @CurrentOwner() owner: Owner) {
    return this.profiles.remove(id, owner);
  }

  @UseGuards(OwnerGuard)
  @Get(':id/export')
  async export(@Param('id', idPipe) id: string, @CurrentOwner() owner: Owner) {
    const exported = await this.profiles.export(id, owner);
    return { ...exported, reflections: await this.reflections.forExport(id, owner) };
  }

  /** The same export as a file the person keeps, with the render images inside. */
  @UseGuards(OwnerGuard)
  @Header('Content-Type', 'application/zip')
  @Header('Content-Disposition', 'attachment; filename="interim-export.zip"')
  @Header('Cache-Control', 'no-store')
  @Get(':id/export.zip')
  async exportFile(@Param('id', idPipe) id: string, @CurrentOwner() owner: Owner) {
    const reflections = await this.reflections.forExport(id, owner);
    return new StreamableFile(await this.profiles.archive(id, owner, { reflections }));
  }
}
