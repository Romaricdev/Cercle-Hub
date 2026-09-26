import { Catch, HttpException, HttpStatus, type ArgumentsHost, type ExceptionFilter } from "@nestjs/common";
import { apiError, redactLogValue } from "@cercle/contracts";
import { DomainError } from "@cercle/domain";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const reply = http.getResponse<FastifyReply>();
    const request = http.getRequest<FastifyRequest>();
    let status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const response = exception instanceof HttpException ? exception.getResponse() : null;
    let body = isProtocolError(response) ? response : apiError("INTERNAL", "La requête n’a pas abouti.");
    if (exception instanceof DomainError) {
      status = exception.status;
      body = apiError(exception.code, exception.message);
    } else if (exception instanceof ZodError) {
      status = 400;
      body = apiError("INVALID_INPUT", "Les données envoyées sont invalides.");
    }
    const requestId = request.id;
    console.error(JSON.stringify(redactLogValue({ requestId, status, code: body.error.code })));
    void reply.status(status).send(body);
  }
}

function isProtocolError(value: unknown): value is ReturnType<typeof apiError> {
  return typeof value === "object" && value !== null && "protocolVersion" in value && "error" in value;
}
