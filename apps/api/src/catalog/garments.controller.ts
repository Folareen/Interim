import { Controller, Delete, Get, HttpCode, Inject, Param, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CurrentOwner, OwnerGuard } from '../guard/owner.guard';
import type { Owner } from '../guard/owner.service';
import { ZodPipe } from '../guard/zod.pipe';
import { GarmentsService } from './garments.service';

const idPipe = new ZodPipe(z.string().uuid());
const skuPipe = new ZodPipe(z.string().min(1).max(64));

@Controller('profiles/:id/garments')
@UseGuards(OwnerGuard)
export class GarmentsController {
  constructor(@Inject(GarmentsService) private readonly garments: GarmentsService) {}

  @Get()
  list(@Param('id', idPipe) id: string, @CurrentOwner() owner: Owner) {
    return this.garments.list(id, owner);
  }

  @HttpCode(204)
  @Put(':sku')
  save(@Param('id', idPipe) id: string, @Param('sku', skuPipe) sku: string, @CurrentOwner() owner: Owner) {
    return this.garments.save(id, owner, sku);
  }

  @HttpCode(204)
  @Delete(':sku')
  remove(@Param('id', idPipe) id: string, @Param('sku', skuPipe) sku: string, @CurrentOwner() owner: Owner) {
    return this.garments.remove(id, owner, sku);
  }
}
