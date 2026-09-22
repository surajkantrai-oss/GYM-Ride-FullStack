import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { RolesGuard } from '../common/guards/roles.guard';
import { CustomerCheckInsController, PartnerCheckInsController } from './check-ins.controller';
import { CheckInOtpService } from './check-in-otp.service';
import { CheckInService } from './check-in.service';
import { CheckInTokenService } from './check-in-token.service';
import { CheckInVerificationService } from './check-in-verification.service';

describe('Phase 7 API documentation and role gates', () => {
  it('documents auth, schemas, expiration semantics and stable errors', async () => {
    const module = await Test.createTestingModule({
      controllers: [CustomerCheckInsController, PartnerCheckInsController],
      providers: [
        CheckInService,
        CheckInTokenService,
        CheckInOtpService,
        CheckInVerificationService,
      ].map((provide) => ({ provide, useValue: {} })),
    }).compile();
    const app = module.createNestApplication();
    const doc = SwaggerModule.createDocument(app, new DocumentBuilder().addBearerAuth().build());
    const paths = [
      '/bookings/{bookingId}/check-in',
      '/bookings/{bookingId}/check-in/qr',
      '/bookings/{bookingId}/check-in/otp',
      '/partner/check-ins/verify-qr',
      '/partner/check-ins/verify-otp',
    ];
    for (const name of paths) {
      const operation = doc.paths[name]?.get ?? doc.paths[name]?.post;
      expect(operation?.summary).toBeTruthy();
      expect(operation?.security).toBeDefined();
      expect(operation?.responses['200'] ?? operation?.responses['201']).toHaveProperty(
        'content.application/json.schema',
      );
      expect(operation?.responses['409']).toBeDefined();
    }
    expect(doc.paths['/partner/check-ins/verify-qr']?.post?.requestBody).toBeDefined();
    const qrResponse = doc.paths['/bookings/{bookingId}/check-in/qr']?.post?.responses['201'];
    expect(qrResponse && 'description' in qrResponse ? qrResponse.description : '').toContain(
      'revoke',
    );
    await app.close();
  });

  it('permits staff at the route gate while leaving branch scope to resource authorization', () => {
    const guard = new RolesGuard(new Reflector());
    const context = {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      getHandler: () => PartnerCheckInsController.prototype.verifyQr,
      getClass: () => PartnerCheckInsController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { roles: [RoleName.GYM_STAFF] } }),
      }),
    } as unknown as ExecutionContext;
    expect(guard.canActivate(context)).toBe(true);
  });
});
