/**
 * Guarda en el equipo un archivo que ya llegó de la API (por ejemplo, un CSV de la spec 006),
 * con el nombre que propuso el servidor. Solo usa el navegador: crea un enlace temporal con
 * `download` y lo libera enseguida.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Se libera después del clic para que el navegador alcance a empezar la descarga.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
