import { Transform } from 'class-transformer';
import { ArrayMinSize, IsArray, IsString } from 'class-validator';

/** Splits the contract's documented "comma separated strings" query value (research.md §6). */
function splitCommaSeparated({ value }: { value: unknown }): string[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
  }
  return [];
}

export class FindPetsByStatusQueryDto {
  @Transform(splitCommaSeparated)
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  status!: string[];
}

export class FindPetsByTagsQueryDto {
  @Transform(splitCommaSeparated)
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  tags!: string[];
}
