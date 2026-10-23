# Finanzas: revisión previa de RPC

Esta propuesta NO ha sido ejecutada. Permite confirmar borradores o anular movimientos con motivo, bloquea la fila para evitar carreras y guarda eventos de auditoría.

## Pruebas obligatorias
- Verificar en Supabase el propietario de la función SECURITY DEFINER y su capacidad para actualizar finance_transactions.
- Comprobar denegación de SELECT, INSERT y RPC para usuarios anónimos, atleta, coach, sales y admin.
- Comprobar acceso de master_admin solo a su organización.
- Confirmar que un movimiento no pueda publicarse dos veces ni anularse dos veces.
- Confirmar que una anulación conserva el importe original y registra motivo y actor.
- Comprobar que no existan otros RPC o vistas que expongan finanzas.
- Validar en staging antes de aplicar en producción.

## Restricciones de alcance
No se modifican membresías existentes, no se importan importes históricos como cobros y no se exponen reportes financieros a admin.
