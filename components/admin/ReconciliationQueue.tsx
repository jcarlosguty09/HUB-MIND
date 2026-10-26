"use client";

import React, { useMemo, useState } from "react";
import { filterCheckins, validateAction, buildAction } from "./reconciliation-logic.mjs";

/**
 * Admin review queue for unresolved check-ins.
 *
 * Data access and authorization MUST be enforced server-side. The component
 * intentionally does not call Supabase directly or mutate membership credits.
 */
export type PendingCheckin = {
  id: string;
  organization_id: string;
  timestamp: string;
  user_id: null;
  is_manual: boolean | null;
  manual_name: string | null;
  zk_user_id: string | null;
  device_sn: string | null;
};

export type MemberCandidate = {
  id: string;
  full_name: string;
};

export type ReconciliationAction =
  | { checkinId: string; decision: "link_member"; targetUserId: string; reason: string }
  | { checkinId: string; decision: "visitor" | "test" | "defer"; reason: string };

export type ReconciliationQueueProps = {
  checkins: PendingCheckin[];
  members: MemberCandidate[]; // server-filtered to the active organization
  onResolve: (action: ReconciliationAction) => Promise<void>;
  onRefresh: () => Promise<void> | void;
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  background: "#fff",
  color: "#0f172a",
};

export default function ReconciliationQueue({
  checkins,
  members,
  onResolve,
  onRefresh,
}: ReconciliationQueueProps) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<"all" | "manual" | "biometric">("all");
  const [selected, setSelected] = useState<PendingCheckin | null>(null);
  const [decision, setDecision] = useState<"link_member" | "visitor" | "test" | "defer">("link_member");
  const [targetUserId, setTargetUserId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const rows = useMemo(() => filterCheckins(checkins, query, source) as PendingCheckin[], [checkins, query, source]);

  const sortedMembers = useMemo(() => {
    // Never infer a match as authorization to reconcile.
    return [...members].sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [members]);

  function open(row: PendingCheckin) {
    setSelected(row);
    setDecision("link_member");
    setTargetUserId("");
    setReason("");
    setError(null);
    setSuccess(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validateAction({ selected, busy, decision, targetUserId, reason, members });
    if (validationError) { setError(validationError); return; }
    setBusy(true);
    setError(null);
    try {
      const action = buildAction({ selected, decision, targetUserId, reason }) as ReconciliationAction;
      await onResolve(action);
      await onRefresh();
      setSelected(null);
      setSuccess("Decisión registrada. La lista se ha actualizado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar. Actualiza y revisa el registro.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ maxWidth: 1050, margin: "0 auto", padding: 24, fontFamily: "inherit" }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ marginBottom: 6 }}>Conciliación de asistencias</h1>
        <p style={{ color: "#64748b" }}>
          {checkins.length} pendientes · {checkins.filter((c) => c.is_manual).length} manuales ·{" "}
          {checkins.filter((c) => !c.is_manual).length} biométricas
        </p>
      </header>

      {success && <p role="status" style={{ color: "#166534" }}>{success}</p>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <label style={{ flex: "1 1 260px" }}>
          Buscar asistencia
          <input style={inputStyle} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nombre, PIN, dispositivo o ID" />
        </label>
        <label style={{ flex: "0 1 200px" }}>
          Origen
          <select style={inputStyle} value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
            <option value="all">Todos</option>
            <option value="manual">Manuales</option>
            <option value="biometric">Biométricos</option>
          </select>
        </label>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", textAlign: "left" }}>
          <thead>
            <tr>{["Fecha", "Origen", "Identificador", "Dispositivo", "Acción"].map((h) => (
              <th key={h} style={{ borderBottom: "1px solid #cbd5e1", padding: 12 }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td style={{ padding: 12, borderBottom: "1px solid #e2e8f0" }}>
                  {new Date(c.timestamp).toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}
                </td>
                <td style={{ padding: 12, borderBottom: "1px solid #e2e8f0" }}>{c.is_manual ? "Manual" : "Biométrico"}</td>
                <td style={{ padding: 12, borderBottom: "1px solid #e2e8f0" }}>{c.manual_name || (c.zk_user_id ? `PIN ${c.zk_user_id}` : "Sin identificar")}</td>
                <td style={{ padding: 12, borderBottom: "1px solid #e2e8f0" }}>{c.device_sn || "—"}</td>
                <td style={{ padding: 12, borderBottom: "1px solid #e2e8f0" }}>
                  <button type="button" onClick={() => open(c)}>Revisar</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} style={{ padding: 20 }}>No hay registros con estos filtros.</td></tr>}
          </tbody>
        </table>
      </div>

      {selected && (
        <div role="dialog" aria-modal="true" aria-label="Resolver asistencia" style={{
          position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.55)",
          display: "grid", placeItems: "center", padding: 16,
        }}>
          <form onSubmit={submit} style={{
            background: "#fff", color: "#0f172a", borderRadius: 14, padding: 24,
            width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto",
          }}>
            <h2>Resolver asistencia</h2>
            <p>{selected.manual_name || `PIN ${selected.zk_user_id || "desconocido"}`} · {new Date(selected.timestamp).toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}</p>
            <p style={{ fontSize: 12, overflowWrap: "anywhere", color: "#64748b" }}>ID: {selected.id}</p>
            <label>
              Decisión
              <select style={inputStyle} value={decision} onChange={(e) => { setDecision(e.target.value as typeof decision); setTargetUserId(""); }}>
                <option value="link_member">Vincular a un miembro</option>
                <option value="visitor">Registrar como visitante</option>
                <option value="test">Marcar como prueba</option>
                <option value="defer">Posponer / investigar</option>
              </select>
            </label>
            {decision === "link_member" && (
              <label style={{ display: "block", marginTop: 14 }}>
                Miembro confirmado
                <select style={inputStyle} value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)} required>
                  <option value="">Seleccionar miembro…</option>
                  {sortedMembers.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                </select>
                <small>Verifica identidad y duplicados antes de guardar. La selección no es una coincidencia automática.</small>
              </label>
            )}
            <label style={{ display: "block", marginTop: 14 }}>
              Evidencia / motivo (obligatorio)
              <textarea style={inputStyle} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} placeholder="Ej. Confirmado por administración y registro de recepción…" />
            </label>
            {error && <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>}
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 18 }}>
              <button type="button" disabled={busy} onClick={() => setSelected(null)}>Cancelar</button>
              <button type="submit" disabled={busy}>{busy ? "Guardando…" : "Confirmar decisión"}</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
