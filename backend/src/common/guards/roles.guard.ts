import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { DomainException } from '../errors/domain.exception';
import { ApiErrorCode } from '../errors/api-error-code';
import { HttpStatus } from '@nestjs/common';

interface AuthenticatedRequest {
  user?: { roles?: RoleName[] };
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RoleName[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (required.some((role) => request.user?.roles?.includes(role))) return true;
    throw new DomainException(
      ApiErrorCode.INSUFFICIENT_ROLE,
      'Insufficient role',
      HttpStatus.FORBIDDEN,
    );
  }
}
