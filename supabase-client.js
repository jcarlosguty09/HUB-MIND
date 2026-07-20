// supabase-client.js — HUB MIND v3 (with Auth)

const SUPABASE_URL  = 'https://lvygabtezorvdcbmclxn.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2eWdhYnRlem9ydmRjYm1jbHhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3NTcyMTcsImV4cCI6MjA5ODMzMzIxN30.Nh0QWZPYfoB5imz6akSvKLkVUkV2oXKpP-RfxfAoiU0';

// ---- AUTH ----
const Auth = {
  _session: null,

  async signIn(email, password, remember = true) {
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
    // Always save to localStorage — "remember me" controls whether we clear on logout
    localStorage.setItem('hm-session', JSON.stringify(data));
    localStorage.setItem('hm-remember', remember ? '1' : '0');
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
    localStorage.removeItem('hm-remember');
  },

  loadSession() {
    const saved = localStorage.getItem('hm-session');
    if (saved) {
      try { this._session = JSON.parse(saved); } catch { this._session = null; }
    }
    return this._session;
  },

  // Refresh the access token using the refresh token
  async refreshSession() {
    const refreshToken = this._session?.refresh_token;
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      this._session = data;
      localStorage.setItem('hm-session', JSON.stringify(data));
      return true;
    } catch { return false; }
  },

  // Check if access token is expired (with 60s buffer)
  isTokenExpired() {
    const expiresAt = this._session?.expires_at;
    if (!expiresAt) return true;
    return Date.now() / 1000 > expiresAt - 60;
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

// ---- SCORES ----
const ScoreAPI = {
  // Save score (admin/coach can pass any userId; atleta uses their own)
  async save(date, classId, userId, score, scoreType = 'high') {
    try {
      const token = Auth.getToken();
      const res = await fetch(`${SUPABASE_URL}/rest/v1/wod_scores?on_conflict=date,class_id,user_id`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({ 
          date, class_id: classId, user_id: userId, 
          score, score_type: scoreType,
          updated_at: new Date().toISOString() 
        }),
      });
      return res.ok;
    } catch(e) { console.error('ScoreAPI.save:', e); return false; }
  },

  // Get all scores for a date+class (for leaderboard)
  async getLeaderboard(date, classId) {
    try {
      const rows = await sbReq('GET', `wod_scores?select=*&date=eq.${date}&class_id=eq.${classId}&order=score.desc`);
      return rows || [];
    } catch(e) { return []; }
  },

  // Get scores for a specific user on a date
  async getForDate(date) {
    try {
      const userId = Auth.getUser()?.id;
      const rows = await sbReq('GET', `wod_scores?select=*&date=eq.${date}&user_id=eq.${userId}`);
      const map = {};
      for (const r of rows) map[r.class_id] = { score: r.score, scoreType: r.score_type };
      return map;
    } catch(e) { return {}; }
  },

  // Delete a score
  async delete(date, classId, userId) {
    try {
      const token = Auth.getToken();
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/wod_scores?date=eq.${date}&class_id=eq.${classId}&user_id=eq.${userId}`,
        {
          method: 'DELETE',
          headers: {
            'apikey': SUPABASE_ANON,
            'Authorization': `Bearer ${token}`,
          },
        }
      );
      return res.ok;
    } catch(e) { return false; }
  },
};

// ---- ATHLETES ----
const AthleteAPI = {
  _cache: null,
  async list() {
    if (this._cache) return this._cache;
    try {
      const rows = await sbReq('GET', 'athlete_profiles?select=*&order=display_name.asc');
      this._cache = rows || [];
      return this._cache;
    } catch(e) { console.warn('AthleteAPI.list:', e.message); return []; }
  },
};

// ---- PASSWORD CHANGE ----
const PasswordAPI = {
  async change(newPassword) {
    const token = Auth.getToken();
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        'apikey': SUPABASE_ANON,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password: newPassword }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Error al cambiar contraseña');
    }
    return true;
  },
};

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
  // data model: wod_days.sections = { crossfit:[...], hyrox:[...], ... }
  async getMonth(yearMonth) {
    const start = `${yearMonth}-01`;
    const d = new Date(yearMonth + '-01'); d.setMonth(d.getMonth() + 1);
    const end = d.toISOString().slice(0, 10);
    try {
      const rows = await sbReq('GET', `wod_days?select=*&date=gte.${start}&date=lt.${end}&order=date.asc`);
      const map = {};
      for (const row of rows) {
        const raw = typeof row.sections === 'string' ? JSON.parse(row.sections) : (row.sections || {});
        // Support both old array format and new object format
        map[row.date] = Array.isArray(raw) ? {} : raw;
      }
      return map;
    } catch (e) { console.warn('getMonth:', e.message); return {}; }
  },

  async saveDay(date, dayData) {
    try {
      const token = Auth.getToken();
      const body = { date, sections: JSON.stringify(dayData), updated_at: new Date().toISOString() };
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
      if (!res.ok) { const err = await res.json().catch(() => ({})); console.error('saveDay:', res.status, err); return false; }
      return true;
    } catch (e) { console.error('saveDay exception:', e.message); return false; }
  },

  async getHistory(limit = 60) {
    try {
      const rows = await sbReq('GET', `wod_days?select=*&order=date.desc&limit=${limit}`);
      return rows.map(r => {
        const raw = typeof r.sections === 'string' ? JSON.parse(r.sections) : (r.sections || {});
        return { date: r.date, data: Array.isArray(raw) ? {} : raw };
      });
    } catch (e) { console.warn('getHistory:', e.message); return []; }
  },
};
