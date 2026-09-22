import { DomainException } from '../errors/domain.exception';
import { ApiErrorCode } from '../errors/api-error-code';

const E164 = /^\+[1-9]\d{7,14}$/;

export function normalizePhone(value: string): string {
  const normalized = value.replace(/[\s()-]/g, '');
  if (!E164.test(normalized)) {
    throw new DomainException(ApiErrorCode.INVALID_PHONE, 'Phone must use E.164 format');
  }
  return normalized;
}
