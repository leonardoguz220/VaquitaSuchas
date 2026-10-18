-- Crea la base de pruebas de integración junto a la de desarrollo (research.md R7).
-- PostgreSQL ejecuta este archivo una sola vez, al inicializar un volumen vacío.
-- Para volver a ejecutarlo hay que borrar el volumen: docker compose down -v
CREATE DATABASE vaquita_test OWNER vaquita;
