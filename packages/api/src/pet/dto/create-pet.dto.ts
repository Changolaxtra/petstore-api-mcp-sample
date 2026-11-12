import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class CategoryInputDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}

export class TagInputDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}

export class CreatePetDto {
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
