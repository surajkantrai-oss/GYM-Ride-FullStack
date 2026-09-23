import { HttpStatus, Injectable } from '@nestjs/common';
import { ApiErrorCode as E } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';

@Injectable()
export class FlexUsagePolicy {
  cityRole(serviceCityId: string, primaryCityId: string, secondaryCityId: string | null): 'primary' | 'secondary' {
    if (serviceCityId === primaryCityId) return 'primary';
    if (serviceCityId === secondaryCityId) return 'secondary';
    throw new DomainException(E.FLEX_CITY_NOT_ELIGIBLE, 'Branch is outside the selected Flex cities', HttpStatus.UNPROCESSABLE_ENTITY);
  }
  assertAllowance(input: { total: number; totalLimit: number; cityTotal: number; cityLimit: number; daily: number; dailyLimit: number }): void {
    if (input.total >= input.totalLimit) throw new DomainException(E.FLEX_USAGE_LIMIT_REACHED, 'Flex period usage limit reached', HttpStatus.CONFLICT);
    if (input.cityTotal >= input.cityLimit) throw new DomainException(E.FLEX_CITY_LIMIT_REACHED, 'Flex city usage limit reached', HttpStatus.CONFLICT);
    if (input.daily >= input.dailyLimit) throw new DomainException(E.FLEX_DAILY_LIMIT_REACHED, 'Flex daily usage limit reached', HttpStatus.CONFLICT);
  }
}
