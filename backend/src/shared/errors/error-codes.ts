/** Códigos de error comunes de `contracts/api.md` A.3. No se agregan códigos fuera del contrato. */
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  UNSUPPORTED_FILE_TYPE: 'UNSUPPORTED_FILE_TYPE',
  BUSINESS_RULE: 'BUSINESS_RULE',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type CommonErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Mensajes genéricos en español (Bolivia): nunca llevan texto interno de la excepción original. */
export const DEFAULT_MESSAGES: Record<CommonErrorCode, string> = {
  VALIDATION_ERROR: 'Los datos enviados no son válidos.',
  UNAUTHENTICATED: 'Debes iniciar sesión para continuar.',
  FORBIDDEN: 'No tienes permiso para realizar esta acción.',
  NOT_FOUND: 'No se encontró el recurso solicitado.',
  CONFLICT: 'La operación entra en conflicto con los datos existentes.',
  FILE_TOO_LARGE: 'El archivo supera el tamaño máximo permitido.',
  UNSUPPORTED_FILE_TYPE: 'El tipo de archivo no está permitido.',
  BUSINESS_RULE: 'La operación no cumple una regla del sistema.',
  RATE_LIMITED: 'Demasiados intentos. Intenta de nuevo más tarde.',
  INTERNAL_ERROR: 'Ocurrió un error inesperado. Intenta de nuevo más tarde.',
  SERVICE_UNAVAILABLE: 'El servicio no está disponible por el momento.',
};

/** Código de A.3 que corresponde a un estado HTTP; `undefined` si A.3 no lo cubre. */
export const CODE_BY_STATUS: Readonly<Record<number, CommonErrorCode>> = {
  400: ErrorCode.VALIDATION_ERROR,
  401: ErrorCode.UNAUTHENTICATED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
  413: ErrorCode.FILE_TOO_LARGE,
  415: ErrorCode.UNSUPPORTED_FILE_TYPE,
  422: ErrorCode.BUSINESS_RULE,
  429: ErrorCode.RATE_LIMITED,
  500: ErrorCode.INTERNAL_ERROR,
  503: ErrorCode.SERVICE_UNAVAILABLE,
};
