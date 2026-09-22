import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { HealthResult, HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}
  @Get()
  @ApiOperation({ summary: 'Check API, PostgreSQL, and Redis health' })
  @ApiOkResponse({ description: 'All services are healthy' })
  @ApiServiceUnavailableResponse({ description: 'One or more dependencies are unavailable' })
  async check(@Res({ passthrough: true }) response: Response): Promise<HealthResult> {
    const result = await this.health.check();
    response.status(result.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return result;
  }
}
