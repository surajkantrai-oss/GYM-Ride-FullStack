import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import {
  FinanceErrors,
  FinanceResponse,
  paymentSchema,
  refundSchema,
  settlementSchema,
  reversalSchema,
  summarySchema,
  listSchema,
  detailSchema,
  reconciliationSchema,
  webhookSchema,
} from './finance-swagger';
import { Request } from 'express';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../common/types/auth-user';
import { ApiErrorCode as E } from '../common/errors/api-error-code';
import {
  FinanceQueryDto,
  ReconciliationQueryDto,
  RefundRequestDto,
  SettlementRequestDto,
  SettlementReversalDto,
  VerifyPaymentDto,
} from './finance.dto';
import { PaymentsService } from './payments.service';
import { RefundsService } from './refunds.service';
import { SettlementsService } from './settlements.service';
import {
  FinanceQueriesService,
  FinanceResource,
  financeResources,
} from './finance-queries.service';
import { ReconciliationService } from './reconciliation.service';
import { financeError } from './finance-policy';

function idempotency(key?: string): string {
  if (!key || key.length < 8 || key.length > 120)
    financeError(E.VALIDATION_FAILED, 'Idempotency-Key must contain 8–120 characters', 400);
  return key;
}
function resource(value: string): FinanceResource {
  if (!financeResources.includes(value as FinanceResource))
    financeError(E.NOT_FOUND, 'Unknown finance resource', 404);
  return value as FinanceResource;
}

@ApiTags('Customer Payments')
@FinanceErrors()
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.CUSTOMER)
@Controller()
export class CustomerPaymentsController {
  constructor(private readonly payments: PaymentsService) {}
  @Post('bookings/:bookingId/payment')
  @FinanceResponse(
    'Create or reuse booking payment order',
    paymentSchema,
    201,
    'Authenticated booking owner only. Booking ID is the idempotency scope. In-flight/uncertain creation returns PAYMENT_ORDER_CREATION_FAILED; never blindly create another provider order.',
  )
  @ApiOperation({
    summary:
      'Create/reuse an order; booking ID is the idempotency scope. Amount is server derived.',
  })
  create(
    @CurrentUser() user: AuthUser,
    @Param('bookingId', ParseUUIDPipe) id: string,
  ): Promise<unknown> {
    return this.payments.createOrder(user.id, id);
  }
  @Post('payments/:paymentId/verify')
  @FinanceResponse(
    'Verify provider payment',
    paymentSchema,
    201,
    'Signature plus independent provider lookup; duplicate valid capture is a safe replay. Captures after expiry are flagged for refund review and do not reclaim capacity.',
  )
  @ApiOperation({
    summary: 'Verify signature and provider capture before atomic booking confirmation',
  })
  verify(
    @CurrentUser() user: AuthUser,
    @Param('paymentId', ParseUUIDPipe) id: string,
    @Body() dto: VerifyPaymentDto,
  ): Promise<unknown> {
    return this.payments.verify(user.id, id, dto.orderId, dto.paymentId, dto.signature);
  }
}

@ApiTags('Payment Webhooks')
@FinanceErrors()
@Controller('webhooks/payments')
export class PaymentWebhooksController {
  constructor(private readonly payments: PaymentsService) {}
  @Post(':provider')
  @FinanceResponse(
    'Provider-facing payment and refund webhooks',
    webhookSchema,
    201,
    'Exact raw-body signature required. Event IDs are unique per provider. Duplicate events are safe; conflicting payload for an existing ID returns FINANCIAL_INTEGRITY_ERROR. Unknown references are retained for reconciliation. Refund status is independently fetched.',
  )
  @ApiParam({ name: 'provider', enum: ['development', 'razorpay'] })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        event: {
          type: 'string',
          enum: [
            'payment.authorized',
            'payment.captured',
            'payment.failed',
            'refund.created',
            'refund.pending',
            'refund.processed',
            'refund.failed',
          ],
        },
        payload: {
          type: 'object',
          description:
            'Provider payment/refund entity; IDs are only lookup hints after signature verification',
        },
      },
    },
  })
  @ApiHeader({ name: 'x-razorpay-signature', required: true })
  @ApiHeader({ name: 'x-razorpay-event-id', required: true })
  @ApiOperation({ summary: 'Signed raw-body provider event; duplicate event IDs are safe' })
  receive(
    @Param('provider') provider: string,
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature = '',
    @Headers('x-razorpay-event-id') eventId = '',
  ): Promise<unknown> {
    if (!request.rawBody) financeError(E.INVALID_PAYMENT_SIGNATURE, 'Raw body required', 400);
    return this.payments.webhook(provider, eventId, request.rawBody, signature);
  }
}

