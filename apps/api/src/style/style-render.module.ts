import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module';
import { YoucamModule } from '../youcam/youcam.module';
import { StyleRenderService } from './style-render.service';

/** The worker half of style previews, kept apart from the HTTP half so the runs module can import it. */
@Module({
  imports: [YoucamModule, LedgerModule],
  providers: [StyleRenderService],
  exports: [StyleRenderService],
})
export class StyleRenderModule {}
