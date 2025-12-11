"""
FastAPI backend server for Praxis application
Handles class management API endpoints
"""

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict
from typing import List, Optional
import json
import uuid
from datetime import datetime
from pathlib import Path
import shutil
import os
from gemini_analysis import analyze_lecture_video, save_analysis_result, analyze_lecture_materials, save_materials_analysis_result, generate_student_survey, save_survey
from database import (
    connect_to_mongo, close_mongo_connection, get_classes_collection, 
    get_lectures_collection, get_feedback_collection, get_surveys_collection, 
    get_survey_responses_collection, save_analysis_to_db, get_analysis_from_db,
    save_materials_analysis_to_db, get_materials_analysis_doc, save_survey_to_db,
    get_survey_from_db, get_assignments_collection
)
from bson import ObjectId
from bson.errors import InvalidId

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

# File paths (for file uploads only, data is in MongoDB)
UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)  # Create uploads directory if it doesn't exist
ANALYSIS_DIR = Path(__file__).parent / "data" / "analyses"
ANALYSIS_DIR.mkdir(parents=True, exist_ok=True)  # Create analyses directory if it doesn't exist (for file storage if needed)


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
    model_config = ConfigDict(extra='allow')  # Allow extra fields from JSON
    
    id: str
    title: str
    topics: List[str]
    hasSlides: bool
    fileName: Optional[str] = None
    filePath: Optional[str] = None
    hasVideo: Optional[bool] = False
    videoName: Optional[str] = None
    videoPath: Optional[str] = None
    classId: Optional[str] = None
    createdAt: str
    hasAnalysis: Optional[bool] = False
    analysisPath: Optional[str] = None


class AssignmentCreate(BaseModel):
    title: str
    dueDate: str
    description: Optional[str] = ""
    type: str # 'Essay', 'Problem Set', 'Reading', 'Project'
    classId: str


class AssignmentResponse(BaseModel):
    id: str
    title: str
    dueDate: str
    description: str
    type: str
    classId: str
    createdAt: str
    status: str = "Active" # Active, Completed, Past Due
    hasFile: Optional[bool] = False
    fileName: Optional[str] = None
    filePath: Optional[str] = None


# MongoDB helper functions
async def get_all_classes() -> List[dict]:
    """Get all classes from MongoDB"""
    collection = get_classes_collection()
    cursor = collection.find({})
    classes = await cursor.to_list(length=None)
    # Convert ObjectId to string for JSON serialization
    for cls in classes:
        if "_id" in cls:
            cls["id"] = str(cls.pop("_id"))
    return classes


async def get_class_by_id(class_id: str) -> Optional[dict]:
    """Get a class by ID from MongoDB"""
    collection = get_classes_collection()
    try:
        class_doc = await collection.find_one({"_id": class_id})
        if class_doc:
            class_doc["id"] = str(class_doc.pop("_id"))
        return class_doc
    except:
        return None


async def create_class_doc(class_data: dict) -> dict:
    """Create a new class in MongoDB"""
    collection = get_classes_collection()
    class_id = str(uuid.uuid4())
    class_data["_id"] = class_id
    await collection.insert_one(class_data)
    class_data["id"] = class_data.pop("_id")
    return class_data


async def update_class(class_id: str, update_data: dict) -> Optional[dict]:
    """Update a class in MongoDB"""
    collection = get_classes_collection()
    result = await collection.find_one_and_update(
        {"_id": class_id},
        {"$set": update_data},
        return_document=True
    )
    if result:
        result["id"] = str(result.pop("_id"))
    return result


async def delete_class(class_id: str) -> bool:
    """Delete a class from MongoDB"""
    collection = get_classes_collection()
    result = await collection.delete_one({"_id": class_id})
    return result.deleted_count > 0


async def get_all_lectures() -> List[dict]:
    """Get all lectures from MongoDB"""
    collection = get_lectures_collection()
    cursor = collection.find({})
    lectures = await cursor.to_list(length=None)
    # Convert ObjectId to string for JSON serialization
    for lecture in lectures:
        if "_id" in lecture:
            lecture["id"] = str(lecture.pop("_id"))
    return lectures


async def get_lecture_by_id(lecture_id: str) -> Optional[dict]:
    """Get a lecture by ID from MongoDB"""
    collection = get_lectures_collection()
    try:
        lecture_doc = await collection.find_one({"_id": lecture_id})
        if lecture_doc:
            lecture_doc["id"] = str(lecture_doc.pop("_id"))
        return lecture_doc
    except:
        return None


async def get_lectures_by_class_id(class_id: str) -> List[dict]:
    """Get all lectures for a specific class"""
    collection = get_lectures_collection()
    cursor = collection.find({"classId": class_id})
    lectures = await cursor.to_list(length=None)
    for lecture in lectures:
        if "_id" in lecture:
            lecture["id"] = str(lecture.pop("_id"))
    return lectures


