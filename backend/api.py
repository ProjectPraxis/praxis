"""
FastAPI backend server for Praxis application
Handles class management API endpoints
"""

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel, ConfigDict
from typing import List, Optional
import json
import uuid
from datetime import datetime
from pathlib import Path
import shutil
import os
import asyncio
from dotenv import load_dotenv
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()
from gemini_analysis import (
    analyze_lecture_video,
    save_analysis_result,
    analyze_syllabus,
    generate_simulated_trends,
    analyze_lecture_materials,
    save_materials_analysis_result,
    generate_student_survey,
    save_survey,
    analyze_assignment_alignment
)
from database import (
    connect_to_mongo, close_mongo_connection, get_classes_collection, 
    get_lectures_collection, get_feedback_collection, get_surveys_collection, 
    get_survey_responses_collection, save_analysis_to_db, get_analysis_from_db,
    save_materials_analysis_to_db, get_materials_analysis_doc, save_survey_to_db,
    get_survey_from_db, get_assignments_collection, get_analyses_collection,
    get_materials_analyses_collection
)
from bson import ObjectId
from bson.errors import InvalidId

import boto3
from botocore.exceptions import ClientError

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

# AWS S3 Configuration
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME", "praxis-uploads")

s3_client = None
if AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY:
    try:
        s3_client = boto3.client(
            's3',
            aws_access_key_id=AWS_ACCESS_KEY_ID,
            aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
            region_name=AWS_REGION
        )
        print(f"S3 Client initialized successfully. Bucket: {S3_BUCKET_NAME}")
    except Exception as e:
        print(f"Failed to initialize S3 client: {e}")
else:
    print("Warning: AWS credentials not found in environment. Falling back to local storage.")
    # Debug print to help user
    print(f"AWS_ACCESS_KEY_ID present: {bool(AWS_ACCESS_KEY_ID)}")


# File paths (fallback or temporary storage)
UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)  # Create uploads directory if it doesn't exist
ANALYSIS_DIR = Path(__file__).parent / "data" / "analyses"
ANALYSIS_DIR.mkdir(parents=True, exist_ok=True)  # Create analyses directory if it doesn't exist

# --- S3 Helper Functions ---
async def upload_to_s3(file_obj, object_name: str, content_type: str = None) -> bool:
    """Upload a file-like object to S3."""
    if not s3_client:
        print("S3 client not initialized. Cannot upload.")
        return False
    try:
        extra_args = {}
        if content_type:
            extra_args['ContentType'] = content_type
            
        # If it's an async UploadFile, we need to read it or use its file attribute
        # Boto3 expects a sync file-like object. 
        # For UploadFile, .file is a SpooledTemporaryFile which is sync.
        s3_client.upload_fileobj(file_obj, S3_BUCKET_NAME, object_name, ExtraArgs=extra_args)
        return True
    except ClientError as e:
        print(f"S3 Upload Error: {e}")
        return False
    except Exception as e:
        print(f"Error uploading to S3: {e}")
        return False

def create_presigned_url(object_name: str, expiration=3600) -> Optional[str]:
    """Generate a presigned URL to share an S3 object."""
    if not s3_client:
        return None
    try:
        response = s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': S3_BUCKET_NAME, 'Key': object_name},
            ExpiresIn=expiration
        )
        return response
    except ClientError as e:
        print(f"S3 Presign Error: {e}")
        return None


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
    analysisStatus: Optional[str] = "none"  # none, processing, completed, failed


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
    latestAnalysis: Optional[dict] = None


class AnalyzeAssignmentRequest(BaseModel):
    lecture_ids: List[str]



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


@app.post("/api/validate-gemini-key")
async def validate_gemini_key(request: Request):
    """Validate a custom Gemini API key"""
    try:
        body = await request.json()
        api_key = body.get("api_key", "")
        
        if not api_key:
            return {"valid": False, "error": "No API key provided"}
        
        # Try to create a client and make a simple request
        from google import genai
        client = genai.Client(api_key=api_key)
        
        # Make a simple test request
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents="Say hello in 3 words"
        )
        
        return {"valid": True, "message": "API key is valid"}
    except Exception as e:
        error_msg = str(e)
        if "API_KEY_INVALID" in error_msg or "invalid" in error_msg.lower():
            return {"valid": False, "error": "Invalid API key"}
        elif "quota" in error_msg.lower():
            return {"valid": False, "error": "API key quota exceeded"}
        else:
            return {"valid": False, "error": f"Validation failed: {error_msg[:100]}"}


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


def delete_s3_object(object_key: str) -> bool:
    """Delete an object from S3"""
    if not s3_client or not object_key:
        return False
    try:
        s3_client.delete_object(Bucket=S3_BUCKET_NAME, Key=object_key)
        logger.info(f"Deleted S3 object: {object_key}")
        return True
    except Exception as e:
        logger.error(f"Error deleting S3 object {object_key}: {e}")
        return False


