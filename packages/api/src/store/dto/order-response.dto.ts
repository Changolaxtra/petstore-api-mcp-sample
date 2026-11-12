import type { Selectable } from 'kysely';
import type { StoreOrdersTable } from '../../database/types';

type OrderRow = Selectable<StoreOrdersTable>;

export class OrderResponseDto {
  id!: number;
  petId!: number;
  quantity!: number;
  shipDate!: string | null;
  status!: 'placed' | 'approved' | 'delivered';
  complete!: boolean;

  static fromRow(row: OrderRow): OrderResponseDto {
    const dto = new OrderResponseDto();
    dto.id = row.id;
    dto.petId = row.pet_id;
    dto.quantity = row.quantity;
    dto.shipDate = row.ship_date ? row.ship_date.toISOString() : null;
    dto.status = row.status;
    dto.complete = row.complete;
    return dto;
  }
}
