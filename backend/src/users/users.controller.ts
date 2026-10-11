import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthUser } from '../common/types/auth-user';
import { UpdateProfileDto } from './users.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Get('me') me(@CurrentUser() user: AuthUser): Promise<unknown> {
    return this.users.me(user.id);
  }
  @Patch('me') update(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<unknown> {
    return this.users.update(user.id, dto);
  }
  @Post('me/photo')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  photo(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<unknown> {
    return this.users.updatePhoto(user.id, file);
  }
  @Delete('me/photo')
  @HttpCode(HttpStatus.OK)
  removePhoto(@CurrentUser() user: AuthUser): Promise<unknown> {
    return this.users.removePhoto(user.id);
  }
}