@app.delete("/api/classes/{class_id}/full", status_code=200)
async def delete_class_full(class_id: str):
    """
    Delete a class and ALL associated data:
    - Lectures (including videos from S3/local storage)
    - Analyses and materials analyses
    - Surveys and survey responses
    - Assignments  
    - Professor feedback
    """
    # Verify class exists
    class_item = await get_class_by_id(class_id)
    if not class_item:
        raise HTTPException(status_code=404, detail="Class not found")
    
    deleted_counts = {
        "lectures": 0,
        "videos_s3": 0,
        "videos_local": 0,
        "analyses": 0,
        "materials_analyses": 0,
        "surveys": 0,
        "survey_responses": 0,
        "assignments": 0,
        "feedback": 0
    }
    
    # 1. Get all lectures for this class
    lectures = await get_lectures_by_class_id(class_id)
    
    for lecture in lectures:
        lecture_id = lecture.get("id") or lecture.get("_id")
        
        # Delete video from S3 if it's an S3 path
        video_path = lecture.get("videoPath")
        if video_path:
            if not Path(video_path).is_absolute():
                # It's an S3 object key
                if delete_s3_object(video_path):
                    deleted_counts["videos_s3"] += 1
            elif Path(video_path).exists():
                # It's a local file
                try:
                    os.remove(video_path)
                    deleted_counts["videos_local"] += 1
                except Exception as e:
                    logger.error(f"Error deleting local video {video_path}: {e}")
        
        # Delete slides file if exists
        file_path = lecture.get("filePath")
        if file_path and Path(file_path).exists():
            try:
                os.remove(file_path)
            except Exception as e:
                logger.error(f"Error deleting slides {file_path}: {e}")
        
        # Delete analysis
        analyses_collection = get_analyses_collection()
        result = await analyses_collection.delete_one({"lecture_id": lecture_id})
        deleted_counts["analyses"] += result.deleted_count
        
        # Delete materials analysis
        materials_collection = get_materials_analyses_collection()
        result = await materials_collection.delete_one({"lecture_id": lecture_id})
        deleted_counts["materials_analyses"] += result.deleted_count
    
    # Delete all lectures
    lectures_collection = get_lectures_collection()
    result = await lectures_collection.delete_many({"classId": class_id})
    deleted_counts["lectures"] = result.deleted_count
    
    # 2. Delete surveys associated with class lectures
    surveys_collection = get_surveys_collection()
    result = await surveys_collection.delete_many({"class_id": class_id})
    deleted_counts["surveys"] = result.deleted_count
    
    # 3. Delete survey responses
    responses_collection = get_survey_responses_collection()
    result = await responses_collection.delete_many({"class_id": class_id})
    deleted_counts["survey_responses"] = result.deleted_count
    
    # 4. Delete assignments
    assignments_collection = get_assignments_collection()
    result = await assignments_collection.delete_many({"classId": class_id})
    deleted_counts["assignments"] = result.deleted_count
    
    # 5. Delete professor feedback
    feedback_collection = get_feedback_collection()
    result = await feedback_collection.delete_many({"class_id": class_id})
    deleted_counts["feedback"] = result.deleted_count
    
    # 6. Finally delete the class itself
    await delete_class(class_id)
    
    logger.info(f"Deleted class {class_id} and all associated data: {deleted_counts}")
    
    return {
        "message": f"Successfully deleted class '{class_item.get('name', class_id)}' and all associated data",
        "deleted": deleted_counts
    }


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
    logger.info(f"STARTING create_lecture. s3_client present: {bool(s3_client)}")
    
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
        
        # Save to local storage
        logger.info("Saving slides locally")
        file_path = str(UPLOAD_DIR / file_name)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    
    # Handle video file upload
    video_path = None
    video_name = None
    if video and video.filename:
        # Generate unique filename
        video_ext = Path(video.filename).suffix
        video_name = f"{uuid.uuid4()}{video_ext}"
        
        logger.info(f"Processing video upload. s3_client: {s3_client}")
        if s3_client:
            logger.info("Attempting S3 upload for video")
            video_path = f"lectures/videos/{video_name}"
            await upload_to_s3(video.file, video_path, video.content_type)
        else:
            logger.info("Falling back to local storage for video")
            # Fallback to local storage
            video_path = str(UPLOAD_DIR / video_name)
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
    if file_path:
        # Check if it's an S3 object key (relative path) vs local absolute path
        if not Path(file_path).is_absolute() and s3_client:
            url = create_presigned_url(file_path)
            if url:
                return RedirectResponse(url=url)
            # If valid S3 key but signing failed, fall through to error
        
        # Local file fallback
        if Path(file_path).exists():
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
    
    # Check if it's an S3 object key
    if not Path(video_path).is_absolute() and s3_client:
        url = create_presigned_url(video_path)
        if url:
            return RedirectResponse(url=url)
    
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


