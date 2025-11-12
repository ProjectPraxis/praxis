"""
FastAPI backend server for Praxis application
Handles class management API endpoints
"""

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
import json
import uuid
from datetime import datetime
from pathlib import Path
import shutil
import os

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

# Data file paths
DATA_FILE = Path(__file__).parent / "classes_data.json"
LECTURES_FILE = Path(__file__).parent / "lectures_data.json"
UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)  # Create uploads directory if it doesn't exist


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


class LectureCreate(BaseModel):
    title: str
    topics: List[str] = []
    classId: Optional[str] = None


class LectureResponse(BaseModel):
    id: str
    title: str
    topics: List[str]
    hasSlides: bool
    fileName: Optional[str] = None
    filePath: Optional[str] = None
    classId: Optional[str] = None
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


def load_lectures() -> List[dict]:
    """Load lectures from JSON file"""
    if LECTURES_FILE.exists():
        with open(LECTURES_FILE, 'r') as f:
            return json.load(f)
    return []


def save_lectures(lectures: List[dict]):
    """Save lectures to JSON file"""
    with open(LECTURES_FILE, 'w') as f:
        json.dump(lectures, f, indent=2)


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


# Lecture endpoints
@app.get("/api/lectures", response_model=List[LectureResponse])
def get_lectures(class_id: Optional[str] = None):
    """Get all lectures, optionally filtered by class_id"""
    lectures = load_lectures()
    if class_id:
        lectures = [l for l in lectures if l.get("classId") == class_id]
    return lectures


@app.get("/api/lectures/{lecture_id}", response_model=LectureResponse)
def get_lecture(lecture_id: str):
    """Get a specific lecture by ID"""
    lectures = load_lectures()
    for lecture in lectures:
        if lecture["id"] == lecture_id:
            return lecture
    raise HTTPException(status_code=404, detail="Lecture not found")


@app.post("/api/lectures", response_model=LectureResponse, status_code=201)
async def create_lecture(
    title: str = Form(...),
    topics: str = Form("[]"),  # JSON string of topics array
    classId: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None)
):
    """Create a new lecture with optional file upload"""
    lectures = load_lectures()
    
    # Parse topics from JSON string
    try:
        topics_list = json.loads(topics) if topics else []
    except:
        topics_list = []
    
    # Handle file upload
    file_path = None
    file_name = None
    if file and file.filename:
        # Generate unique filename
        file_ext = Path(file.filename).suffix
        file_name = f"{uuid.uuid4()}{file_ext}"
        file_path = str(UPLOAD_DIR / file_name)
        
        # Save file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    
    # Create new lecture object
    new_lecture = {
        "id": str(uuid.uuid4()),
        "title": title,
        "topics": topics_list,
        "hasSlides": file is not None and file.filename is not None,
        "fileName": file_name,
        "filePath": file_path,
        "classId": classId,
        "createdAt": datetime.now().isoformat()
    }
    
    lectures.append(new_lecture)
    save_lectures(lectures)
    
    return new_lecture


@app.put("/api/lectures/{lecture_id}", response_model=LectureResponse)
async def update_lecture(
    lecture_id: str,
    title: str = Form(...),
    topics: str = Form("[]"),  # JSON string of topics array
    classId: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None)
):
    """Update a lecture with optional file upload"""
    lectures = load_lectures()
    
    for i, lecture in enumerate(lectures):
        if lecture["id"] == lecture_id:
            # Parse topics from JSON string
            try:
                topics_list = json.loads(topics) if topics else []
            except:
                topics_list = []
            
            # Handle file upload (if new file provided)
            file_path = lecture.get("filePath")
            file_name = lecture.get("fileName")
            if file and file.filename:
                # Delete old file if exists
                if file_path and Path(file_path).exists():
                    try:
                        os.remove(file_path)
                    except:
                        pass
                
                # Save new file
                file_ext = Path(file.filename).suffix
                file_name = f"{uuid.uuid4()}{file_ext}"
                file_path = str(UPLOAD_DIR / file_name)
                
                with open(file_path, "wb") as buffer:
                    shutil.copyfileobj(file.file, buffer)
            
            # Update lecture
            lectures[i].update({
                "title": title,
                "topics": topics_list,
                "hasSlides": file_path is not None,
                "fileName": file_name,
                "filePath": file_path,
                "classId": classId
            })
            
            save_lectures(lectures)
            return lectures[i]
    
    raise HTTPException(status_code=404, detail="Lecture not found")


@app.delete("/api/lectures/{lecture_id}", status_code=204)
def delete_lecture(lecture_id: str):
    """Delete a lecture and its associated file"""
    lectures = load_lectures()
    for i, lecture in enumerate(lectures):
        if lecture["id"] == lecture_id:
            # Delete associated file if exists
            file_path = lecture.get("filePath")
            if file_path and Path(file_path).exists():
                try:
                    os.remove(file_path)
                except:
                    pass
            
            lectures.pop(i)
            save_lectures(lectures)
            return
    raise HTTPException(status_code=404, detail="Lecture not found")


@app.get("/api/lectures/{lecture_id}/file")
def download_lecture_file(lecture_id: str):
    """Download the lecture slides file"""
    lectures = load_lectures()
    for lecture in lectures:
        if lecture["id"] == lecture_id:
            file_path = lecture.get("filePath")
            if file_path and Path(file_path).exists():
                return FileResponse(
                    file_path,
                    filename=lecture.get("fileName", "slides.pdf"),
                    media_type="application/octet-stream"
                )
            raise HTTPException(status_code=404, detail="File not found")
    raise HTTPException(status_code=404, detail="Lecture not found")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)

