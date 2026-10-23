# Conversión a Paquete 12 clases

Objetivo: reemplazar «Mensual 3 veces por semana» por «Paquete 12 clases» y descontar un crédito por check-in válido.

Antes de migrar: identificar IDs de ambos planes por organización, revisar cuántas membresías están activas y vencidas, revisar saldo actual de membership_credit_ledger y comprobar el trigger de checkins. No asignar 12 créditos sin restar clases consumidas; no duplicar débitos. Preservar historial, importes y fechas. Desactivar plan antiguo después de migrar, no borrar sus registros. Probar una asistencia y un check-in duplicado con un atleta de prueba.

**No se ha ejecutado ninguna modificación de datos en producción.**