async def process_lecture_analysis_task(lecture_id: str, video_path: str, lecture_title: str, topics: list, class_id: str = None):
    """
    Background task to process lecture analysis.
    Handling fetching context, running analysis, and updating DB.
    """
    print(f"Starting background analysis for lecture {lecture_id}")
    
    try:
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
        
        # Analyze the video using Gemini (blocking call, run in thread)
        # We use asyncio.to_thread to prevent blocking the event loop
        analysis_result = await asyncio.to_thread(
            analyze_lecture_video,
            video_path=video_path,
            lecture_id=lecture_id,
            lecture_title=lecture_title,
            topics=topics,
            materials_analysis=materials_analysis,
            professor_feedback=professor_feedback
        )
        
        # Check for errors
        if "error" in analysis_result:
            print(f"Analysis failed for {lecture_id}: {analysis_result['error']}")
            # Update status to failed
            await update_lecture_doc(lecture_id, {
                "analysisStatus": "failed"
            })
            return
        
        # Save the analysis result to MongoDB (via gemini_analysis)
        from gemini_analysis import save_analysis_result
        await save_analysis_result(analysis_result)
        
        # Update lecture with analysis status
        await update_lecture_doc(lecture_id, {
            "hasAnalysis": True,
            "analysisPath": None,
            "analysisStatus": "completed"
        })
        
        print(f"Background analysis completed for lecture {lecture_id}")
        
    except Exception as e:
        print(f"Error in background analysis for {lecture_id}: {str(e)}")
        # Update status to failed
        await update_lecture_doc(lecture_id, {
            "analysisStatus": "failed"
        })


