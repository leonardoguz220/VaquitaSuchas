'use client';

import { useState } from 'react';
import { Alert, Button, Card } from '@/components/ui';
import { useAdminTransfer } from '@/hooks/use-admin-transfer';
import { useMe } from '@/hooks/use-me';
import type { AdminUserRow } from '@/services/admin';
import { AdminActionDialog } from './admin-action-dialog';
import { AdminUserPicker } from './admin-user-picker';

/**
 * Acción «Transferir titularidad» en la ficha del grupo (RF-009-24, CA-009-35). Solo la ve un
 * administrador: para cualquier otra persona no se muestra nada. El servidor decide si el titular
 * actual está suspendido y si la nueva persona puede serlo; sus errores se muestran tal cual.
 */
export function AdminTransferOwnership({ groupId }: { groupId: string }) {
  const me = useMe();
  const transfer = useAdminTransfer(groupId);
  const [picked, setPicked] = useState<AdminUserRow | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (me.user?.role !== 'admin') return null;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold">Transferir titularidad</h2>
        <p className="text-sm text-muted">
          Acción de administración. Solo se puede si el titular actual está suspendido. Queda en
          auditoría.
        </p>
      </div>

      {notice && <Alert variant="success">{notice}</Alert>}

      <AdminUserPicker selected={picked} onSelect={setPicked} />

      <div>
        <Button variant="danger" disabled={!picked} onClick={() => setConfirmOpen(true)}>
          Transferir titularidad
        </Button>
      </div>

      <AdminActionDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={picked ? `¿Pasar la titularidad a ${picked.fullName}?` : 'Transferir titularidad'}
        description="El grupo pasa a la nueva persona. Sus cobros y miembros se mantienen. Queda en auditoría."
        confirmLabel="Transferir"
        danger
        onConfirm={async (reason) => {
          if (!picked) return null;
          const outcome = await transfer.submit({ toUserId: picked.id, reason });
          if (outcome?.ok) {
            setNotice(`La titularidad pasó a ${picked.fullName}.`);
            setPicked(null);
          }
          return outcome;
        }}
      />
    </Card>
  );
}
