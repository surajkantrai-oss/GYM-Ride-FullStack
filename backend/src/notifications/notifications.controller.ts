import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../common/types/auth-user';
import { NotificationListDto, NotificationPreferenceDto, RegisterPushDeviceDto } from './notifications.dto';
import { NotificationsService } from './notifications.service';

const notificationSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    type: { type: 'string' }, category: { type: 'string' },
    title: { type: 'string' }, body: { type: 'string' }, data: { type: 'object', nullable: true },
    readAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

const notificationListSchema = {
  type: 'object',
  properties: {
    data: { type: 'array', items: notificationSchema },
    meta: { type: 'object', properties: { page: { type: 'integer' }, limit: { type: 'integer' }, total: { type: 'integer' }, totalPages: { type: 'integer' } } },
  },
};

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.CUSTOMER, RoleName.GYM_OWNER, RoleName.GYM_MANAGER, RoleName.ADMIN, RoleName.SUPER_ADMIN)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List my in-app notifications, newest first' })
  @ApiResponse({ status: 200, schema: notificationListSchema })
  list(@CurrentUser() user: AuthUser, @Query() query: NotificationListDto): Promise<unknown> {
    return this.notifications.list(user.id, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Authoritative unread notification count' })
  @ApiResponse({ status: 200, schema: { type: 'object', properties: { count: { type: 'integer' } } } })
  unread(@CurrentUser() user: AuthUser): Promise<unknown> {
    return this.notifications.unreadCount(user.id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one owned notification read; repeat calls are safe' })
  @ApiResponse({ status: 200, schema: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, readAt: { type: 'string', format: 'date-time' } } } })
  @ApiResponse({ status: 404, description: 'Notification not found or not owned' })
  read(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<unknown> {
    return this.notifications.read(user.id, id);
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark all my notifications read' })
  @ApiResponse({ status: 200, schema: { type: 'object', properties: { updated: { type: 'integer' } } } })
  readAll(@CurrentUser() user: AuthUser): Promise<unknown> {
    return this.notifications.readAll(user.id);
  }

  @Get('preferences')
  @ApiOperation({ summary: 'My notification preferences; marketing defaults off' })
  @ApiResponse({ status: 200, schema: { type: 'array', items: { type: 'object', properties: { category: { type: 'string' }, inAppEnabled: { type: 'boolean' }, pushEnabled: { type: 'boolean' } } } } })
  preferences(@CurrentUser() user: AuthUser): Promise<unknown> {
    return this.notifications.preferences(user.id);
  }

  @Patch('preferences')
  @ApiOperation({ summary: 'Update one category; transactional in-app notices remain enabled' })
  @ApiResponse({ status: 200, schema: { type: 'object', properties: { category: { type: 'string' }, inAppEnabled: { type: 'boolean' }, pushEnabled: { type: 'boolean' } } } })
  @ApiResponse({ status: 400, description: 'Preference payload invalid or transactional in-app delivery disabled' })
  updatePreference(@CurrentUser() user: AuthUser, @Body() input: NotificationPreferenceDto): Promise<unknown> {
    return this.notifications.updatePreference(user.id, input);
  }

  @Post('devices')
  @ApiOperation({ summary: 'Register or rotate my Expo push token; response omits token' })
  @ApiResponse({ status: 201, schema: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, platform: { type: 'string' }, provider: { type: 'string' }, enabled: { type: 'boolean' } } } })
  @ApiResponse({ status: 400, description: 'Invalid platform or Expo token' })
  @ApiResponse({ status: 404, description: 'Rotation device ID not found or not owned' })
  @ApiResponse({ status: 409, description: 'Token conflicts with another device record' })
  registerDevice(@CurrentUser() user: AuthUser, @Body() input: RegisterPushDeviceDto): Promise<unknown> {
    return this.notifications.registerDevice(user.id, user.sessionId, input);
  }

  @Delete('devices/:id')
  @ApiOperation({ summary: 'Disable my push device, normally during logout' })
  @ApiResponse({ status: 200, schema: { type: 'object', properties: { disabled: { type: 'boolean' } } } })
  @ApiResponse({ status: 404, description: 'Device not found or not owned' })
  unregisterDevice(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<unknown> {
    return this.notifications.unregisterDevice(user.id, id);
  }
}