@app.post("/api/lectures/{lecture_id}/analyze")
async def analyze_lecture(lecture_id: str, background_tasks: BackgroundTasks, video: Optional[UploadFile] = File(None)):
    """
    Analyze a lecture video using Gemini 2.5 Pro API.
    Saves the analysis result to MongoDB.
    If video is not provided, uses the existing video from the lecture.
    Processing happens in the background.
    """
    lecture = await get_lecture_by_id(lecture_id)
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")
    
    # Use existing video path if available, otherwise use uploaded video
    video_path = lecture.get("videoPath")

    # If video file is provided, check if we need to save it
    # Currently, if video_path exists, we use it. If a new file is uploaded, we replace it.
    if video and video.filename:
        # Save the file
        video_ext = Path(video.filename).suffix
        video_name = f"{uuid.uuid4()}{video_ext}"
        
        logger.info(f"Processing analyze upload. s3_client: {s3_client}")
        if s3_client:
            logger.info("Uploading new video to S3 for analysis")
            video_path = f"lectures/videos/{video_name}"
            await upload_to_s3(video.file, video_path, video.content_type)
        else:
            logger.info("Saving new video locally for analysis")
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
    
    # Update status to processing immediately
    await update_lecture_doc(lecture_id, {
        "analysisStatus": "processing"
    })
    
    # Add to background tasks
    background_tasks.add_task(
        process_lecture_analysis_task,
        lecture_id=lecture_id,
        video_path=video_path,
        lecture_title=lecture_title,
        topics=topics,
        class_id=class_id
    )
    
    return {
        "status": "processing",
        "message": "Analysis started in background",
        "lecture_id": lecture_id
    }


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
        
        # Save to local storage
        logger.info("Saving new materials locally")
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
    total_sentiment = 0
    sentiment_count = 0
    all_key_takeaways = []
    
    # Topic Status: {topic_name: {status: 'strong'|'developing'|'struggling'|'not covered', count: int, notes: []}}
    topic_status_map = {}
    
    # --- Initialize with Syllabus Themes (Ground Truth) ---
    if class_doc.get("hasSyllabus"):
        syllabus_data = class_doc.get("syllabusData", {})
        key_themes = syllabus_data.get("key_themes", [])
        for theme in key_themes:
            topic_status_map[theme] = {
                "status": "not covered",
                "count": 0,
                "notes": [],
                "is_syllabus": True  # Mark as syllabus topic
            }
            
    all_action_items = []  # List of action items from analyses
    
    for lecture in class_lectures:
        lecture_id = lecture.get("id")
        lecture_title = lecture.get("title", "Lecture") # Keep lecture_title for action items
        
        # Get analysis if available
        if lecture.get("hasAnalysis"):
            analysis_doc = await get_analysis_from_db(lecture_id)
            if analysis_doc:
                try: # Wrap the analysis processing in a try-except
                    analysis_data = analysis_doc.get("analysis_data", {})
                    
                    # Sentiment
                    metrics = analysis_data.get("metrics", {})
                    if "sentiment_score" in metrics:
                        total_sentiment += metrics["sentiment_score"]
                        sentiment_count += 1
                    
                    # Takeaways
                    if "key_takeaways" in analysis_data:
                        all_key_takeaways.extend(analysis_data.get("key_takeaways", []))

                    # Topics Coverage
                    # We need to map lecture topics to our syllabus themes if possible fuzzy matching?)
                    # For now, we'll just check for exact or partial string matches
                    
                    topics = analysis_data.get("topic_coverage", [])
                    for topic in topics:
                        name = topic.get("topic")
                        covered = topic.get("covered", False)
                        notes = topic.get("notes", "") # Changed from coverage_notes to notes based on original
                        
                        if covered:
                            # Determine status for this specific lecture
                            status = _infer_topic_status(notes)
                            
                            # Check if this maps to a syllabus theme
                            matched_theme = None
                            if class_doc.get("hasSyllabus"):
                                for theme in topic_status_map:
                                    # Simple matching: check if theme is in name or name is in theme
                                    if theme.lower() in name.lower() or name.lower() in theme.lower():
                                        matched_theme = theme
                                        break
                            
                            target_name = matched_theme if matched_theme else name
                            
                            if target_name not in topic_status_map:
                                topic_status_map[target_name] = {
                                    "status": "not covered", 
                                    "count": 0,
                                    "notes": [],
                                    "is_syllabus": False,
                                    "lecture_id": lecture_id, # Track last seen lecture
                                    "lecture_title": lecture_title
                                }
                            
                            # Update status logic:
                            current_status = topic_status_map[target_name]["status"]
                            topic_status_map[target_name]["count"] += 1
                            
                            # Update priority (Struggling is stickiest)
                            if status == "struggling":
                                topic_status_map[target_name]["status"] = "struggling"
                            elif status == "developing" and current_status != "struggling":
                                topic_status_map[target_name]["status"] = "developing"
                            elif status == "strong" and current_status == "not covered":
                                 topic_status_map[target_name]["status"] = "strong"
                            
                            if notes:
                                 topic_status_map[target_name]["notes"].append(notes)
                                 
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
                            
                            # Only add if not already covered (video analysis takes precedence)
                            # Check against map keys
                            is_present = False
                            if topic_name in topic_status_map:
                                is_present = True
                            else:
                                # Check partial matches against syllabus themes
                                for theme in topic_status_map:
                                    if theme.lower() in topic_name.lower() or topic_name.lower() in theme.lower():
                                        is_present = True
                                        break
                            
                            if not is_present:
                                topic_status_map[topic_name] = {
                                    "status": "developing", # Infer developing for materials only
                                    "count": 1,
                                    "notes": ["From materials"],
                                    "is_syllabus": False,
                                    "lecture_id": lecture_id,
                                    "lecture_title": lecture_title
                                }

                except (json.JSONDecodeError, IOError):
                    pass

    # Convert topic_status_map to flat list for frontend
    unified_topics = []
    
    # First add Syllabus themes to ensure order
    processed_topics = set()
    
    # Get syllabus themes order
    syllabus_order = []
    if class_doc.get("hasSyllabus"):
        syllabus_order = class_doc.get("syllabusData", {}).get("key_themes", [])
        
    for theme in syllabus_order:
        if theme in topic_status_map:
            data = topic_status_map[theme]
            
            # Format status text
            status_text = data["status"]
            if data["count"] > 0:
                coverage_pct = min(100, data["count"] * 20) # Rough estimate
            else:
                 coverage_pct = 0
            
            unified_topics.append({
                "topic": theme,
                "status": status_text,
                "coverage_pct": coverage_pct,
                "notes": data["notes"][-1] if data["notes"] else "Planned in syllabus",
                "lecture_id": data.get("lecture_id", ""),
                "lecture_title": data.get("lecture_title", "")
            })
            processed_topics.add(theme)

    # Add remaining topics
    for topic_name, data in topic_status_map.items():
        if topic_name not in processed_topics:
            status_text = data["status"]
            # Skip "not covered" for non-syllabus topics (shouldn't happen per logic above but good safety)
            if status_text == "not covered" and not data["is_syllabus"]:
                continue
                
            unified_topics.append({
                "topic": topic_name,
                "status": status_text,
                "coverage_pct": 50 if status_text == "developing" else (80 if status_text == "strong" else 30),
                "notes": data["notes"][-1] if data["notes"] else "",
                "lecture_id": data.get("lecture_id", ""),
                "lecture_title": data.get("lecture_title", "")
            })

    # Sort non-syllabus topics by status urgency
    # We already have syllabus topics at the top. Let's append the others sorted.
    # Actually unified_topics already has syllabus on top.
    
    # Sort action items by priority
    priority_order = {"critical": 0, "warning": 1, "success": 2}
    
    student_understanding = []
    course_coverage = []

    for topic_data in unified_topics:
        student_understanding.append({
            "topic": topic_data["topic"],
            "status": topic_data["status"],
            "notes": topic_data["notes"],
            "reason": "", # This field is not directly available from new structure
            "lecture_id": topic_data["lecture_id"]
        })
        
        course_coverage.append({
            "topic": topic_data["topic"],
            "covered": topic_data["status"] != "not covered", # Infer covered from status
            "lecture_id": topic_data["lecture_id"]
        })

    # Sort: struggling first, then developing, then strong
    status_order = {"struggling": 0, "developing": 1, "strong": 2, "not covered": 3}
    student_understanding.sort(key=lambda x: status_order.get(x["status"], 1))
    
    # Sort action items: critical first
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
        
        # Ensure feedback list exists
        if "feedback" not in feedback_doc:
            feedback_doc["feedback"] = []
        
        # Add new feedback entry
        feedback_entry = {
            "insight_id": insight_id,
            "rating": rating,
            "feedback_text": feedback_text,
            "lecture_id": lecture_id,
            "created_at": datetime.now().isoformat()
        }
        
        feedback_doc["feedback"].append(feedback_entry)
        
        # Remove _id if present to avoid immutable field error during update
        if "_id" in feedback_doc:
            del feedback_doc["_id"]
        
        # Save feedback to MongoDB
        await feedback_collection.update_one(
            {"class_id": class_id},
            {"$set": feedback_doc},
            upsert=True
        )
        
        return {"status": "success", "message": "Feedback saved"}
        
    except Exception as e:
        print(f"Error saving feedback: {str(e)}")  # Add logging
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
    """Create a new assignment with optional file upload to S3"""
    
    # Handle file upload
    file_path = None
    file_name = None
    if file and file.filename:
        # Generate unique filename
        file_ext = Path(file.filename).suffix
        file_name = f"assignments/{classId}/{uuid.uuid4()}{file_ext}"
        
        # Try to upload to S3 first
        if s3_client and S3_BUCKET_NAME:
            try:
                file_content = await file.read()
                s3_client.put_object(
                    Bucket=S3_BUCKET_NAME,
                    Key=file_name,
                    Body=file_content,
                    ContentType=file.content_type or "application/octet-stream"
                )
                file_path = file_name  # Store S3 key
                print(f"Assignment file uploaded to S3: {file_name}")
            except Exception as e:
                print(f"S3 upload failed, falling back to local: {e}")
                # Fall back to local storage
                await file.seek(0)
                local_file_name = f"{uuid.uuid4()}{file_ext}"
                file_path = str(UPLOAD_DIR / local_file_name)
                with open(file_path, "wb") as buffer:
                    shutil.copyfileobj(file.file, buffer)
        else:
            # Save to local storage if S3 not configured
            local_file_name = f"{uuid.uuid4()}{file_ext}"
            file_path = str(UPLOAD_DIR / local_file_name)
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
        "fileName": file.filename if file else None,  # Store original filename
        "filePath": file_path
    }
    created_assignment = await create_assignment_doc(new_assignment)
    return created_assignment

