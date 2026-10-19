/**
 * Resumen de la política de datos que fija la spec 003 en RF-003-23: qué datos se piden,
 * para qué y cuánto se conservan. Solo usa lo que dicen la spec (RF-003-04, RF-003-19,
 * RF-003-22, RN-003-03) y `context/dominio.md`; no inventa plazos.
 */
// T025: reemplazar por GET /auth/policy cuando el contrato lo defina
export function DataPolicySummary() {
  return (
    <div className="flex flex-col gap-4 text-body">
      <section className="flex flex-col gap-1.5">
        <h3 className="font-bold">Qué datos pedimos</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>Tu nombre completo, tu correo y tu cédula de identidad.</li>
          <li>El celular y la cuenta de Telegram con los que verificas tu número.</li>
        </ul>
      </section>
      <section className="flex flex-col gap-1.5">
        <h3 className="font-bold">Para qué los usamos</h3>
        <p>
          Para identificar a las personas que comparten una suscripción y para bloquear a quien
          estafe, de modo que no pueda volver con otra cuenta.
        </p>
        <p>
          Tu cédula se guarda cifrada y nunca se muestra a otros usuarios. Tu correo tampoco se
          comparte. En tus grupos, los demás ven tu nombre y, para coordinar los pagos, tu celular.
        </p>
      </section>
      <section className="flex flex-col gap-1.5">
        <h3 className="font-bold">Cuánto tiempo los conservamos</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>Si no verificas tu celular en 24 horas, la cuenta se elimina.</li>
          <li>
            El chat, las solicitudes de ingreso y los comprobantes se conservan 2 meses desde que
            terminan o desde que se cierra el grupo.
          </li>
          <li>
            Si una cuenta es baneada, guardamos de forma permanente una huella irreversible de su
            correo, su celular, su cédula y su cuenta de Telegram, aunque se borren sus demás datos.
          </li>
        </ul>
      </section>
    </div>
  );
}
