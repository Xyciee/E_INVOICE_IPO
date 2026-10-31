/**
 * Authentication service communicating with Django Backend
 * API Root: https://einvoice.ipolymersolutionscorp.com
 * Endpoints:
 * - GET  /api/auth/csrf    -> retrieves CSRF token
 * - POST /api/auth/login   -> authenticates username & password
 * - POST /api/auth/logout  -> invalidates session
 * - GET  /api/me           -> fetches authenticated user details and permissions
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

let cachedCsrfToken = null;

/**
 * Extract CSRF token from document cookies if available
 */
function getCsrfFromCookie() {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Fetch and return the active CSRF token required for POST requests
 */
export async function getCsrfToken(forceRefresh = false) {
  if (!forceRefresh && cachedCsrfToken) {
    return cachedCsrfToken;
  }

  const cookieToken = getCsrfFromCookie();
  if (!forceRefresh && cookieToken) {
    cachedCsrfToken = cookieToken;
    return cookieToken;
  }

  try {
    const res = await fetch(`${API_BASE}/api/auth/csrf`, {
      method: 'GET',
      credentials: 'include'
    });

    if (res.ok) {
      const data = await res.json();
      cachedCsrfToken = data.csrfToken || getCsrfFromCookie();
      return cachedCsrfToken;
    }
  } catch (err) {
    console.warn('Could not fetch fresh CSRF token from /api/auth/csrf:', err);
  }

  return getCsrfFromCookie() || '';
}

/**
 * Normalize backend user payload into standard app user structure
 */
function formatUserProfile(profile, fallbackIdentifier) {
  const username = profile?.username || fallbackIdentifier || 'user';
  const roles = profile?.roles || (profile?.is_superuser ? ['Super Admin'] : ['Staff']);
  const displayName =
    profile?.name ||
    profile?.first_name ||
    username.charAt(0).toUpperCase() + username.slice(1);

  return {
    id: profile?.id || `user_${username}`,
    username,
    name: displayName,
    email: profile?.email || (username.includes('@') ? username : `${username}@ipolymersolutionscorp.com`),
    role: Array.isArray(roles) && roles.length > 0 ? roles.join(', ') : 'Staff',
    roles: Array.isArray(roles) ? roles : [roles],
    permissions: profile?.permissions || profile?.named_permissions || [],
    avatar: (displayName || username).slice(0, 2).toUpperCase(),
    department: profile?.department || 'Operations',
    assignedStations: profile?.assigned_stations || profile?.assignedStations || []
  };
}

/**
 * Perform login against Django backend /api/auth/login
 */
export async function apiLogin(username, password) {
  try {
    // 1. Ensure CSRF token is available
    const csrfToken = await getCsrfToken();

    // 2. Submit credentials
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'X-CSRFToken': csrfToken } : {})
      },
      credentials: 'include',
      body: JSON.stringify({
        username: username.trim(),
        password
      })
    });

    if (response.ok) {
      // Django rotates the CSRF token on login — drop the cached one
      cachedCsrfToken = null;

      // 3. Confirm the session is real via /api/me — no session, no login
      const meRes = await fetch(`${API_BASE}/api/me`, {
        credentials: 'include'
      });
      if (!meRes.ok) {
        return {
          success: false,
          error: 'Login accepted but no session was established. Please try again.'
        };
      }
      const userProfile = await meRes.json();
      return {
        success: true,
        user: formatUserProfile(userProfile, username.trim())
      };
    }

    // Handle authentication error responses
    let errorMessage = 'Invalid credentials. Please verify your username and password.';
    try {
      const errData = await response.json();
      if (errData.message) {
        errorMessage = errData.message;
      } else if (errData.detail) {
        errorMessage = errData.detail;
      } else if (errData.username) {
        errorMessage = Array.isArray(errData.username) ? errData.username[0] : errData.username;
      } else if (errData.password) {
        errorMessage = Array.isArray(errData.password) ? errData.password[0] : errData.password;
      } else if (errData.error === 'login_failed') {
        errorMessage = 'Wrong username or password.';
      }
    } catch {
      if (response.status === 429) {
        errorMessage = 'Too many failed login attempts. Please wait 15 minutes before trying again.';
      } else if (response.status === 403) {
        errorMessage = 'Security verification failed (CSRF / Origin). Please refresh the page.';
      }
    }

    return {
      success: false,
      error: errorMessage
    };
  } catch (networkErr) {
    console.error('API login network error:', networkErr);
    return {
      success: false,
      error: 'Unable to reach authentication server. Please check your network connection.'
    };
  }
}

/**
 * Check active session with backend /api/me
 */
export async function apiCheckSession() {
  try {
    const res = await fetch(`${API_BASE}/api/me`, {
      method: 'GET',
      credentials: 'include'
    });

    if (res.ok) {
      const data = await res.json();
      return formatUserProfile(data, data?.username);
    }
    return null;
  } catch (err) {
    console.warn('Session check failed:', err);
    return null;
  }
}

/**
 * Logout from Django backend /api/auth/logout
 */
export async function apiLogout() {
  try {
    const csrfToken = await getCsrfToken();
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'X-CSRFToken': csrfToken } : {})
      },
      credentials: 'include'
    });
  } catch (err) {
    console.warn('API logout error:', err);
  } finally {
    cachedCsrfToken = null;
  }
}
