#!/bin/bash
# Start the FastAPI backend server

# Activate virtual environment if it exists
if [ -d "venv" ]; then
    source venv/bin/activate
fi

# Install/update dependencies
pip install -r requirements.txt

# Start the server
python api.py

