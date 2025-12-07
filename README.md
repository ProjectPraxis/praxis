# Backend Setup

## 1. Create a virtual environment and install requirements

```bash
python3 -m venv venv
source venv/bin/activate 
pip install -r requirements.txt     

```

## 2. Start the API Server

```bash
# Option 1: Run directly
python api.py

# Option 2: Use the startup script (make it executable first)
chmod +x start_api.sh
./start_api.sh
```

The API will be available at `http://localhost:8001`

## 3. Start the Frontend
```bash
python3 -m http.server 8000


the frontend will be available at `http://localhost:8000`


