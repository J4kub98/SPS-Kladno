#!/usr/bin/env python3
"""
python_server.py – Alternativní lokální server bez Node.js.
Spustitelné ve škole, kde nejde instalovat Node. Doma můžeš dál používat Node.

Varianty:
  A) Minimal (pouze standardní knihovna) -> statické soubory + jednoduché /api/products z SQLite
  B) Rozšířená (Flask) -> plné REST endpoints jako v server.js (nutný pip install flask)

Defaultně běží "minimal" režim, protože nevyžaduje instalaci balíčků.
Režim lze přepnout proměnnou prostředí PY_MODE=flask.

Použití (PowerShell):
  python .\python_server.py               # minimal mód (port 3000)
  $env:PORT=4000; python .\python_server.py
  $env:PY_MODE="flask"; python .\python_server.py   # pokud chceš Flask API

Struktura DB: stejné tabulky jako v src/db.js (SQLite). Soubor: data/site.db
Pokud chybí, vytvoří se a naseedují se základní produkty.
"""
from __future__ import annotations
import os, sys, json, sqlite3, uuid, datetime
from pathlib import Path
from http import HTTPStatus
from urllib.parse import urlparse

ROOT = Path(__file__).parent.resolve()
DATA_DIR = ROOT / 'data'
DB_PATH = DATA_DIR / 'site.db'
PORT = int(os.environ.get('PORT', '3000'))
MODE = os.environ.get('PY_MODE', 'minimal').lower()  # 'minimal' nebo 'flask'

PRODUCT_SEED = [
    ('cans-mango', 'CANS Mango — 24 × 330ml', 59900, '/Products/test.png', '/Products/test2.jpg', 'Osvěžující mango příchuť. Přírodní kofein z guarany, vitamíny B, bez přidaného cukru.', json.dumps(['Přírodní kofein', 'Bez cukru', 'Vegan', 'Recyklovatelná plechovka'])),
    ('cans-citrus', 'CANS Citrus — 24 × 330ml', 59900, '/Products/test.png', '/Products/test2.jpg', 'Energizující citrusová příchuť. Přírodní kofein, vitamíny, bez cukru.', json.dumps(['Citrus', 'Bez cukru', 'Vegan', 'Recyklovatelná plechovka'])),
    ('cans-berry', 'CANS Berry — 24 × 330ml', 59900, '/Products/test.png', '/Products/test2.jpg', 'Lahodná lesní směs. Přírodní kofein, vitamíny, bez cukru.', json.dumps(['Lesní ovoce', 'Bez cukru', 'Vegan', 'Recyklovatelná plechovka'])),
]

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  image TEXT,
  hover_image TEXT,
  description TEXT,
  features TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS carts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS cart_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cart_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
