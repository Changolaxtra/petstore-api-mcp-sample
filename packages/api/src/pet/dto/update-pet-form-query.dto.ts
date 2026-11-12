import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdatePetFormQueryDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['available', 'pending', 'sold'])
  status?: 'available' | 'pending' | 'sold';
}
