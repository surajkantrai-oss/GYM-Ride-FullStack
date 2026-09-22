import { RoleName } from '@prisma/client';
import { ROLES_KEY, Roles } from './roles.decorator';

describe('Roles decorator', () => {
  it('stores the exact required roles as metadata', () => {
    class TestController {
      @Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN) endpoint(): void {}
    }
    const endpoint = Reflect.get(TestController.prototype, 'endpoint');
    const metadata = Reflect.getMetadata(ROLES_KEY, endpoint) as RoleName[];
    expect(metadata).toEqual([RoleName.ADMIN, RoleName.SUPER_ADMIN]);
  });
});
