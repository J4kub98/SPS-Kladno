# DRIVE_SERVER – Jak spustit a pracovat s projektem

E‑shop s kofeinovou vodou (frontend + lokální DB). Tento projekt lze spustit jako:
- Node.js server (pokud je v repo `server.js` / `package.json`)
- statický vývojový server (pro čistý frontend)
- Databáze: SQLite soubor `site.db` v kořeni projektu

👉 Architektura, datové toky a ER diagram: viz `docs/architecture.md`.

> Poznámka k OneDrive: doporučujeme mít složku označenou jako „Always keep on this device“, jinak mohou být soubory (např. `site.db`) v režimu cloud‑only a nepůjdou číst.

---

## 1) Předpoklady
- Windows 10/11
- Node.js 18+ (LTS) a npm: https://nodejs.org
- SQLite CLI (volitelné): https://www.sqlite.org/download.html
- VS Code (doporučeno) + rozšíření Live Server (volitelné)

---

## 2) Instalace závislostí
Otevřete PowerShell v kořeni projektu a spusťte:

```powershell
cd "c:\Users\user\OneDrive - Střední průmyslová škola a Vyšší odborná škola, Kladno\DRIVE_SERVER"

# pokud existuje package.json
if (Test-Path .\package.json) { npm ci }
```

---

## 3) Spuštění serveru

### Varianta A: Node.js backend
Použijte, pokud projekt obsahuje server (`server.js` / `start` skript v `package.json`).

```powershell
# 1) pokud je v package.json skript "start"
npm start

# 2) jinak přímo
node server.js
```

Výchozí adresa bývá `http://localhost:3000` (nebo hodnota z proměnné `PORT`).

### Varianta B: Statický vývoj (frontend only)
Použijte, pokud není serverová část a chcete jen rychle zobrazit frontend.

```powershell
# a) VS Code → rozšíření "Live Server" → Open with Live Server
# b) Nebo přes npx (vyberte si jeden z nástrojů):
npx http-server . -p 5173 --cors
# nebo
npx serve . -l 5173
```

Aplikace poběží na `http://localhost:5173`.

---

## 4) Konfigurace prostředí (.env)
Vytvořte soubor `.env` (pokud backend používá proměnné):

```
PORT=3000
DATABASE_URL=sqlite:./site.db
SQLITE_PATH=./site.db
```

---

## 5) Databáze (SQLite)
- Soubor: `site.db`
- Umístění: kořen projektu (tento adresář)

Základní práce s DB (PowerShell + `sqlite3`):

```powershell
# vypiš tabulky
sqlite3 .\site.db ".tables"

# schéma konkrétní tabulky
sqlite3 .\site.db "PRAGMA table_info(products);"

# vytvoř zálohu
New-Item -ItemType Directory -Force -Path .\backup | Out-Null
Copy-Item .\site.db ".\backup\site_$(Get-Date -Format yyyyMMdd_HHmm).db"
```

Pokud `site.db` chybí a chcete rychle vytvořit prázdné minimum, vytvořte `init.sql` například takto:

```sql
-- init.sql
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  price_czk INTEGER NOT NULL,
  image TEXT,
  flavor TEXT,
  in_stock INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  created_at TEXT DEFAULT (datetime('now')),
  total_czk INTEGER NOT NULL
);
```

A spusťte:

```powershell
sqlite3 .\site.db ".read init.sql"
```

---

## 6) Testování
- Otevřete aplikaci (adresa dle zvolené varianty).
- Zkuste přidat produkt do košíku, otevřít mini‑cart, změnit množství, přejít na checkout.
- Ověřte responzivitu (Chrome DevTools → Toggle device toolbar).
- Spusťte Lighthouse (v Chrome DevTools) pro SEO / Performance / Accessibility.

---

## 7) Nasazení
- **Statický frontend**: Netlify / Vercel (drag&drop repo nebo složku buildu).
- **Node.js server**: Render / Railway / Fly.io
  - nastavte `PORT` a proměnnou s cestou k `site.db` (nebo použijte cloud DB),
  - přidejte start skript do `package.json`: `"start": "node server.js"`.

---

## 8) Řešení problémů
- **Port je obsazen**:
  ```powershell
  netstat -aon | findstr :3000
  taskkill /PID <PID> /F
  ```
- **OneDrive „cloud‑only“ soubory**: v Průzkumníku → pravým na složku → „Always keep on this device“.
- **Chybí SQLite CLI**: nainstalujte ho nebo použijte GUI „DB Browser for SQLite“.

---

## 9) Struktura projektu (zjednodušeně)
```
DRIVE_SERVER/
├─ index.html
├─ server.js (volitelné)
├─ package.json (volitelné)
├─ site.db
├─ Products/
├─ Product-detail/
├─ Cart/
├─ AboutUs/
├─ src/ (např. db skripty)
└─ style.css
```

Pokud budete potřebovat doplnit další části (např. build skripty, CI/CD, Docker), napište a přidáme je.

---

## Alternativa: spusťte web přes Python (bez Node.js)

Pokud v síti školy není možné instalovat Node.js, v repozitáři je jednoduchý Python server `python_server.py`, který:

- v režimu `minimal` (výchozí) používá pouze standardní knihovnu Pythonu a servíruje statické soubory + lehké `/api` endpointy potřebné pro frontend (produkty, košík, checkout).
- v režimu `flask` spustí obdobu Express API pomocí Flasku (vyžaduje instalaci Flask).

Spuštění (PowerShell):

```powershell
# minimal (žádné další balíčky nutné)
python .\python_server.py

# nastavit port např. 4000
$env:PORT=4000; python .\python_server.py

# flask režim (po nainstalování Flask)
$env:PY_MODE="flask"; python .\python_server.py
```

Instalace Flask (volitelné, doporučeno v izolovaném venvu):

```powershell
# vytvoř a aktivuj virtuální prostředí (PowerShell)
python -m venv .venv
.\\.venv\\Scripts\\Activate.ps1
# nainstaluj požadavky
pip install -r requirements.txt
```

Poznámky:
- Databáze se uloží do `data/site.db` a skript ji seedne, pokud chybí.
- Minimal režim implementuje základní API (produkty, produkt detail, košík CRUD, checkout) potřebné pro frontend. Některé administrativní/auth endpointy mohou vracet 501 v tomto režimu.
- Doma můžete nadále používat Node/Express (`npm start`) — Python server je jen fallback pro prostředí bez Node.
