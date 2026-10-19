import { jest } from '@jest/globals';
import type { Queryable } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { PaymentReferencesRepository } from '../repositories/payment-references.repository.js';
import { PaymentReferenceService } from './payment-reference.service.js';

const q = {} as Queryable;

function build(reserveResult: boolean): {
  service: PaymentReferenceService;
  reserve: jest.Mock<PaymentReferencesRepository['reserve']>;
} {
  const reserve = jest
    .fn<PaymentReferencesRepository['reserve']>()
    .mockResolvedValue(reserveResult);
  const repository = {
    reserve,
    release: jest.fn<PaymentReferencesRepository['release']>().mockResolvedValue(1),
    isReserved: jest.fn<PaymentReferencesRepository['isReserved']>().mockResolvedValue(false),
  } as unknown as PaymentReferencesRepository;
  return { service: new PaymentReferenceService(repository), reserve };
}

describe('PaymentReferenceService', () => {
  it('CA-002-27: reserva con la clave normalizada y la devuelve', async () => {
    const { service, reserve } = build(true);
    const key = await service.reserve(q, {
      groupId: 'g1',
      reference: '  tx   001 ',
      sourceType: 'receipt',
      sourceId: 'r1',
    });
    expect(key).toBe('TX 001');
    expect(reserve).toHaveBeenCalledWith(q, {
      groupId: 'g1',
      referenceKey: 'TX 001',
      sourceType: 'receipt',
      sourceId: 'r1',
    });
  });

  it('CA-002-27: si la referencia ya está reservada responde 409 REFERENCE_ALREADY_USED', async () => {
    const { service } = build(false);
    await expect(
      service.reserve(q, {
        groupId: 'g1',
        reference: 'TX-1',
        sourceType: 'receipt',
        sourceId: 'r1',
      }),
    ).rejects.toMatchObject({
      code: 'REFERENCE_ALREADY_USED',
      httpStatus: 409,
      details: { rule: 'RN-010-14' },
    });
  });

  it('CA-002-26: una referencia vacía o con caracteres no permitidos es un error de validación', async () => {
    const { service, reserve } = build(true);
    for (const reference of ['', '   ', 'a<b>', 'x'.repeat(101)]) {
      const error = await service
        .reserve(q, { groupId: 'g1', reference, sourceType: 'join_request', sourceId: 'j1' })
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toMatchObject({ code: 'VALIDATION_ERROR', httpStatus: 400 });
    }
    expect(reserve).not.toHaveBeenCalled();
  });

  it('RF-002-08: release delega en el repositorio con la fecha del reloj', async () => {
    const { service } = build(true);
    await expect(service.release(q, 'receipt', 'r1', new Date())).resolves.toBe(1);
  });
});
