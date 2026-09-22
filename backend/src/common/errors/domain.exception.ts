import { HttpException, HttpStatus } from '@nestjs/common';
import { ApiErrorCode } from './api-error-code';

export class DomainException extends HttpException {
  constructor(
    code: ApiErrorCode,
    message: string,
    status = HttpStatus.BAD_REQUEST,
    details?: unknown,
  ) {
    super({ code, message, ...(details !== undefined && { details }) }, status);
  }
}
