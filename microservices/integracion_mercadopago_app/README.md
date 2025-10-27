# Mercado Pago Payment Verification API

This project provides a simple API to verify Mercado Pago payments and includes scripts for processing payment receipts.

## Features

-   **Payment Verification API**: A FastAPI backend to verify payment status by operation number.
-   **Receipt Processing**: Scripts to extract data from PDF receipts using OCR.
-   **Data Synchronization**: A script to synchronize payments from Mercado Pago to a local database.

## Components

### API (`api.py`)

A FastAPI application that exposes endpoints to verify payments. It connects to a SQLite database (`pagos.db`) to check payment information.

#### API Endpoints

-   `GET /health`: A health check endpoint that returns `{"ok": True}`.
-   `GET /verificar`: Verifies a payment by its operation number (`op`).
    -   **Query Parameter**: `op` (string, required) - The operation number to verify.
    -   **Responses**:
        -   `200 OK`: Returns a JSON object with verification details.
        -   `422 Unprocessable Entity`: If the `op` parameter is invalid.

### Database

-   **`pagos.db`**: A SQLite database that stores payment information. It has a `pagos` table with the following (partial) schema:
    -   `numero_operacion`: The payment operation ID.
    -   `status`: The status of the payment (e.g., "approved").
    -   `amount`: The payment amount.
    -   `currency`: The currency of the payment.
    -   `date_approved`: The date the payment was approved.
    -   `payer_name`: The name of the payer.

### Scripts

-   **`sync_mp.py`**: Synchronizes recent payments from Mercado Pago to the local `pagos.db` database.
-   **`extract_comprobantes_mp.py`**: Extracts data from Mercado Pago PDF receipts using OCR.
-   **`Comprobantes/ocr_pdf_to_txt.py`**: A utility script to extract raw text from a PDF file.

## Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd integracion_mercadopago_app
    ```

2.  **Create a virtual environment:**
    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows use `venv\Scripts\activate`
    ```

3.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

4.  **Environment variables (Unified at project root):**
    This microservice now reads environment variables from the project root `.env` (single `.env` for the entire `web/` project).
    Define your Mercado Pago credentials there:
    ```
    MP_PUBLIC_KEY=APP_USR-...
    MP_ACCESS_TOKEN=APP_USR-...
    MP_CLIENT_ID=...
    MP_CLIENT_SECRET=...
    ```

## Usage

### Running the API

To run the FastAPI application, use uvicorn:

```bash
uvicorn api:app --reload
```

The API will be available at `http://127.0.0.1:8000`.

### Running Scripts

To run any of the Python scripts, use the following format:

```bash
python <script_name>.py
```

For example, to synchronize payments:
```bash
python sync_mp.py
```

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
