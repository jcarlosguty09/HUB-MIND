// HUB MIND — Instagram CRM visual inbox (inbound and outbound history)
(() => {
  'use strict';
  let conversations = [], selected = null, busy = false, poller = null, threadRequest = 0, sending = false;
  let visibleLimit = 100;
  const drafts = new Map();
  const sendStatuses = new Map();
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  // Only render outbound images from our dedicated public Storage bucket.
  // Never treat arbitrary message text as an image URL.
  const outboundImage = message => {
    if (message.direction !== 'outbound' || typeof message.body !== 'string') return null;
    const prefix = '[Imagen enviada] ';
    if (!message.body.startsWith(prefix)) return null;
    try {
      const url = new URL(message.body.slice(prefix.length));
      const storage = new URL(SUPABASE_URL);
      if (url.protocol !== 'https:' || url.origin !== storage.origin ||
          !/^\/storage\/v1\/object\/public\/crm-instagram-outbound\/[a-f0-9-]{36}\.jpg$/i.test(url.pathname) ||
          url.search || url.hash) return null;
      return url.href;
    } catch { return null; }
  };
  const renderMessageBody = message => {
    const imageUrl = outboundImage(message);
    if (imageUrl) return '<a href="' + esc(imageUrl) + '" target="_blank" rel="noopener noreferrer" title="Abrir imagen en tamaño completo">' +
      '<img src="' + esc(imageUrl) + '" alt="Imagen enviada por Instagram" loading="lazy" style="display:block;max-width:240px;max-height:300px;width:auto;height:auto;border-radius:10px;object-fit:contain" onerror="this.style.display=\'none\';this.parentNode.insertAdjacentText(\'beforeend\',\'Imagen no disponible\')" />' +
      '</a>';
    return esc(message.body || (message.message_type === 'attachment' ? 'Adjunto recibido' : 'Mensaje sin texto'));
  };
  const date = v => { if (!v) return ''; const d = new Date(v); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-MX', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}); };
  const profiles = new Map();
  const attemptedProfiles = new Map();
  let loadingProfiles = false;
  let retryProfilesAfter = 0;

  function contactLabel(id) {
    const profile = profiles.get(id);
    const name = profile?.name?.trim();
    const username = profile?.username?.trim().replace(/^@/, '');
    if (name && username && name.toLowerCase() !== username.toLowerCase()) return name + ' · @' + username;
    return (username ? '@' + username : name) || 'Cuenta de Instagram';
  }

  async function refreshProfiles() {
    if (loadingProfiles || !$('crm-instagram-inbox')?.open || Date.now() < retryProfilesAfter) return;
    const ids = [...new Set([selected, ...conversations.map(row => row.id)])]
      .filter(id => id && !profiles.has(id) && (attemptedProfiles.get(id) || 0) < Date.now())
      .slice(0, 10);
    if (!ids.length) return;

    loadingProfiles = true;
    try {
      const rows = await InstagramCRMAPI.listProfiles(ids);
      ids.forEach(id => attemptedProfiles.set(id, Date.now() + 10 * 60 * 1000));
      rows.forEach(profile => profiles.set(profile.id, profile));
      $('ig-conversations').querySelectorAll('.ig-conversation').forEach(button => {
        button.querySelector('strong').textContent = contactLabel(button.dataset.id);
      });
      const title = $('ig-thread').querySelector('.ig-thread-title');
      if (title && selected) title.textContent = contactLabel(selected);
    } catch {
      retryProfilesAfter = Date.now() + 60 * 1000;
    } finally {
      loadingProfiles = false;
    }
  }

  function shell() {
    const root = $('crm-instagram-inbox'); if (!root) return null;
    root.innerHTML = '<div class="ig-head"><div><h3><i class="ti ti-brand-instagram"></i> Instagram · Mensajes</h3><p>Conversaciones conectadas al CRM</p></div><div class="ig-head-actions"><button type="button" class="secondary-btn" id="ig-refresh"><i class="ti ti-refresh"></i> Actualizar</button><button type="button" class="icon-btn" id="ig-close" aria-label="Cerrar Instagram"><i class="ti ti-x"></i></button></div></div><div class="ig-layout"><div class="ig-list-panel"><div id="ig-conversations" class="ig-list" aria-label="Conversaciones"></div><p id="ig-list-count" class="ig-muted" role="status"></p><button type="button" id="ig-load-more" class="secondary-btn" hidden>Cargar conversaciones anteriores</button></div><div id="ig-thread" class="ig-thread" aria-live="polite"></div></div>';
    $('ig-close').addEventListener('click', () => root.close());
    $('ig-refresh').addEventListener('click', () => render(true));
    $('ig-load-more').addEventListener('click', () => render(true, visibleLimit + 100));
    return root;
  }
  async function openThread(id) {
    const oldInput = $('ig-reply-text');
    if (selected && oldInput) drafts.set(selected, oldInput.value);
    selected = id;
    void refreshProfiles();
    const requestId = ++threadRequest;
    const pane = $('ig-thread'); if (!pane) return;
    // Preserve the current composer while refreshing the selected conversation.
    const existingComposer = pane.querySelector('#ig-compose');
    const composerWasFocused = document.activeElement?.id === 'ig-reply-text';
    if (!existingComposer || !composerWasFocused) pane.innerHTML = '<div class="ig-thread-title">'+esc(contactLabel(id))+'</div><p class="ig-muted">Cargando mensajes…</p>';
    document.querySelectorAll('.ig-conversation').forEach(x => x.classList.toggle('active', x.dataset.id === id));
    try {
      const messages = await InstagramCRMAPI.listMessages(id);
      if (requestId !== threadRequest || selected !== id || !$('ig-thread')) return;
      pane.innerHTML = '<div class="ig-thread-title">'+esc(contactLabel(id))+'</div><div class="ig-messages">'+(messages.length ? messages.map(m => '<div class="ig-message '+(m.direction === 'outbound' ? 'outbound' : 'inbound')+'"><div>'+renderMessageBody(m)+'</div><small>'+esc(date(m.instagram_timestamp || m.created_at))+'</small></div>').join('') : '<p class="ig-muted">Aún no hay mensajes en esta conversación.</p>')+'</div><form id="ig-compose" class="ig-compose"><label for="ig-reply-text">Responder a esta conversación</label><textarea id="ig-reply-text" rows="2" maxlength="1000" placeholder="Escribe una respuesta…" required></textarea><div class="ig-compose-actions"><small id="ig-send-status">Las respuestas confirmadas se guardan en el historial.</small><label for="ig-image-file" class="secondary-btn" style="cursor:pointer">📎 JPG</label><input type="file" id="ig-image-file" accept="image/jpeg" style="display:none"><button type="submit" class="save-btn" id="ig-send-btn">Enviar</button></div></form>';
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
      form?.querySelector('#ig-image-file')?.addEventListener('change', async event => {
        const file = event.target.files?.[0];
        if (!file || sending || selected !== id) return;
        const status = form.querySelector('#ig-send-status');
        const button = form.querySelector('#ig-send-btn');
        sending = true; button.disabled = true; status.textContent = 'Enviando imagen…';
        try {
          const result = await InstagramCRMAPI.sendImage(id, file);
          status.textContent = result.persisted ? 'Imagen enviada y registrada.' : 'Imagen enviada, pero no registrada. No la reenvíes.';
          sendStatuses.set(id, status.textContent);
          if (result.persisted && selected === id) await openThread(id);
        } catch (error) {
          status.textContent = 'No enviado: ' + (error?.message || 'Error de conexión');
          sendStatuses.set(id, status.textContent);
        } finally {
          sending = false; button.disabled = false;
          if (event.target.isConnected) event.target.value = '';
        }
      });
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
    if (busy || !$('crm-instagram-inbox')?.open || (!force && document.hidden)) return;
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
      $('ig-conversations').innerHTML = conversations.length ? conversations.map(c => '<button type="button" class="ig-conversation" data-id="'+esc(c.id)+'"><strong>'+esc(contactLabel(c.id))+'</strong><span>'+esc(c.last_message_preview || 'Sin vista previa')+'</span><small>'+esc(date(c.last_message_at))+'</small></button>').join('') : '<p class="ig-muted">Sin conversaciones todavía. Envía un DM de prueba a la cuenta conectada y actualiza.</p>';
      $('ig-conversations').querySelectorAll('.ig-conversation').forEach(btn => btn.addEventListener('click', () => openThread(btn.dataset.id)));
      // Avoid rebuilding the composer while typing or while an outbound request is in flight.
      if (selected && conversations.some(c => c.id === selected) && !sending && document.activeElement?.id !== 'ig-reply-text') await openThread(selected);
      else if (!selected && conversations.length) await openThread(conversations[0].id);
      void refreshProfiles();
    } catch(e) { $('ig-conversations').innerHTML = '<p class="ig-error">No se pudo consultar Instagram. Verifica las tablas, permisos RLS y la conexión.</p>'; console.warn('Instagram inbox:',e); }
    finally { busy = false; if ($('ig-load-more')) $('ig-load-more').disabled = false; }
  }
  function startPolling() {
    if (poller) return;
    poller = setInterval(() => {
      render();
    }, 15000);
  }
  const trigger = $('crm-instagram-inbox-btn');
  const dialog = $('crm-instagram-inbox');
  trigger?.addEventListener('click', () => {
    if (!dialog || dialog.open) return;
    dialog.showModal();
    render(true);
    $('ig-close')?.focus();
    startPolling();
  });
  dialog?.addEventListener('close', () => {
    clearInterval(poller);
    poller = null;
    trigger?.focus();
  });
  window.InstagramInbox = { render };
})();
