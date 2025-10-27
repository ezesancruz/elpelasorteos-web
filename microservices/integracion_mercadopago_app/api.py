import os, sqlite3
from pathlib import Path
from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware

# Carga del .env unificado en la raíz del proyecto (web/.env)
ROOT_ENV = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=ROOT_ENV)

DB_PATH = Path("pagos.db")

app = FastAPI(title="Verificador de participación", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Permite todos los orígenes
    allow_credentials=True,
    allow_methods=["*"],  # Permite todos los métodos
    allow_headers=["*"],  # Permite todos los encabezados
)

def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def enmascarar(nombre: str | None):
    if not nombre: return None
    parts = nombre.strip().split()
    if len(parts) >= 2:
        return f"{parts[0]} {parts[1][0]}."
    return parts[0]

class VerifyResponse(BaseModel):
    verified: bool
    numero_operacion: str | None = None
    status: str | None = None
    fecha: str | None = None
    monto: float | None = None
    moneda: str | None = "ARS"
    payer_name: str | None = None
    description: str | None = None
    mensaje: str

@app.get("/health")
def health():
    return {"ok": True}

@app.get("/verificar", response_model=VerifyResponse)
def verificar(op: str = Query(..., min_length=6, max_length=24, pattern=r"^\d+$")):
    # solo dígitos; el "numero_operacion" es el payment.id canonizado
    with db() as conn:
        row = conn.execute("""
          SELECT numero_operacion, status, amount, currency, date_approved, payer_name, description
          FROM pagos WHERE numero_operacion = ?
        """, (op,)).fetchone()

    if not row:
        return VerifyResponse(
            verified=False,
            mensaje="No encontrado. Si pagaste hace poco, puede demorar unos minutos en sincronizarse."
        )

    aprobado = (row["status"] == "approved")
    return VerifyResponse(
        verified=aprobado,
        numero_operacion=row["numero_operacion"],
        status=row["status"],
        fecha=row["date_approved"],
        monto=float(row["amount"]) if row["amount"] is not None else None,
        moneda=row["currency"] or "ARS",
        payer_name=row["payer_name"],
        description=row["description"],
        mensaje= "El número de operación fue verificado con éxito." if aprobado else "Pago aún no acreditado."
    )
