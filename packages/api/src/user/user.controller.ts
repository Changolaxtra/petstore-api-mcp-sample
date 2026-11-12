import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../security/api-key.guard';
import { ApiKeyGuard } from '../security/api-key.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginQueryDto } from './dto/login-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UserService } from './user.service';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async createUser(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    const user = await this.userService.create(dto);
    return UserResponseDto.fromRow(user);
  }

  @Get('login')
  @Header('Content-Type', 'application/json')
  async loginUser(@Query() query: LoginQueryDto): Promise<string> {
    const apiKey = await this.userService.login(query.username, query.password);
    // Nest sends a returned string via res.send(), not res.json(), which
    // would otherwise leave the body unquoted and the content-type as
    // text/html — JSON.stringify + the header above matches the contract's
    // `type: string` schema served as application/json.
    return JSON.stringify(apiKey);
  }

  @Get('logout')
  @UseGuards(ApiKeyGuard)
  async logoutUser(@Req() request: AuthenticatedRequest): Promise<void> {
    await this.userService.logout(request.apiKey);
  }

  @Get(':username')
  @UseGuards(ApiKeyGuard)
  async getUserByName(@Param('username') username: string): Promise<UserResponseDto> {
    const user = await this.userService.getByUsername(username);
    return UserResponseDto.fromRow(user);
  }

  @Put(':username')
  @UseGuards(ApiKeyGuard)
  async updateUser(
    @Param('username') username: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    const user = await this.userService.update(username, dto);
    return UserResponseDto.fromRow(user);
  }

  @Delete(':username')
  @UseGuards(ApiKeyGuard)
  async deleteUser(@Param('username') username: string): Promise<void> {
    await this.userService.delete(username);
  }
}
