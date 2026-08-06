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
  async save(date, classId, userId, score, scoreType = 'high', category = 'rx', completed = false) {
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
          category, completed,
          updated_at: new Date().toISOString()
        }),
      });
      return res.ok;
    } catch(e) { console.error('ScoreAPI.save:', e); return false; }
  },
  // Get all scores for a date+class (for leaderboard)
  async getLeaderboard(date, classId) {
    try {
      const rows = await sbReq('GET', `wod_scores?select=*&date=eq.${date}&class_id=eq.${classId}`);
      return rows || [];
    } catch(e) { return []; }
  },
// Cambiar el tipo de orden (high/low) para todos los scores de un día+clase
  async setScoreType(date, classId, scoreType) {
    try {
      const token = Auth.getToken();
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/wod_scores?date=eq.${date}&class_id=eq.${classId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_ANON,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ score_type: scoreType }),
        }
      );
      return res.ok;
    } catch(e) { console.error('ScoreAPI.setScoreType:', e); return false; }
  },
  // Get all scores for a specific date (all classes)
  async getAllForDate(date) {
    try {
      const rows = await sbReq('GET', `wod_scores?select=*&date=eq.${date}`);
      return rows || [];
    } catch(e) { return []; }
  },

 // Get scores for a specific user on a date
  async getForDate(date) {
    try {
      const userId = Auth.getUser()?.id;
      const rows = await sbReq('GET', `wod_scores?select=*&date=eq.${date}&user_id=eq.${userId}`);
      const map = {};
      for (const r of rows) map[r.class_id] = {
        score: r.score,
        scoreType: r.score_type,
        category: r.category || 'rx',
        completed: r.completed || false,
      };
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

// ---- CHECKINS ----
const CheckinAPI = {
  async getForDate(date) {
    try {
      const start = `${date}T06:00:00`;
      const d = new Date(`${date}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      const nextDate = d.toISOString().slice(0, 10);
      const end = `${nextDate}T06:00:00`;

      const rows = await sbReq('GET',
        `checkins?select=*&timestamp=gte.${start}&timestamp=lt.${end}&order=timestamp.desc&limit=200`
      );
      return rows || [];
    } catch(e) { console.warn('CheckinAPI.getForDate:', e.message); return []; }
  },

  // Asignar (o quitar) la clase a la que asistió un check-in
  async assignClass(checkinId, classScheduleId) {
    try {
      const token = Auth.getToken();
      const res = await fetch(`${SUPABASE_URL}/rest/v1/checkins?id=eq.${checkinId}`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_ANON,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ assigned_class_id: classScheduleId || null }),
      });
      return res.ok;
    } catch(e) { console.error('CheckinAPI.assignClass:', e); return false; }
  },
// Check-in manual para gente nueva/sin perfil
  async createManual(name, phone, email) {
    try {
      const token = Auth.getToken();
      const res = await fetch(`${SUPABASE_URL}/rest/v1/checkins`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          is_manual: true,
          manual_name: name,
          manual_phone: phone || null,
          manual_email: email || null,
          verify_type: 'manual',
          timestamp: new Date().toISOString(),
        }),
      });
      return res.ok;
    } catch(e) { console.error('CheckinAPI.createManual:', e); return false; }
  },
  async subscribeToNew(callback) {
    return setInterval(async () => {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
      const rows = await CheckinAPI.getForDate(today);
      callback(rows);
    }, 10000);
  },
};

// ---- ATHLETES ----
const AthleteAPI = {
  _cache: null,
  async list() {
    if (this._cache) return this._cache;
    try {
      // Get athlete profiles merged with full names from profiles table
      const [athletes, profiles] = await Promise.all([
        sbReq('GET', 'athlete_profiles?select=*'),
        sbReq('GET', 'profiles?select=id,full_name,avatar_url'),
      ]);
      const profileMap = {};
      (profiles || []).forEach(p => { profileMap[p.id] = p; });
      this._cache = (athletes || []).map(a => ({
        ...a,
        display_name: profileMap[a.id]?.full_name || a.display_name,
        avatar_url:   profileMap[a.id]?.avatar_url || null,
      })).sort((a, b) => a.display_name.localeCompare(b.display_name));
      return this._cache;
    } catch(e) { console.warn('AthleteAPI.list:', e.message); return []; }
  },
  clearCache() { this._cache = null; },
};

// ---- CREATE USER (admin/coach via Edge Function) ----
const AdminAPI = {
  async createUser(email, password, role, fullName) {
    try {
      // Use the existing create-users edge function logic via direct admin call
      const token = Auth.getToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-user`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, role, full_name: fullName }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      return await res.json();
    } catch(e) { throw e; }
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

// ---- PROFILES ----
const ProfileAPI = {
  _cache: {},

  async get(userId) {
    if (this._cache[userId]) return this._cache[userId];
    try {
      const rows = await sbReq('GET', `profiles?select=*&id=eq.${userId}&limit=1`);
      const profile = rows?.[0] || null;
      if (profile) this._cache[userId] = profile;
      return profile;
    } catch(e) { return null; }
  },

  async getMany(userIds) {
    if (!userIds.length) return {};
    try {
      const ids = userIds.join(',');
      const rows = await sbReq('GET', `profiles?select=*&id=in.(${ids})`);
      const map = {};
      for (const r of rows) { map[r.id] = r; this._cache[r.id] = r; }
      return map;
    } catch(e) { return {}; }
  },

  async save(userId, fullName, avatarUrl, gender) {
    try {
      const token = Auth.getToken();
      const body = { id: userId, full_name: fullName, updated_at: new Date().toISOString() };
      if (avatarUrl !== undefined) body.avatar_url = avatarUrl;
      if (gender !== undefined) body.gender = gender;
      const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?on_conflict=id`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(body),
      });
      if (res.ok) { this._cache[userId] = { ...this._cache[userId], full_name: fullName, avatar_url: avatarUrl }; }
      return res.ok;
    } catch(e) { return false; }
  },

  async uploadAvatar(userId, file) {
    try {
      const token = Auth.getToken();
      const ext  = file.name.split('.').pop();
      const path = `${userId}/avatar.${ext}`;
      const res  = await fetch(`${SUPABASE_URL}/storage/v1/object/avatars/${path}`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON,
          'Authorization': `Bearer ${token}`,
          'Content-Type': file.type,
          'x-upsert': 'true',
        },
        body: file,
      });
      if (!res.ok) throw new Error('Upload failed');
      return `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}`;
    } catch(e) { console.error('uploadAvatar:', e); return null; }
  },

  getInitials(name, email) {
    if (name) return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    return (email || '?')[0].toUpperCase();
  },

  clearCache() { this._cache = {}; },
};

// ---- PODIUMS ----
const PodiumAPI = {
  async getForUser(userId) {
    try {
      // Get all scores for dates where this user has a score
      const myScores = await sbReq('GET', `wod_scores?select=*&user_id=eq.${userId}`);
      if (!myScores.length) return { gold: 0, silver: 0, bronze: 0 };

      let gold = 0, silver = 0, bronze = 0;

      // For each date+class combo, get all scores and rank
      const combos = [...new Set(myScores.map(s => `${s.date}|${s.class_id}`))];
      for (const combo of combos) {
        const [date, classId] = combo.split('|');
        const allScores = await sbReq('GET', `wod_scores?select=*&date=eq.${date}&class_id=eq.${classId}`);
        const myScore   = allScores.find(s => s.user_id === userId);
        if (!myScore) continue;
        const scoreType = myScore.score_type || 'high';
        const sorted = [...allScores].sort((a, b) => {
          const na = parseFloat(a.score), nb = parseFloat(b.score);
          if (!isNaN(na) && !isNaN(nb)) return scoreType === 'high' ? nb - na : na - nb;
          return scoreType === 'high' ? b.score.localeCompare(a.score) : a.score.localeCompare(b.score);
        });
        const pos = sorted.findIndex(s => s.user_id === userId);
        if (pos === 0) gold++;
        else if (pos === 1) silver++;
        else if (pos === 2) bronze++;
      }
      return { gold, silver, bronze };
    } catch(e) { return { gold: 0, silver: 0, bronze: 0 }; }
  },

  async getRecentScores(userId, limit = 10) {
    try {
      const rows = await sbReq('GET', `wod_scores?select=*&user_id=eq.${userId}&order=date.desc&limit=${limit}`);
      return rows || [];
    } catch(e) { return []; }
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

// ---- CLASS SCHEDULE ----
const ScheduleAPI = {
  _cache: null,
  async getAll() {
    if (this._cache) return this._cache;
    try {
      const rows = await sbReq('GET', 'class_schedule?select=*&order=day_of_week.asc,sort_order.asc');
      this._cache = rows || [];
      return this._cache;
    } catch(e) { console.warn('ScheduleAPI.getAll:', e.message); return []; }
  },

  // Clases de un día de la semana (0=dom ... 6=sáb)
  async getForDay(dayOfWeek) {
    const all = await this.getAll();
    return all.filter(c => c.day_of_week === dayOfWeek);
  },

  clearCache() { this._cache = null; },
};
// ---- MEMBERS (admin only) ----
const MemberAPI = {
  async list() {
    try {
      const rows = await sbReq('GET', 'members_admin?select=*&order=role.asc,full_name.asc');
      return rows || [];
    } catch(e) { console.warn('MemberAPI.list:', e.message); return []; }
  },

  // Revisa si un ZK ID ya está asignado a OTRO usuario. Devuelve el nombre o null.
  async zkIdInUse(zkUserId, exceptUserId) {
    try {
      const rows = await sbReq('GET', `zk_user_map?select=user_id,full_name&zk_user_id=eq.${encodeURIComponent(zkUserId)}`);
      const other = (rows || []).find(r => r.user_id !== exceptUserId);
      return other ? (other.full_name || 'otro miembro') : null;
    } catch(e) { return null; }
  },

  // Asigna (o reasigna) el ZK ID a un miembro y actualiza sus check-ins.
  async setZkId(userId, zkUserId, fullName) {
    try {
      const token = Auth.getToken();
      // 1. Borrar cualquier mapeo previo de este usuario (por si tenía otro ZK ID)
      await fetch(`${SUPABASE_URL}/rest/v1/zk_user_map?user_id=eq.${userId}`, {
        method: 'DELETE',
        headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${token}` },
      });
      // 2. Insertar el nuevo mapeo
      const res = await fetch(`${SUPABASE_URL}/rest/v1/zk_user_map`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({ zk_user_id: zkUserId, user_id: userId, full_name: fullName }),
      });
      if (!res.ok) return false;
      // 3. Actualizar los check-ins de ese ZK ID que estén sin vincular
      await fetch(`${SUPABASE_URL}/rest/v1/checkins?zk_user_id=eq.${encodeURIComponent(zkUserId)}&user_id=is.null`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_ANON,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ user_id: userId }),
      });
      return true;
    } catch(e) { console.error('MemberAPI.setZkId:', e); return false; }
  },
  
