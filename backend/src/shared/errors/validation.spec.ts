import { IsEmail, IsInt, IsString, Min, ValidateNested, validateSync } from 'class-validator';
import { plainToInstance, Type } from 'class-transformer';
import { DomainError } from './domain-error.js';
import { createValidationPipe, validationErrorsToFields } from './validation.js';

class AddressDto {
  @IsString()
  street!: string;
}

class SampleDto {
  @IsEmail({}, { message: 'INVALID_EMAIL' })
  email!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @ValidateNested()
  @Type(() => AddressDto)
  address!: AddressDto;
}

function validateSample(plain: Record<string, unknown>) {
  return validateSync(plainToInstance(SampleDto, plain));
}

describe('validationErrorsToFields', () => {
  it('RF-000-11: usa el mensaje del DTO si ya es un código estable', () => {
    const fields = validationErrorsToFields(
      validateSample({ email: 'no-es-correo', quantity: 1, address: { street: 'x' } }),
    );

    expect(fields).toEqual({ email: ['INVALID_EMAIL'] });
  });

  it('RF-000-11: deriva el código del nombre de la restricción y no copia el texto en inglés', () => {
    const fields = validationErrorsToFields(
      validateSample({ email: 'a@b.co', quantity: 0, address: { street: 'x' } }),
    );

    expect(fields).toEqual({ quantity: ['MIN'] });
  });

  it('RF-000-11: anida con puntos las propiedades de objetos hijos', () => {
    const fields = validationErrorsToFields(
      validateSample({ email: 'a@b.co', quantity: 1, address: { street: 5 } }),
    );

    expect(fields).toEqual({ 'address.street': ['IS_STRING'] });
  });

  it('RF-000-11: agrupa varios códigos de un mismo campo', () => {
    const fields = validationErrorsToFields(
      validateSample({ email: 'a@b.co', quantity: 'x', address: { street: 'x' } }),
    );

    expect(fields['quantity']).toEqual(expect.arrayContaining(['IS_INT', 'MIN']));
  });
});

describe('createValidationPipe', () => {
  const metadata = { type: 'body' as const, metatype: SampleDto };

  it('RF-000-11: acepta un cuerpo válido y lo transforma a la clase del DTO', async () => {
    const result: unknown = await createValidationPipe().transform(
      { email: 'a@b.co', quantity: 2, address: { street: 'Av. Sucre' } },
      metadata,
    );

    expect(result).toBeInstanceOf(SampleDto);
  });

  it('RF-000-11: un cuerpo inválido lanza DomainError VALIDATION_ERROR 400 con details.fields', async () => {
    const attempt = createValidationPipe().transform(
      { email: 'mal', quantity: 1, address: { street: 'x' } },
      metadata,
    );

    await expect(attempt).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      httpStatus: 400,
      details: { fields: { email: ['INVALID_EMAIL'] } },
    });
    await expect(attempt).rejects.toBeInstanceOf(DomainError);
  });

  it('RF-000-11: rechaza campos que el DTO no declara (forbidNonWhitelisted)', async () => {
    const attempt = createValidationPipe().transform(
      { email: 'a@b.co', quantity: 1, address: { street: 'x' }, role: 'admin' },
      metadata,
    );

    await expect(attempt).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { fields: { role: ['UNKNOWN_FIELD'] } },
    });
  });
});
