import { IsBoolean, IsIn, IsISO8601, IsInt, IsOptional, Min } from 'class-validator';

export class PlaceOrderDto {
  @IsInt()
  petId!: number;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsISO8601()
  shipDate?: string;

  @IsOptional()
  @IsIn(['placed', 'approved', 'delivered'])
  status?: 'placed' | 'approved' | 'delivered';

  @IsOptional()
  @IsBoolean()
  complete?: boolean;
}
