// ---------- API client for mfmmoserver ----------
// Thin fetch wrapper. Only the Work hustle is server-authoritative so far -- everything else on
// the client still runs locally until it's ported the same way this one was.
const API_BASE = 'http://localhost:3099';
const AUTH_TOKEN_KEY = 'specialUnitsGui.authToken';

function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

function setAuthToken(token) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

function clearAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

async function apiRequest(path, options = {}) {
  const token = getAuthToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw { reason: 'Could not reach the server. Check your connection and try again.' };
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw data;
  return data;
}

function apiRegister(username, password, firstName, lastName) {
  return apiRequest('/auth/register', { method: 'POST', body: JSON.stringify({ username, password, firstName, lastName }) });
}

function apiLogin(username, password) {
  return apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
}

function apiMe() {
  return apiRequest('/me');
}

function apiWork() {
  return apiRequest('/hustle/work', { method: 'POST' });
}

function apiOnlinePlayers() {
  return apiRequest('/players/online');
}

function apiSyncCharacter(characterToSync) {
  return apiRequest('/character/sync', { method: 'POST', body: JSON.stringify({ character: characterToSync }) });
}
