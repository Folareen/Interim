import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CurrentOwner, OwnerGuard } from '../guard/owner.guard';
import type { Owner } from '../guard/owner.service';
import { ZodPipe } from '../guard/zod.pipe';
import { LedgerService } from './ledger.service';

@UseGuards(OwnerGuard)
@Controller('profiles/:id/ledger')
export class LedgerController {
  constructor(@Inject(LedgerService) private readonly ledger: LedgerService) {}

  @Get()
  list(@Param('id', new ZodPipe(z.string().uuid())) id: string, @CurrentOwner() owner: Owner) {
    return this.ledger.list(id, owner);
  }
}
