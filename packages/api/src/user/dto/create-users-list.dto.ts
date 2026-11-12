import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

export class CreateUsersListDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateUserDto)
  users!: CreateUserDto[];
}
