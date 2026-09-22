import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateBranchDto } from './branch.dto';

describe('CreateBranchDto', () => {
  const valid = {
    name: 'MP Nagar',
    address: 'Zone 1, MP Nagar',
    city: 'Bhopal',
    state: 'Madhya Pradesh',
    postalCode: '462011',
    country: 'IN',
    latitude: '23.2325',
    longitude: '77.4303',
    timezone: 'Asia/Kolkata',
  };
  it('accepts valid coordinates and IANA timezone', async () => {
    await expect(validate(plainToInstance(CreateBranchDto, valid))).resolves.toHaveLength(0);
  });
  it('rejects impossible coordinates and ambiguous timezone', async () => {
    const errors = await validate(
      plainToInstance(CreateBranchDto, { ...valid, latitude: '100', timezone: 'IST' }),
    );
    expect(errors.map(({ property }) => property)).toEqual(
      expect.arrayContaining(['latitude', 'timezone']),
    );
  });
});
