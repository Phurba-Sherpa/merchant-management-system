import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { DomainException } from '../errors/domain.exception';

export interface ErrorResponsePayload {
  statusCode: number;
  error: string;
  code?: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode: number;
    let error: string;
    let message: string | string[];
    let code: string | undefined;

    if (exception instanceof DomainException) {
      statusCode = exception.httpStatus;
      code = exception.code;
      error = HttpStatus[statusCode] ?? 'Error';
      message = exception.message;
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, unknown>;
        message = (resObj['message'] as string | string[]) ?? exception.message;
        error =
          (resObj['error'] as string) ?? HttpStatus[statusCode] ?? 'Error';
        code = resObj['code'] as string | undefined;
      } else {
        message = typeof res === 'string' ? res : exception.message;
        error = HttpStatus[statusCode] ?? 'Error';
      }
    } else if (
      typeof exception === 'object' &&
      exception !== null &&
      'code' in exception &&
      exception.code === '23505'
    ) {
      // Postgres unique_violation error code 23505 mapped to 409 Conflict
      statusCode = HttpStatus.CONFLICT;
      error = 'Conflict';
      message = 'Resource already exists';
    } else {
      // General unhandled exceptions: mask details to prevent leaking internals, stack traces, or SQL
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      error = 'Internal Server Error';
      message = 'Internal server error';

      this.logger.error(
        `Unhandled exception on ${request?.method} ${request?.url}`,
        exception instanceof Error
          ? exception.stack
          : JSON.stringify(exception),
      );
    }

    const payload: ErrorResponsePayload = {
      statusCode,
      error,
      ...(code ? { code } : {}),
      message,
      path: request?.url ?? '',
      timestamp: new Date().toISOString(),
    };

    response.status(statusCode).json(payload);
  }
}
