import { RoleName } from '@prisma/client';

export interface AuthUser {
  id: string;
  roles: RoleName[];
  sessionId: string;
}
