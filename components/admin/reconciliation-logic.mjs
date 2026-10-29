export function filterCheckins(checkins, query, source) {
  const needle = query.trim().toLocaleLowerCase();
  return checkins.filter(c => {
    const manual = c.is_manual === true;
    if (source === 'manual' && !manual) return false;
    if (source === 'biometric' && manual) return false;
    return [c.manual_name, c.zk_user_id, c.device_sn, c.id].filter(Boolean).join(' ').toLocaleLowerCase().includes(needle);
  });
}
export function validateAction({selected, busy, decision, targetUserId, reason, members}) {
  if (!selected || busy) return 'Operación no disponible.';
  if (reason.trim().length < 3) return 'Explica la evidencia o el motivo (mínimo 3 caracteres).';
  if (decision === 'link_member' && !targetUserId) return 'Selecciona un usuario existente.';
  if (decision === 'link_member' && !members.some(m => m.id === targetUserId)) return 'El usuario seleccionado no pertenece a la lista autorizada.';
  return null;
}
export function buildAction({selected, decision, targetUserId, reason}) {
  if (decision === 'link_member') return {checkinId:selected.id, decision, targetUserId, reason:reason.trim()};
  return {checkinId:selected.id, decision, reason:reason.trim()};
}