async def update_assignment_doc(assignment_id: str, update_data: dict) -> dict:
    """Update an assignment in MongoDB"""
    collection = get_assignments_collection()
    await collection.update_one({"_id": assignment_id}, {"$set": update_data})
    return await collection.find_one({"_id": assignment_id})

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
    if file_path:
        # Check if it's an S3 object key
        if not Path(file_path).is_absolute() and s3_client:
            url = create_presigned_url(file_path)
            if url:
                return RedirectResponse(url=url)
                
        # Local file fallback
        if Path(file_path).exists():
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



@app.post("/api/classes/{class_id}/syllabus")
async def upload_syllabus(class_id: str, file: UploadFile = File(...)):
    """
    Upload and analyze a syllabus for the class.
    Extracts key themes and schedule to drive analytics.
    """
    class_doc = await get_class_by_id(class_id)
    if not class_doc:
        raise HTTPException(status_code=404, detail="Class not found")
        
    # unique filename
    file_ext = Path(file.filename).suffix
    file_name = f"syllabus_{class_id}_{uuid.uuid4()}{file_ext}"
    file_path = str(UPLOAD_DIR / file_name)
    
    # Save file
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Analyze using Gemini
        syllabus_data = analyze_syllabus(file_path, course_code=class_doc.get("code", ""))
        
        if "error" in syllabus_data:
             raise HTTPException(status_code=500, detail=f"Analysis failed: {syllabus_data['error']}")
             
        # Update class with syllabus data
        update_data = {
            "hasSyllabus": True,
            "syllabusPath": file_path,
            "syllabusName": file.filename,
            "syllabusData": syllabus_data
        }
        
        await update_class(class_id, update_data)
        
        return {
            "status": "success",
            "message": "Syllabus analyzed successfully",
            "data": syllabus_data
        }
        
    except Exception as e:
        print(f"Error processing syllabus: {e}")
        raise HTTPException(status_code=500, detail=str(e))



