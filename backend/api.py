"""
FastAPI backend server for Praxis application
Handles class management API endpoints
"""

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
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
ANALYSIS_DIR = Path(__file__).parent / "data" / "analyses"
ANALYSIS_DIR.mkdir(parents=True, exist_ok=True)  # Create analyses directory if it doesn't exist


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
        try:
            with open(LECTURES_FILE, 'r') as f:
                content = f.read().strip()
                if not content:
                    return []
                return json.loads(content)
        except (json.JSONDecodeError, ValueError):
            # If file is corrupted or empty, return empty list
            return []
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
@app.get("/api/lectures", response_model=List[LectureResponse], response_model_exclude_unset=False, response_model_exclude_none=False)
def get_lectures(class_id: Optional[str] = None):
    """Get all lectures, optionally filtered by class_id"""
    lectures = load_lectures()
    if class_id:
        lectures = [l for l in lectures if l.get("classId") == class_id]
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
def get_lecture(lecture_id: str):
    """Get a specific lecture by ID"""
    lectures = load_lectures()
    for lecture in lectures:
        if lecture["id"] == lecture_id:
            # Ensure hasAnalysis and analysisPath fields are present
            if "hasAnalysis" not in lecture:
                lecture["hasAnalysis"] = False
            if "analysisPath" not in lecture:
                lecture["analysisPath"] = None
            return lecture
    raise HTTPException(status_code=404, detail="Lecture not found")


@app.post("/api/lectures", response_model=LectureResponse, status_code=201)
async def create_lecture(
    title: str = Form(...),
    topics: str = Form("[]"),  # JSON string of topics array
    classId: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    video: Optional[UploadFile] = File(None)
):
    """Create a new lecture with optional file upload"""
    lectures = load_lectures()
    
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
        "id": str(uuid.uuid4()),
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
    
    lectures.append(new_lecture)
    save_lectures(lectures)
    
    return new_lecture


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
    lectures = load_lectures()
    
    for i, lecture in enumerate(lectures):
        if lecture["id"] == lecture_id:
            # Parse topics from JSON string
            try:
                topics_list = json.loads(topics) if topics else []
            except:
                topics_list = []
            
            # Handle slides file upload (if new file provided)
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
            
            # Handle video file upload (if new file provided)
            video_path = lecture.get("videoPath")
            video_name = lecture.get("videoName")
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
            if "hasAnalysis" in lecture:
                update_data["hasAnalysis"] = lecture.get("hasAnalysis", False)
            if "analysisPath" in lecture:
                update_data["analysisPath"] = lecture.get("analysisPath")
            lectures[i].update(update_data)
            
            save_lectures(lectures)
            return lectures[i]
    
    raise HTTPException(status_code=404, detail="Lecture not found")


@app.delete("/api/lectures/{lecture_id}", status_code=204)
def delete_lecture(lecture_id: str):
    """Delete a lecture and its associated files"""
    lectures = load_lectures()
    for i, lecture in enumerate(lectures):
        if lecture["id"] == lecture_id:
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


@app.get("/api/lectures/{lecture_id}/video")
def get_lecture_video(lecture_id: str):
    """Get the lecture video file"""
    lectures = load_lectures()
    for lecture in lectures:
        if lecture["id"] == lecture_id:
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
    raise HTTPException(status_code=404, detail="Lecture not found")


