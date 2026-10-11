import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthService } from './health.service';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Health check verifying Postgres and Redis connectivity',
  })
  @ApiResponse({ status: 200, description: 'Services are healthy' })
  @ApiResponse({
    status: 503,
    description: 'One or more services are unhealthy',
  })
  async check(@Res() res: Response): Promise<void> {
    const result = await this.healthService.checkHealth();
    const statusCode =
      result.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
    res.status(statusCode).json(result);
  }
}
