import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const context = (roles: RoleName[]) =>
    ({
      getHandler: () => ({}),
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
    }) as unknown as ExecutionContext;
  it('allows a required role and rejects a customer from admin access', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([RoleName.ADMIN]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(context([RoleName.ADMIN]))).toBe(true);
    expect(() => guard.canActivate(context([RoleName.CUSTOMER]))).toThrow('Insufficient role');
  });
});
