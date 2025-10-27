# API de Verificación de Pagos de Mercado Pago

Este proyecto proporciona una API simple para verificar pagos de Mercado Pago e incluye scripts para procesar comprobantes de pago.

## Características

-   **API de Verificación de Pagos**: Un backend con FastAPI para verificar el estado de los pagos por número de operación.
-   **Procesamiento de Comprobantes**: Scripts para extraer datos de comprobantes en PDF usando OCR.
-   **Sincronización de Datos**: Un script para sincronizar los pagos de Mercado Pago a una base de datos local.

## Componentes

### API (`api.py`)

Una aplicación FastAPI que expone endpoints para verificar pagos. Se conecta a una base de datos SQLite (`pagos.db`) para consultar la información de los pagos.

#### Endpoints de la API

-   `GET /health`: Un endpoint de health check que retorna `{"ok": True}`.
-   `GET /verificar`: Verifica un pago por su número de operación (`op`).
    -   **Parámetro de Consulta**: `op` (string, requerido) - El número de operación a verificar.
    -   **Respuestas**:
        -   `200 OK`: Retorna un objeto JSON con los detalles de la verificación.
        -   `422 Unprocessable Entity`: Si el parámetro `op` es inválido.

### Base de Datos

-   **`pagos.db`**: Una base de datos SQLite que almacena la información de los pagos. Tiene una tabla `pagos` con el siguiente esquema (parcial):
    -   `numero_operacion`: El ID de la operación de pago.
    -   `status`: El estado del pago (ej., "approved").
    -   `amount`: El monto del pago.
    -   `currency`: La moneda del pago.
    -   `date_approved`: La fecha en que se aprobó el pago.
    -   `payer_name`: El nombre del pagador.

### Scripts

-   **`sync_mp.py`**: Sincroniza los pagos recientes de Mercado Pago a la base de datos local `pagos.db`.
-   **`extract_comprobantes_mp.py`**: Extrae datos de los comprobantes en PDF de Mercado Pago usando OCR.
-   **`Comprobantes/ocr_pdf_to_txt.py`**: Un script de utilidad para extraer texto crudo de un archivo PDF.

## Instalación

1.  **Clona el repositorio:**
    ```bash
    git clone <url-del-repositorio>
    cd integracion_mercadopago_app
    ```

2.  **Crea un entorno virtual:**
    ```bash
    python -m venv venv
    source venv/bin/activate  # En Windows usa `venv\Scripts\activate`
    ```

3.  **Instala las dependencias:**
    ```bash
    pip install -r requirements.txt
    ```

4.  **Variables de entorno (unificadas en la raíz):**
    Este microservicio ahora lee variables desde el `.env` de la raíz del proyecto (un solo `.env` para todo `web/`).
    Define allí tus credenciales de Mercado Pago:
    ```
    MP_PUBLIC_KEY=APP_USR-...
    MP_ACCESS_TOKEN=APP_USR-...
    MP_CLIENT_ID=...
    MP_CLIENT_SECRET=...
    ```

## Uso

### Ejecutar la API

Para ejecutar la aplicación FastAPI, usa uvicorn:

```bash
uvicorn api:app --reload
```

La API estará disponible en `http://127.0.0.1:8000`.

### Ejecutar Scripts

Para ejecutar cualquiera de los scripts de Python, usa el siguiente formato:

```bash
python <nombre_del_script>.py
```

Por ejemplo, para sincronizar los pagos:
```bash
python sync_mp.py
```

## Licencia

Este proyecto está licenciado bajo la Licencia MIT. Consulta el archivo [LICENSE](LICENSE) para más detalles.
