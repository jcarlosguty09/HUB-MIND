// HUB MIND — Instagram CRM visual inbox (read-only until outbound integration is verified)
(() => {
  'use strict';
  let conversations = [], selected = null, busy = false, poller = null, threadRequest = 0;
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date = v => { if (!v) return ''; const d = new Date(v); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-MX', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}); };
  function shell() {
    const root = $('crm-instagram-inbox'); if (!root) return null;
    root.innerHTML = '<div class="ig-head"><div><h3><i class="ti ti-brand-instagram"></i> Instagram · Mensajes</h3><p>Conversaciones conectadas al CRM</p></div><button type="button" class="secondary-btn" id="ig-refresh"><i class="ti ti-refresh"></i> Actualizar</button></div><div class="ig-layout"><div id="ig-conversations" class="ig-list" aria-label="Conversaciones"></div><div id="ig-thread" class="ig-thread" aria-live="polite"></div></div>';
    $('ig-refresh').addEventListener('click', () => render(true));
    return root;
  }
  async function openThread(id) {
    selected = id;
    const requestId = ++threadRequest;
    const pane = $('ig-thread'); if (!pane) return;
    const conversation = conversations.find(x => x.id === id);
    pane.innerHTML = '<div class="ig-thread-title">'+esc(conversation?.instagram_sender_id || 'Conversación')+'</div><p class="ig-muted">Cargando mensajes…</p>';
    document.querySelectorAll('.ig-conversation').forEach(x => x.classList.toggle('active', x.dataset.id === id));
    try {
      const messages = await InstagramCRMAPI.listMessages(id);
      if (requestId !== threadRequest || selected !== id || !$('ig-thread')) return;
      pane.innerHTML = '<div class="ig-thread-title">'+esc(conversation?.instagram_sender_id || 'Conversación')+'</div><div class="ig-messages">'+(messages.length ? messages.map(m => '<div class="ig-message '+(m.direction === 'outbound' ? 'outbound' : 'inbound')+'"><div>'+esc(m.body || (m.message_type === 'attachment' ? 'Adjunto recibido' : 'Mensaje sin texto'))+'</div><small>'+esc(date(m.instagram_timestamp || m.created_at))+'</small></div>').join('') : '<p class="ig-muted">Aún no hay mensajes en esta conversación.</p>')+'</div><div class="ig-compose-disabled"><i class="ti ti-lock"></i> Respuestas desde HUB MIND pendientes de habilitar y verificar con Meta.</div>';
      const scroll = pane.querySelector('.ig-messages'); if (scroll) scroll.scrollTop = scroll.scrollHeight;
    } catch (e) { if (requestId === threadRequest && selected === id && $('ig-thread')) pane.innerHTML = '<p class="ig-error">No se pudieron cargar los mensajes. Revisa permisos RLS y conexión.</p>'; console.warn('Instagram inbox messages:',e); }
  }
  async function render(force = false) {
    if (busy || !$('crm-instagram-inbox')) return;
    const root = $('crm-instagram-inbox');
    if (!force && (document.hidden || !root.closest('.view.active'))) return;
    busy = true;
    const firstLoad = !$('ig-conversations');
    if (firstLoad) {
      shell();
      $('ig-conversations').innerHTML = '<p class="ig-muted">Cargando conversaciones…</p>';
      $('ig-thread').innerHTML = '<p class="ig-muted">Selecciona una conversación para ver sus mensajes.</p>';
    }
    try {
      conversations = await InstagramCRMAPI.listConversations();
      if (!$('ig-conversations')) return;
      $('ig-conversations').innerHTML = conversations.length ? conversations.map(c => '<button type="button" class="ig-conversation" data-id="'+esc(c.id)+'"><strong>'+esc(c.instagram_sender_id || 'Cuenta de Instagram')+'</strong><span>'+esc(c.last_message_preview || 'Sin vista previa')+'</span><small>'+esc(date(c.last_message_at))+'</small></button>').join('') : '<p class="ig-muted">Sin conversaciones todavía. Envía un DM de prueba a la cuenta conectada y actualiza.</p>';
      $('ig-conversations').querySelectorAll('.ig-conversation').forEach(btn => btn.addEventListener('click', () => openThread(btn.dataset.id)));
      if (selected && conversations.some(c => c.id === selected)) await openThread(selected);
      else if (conversations.length) await openThread(conversations[0].id);
    } catch(e) { $('ig-conversations').innerHTML = '<p class="ig-error">No se pudo consultar Instagram. Verifica las tablas, permisos RLS y la conexión.</p>'; console.warn('Instagram inbox:',e); }
    finally { busy = false; }
  }
  function startPolling() {
    if (poller) return;
    poller = setInterval(() => {
      if (!document.hidden && $('crm-instagram-inbox')?.closest('.view.active')) render();
    }, 15000);
  }
  startPolling();
  window.InstagramInbox = { render };
})();
