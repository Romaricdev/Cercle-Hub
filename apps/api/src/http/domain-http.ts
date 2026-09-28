import { HttpException } from "@nestjs/common";
import { apiError } from "@cercle/contracts";
import { DomainError } from "@cercle/domain";
import { ZodError } from "zod";

export class DomainHttpError extends HttpException {
  static from(error: unknown): HttpException {
    if (error instanceof DomainError) {
      return new HttpException(apiError(error.code, error.message), error.status);
    }
    if (error instanceof ZodError) {
      return new HttpException(apiError("INVALID_INPUT", "Les paramètres fournis sont invalides."), 400);
    }
    if (error instanceof HttpException) {
      return error;
    }
    return new HttpException(apiError("INTERNAL", "La requête n’a pas abouti."), 500);
  }
}
