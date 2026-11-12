import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiKeyGuard } from '../security/api-key.guard';
import { ApiResponseDto } from './dto/api-response.dto';
import { CreatePetDto } from './dto/create-pet.dto';
import { FindPetsByStatusQueryDto, FindPetsByTagsQueryDto } from './dto/find-pets-query.dto';
import { PetResponseDto } from './dto/pet-response.dto';
import { UpdatePetFormQueryDto } from './dto/update-pet-form-query.dto';
import { UpdatePetDto } from './dto/update-pet.dto';
import { UploadImageQueryDto } from './dto/upload-image-query.dto';
import { PetService } from './pet.service';

@Controller('pet')
@UseGuards(ApiKeyGuard)
export class PetController {
  constructor(private readonly petService: PetService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async addPet(@Body() dto: CreatePetDto): Promise<PetResponseDto> {
    return this.petService.create(dto);
  }

  @Put()
  async updatePet(@Body() dto: UpdatePetDto): Promise<PetResponseDto> {
    return this.petService.update(dto);
  }

  // Must be registered before `:petId` — otherwise "findByStatus"/"findByTags"
  // would be matched as a petId value.
  @Get('findByStatus')
  async findPetsByStatus(@Query() query: FindPetsByStatusQueryDto): Promise<PetResponseDto[]> {
    return this.petService.findByStatus(query.status);
  }

  @Get('findByTags')
  async findPetsByTags(@Query() query: FindPetsByTagsQueryDto): Promise<PetResponseDto[]> {
    return this.petService.findByTags(query.tags);
  }

  @Post(':petId')
  async updatePetWithForm(
    @Param('petId', ParseIntPipe) petId: number,
    @Query() query: UpdatePetFormQueryDto,
  ): Promise<PetResponseDto> {
    return this.petService.updateFromForm(petId, query);
  }

  @Post(':petId/uploadImage')
  @HttpCode(HttpStatus.OK)
  async uploadFile(
    @Param('petId', ParseIntPipe) petId: number,
    @Query() query: UploadImageQueryDto,
    @Req() req: Request,
  ): Promise<ApiResponseDto> {
    const url = await this.petService.uploadImage(petId, req.body as Buffer, query.additionalMetadata);
    return { code: HttpStatus.OK, type: 'success', message: `Image uploaded for pet ${petId}: ${url}` };
  }

  @Get(':petId')
  async getPetById(@Param('petId', ParseIntPipe) petId: number): Promise<PetResponseDto> {
    return this.petService.getById(petId);
  }

  @Delete(':petId')
  async deletePet(@Param('petId', ParseIntPipe) petId: number): Promise<void> {
    await this.petService.delete(petId);
  }
}
