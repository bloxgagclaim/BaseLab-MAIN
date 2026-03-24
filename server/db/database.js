const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../../baselab.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid        TEXT    NOT NULL UNIQUE,
    email       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password    TEXT    NOT NULL,
    first_name  TEXT    NOT NULL DEFAULT '',
    last_name   TEXT    NOT NULL DEFAULT '',
    company     TEXT    DEFAULT NULL,
    phone       TEXT    DEFAULT NULL,
    role        TEXT    NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','admin')),
    is_verified INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      TEXT    NOT NULL UNIQUE,
    expires_at TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    sku            TEXT    NOT NULL UNIQUE,
    name           TEXT    NOT NULL,
    category       TEXT    NOT NULL CHECK(category IN ('glass','ceramic','metal','bundles','supplies','specialty')),
    category_label TEXT    NOT NULL,
    price          REAL    NOT NULL,
    original_price REAL    NOT NULL,
    min_qty        INTEGER NOT NULL DEFAULT 1,
    unit           TEXT    NOT NULL DEFAULT 'ea' CHECK(unit IN ('ea','set','pack')),
    badge          TEXT    DEFAULT NULL,
    badge_type     TEXT    DEFAULT NULL,
    description    TEXT    NOT NULL DEFAULT '',
    gradient       TEXT    NOT NULL DEFAULT 'linear-gradient(135deg,#f8fafc,#e2e8f0)',
    icon           TEXT    NOT NULL DEFAULT '📦',
    in_stock       INTEGER NOT NULL DEFAULT 1,
    sort_order     INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS addresses (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    first_name   TEXT NOT NULL,
    last_name    TEXT NOT NULL,
    company      TEXT DEFAULT NULL,
    street       TEXT NOT NULL,
    city         TEXT NOT NULL,
    state        TEXT NOT NULL,
    zip          TEXT NOT NULL,
    country      TEXT NOT NULL DEFAULT 'US',
    is_default   INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid                TEXT    NOT NULL UNIQUE,
    user_id             INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status              TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','processing','shipped','delivered','cancelled','refunded')),
    payment_method      TEXT    NOT NULL DEFAULT 'card',
    payment_intent_id   TEXT    DEFAULT NULL,
    stripe_session_id   TEXT    DEFAULT NULL,
    subtotal            REAL    NOT NULL,
    shipping_cost       REAL    NOT NULL DEFAULT 0,
    tax                 REAL    NOT NULL DEFAULT 0,
    discount            REAL    NOT NULL DEFAULT 0,
    promo_code          TEXT    DEFAULT NULL,
    total               REAL    NOT NULL,
    retail_value        REAL    NOT NULL DEFAULT 0,
    ship_first_name     TEXT    NOT NULL,
    ship_last_name      TEXT    NOT NULL,
    ship_company        TEXT    DEFAULT NULL,
    ship_street         TEXT    NOT NULL,
    ship_city           TEXT    NOT NULL,
    ship_state          TEXT    NOT NULL,
    ship_zip            TEXT    NOT NULL,
    ship_country        TEXT    NOT NULL DEFAULT 'US',
    ship_email          TEXT    NOT NULL,
    ship_phone          TEXT    DEFAULT NULL,
    notes               TEXT    DEFAULT NULL,
    tracking_number     TEXT    DEFAULT NULL,
    created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS order_items (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id       INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id     INTEGER REFERENCES products(id) ON DELETE SET NULL,
    sku            TEXT    NOT NULL,
    name           TEXT    NOT NULL,
    price          REAL    NOT NULL,
    original_price REAL    NOT NULL,
    qty            INTEGER NOT NULL,
    unit           TEXT    NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS cart_items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
    session_id TEXT    DEFAULT NULL,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    qty        INTEGER NOT NULL,
    added_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, product_id),
    UNIQUE(session_id, product_id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS wishlist (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    added_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, product_id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS promo_codes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    code            TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    type            TEXT    NOT NULL DEFAULT 'percent' CHECK(type IN ('percent','fixed')),
    value           REAL    NOT NULL,
    min_order       REAL    NOT NULL DEFAULT 0,
    max_uses        INTEGER DEFAULT NULL,
    uses            INTEGER NOT NULL DEFAULT 0,
    expires_at      TEXT    DEFAULT NULL,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS reviews (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id   INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    rating     INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    title      TEXT    DEFAULT NULL,
    body       TEXT    DEFAULT NULL,
    is_approved INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(product_id, user_id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS newsletter (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    is_active  INTEGER NOT NULL DEFAULT 1,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_cart_user ON cart_items(user_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_cart_session ON cart_items(session_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);`);

module.exports = db;
