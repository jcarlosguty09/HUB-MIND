# Finanzas — transición segura y pruebas pendientes

Esta propuesta agrega un historial de eventos y una RPC `finance_transition_transaction` que confirma borradores o anula movimientos bajo bloqueo de fila y autorización de `is_org_master_admin`.

**NO EJECUTAR AÚN**. La migración inicial de Finanzas ya existe en Supabase. Revisar propietarios de funciones, roles, grants y pruebas en staging antes de ejecutar esta nueva propuesta.

## Pruebas de aceptación
- Atleta, coach, sales, admin y anónimo: SELECT/INSERT y RPC financiera denegados.
- Master admin de otra organización: no puede leer ni transicionar movimientos ajenos.
- Master admin propio: crear borrador, confirmar una vez, anular con motivo; eventos trazables.
- No confirmar dos veces, no anular dos veces, no borrar ni editar movimientos confirmados.
- Confirmar que las vistas/reportes antiguos no filtran `amount_paid` a roles no autorizados.
- La métrica inicial es resultado de caja, no utilidad neta.
