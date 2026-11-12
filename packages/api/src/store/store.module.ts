import { Module } from '@nestjs/common';
import { OrderRepository } from './store.repository';
import { StoreController } from './store.controller';
import { StoreService } from './store.service';

@Module({
  controllers: [StoreController],
  providers: [OrderRepository, StoreService],
})
export class StoreModule {}
