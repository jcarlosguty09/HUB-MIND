# HUB MIND | Conciliación definitiva

## Fuente de verdad
Supabase es el estado actual. El libro **HUB_MIND_Conciliacion_Inteligente_V2 (2).xlsx** es una fotografía histórica, NO un archivo para importar automáticamente.

## Estructura encontrada en el libro
- **Usuarios APP - MAESTRO**: 162 filas de usuarios con `user_id APP`, email, teléfono, rol, canal, plan, vigencia e IDs biométricos.
- **Excel - Conciliacion**: 232 filas originales, decisión humana, resultado actualizado, motivo y `user_id APP FINAL`.
- **Revisiones**: 132 registros a revisar, incluyendo SEPARAR e INVESTIGAR.
- **Resumen y reglas**: 100 usuarios APP vinculados y 62 APP ausentes del Excel original.
- **Sugerencias inteligentes**: candidatos no autorizados para vinculación automática.
- **Guía de revisión V2**: reglas de seguridad y prioridad de APP.

## Reglas no negociables
1. Nunca sobrescribir automáticamente el `user_id`, email, rol, plan, fecha de vencimiento o créditos actuales con información histórica del Excel.
2. Respetar vínculos confirmados, pero verificar que todavía existan en la base actual.
3. Mantener SEPARAR e INVESTIGAR como decisiones explícitas, nunca vincular por similitud sin aprobación humana.
4. No crear usuarios ni eliminar duplicados sin una acción revisada, autorizada y auditada.
5. Registrar origen, fecha, operador, decisión y razón de cada cambio de conciliación.
6. Exportación completa desde Supabase con paginación; el Excel es un producto de la app, no su base de datos.
7. Créditos por ledger: no tratar `amount_paid` como ingreso confirmado.

## Fases
A. Ejecutar auditoría de solo lectura y revisar los conteos.
B. Comparar exportación actual contra los 162 IDs y 232 filas del libro (sin modificar producción).
C. Diseñar tabla de decisiones y vista administrativa con control de roles.
D. Implementar resolución individual, historial de auditoría y exportación completa desde la app.
E. Verificar igualdad de conteos y saldos entre app, SQL y Excel exportado.

## Pendiente
La conexión GitHub no da acceso de lectura a las filas vivas de Supabase. Es imprescindible comparar el resultado de las consultas con una exportación actual de la app antes de proponer cambios de datos.
