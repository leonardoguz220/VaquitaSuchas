'use client';

import type { ReactNode } from 'react';
import { Button, Modal } from '@/components/ui';

export interface PolicyModalProps {
  open: boolean;
  onClose: () => void;
  /** Texto de la política. Hoy lo entrega `DataPolicySummary`; ver el comentario T025 allí. */
  children: ReactNode;
  title?: ReactNode;
}

/**
 * Modal con la política de datos del registro (RF-003-23). Solo la muestra: abrirlo o
 * cerrarlo no marca la casilla de aceptación.
 */
export function PolicyModal({
  open,
  onClose,
  children,
  title = 'Política de datos',
}: PolicyModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={<Button onClick={onClose}>Entendido</Button>}
    >
      {children}
    </Modal>
  );
}