async def create_lecture_doc(lecture_data: dict) -> dict:
    """Create a new lecture in MongoDB"""
    collection = get_lectures_collection()
    lecture_id = str(uuid.uuid4())
    lecture_data["_id"] = lecture_id
    await collection.insert_one(lecture_data)
    lecture_data["id"] = lecture_data.pop("_id")
    return lecture_data


async def update_lecture_doc(lecture_id: str, update_data: dict) -> Optional[dict]:
    """Update a lecture in MongoDB"""
    collection = get_lectures_collection()
    result = await collection.find_one_and_update(
        {"_id": lecture_id},
        {"$set": update_data},
        return_document=True
    )
    if result:
        result["id"] = str(result.pop("_id"))
    return result


async def delete_lecture(lecture_id: str) -> bool:
    """Delete a lecture from MongoDB"""
    collection = get_lectures_collection()
    result = await collection.delete_one({"_id": lecture_id})
    return result.deleted_count > 0


@app.on_event("startup")
async def startup_event():
    """Connect to MongoDB on startup"""
    await connect_to_mongo()


@app.on_event("shutdown")
async def shutdown_event():
    """Close MongoDB connection on shutdown"""
    await close_mongo_connection()


@app.get("/")
def read_root():
    """Root endpoint"""
    return {"message": "Praxis API is running", "version": "1.0.0"}


@app.get("/api/classes", response_model=List[ClassResponse])
async def get_classes():
    """Get all classes"""
    classes = await get_all_classes()
    return classes


@app.post("/api/classes", response_model=ClassResponse, status_code=201)
async def create_class(class_data: ClassCreate):
    """Create a new class"""
    # Create new class object
    new_class = {
        "code": class_data.code,
        "name": class_data.name,
        "totalLectures": class_data.totalLectures,
        "currentLecture": 0,  # New classes start at lecture 0
        "semester": class_data.semester,
        "description": class_data.description,
        "createdAt": datetime.now().isoformat()
    }
    
    created_class = await create_class_doc(new_class)
    return created_class


@app.get("/api/classes/{class_id}", response_model=ClassResponse)
async def get_class(class_id: str):
    """Get a specific class by ID"""
    class_item = await get_class_by_id(class_id)
    if not class_item:
        raise HTTPException(status_code=404, detail="Class not found")
    return class_item


@app.put("/api/classes/{class_id}", response_model=ClassResponse)
async def update_class_endpoint(class_id: str, class_data: ClassCreate):
    """Update a class"""
    update_data = {
        "code": class_data.code,
        "name": class_data.name,
        "totalLectures": class_data.totalLectures,
        "semester": class_data.semester,
        "description": class_data.description
    }
    updated_class = await update_class(class_id, update_data)
    if not updated_class:
        raise HTTPException(status_code=404, detail="Class not found")
    return updated_class