@app.get("/api/classes/{class_id}/trends")
async def get_class_trends(class_id: str):
    """
    Get aggregated trends data for a class.
    Aggregates data from all lectures to power the Student Trends dashboard.
    """
    # Check for AI-generated trends data (Meta Analysis)
    class_doc = await get_class_by_id(class_id)
    if class_doc and class_doc.get("trendsData"):
        saved_trends = class_doc.get("trendsData")
        
        # Transform saved trends to response format
        ai_response_data = {
            "topic_drift": [],
            "sentiment_history": [],
            "engagement_history": [],
            "understanding_gap": saved_trends.get("understanding_gaps", [])
        }
        
        for l in saved_trends.get("lectures", []):
            # Topic Drift
            topics_map = {}
            for t in l.get("topics", []):
                topics_map[t["name"]] = t["depth"]
            
            ai_response_data["topic_drift"].append({
                "lecture": l.get("title"),
                "topics": topics_map
            })
            
            # Sentiment
            metrics = l.get("metrics", {})
            ai_response_data["sentiment_history"].append({
                "lecture": l.get("title"),
                "sentiment": metrics.get("sentiment_score", 0),
                "performance": metrics.get("performance_rating", 0)
            })
            
            # Engagement
            ai_response_data["engagement_history"].append({
                "lecture": l.get("title"),
                "score": metrics.get("engagement_score", 0),
                "interaction_count": metrics.get("interaction_count", 0) # Fallback to 0
            })
            
        print(f"Serving AI-generated trends for class {class_id}")
        return ai_response_data

    # 1. Get all lectures for the class
    lectures = await get_lectures_by_class_id(class_id)
    
    # Sort by creation date
    lectures.sort(key=lambda x: x.get("createdAt", ""))
    
    # Initialize data structures
    response_data = {
        "topic_drift": [],
        "sentiment_history": [],
        "engagement_history": [],
        "understanding_gap": []
    }
    
    all_topics = set()
    topic_depths = {}  # {topic: {intended: X, actual: Y}}
    
    for i, lecture in enumerate(lectures):
        lecture_id = lecture.get("id")
        lecture_title = lecture.get("title", f"Lecture {i+1}")
        
        # Get Analysis Data
        analysis = None
        if lecture.get("hasAnalysis"):
            analysis_doc = await get_analysis_from_db(lecture_id)
            if analysis_doc:
                analysis = analysis_doc.get("analysis_data")
        
        # Get Materials Analysis Data
        materials_analysis = None
        materials_doc = await get_materials_analysis_doc(lecture_id)
        if materials_doc:
            materials_analysis = materials_doc.get("analysis_data")
            
        # --- 1. Topic Drift (Streamgraph) ---
        # We need a list of topics and their "weight" (depth/coverage) per lecture
        lecture_topics = {}
        
        # From Materials
        if materials_analysis and "topics" in materials_analysis:
            for topic in materials_analysis["topics"]:
                name = topic.get("name")
                depth = topic.get("intended_depth", 3) # Default to 3 if missing
                lecture_topics[name] = depth
                all_topics.add(name)
                
                # Store for Gap Analysis
                if name not in topic_depths:
                    topic_depths[name] = {"intended": 0, "actual": 0, "count": 0}
                topic_depths[name]["intended"] += depth
                topic_depths[name]["count"] += 1

        # From Video Analysis (Override with actuals if available)
        if analysis and "topic_coverage" in analysis:
            for topic in analysis["topic_coverage"]:
                name = topic.get("topic")
                if topic.get("covered"):
                    depth = topic.get("actual_depth", 3)
                    lecture_topics[name] = depth # Use actual depth
                    all_topics.add(name)
                    
                    # Store for Gap Analysis
                    if name not in topic_depths:
                        topic_depths[name] = {"intended": 0, "actual": 0, "count": 0}
                    topic_depths[name]["actual"] += depth
                    # If we didn't have intended, assume it matches actual (no gap)
                    if topic_depths[name]["intended"] == 0:
                         topic_depths[name]["intended"] = depth
                         topic_depths[name]["count"] += 1

        response_data["topic_drift"].append({
            "lecture": lecture_title,
            "topics": lecture_topics
        })
        
        # --- 2. Sentiment & Performance ---
        metrics = analysis.get("metrics", {}) if analysis else {}
        response_data["sentiment_history"].append({
            "lecture": lecture_title,
            "sentiment": metrics.get("sentiment_score", 0), # Default 0 if no analysis
            "performance": metrics.get("performance_rating", 0)
        })
        
        # --- 3. Engagement Pulse ---
        # Count interaction events
        interaction_count = 0
        if analysis and "timeline" in analysis and "interaction" in analysis["timeline"]:
             interaction_count = len(analysis["timeline"]["interaction"])
             
        response_data["engagement_history"].append({
            "lecture": lecture_title,
            "score": metrics.get("engagement_score", 0),
            "interaction_count": interaction_count
        })
    
    # --- Limit topic_drift based on Syllabus or Top Themes ---
    
    # Check for syllabus themes
    class_doc = await get_class_by_id(class_id)
    syllabus_themes = []
    if class_doc and class_doc.get("hasSyllabus"):
        syllabus_data = class_doc.get("syllabusData", {})
        syllabus_themes = syllabus_data.get("key_themes", [])
    
    if syllabus_themes:
        # User Syllabus themes as the filter
        target_topics = set(syllabus_themes)
        
        # We also want to include any high-signal topics that might not be in syllabus but are prominent
        # But primarily focus on syllabus structure.
        # For this implementation, we will strictly filter for syllabus themes + top 3 other topics to allow for "drift"
        
        # Calculate total depth solely for finding additional prominent topics
        topic_total_depths = {}
        for lecture_entry in response_data["topic_drift"]:
            for topic_name, depth in lecture_entry["topics"].items():
                topic_total_depths[topic_name] = topic_total_depths.get(topic_name, 0) + depth
        
        sorted_topics = sorted(topic_total_depths.keys(), key=lambda t: topic_total_depths[t], reverse=True)
        
        # Add syllabus themes to target set (ensure they appear even if 0 depth currently)
        # Note: We can't force them into the streamgraph if they have 0 depth in all lectures, 
        # but we can ensure they aren't filtered out if they appear.
        
        # Add top 3 non-syllabus topics - REMOVED per user request to prioritize syllabus themes
        # extras_added = 0
        # for t in sorted_topics:
        #     if t not in target_topics and extras_added < 3:
        #         target_topics.add(t)
        #         extras_added += 1
                
        # Filter
        for lecture_entry in response_data["topic_drift"]:
             lecture_entry["topics"] = {k: v for k, v in lecture_entry["topics"].items() if k in target_topics or any(theme in k for theme in syllabus_themes)}

    else:
        # Fallback to Top 7 auto-detected
        topic_total_depths = {}
        for lecture_entry in response_data["topic_drift"]:
            for topic_name, depth in lecture_entry["topics"].items():
                topic_total_depths[topic_name] = topic_total_depths.get(topic_name, 0) + depth
        
        # Get top 7 topics
        top_topics = sorted(topic_total_depths.keys(), key=lambda t: topic_total_depths[t], reverse=True)[:7]
        top_topics_set = set(top_topics)
        
        # Filter topic_drift to only include top topics
        for lecture_entry in response_data["topic_drift"]:
            lecture_entry["topics"] = {k: v for k, v in lecture_entry["topics"].items() if k in top_topics_set}

    # --- 4. Understanding Gap (Aggregated) ---
    # Convert dict to list
    for topic, data in topic_depths.items():
        if data["count"] > 0:
            avg_intended = data["intended"] / data["count"]
            avg_actual = data["actual"] / data["count"]
            
            # Only include if there's a meaningful gap or significant coverage
            if avg_intended > 0:
                response_data["understanding_gap"].append({
                    "topic": topic,
                    "intended": round(avg_intended, 1),
                    "actual": round(avg_actual, 1),
                    "gap": round(avg_intended - avg_actual, 1)
                })
    
    # Sort gaps by magnitude (descending) and take top 10
    response_data["understanding_gap"].sort(key=lambda x: abs(x["gap"]), reverse=True)
    response_data["understanding_gap"] = response_data["understanding_gap"][:10]
    
    return response_data

