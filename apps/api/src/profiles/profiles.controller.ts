import { consentRequestSchema, createProfileSchema } from '@interim/types';
import type { ConsentRequest, CreateProfileInput } from '@interim/types';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { CurrentOwner, OwnerGuard } from '../guard/owner.guard';
import { type Owner, OwnerService } from '../guard/owner.service';
import { ZodPipe } from '../guard/zod.pipe';
import { ProfilesService } from './profiles.service';

const idPipe = new ZodPipe(z.string().uuid());

@Controller('profiles')
export class ProfilesController {
  constructor(
    @Inject(ProfilesService) private readonly profiles: ProfilesService,
    @Inject(OwnerService) private readonly owners: OwnerService,
  ) {}

  // Open to anyone: a new person has no identity yet, so the first profile mints their cookie.
  @Post()
  create(
    @Body(new ZodPipe(createProfileSchema)) body: CreateProfileInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const owner = this.owners.resolve(req) ?? this.owners.mint(res);
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
  @HttpCode(204)
  @Delete(':id')
  remove(@Param('id', idPipe) id: string, @CurrentOwner() owner: Owner) {
    return this.profiles.remove(id, owner);
  }

  @UseGuards(OwnerGuard)
  @Get(':id/export')
  export(@Param('id', idPipe) id: string, @CurrentOwner() owner: Owner) {
    return this.profiles.export(id, owner);
  }
}
