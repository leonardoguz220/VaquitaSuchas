import { ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { DomainError } from './domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from './error-codes.js';

const STABLE_CODE = /^[A-Z][A-Z0-9_]*$/;

/** `isEmail` pasa a `IS_EMAIL`. */
function constraintToCode(constraint: string): string {
  if (constraint === 'whitelistValidation') return 'UNKNOWN_FIELD';
  return constraint.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
}

/**
 * Aplana los errores de `class-validator` al `details.fields` de `contracts/api.md` A.2:
 * `{ "email": ["INVALID_EMAIL"] }`. Cada valor es un código estable, nunca el texto en inglés
 * de la librería (que repite el valor enviado o el nombre interno de la propiedad). Si el DTO
 * declara como `message` un código ya estable (`@IsEmail({}, { message: 'INVALID_EMAIL' })`), se
 * respeta; si no, el código sale del nombre de la restricción. Las propiedades anidadas
 * se nombran con puntos (`address.street`).
 */
export function validationErrorsToFields(
  errors: readonly ValidationError[],
  parentPath = '',
): Record<string, string[]> {
  const fields: Record<string, string[]> = {};

  for (const error of errors) {
    const path = parentPath ? `${parentPath}.${error.property}` : error.property;

    for (const [constraint, message] of Object.entries(error.constraints ?? {})) {
      const code = STABLE_CODE.test(message) ? message : constraintToCode(constraint);
      const codes = (fields[path] ??= []);
      if (!codes.includes(code)) codes.push(code);
    }

    if (error.children?.length) {
      Object.assign(fields, validationErrorsToFields(error.children, path));
    }
  }

  return fields;
}

/** Indica si el valor lanzado es una lista de `ValidationError` de class-validator. */
export function isValidationErrorList(value: unknown): value is ValidationError[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as ValidationError).property === 'string' &&
        ('constraints' in item || 'children' in item),
    )
  );
}

export function validationDomainError(errors: readonly ValidationError[]): DomainError {
  return new DomainError(ErrorCode.VALIDATION_ERROR, 400, DEFAULT_MESSAGES.VALIDATION_ERROR, {
    fields: validationErrorsToFields(errors),
  });
}

/**
 * `ValidationPipe` de Vaquita (skill `vaquita-nestjs-conventions`, regla 3): rechaza campos que el
 * DTO no declara y falla con un `DomainError` `VALIDATION_ERROR` que ya trae `details.fields`.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: validationDomainError,
  });
}
