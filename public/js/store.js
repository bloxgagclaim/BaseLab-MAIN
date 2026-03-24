const Cart = {
  async get() { return API.getCart(); },
  async add(id, qty) { return API.addToCart(id, qty); },
  async remove(id) { return API.removeCartItem(id); },
  async updateQty(id, q) { return API.updateCartItem(id, q); },
  async clear() { return API.clearCart(); },
  async count() { const c = await API.getCart(); return c.itemCount; }
};

function showToast(msg, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.style.cssText = 'padding:12px 20px;border-radius:8px;font-size:14px;font-weight:500;color:#fff;box-shadow:0 4px 12px rgba(0,0,0,.15);transform:translateX(120%);transition:transform .3s ease;max-width:360px;' +
    (type === 'success' ? 'background:#16a34a;' : type === 'error' ? 'background:#dc2626;' : 'background:#2563eb;');
  toast.textContent = msg;
  container.appendChild(toast);
  requestAnimationFrame(() => { toast.style.transform = 'translateX(0)'; });
  setTimeout(() => {
    toast.style.transform = 'translateX(120%)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function buildProductCard(product) {
  const discount = product.discount_percent || Math.round((product.original_price - product.price) / product.original_price * 100);
  const savings = product.savings_per_unit || (product.original_price - product.price).toFixed(2);
  const badgeHtml = product.badge ? `<span class="product-badge ${product.badge_type || product.badgeType || ''}">${product.badge}</span>` : '';

  return `
    <div class="product-card" data-id="${product.id}">
      <a href="/product.html?id=${product.id}" class="product-link">
        <div class="product-image" style="background:${product.gradient}">
          <span class="product-icon">${product.icon}</span>
          ${badgeHtml}
        </div>
        <div class="product-info">
          <div class="product-category">${product.category_label || product.categoryLabel || product.category}</div>
          <h3 class="product-name">${product.name}</h3>
          <div class="product-pricing">
            <span class="product-price">$${product.price.toFixed(2)}</span>
            <span class="product-original">$${product.original_price.toFixed(2)}</span>
            <span class="product-discount">-${discount}%</span>
          </div>
          <div class="product-meta">Min. ${product.min_qty} ${product.unit} &middot; Save $${parseFloat(savings).toFixed(2)}/${product.unit}</div>
        </div>
      </a>
      <button class="btn btn-primary btn-add-cart" onclick="addToCartAction(${product.id}, this)" data-product-id="${product.id}">
        Add to Cart
      </button>
    </div>
  `;
}

async function addToCartAction(id, btn) {
  if (btn) {
    btn.classList.add('btn-loading');
    btn.disabled = true;
  }
  try {
    await Cart.add(id, 1);
    showToast('Added to cart!');
    await renderCartDrawer();
  } catch (e) {
    showToast(e.message || 'Failed to add to cart', 'error');
  } finally {
    if (btn) {
      btn.classList.remove('btn-loading');
      btn.disabled = false;
    }
  }
}

function initCartDrawer() {
  if (document.getElementById('cart-drawer')) return;
  const overlay = document.createElement('div');
  overlay.id = 'cart-drawer-overlay';
  overlay.className = 'drawer-overlay';
  overlay.onclick = closeCartDrawer;

  const drawer = document.createElement('div');
  drawer.id = 'cart-drawer';
  drawer.className = 'drawer';
  drawer.innerHTML = `
    <div class="drawer-header">
      <h3>Your Cart</h3>
      <button class="drawer-close" onclick="closeCartDrawer()">&times;</button>
    </div>
    <div class="drawer-body" id="cart-drawer-body">
      <div class="skeleton" style="height:60px;margin-bottom:12px;"></div>
      <div class="skeleton" style="height:60px;margin-bottom:12px;"></div>
    </div>
    <div class="drawer-footer" id="cart-drawer-footer"></div>
  `;
  document.body.appendChild(overlay);
  document.body.appendChild(drawer);
  renderCartDrawer();
}

async function renderCartDrawer() {
  try {
    const cart = await API.getCart();
    const body = document.getElementById('cart-drawer-body');
    const footer = document.getElementById('cart-drawer-footer');
    if (!body || !footer) return;

    if (cart.items.length === 0) {
      body.innerHTML = '<div class="drawer-empty"><p>Your cart is empty</p><a href="/shop.html" class="btn btn-primary">Browse Products</a></div>';
      footer.innerHTML = '';
    } else {
      body.innerHTML = cart.items.map(item => `
        <div class="drawer-item">
          <div class="drawer-item-icon" style="background:${item.product.gradient}">${item.product.icon}</div>
          <div class="drawer-item-info">
            <div class="drawer-item-name">${item.product.name}</div>
            <div class="drawer-item-price">$${item.product.price.toFixed(2)} x ${item.qty}</div>
          </div>
          <div class="drawer-item-total">$${item.lineTotal.toFixed(2)}</div>
          <button class="drawer-item-remove" onclick="removeDrawerItem(${item.product.id})">&times;</button>
        </div>
      `).join('');

      footer.innerHTML = `
        <div class="drawer-totals">
          <div class="drawer-total-row"><span>Subtotal</span><span>$${cart.subtotal.toFixed(2)}</span></div>
          <div class="drawer-total-row"><span>Savings</span><span class="text-green">-$${cart.savings.toFixed(2)}</span></div>
        </div>
        <a href="/cart.html" class="btn btn-primary btn-block">View Cart ($${cart.total.toFixed(2)})</a>
      `;
    }

    updateCartBadges(cart.itemCount);
  } catch (e) {
    console.error('Failed to render cart drawer:', e);
  }
}

async function removeDrawerItem(productId) {
  try {
    await Cart.remove(productId);
    await renderCartDrawer();
    showToast('Item removed');
  } catch (e) {
    showToast('Failed to remove item', 'error');
  }
}

function openCartDrawer() {
  document.getElementById('cart-drawer')?.classList.add('open');
  document.getElementById('cart-drawer-overlay')?.classList.add('open');
  document.body.style.overflow = 'hidden';
  renderCartDrawer();
}

function closeCartDrawer() {
  document.getElementById('cart-drawer')?.classList.remove('open');
  document.getElementById('cart-drawer-overlay')?.classList.remove('open');
  document.body.style.overflow = '';
}

function updateCartBadges(count) {
  document.querySelectorAll('.cart-badge').forEach(el => {
    el.textContent = count;
    el.style.display = count > 0 ? 'flex' : 'none';
  });
}

let PRODUCTS_CACHE = null;

async function getProducts(params) {
  const data = await API.getProducts(params);
  PRODUCTS_CACHE = data.products;
  return data;
}

async function getCachedProduct(id) {
  if (PRODUCTS_CACHE) {
    const found = PRODUCTS_CACHE.find(p => p.id === parseInt(id, 10));
    if (found) return found;
  }
  return API.getProduct(id);
}
