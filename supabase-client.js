// supabase-client.js — HUB MIND v3 (with Auth)

const SUPABASE_URL  = 'https://lvygabtezorvdcbmclxn.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2eWdhYnRlem9ydmRjYm1jbHhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3NTcyMTcsImV4cCI6MjA5ODMzMzIxN30.Nh0QWZPYfoB5imz6akSvKLkVUkV2oXKpP-RfxfAoiU0';

// ---- AUTH ----
const Auth = {
  _session: null,

  async signIn(email, password) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.message || 'Error al iniciar sesión');
    this._session = data;
    localStorage.setItem('hm-session', JSON.stringify(data));
    return data;
  },

  async signOut() {
    const token = this.getToken();
    if (token) {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${token}` },
      }).catch(() => {});
    }
    this._session = null;
    localStorage.removeItem('hm-session');
  },

  loadSession() {
    const saved = localStorage.getItem('hm-session');
    if (saved) {
      try { this._session = JSON.parse(saved); } catch { this._session = null; }
    }
    return this._session;
  },

  getToken() {
    return this._session?.access_token || null;
  },

  getUser() {
    return this._session?.user || null;
  },

  isLoggedIn() {
    return !!this.getToken();
  },
};

// ---- DB REQUEST (authenticated) ----
async function sbReq(method, path, body = null, prefer = 'return=representation') {
  const token = Auth.getToken();
  if (!token) throw new Error('No autenticado');
  const opts = {
    method,
    headers: {
      'apikey':        SUPABASE_ANON,
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
      'Prefer':        prefer,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, opts);
  if (res.status === 401) {
    Auth.signOut();
    window.location.reload();
    throw new Error('Sesión expirada');
  }
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.message || `HTTP ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

// ---- ROLE ----
const RoleAPI = {
  async getRole() {
    try {
      const userId = Auth.getUser()?.id;
      if (!userId) return 'coach';
      // select=role with RLS — token must be valid
      const rows = await sbReq('GET', `user_roles?select=role&id=eq.${userId}&limit=1`);
      const role = rows?.[0]?.role;
      console.log('[Role] userId:', userId, 'role:', role);
      return role || 'coach';
    } catch(e) {
      console.warn('[Role] getRole error:', e.message);
      return 'coach';
    }
  },
};

// ---- WOD API ----
const WodAPI = {
  async getMonth(yearMonth) {
    const start = `${yearMonth}-01`;
    const d = new Date(yearMonth + '-01'); d.setMonth(d.getMonth() + 1);
    const end = d.toISOString().slice(0, 10);
    try {
      const rows = await sbReq('GET', `wod_days?select=*&date=gte.${start}&date=lt.${end}&order=date.asc`);
      const map = {};
      for (const row of rows) {
        map[row.date] = typeof row.sections === 'string' ? JSON.parse(row.sections) : (row.sections || []);
      }
      return map;
    } catch (e) { console.warn('getMonth:', e.message); return {}; }
  },

  async saveDay(date, sections) {
    try {
      const token = Auth.getToken();
      const body = { date, sections: JSON.stringify(sections), updated_at: new Date().toISOString() };
      
      // Try upsert first
      const res = await fetch(`${SUPABASE_URL}/rest/v1/wod_days?on_conflict=date`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('saveDay error:', res.status, err);
        return false;
      }
      return true;
    } catch (e) { console.error('saveDay exception:', e.message); return false; }
  },

  async getHistory(limit = 60) {
    try {
      const rows = await sbReq('GET', `wod_days?select=*&order=date.desc&limit=${limit}`);
      return rows.map(r => ({
        date: r.date,
        sections: typeof r.sections === 'string' ? JSON.parse(r.sections) : (r.sections || []),
      }));
    } catch (e) { console.warn('getHistory:', e.message); return []; }
  },
};
