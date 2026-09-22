import { HealthService } from './health.service';

describe('HealthService', () => {
  it('reports healthy only when both dependencies respond', async () => {
    const service = new HealthService(
      { isHealthy: jest.fn().mockResolvedValue(true) } as never,
      { isHealthy: jest.fn().mockResolvedValue(true) } as never,
    );
    await expect(service.check()).resolves.toEqual({
      status: 'ok',
      services: { application: 'up', database: 'up', redis: 'up' },
    });
  });

  it('reports each unavailable dependency without leaking internals', async () => {
    const service = new HealthService(
      { isHealthy: jest.fn().mockResolvedValue(false) } as never,
      { isHealthy: jest.fn().mockResolvedValue(true) } as never,
    );
    await expect(service.check()).resolves.toEqual({
      status: 'error',
      services: { application: 'up', database: 'down', redis: 'up' },
    });
  });
});
