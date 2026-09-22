import { HttpStatus, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiErrorCode } from '../errors/api-error-code';
import { DomainException } from '../errors/domain.exception';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  override handleRequest<TUser = unknown>(error: unknown, user: TUser): TUser {
    if (error || !user)
      throw new DomainException(
        ApiErrorCode.AUTHENTICATION_REQUIRED,
        'Authentication required',
        HttpStatus.UNAUTHORIZED,
      );
    return user;
  }
}
