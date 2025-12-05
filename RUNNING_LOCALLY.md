# How to Run Project Praxis Locally

This project consists of a FastAPI backend and a vanilla HTML/JS frontend.

## Prerequisites

- Python 3.8+
- `pip` (Python package manager)
- (Optional) `npm` or `python` to serve the frontend

## 1. Backend Setup

The backend is located in the `backend/` directory.

1.  **Navigate to the backend directory:**
    ```bash
    cd backend
    ```

2.  **Create and activate a virtual environment:**
    ```bash
    python3 -m venv venv
    source venv/bin/activate  # On Windows: venv\Scripts\activate
    ```

3.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

4.  **Start the API server:**
    You can use the provided script or run it directly.
    ```bash
    # Option A: Use the script (Mac/Linux)
    chmod +x start_api.sh
    ./start_api.sh

    # Option B: Run with python
    python api.py

    # Option C: Run with uvicorn directly
    uvicorn api:app --reload --host 0.0.0.0 --port 8001
    ```
    The backend will start on `http://localhost:8001`.
    API Documentation is available at `http://localhost:8001/docs`.

## 2. Frontend Setup

The frontend is a static web application located in the root directory.

1.  **Open the application:**
    You can simply open [index.html](file:///Users/yogee/Documents/JHU/praxis/index.html) in your browser.
    
    OR, for a better experience (to avoid some browser security restrictions), serve it locally:

    **Using Python:**
    ```bash
    # From the project root (parent of backend/)
    python3 -m http.server 8000
    ```
    Then visit `http://localhost:8000` in your browser.

    **Using Node.js (http-server):**
    ```bash
    npx http-server . -p 8000
    ```
    Then visit `http://localhost:8000` in your browser.

## Troubleshooting

- **CORS Issues:** If you see CORS errors in the browser console, make sure the backend is running and that [app.js](file:///Users/yogee/Documents/JHU/praxis/app.js) is pointing to the correct backend URL (default is `http://localhost:8001`).
- **Dependencies:** If `pip install` fails, ensure you have a recent version of pip (`pip install --upgrade pip`).
