import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

/**
 * Maps every thrown error to the Petstore error shape already implied by the
 * committed OpenAPI contract's `4xx`/`default` responses — a single `message`
 * string plus the HTTP status — rather than inventing a per-module shape.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? this.extractMessage(exception)
        : 'Unexpected error';

    response.status(status).json({ statusCode: status, message });
  }

  private extractMessage(exception: HttpException): string {
    const response = exception.getResponse();
    if (typeof response === 'string') {
      return response;
    }
    if (typeof response === 'object' && response !== null && 'message' in response) {
      const { message } = response as { message: string | string[] };
      return Array.isArray(message) ? message.join(', ') : message;
    }
    return exception.message;
  }
}
