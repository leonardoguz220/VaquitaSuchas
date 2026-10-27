import { render, screen } from '@testing-library/react';
import type { ListingFormValues } from './listing-owner-model';
import { ListingOwnerPreview } from './listing-owner-preview';

const values = { slotsOffered: '', description: '', conditions: '' } as ListingFormValues;

function renderPreview(estimatedShareCents: number | null) {
  render(
    <ListingOwnerPreview
      serviceName="Netflix"
      planName="Premium"
      ownerName="Titular de Prueba"
      billingDay={5}
      values={values}
      estimatedShareCents={estimatedShareCents}
      expiresAt={null}
    />,
  );
}

describe('ListingOwnerPreview (QA-11)', () => {
  it('sin publicación no muestra la línea de cuota vacía', () => {
    renderPreview(null);
    expect(screen.queryByText(/Cuota/)).not.toBeInTheDocument();
    expect(screen.getByText('Titular: Titular de Prueba')).toBeInTheDocument();
  });

  it('con la cuota de la API la muestra rotulada «estimada»', () => {
    renderPreview(2085);
    expect(screen.getByText('Bs 20,85')).toBeInTheDocument();
    expect(screen.getByText('estimada')).toBeInTheDocument();
  });
});
