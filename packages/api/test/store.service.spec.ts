import { NotFoundException } from '@nestjs/common';
import type { PlaceOrderDto } from '../src/store/dto/place-order.dto';
import { OrderRepository, type OrderRow } from '../src/store/store.repository';
import { StoreService } from '../src/store/store.service';

function buildOrderRow(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 1,
    pet_id: 1,
    quantity: 1,
    ship_date: null,
    status: 'placed',
    complete: false,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('StoreService', () => {
  let service: StoreService;
  let repository: jest.Mocked<OrderRepository>;

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      findById: jest.fn(),
      delete: jest.fn(),
      getInventory: jest.fn(),
    } as unknown as jest.Mocked<OrderRepository>;

    service = new StoreService(repository);
  });

  describe('placeOrder', () => {
    const dto: PlaceOrderDto = { petId: 1, quantity: 2 };

    it('creates an order and maps the row to a response', async () => {
      repository.create.mockResolvedValue(buildOrderRow({ quantity: 2 }));

      const result = await service.placeOrder(dto);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ pet_id: 1, quantity: 2 }),
      );
      expect(result.quantity).toBe(2);
    });

    it('throws NotFoundException when the referenced pet does not exist (FK violation)', async () => {
      repository.create.mockRejectedValue({ code: '23503' });
      await expect(service.placeOrder(dto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rethrows an unrelated error', async () => {
      const error = new Error('connection lost');
      repository.create.mockRejectedValue(error);
      await expect(service.placeOrder(dto)).rejects.toBe(error);
    });
  });

  describe('getById', () => {
    it('returns the order when found', async () => {
      repository.findById.mockResolvedValue(buildOrderRow());
      await expect(service.getById(1)).resolves.toMatchObject({ id: 1 });
    });

    it('throws NotFoundException when missing', async () => {
      repository.findById.mockResolvedValue(undefined);
      await expect(service.getById(999)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('delete', () => {
    it('resolves when the order was deleted', async () => {
      repository.delete.mockResolvedValue(true);
      await expect(service.delete(1)).resolves.toBeUndefined();
    });

    it('throws NotFoundException when missing', async () => {
      repository.delete.mockResolvedValue(false);
      await expect(service.delete(999)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getInventory', () => {
    it('delegates to the repository', async () => {
      repository.getInventory.mockResolvedValue({ available: 3, sold: 1 });
      await expect(service.getInventory()).resolves.toEqual({ available: 3, sold: 1 });
    });
  });
});
