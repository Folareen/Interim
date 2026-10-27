import { Controller, Get, Header, Inject, Param } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../guard/zod.pipe';
import { DemoService } from './demo.service';

/** Signed out on purpose, and read only: there is no route here that writes or starts a run. */
@Controller('demo')
export class DemoController {
  constructor(@Inject(DemoService) private readonly demo: DemoService) {}

  @Header('Cache-Control', 'no-store')
  @Get()
  list() {
    return this.demo.list();
  }

  @Header('Cache-Control', 'no-store')
  @Get('cards/:id')
  card(@Param('id', new ZodPipe(z.string().uuid())) id: string) {
    return this.demo.card(id);
  }
}
