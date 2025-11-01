// Minimal Express server to serve the existing static site 1:1 without modifying source files.
const path = require('path');
const express = require('express');
const compression = require('compression');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');
const { db } = require('./src/db');
const { seedProducts } = require('./src/seed');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname; // Serve from workspace root (where HTML/CSS/JS live)

// Basic middleware
app.use(compression());
app.use(morgan('tiny'));
app.use(cookieParser());
app.use(express.json());

// Ensure DB has basic seed
try {
  const res = seedProducts();
  if (res?.seeded) console.log(`Seeded ${res.count} products`);
} catch (e) {
  console.error('Seeding failed:', e);
}

// Helpers for sessions
function getOrCreateCartSession(req, res) {
  let sid = req.cookies?.drive_session;
  if (!sid) {
    sid = uuidv4();
    res.cookie('drive_session', sid, { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 30 });
  }
  // Upsert cart
  const upsert = db.prepare(`INSERT INTO carts (session_id) VALUES (?)
    ON CONFLICT(session_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`);
  upsert.run(sid);
  const cart = db.prepare('SELECT * FROM carts WHERE session_id = ?').get(sid);
  return cart;
}

function getCartItems(cartId) {
  const items = db.prepare(`
    SELECT ci.id, ci.quantity, p.id as product_id, p.slug, p.name, p.price_cents, p.image, p.hover_image
    FROM cart_items ci
    JOIN products p ON p.id = ci.product_id
    WHERE ci.cart_id = ?
  `).all(cartId);
  const total_cents = items.reduce((acc, it) => acc + it.price_cents * it.quantity, 0);
  return { items, total_cents };
}

// Serve static files with directory index support
app.use(
  express.static(ROOT, {
    index: ['index.html'],
    extensions: ['html'],
    redirect: true,
    dotfiles: 'ignore',
    maxAge: '1h',
    etag: true,
    // Force fresh loads for CSS/JS to avoid stale caches during development
    setHeaders: (res, filePath) => {
      if (/\.(css|js|mjs)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'no-store');
      }
    },
  })
);

// Explicit routes for directory pages without trailing slash
const dirRoutes = ['/Products', '/AboutUs', '/Product-detail'];
dirRoutes.forEach((route) => {
  app.get(route, (req, res) => {
    res.sendFile(path.join(ROOT, route, 'index.html'));
  });
});

// Convenience alias for cart if accessed as "/cart"
app.get('/cart', (req, res, next) => {
  const filePath = path.join(ROOT, 'cart.html');
  res.sendFile(filePath, (err) => (err ? next() : undefined));
});

// ========== API: Products ==========
app.get('/api/products', (req, res) => {
  const rows = db.prepare('SELECT id, slug, name, price_cents, image, hover_image FROM products ORDER BY id').all();
  res.json(rows);
});

app.get('/api/products/:idOrSlug', (req, res) => {
  const { idOrSlug } = req.params;
  const stmt = isNaN(Number(idOrSlug))
    ? db.prepare('SELECT * FROM products WHERE slug = ?')
    : db.prepare('SELECT * FROM products WHERE id = ?');
  const row = stmt.get(idOrSlug);
  if (!row) return res.status(404).json({ error: 'Product not found' });
  res.json(row);
});

// ========== API: Cart ==========
app.get('/api/cart', (req, res) => {
  const cart = getOrCreateCartSession(req, res);
  const payload = getCartItems(cart.id);
  res.json({ cart_id: cart.id, ...payload });
});

app.post('/api/cart', (req, res) => {
  const { productId, quantity = 1 } = req.body || {};
  if (!productId || quantity <= 0) return res.status(400).json({ error: 'Invalid payload' });
  const cart = getOrCreateCartSession(req, res);
  // upsert line
  const existing = db.prepare('SELECT id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ?').get(cart.id, productId);
  if (existing) {
    db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ?').run(existing.quantity + quantity, existing.id);
  } else {
    db.prepare('INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?)').run(cart.id, productId, quantity);
  }
  const payload = getCartItems(cart.id);
  res.json({ cart_id: cart.id, ...payload });
});

app.patch('/api/cart', (req, res) => {
  const { itemId, quantity } = req.body || {};
  if (!itemId || quantity == null || quantity < 0) return res.status(400).json({ error: 'Invalid payload' });
  const cart = getOrCreateCartSession(req, res);
  if (quantity === 0) {
    db.prepare('DELETE FROM cart_items WHERE id = ? AND cart_id = ?').run(itemId, cart.id);
  } else {
    db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ? AND cart_id = ?').run(quantity, itemId, cart.id);
  }
  const payload = getCartItems(cart.id);
  res.json({ cart_id: cart.id, ...payload });
});

app.delete('/api/cart/:itemId', (req, res) => {
  const { itemId } = req.params;
  const cart = getOrCreateCartSession(req, res);
  db.prepare('DELETE FROM cart_items WHERE id = ? AND cart_id = ?').run(itemId, cart.id);
  const payload = getCartItems(cart.id);
  res.json({ cart_id: cart.id, ...payload });
});

// Clear cart on checkout
app.post('/api/checkout', (req, res) => {
  const cart = getOrCreateCartSession(req, res);
  db.prepare('DELETE FROM cart_items WHERE cart_id = ?').run(cart.id);
  const payload = getCartItems(cart.id);
  res.json({ ok: true, cart_id: cart.id, ...payload });
});

// ========== API: Auth ==========
const bcrypt = require('bcryptjs');
const DAY = 24 * 60 * 60 * 1000;
app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const hash = await bcrypt.hash(password, 10);
  try {
    const info = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email.toLowerCase(), hash);
    res.status(201).json({ id: info.lastInsertRowid, email });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Email already registered' });
    console.error(e);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const token = uuidv4();
  const expiresAt = new Date(Date.now() + 30 * DAY).toISOString();
  db.prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)').run(user.id, token, expiresAt);
  res.cookie('auth_token', token, { httpOnly: true, sameSite: 'lax', maxAge: 30 * DAY });
  res.json({ id: user.id, email: user.email });
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies?.auth_token;
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.clearCookie('auth_token');
  res.json({ ok: true });
});

// Fallback 404 (no SPA rewrite to preserve original behavior)
app.use((req, res) => {
  res.status(404).send('Not Found');
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
