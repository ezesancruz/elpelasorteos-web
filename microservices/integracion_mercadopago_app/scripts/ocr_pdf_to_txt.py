from pdf2image import convert_from_path
import pytesseract
import os

# Si estás en Windows y Tesseract no está en PATH, descomentá y ajustá la ruta:
# pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

PDF_FILE = "22.pdf"
OUTPUT_TXT = "22_ocr.txt"

# Convierte PDF a imágenes (una por página)
images = convert_from_path(PDF_FILE, dpi=300)

# OCR página por página
text_all = []
for i, img in enumerate(images):
    text = pytesseract.image_to_string(img, lang='spa')
    text_all.append(text)
    print(f"Página {i+1} procesada.")

# Guarda el resultado
with open(OUTPUT_TXT, "w", encoding="utf-8") as f:
    f.write("\n\n".join(text_all))

print("✅ OCR completado. Texto guardado en", OUTPUT_TXT)
