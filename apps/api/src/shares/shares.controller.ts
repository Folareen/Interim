import { Controller, Delete, Get, Header, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CurrentOwner, OwnerGuard } from '../guard/owner.guard';
import type { Owner } from '../guard/owner.service';
import { ZodPipe } from '../guard/zod.pipe';
import { SharesService } from './shares.service';

const idPipe = new ZodPipe(z.string().uuid());
const tokenPipe = new ZodPipe(z.string().min(20).max(200));

@Controller()
export class SharesController {
  constructor(@Inject(SharesService) private readonly shares: SharesService) {}

  @UseGuards(OwnerGuard)
  @Post('cards/:id/share')
  create(@Param('id', idPipe) id: string, @CurrentOwner() owner: Owner) {
    return this.shares.create(id, owner);
  }

  @UseGuards(OwnerGuard)
  @Get('cards/:id/shares')
  list(@Param('id', idPipe) id: string, @CurrentOwner() owner: Owner) {
    return this.shares.list(id, owner);
  }

  @UseGuards(OwnerGuard)
  @HttpCode(204)
  @Delete('shares/:id')
  revoke(@Param('id', idPipe) id: string, @CurrentOwner() owner: Owner) {
    return this.shares.revoke(id, owner);
  }

  /** Signed out on purpose: the token in the address is the only credential. */
  @Header('X-Robots-Tag', 'noindex, nofollow')
  @Header('Cache-Control', 'no-store')
  @Get('shared/:token')
  view(@Param('token', tokenPipe) token: string) {
    return this.shares.view(token);
  }
}
