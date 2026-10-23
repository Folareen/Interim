import { Module } from '@nestjs/common';
import { GuardModule } from '../guard/guard.module';
import { StorageModule } from '../storage/storage.module';
import { CATALOG_IMAGES, CatalogService, catalogImageDir } from './catalog.service';
import { GarmentsController } from './garments.controller';
import { GarmentsService } from './garments.service';

@Module({
  imports: [GuardModule, StorageModule],
  controllers: [GarmentsController],
  providers: [{ provide: CATALOG_IMAGES, useValue: catalogImageDir }, CatalogService, GarmentsService],
})
export class CatalogModule {}