// Asignar tipo de membresía a un miembro
  async setMembership(userId, channel, subtype, expires) {
    try {
      const token = Auth.getToken();
      const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_ANON,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          membership_channel: channel || null,
          membership_subtype: subtype || null,
          membership_expires: expires || null,
        }),
      });
      return res.ok;
    } catch(e) { console.error('MemberAPI.setMembership:', e); return false; }
  },
};

// ---- REPORTS (admin only) ----
const ReportAPI = {
  // Check-ins en un rango de fechas (para gráficos de asistencia)
  async checkinsInRange(startDate, endDate) {
    try {
      // Convertir a rango UTC considerando CDMX (UTC-6)
      const start = `${startDate}T06:00:00`;
      const d = new Date(`${endDate}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      const end = `${d.toISOString().slice(0, 10)}T06:00:00`;

      const rows = await sbReq('GET',
        `checkins?select=id,timestamp,user_id,assigned_class_id,is_manual&timestamp=gte.${start}&timestamp=lt.${end}&order=timestamp.asc&limit=5000`
      );
      return rows || [];
    } catch(e) { console.warn('ReportAPI.checkinsInRange:', e.message); return []; }
  },
// Perfiles con su canal de membresía (para reportes)
  async profilesWithMembership() {
    try {
      const rows = await sbReq('GET', 'profiles?select=id,full_name,membership_channel,membership_subtype,membership_expires');
      return rows || [];
    } catch(e) { console.warn('ReportAPI.profilesWithMembership:', e.message); return []; }
  },
  // Último check-in de cada atleta (para detectar inactivos)
  async lastCheckinPerUser() {
    try {
      // Traemos los check-ins de los últimos 120 días, ordenados
      const since = new Date();
      since.setDate(since.getDate() - 120);
      const rows = await sbReq('GET',
        `checkins?select=user_id,timestamp&user_id=not.is.null&timestamp=gte.${since.toISOString()}&order=timestamp.desc&limit=10000`
      );
      const last = {};
      (rows || []).forEach(r => {
        if (!last[r.user_id]) last[r.user_id] = r.timestamp; // el primero es el más reciente
      });
      return last;
    } catch(e) { console.warn('ReportAPI.lastCheckinPerUser:', e.message); return {}; }
  },
};
// ---- WOD API ----
const WodAPI = {
  // data model: wod_days.sections = { crossfit:[...], hyrox:[...], ... }
 async getMonth(yearMonth) {
    const start = `${yearMonth}-01`;
    // Calcular primer día del mes siguiente sin desfase de timezone
    const [y, m] = yearMonth.split('-').map(Number);
    const nextY = m === 12 ? y + 1 : y;
    const nextM = m === 12 ? 1 : m + 1;
    const end = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
    try {
      const rows = await sbReq('GET', `wod_days?select=*&date=gte.${start}&date=lt.${end}&order=date.asc`);
      const map = {};
      for (const row of rows) {
        const raw = typeof row.sections === 'string' ? JSON.parse(row.sections) : (row.sections || {});
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
