import { IsOptional, IsString } from 'class-validator';

export class UploadImageQueryDto {
  @IsOptional()
  @IsString()
  additionalMetadata?: string;
}
