import { IsNotEmpty, IsString } from 'class-validator';

export class LoginQueryDto {
  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}
