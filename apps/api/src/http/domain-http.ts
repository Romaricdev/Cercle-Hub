import { HttpException } from "@nestjs/common";
import { apiError } from "@cercle/contracts";
import { DomainError } from "@cercle/domain";

export class DomainHttpError extends HttpException {
  static from(error: unknown): HttpException {
    if (error instanceof DomainError) {
      return new HttpException(apiError(error.code, error.message), error.status);
    }
    if (error instanceof HttpException) {
      return error;
    }
    return new HttpException(apiError("INTERNAL", "La requête n’a pas abouti."), 500);
  }
}
