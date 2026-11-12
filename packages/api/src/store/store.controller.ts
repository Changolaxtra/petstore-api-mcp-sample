import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiKeyGuard } from '../security/api-key.guard';
import { OrderResponseDto } from './dto/order-response.dto';
import { PlaceOrderDto } from './dto/place-order.dto';
import { StoreService } from './store.service';

@Controller('store')
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  @Get('inventory')
  @UseGuards(ApiKeyGuard)
  async getInventory(): Promise<Record<string, number>> {
    return this.storeService.getInventory();
  }

  @Post('order')
  @HttpCode(HttpStatus.OK)
  async placeOrder(@Body() dto: PlaceOrderDto): Promise<OrderResponseDto> {
    return this.storeService.placeOrder(dto);
  }

  @Get('order/:orderId')
  async getOrderById(@Param('orderId', ParseIntPipe) orderId: number): Promise<OrderResponseDto> {
    return this.storeService.getById(orderId);
  }

  @Delete('order/:orderId')
  async deleteOrder(@Param('orderId', ParseIntPipe) orderId: number): Promise<void> {
    await this.storeService.delete(orderId);
  }
}
