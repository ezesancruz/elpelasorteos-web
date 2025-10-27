import os, json, sqlite3, time, argparse, datetime as dt
import requests
from pathlib import Path
from dotenv import load_dotenv

DB_PATH = Path("pagos.db")

SCHEMA = """
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS pagos (
  payment_id        INTEGER PRIMARY KEY,
  numero_operacion  TEXT UNIQUE,
  external_reference TEXT,
  description       TEXT,
  status            TEXT,
  status_detail     TEXT,
  amount            REAL,
  currency          TEXT,
  payer_email       TEXT,
  payer_name        TEXT,
  payment_method_id TEXT,
  date_created      TEXT,
  date_approved     TEXT,
  receipt_url       TEXT,
  detalle_url       TEXT,
  source            TEXT NOT NULL,
  raw               TEXT,
  updated_at        TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pagos_numero_operacion ON pagos (numero_operacion);
CREATE INDEX IF NOT EXISTS idx_pagos_date_created ON pagos (date_created);
CREATE INDEX IF NOT EXISTS idx_pagos_status ON pagos (status);

CREATE TABLE IF NOT EXISTS sync_state (
  id INTEGER PRIMARY KEY CHECK (id=1),
  last_synced_at TEXT
);

INSERT OR IGNORE INTO sync_state (id, last_synced_at) VALUES (1, NULL);
"""

def load_env():
    # Cargar el .env unificado desde la raíz del proyecto (web/.env)
    root_env = Path(__file__).resolve().parents[3] / ".env"
    load_dotenv(dotenv_path=root_env)
    token = os.getenv("MP_ACCESS_TOKEN")
    if not token:
        token = os.getenv("Access_Token")
        if token:
            os.environ["MP_ACCESS_TOKEN"] = token
    token = os.getenv("MP_ACCESS_TOKEN")
    if not token or not token.startswith("APP_USR-"):
        raise SystemExit("MP_ACCESS_TOKEN no encontrado o no es de producción (APP_USR-).")
    return token

def open_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn

def ensure_schema(conn):
    conn.executescript(SCHEMA)
    # check if description column exists
    cur = conn.execute("PRAGMA table_info(pagos)")
    columns = [row[1] for row in cur.fetchall()]
    if 'description' not in columns:
        print("[sync] Adding 'description' column to 'pagos' table.")
        conn.execute("ALTER TABLE pagos ADD COLUMN description TEXT")
    conn.commit()

def get_checkpoint(conn, days_back_default=2):
    cur = conn.execute("SELECT last_synced_at FROM sync_state WHERE id=1")
    row = cur.fetchone()
    if row and row[0]:
        t = dt.datetime.fromisoformat(row[0].replace("Z","")).replace(tzinfo=dt.timezone.utc) - dt.timedelta(minutes=10)
    else:
        t = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=days_back_default)
    return t

def save_checkpoint(conn, when_utc: dt.datetime):
    iso = when_utc.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    conn.execute("UPDATE sync_state SET last_synced_at=? WHERE id=1", (iso,))
    conn.commit()

def canon_op(payment_id):
    return str(payment_id)

def get_user_nickname(token, user_id):
    """Obtiene el nickname de un usuario a partir de su ID."""
    if not user_id:
        return None
    url = f"https://api.mercadopago.com/users/{user_id}"
    headers = {"Authorization": f"Bearer {token}"}
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.status_code == 200:
            return resp.json().get("nickname")
        else:
            print(f"[sync] Error al obtener nickname para el usuario {user_id}: {resp.status_code}")
            return None
    except requests.exceptions.RequestException as e:
        print(f"[sync] Error de red al obtener nickname para el usuario {user_id}: {e}")
        return None

