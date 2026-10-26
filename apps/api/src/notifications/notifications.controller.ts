import { notificationsQuerySchema, saveNotificationsSchema } from '@interim/types';
import type { NotificationsQuery, PushKey, SaveNotificationsInput } from '@interim/types';
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Put, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CurrentOwner, OwnerGuard } from '../guard/owner.guard';
import type { Owner } from '../guard/owner.service';
import { ZodPipe } from '../guard/zod.pipe';
import { NotificationsService } from './notifications.service';

const idPipe = new ZodPipe(z.string().uuid());
const queryPipe = new ZodPipe(notificationsQuerySchema);

@Controller()
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly notifications: NotificationsService) {}

  /** Public: the key is not secret, and the browser needs it before it can subscribe. */
  @Get('notifications/key')
  key(): PushKey {
    return { publicKey: this.notifications.publicKey() };
  }

  @UseGuards(OwnerGuard)
  @Get('profiles/:id/notifications')
  get(@Param('id', idPipe) id: string, @Query(queryPipe) query: NotificationsQuery, @CurrentOwner() owner: Owner) {
    return this.notifications.get(id, owner, query.endpoint);
  }

  @UseGuards(OwnerGuard)
  @Put('profiles/:id/notifications')
  save(
    @Param('id', idPipe) id: string,
    @Body(new ZodPipe(saveNotificationsSchema)) body: SaveNotificationsInput,
    @CurrentOwner() owner: Owner,
  ) {
    return this.notifications.save(id, owner, body);
  }

  @UseGuards(OwnerGuard)
  @HttpCode(204)
  @Delete('profiles/:id/notifications')
  remove(@Param('id', idPipe) id: string, @Query(queryPipe) query: NotificationsQuery, @CurrentOwner() owner: Owner) {
    return this.notifications.remove(id, owner, query.endpoint);
  }
}