@ApiTags('Admin Finance')
@FinanceErrors()
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN)
@Controller('admin/finance')
export class AdminFinanceController {
  constructor(
    private readonly queries: FinanceQueriesService,
    private readonly payments: PaymentsService,
    private readonly refunds: RefundsService,
    private readonly settlements: SettlementsService,
    private readonly reconciliation: ReconciliationService,
  ) {}
  @Get('summary')
  @FinanceResponse('Platform financial aggregates', summarySchema)
  summary(@Query() q: FinanceQueryDto): Promise<unknown> {
    return this.queries.summary(q);
  }
  @Get('reconciliation')
  @FinanceResponse(
    'Read-only financial integrity scan',
    reconciliationSchema,
    200,
    'Repeatable-read database snapshot. Up to 500 payments; pass nextCursor as after. Ancillary scans may be truncated; no historical data is repaired automatically.',
  )
  reconcile(@Query() q: ReconciliationQueryDto): Promise<unknown> {
    return this.reconciliation.inspect(q.after, q.afterSettlement);
  }
  @Post('refunds')
  @FinanceResponse(
    'Request full or partial refund',
    refundSchema,
    201,
    'Idempotency-Key required: same key/payment/amount/reason/actor returns original result; conflicting inputs return IDEMPOTENCY_KEY_CONFLICT. Pending amounts reserve captured balance. Uncertain results remain PROCESSING for reconciliation.',
  )
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  refund(
    @CurrentUser() user: AuthUser,
    @Body() dto: RefundRequestDto,
    @Headers('idempotency-key') key?: string,
  ): Promise<unknown> {
    return this.refunds.request(
      user.id,
      dto.paymentId,
      dto.amount,
      dto.reason,
      idempotency(key),
      dto.override,
    );
  }
  @Post('refunds/:id/reconcile')
  @FinanceResponse('Fetch authoritative refund status and apply once', refundSchema, 201)
  refundStatus(@Param('id', ParseUUIDPipe) id: string): Promise<unknown> {
    return this.refunds.reconcile(id);
  }
  @Post('settlements')
  @FinanceResponse(
    'Generate auditable settlement batch',
    settlementSchema,
    201,
    'Idempotency-Key required; same gym/period safely replays, conflicting inputs fail. Closed half-open period [start,end), maximum 1000 eligible earnings per batch. Allocated/reversed-held earnings cannot be selected again.',
  )
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  generate(
    @CurrentUser() user: AuthUser,
    @Body() dto: SettlementRequestDto,
    @Headers('idempotency-key') key?: string,
  ): Promise<unknown> {
    return this.settlements.generate(
      user.id,
      dto.gymId,
      new Date(dto.start),
      new Date(dto.end),
      idempotency(key),
    );
  }
  @Post('settlements/:id/process')
  @FinanceResponse(
    'Process simulated settlement payout',
    settlementSchema,
    201,
    'Settlement ID is the idempotency scope. Development payout is simulated, never a real bank transfer. Real payout provider is not configured.',
  )
  process(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<unknown> {
    return this.settlements.process(user.id, id);
  }
  @Post('settlements/:id/reverse')
  @FinanceResponse(
    'Record paid settlement reversal',
    reversalSchema,
    201,
    'Admin-only accounting correction; does not recover bank funds. Same key/settlement/reason/actor replays. Compensating entry restores liability; immutable allocations remain on payout hold.',
  )
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({
    summary:
      'Reverse paid settlement accounting with an immutable compensating entry; keeps earnings on payout hold',
  })
  reverse(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SettlementReversalDto,
    @Headers('idempotency-key') key?: string,
  ): Promise<unknown> {
    return this.settlements.reverse(user.id, id, dto.reason, idempotency(key));
  }
  @Post('payments/:id/simulate')
  @FinanceResponse('Simulate development capture', paymentSchema, 201)
  @ApiOperation({ summary: 'Development-only simulated capture; no external money movement' })
  simulate(@Param('id', ParseUUIDPipe) id: string): Promise<unknown> {
    return this.payments.simulate(id);
  }
  @Get(':resource')
  @FinanceResponse('List platform finance records', listSchema)
  @ApiParam({ name: 'resource', enum: [...financeResources] })
  list(@Param('resource') name: string, @Query() q: FinanceQueryDto): Promise<unknown> {
    return this.queries.list(resource(name), q);
  }
  @Get(':resource/:id')
  @FinanceResponse('Financial record details', detailSchema)
  @ApiParam({ name: 'resource', enum: ['payments', 'earnings', 'settlements'] })
  detail(
    @Param('resource') name: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<unknown> {
    return this.queries.detail(resource(name), id);
  }
}

@ApiTags('Partner Finance')
@FinanceErrors()
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.GYM_OWNER, RoleName.GYM_MANAGER, RoleName.ADMIN, RoleName.SUPER_ADMIN)
@Controller('partner/finance')
export class PartnerFinanceController {
  constructor(private readonly queries: FinanceQueriesService) {}
  @Get('summary')
  @FinanceResponse(
    'Authorized gym or branch financial summary',
    summarySchema,
    200,
    'gymId or branchId required; membership is checked server-side.',
  )
  async summary(@CurrentUser() user: AuthUser, @Query() q: FinanceQueryDto): Promise<unknown> {
    await this.queries.authorize(user, q);
    return this.queries.summary(q);
  }
  @Get(':resource')
  @FinanceResponse(
    'Authorized partner financial records',
    listSchema,
    200,
    'gymId or branchId required. Settlements require gym-wide management permission and gymId. Earnings status filter accepts PAID or PENDING.',
  )
  @ApiParam({ name: 'resource', enum: ['payments', 'earnings', 'settlements'] })
  async list(
    @CurrentUser() user: AuthUser,
    @Param('resource') name: string,
    @Query() q: FinanceQueryDto,
  ): Promise<unknown> {
    const kind = resource(name);
    if (kind === 'ledger' || kind === 'refunds')
      financeError(E.FORBIDDEN, 'Resource is restricted to admins', 403);
    await this.queries.authorize(user, q, kind === 'settlements');
    return this.queries.list(kind, q);
  }
  @Get(':resource/:id')
  @FinanceResponse('Authorized partner financial details', detailSchema)
  @ApiParam({ name: 'resource', enum: ['payments', 'earnings', 'settlements'] })
  detail(
    @CurrentUser() user: AuthUser,
    @Param('resource') name: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<unknown> {
    return this.queries.detail(resource(name), id, user);
  }
}
