import { Controller, Get, INestApplication, UseGuards, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { RoleName } from '@prisma/client';
import * as request from 'supertest';
import { Roles } from '../src/common/decorators/roles.decorator';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { JwtStrategy } from '../src/auth/jwt.strategy';

@Controller('test-admin')
class ProtectedController {
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN)
  get(): { ok: boolean } {
    return { ok: true };
  }
}

describe('JWT and RBAC (e2e)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  const secret = 'access-secret-with-at-least-32-characters';

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PassportModule, JwtModule.register({})],
      controllers: [ProtectedController],
      providers: [
        JwtStrategy,
        JwtAuthGuard,
        RolesGuard,
        { provide: ConfigService, useValue: { getOrThrow: () => secret } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
    jwt = module.get(JwtService);
  });
  afterAll(async () => app.close());

  const token = (roles: RoleName[]): string =>
    jwt.sign(
      { sub: 'user', roles, sessionId: 'session', tokenType: 'access' },
      { secret, expiresIn: 60 },
    );

  it('returns 401 without authentication', async () => {
    await request(app.getHttpServer()).get('/api/v1/test-admin').expect(401);
  });
  it('returns 403 when the role is insufficient', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/test-admin')
      .set('Authorization', `Bearer ${token([RoleName.CUSTOMER])}`)
      .expect(403);
  });
  it('allows an administrator', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/test-admin')
      .set('Authorization', `Bearer ${token([RoleName.ADMIN])}`)
      .expect(200, { ok: true });
  });
});