@app.post("/api/lectures/{lecture_id}/analyze")
async def analyze_lecture(lecture_id: str, video: Optional[UploadFile] = File(None)):
    """
    Analyze a lecture video using Gemini 2.5 Pro API.
    Saves the analysis result to a JSON file in the analyses directory.
    If video is not provided, uses the existing video from the lecture.
    """
    lectures = load_lectures()
    lecture = None
    
    # Find the lecture
    for l in lectures:
        if l["id"] == lecture_id:
            lecture = l
            break
    
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
        for i, l in enumerate(lectures):
            if l["id"] == lecture_id:
                lectures[i]["videoPath"] = video_path
                lectures[i]["videoName"] = video_name
                lectures[i]["hasVideo"] = True
                save_lectures(lectures)
                break
    elif not video_path or not Path(video_path).exists():
        raise HTTPException(status_code=400, detail="No video file available. Please upload a video first.")
    
    # Get lecture details
    lecture_title = lecture.get("title", "Lecture")
    topics = lecture.get("topics", [])
    
    # Load materials analysis if available
    materials_analysis = None
    materials_analysis_path = lecture.get("materialsAnalysisPath")
    if materials_analysis_path and Path(materials_analysis_path).exists():
        try:
            with open(materials_analysis_path, 'r') as f:
                materials_analysis = json.load(f)
        except:
            pass
    
    try:
        # Analyze the video using Gemini with materials context
        analysis_result = analyze_lecture_video(
            video_path=video_path,
            lecture_id=lecture_id,
            lecture_title=lecture_title,
            topics=topics,
            materials_analysis=materials_analysis
        )
        
        # Check for errors
        if "error" in analysis_result:
            raise HTTPException(status_code=500, detail=f"Analysis failed: {analysis_result['error']}")
        
        # Save the analysis result to JSON file
        analysis_file_path = save_analysis_result(analysis_result, ANALYSIS_DIR)
        
        # Update lecture with analysis file path
        for i, l in enumerate(lectures):
            if l["id"] == lecture_id:
                lectures[i]["analysisPath"] = analysis_file_path
                lectures[i]["hasAnalysis"] = True
                save_lectures(lectures)
                break
        
        return {
            "status": "success",
            "lecture_id": lecture_id,
            "analysis": analysis_result,
            "analysis_file": analysis_file_path
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analyzing video: {str(e)}")


@app.post("/api/lectures/{lecture_id}/analyze-materials")
async def analyze_materials(lecture_id: str, materials: Optional[UploadFile] = File(None)):
    """
    Analyze lecture materials (PDF, PowerPoint, etc.) using Gemini to extract intended topics.
    Saves the analysis result and updates the lecture with extracted topics.
    """
    lectures = load_lectures()
    lecture = None
    
    # Find the lecture
    for l in lectures:
        if l["id"] == lecture_id:
            lecture = l
            break
    
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
        for i, l in enumerate(lectures):
            if l["id"] == lecture_id:
                lectures[i]["filePath"] = materials_path
                lectures[i]["fileName"] = file_name
                lectures[i]["hasSlides"] = True
                save_lectures(lectures)
                break
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
        
        # Save the materials analysis result to JSON file
        materials_analysis_file_path = save_materials_analysis_result(analysis_result, ANALYSIS_DIR)
        
        # Extract topic names for the lecture topics field
        extracted_topics = []
        if "topics" in analysis_result:
            for topic in analysis_result["topics"]:
                extracted_topics.append(topic["name"])
        
        # Update lecture with materials analysis file path and extracted topics
        for i, l in enumerate(lectures):
            if l["id"] == lecture_id:
                lectures[i]["materialsAnalysisPath"] = materials_analysis_file_path
                lectures[i]["hasMaterialsAnalysis"] = True
                # Merge with existing topics (avoid duplicates)
                existing_topics = set(lectures[i].get("topics", []))
                for topic in extracted_topics:
                    existing_topics.add(topic)
                lectures[i]["topics"] = list(existing_topics)
                save_lectures(lectures)
                break
        
        return {
            "status": "success",
            "lecture_id": lecture_id,
            "analysis": analysis_result,
            "materials_analysis_file": materials_analysis_file_path,
            "extracted_topics": extracted_topics
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analyzing materials: {str(e)}")


@app.get("/api/lectures/{lecture_id}/materials-analysis")
def get_materials_analysis(lecture_id: str):
    """Get the materials analysis result for a lecture"""
    lectures = load_lectures()
    lecture = None
    
    for l in lectures:
        if l["id"] == lecture_id:
            lecture = l
            break
    
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")
    
    materials_analysis_path = lecture.get("materialsAnalysisPath")
    if not materials_analysis_path or not Path(materials_analysis_path).exists():
        raise HTTPException(status_code=404, detail="Materials analysis not found")
    
    with open(materials_analysis_path, 'r') as f:
        analysis_data = json.load(f)
    
    return analysis_data


@app.get("/api/lectures/{lecture_id}/analysis")
def get_lecture_analysis(lecture_id: str):
    """Get the analysis result for a lecture"""
    lectures = load_lectures()
    lecture = None
    
    for l in lectures:
        if l["id"] == lecture_id:
            lecture = l
            break
    
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")
    
    analysis_path = lecture.get("analysisPath")
    if not analysis_path or not Path(analysis_path).exists():
        raise HTTPException(status_code=404, detail="Analysis not found")
    
    with open(analysis_path, 'r') as f:
        analysis_data = json.load(f)
    
    return analysis_data


@app.post("/api/lectures/{lecture_id}/generate-survey/")
async def generate_lecture_survey(lecture_id: str):
    """
    Generate a student comprehension survey for a lecture using Gemini AI.
    The survey is based on the lecture analysis and helps identify concepts that need reinforcement.
    """
    lectures = load_lectures()
    lecture = None
    
    # Find the lecture
    for l in lectures:
        if l["id"] == lecture_id:
            lecture = l
            break
    
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")
    
    lecture_title = lecture.get("title", "Lecture")
    
    # Load the lecture analysis if available
    analysis_data = None
    analysis_path = lecture.get("analysisPath")
    if analysis_path and Path(analysis_path).exists():
        try:
            with open(analysis_path, 'r') as f:
                analysis_data = json.load(f)
        except:
            pass
    
    try:
        # Generate survey using Gemini
        survey_data = generate_student_survey(
            lecture_id=lecture_id,
            lecture_title=lecture_title,
            analysis_data=analysis_data
        )
        
        # Check for errors
        if "error" in survey_data:
            raise HTTPException(status_code=500, detail=f"Survey generation failed: {survey_data['error']}")
        
        # Save the survey to JSON file
        survey_file_path = save_survey(survey_data, ANALYSIS_DIR)
        
        # Update lecture with survey file path
        for i, l in enumerate(lectures):
            if l["id"] == lecture_id:
                if "surveys" not in lectures[i]:
                    lectures[i]["surveys"] = []
                lectures[i]["surveys"].append({
                    "survey_id": survey_data.get("survey_id"),
                    "path": survey_file_path,
                    "created_at": survey_data.get("created_at")
                })
                save_lectures(lectures)
                break
        
        return {
            "status": "success",
            "lecture_id": lecture_id,
            "survey": survey_data,
            "survey_file": survey_file_path
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating survey: {str(e)}")


@app.get("/api/lectures/{lecture_id}/surveys")
def get_lecture_surveys(lecture_id: str):
    """Get all surveys for a lecture by scanning the analysis directory."""
    
    # We don't need to load the main lectures file, just scan the directory
    # for survey files matching the lecture_id. This is more robust.
    
    survey_list = []
    
    if not ANALYSIS_DIR.exists():
        # If the directory doesn't exist, no surveys can be found.
        return []
        
    for survey_file in ANALYSIS_DIR.glob(f"{lecture_id}_survey_*.json"):
        if survey_file.is_file():
            try:
                with open(survey_file, 'r') as f:
                    survey_data = json.load(f)
                    survey_list.append(survey_data)
            except (json.JSONDecodeError, IOError):
                # Ignore corrupted or unreadable files
                pass
    
    # If no surveys are found, return an empty list.
    # The frontend will correctly interpret this as "no surveys exist".
    if not survey_list:
        return []
        
    return survey_list


@app.get("/api/surveys/{survey_id}")
def get_survey_by_id(survey_id: str):
    """Get a specific survey by its ID (for shareable links)"""
    # Search through all lecture surveys
    lectures = load_lectures()
    
    for lecture in lectures:
        surveys = lecture.get("surveys", [])
        for survey_info in surveys:
            if survey_info.get("survey_id") == survey_id:
                survey_path = survey_info.get("path")
                if survey_path and Path(survey_path).exists():
                    with open(survey_path, 'r') as f:
                        return json.load(f)
    
    raise HTTPException(status_code=404, detail="Survey not found")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)

