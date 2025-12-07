# Backend Setup

## 1. Create a virtual environment and install requirements

```bash
python3 -m venv venv
source venv/bin/activate 
pip install -r requirements.txt     
c
```
## 2. Setup MongoDB

Edit the `.env` file and add your MongoDB connection string:

```env
MONGODB_URL=mongodb+srv://username:<db_password>@praxis.zh1q0mm.mongodb.net/?appName=Praxis
MONGODB_DB_NAME=Praxis

## 3. Start the API Server

```bash
# Run directly
python api.py
```

The API will be available at `http://localhost:8001`

## 3. Start the Frontend
python3 -m http.server 8000

the frontend will be available at `http://localhost:8000`


