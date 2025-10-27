#!/usr/bin/env python3
import json, sqlite3, sys
from pathlib import Path

# Localiza la base en el directorio del microservicio
BASE_DIR = Path(__file__).resolve().parents[1]
DB_PATH = BASE_DIR / 'pagos.db'

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "Falta parámetro op"}, ensure_ascii=False))
        return 1

    op = sys.argv[1].strip()
    if not (op.isdigit() and 6 <= len(op) <= 24):
        print(json.dumps({"ok": False, "error": "Parámetro op inválido"}, ensure_ascii=False))
        return 1

    if not DB_PATH.exists():
        print(json.dumps({"ok": False, "error": "Base de datos no encontrada"}, ensure_ascii=False))
        return 1

    try:
        conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA query_only = ON")
        row = conn.execute(
            """
            SELECT numero_operacion, status, amount, currency, date_approved, payer_name, description
            FROM pagos WHERE numero_operacion = ?
            """,
            (op,),
        ).fetchone()
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"Error DB: {e}"}, ensure_ascii=False))
        return 1
    finally:
        try:
            conn.close()
        except Exception:
            pass

    if not row:
        print(json.dumps({
            "verified": False,
            "numero_operacion": None,
            "status": None,
            "fecha": None,
            "monto": None,
            "moneda": "ARS",
            "payer_name": None,
            "description": None,
            "mensaje": "No encontrado. Si pagaste hace poco, puede demorar unos minutos en sincronizarse."
        }, ensure_ascii=False))
        return 0

    aprobado = (row["status"] == "approved")
    resp = {
        "verified": bool(aprobado),
        "numero_operacion": row["numero_operacion"],
        "status": row["status"],
        "fecha": row["date_approved"],
        "monto": float(row["amount"]) if row["amount"] is not None else None,
        "moneda": row["currency"] or "ARS",
        "payer_name": row["payer_name"],
        "description": row["description"],
        "mensaje": "El número de operación fue verificado con éxito." if aprobado else "Pago aún no acreditado."
    }

    print(json.dumps(resp, ensure_ascii=False))
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
