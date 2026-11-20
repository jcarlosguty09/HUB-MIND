// HUB MIND — Instagram CRM visual inbox (inbound and outbound history)
(() => {
  'use strict';
  let conversations = [], selected = null, busy = false, poller = null, threadRequest = 0, sending = false;
  let visibleLimit = 100;
  const drafts = new Map();
  const sendStatuses = new Map();
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date = v => { if (!v) return ''; const d = new Date(v); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-MX', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}); };
  function shell() {
    const root = $('crm-instagram-inbox'); if (!root) return null;
    root.innerHTML = '<div class="ig-head"><div><h3><i class="ti ti-brand-instagram"></i> Instagram · Mensajes</h3><p>Conversaciones conectadas al CRM</p></div><button type="button" class="secondary-btn" id="ig-refresh"><i class="ti ti-refresh"></i> Actualizar</button></div><div class="ig-layout"><div><div id="ig-conversations" class="ig-list" aria-label="Conversaciones"></div><p id="ig-list-count" class="ig-muted" role="status"></p><button type="button" id="ig-load-more" class="secondary-btn" hidden>Cargar conversaciones anteriores</button></div><div id="ig-thread" class="ig-thread" aria-live="polite"></div></div>';
    $('ig-refresh').addEventListener('click', () => render(true));
    $('ig-load-more').addEventListener('click', () => render(true, visibleLimit + 100));
    return root;
  }
  async function openThread(id) {
    const oldInput = $('ig-reply-text');
    if (selected && oldInput) drafts.set(selected, oldInput.value);
    selected = id;
    const requestId = ++threadRequest;
    const pane = $('ig-thread'); if (!pane) return;
    const conversation = conversations.find(x => x.id === id);
    // Preserve the current composer while refreshing the selected conversation.
    const existingComposer = pane.querySelector('#ig-compose');
    const composerWasFocused = document.activeElement?.id === 'ig-reply-text';
    if (!existingComposer || !composerWasFocused) pane.innerHTML = '<div class="ig-thread-title">'+esc(conversation?.instagram_sender_id || 'Conversación')+'</div><p class="ig-muted">Cargando mensajes…</p>';
    document.querySelectorAll('.ig-conversation').forEach(x => x.classList.toggle('active', x.dataset.id === id));
    try {
      const messages = await InstagramCRMAPI.listMessages(id);
      if (requestId !== threadRequest || selected !== id || !$('ig-thread')) return;
      pane.innerHTML = '<div class="ig-thread-title">'+esc(conversation?.instagram_sender_id || 'Conversación')+'</div><div class="ig-messages">'+(messages.length ? messages.map(m => '<div class="ig-message '+(m.direction === 'outbound' ? 'outbound' : 'inbound')+'"><div>'+esc(m.body || (m.message_type === 'attachment' ? 'Adjunto recibido' : 'Mensaje sin texto'))+'</div><small>'+esc(date(m.instagram_timestamp || m.created_at))+'</small></div>').join('') : '<p class="ig-muted">Aún no hay mensajes en esta conversación.</p>')+'</div><form id="ig-compose" class="ig-compose"><label for="ig-reply-text">Responder a esta conversación</label><textarea id="ig-reply-text" rows="2" maxlength="1000" placeholder="Escribe una respuesta…" required></textarea><div class="ig-compose-actions"><small id="ig-send-status">Las respuestas confirmadas se guardan en el historial.</small><button type="submit" class="save-btn" id="ig-send-btn">Enviar</button></div></form>';
      const scroll = pane.querySelector('.ig-messages'); if (scroll) scroll.scrollTop = scroll.scrollHeight;
      const input = pane.querySelector('#ig-reply-text');
      if (input) {
        input.value = drafts.get(id) || '';
        input.addEventListener('input', () => drafts.set(id, input.value));
      }
      const savedStatus = sendStatuses.get(id);
      if (savedStatus && pane.querySelector('#ig-send-status')) pane.querySelector('#ig-send-status').textContent = savedStatus;
      if (sending && pane.querySelector('#ig-send-btn')) pane.querySelector('#ig-send-btn').disabled = true;
      const form = pane.querySelector('#ig-compose');
      form?.addEventListener('submit', async event => {
        event.preventDefault();
        if (sending || selected !== id) return;
        const input = form.querySelector('#ig-reply-text');
        const button = form.querySelector('#ig-send-btn');
        const status = form.querySelector('#ig-send-status');
        const message = input.value.trim();
        if (!message) return;
        sending = true; button.disabled = true; status.textContent = 'Enviando…';
        try {
          const result = await InstagramCRMAPI.sendMessage(id, message);
          input.value = '';
          drafts.delete(id);
          status.textContent = result.persisted ? 'Enviado y registrado.' : 'Enviado a Instagram, pero no se pudo guardar en el historial. No lo reenvíes.';
          sendStatuses.set(id, status.textContent);
          if (result.persisted && selected === id) await openThread(id);
        } catch (error) {
          status.textContent = 'No enviado: ' + (error?.message || 'Error de conexión');
          sendStatuses.set(id, status.textContent);
        } finally {
          sending = false;
          button.disabled = false;
          if (selected === id && $('ig-send-btn')) $('ig-send-btn').disabled = false;
        }
      });
    } catch (e) { if (requestId === threadRequest && selected === id && $('ig-thread')) pane.innerHTML = '<p class="ig-error">No se pudieron cargar los mensajes. Revisa permisos RLS y conexión.</p>'; console.warn('Instagram inbox messages:',e); }
  }
  async function render(force = false, requestedLimit = visibleLimit) {
    if (busy || !$('crm-instagram-inbox')) return;
    const root = $('crm-instagram-inbox');
    if (!force && (document.hidden || !root.closest('.view.active'))) return;
    busy = true;
    if ($('ig-load-more')) $('ig-load-more').disabled = true;
    const firstLoad = !$('ig-conversations');
    if (firstLoad) {
      shell();
      $('ig-conversations').innerHTML = '<p class="ig-muted">Cargando conversaciones…</p>';
      $('ig-thread').innerHTML = '<p class="ig-muted">Selecciona una conversación para ver sus mensajes.</p>';
    }
    try {
      const rows = await InstagramCRMAPI.listConversations(requestedLimit);
      conversations = rows;
      visibleLimit = requestedLimit;
      if ($('ig-list-count')) $('ig-list-count').textContent = conversations.length + ' conversaciones cargadas';
      if ($('ig-load-more')) $('ig-load-more').hidden = conversations.length < visibleLimit;
      if (!$('ig-conversations')) return;
      $('ig-conversations').innerHTML = conversations.length ? conversations.map(c => '<button type="button" class="ig-conversation" data-id="'+esc(c.id)+'"><strong>'+esc(c.instagram_sender_id || 'Cuenta de Instagram')+'</strong><span>'+esc(c.last_message_preview || 'Sin vista previa')+'</span><small>'+esc(date(c.last_message_at))+'</small></button>').join('') : '<p class="ig-muted">Sin conversaciones todavía. Envía un DM de prueba a la cuenta conectada y actualiza.</p>';
      $('ig-conversations').querySelectorAll('.ig-conversation').forEach(btn => btn.addEventListener('click', () => openThread(btn.dataset.id)));
      // Avoid rebuilding the composer while typing or while an outbound request is in flight.
      if (selected && conversations.some(c => c.id === selected) && !sending && document.activeElement?.id !== 'ig-reply-text') await openThread(selected);
      else if (!selected && conversations.length) await openThread(conversations[0].id);
    } catch(e) { $('ig-conversations').innerHTML = '<p class="ig-error">No se pudo consultar Instagram. Verifica las tablas, permisos RLS y la conexión.</p>'; console.warn('Instagram inbox:',e); }
    finally { busy = false; if ($('ig-load-more')) $('ig-load-more').disabled = false; }
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