"""

def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA_SQL)
    # seed pokud chybi povinne produkty
    cur = conn.execute("SELECT slug FROM products WHERE slug IN (?,?,?)", [s[0] for s in PRODUCT_SEED])
    existing = {r[0] for r in cur.fetchall()}
    to_seed = [p for p in PRODUCT_SEED if p[0] not in existing]
    if to_seed:
        conn.executemany(
            "INSERT INTO products (slug, name, price_cents, image, hover_image, description, features) VALUES (?,?,?,?,?,?,?)",
            to_seed
        )
        conn.commit()
    return conn

# ---------------- Minimal mode (http.server) -----------------
if MODE == 'minimal':
    import mimetypes
    from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

    db_conn = init_db()

    class Handler(SimpleHTTPRequestHandler):
        def translate_path(self, path: str) -> str:
            # Serve from ROOT (same as Express) including subdirs
            # Keep default logic for static files
            result = super().translate_path(path)
            return result

        def end_headers(self):
            # Disable caching for .css/.js for dev parity
            if self.path.endswith('.css') or self.path.endswith('.js'):
                self.send_header('Cache-Control', 'no-store')
            super().end_headers()

        def do_GET(self):
            parsed = urlparse(self.path)
            if parsed.path.startswith('/api/'):
                return self.handle_api_get(parsed)
            return super().do_GET()

        def do_POST(self):
            parsed = urlparse(self.path)
            if parsed.path.startswith('/api/'):
                length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(length) if length else b''
                try:
                    payload = json.loads(body or b'{}')
                except json.JSONDecodeError:
                    payload = {}
                return self.handle_api_post(parsed, payload)
            self.send_error(HTTPStatus.METHOD_NOT_ALLOWED, 'POST not supported')

        def do_PATCH(self):
            parsed = urlparse(self.path)
            if parsed.path == '/api/cart':
                length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(length) if length else b''
                try:
                    payload = json.loads(body or b'{}')
                except json.JSONDecodeError:
                    payload = {}
                return self.handle_cart_patch(payload)
            self.send_error(HTTPStatus.METHOD_NOT_ALLOWED, 'PATCH not supported')

        def do_DELETE(self):
            parsed = urlparse(self.path)
            if parsed.path.startswith('/api/cart/'):
                item_id = parsed.path.split('/')[-1]
                return self.handle_cart_delete(item_id)
            self.send_error(HTTPStatus.METHOD_NOT_ALLOWED, 'DELETE not supported')

        # ----- Helpers -----
        def json_response(self, data, status=200):
            data_bytes = json.dumps(data).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(data_bytes)))
            self.end_headers()
            self.wfile.write(data_bytes)

        def get_session_id(self) -> str:
            cookies = self.headers.get('Cookie','')
            sid = None
            for part in cookies.split(';'):
                if part.strip().startswith('drive_session='):
                    sid = part.strip().split('=',1)[1]
                    break
            if not sid:
                sid = uuid.uuid4().hex
                # set-cookie
                self.send_header('Set-Cookie', f'drive_session={sid}; Path=/; SameSite=Lax')
            return sid

        def ensure_cart(self, sid: str):
            cur = db_conn.execute('SELECT id FROM carts WHERE session_id=?', (sid,))
            row = cur.fetchone()
            if row:
                return row[0]
            db_conn.execute('INSERT INTO carts (session_id) VALUES (?)', (sid,))
            db_conn.commit()
            return db_conn.execute('SELECT id FROM carts WHERE session_id=?', (sid,)).fetchone()[0]

        def load_cart(self, cart_id: int):
            cur = db_conn.execute('''SELECT ci.id, ci.quantity, p.id as product_id, p.slug, p.name, p.price_cents, p.image, p.hover_image
                                     FROM cart_items ci JOIN products p ON p.id=ci.product_id WHERE ci.cart_id=?''', (cart_id,))
            items = []
            total = 0
            for r in cur.fetchall():
                price = r[5]
                qty = r[1]
                total += price * qty
                items.append({
                    'id': r[0], 'quantity': qty, 'product_id': r[2], 'slug': r[3], 'name': r[4], 'price_cents': price, 'image': r[6], 'hover_image': r[7]
                })
            return {'items': items, 'total_cents': total}

        # ----- API handlers -----
        def handle_api_get(self, parsed):
            if parsed.path == '/api/products':
                cur = db_conn.execute('SELECT id, slug, name, price_cents, image, hover_image FROM products ORDER BY id')
                rows = [dict(zip(['id','slug','name','price_cents','image','hover_image'], r)) for r in cur.fetchall()]
                return self.json_response(rows)
            if parsed.path.startswith('/api/products/'):
                key = parsed.path.split('/')[-1]
                if key.isdigit():
                    cur = db_conn.execute('SELECT * FROM products WHERE id=?', (key,))
                else:
                    cur = db_conn.execute('SELECT * FROM products WHERE slug=?', (key,))
                row = cur.fetchone()
                if not row:
                    return self.json_response({'error':'Product not found'}, 404)
                colnames = [d[0] for d in cur.description]
                return self.json_response(dict(zip(colnames,row)))
            if parsed.path == '/api/cart':
                sid = self.get_session_id()
                cart_id = self.ensure_cart(sid)
                payload = self.load_cart(cart_id)
                return self.json_response({'cart_id': cart_id, **payload})
            if parsed.path.startswith('/api/auth/'):
                return self.json_response({'error':'Auth not available in minimal mode'}, 501)
            return self.json_response({'error':'Not found'}, 404)

        def handle_api_post(self, parsed, payload):
            if parsed.path == '/api/cart':
                sid = self.get_session_id()
                cart_id = self.ensure_cart(sid)
                product_id = payload.get('productId')
                quantity = int(payload.get('quantity',1))
                if not product_id or quantity <=0:
                    return self.json_response({'error':'Invalid payload'}, 400)
                cur = db_conn.execute('SELECT id, quantity FROM cart_items WHERE cart_id=? AND product_id=?', (cart_id, product_id))
                existing = cur.fetchone()
                if existing:
                    db_conn.execute('UPDATE cart_items SET quantity=? WHERE id=?', (existing[1]+quantity, existing[0]))
                else:
                    db_conn.execute('INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?,?,?)', (cart_id, product_id, quantity))
                db_conn.commit()
                payload_cart = self.load_cart(cart_id)
                return self.json_response({'cart_id': cart_id, **payload_cart})
            if parsed.path == '/api/checkout':
                sid = self.get_session_id()
                cart_id = self.ensure_cart(sid)
                db_conn.execute('DELETE FROM cart_items WHERE cart_id=?', (cart_id,))
                db_conn.commit()
                payload_cart = self.load_cart(cart_id)
                return self.json_response({'ok': True, 'cart_id': cart_id, **payload_cart})
            return self.json_response({'error':'Not found'}, 404)

        def handle_cart_patch(self, payload):
            sid = self.get_session_id()
            cart_id = self.ensure_cart(sid)
            item_id = payload.get('itemId')
            quantity = payload.get('quantity')
            if item_id is None or quantity is None or int(quantity) < 0:
                return self.json_response({'error':'Invalid payload'}, 400)
            quantity = int(quantity)
            if quantity == 0:
                db_conn.execute('DELETE FROM cart_items WHERE id=? AND cart_id=?', (item_id, cart_id))
            else:
                db_conn.execute('UPDATE cart_items SET quantity=? WHERE id=? AND cart_id=?', (quantity, item_id, cart_id))
            db_conn.commit()
            payload_cart = self.load_cart(cart_id)
            return self.json_response({'cart_id': cart_id, **payload_cart})

        def handle_cart_delete(self, item_id):
            sid = self.get_session_id()
            cart_id = self.ensure_cart(sid)
            db_conn.execute('DELETE FROM cart_items WHERE id=? AND cart_id=?', (item_id, cart_id))
            db_conn.commit()
            payload_cart = self.load_cart(cart_id)
            return self.json_response({'cart_id': cart_id, **payload_cart})

    def run_minimal():
        server = ThreadingHTTPServer(('0.0.0.0', PORT), Handler)
        print(f"[Python minimal] Running on http://localhost:{PORT} (mode=minimal)")
        server.serve_forever()

    if __name__ == '__main__':
        run_minimal()
    sys.exit(0)

# ---------------- Flask mode (full features + auth stubs) -----------------
try:
    from flask import Flask, send_from_directory, request, jsonify, make_response
except Exception as e:
    print('Flask not installed. Install via: pip install flask')
    sys.exit(1)

conn = init_db()
app = Flask(__name__)

@app.after_request
def no_cache(resp):
    if resp.mimetype in ('text/css','application/javascript','text/javascript'):
        resp.headers['Cache-Control'] = 'no-store'
    return resp

def get_session():
    sid = request.cookies.get('drive_session')
    if not sid:
        sid = uuid.uuid4().hex
    cur = conn.execute('SELECT id FROM carts WHERE session_id=?', (sid,))
    row = cur.fetchone()
    if not row:
        conn.execute('INSERT INTO carts (session_id) VALUES (?)', (sid,))
        conn.commit()
        cart_id = conn.execute('SELECT id FROM carts WHERE session_id=?', (sid,)).fetchone()[0]
    else:
        cart_id = row[0]
    return sid, cart_id

def cart_payload(cart_id):
    cur = conn.execute('''SELECT ci.id, ci.quantity, p.id, p.slug, p.name, p.price_cents, p.image, p.hover_image
                           FROM cart_items ci JOIN products p ON p.id=ci.product_id WHERE ci.cart_id=?''', (cart_id,))
    items=[]; total=0
    for r in cur.fetchall():
        total += r[5]*r[1]
        items.append({'id': r[0], 'quantity': r[1], 'product_id': r[2], 'slug': r[3], 'name': r[4], 'price_cents': r[5], 'image': r[6], 'hover_image': r[7]})
    return {'items': items, 'total_cents': total}

# Static files
@app.route('/')
def root_index():
    return send_from_directory(ROOT, 'index.html')

@app.route('/<path:path>')
def static_any(path):
    full = ROOT / path
    if full.is_file():
        return send_from_directory(ROOT, path)
    # fallback: try directory index
    if full.is_dir() and (full/'index.html').is_file():
        return send_from_directory(full, 'index.html')
    return 'Not Found', 404

# Products API
@app.get('/api/products')
def products():
    cur = conn.execute('SELECT id, slug, name, price_cents, image, hover_image FROM products ORDER BY id')
    rows = [dict(zip(['id','slug','name','price_cents','image','hover_image'], r)) for r in cur.fetchall()]
    return jsonify(rows)

@app.get('/api/products/<key>')
def product_detail(key):
    if key.isdigit():
        cur = conn.execute('SELECT * FROM products WHERE id=?', (key,))
    else:
        cur = conn.execute('SELECT * FROM products WHERE slug=?', (key,))
    row = cur.fetchone()
    if not row: return jsonify({'error':'Product not found'}), 404
    cols = [c[0] for c in cur.description]
    return jsonify(dict(zip(cols,row)))

# Cart API
@app.get('/api/cart')
def cart_get():
    sid, cart_id = get_session()
    payload = make_response(jsonify({'cart_id': cart_id, **cart_payload(cart_id)}))
    if 'drive_session' not in request.cookies:
        payload.set_cookie('drive_session', sid, samesite='Lax')
    return payload

@app.post('/api/cart')
def cart_post():
    data = request.get_json(force=True, silent=True) or {}
    product_id = data.get('productId'); qty = int(data.get('quantity',1))
    if not product_id or qty<=0: return jsonify({'error':'Invalid payload'}), 400
    _, cart_id = get_session()
    cur = conn.execute('SELECT id, quantity FROM cart_items WHERE cart_id=? AND product_id=?', (cart_id, product_id))
    row = cur.fetchone()
    if row:
        conn.execute('UPDATE cart_items SET quantity=? WHERE id=?', (row[1]+qty, row[0]))
    else:
        conn.execute('INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?,?,?)', (cart_id, product_id, qty))
    conn.commit()
    return jsonify({'cart_id': cart_id, **cart_payload(cart_id)})

@app.patch('/api/cart')
def cart_patch():
    data = request.get_json(force=True, silent=True) or {}
    item_id = data.get('itemId'); quantity = data.get('quantity')
    if item_id is None or quantity is None or int(quantity) < 0:
        return jsonify({'error':'Invalid payload'}), 400
    quantity = int(quantity)
    _, cart_id = get_session()
    if quantity == 0:
        conn.execute('DELETE FROM cart_items WHERE id=? AND cart_id=?', (item_id, cart_id))
    else:
        conn.execute('UPDATE cart_items SET quantity=? WHERE id=? AND cart_id=?', (quantity, item_id, cart_id))
    conn.commit()
    return jsonify({'cart_id': cart_id, **cart_payload(cart_id)})

@app.delete('/api/cart/<item_id>')
def cart_delete(item_id):
    _, cart_id = get_session()
    conn.execute('DELETE FROM cart_items WHERE id=? AND cart_id=?', (item_id, cart_id))
    conn.commit()
    return jsonify({'cart_id': cart_id, **cart_payload(cart_id)})

@app.post('/api/checkout')
def checkout():
    _, cart_id = get_session()
    conn.execute('DELETE FROM cart_items WHERE cart_id=?', (cart_id,))
    conn.commit()
    return jsonify({'ok': True, 'cart_id': cart_id, **cart_payload(cart_id)})

# Auth stubs (not implemented)
@app.post('/api/auth/register')
@app.post('/api/auth/login')
@app.post('/api/auth/logout')
def auth_stub():
    return jsonify({'error':'Auth not implemented in Python server'}), 501

if __name__ == '__main__':
    print(f'[Python Flask] Running on http://localhost:{PORT} (mode=flask)')
    app.run(host='0.0.0.0', port=PORT)