@app.delete("/api/classes/{class_id}", status_code=204)
async def delete_class_endpoint(class_id: str):
    """Delete a class"""
    deleted = await delete_class(class_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Class not found")
    return


# Lecture endpoints
@app.get("/api/lectures", response_model=List[LectureResponse], response_model_exclude_unset=False, response_model_exclude_none=False)
async def get_lectures(class_id: Optional[str] = None):
    """Get all lectures, optionally filtered by class_id"""
    if class_id:
        lectures = await get_lectures_by_class_id(class_id)
    else:
        lectures = await get_all_lectures()
    
    # Sort by creation date, newest first
    lectures.sort(key=lambda x: x.get("createdAt", ""), reverse=True)
    # Ensure all lectures have hasAnalysis and analysisPath fields, even if None
    for lecture in lectures:
        if "hasAnalysis" not in lecture:
            lecture["hasAnalysis"] = False
        if "analysisPath" not in lecture:
            lecture["analysisPath"] = None
    return lectures


@app.get("/api/lectures/{lecture_id}", response_model=LectureResponse, response_model_exclude_unset=False, response_model_exclude_none=False)
async def get_lecture(lecture_id: str):
    """Get a specific lecture by ID"""
    lecture = await get_lecture_by_id(lecture_id)
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")
    # Ensure hasAnalysis and analysisPath fields are present
    if "hasAnalysis" not in lecture:
        lecture["hasAnalysis"] = False
    if "analysisPath" not in lecture:
        lecture["analysisPath"] = None
    return lecture


@app.post("/api/lectures", response_model=LectureResponse, status_code=201)
async def create_lecture(
    title: str = Form(...),
    topics: str = Form("[]"),  # JSON string of topics array
    classId: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    video: Optional[UploadFile] = File(None)
):
    """Create a new lecture with optional file upload"""
    # Parse topics from JSON string
    try:
        topics_list = json.loads(topics) if topics else []
    except:
        topics_list = []
    
    # Handle slides file upload
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
    
    # Handle video file upload
    video_path = None
    video_name = None
    if video and video.filename:
        # Generate unique filename
        video_ext = Path(video.filename).suffix
        video_name = f"{uuid.uuid4()}{video_ext}"
        video_path = str(UPLOAD_DIR / video_name)
        
        # Save video file
        with open(video_path, "wb") as buffer:
            shutil.copyfileobj(video.file, buffer)
    
    # Create new lecture object
    new_lecture = {
        "title": title,
        "topics": topics_list,
        "hasSlides": file is not None and file.filename is not None,
        "fileName": file_name,
        "filePath": file_path,
        "hasVideo": video is not None and video.filename is not None,
        "videoName": video_name,
        "videoPath": video_path,
        "classId": classId,
        "createdAt": datetime.now().isoformat(),
        "hasAnalysis": False,
        "analysisPath": None
    }
    
    created_lecture = await create_lecture_doc(new_lecture)
    return created_lecture


@app.put("/api/lectures/{lecture_id}", response_model=LectureResponse)
async def update_lecture(
    lecture_id: str,
    title: str = Form(...),
    topics: str = Form("[]"),  # JSON string of topics array
    classId: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    video: Optional[UploadFile] = File(None)
):
    """Update a lecture with optional file upload"""
    # Get existing lecture
    existing_lecture = await get_lecture_by_id(lecture_id)
    if not existing_lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")
    
    # Parse topics from JSON string
    try:
        topics_list = json.loads(topics) if topics else []
    except:
        topics_list = []
    
    # Handle slides file upload (if new file provided)
    file_path = existing_lecture.get("filePath")
    file_name = existing_lecture.get("fileName")
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
    
    # Handle video file upload (if new file provided)
    video_path = existing_lecture.get("videoPath")
    video_name = existing_lecture.get("videoName")
    if video and video.filename:
        # Delete old video if exists
        if video_path and Path(video_path).exists():
            try:
                os.remove(video_path)
            except:
                pass
        
        # Save new video
        video_ext = Path(video.filename).suffix
        video_name = f"{uuid.uuid4()}{video_ext}"
        video_path = str(UPLOAD_DIR / video_name)
        
        with open(video_path, "wb") as buffer:
            shutil.copyfileobj(video.file, buffer)
    
    # Update lecture (preserve hasAnalysis and analysisPath if they exist)
    update_data = {
        "title": title,
        "topics": topics_list,
        "hasSlides": file_path is not None,
        "fileName": file_name,
        "filePath": file_path,
        "hasVideo": video_path is not None,
        "videoName": video_name,
        "videoPath": video_path,
        "classId": classId
    }
    # Preserve existing analysis status if not being updated
    if "hasAnalysis" in existing_lecture:
        update_data["hasAnalysis"] = existing_lecture.get("hasAnalysis", False)
    if "analysisPath" in existing_lecture:
        update_data["analysisPath"] = existing_lecture.get("analysisPath")
    
    updated_lecture = await update_lecture_doc(lecture_id, update_data)
    return updated_lecture


@app.delete("/api/lectures/{lecture_id}", status_code=204)
async def delete_lecture_endpoint(lecture_id: str):
    """Delete a lecture and its associated files"""
    # Get lecture before deleting
    lecture = await get_lecture_by_id(lecture_id)
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")
    
    # Delete associated slides file if exists
    file_path = lecture.get("filePath")
    if file_path and Path(file_path).exists():
        try:
            os.remove(file_path)
        except:
            pass
    
    # Delete associated video file if exists
    video_path = lecture.get("videoPath")
    if video_path and Path(video_path).exists():
        try:
            os.remove(video_path)
        except:
            pass
    
    # Delete from database
    deleted = await delete_lecture(lecture_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Lecture not found")
    return


@app.get("/api/lectures/{lecture_id}/file")
async def download_lecture_file(lecture_id: str):
    """Download the lecture slides file"""
    lecture = await get_lecture_by_id(lecture_id)
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")
    
    file_path = lecture.get("filePath")
    if file_path and Path(file_path).exists():
        return FileResponse(
            file_path,
            filename=lecture.get("fileName", "slides.pdf"),
            media_type="application/octet-stream"
        )
    raise HTTPException(status_code=404, detail="File not found")


@app.get("/api/lectures/{lecture_id}/video")
async def get_lecture_video(lecture_id: str):
    """Get the lecture video file"""
    lecture = await get_lecture_by_id(lecture_id)
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")
    
    video_path = lecture.get("videoPath")
    if not video_path:
        raise HTTPException(status_code=404, detail=f"Video path not set for lecture {lecture_id}")
    
    video_path_obj = Path(video_path)
    if not video_path_obj.exists():
        # Try to find the file in the uploads directory as a fallback
        video_name = lecture.get("videoName")
        if video_name:
            fallback_path = UPLOAD_DIR / video_name
            if fallback_path.exists():
                video_path_obj = fallback_path
                video_path = str(fallback_path)
            else:
                raise HTTPException(
                    status_code=404, 
                    detail=f"Video file not found at {video_path} or {fallback_path}"
                )
        else:
            raise HTTPException(
                status_code=404, 
                detail=f"Video file not found at {video_path}"
            )
    
    # Determine media type based on file extension
    ext = video_path_obj.suffix.lower()
    media_types = {
        '.mp4': 'video/mp4',
        '.mov': 'video/quicktime',
        '.avi': 'video/x-msvideo',
        '.mkv': 'video/x-matroska',
        '.webm': 'video/webm',
        '.flv': 'video/x-flv',
        '.wmv': 'video/x-ms-wmv'
    }
    media_type = media_types.get(ext, 'video/mp4')
    
    return FileResponse(
        str(video_path_obj),
        filename=lecture.get("videoName", "video.mp4"),
        media_type=media_type
    )


@app.post("/api/lectures/{lecture_id}/analyze")
async def analyze_lecture(lecture_id: str, video: Optional[UploadFile] = File(None)):
    """
    Analyze a lecture video using Gemini 2.5 Pro API.
    Saves the analysis result to MongoDB.
    If video is not provided, uses the existing video from the lecture.
    """
    lecture = await get_lecture_by_id(lecture_id)
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")
    
    # Use existing video path if available, otherwise use uploaded video
    video_path = lecture.get("videoPath")
    
    if video and video.filename:
        # Save the new video file if provided
        video_ext = Path(video.filename).suffix
        video_name = f"{uuid.uuid4()}{video_ext}"
        video_path = str(UPLOAD_DIR / video_name)
        
        with open(video_path, "wb") as buffer:
            shutil.copyfileobj(video.file, buffer)
        
        # Update lecture with new video path
        await update_lecture_doc(lecture_id, {
            "videoPath": video_path,
            "videoName": video_name,
            "hasVideo": True
        })
    elif not video_path or not Path(video_path).exists():
        raise HTTPException(status_code=400, detail="No video file available. Please upload a video first.")
    
    # Get lecture details
    lecture_title = lecture.get("title", "Lecture")
    topics = lecture.get("topics", [])
    class_id = lecture.get("classId") or lecture.get("class_id")
    
    # Load materials analysis if available (from MongoDB)
    materials_analysis = None
    materials_analysis_doc = await get_materials_analysis_doc(lecture_id)
    if materials_analysis_doc:
        materials_analysis = materials_analysis_doc.get("analysis_data")
    
    # Load professor feedback for this course if available (from MongoDB)
    professor_feedback = None
    if class_id:
        feedback_collection = get_feedback_collection()
        feedback_doc = await feedback_collection.find_one({"class_id": class_id})
        if feedback_doc:
            professor_feedback = {"feedback": feedback_doc.get("feedback", [])}
    
    try:
        # Analyze the video using Gemini with materials context and professor feedback
        analysis_result = analyze_lecture_video(
            video_path=video_path,
            lecture_id=lecture_id,
            lecture_title=lecture_title,
            topics=topics,
            materials_analysis=materials_analysis,
            professor_feedback=professor_feedback
        )
        
        # Check for errors
        if "error" in analysis_result:
            raise HTTPException(status_code=500, detail=f"Analysis failed: {analysis_result['error']}")
        
        # Save the analysis result to MongoDB (via gemini_analysis)
        # Note: save_analysis_result is now async and saves to MongoDB
        from gemini_analysis import save_analysis_result
        await save_analysis_result(analysis_result)
        
        # Update lecture with analysis status
        await update_lecture_doc(lecture_id, {
            "hasAnalysis": True,
            "analysisPath": None  # No longer using file paths
        })
        
        return {
            "status": "success",
            "lecture_id": lecture_id,
            "analysis": analysis_result
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analyzing video: {str(e)}")


@app.post("/api/lectures/{lecture_id}/analyze-materials")
async def analyze_materials(lecture_id: str, materials: Optional[UploadFile] = File(None)):
    """
    Analyze lecture materials (PDF, PowerPoint, etc.) using Gemini to extract intended topics.
    Saves the analysis result to MongoDB and updates the lecture with extracted topics.
    """
    lecture = await get_lecture_by_id(lecture_id)
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")
    
    # Use existing materials file if available, otherwise use uploaded materials
    materials_path = lecture.get("filePath")
    
    if materials and materials.filename:
        # Save the new materials file if provided
        file_ext = Path(materials.filename).suffix
        file_name = f"{uuid.uuid4()}{file_ext}"
        materials_path = str(UPLOAD_DIR / file_name)
        
        with open(materials_path, "wb") as buffer:
            shutil.copyfileobj(materials.file, buffer)
        
        # Update lecture with new materials path
        await update_lecture_doc(lecture_id, {
            "filePath": materials_path,
            "fileName": file_name,
            "hasSlides": True
        })
    elif not materials_path or not Path(materials_path).exists():
        raise HTTPException(status_code=400, detail="No materials file available. Please upload materials first.")
    
    # Get lecture details
    lecture_title = lecture.get("title", "Lecture")
    
    try:
        # Analyze the materials using Gemini
        analysis_result = analyze_lecture_materials(
            file_path=materials_path,
            lecture_id=lecture_id,
            lecture_title=lecture_title
        )
        
        # Check for errors
        if "error" in analysis_result:
            raise HTTPException(status_code=500, detail=f"Analysis failed: {analysis_result['error']}")
        
        # Save the materials analysis result to MongoDB (via gemini_analysis)
        from gemini_analysis import save_materials_analysis_result
        await save_materials_analysis_result(analysis_result)
        
        # Extract topic names for the lecture topics field
        extracted_topics = []
        if "topics" in analysis_result:
            for topic in analysis_result["topics"]:
                extracted_topics.append(topic["name"])
        
        # Get existing lecture to merge topics
        existing_lecture = await get_lecture_by_id(lecture_id)
        existing_topics = set(existing_lecture.get("topics", []))
        for topic in extracted_topics:
            existing_topics.add(topic)
        
        # Update lecture with materials analysis status and merged topics
        await update_lecture_doc(lecture_id, {
            "hasMaterialsAnalysis": True,
            "topics": list(existing_topics)
        })
        
        return {
            "status": "success",
            "lecture_id": lecture_id,
            "analysis": analysis_result,
            "extracted_topics": extracted_topics
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analyzing materials: {str(e)}")


@app.get("/api/lectures/{lecture_id}/materials-analysis")
async def get_materials_analysis(lecture_id: str):
    """Get the materials analysis result for a lecture from MongoDB"""
    lecture = await get_lecture_by_id(lecture_id)
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")
    
    materials_analysis_doc = await get_materials_analysis_doc(lecture_id)
    if not materials_analysis_doc:
        # Return empty object instead of 404 - materials analysis is optional
        return {}
    
    return materials_analysis_doc.get("analysis_data", {})


@app.get("/api/lectures/{lecture_id}/analysis")
async def get_lecture_analysis(lecture_id: str):
    """Get the analysis result for a lecture from MongoDB"""
    lecture = await get_lecture_by_id(lecture_id)
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")
    
    analysis_doc = await get_analysis_from_db(lecture_id)
    if not analysis_doc:
        raise HTTPException(status_code=404, detail="Analysis not found")
    
    return analysis_doc.get("analysis_data", {})


@app.post("/api/lectures/{lecture_id}/generate-survey/")
async def generate_lecture_survey(lecture_id: str, request: Request = None):
    """
    Generate a student comprehension survey for a lecture using Gemini AI.
    The survey is based on the lecture analysis and helps identify concepts that need reinforcement.
    """
    lecture = await get_lecture_by_id(lecture_id)
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")
    
    lecture_title = lecture.get("title", "Lecture")
    
    # Get professor input from request body if provided
    professor_input = None
    if request:
        try:
            body = await request.json()
            professor_input = body.get("professor_input")
        except:
            pass
    
    # Load the lecture analysis if available (from MongoDB)
    analysis_data = None
    analysis_doc = await get_analysis_from_db(lecture_id)
    if analysis_doc:
        analysis_data = analysis_doc.get("analysis_data")
    
    try:
        # Generate survey using Gemini
        survey_data = generate_student_survey(
            lecture_id=lecture_id,
            lecture_title=lecture_title,
            analysis_data=analysis_data,
            professor_input=professor_input
        )
        
        # Check for errors
        if "error" in survey_data:
            raise HTTPException(status_code=500, detail=f"Survey generation failed: {survey_data['error']}")
        
        # Save the survey to MongoDB (via gemini_analysis)
        from gemini_analysis import save_survey
        survey_id = survey_data.get("survey_id")
        await save_survey(survey_data)
        
        return {
            "status": "success",
            "lecture_id": lecture_id,
            "survey": survey_data
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating survey: {str(e)}")


@app.get("/api/lectures/{lecture_id}/surveys")
async def get_lecture_surveys(lecture_id: str):
    """Get all surveys for a lecture from MongoDB"""
    collection = get_surveys_collection()
    cursor = collection.find({"survey_data.lecture_id": lecture_id})
    surveys = await cursor.to_list(length=None)
    
    # Extract survey_data from each document
    survey_list = []
    for doc in surveys:
        survey_data = doc.get("survey_data", {})
        survey_list.append(survey_data)
    
    return survey_list


@app.get("/api/surveys/{survey_id}")
async def get_survey_by_id(survey_id: str):
    """Get a specific survey by its ID (for shareable links) from MongoDB"""
    survey_doc = await get_survey_from_db(survey_id)
    if not survey_doc:
        raise HTTPException(status_code=404, detail="Survey not found")
    return survey_doc.get("survey_data", {})


# Directory for survey responses
SURVEY_RESPONSES_DIR = Path(__file__).parent / "data" / "survey_responses"
SURVEY_RESPONSES_DIR.mkdir(parents=True, exist_ok=True)


class SurveyResponse(BaseModel):
    survey_id: str
    lecture_id: str
    student_name: str
    responses: dict
    submitted_at: str


@app.post("/api/surveys/{survey_id}/submit")
async def submit_survey_response(survey_id: str, response_data: SurveyResponse):
    """Submit a survey response from a student"""
    try:
        # Verify the survey exists (from MongoDB)
        survey_doc = await get_survey_from_db(survey_id)
        if not survey_doc:
            raise HTTPException(status_code=404, detail="Survey not found")
        
        survey = survey_doc.get("survey_data", {})
        
        # Create response data
        response_id = str(uuid.uuid4())
        response_record = {
            "_id": response_id,
            "response_id": response_id,
            "survey_id": survey_id,
            "lecture_id": response_data.lecture_id,
            "lecture_title": survey.get("lecture_title", "Unknown Lecture"),
            "student_name": response_data.student_name,
            "responses": response_data.responses,
            "submitted_at": response_data.submitted_at,
        }
        
        # Save response to MongoDB
        responses_collection = get_survey_responses_collection()
        await responses_collection.insert_one(response_record)
        
        return {
            "status": "success",
            "response_id": response_id,
            "message": "Survey response submitted successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error submitting survey response: {str(e)}")


@app.get("/api/lectures/{lecture_id}/survey-responses")
async def get_lecture_survey_responses(lecture_id: str):
    """Get all survey responses for a lecture from MongoDB"""
    try:
        responses_collection = get_survey_responses_collection()
        cursor = responses_collection.find({"lecture_id": lecture_id})
        responses = await cursor.to_list(length=None)
        
        # Remove MongoDB _id and use response_id
        for response in responses:
            if "_id" in response:
                del response["_id"]
        
        # Sort by submission time (newest first)
        responses.sort(key=lambda x: x.get("submitted_at", ""), reverse=True)
        
        return responses
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading survey responses: {str(e)}")


def _infer_topic_status(notes: str) -> str:
    """
    Infer topic understanding status from coverage notes.
    Priority: struggling > developing > strong (negative terms take precedence)
    Returns: 'struggling', 'developing', or 'strong'
    """
    if not notes:
        return "developing"
    
    notes_lower = notes.lower()
    
    # Check for struggling indicators FIRST (highest priority)
    struggling_keywords = ["rushed", "skipped", "missed", "confused", "unclear", 
                          "not covered", "deferred", "incomplete", "poorly", "briefly",
                          "insufficient", "lack", "missing", "failed", "problematic"]
    for keyword in struggling_keywords:
        if keyword in notes_lower:
            return "struggling"
    
    # Check for developing/partial indicators SECOND (medium priority)
    # These override "strong" keywords if present - but be specific to avoid false positives
    developing_keywords = ["partially covered", "partial coverage", "some aspects", 
                          "basic coverage", "introductory level", "limited coverage",
                          "could be improved", "needs more", "room for improvement", 
                          "surface level", "overview only", "not fully"]
    for keyword in developing_keywords:
        if keyword in notes_lower:
            return "developing"
    
    # Check for strong indicators LAST (only if no negative terms found)
    strong_keywords = ["well covered", "thoroughly", "excellent", "clear explanation",
                      "detailed", "comprehensive", "in-depth", "strong", "mastered",
                      "extensively", "fully covered", "complete coverage", "covered well",
                      "effectively covered", "explains", "demonstrates", "explores",
                      "addresses", "discusses", "presents", "introduces the"]
    for keyword in strong_keywords:
        if keyword in notes_lower:
            return "strong"
    
    return "developing"


@app.get("/api/classes/{class_id}/overview")
async def get_class_overview(class_id: str):
    """
    Aggregate topic data across all lectures for a class.
    Returns data for Student Understanding and Course Coverage sections.
    """
    # Verify the class exists
    class_doc = await get_class_by_id(class_id)
    if not class_doc:
        raise HTTPException(status_code=404, detail="Class not found")
    
    # Get all lectures for this class
    class_lectures = await get_lectures_by_class_id(class_id)
    
    # Aggregate data from analyses
    all_topics = {}  # topic_name -> {covered: bool, notes: str, status: str, lecture_id: str}
    all_action_items = []  # List of action items from analyses
    
    for lecture in class_lectures:
        lecture_id = lecture.get("id")
        lecture_title = lecture.get("title", "Lecture")
        
        # Load video analysis if available (from MongoDB)
        analysis_doc = await get_analysis_from_db(lecture_id)
        if analysis_doc:
            try:
                analysis_data = analysis_doc.get("analysis_data", {})
                
                # Extract topic coverage
                if "topic_coverage" in analysis_data:
                    for topic_item in analysis_data["topic_coverage"]:
                        topic_name = topic_item.get("topic", "")
                        if not topic_name:
                            continue
                        
                        covered = topic_item.get("covered", False)
                        notes = topic_item.get("notes", "")
                        status = _infer_topic_status(notes)
                        
                        # Update or add topic (later lectures override earlier ones)
                        all_topics[topic_name] = {
                            "covered": covered,
                            "notes": notes,
                            "status": status,
                            "lecture_id": lecture_id,
                            "lecture_title": lecture_title
                        }
                
                # Extract action items from ai_reflections
                if "ai_reflections" in analysis_data:
                    reflections = analysis_data["ai_reflections"]
                    if "action_items" in reflections:
                        for item in reflections["action_items"]:
                            priority = item.get("priority", "Should Do")
                            # Normalize priority
                            if "must" in priority.lower():
                                priority_level = "critical"
                            elif "continue" in priority.lower():
                                priority_level = "success"
                            else:
                                priority_level = "warning"
                            
                            all_action_items.append({
                                "priority": priority_level,
                                "title": item.get("item", "")[:100],  # Truncate long items
                                "description": item.get("item", ""),
                                "lecture_id": lecture_id,
                                "lecture_title": lecture_title
                            })
                    
                    # Also extract insights as potential action items
                    if "insights" in reflections:
                        for insight in reflections["insights"][:3]:  # Limit to top 3
                            insight_type = insight.get("type", "opportunity")
                            if insight_type == "opportunity" or insight.get("icon") == "yellow":
                                priority_level = "warning"
                            elif insight_type == "success" or insight.get("icon") == "green":
                                priority_level = "success"
                            else:
                                priority_level = "critical"
                            
                            all_action_items.append({
                                "priority": priority_level,
                                "title": insight.get("title", ""),
                                "description": insight.get("description", ""),
                                "lecture_id": lecture_id,
                                "lecture_title": lecture_title
                            })
                            
            except (json.JSONDecodeError, IOError):
                pass
        
        # Also load materials analysis for additional topics (from MongoDB)
        materials_analysis_doc = await get_materials_analysis_doc(lecture_id)
        if materials_analysis_doc:
            try:
                materials_data = materials_analysis_doc.get("analysis_data", {})
                
                if "topics" in materials_data:
                    for topic_item in materials_data["topics"]:
                        topic_name = topic_item.get("name", "")
                        if not topic_name:
                            continue
                        
                        # Only add if not already in all_topics (video analysis takes precedence)
                        if topic_name not in all_topics:
                            all_topics[topic_name] = {
                                "covered": False,  # From materials = planned, not yet covered
                                "notes": topic_item.get("description", ""),
                                "status": "developing",
                                "lecture_id": lecture_id,
                                "lecture_title": lecture_title
                            }
            except (json.JSONDecodeError, IOError):
                pass
    
    # Format for response
    student_understanding = []
    course_coverage = []
    
    for topic_name, topic_data in all_topics.items():
        student_understanding.append({
            "topic": topic_name,
            "status": topic_data["status"],
            "notes": topic_data["notes"],
            "lecture_id": topic_data["lecture_id"]
        })
        
        course_coverage.append({
            "topic": topic_name,
            "covered": topic_data["covered"],
            "lecture_id": topic_data["lecture_id"]
        })
    
    # Sort: struggling first, then developing, then strong
    status_order = {"struggling": 0, "developing": 1, "strong": 2}
    student_understanding.sort(key=lambda x: status_order.get(x["status"], 1))
    
    # Sort action items: critical first
    priority_order = {"critical": 0, "warning": 1, "success": 2}
    all_action_items.sort(key=lambda x: priority_order.get(x["priority"], 1))
    
    return {
        "student_understanding": student_understanding,
        "course_coverage": course_coverage,
        "action_items": all_action_items[:6],  # Limit to top 6
        "total_lectures_analyzed": len([l for l in class_lectures if l.get("hasAnalysis")])
    }


@app.post("/api/classes/{class_id}/feedback")
async def save_professor_feedback(class_id: str, request: Request):
    """
    Save professor feedback on AI reflections for a course.
    Feedback is stored per course and used to guide future video analysis.
    """
    try:
        body = await request.json()
        insight_id = body.get("insight_id")
        rating = body.get("rating")  # "up" or "down"
        feedback_text = body.get("feedback_text", "")
        lecture_id = body.get("lecture_id")
        
        if not insight_id or not rating:
            raise HTTPException(status_code=400, detail="insight_id and rating are required")
        
        # Load existing feedback or create new (from MongoDB)
        feedback_collection = get_feedback_collection()
        feedback_doc = await feedback_collection.find_one({"class_id": class_id})
        
        if not feedback_doc:
            feedback_doc = {"class_id": class_id, "feedback": []}
        
        # Add new feedback entry
        feedback_entry = {
            "insight_id": insight_id,
            "rating": rating,
            "feedback_text": feedback_text,
            "lecture_id": lecture_id,
            "created_at": datetime.now().isoformat()
        }
        
        feedback_doc["feedback"].append(feedback_entry)
        
        # Save feedback to MongoDB
        await feedback_collection.update_one(
            {"class_id": class_id},
            {"$set": feedback_doc},
            upsert=True
        )
        
        return {"status": "success", "message": "Feedback saved"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving feedback: {str(e)}")


@app.get("/api/classes/{class_id}/feedback")
async def get_professor_feedback(class_id: str):
    """
    Get all professor feedback for a course.
    """
    try:
        feedback_collection = get_feedback_collection()
        feedback_doc = await feedback_collection.find_one({"class_id": class_id})
        
        if not feedback_doc:
            return {"feedback": []}
        
        return {"feedback": feedback_doc.get("feedback", [])}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading feedback: {str(e)}")


# Assignment helper functions
async def get_assignments_by_class_id(class_id: str) -> List[dict]:
    """Get all assignments for a specific class"""
    collection = get_assignments_collection()
    cursor = collection.find({"classId": class_id})
    assignments = await cursor.to_list(length=None)
    for assignment in assignments:
        if "_id" in assignment:
            assignment["id"] = str(assignment.pop("_id"))
    return assignments

async def create_assignment_doc(assignment_data: dict) -> dict:
    """Create a new assignment in MongoDB"""
    collection = get_assignments_collection()
    assignment_id = str(uuid.uuid4())
    assignment_data["_id"] = assignment_id
    await collection.insert_one(assignment_data)
    assignment_data["id"] = assignment_data.pop("_id")
    return assignment_data

async def delete_assignment_doc(assignment_id: str) -> bool:
    """Delete an assignment from MongoDB"""
    collection = get_assignments_collection()
    result = await collection.delete_one({"_id": assignment_id})
    return result.deleted_count > 0

# Assignment Endpoints
@app.get("/api/assignments", response_model=List[AssignmentResponse])
async def get_assignments(class_id: str):
    """Get all assignments for a class"""
    assignments = await get_assignments_by_class_id(class_id)
    # Sort by due date (closest first)
    try:
        assignments.sort(key=lambda x: x.get("dueDate", ""))
    except:
        pass # Handle potential sorting errors gracefully
    return assignments

@app.post("/api/assignments", response_model=AssignmentResponse, status_code=201)
async def create_assignment(
    title: str = Form(...),
    dueDate: str = Form(...),
    description: Optional[str] = Form(""),
    type: str = Form(...),
    classId: str = Form(...),
    file: Optional[UploadFile] = File(None)
):
    """Create a new assignment with optional file upload"""
    
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

    new_assignment = {
        "title": title,
        "dueDate": dueDate,
        "description": description,
        "type": type,
        "classId": classId,
        "createdAt": datetime.now().isoformat(),
        "status": "Active",
        "hasFile": file is not None and file.filename is not None,
        "fileName": file_name,
        "filePath": file_path
    }
    created_assignment = await create_assignment_doc(new_assignment)
    return created_assignment

@app.get("/api/assignments/{assignment_id}/file")
async def download_assignment_file(assignment_id: str):
    """Download the assignment file"""
    # Get assignment directly to check file path
    # We can't reuse get_assignments_by_class_id effectively here without filtering
    # So we'll fetch from collection directly for now or implement a get_assignment_by_id
    collection = get_assignments_collection()
    assignment = await collection.find_one({"_id": assignment_id})
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    file_path = assignment.get("filePath")
    if file_path and Path(file_path).exists():
        return FileResponse(
            file_path,
            filename=assignment.get("fileName", "assignment.pdf"),
            media_type="application/octet-stream"
        )
    raise HTTPException(status_code=404, detail="File not found")

@app.delete("/api/assignments/{assignment_id}", status_code=204)
async def delete_assignment(assignment_id: str):
    """Delete an assignment and its file"""
    # Get assignment to find file path
    collection = get_assignments_collection()
    assignment = await collection.find_one({"_id": assignment_id})
    
    if assignment:
        file_path = assignment.get("filePath")
        if file_path and Path(file_path).exists():
            try:
                os.remove(file_path)
            except:
                pass

    deleted = await delete_assignment_doc(assignment_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)

