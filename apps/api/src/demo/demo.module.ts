import { Module } from '@nestjs/common';
import { RunsModule } from '../runs/runs.module';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';

@Module({ imports: [RunsModule], controllers: [DemoController], providers: [DemoService] })
export class DemoModule {}
