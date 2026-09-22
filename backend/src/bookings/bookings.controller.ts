import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../common/types/auth-user';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { BookingListDto, CreateBookingDto, ManagedBookingListDto } from './dto/booking.dto';
import { BookingsService } from './bookings.service';

@ApiTags('Bookings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.CUSTOMER)
@Controller('bookings')
export class CustomerBookingsController {
  constructor(private readonly bookings: BookingsService) {}
  @Post() @ApiHeader({ name: 'Idempotency-Key', required: true }) create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateBookingDto,
    @Headers('idempotency-key') key?: string,
  ): Promise<unknown> {
    if (!key || key.length < 8 || key.length > 120)
      throw new DomainException(
        ApiErrorCode.VALIDATION_FAILED,
        'Idempotency-Key must contain 8 to 120 characters',
        HttpStatus.BAD_REQUEST,
      );
    return this.bookings.create(user, dto, key);
  }
  @Get() list(@CurrentUser() user: AuthUser, @Query() query: BookingListDto): Promise<unknown> {
    return this.bookings.listMine(user.id, query);
  }
  @Get(':bookingId') get(
    @CurrentUser() user: AuthUser,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ): Promise<unknown> {
    return this.bookings.getMine(user.id, bookingId);
  }
  @Post(':bookingId/cancel') cancel(
    @CurrentUser() user: AuthUser,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ): Promise<unknown> {
    return this.bookings.cancel(user.id, bookingId);
  }
}

@ApiTags('Partner Bookings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.GYM_OWNER, RoleName.GYM_MANAGER, RoleName.ADMIN, RoleName.SUPER_ADMIN)
@Controller('partner/bookings')
export class PartnerBookingsController {
  constructor(private readonly bookings: BookingsService) {}
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ManagedBookingListDto): Promise<unknown> {
    return this.bookings.listPartner(user, query);
  }
  @Get(':bookingId') get(
    @CurrentUser() user: AuthUser,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ): Promise<unknown> {
    return this.bookings.getPartner(user, bookingId);
  }
}

@ApiTags('Admin Bookings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN)
@Controller('admin/bookings')
export class AdminBookingsController {
  constructor(private readonly bookings: BookingsService) {}
  @Get() list(@Query() query: ManagedBookingListDto): Promise<unknown> {
    return this.bookings.listAdmin(query);
  }
  @Get(':bookingId') get(@Param('bookingId', ParseUUIDPipe) bookingId: string): Promise<unknown> {
    return this.bookings.getAdmin(bookingId);
  }
}