def upsert_pago(conn, p: dict, token: str):
    numero_operacion = canon_op(p["id"])
    payer_name = " ".join(filter(None, [p.get("payer",{}).get("first_name"), p.get("payer",{}).get("last_name")])).strip() or None
    if not payer_name:
        payer_id = p.get("payer", {}).get("id")
        if payer_id:
            payer_name = get_user_nickname(token, payer_id)
    raw_json = json.dumps(p, ensure_ascii=False)
    conn.execute("""
    INSERT INTO pagos (
      payment_id, numero_operacion, external_reference, description, status, status_detail,
      amount, currency, payer_email, payer_name, payment_method_id,
      date_created, date_approved, receipt_url, detalle_url, source, raw, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, ?, datetime('now'))
    ON CONFLICT(payment_id) DO UPDATE SET
      status=excluded.status,
      status_detail=excluded.status_detail,
      description=excluded.description,
      amount=excluded.amount,
      currency=excluded.currency,
      payer_email=excluded.payer_email,
      payer_name=excluded.payer_name,
      payment_method_id=excluded.payment_method_id,
      date_created=excluded.date_created,
      date_approved=excluded.date_approved,
      receipt_url=excluded.receipt_url,
      detalle_url=excluded.detalle_url,
      raw=excluded.raw,
      updated_at=datetime('now')
    """, (
      p["id"],
      numero_operacion,
      p.get("external_reference"),
      p.get("description"),
      p.get("status"),
      p.get("status_detail"),
      p.get("transaction_amount"),
      p.get("currency_id") or "ARS",
      (p.get("payer") or {}).get("email"),
      payer_name,
      p.get("payment_method_id"),
      p.get("date_created"),
      p.get("date_approved"),
      p.get("receipt_url"),
      None,
      "api",
      raw_json
    ))

def search_payments(token, begin_iso: str, end_iso: str):
    url = "https://api.mercadopago.com/v1/payments/search"
    headers = {"Authorization": f"Bearer {token}"}
    limit = 50
    offset = 0
    while True:
        params = {
            "range": "date_last_updated",
            "begin_date": begin_iso,
            "end_date": end_iso,
            "limit": limit,
            "offset": offset
        }
        resp = requests.get(url, headers=headers, params=params, timeout=60)
        if resp.status_code == 401:
            raise SystemExit(f"401 Unauthorized. Revisá el token.")
        resp.raise_for_status()
        data = resp.json() or {}
        results = data.get("results", [])
        if not results:
            break
        yield from results
        offset += limit
        time.sleep(0.2)

def get_payment_details(token, payment_id):
    """Obtiene los detalles completos de un pago individual."""
    url = f"https://api.mercadopago.com/v1/payments/{payment_id}"
    headers = {"Authorization": f"Bearer {token}"}
    try:
        resp = requests.get(url, headers=headers, timeout=30)
        resp.raise_for_status()
        return resp.json()
    except requests.exceptions.RequestException as e:
        print(f"[sync] Error al obtener detalles para el pago {payment_id}: {e}")
        return None

def main(days_back: int, full_sync: bool = False):
    token = load_env()
    conn = open_db()
    ensure_schema(conn)

    now_utc = dt.datetime.now(dt.timezone.utc)
    
    if full_sync:
        print("[sync] Opción --full-sync activada. Ignorando checkpoint.")
        since_utc = now_utc - dt.timedelta(days=days_back)
    else:
        since_utc = get_checkpoint(conn, days_back_default=days_back)

    begin_iso = since_utc.strftime("%Y-%m-%dT%H:%M:%SZ")
    end_iso   = now_utc.strftime("%Y-%m-%dT%H:%M:%SZ")

    print(f"[sync] Ventana: {begin_iso} → {end_iso}")
    
    payment_summaries = list(search_payments(token, begin_iso, end_iso))
    
    if not payment_summaries:
        print("[sync] No se encontraron pagos nuevos o actualizados.")
        if not full_sync:
            save_checkpoint(conn, now_utc)
        return

    print(f"[sync] Se encontraron {len(payment_summaries)} pagos para procesar.")
    count = 0
    with conn:
        for p_summary in payment_summaries:
            payment_id = p_summary['id']
            print(f"[sync] Procesando pago ID: {payment_id}...")
            
            p_full = get_payment_details(token, payment_id)
            
            if p_full:
                with open("payment_details.log", "a", encoding="utf-8") as f:
                    f.write(json.dumps(p_full, indent=2, ensure_ascii=False))
                    f.write("\n")
                upsert_pago(conn, p_full, token)
                count += 1
            else:
                print(f"[sync] No se pudieron obtener los detalles para {payment_id}. Guardando resumen.")
                upsert_pago(conn, p_summary, token)

        if not full_sync:
            save_checkpoint(conn, now_utc)
        
    print(f"[sync] Upserts realizados: {count}. DB: {DB_PATH.resolve()}")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--days-back", type=int, default=2, help="Rango de días a sincronizar (por defecto 2 días)")
    ap.add_argument("--full-sync", action="store_true", help="Ignora el checkpoint y realiza una sincronización completa de los días especificados.")
    args = ap.parse_args()
    main(args.days_back, args.full_sync)
