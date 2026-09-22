import type { Response } from 'express';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('sets 503 for a degraded result', async () => {
    const result = {
      status: 'error' as const,
      services: { application: 'up' as const, database: 'down' as const, redis: 'up' as const },
    };
    const controller = new HealthController({
      check: jest.fn().mockResolvedValue(result),
    } as never);
    const status = jest.fn();
    const response = { status } as unknown as Response;
    await expect(controller.check(response)).resolves.toEqual(result);
    expect(status).toHaveBeenCalledWith(503);
  });
});
