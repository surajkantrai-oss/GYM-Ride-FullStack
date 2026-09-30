/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../common/types/auth-user';
import { MemberFinanceListDto, RecordMemberPaymentDto, ReverseMemberPaymentDto } from './gym-os-member-finance.dto';
import { GymOsMemberFinanceService } from './gym-os-member-finance.service';

@ApiTags('Partner GymOS Member Finance') @ApiBearerAuth() @UseGuards(JwtAuthGuard,RolesGuard)
@Roles(RoleName.GYM_OWNER,RoleName.GYM_MANAGER,RoleName.GYM_STAFF)
@Controller('partner/gyms/:gymId/gym-os')
export class PartnerGymOsMemberFinanceController {
 constructor(private readonly service:GymOsMemberFinanceService){}
 @Get('payments/summary') @ApiOperation({summary:'Gym-local member collections and dues summary'}) summary(@CurrentUser()u:AuthUser,@Param('gymId',ParseUUIDPipe)g:string){return this.service.summary(u,g);}
 @Get('charges') @ApiOperation({summary:'Paginated membership charges and derived dues'}) charges(@CurrentUser()u:AuthUser,@Param('gymId',ParseUUIDPipe)g:string,@Query()q:MemberFinanceListDto){return this.service.charges(u,g,q);}
 @Get('payments') @ApiOperation({summary:'Paginated immutable member payments'}) payments(@CurrentUser()u:AuthUser,@Param('gymId',ParseUUIDPipe)g:string,@Query()q:MemberFinanceListDto){return this.service.payments(u,g,q);}
 @Post('payments') @ApiOperation({summary:'Record and allocate a manual payment; Idempotency-Key required'}) record(@CurrentUser()u:AuthUser,@Param('gymId',ParseUUIDPipe)g:string,@Headers('idempotency-key')k:string,@Body()d:RecordMemberPaymentDto){return this.service.record(u,g,k,d);}
 @Post('payments/:paymentId/reverse') @ApiOperation({summary:'Reverse a payment without deleting its history'}) reverse(@CurrentUser()u:AuthUser,@Param('gymId',ParseUUIDPipe)g:string,@Param('paymentId',ParseUUIDPipe)p:string,@Body()d:ReverseMemberPaymentDto){return this.service.reverse(u,g,p,d.reason);}
 @Get('members/:memberId/finance') member(@CurrentUser()u:AuthUser,@Param('gymId',ParseUUIDPipe)g:string,@Param('memberId',ParseUUIDPipe)m:string){return this.service.member(u,g,m);}
 @Get('receipts/:receiptId') receipt(@CurrentUser()u:AuthUser,@Param('gymId',ParseUUIDPipe)g:string,@Param('receiptId',ParseUUIDPipe)r:string){return this.service.receipt(u,g,r);}
}

@ApiTags('Admin GymOS Member Finance') @ApiBearerAuth() @UseGuards(JwtAuthGuard,RolesGuard)
@Roles(RoleName.ADMIN,RoleName.SUPER_ADMIN) @Controller('admin/gym-os/finance')
export class AdminGymOsMemberFinanceController {
 constructor(private readonly service:GymOsMemberFinanceService){}
 @Get('charges') charges(@Query()q:MemberFinanceListDto){return this.service.adminCharges(q);}
 @Get('payments') payments(@Query()q:MemberFinanceListDto){return this.service.adminPayments(q);}
 @Get('summary') summary(@Query('gymId',ParseUUIDPipe)g:string){return this.service.adminSummary(g);}
 @Get('reconciliation') reconciliation(@Query('gymId')g?:string){return this.service.reconcile(g);}
}
