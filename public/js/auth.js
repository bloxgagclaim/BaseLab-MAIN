const AuthState = { user: null, loaded: false };

async function loadUser() {
  try {
    if (!getToken()) {
      AuthState.user = null;
      AuthState.loaded = true;
      document.dispatchEvent(new CustomEvent('auth:changed'));
      return;
    }
    const user = await API.getMe();
    AuthState.user = user;
    AuthState.loaded = true;
    document.dispatchEvent(new CustomEvent('auth:changed'));
  } catch (e) {
    AuthState.user = null;
    AuthState.loaded = true;
    clearToken();
    document.dispatchEvent(new CustomEvent('auth:changed'));
  }
}

function onAuthChange(fn) {
  document.addEventListener('auth:changed', fn);
}

async function logout() {
  try { await API.logout(); } catch (e) {}
  clearToken();
  AuthState.user = null;
  document.dispatchEvent(new CustomEvent('auth:changed'));
  window.location.href = '/login.html';
}

function requireAuth() {
  if (!getToken()) {
    window.location.href = '/login.html?next=' + encodeURIComponent(window.location.pathname + window.location.search);
    return false;
  }
  return true;
}

function requireAdmin() {
  if (!requireAuth()) return false;
  if (AuthState.loaded && AuthState.user && AuthState.user.role !== 'admin') {
    window.location.href = '/index.html';
    return false;
  }
  return true;
}

function renderHeaderUserState() {
  const els = document.querySelectorAll('.header-user-state');
  els.forEach(el => {
    if (AuthState.user) {
      const name = AuthState.user.firstName || AuthState.user.email;
      let links = `<a href="/account.html" class="nav-link">${name}</a>`;
      if (AuthState.user.role === 'admin') {
        links += `<a href="/admin/index.html" class="nav-link">Admin</a>`;
      }
      links += `<a href="#" class="nav-link" onclick="logout();return false;">Logout</a>`;
      el.innerHTML = links;
    } else {
      el.innerHTML = `<a href="/login.html" class="nav-link">Login</a><a href="/register.html" class="nav-link">Register</a>`;
    }
  });
}

function isLoggedIn() {
  return !!getToken();
}

onAuthChange(renderHeaderUserState);
