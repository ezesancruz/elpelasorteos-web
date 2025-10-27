from pdf2image import convert_from_path
import pytesseract
import re
import os
import pandas as pd
import sqlite3

# --- Configuración ---
INPUT_DIR = r"C:\Users\El Pela Flow\OneDrive\Documentos\Lector comprobantes\comprobantes"
OUTPUT_CSV = "comprobantes.csv"
OUTPUT_CSV_LIMPIO = "comprobantes_limpio.csv"

# Ajustar si Tesseract no está en PATH
# pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

# --- Regex específicos de Mercado Pago ---
RE_FECHA_IMPRESION = re.compile(r'(\d{1,2}/\d{1,2}/\d{2,4},\s*\d{1,2}:\d{2}\s*(?:a\.m\.|p\.m\.))', re.IGNORECASE)
RE_FECHA_PAGO = re.compile(r'Creada\s+el\s+([0-9]{1,2}\s+de\s+[A-Za-záéíóú]+)\s*-\s*([0-9]{1,2}:[0-9]{2}\s*hs)', re.IGNORECASE)
RE_NUMERO_OP = re.compile(r'(?:Número|N°)\s+de\s+operaci[oó]n\s+([0-9]+)', re.IGNORECASE)
RE_MONTO_BRUTO = re.compile(r'Cobro\s*\$?\s*([0-9\.\,]+)', re.IGNORECASE)
RE_CARGO_MP = re.compile(r'Cargo\s+de\s+Mercado\s+Pago.*?\$?\s*([0-9\.\,]+)', re.IGNORECASE)
RE_MONTO_NETO = re.compile(r'Total\s*\$?\s*([0-9\.\,]+)', re.IGNORECASE)
RE_ESTADO = re.compile(r'(Cobro\s+(?:aprobado|pendiente|rechazado))', re.IGNORECASE)
RE_MEDIO_PAGO = re.compile(r'Medio\s+de\s+pago\s+([A-Za-z\s]+)', re.IGNORECASE)
RE_CANTIDAD = re.compile(r'Vendiste\s+(\d+)\s+producto', re.IGNORECASE)
RE_CLIENTE = re.compile(r'Cliente\s+([A-Za-zÁÉÍÓÚÜÑ\s]+)', re.IGNORECASE)
RE_EMAIL = re.compile(r'([\w\.-]+@[\w\.-]+\.\w+)', re.IGNORECASE)
RE_LINK = re.compile(r'https://[^\s]+', re.IGNORECASE)

# --- Función de extracción de texto por OCR ---
def ocr_pdf(pdf_path):
    images = convert_from_path(pdf_path, dpi=300)
    texts = []
    for img in images:
        txt = pytesseract.image_to_string(img, lang="spa")
        texts.append(txt)
    return "\n".join(texts)

# --- Extracción de campos ---
def parse_comprobante_text(text, file_name):
    row = {
        "file": file_name,
        "used_ocr": True,
        "fecha_impresion": None,
        "fecha_pago": None,
        "numero_operacion": None,
        "monto_bruto": None,
        "cargo_mp": None,
        "monto_neto": None,
        "estado": None,
        "medio_pago": None,
        "cantidad_productos": None,
        "cliente_nombre": None,
        "cliente_email": None,
        "link_detalle": None,
        "description": None,
        "texto_raw": text[:600].replace("\n", " ")
    }

    if m := RE_FECHA_IMPRESION.search(text):
        row["fecha_impresion"] = m.group(1).strip()
    if m := RE_FECHA_PAGO.search(text):
        row["fecha_pago"] = f"{m.group(1)} {m.group(2)}"
    if m := RE_NUMERO_OP.search(text):
        row["numero_operacion"] = m.group(1)
    if m := RE_MONTO_BRUTO.search(text):
        row["monto_bruto"] = m.group(1)
    if m := RE_CARGO_MP.search(text):
        row["cargo_mp"] = m.group(1)
    if m := RE_MONTO_NETO.search(text):
        row["monto_neto"] = m.group(1)
    if m := RE_ESTADO.search(text):
        row["estado"] = m.group(1)
    if m := RE_MEDIO_PAGO.search(text):
        row["medio_pago"] = m.group(1).strip()
    if m := RE_CANTIDAD.search(text):
        row["cantidad_productos"] = m.group(1)
    if m := RE_CLIENTE.search(text):
        row["cliente_nombre"] = m.group(1).strip()
    if m := RE_EMAIL.search(text):
        row["cliente_email"] = m.group(1)
    if m := RE_LINK.search(text):
        row["link_detalle"] = m.group(0)
    return row

# --- Procesamiento principal ---
def main():
    # --- Conexión a la base de datos ---
    conn = sqlite3.connect("pagos.db")
    db_df = pd.read_sql_query("SELECT numero_operacion, description FROM pagos", conn)
    conn.close()

    files = [f for f in os.listdir(INPUT_DIR) if f.lower().endswith(".pdf")]
    rows = []

    for f in files:
        path = os.path.join(INPUT_DIR, f)
        print(f"Procesando {f} ...")
        try:
            text = ocr_pdf(path)
            row = parse_comprobante_text(text, f)
            rows.append(row)
        except Exception as e:
            print(f"⚠️ Error con {f}: {e}")

    if not rows:
        print("No se encontraron comprobantes válidos.")
        return

    # --- CSV completo ---
    df = pd.DataFrame(rows)

    # --- Merge con datos de la DB ---
    # Asegurarse que la columna de merge sea del mismo tipo
    df['numero_operacion'] = df['numero_operacion'].astype(str)
    db_df['numero_operacion'] = db_df['numero_operacion'].astype(str)
    
    # Merge para agregar la descripción
    df = pd.merge(df, db_df, on="numero_operacion", how="left")

    df.to_csv(OUTPUT_CSV, index=False, encoding="utf-8-sig")
    print(f"\n✅ Listo. CSV guardado en: {OUTPUT_CSV}")
    print(f"Total comprobantes procesados: {len(rows)}")

    # --- CSV limpio paralelo ---
    clean_cols = [
        "fecha_pago",
        "numero_operacion",
        "description",
        "monto_bruto",
        "estado",
        "medio_pago",
        "cliente_nombre",
        "cliente_email",
        "link_detalle"
    ]
    # Filtrar solo columnas disponibles (por si alguna falta)
    clean_cols = [c for c in clean_cols if c in df.columns]
    clean_df = df[clean_cols].copy()
    clean_df.to_csv(OUTPUT_CSV_LIMPIO, index=False, encoding="utf-8-sig")
    print(f"🧾 CSV limpio guardado en: {OUTPUT_CSV_LIMPIO}")

if __name__ == "__main__":
    main()
