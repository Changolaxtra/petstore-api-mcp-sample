import { Injectable, NotFoundException } from '@nestjs/common';
import type { PlaceOrderDto } from './dto/place-order.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { OrderRepository } from './store.repository';

const FOREIGN_KEY_VIOLATION = '23503';

function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === FOREIGN_KEY_VIOLATION
  );
}

@Injectable()
export class StoreService {
  constructor(private readonly orderRepository: OrderRepository) {}

  async placeOrder(dto: PlaceOrderDto): Promise<OrderResponseDto> {
    try {
      const order = await this.orderRepository.create({
        pet_id: dto.petId,
        quantity: dto.quantity,
        ship_date: dto.shipDate ? new Date(dto.shipDate) : null,
        status: dto.status ?? 'placed',
        complete: dto.complete ?? false,
      });
      return OrderResponseDto.fromRow(order);
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new NotFoundException(`Pet ${dto.petId} not found`);
      }
      throw error;
    }
  }

  async getById(id: number): Promise<OrderResponseDto> {
    const order = await this.orderRepository.findById(id);
    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }
    return OrderResponseDto.fromRow(order);
  }

  async delete(id: number): Promise<void> {
    const deleted = await this.orderRepository.delete(id);
    if (!deleted) {
      throw new NotFoundException(`Order ${id} not found`);
    }
  }

  async getInventory(): Promise<Record<string, number>> {
    return this.orderRepository.getInventory();
  }
}