@app.post("/api/classes/{class_id}/generate-trends")
async def generate_trends(class_id: str):
    """
    Refresh trends data for the class.
    This endpoint simply verifies that lectures exist and returns the count of analyzed lectures.
    The actual trends data is served by GET /api/classes/{class_id}/trends using real analysis data.
    """
    lectures = await get_lectures_by_class_id(class_id)
    
    if not lectures:
        raise HTTPException(status_code=404, detail="No lectures found for this class")
    
    # helper to get analysis context
    lectures_data = []
    
    analyzed_count = 0
    for lecture in lectures:
        l_data = {
            "title": lecture.get("title", "Untitled Lecture"),
            "id": lecture.get("id"),
            "context": ""
        }
        
        # If analyzed, get the full analysis data
        if lecture.get("hasAnalysis"):
            analyzed_count += 1
            analysis_doc = await get_analysis_from_db(lecture.get("id"))
            if analysis_doc:
                analysis = analysis_doc.get("analysis_data", {})
                
                # Build rich context
                context_parts = []
                
                # Summary
                if analysis.get("summary"):
                    context_parts.append(f"Summary: {analysis['summary']}")
                
                # Topic Coverage
                topics = [t.get("topic") for t in analysis.get("topic_coverage", []) if t.get("covered")]
                if topics:
                    context_parts.append(f"Topics Covered: {', '.join(topics)}")
                
                # Metrics
                metrics = analysis.get("metrics", {})
                if metrics:
                    context_parts.append(f"Metrics: Sentiment={metrics.get('sentiment_score', 'N/A')}, Engagement={metrics.get('engagement_score', 'N/A')}, Performance={metrics.get('performance_rating', 'N/A')}")
                
                # AI Reflections
                reflections = analysis.get("ai_reflections", {})
                if reflections:
                    strengths = reflections.get("strengths", [])
                    improvements = reflections.get("improvements", [])
                    if strengths:
                        context_parts.append(f"Strengths: {'; '.join(strengths[:3])}")
                    if improvements:
                        context_parts.append(f"Areas for Improvement: {'; '.join(improvements[:3])}")
                
                # Transcript (truncated)
                transcript = analysis.get("transcript", [])
                if transcript:
                    # Get the first ~3000 chars of transcript text
                    transcript_text = " ".join([t.get("text", "") for t in transcript[:50]])
                    if len(transcript_text) > 3000:
                        transcript_text = transcript_text[:3000] + "...(truncated)"
                    context_parts.append(f"Transcript Excerpt: {transcript_text}")
                
                l_data["context"] = "\n".join(context_parts)
        
        lectures_data.append(l_data)
        
    # Generate Trends via Gemini
    try:
        trends_result = await generate_simulated_trends(class_id, lectures_data)
        
        if trends_result:
            # Save to Class Document
            await update_class(class_id, {
                "trendsData": trends_result,
                "lastTrendsUpdate": datetime.now().isoformat()
            })
            
            return {
                "status": "success", 
                "total_lectures": len(lectures),
                "analyzed_lectures": analyzed_count,
                "message": "Trends data successfully generated and updated using Gemini."
            }
        else:
             raise HTTPException(status_code=500, detail="Gemini returned empty trends data")
             
    except Exception as e:
        print(f"Error generating trends: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate trends: {str(e)}")


