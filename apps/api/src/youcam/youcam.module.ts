import { Module } from '@nestjs/common';
import { YoucamClient } from './youcam.client';

@Module({ providers: [YoucamClient], exports: [YoucamClient] })
export class YoucamModule {}
