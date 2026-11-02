import {
  addStylePhotoSchema,
  createStyleRequestSchema,
  createStyleUploadsSchema,
  type AddStylePhotoInput,
  type CreateStyleRequestInput,
  type CreateStyleUploadsInput,
} from '@interim/types';
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { CurrentOwner, OwnerGuard } from '../guard/owner.guard';
import type { Owner } from '../guard/owner.service';
import { hashToken } from '../guard/token';
import { ZodPipe } from '../guard/zod.pipe';
import { StyleService } from './style.service';

const idPipe = new ZodPipe(z.string().uuid());

/** Style photos, preview requests and saved previews (docs/architecture.md, HTTP API). */
@UseGuards(OwnerGuard)
@Controller()
export class StyleController {
  constructor(@Inject(StyleService) private readonly style: StyleService) {}

  @Post('profiles/:id/style/uploads')
  createUploads(
    @Param('id', idPipe) id: string,
    @Body(new ZodPipe(createStyleUploadsSchema)) body: CreateStyleUploadsInput,
    @CurrentOwner() owner: Owner,
  ) {
    return this.style.createUploads(id, owner, body);
  }

  @Post('profiles/:id/style/photos')
  addPhoto(
    @Param('id', idPipe) id: string,
    @Body(new ZodPipe(addStylePhotoSchema)) body: AddStylePhotoInput,
    @CurrentOwner() owner: Owner,
  ) {
    return this.style.addPhoto(id, owner, body);
  }

  @Get('profiles/:id/style/photos')
  photos(@Param('id', idPipe) id: string, @CurrentOwner() owner: Owner) {
    return this.style.photos(id, owner);
  }

  @HttpCode(204)
  @Delete('profiles/:id/style/photos/:photoId')
  removePhoto(@Param('id', idPipe) id: string, @Param('photoId', idPipe) photoId: string, @CurrentOwner() owner: Owner) {
    return this.style.removePhoto(id, photoId, owner);
  }

  @Post('profiles/:id/style/requests')
  createRequest(
    @Param('id', idPipe) id: string,
    @Body(new ZodPipe(createStyleRequestSchema)) body: CreateStyleRequestInput,
    @CurrentOwner() owner: Owner,
    @Req() req: Request,
  ) {
    // The address is hashed before it is stored, so the per source cap holds no address.
    return this.style.createRequest(id, owner, body, hashToken(env.SESSION_SECRET, `source:${req.ip ?? 'unknown'}`));
  }

  @Get('profiles/:id/style/saved')
  saved(@Param('id', idPipe) id: string, @CurrentOwner() owner: Owner) {
    return this.style.saved(id, owner);
  }

  @Get('style/requests/:id')
  request(@Param('id', idPipe) id: string, @CurrentOwner() owner: Owner) {
    return this.style.request(id, owner);
  }

  @HttpCode(204)
  @Put('style/previews/:id/saved')
  save(@Param('id', idPipe) id: string, @CurrentOwner() owner: Owner) {
    return this.style.setSaved(id, owner, true);
  }

  @HttpCode(204)
  @Delete('style/previews/:id/saved')
  unsave(@Param('id', idPipe) id: string, @CurrentOwner() owner: Owner) {
    return this.style.setSaved(id, owner, false);
  }
}
