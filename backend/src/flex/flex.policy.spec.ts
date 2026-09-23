import { FlexUsagePolicy } from './flex.policy';

describe('FlexUsagePolicy', () => {
  const policy = new FlexUsagePolicy();
  it('classifies primary and secondary canonical cities', () => {
    expect(policy.cityRole('primary', 'primary', 'secondary')).toBe('primary');
    expect(policy.cityRole('secondary', 'primary', 'secondary')).toBe('secondary');
  });
  it('rejects a third city', () => {
    expect(() => policy.cityRole('third', 'primary', 'secondary')).toThrow('outside the selected Flex cities');
  });
  it.each([
    [{ total: 2, totalLimit: 2, cityTotal: 0, cityLimit: 2, daily: 0, dailyLimit: 1 }, 'period usage'],
    [{ total: 1, totalLimit: 2, cityTotal: 1, cityLimit: 1, daily: 0, dailyLimit: 1 }, 'city usage'],
    [{ total: 1, totalLimit: 2, cityTotal: 1, cityLimit: 2, daily: 1, dailyLimit: 1 }, 'daily usage'],
  ])('rejects exhausted %s allowance', (input, expected) => {
    expect(() => policy.assertAllowance(input)).toThrow(expected);
  });
  it('accepts allowance below every limit', () => {
    expect(() => policy.assertAllowance({ total: 1, totalLimit: 2, cityTotal: 1, cityLimit: 2, daily: 0, dailyLimit: 1 })).not.toThrow();
  });
});
