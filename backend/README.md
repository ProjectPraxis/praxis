# Backend Setup

## 1. Create a virtual environment and install requirements

```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt     
c
```

## 2. Start the API Server

```bash
# Option 1: Run directly
python api.py

# Option 2: Use uvicorn directly
uvicorn api:app --reload --host 0.0.0.0 --port 8001

# Option 3: Use the startup script (make it executable first)
chmod +x start_api.sh
./start_api.sh
```

The API will be available at `http://localhost:8001`

