import { DomainError } from './domain-error.js';

describe('DomainError', () => {
  it('RF-000-11: conserva código, estado HTTP, mensaje y detalles', () => {
    const error = new DomainError('INVALID_TRANSITION', 409, 'Este cobro ya no admite cambios.', {
      from: 'pagado',
    });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('INVALID_TRANSITION');
    expect(error.httpStatus).toBe(409);
    expect(error.message).toBe('Este cobro ya no admite cambios.');
    expect(error.details).toEqual({ from: 'pagado' });
    expect(error.name).toBe('DomainError');
  });

  it('RF-000-11: los detalles son opcionales', () => {
    expect(new DomainError('NOT_FOUND', 404, 'No existe.').details).toBeUndefined();
  });
});