@app.post("/api/assignments/{assignment_id}/analyze")
async def analyze_assignment(assignment_id: str, request: AnalyzeAssignmentRequest):
    """
    Analyze an assignment against selected lectures to check for alignment.
    """
    collection = get_assignments_collection()
    assignment = await collection.find_one({"_id": assignment_id})
    if not assignment:
        # Try with ObjectId
        try:
            assignment = await collection.find_one({"_id": ObjectId(assignment_id)})
        except:
            pass
            
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    # Check if assignment has a file
    file_path = assignment.get("filePath")
    if not file_path:
        raise HTTPException(status_code=400, detail="Assignment must have a file attachment to be analyzed.")
    
    # Check if file exists - handle both S3 keys and local paths
    is_s3_path = file_path.startswith("assignments/") or (s3_client and S3_BUCKET_NAME and not file_path.startswith("/"))
    if not is_s3_path and not Path(file_path).exists():
        raise HTTPException(status_code=400, detail="Assignment file not found on server.")
        
    assignment_title = assignment.get("title", "Untitled Assignment")
    
    # Fetch lecture contexts
    lecture_contexts = []
    for lec_id in request.lecture_ids:
        lec = await get_lecture_by_id(lec_id)
        if lec:
            # Get analysis if exists
            summary = ""
            topics = lec.get("topics", [])
            
            # Try to get existing analysis for better context
            analysis_doc = await get_analysis_from_db(lec["id"])
            if analysis_doc:
                data = analysis_doc.get("analysis_data", {})
                if "topic_coverage" in data:
                     # Add covered topics
                     covered = [t["topic"] for t in data["topic_coverage"] if t.get("covered")]
                     if covered:
                         topics.extend(covered)
                # Use summary if available (we don't have a specific summary field usually, but let's check)
                if "summary" in data:
                    summary = data["summary"]
            
            lecture_contexts.append({
                "title": lec.get("title"),
                "topics": list(set(topics)), # dedup
                "summary": summary
            })
            
    if not lecture_contexts:
        raise HTTPException(status_code=400, detail="No valid lectures selected.")
        
    # Run analysis (blocking for now as it's user-triggered and expected to return result)
    # Using asyncio.to_thread to avoid blocking event loop
    try:
        result = await asyncio.to_thread(
            analyze_assignment_alignment,
            assignment_file_path=file_path,
            assignment_title=assignment_title,
            lecture_contexts=lecture_contexts
        )
        
        # Save the result to the assignment
        await update_assignment_doc(assignment_id, {"latestAnalysis": result})
        
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/assignments/{assignment_id}", response_model=AssignmentResponse)
async def get_assignment(assignment_id: str):
    """Get a single assignment by ID"""
    collection = get_assignments_collection()
    assignment = await collection.find_one({"_id": assignment_id})
    if not assignment:
        # Try with ObjectId
        try:
            assignment = await collection.find_one({"_id": ObjectId(assignment_id)})
        except:
            pass
            
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
        
    if "_id" in assignment:
        assignment["id"] = str(assignment.pop("_id"))
        
    return assignment



if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
