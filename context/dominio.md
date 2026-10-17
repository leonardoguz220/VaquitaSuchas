# Reglas de dominio

Estas reglas valen para todas las features. Cualquier spec debe respetarlas, y forman parte de la constitución del proyecto.

## Dinero y moneda

- La moneda base de cobro es el boliviano (Bs). El precio del servicio puede estar en USD o en Bs.
- Los montos nunca se guardan como `float`. Se guardan en centavos como enteros (Bs 25,50 se guarda como `2550`) o con un tipo decimal exacto.
- El titular define el tipo de cambio al crear la suscripción, como valor manual, y puede actualizarlo. Cada cobro guarda una copia (snapshot) del tipo de cambio y del precio usados, de modo que el historial no cambia si luego se edita la suscripción.
- La cuota se redondea al centavo. Cuando la división no es exacta, los centavos sobrantes se asignan al titular, y la suma de las cuotas siempre es igual al total.
- En la interfaz el formato es `Bs 25,50`, con coma decimal.

## Fechas y zona horaria

- Las fechas se guardan en UTC y se muestran en la zona America/La_Paz (UTC-4).
- El día de cobro es un día del mes entre 1 y 31. Cuando el mes tiene menos días, se usa el último día del mes (el día 31 en febrero pasa al 28 o 29).

## Roles dentro de un grupo

- El titular crea la suscripción, confirma o rechaza los pagos y gestiona a los miembros. Un grupo tiene exactamente un titular. El titular no tiene cobro propio: su cuota es solo de referencia.
- El miembro ve su cuota, paga, sube comprobantes y ve el estado y el historial del grupo.
- Una misma persona puede ser titular en unos grupos y miembro en otros.

## Estados de un cobro

Los estados son `pendiente`, `en_revision`, `pagado`, `atrasado` y `cancelado`.

- `pendiente` pasa a `en_revision` cuando el miembro sube un comprobante, y a `atrasado` cuando vence sin pago.
- `en_revision` pasa a `pagado` cuando el titular confirma. Si rechaza, vuelve a `pendiente` o a `atrasado` según la fecha de vencimiento.
- `pendiente` y `atrasado` pasan a `cancelado` por decisión del titular, con motivo.
- `pagado` y `cancelado` son estados finales.

La tabla completa de transiciones está en `specs/002-cobros-y-pagos/spec.md` (RN-002-01). No se crean estados nuevos sin actualizar antes la spec.

## Privacidad y seguridad

- Un usuario solo ve los datos de los grupos a los que pertenece.
- Las contraseñas se guardan con un hash seguro (bcrypt o argon2) y nunca se registran en logs, igual que los tokens.
- Los comprobantes los ven solo el titular y el miembro que los subió, salvo que una spec indique otra cosa.
- Los permisos, los montos y los estados se validan siempre en el servidor. El frontend solo ayuda a la experiencia de uso.
- Los archivos subidos se validan por tipo (imagen o PDF) y por tamaño máximo, definido en la spec 002.
- Los secretos van en variables de entorno y nunca en el repositorio.

## Idioma

- La interfaz y los mensajes al usuario están en español (Bolivia).
- El código, los nombres de variables, las ramas y los commits están en inglés. Las specs y la documentación están en español.
