import { Test } from '@nestjs/testing';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Reflector } from '@nestjs/core';
import {
  AdminFinanceController,
  CustomerPaymentsController,
  PartnerFinanceController,
  PaymentWebhooksController,
} from './finance.controller';
import { PaymentsService } from './payments.service';
import { RefundsService } from './refunds.service';
import { SettlementsService } from './settlements.service';
import { FinanceQueriesService } from './finance-queries.service';
import { ReconciliationService } from './reconciliation.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { ExecutionContext } from '@nestjs/common';

describe('Phase 5 API documentation and role gates', () => {
  it('documents every finance operation with success schema and error responses', async () => {
    const module = await Test.createTestingModule({
      controllers: [
        AdminFinanceController,
        CustomerPaymentsController,
        PartnerFinanceController,
        PaymentWebhooksController,
      ],
      providers: [
        PaymentsService,
        RefundsService,
        SettlementsService,
        FinanceQueriesService,
        ReconciliationService,
      ].map((provide) => ({ provide, useValue: {} })),
    }).compile();
    const app = module.createNestApplication();
    const doc = SwaggerModule.createDocument(app, new DocumentBuilder().addBearerAuth().build());
    for (const path of Object.values(doc.paths)) {
      for (const operation of [path.get, path.post].filter((op) => op !== undefined)) {
        expect(operation.summary).toBeTruthy();
        expect(operation.responses['200'] ?? operation.responses['201']).toHaveProperty(
          'content.application/json.schema',
        );
        expect(operation.responses['409']).toBeDefined();
      }
    }
    expect(doc.paths['/admin/finance/settlements/{id}/reverse']?.post?.security).toBeDefined();
    expect(doc.paths['/webhooks/payments/{provider}']?.post?.requestBody).toBeDefined();
    await app.close();
  });
  it.each(['GYM_OWNER', 'GYM_MANAGER', 'CUSTOMER'])(
    'denies %s access to settlement reversal',
    (role) => {
      const guard = new RolesGuard(new Reflector());
      const context = {
        // Metadata lookup requires the original method, not a bound callable.
        // eslint-disable-next-line @typescript-eslint/unbound-method
        getHandler: () => AdminFinanceController.prototype.reverse,
        getClass: () => AdminFinanceController,
        switchToHttp: () => ({ getRequest: () => ({ user: { roles: [role] } }) }),
      } as unknown as ExecutionContext;
      expect(() => guard.canActivate(context)).toThrow();
    },
  );
});
