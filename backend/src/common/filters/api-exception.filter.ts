import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiErrorCode } from '../errors/api-error-code';
import type { RequestWithId } from '../middleware/request-id.middleware';

interface ExceptionBody {
  message?: string | string[];
  error?: string;
  code?: string;
  details?: unknown;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<Response>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw = exception instanceof HttpException ? exception.getResponse() : undefined;
    const body: ExceptionBody = typeof raw === 'object' && raw !== null ? raw : {};
    const validationMessages = Array.isArray(body.message) ? body.message : undefined;
    const message = validationMessages
      ? 'Request validation failed'
      : (body.message ??
        (status === 500 ? 'An unexpected error occurred' : (body.error ?? 'Request failed')));
    const code = body.code ?? this.codeFor(status, validationMessages !== undefined);

    if (status >= 500)
      this.logger.error({
        requestId: request.requestId,
        path: request.originalUrl,
        status,
        exception,
      });
    response.status(status).json({
      success: false,
      error: {
        code,
        message,
        ...((validationMessages ?? body.details) !== undefined && {
          details: validationMessages ?? body.details,
        }),
      },
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
      requestId: request.requestId,
    });
  }

  private codeFor(status: number, validation: boolean): ApiErrorCode {
    if (validation) return ApiErrorCode.VALIDATION_FAILED;
    if (status === 401) return ApiErrorCode.UNAUTHORIZED;
    if (status === 403) return ApiErrorCode.FORBIDDEN;
    if (status === 404) return ApiErrorCode.NOT_FOUND;
    if (status === 429) return ApiErrorCode.RATE_LIMIT_EXCEEDED;
    if (status === 503) return ApiErrorCode.SERVICE_UNAVAILABLE;
    return ApiErrorCode.INTERNAL_ERROR;
  }
}
