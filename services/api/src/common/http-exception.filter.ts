import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

const CODE_BY_STATUS: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'UNPROCESSABLE',
  429: 'TOO_MANY_REQUESTS',
  502: 'BAD_GATEWAY',
  503: 'SERVICE_UNAVAILABLE',
};

/**
 * Format d'erreur unifié de l'API :
 *   { error: { code, message, requestId } }
 * Les erreurs inattendues sont loguées avec leur stack mais exposées
 * de façon neutre (jamais de détail interne côté client).
 */
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<{
      status: (code: number) => { json: (body: unknown) => void };
    }>();
    const request = ctx.getRequest<{ requestId?: string; url?: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Erreur interne';
    let code = 'INTERNAL_ERROR';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const m = (body as { message?: string | string[] }).message;
        message = Array.isArray(m) ? m.join(' ; ') : (m ?? exception.message);
        const c = (body as { code?: string }).code;
        if (c) code = c;
      }
      if (code === 'INTERNAL_ERROR') code = CODE_BY_STATUS[status] ?? 'ERROR';
    } else {
      this.logger.error(
        `Erreur non gérée sur ${request.url}: ${(exception as Error).message}`,
        (exception as Error).stack,
      );
    }

    response.status(status).json({
      error: { code, message, requestId: request.requestId ?? null },
    });
  }
}
