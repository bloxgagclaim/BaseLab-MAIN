let accessToken = localStorage.getItem('bl_access_token') || null;

function setToken(t) { accessToken = t; localStorage.setItem('bl_access_token', t); }
function clearToken() { accessToken = null; localStorage.removeItem('bl_access_token'); }
function getToken() { return accessToken; }

async function apiFetch(method, path, body = null, retry = true) {
  const headers = {};
  if (accessToken) {
    headers['Authorization'] = 'Bearer ' + accessToken;
  }

  const opts = { method, headers, credentials: 'include' };

  if (body !== null && method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  let res = await fetch(path, opts);

  if (res.status === 401 && retry && accessToken) {
    try {
      const refreshRes = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        setToken(data.accessToken);
        headers['Authorization'] = 'Bearer ' + data.accessToken;
        opts.headers = headers;
        res = await fetch(path, opts);
      } else {
        clearToken();
        throw new Error('Session expired');
      }
    } catch (e) {
      clearToken();
      throw new Error('Session expired');
    }
  }

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(json.error || json.message || 'Request failed');
    err.status = res.status;
    err.errors = json.errors || [];
    throw err;
  }

  return json;
}

const API = {
  get:    (path)        => apiFetch('GET',    path),
  post:   (path, body)  => apiFetch('POST',   path, body),
  patch:  (path, body)  => apiFetch('PATCH',  path, body),
  delete: (path)        => apiFetch('DELETE', path),

  register:       (data)  => API.post('/api/auth/register', data),
  login:          (data)  => API.post('/api/auth/login', data),
  logout:         ()      => API.post('/api/auth/logout'),
  refreshToken:   ()      => API.post('/api/auth/refresh'),
  getMe:          ()      => API.get('/api/auth/me'),
  updateMe:       (data)  => API.patch('/api/auth/me', data),
  changePassword: (data)  => API.post('/api/auth/change-password', data),

  getProducts:    (params) => API.get('/api/products?' + new URLSearchParams(params || {})),
  getProduct:     (id)     => API.get('/api/products/' + id),
  getRelated:     (id)     => API.get('/api/products/' + id + '/related'),

  getCart:         ()              => API.get('/api/cart'),
  addToCart:       (productId, qty)=> API.post('/api/cart/items', { productId, qty }),
  updateCartItem:  (productId, qty)=> API.patch('/api/cart/items/' + productId, { qty }),
  removeCartItem:  (productId)     => API.delete('/api/cart/items/' + productId),
  clearCart:       ()              => API.delete('/api/cart'),
  transferCart:    (sessionId)     => API.post('/api/cart/transfer', { sessionId }),

  createOrder:    (data)  => API.post('/api/orders', data),
  getOrders:      (p)     => API.get('/api/orders?' + new URLSearchParams(p || {})),
  getOrder:       (uuid)  => API.get('/api/orders/' + uuid),
  cancelOrder:    (uuid)  => API.post('/api/orders/' + uuid + '/cancel'),

  getAddresses:   ()      => API.get('/api/users/me/addresses'),
  addAddress:     (data)  => API.post('/api/users/me/addresses', data),
  updateAddress:  (id, d) => API.patch('/api/users/me/addresses/' + id, d),
  deleteAddress:  (id)    => API.delete('/api/users/me/addresses/' + id),
  getWishlist:    ()      => API.get('/api/users/me/wishlist'),
  addWishlist:    (pid)   => API.post('/api/users/me/wishlist', { productId: pid }),
  removeWishlist: (pid)   => API.delete('/api/users/me/wishlist/' + pid),

  getDashboard:   ()      => API.get('/api/admin/dashboard'),
  adminGetUsers:  (p)     => API.get('/api/admin/users?' + new URLSearchParams(p || {})),
  adminGetOrders: (p)     => API.get('/api/orders?' + new URLSearchParams(p || {})),
  adminUpdateOrder:(uuid,d)=> API.patch('/api/orders/' + uuid + '/status', d),
  createProduct:  (d)     => API.post('/api/products', d),
  updateProduct:  (id,d)  => API.patch('/api/products/' + id, d),
  deleteProduct:  (id)    => API.delete('/api/products/' + id),
  getPromoCodes:  ()      => API.get('/api/admin/promo-codes'),
  createPromo:    (d)     => API.post('/api/admin/promo-codes', d),
};
