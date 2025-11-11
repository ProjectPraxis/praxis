"""
FastAPI backend server for Praxis application
Handles class management API endpoints
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import json
import uuid
from datetime import datetime
from pathlib import Path

app = FastAPI(title="Praxis API", version="1.0.0")

# CORS middleware to allow frontend to access the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development (restrict in production)
    allow_credentials=False,  # Must be False when using allow_origins=["*"]
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Data file path
DATA_FILE = Path(__file__).parent / "classes_data.json"


# Pydantic models for request/response
class ClassCreate(BaseModel):
    code: str
    name: str
    totalLectures: int
    semester: str
    description: Optional[str] = ""


class ClassResponse(BaseModel):
    id: str
    code: str
    name: str
    totalLectures: int
    currentLecture: int
    semester: str
    description: str
    createdAt: str


def load_classes() -> List[dict]:
    """Load classes from JSON file"""
    if DATA_FILE.exists():
        with open(DATA_FILE, 'r') as f:
            return json.load(f)
    return []


def save_classes(classes: List[dict]):
    """Save classes to JSON file"""
    with open(DATA_FILE, 'w') as f:
        json.dump(classes, f, indent=2)


@app.get("/")
def read_root():
    """Root endpoint"""
    return {"message": "Praxis API is running", "version": "1.0.0"}


@app.get("/api/classes", response_model=List[ClassResponse])
def get_classes():
    """Get all classes"""
    classes = load_classes()
    return classes


@app.post("/api/classes", response_model=ClassResponse, status_code=201)
def create_class(class_data: ClassCreate):
    """Create a new class"""
    classes = load_classes()
    
    # Create new class object
    new_class = {
        "id": str(uuid.uuid4()),
        "code": class_data.code,
        "name": class_data.name,
        "totalLectures": class_data.totalLectures,
        "currentLecture": 0,  # New classes start at lecture 0
        "semester": class_data.semester,
        "description": class_data.description,
        "createdAt": datetime.now().isoformat()
    }
    
    classes.append(new_class)
    save_classes(classes)
    
    return new_class


@app.get("/api/classes/{class_id}", response_model=ClassResponse)
def get_class(class_id: str):
    """Get a specific class by ID"""
    classes = load_classes()
    for class_item in classes:
        if class_item["id"] == class_id:
            return class_item
    raise HTTPException(status_code=404, detail="Class not found")


@app.put("/api/classes/{class_id}", response_model=ClassResponse)
def update_class(class_id: str, class_data: ClassCreate):
    """Update a class"""
    classes = load_classes()
    for i, class_item in enumerate(classes):
        if class_item["id"] == class_id:
            classes[i].update({
                "code": class_data.code,
                "name": class_data.name,
                "totalLectures": class_data.totalLectures,
                "semester": class_data.semester,
                "description": class_data.description
            })
            save_classes(classes)
            return classes[i]
    raise HTTPException(status_code=404, detail="Class not found")


@app.delete("/api/classes/{class_id}", status_code=204)
def delete_class(class_id: str):
    """Delete a class"""
    classes = load_classes()
    for i, class_item in enumerate(classes):
        if class_item["id"] == class_id:
            classes.pop(i)
            save_classes(classes)
            return
    raise HTTPException(status_code=404, detail="Class not found")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)

