import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { CategoryInputDto, TagInputDto } from './create-pet.dto';

export class UpdatePetDto {
  @IsInt()
  id!: number;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  photoUrls!: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => CategoryInputDto)
  category?: CategoryInputDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TagInputDto)
  tags?: TagInputDto[];

  @IsOptional()
  @IsIn(['available', 'pending', 'sold'])
  status?: 'available' | 'pending' | 'sold';
}
