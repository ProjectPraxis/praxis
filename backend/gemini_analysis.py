"""
Gemini API integration for lecture video analysis.
Uses Google AI Studio Gemini 2.5 Pro to analyze lecture videos.
"""

from google import genai
from google.genai import types
import json
import base64
from pathlib import Path
from typing import Dict, Any, List
import os
import time
from dotenv import load_dotenv
import boto3
import tempfile
import shutil

# Load environment variables from .env file in the same directory as this script
ENV_PATH = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=ENV_PATH)

# Configure Gemini API
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Configure S3
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME", "praxis-uploads")

def get_client():
    """Get the Gemini client"""
    return genai.Client(api_key=GEMINI_API_KEY)

def get_s3_client():
    """Get S3 client if credentials exist"""
    if AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY:
        return boto3.client(
            's3',
            aws_access_key_id=AWS_ACCESS_KEY_ID,
            aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
            region_name=AWS_REGION
        )
    return None

def ensure_local_file(file_path: str) -> str:
    """
    Ensure the file exists locally. If not and it looks like an S3 key, download it to a temp file.
    Returns the path to the local file (original or temp).
    """
    # If file exists locally, just return it
    if os.path.exists(file_path):
        return file_path
        
    # If not, try to download from S3
    s3 = get_s3_client()
    if s3 and S3_BUCKET_NAME:
        try:
            # Create a temp file
            suffix = Path(file_path).suffix
            tf = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
            tf.close()
            
            print(f"Downloading {file_path} from S3 to {tf.name}...")
            s3.download_file(S3_BUCKET_NAME, file_path, tf.name)
            return tf.name
        except Exception as e:
            print(f"Failed to download from S3: {e}")
            # If download fails, return original path and let caller fail
            return file_path
            
    return file_path

def get_model():
    """Get the Gemini model, trying 2.5 Pro first, then falling back to 1.5 Pro"""
    try:
        return genai.GenerativeModel('gemini-2.5-pro')
    except:
        # Fallback to 1.5 Pro if 2.5 Pro is not available
        return genai.GenerativeModel('gemini-1.5-pro')


def format_time(seconds: float) -> str:
    """Convert seconds to MM:SS format."""
    minutes = int(seconds // 60)
    secs = int(seconds % 60)
    return f"{minutes:02d}:{secs:02d}"

import re

def clean_and_parse_json(text: str) -> Dict[str, Any]:
    """
    Clean up JSON response from Gemini and parse it.
    Handles:
    - Markdown code fences (```json ... ```)
    - Trailing commas
    - Leading/trailing whitespace
    """
    try:
        # Strip markdown code fences
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0]
        elif "```" in text:
            text = text.split("```")[1].split("```")[0]
        
        text = text.strip()
        
        # Try direct parse first
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            # Fix trailing commas: ,} -> } and ,] -> ]
            text = re.sub(r',\s*}', '}', text)
            text = re.sub(r',\s*]', ']', text)
            
            # Simple unquoted keys fix (risky but handles simple cases: { key: "value" })
            # detailed regex for unquoted keys is complex, sticking to trailing comma first
            pass
            
        return json.loads(text)
    except Exception as e:
        print(f"Failed to parse JSON: {e}")
        print(f"Original text start: {text[:100]}...")
        # Return empty dict on absolute failure to allow graceful degradation
        raise e


def analyze_lecture_materials(file_path: str, lecture_id: str, lecture_title: str = "Lecture") -> Dict[str, Any]:
    """
    Analyze lecture materials (PDF, PowerPoint, etc.) using Gemini to extract intended topics.
    
    Args:
        file_path: Path to the materials file (PDF, PPT, etc.)
        lecture_id: Unique identifier for the lecture
        lecture_title: Title of the lecture
    
    Returns:
        Dictionary containing extracted topics and analysis
    """
    
    try:
        # Get the client
        client = get_client()
        
        # Upload the file to Gemini using the new client API
        print(f"Uploading materials file: {file_path}")
        
        # Ensure file exists locally (download from S3 if needed)
        local_path = ensure_local_file(file_path)
            
        materials_file = client.files.upload(file=local_path)
        
        # Wait for the file to be processed and become ACTIVE
        print(f"Uploaded file: {materials_file.name}, waiting for processing...")
        max_wait_time = 300  # Maximum 5 minutes
        wait_time = 0
        check_interval = 2  # Check every 2 seconds
        
        while materials_file.state == "PROCESSING":
            if wait_time >= max_wait_time:
                raise Exception(f"File processing timeout after {max_wait_time} seconds. File state: {materials_file.state}")
            
            print(f"File state: {materials_file.state}, waiting... ({wait_time}s)")
            time.sleep(check_interval)
            wait_time += check_interval
            materials_file = client.files.get(name=materials_file.name)
        
        if materials_file.state != "ACTIVE":
            raise Exception(f"File processing failed. State: {materials_file.state}")
        
        print(f"File is now {materials_file.state}, proceeding with analysis...")
        
        # Prepare prompt for materials analysis
        prompt_text = f"""Analyze these lecture materials (slides/presentation/document) and extract the key topics that are intended to be covered in this lecture.

        Lecture Title: {lecture_title}

        Please provide a super comprehensive analysis of the materials including:

        1. **Main Topics**: List all major topics/concepts and subtopics that will be covered in this lecture. Be thorough here!
        2. **Subtopics**: For each main topic, identify important subtopics or specific concepts
        3. **Learning Objectives**: What should students learn from this lecture based on the materials?
        4. **Key Concepts**: Important terms, definitions, or concepts mentioned
        5. **Estimated Coverage**: Brief notes on how much time/depth each topic might require
        6. **Slide Quality Feedback**: Provide specific, actionable recommendations to improve the slides. Focus on:
            - **Visuals**: Are there slides that need more images/diagrams? (e.g., "Slide 7 is text-heavy, add a diagram")
            - **Text Density**: Are there slides with too many words? (e.g., "Slide 4 has >100 words, simplify bullets")
            - **Clarity**: Are any charts or diagrams confusing?
            - **Engagement**: Ideas to make specific slides more interactive.

        Return the analysis in this exact JSON structure:
        {{
            "topics": [
                {{
                    "name": "Topic Name",
                    "subtopics": ["Subtopic 1", "Subtopic 2"],
                    "description": "Brief description of what this topic covers",
                    "key_concepts": ["Concept 1", "Concept 2"],
                    "estimated_time": "Brief note on coverage depth",
                    "intended_depth": 3  # 1-5 scale (1=Intro, 5=Deep Dive)
                }}
            ],
            "learning_objectives": [
                "Objective 1",
                "Objective 2"
            ],
            "recommendations": [
                {{
                    "type": "visual|text|clarity|engagement",
                    "slide_number": "Approximate slide number if inferable, or 'General'",
                    "suggestion": "Specific recommendation text",
                    "rationale": "Why this change helps student learning"
                }}
            ],
            "summary": "Overall summary of what this lecture intends to cover",
            "total_topics_count": 0
        }}

        Be thorough and extract all meaningful topics from the materials. Focus on educational content that would be taught in a lecture setting.
        """

        # Determine mime type from file extension
        import mimetypes
        mime_type, _ = mimetypes.guess_type(file_path)
        if not mime_type:
            # Default to common document formats if detection fails
            extension = Path(file_path).suffix.lower()
            mime_type_map = {
                '.pdf': 'application/pdf',
                '.ppt': 'application/vnd.ms-powerpoint',
                '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                '.doc': 'application/msword',
                '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            }
            mime_type = mime_type_map.get(extension, 'application/pdf')

        # Configure generation
        config = types.GenerateContentConfig(
            response_mime_type="application/json"
        )
        
        # Create content with materials file and prompt (using mime_type from the uploaded file)
        contents = [
            types.Content(
                role="user",
                parts=[
                    types.Part.from_uri(file_uri=materials_file.uri, mime_type=materials_file.mime_type),
                    types.Part.from_text(text=prompt_text)
                ]
            )
        ]
        
        # Generate content with the materials file
        print(f"Generating analysis with Gemini using file: {materials_file.uri} (MIME: {materials_file.mime_type})")
        print(f"Prompt length: {len(prompt_text)}")
        
        # Retry logic for handling API overload (503 errors)
        max_retries = 3
        retry_delay = 5  # seconds
        
        for attempt in range(max_retries):
            try:
                response = client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=contents,
                    config=config
                )
                break  # Success, exit retry loop
            except Exception as api_error:
                error_msg = str(api_error)
                if "503" in error_msg or "UNAVAILABLE" in error_msg or "overloaded" in error_msg.lower():
                    if attempt < max_retries - 1:
                        wait_time = retry_delay * (2 ** attempt)  # Exponential backoff
                        print(f"API is overloaded (attempt {attempt + 1}/{max_retries}). Retrying in {wait_time} seconds...")
                        time.sleep(wait_time)
                    else:
                        raise Exception(f"API is currently overloaded after {max_retries} attempts. Please try again in a few minutes.")
                else:
                    raise  # Re-raise if it's not a 503 error
        
        # Parse the response
        response_text = response.text
        
        # Extract JSON from response (it might be wrapped in markdown code blocks)
        if "```json" in response_text:
            json_start = response_text.find("```json") + 7
            json_end = response_text.find("```", json_start)
            response_text = response_text[json_start:json_end].strip()
        elif "```" in response_text:
            json_start = response_text.find("```") + 3
            json_end = response_text.find("```", json_start)
            response_text = response_text[json_start:json_end].strip()
        
        # Parse JSON
        analysis_data = json.loads(response_text)
        
        # Add metadata
        analysis_data["lecture_id"] = lecture_id
        analysis_data["lecture_title"] = lecture_title
        analysis_data["materials_path"] = file_path
        analysis_data["analyzed_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        
        # Update total topics count
        if "topics" in analysis_data:
            analysis_data["total_topics_count"] = len(analysis_data["topics"])
        
        print(f"Materials analysis complete. Found {analysis_data.get('total_topics_count', 0)} topics.")
        
        return analysis_data
        
    except Exception as e:
        # Return error structure
        print(f"Error analyzing materials: {str(e)}")
        return {
            "error": str(e),
            "lecture_id": lecture_id,
            "lecture_title": lecture_title,
            "materials_path": file_path
        }
    finally:
        # Clean up uploaded file
        try:
            client.files.delete(name=materials_file.name)
            print("Cleaned up uploaded materials file")
        except:
            pass
            
        # Clean up local temp file if it was downloaded
        if 'local_path' in locals() and local_path != file_path and os.path.exists(local_path):
            try:
                os.remove(local_path)
                print(f"Cleaned up temp file {local_path}")
            except:
                pass


def analyze_lecture_video(video_path: str, lecture_id: str, lecture_title: str = "Lecture", topics: list = None, materials_analysis: Dict[str, Any] = None, professor_feedback: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    Analyze a lecture video using Gemini 2.5 Pro with low resolution to save tokens.
    
    Args:
        video_path: Path to the video file
        lecture_id: Unique identifier for the lecture
        lecture_title: Title of the lecture
        topics: List of topics that should be covered
        materials_analysis: Optional analysis from lecture materials to provide context
        professor_feedback: Optional professor feedback on previous AI reflections to guide analysis
    
    Returns:
        Dictionary containing analysis results in the format expected by lecture-analysis.html
    """
    
    try:
        # Get the client
        client = get_client()
        
        # Determine mime type from file extension
        import mimetypes
        mime_type, _ = mimetypes.guess_type(video_path)
        if not mime_type:
            # Default to common video formats if detection fails
            extension = Path(video_path).suffix.lower()
            mime_type_map = {
                '.mp4': 'video/mp4',
                '.mov': 'video/quicktime',
                '.avi': 'video/x-msvideo',
                '.mkv': 'video/x-matroska',
                '.webm': 'video/webm'
            }
            mime_type = mime_type_map.get(extension, 'video/mp4')
        
        print(f"Uploading video file: {video_path} (mime type: {mime_type})")
        
        # Ensure file exists locally (download from S3 if needed)
        local_path = ensure_local_file(video_path)
        
        # Check file size
        video_path_obj = Path(local_path)
        file_size_mb = video_path_obj.stat().st_size / (1024 * 1024)
        print(f"Video file size: {file_size_mb:.2f} MB")
        
        # Warn if file is very large
        if file_size_mb > 500:
            print(f"WARNING: Large file ({file_size_mb:.2f} MB). This may take a while or fail.")
            
        video_file = client.files.upload(file=local_path)
        
        # Wait for the file to be processed and become ACTIVE
        print(f"Uploaded file: {video_file.name}, waiting for processing...")
        max_wait_time = 600  # Maximum 10 minutes (increased from 5)
        wait_time = 0
        check_interval = 3  # Check every 3 seconds (reduced API calls)
        
        while video_file.state == "PROCESSING":
            if wait_time >= max_wait_time:
                raise Exception(f"File processing timeout after {max_wait_time} seconds. File state: {video_file.state}. Try with a smaller video file or different format.")
            
            print(f"File state: {video_file.state}, waiting... ({wait_time}s)")
            time.sleep(check_interval)
            wait_time += check_interval
            video_file = client.files.get(name=video_file.name)
        
        if video_file.state != "ACTIVE":
            # Provide more helpful error message
            error_msg = f"File processing failed. State: {video_file.state}."
            error_msg += f"\n\nFile: {video_path_obj.name} ({file_size_mb:.2f} MB)"
            error_msg += f"\nMIME Type: {mime_type}"
            error_msg += "\n\nPossible causes:"
            error_msg += "\n- Video file is too large (try a smaller file or compress it)"
            error_msg += "\n- Video codec is unsupported (try converting to MP4 with H.264)"
            error_msg += "\n- File is corrupted"
            error_msg += "\n- Gemini API is experiencing issues"
            raise Exception(error_msg)
        
        print(f"File is now {video_file.state}, proceeding with analysis using low resolution to save tokens...")
        
        # Prepare prompt with materials context if available
        topics_text = ", ".join(topics) if topics else "general lecture topics"
        
        materials_context = ""
        if (materials_analysis and "topics" in materials_analysis):
            materials_context = "\n\nThe following topics were identified from the lecture materials (slides/documents):\n"
            for topic in materials_analysis["topics"]:
                materials_context += f"- {topic['name']}: {topic.get('description', '')}\n"
                if topic.get('subtopics'):
                    materials_context += f"  Subtopics: {', '.join(topic['subtopics'])}\n"
            materials_context += "\nPlease compare the video content against these intended topics and identify which were covered and which were missed.\n"
        
        # Prepare professor feedback context if available
        feedback_context = ""
        if professor_feedback and "feedback" in professor_feedback:
            feedback_items = professor_feedback["feedback"]
            if feedback_items:
                feedback_context = "\n\nProfessor Feedback Preferences (use this to guide your analysis style and focus):\n"
                # Group feedback by rating
                thumbs_up = [f for f in feedback_items if f.get("rating") == "up" and f.get("feedback_text")]
                thumbs_down = [f for f in feedback_items if f.get("rating") == "down" and f.get("feedback_text")]
                
                if thumbs_up:
                    feedback_context += "\nWhat the professor LIKES in AI reflections:\n"
                    for item in thumbs_up[:5]:  # Limit to 5 most recent
                        feedback_context += f"- {item.get('feedback_text', '')}\n"
                
                if thumbs_down:
                    feedback_context += "\nWhat the professor DISLIKES or wants LESS of in AI reflections:\n"
                    for item in thumbs_down[:5]:  # Limit to 5 most recent
                        feedback_context += f"- {item.get('feedback_text', '')}\n"
                
                feedback_context += "\nPlease tailor your AI reflections to align with these preferences.\n"
        
        prompt_text = f"""Analyze this lecture video and provide a comprehensive analysis in JSON format.

        Lecture Title: {lecture_title}
        Expected Topics: {topics_text}
        {materials_context}{feedback_context}

        Please provide a detailed analysis including:

        1. **Transcript**: Generate a full transcript with timestamps in [MM:SS] format for key moments
        2. **Timeline Events**: Identify and categorize events:
        - Clarity issues (rushed explanations, unclear segments) - mark as yellow
        - Student interactions - BE VERY CAREFUL HERE:
            * ONLY mark as "question" if you hear a DIFFERENT VOICE asking a question (not the professor)
            * Student questions are typically shorter, in a questioning tone, and from a different speaker
            * If you hear "does anyone know..." or "what do you think..." from the professor, this is NOT a student question
            * Mark as blue ONLY for actual student questions from students
            * Mark professor responses to student questions as green "answer" type
        - Positive moments (good examples, jokes, engaging content) - mark as green or pink
        3. **Topic Coverage**: List which topics were covered and which were missed. {
            "If materials analysis was provided, compare against those topics and indicate whether each intended topic was covered in the video." if materials_context else ""
        }
        - Opportunities for improvement
        - Successes to highlight
        - Action items for next lecture
        5. **Metrics**:
        - **AI Sentiment Score**: 1-10 (1=Negative/Frustrated, 10=Positive/Enthusiastic) based on student reactions and general vibe.
        - **Professor Performance Rating**: 1-10 (1=Poor, 10=Excellent) based on clarity, engagement, and pacing.
        - **Engagement Score**: 1-10 (1=Passive, 10=Highly Interactive).

        **CRITICAL GUIDELINES FOR INTERACTION DETECTION:**
        - Student questions: when you clearly hear a different speaker (not the professor) asking something
        - Look for voice changes, tone differences, and conversational patterns
        - When in heavy doubt, DO NOT mark it as a student question - it's better to miss a question than create false positives
        - Professor using Socratic method = NOT a student question
        - Only mark interactions when you're confident there are multiple speakers

        Return the analysis in this exact JSON structure:
        {{
            "transcript": [
                {{
                    "timestamp": "[00:02:40]",
                    "text": "transcript text here",
                    "type": "Success|Opportunity|Normal",
                    "speaker": "Professor|Student"
                }}
            ],
            "timeline": {{
                "clarity": [
                    {{
                        "start_time": 3007,
                        "duration": 23,
                        "title": "Rushed Theory",
                        "description": "Brief description"
                    }}
                ],
                "interaction": [
                    {{
                        "start_time": 659,
                        "duration": 10,
                        "type": "question",
                        "title": "Student Question",
                        "description": "Question text",
                        "student_name": "Student name if mentioned, or 'Student' if not"
                    }},
                    {{
                        "start_time": 669,
                        "duration": 30,
                        "type": "answer",
                        "title": "Professor Answer",
                        "description": "Answer text"
                    }}
                ],
                "positive": [
                    {{
                        "start_time": 800,
                        "duration": 25,
                        "title": "Good Example|Engaging Story|Helpful Analogy",
                        "description": "Description"
                    }}
                ]
            }},
            "topic_coverage": [
                {{
                    "topic": "Topic Name",
                    "covered": true,
                    "status": "Strong|Good|Struggling",
                    "status_reason": "Clear, actionable feedback addressed to the professor explaining WHY this rating was given. (e.g., 'The explanation was rushed and relied too heavily on text-heavy slides without examples.')",
                    "notes": "Brief internal notes on how well it was covered",
                    "key_concepts": "A concise 1-2 sentence definition/summary of this topic based on the lecture content",
                    "examples": "Specific examples mentioned in the lecture for this topic (e.g., 'COMPAS algorithm for bias in criminal justice')",
                    "lecture_moments": "Relevant timestamps or slide references where this topic was discussed (e.g., 'Discussed at 12:30-15:45')",
                    "ai_reflection": "Teaching insight: common student misconceptions, tips for better understanding, or areas that need reinforcement",
                    "actual_depth": 3  # 1-5 scale (1=Mentioned, 5=Deep Dive)
                }}
            ],
            "metrics": {{
                "sentiment_score": 8,
                "performance_rating": 7,
                "engagement_score": 6
            }},
            "ai_reflections": {{
                "insights": [
                    {{
                        "type": "opportunity|success|warning",
                        "title": "Specific, actionable title",
                        "description": "Detailed description with specific examples and timestamps when relevant",
                        "icon": "yellow|green|red"
                    }}
                ],
                "action_items": [
                    {{
                        "priority": "Must Do|Should Do|Continue Doing",
                        "item": "Concrete, actionable item with specific recommendations"
                    }}
                ]
            }},
            "video_duration": 0
        }}

        Important:
        - All timestamps should be in seconds (for timeline) and formatted as [MM:SS] for transcript
        - Calculate percentage positions for timeline events (left: X%, width: Y%)
        - Be specific and actionable in your analysis
        - Focus on teaching effectiveness and student engagement
        - For interaction events: Be conservative - only mark actual student questions
        - Include student names in interaction events when mentioned
        - Differentiate between different types of positive moments (examples, stories, analogies, humor)
        - **JSON FORMATTING**: Ensure the output is VALID JSON. Escape all quotes inside string values (e.g., "reason": "He said \"Hello\"")
        """
        
        # Configure generation with low media resolution to save tokens
        config = types.GenerateContentConfig(
            media_resolution="MEDIA_RESOLUTION_LOW",
            response_mime_type="application/json"
        )
        
        # Create content with video file and prompt
        contents = [
            types.Content(
                role="user",
                parts=[
                    types.Part.from_uri(file_uri=video_file.uri, mime_type=mime_type),
                    types.Part.from_text(text=prompt_text)
                ]
            )
        ]
        
        # Generate content with video using low resolution
        print("Generating analysis with Gemini using low resolution...")
        
        # Retry logic for handling API overload (503 errors)
        max_retries = 3
        retry_delay = 5  # seconds
        
        for attempt in range(max_retries):
            try:
                response = client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=contents,
                    config=config
                )
                break  # Success, exit retry loop
            except Exception as api_error:
                error_msg = str(api_error)
                if "503" in error_msg or "UNAVAILABLE" in error_msg or "overloaded" in error_msg.lower():
                    if attempt < max_retries - 1:
                        wait_time = retry_delay * (2 ** attempt)  # Exponential backoff
                        print(f"API is overloaded (attempt {attempt + 1}/{max_retries}). Retrying in {wait_time} seconds...")
                        time.sleep(wait_time)
                    else:
                        raise Exception(f"API is currently overloaded after {max_retries} attempts. Please try again in a few minutes.")
                else:
                    raise  # Re-raise if it's not a 503 error
        
        # Parse the response

        
        # Parse JSON
        # Parse JSON using robust helper
        analysis_data = clean_and_parse_json(response.text)
        
        # Calculate timeline percentages based on video duration
        video_duration = analysis_data.get("video_duration", 3600)  # Default to 1 hour if not provided
        
        # Add percentage calculations for timeline events
        for event_type in ["clarity", "interaction", "positive"]:
            if event_type in analysis_data.get("timeline", {}):
                for event in analysis_data["timeline"][event_type]:
                    start_time = event.get("start_time", 0)
                    duration = event.get("duration", 0)
                    event["left_percent"] = (start_time / video_duration) * 100 if video_duration > 0 else 0
                    event["width_percent"] = (duration / video_duration) * 100 if video_duration > 0 else 1
        
        # Add lecture metadata
        analysis_data["lecture_id"] = lecture_id
        analysis_data["lecture_title"] = lecture_title
        analysis_data["video_path"] = video_path
        
        return analysis_data
        
    except Exception as e:
        # Return error structure
        return {
            "error": str(e),
            "lecture_id": lecture_id,
            "lecture_title": lecture_title,
            "video_path": video_path
        }
    finally:
        # Clean up uploaded file
        try:
            client.files.delete(name=video_file.name)
            print("Cleaned up uploaded video file")
        except:
            pass
            
        # Clean up local temp file if it was downloaded
        if 'local_path' in locals() and local_path != video_path and os.path.exists(local_path):
            try:
                os.remove(local_path)
                print(f"Cleaned up temp file {local_path}")
            except:
                pass


async def save_analysis_result(analysis_data: Dict[str, Any], output_dir: Path = None) -> str:
    """
    Save analysis result to MongoDB.
    
    Args:
        analysis_data: The analysis data dictionary
        output_dir: Deprecated - kept for backward compatibility, not used
    
    Returns:
        lecture_id (for backward compatibility)
    """
    from database import save_analysis_to_db
    
    lecture_id = analysis_data.get("lecture_id", "unknown")
    await save_analysis_to_db(lecture_id, analysis_data)
    
    return lecture_id


async def save_materials_analysis_result(analysis_data: Dict[str, Any], output_dir: Path = None) -> str:
    """
    Save materials analysis result to MongoDB.
    
    Args:
        analysis_data: The analysis data dictionary
        output_dir: Deprecated - kept for backward compatibility, not used
    
    Returns:
        lecture_id (for backward compatibility)
    """
    from database import save_materials_analysis_to_db
    
    lecture_id = analysis_data.get("lecture_id", "unknown")
    await save_materials_analysis_to_db(lecture_id, analysis_data)
    
    return lecture_id


def generate_student_survey(lecture_id: str, lecture_title: str, analysis_data: Dict[str, Any] = None, professor_input: str = None) -> Dict[str, Any]:
    """
    Generate a student comprehension survey based on lecture analysis using Gemini.
    
    Args:
        lecture_id: Unique identifier for the lecture
        lecture_title: Title of the lecture
        analysis_data: Optional lecture analysis data to provide context
        professor_input: Optional professor instructions for survey generation
    
    Returns:
        Dictionary containing the generated survey with questions
    """
    
    try:
        # Get the client
        client = get_client()
        
        # Prepare context from analysis data
        topics_context = ""
        if analysis_data:
            # Extract covered and missed topics
            if "topic_coverage" in analysis_data:
                covered_topics = [t["topic"] for t in analysis_data["topic_coverage"] if t.get("covered")]
                missed_topics = [t["topic"] for t in analysis_data["topic_coverage"] if not t.get("covered")]
                
                if covered_topics:
                    topics_context += f"\n\nTopics covered in lecture: {', '.join(covered_topics)}"
                if missed_topics:
                    topics_context += f"\n\nTopics that were missed/rushed: {', '.join(missed_topics)}"
            
            # Extract insights about clarity issues
            if "ai_reflections" in analysis_data and "insights" in analysis_data["ai_reflections"]:
                clarity_issues = [
                    insight["title"] for insight in analysis_data["ai_reflections"]["insights"]
                    if insight.get("type") == "opportunity" or insight.get("icon") == "yellow"
                ]
                if clarity_issues:
                    topics_context += f"\n\nAreas that may need clarification: {', '.join(clarity_issues)}"
        
        # Prepare prompt for Gemini
        professor_instructions = ""
        if professor_input:
            professor_instructions = f"\n\nProfessor Instructions:\n{professor_input}\n\nPlease incorporate these instructions into the survey generation."
        
        prompt_text = f"""Create a comprehensive student comprehension survey for the following lecture.

        Lecture Title: {lecture_title}
        {topics_context}{professor_instructions}

        The survey should help professors understand:
        1. Which concepts students understood well
        2. Which concepts need more explanation or review
        3. Whether students need additional help on specific topics

        Please generate a survey with the following structure:

        1. **Concept Understanding Questions**: For each major concept covered, create a Likert scale question (1-5) asking students to rate their understanding
        2. **Confidence Questions**: Ask students how confident they feel applying each concept
        3. **Help Needed Questions**: Ask students to identify which topics they need more help with (multiple choice)
        4. **Open-ended Feedback**: Include 1-2 open-ended questions for general feedback

        The survey should:
        - Be concise (8-12 questions total)
        - Focus on the most important concepts from the lecture
        - Use clear, student-friendly language
        - Help identify which concepts need reinforcement

        Return the survey in this exact JSON structure:
        {{
            "survey_id": "unique_id",
            "lecture_title": "{lecture_title}",
            "lecture_id": "{lecture_id}",
            "created_at": "timestamp",
            "questions": [
                {{
                    "id": "q1",
                    "type": "likert",
                    "question": "How well do you understand [concept]?",
                    "scale": {{"min": 1, "max": 5, "min_label": "Not at all", "max_label": "Very well"}},
                    "concept": "Concept name"
                }},
                {{
                    "id": "q2",
                    "type": "multiple_choice",
                    "question": "Which topics would you like more explanation on?",
                    "options": ["Option 1", "Option 2", "Option 3"],
                    "allow_multiple": true
                }},
                {{
                    "id": "q3",
                    "type": "open_ended",
                    "question": "What was the most confusing part of this lecture?"
                }}
            ],
            "summary": "Brief summary of what this survey measures"
        }}

        Focus on practical, actionable questions that will help the professor improve future lectures and provide targeted support.
        """

        # Configure generation
        config = types.GenerateContentConfig(
            response_mime_type="application/json"
        )
        
        # Create content with prompt
        contents = [
            types.Content(
                role="user",
                parts=[
                    types.Part.from_text(text=prompt_text)
                ]
            )
        ]
        
        # Generate survey with Gemini
        print("Generating student survey with Gemini...")
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=contents,
            config=config
        )
        
        # Parse the response
        response_text = response.text
        
        # Extract JSON from response
        if "```json" in response_text:
            json_start = response_text.find("```json") + 7
            json_end = response_text.find("```", json_start)
            response_text = response_text[json_start:json_end].strip()
        elif "```" in response_text:
            json_start = response_text.find("```") + 3
            json_end = response_text.find("```", json_start)
            response_text = response_text[json_start:json_end].strip()
        
        # Parse JSON
        survey_data = json.loads(response_text)
        
        # Add metadata if not present
        if "survey_id" not in survey_data or not survey_data["survey_id"]:
            import uuid
            survey_data["survey_id"] = str(uuid.uuid4())[:8]
        
        if "lecture_id" not in survey_data:
            survey_data["lecture_id"] = lecture_id
        
        if "lecture_title" not in survey_data:
            survey_data["lecture_title"] = lecture_title
        
        if "created_at" not in survey_data:
            survey_data["created_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        
        # Generate shareable link - use environment variable or default based on environment
        # In production (Render), set SURVEY_BASE_URL env var to the Vercel frontend URL
        import os
        base_url = os.getenv("SURVEY_BASE_URL", "https://praxis-rnv864wdk-mdsiam8s-projects.vercel.app")
        survey_data["shareable_link"] = f"{base_url}/?survey_id={survey_data['survey_id']}"
        
        print(f"Survey generated successfully with {len(survey_data.get('questions', []))} questions.")
        
        return survey_data
        
    except Exception as e:
        print(f"Error generating survey: {str(e)}")
        return {
            "error": str(e),
            "lecture_id": lecture_id,
            "lecture_title": lecture_title
        }


async def save_survey(survey_data: Dict[str, Any], output_dir: Path = None) -> str:
    """
    Save survey to MongoDB.
    
    Args:
        survey_data: The survey data dictionary
        output_dir: Deprecated - kept for backward compatibility, not used
    
    Returns:
        survey_id (for backward compatibility)
    """
    from database import save_survey_to_db
    
    survey_id = survey_data.get("survey_id", "unknown")
    await save_survey_to_db(survey_id, survey_data)
    
    
    return survey_id



async def generate_simulated_trends(class_id: str, lectures: list) -> Dict[str, Any]:
    """
    Generates simulated trend data for a sequence of lectures using Gemini.
    This is used to populate the Student Trends dashboard when real analysis data is missing.
    """
    client = get_client() # Get the client for Gemini
    
    # Prepare prompt for ALL lectures
    lectures_info = []
    for l in lectures:
        info = f"Title: {l.get('title')}"
        if l.get("context"):
            # We can be more generous with context now since we are doing 1 call
            # But still keep it reasonable to avoid massive latency
            context = l.get("context", "")
            if len(context) > 5000:
                context = context[:5000] + "...(truncated)"
            info += f"\nContext/Summary: {context}"
        lectures_info.append(info)
        
    prompt = f"""
    I have a course with the following sequence of {len(lectures)} lectures:
    
    {json.dumps(lectures_info, indent=2)}
    
    Generate realistic "Student Trend" data for ALL of these lectures.
    If "Context/Summary" is provided, USE IT. Otherwise simulate based on title.
    
    For EACH lecture, generate:
    1. **Sentiment Score** (1-10)
    2. **Performance Rating** (1-10)
    3. **Engagement Score** (1-10)
    4. **Topic Drift**: Identify 1-2 **BROAD THEMATIC CATEGORIES** (e.g., "Cognitive Psychology"). Assign depth (1-5).
    
    Also identify "Understanding Gaps" based on the entire course (optional).
    
    Return JSON structure:
    {{
        "lectures": [
            {{
                "title": "Exact Title from input",
                "metrics": {{ "sentiment_score": 8, "performance_rating": 7, "engagement_score": 6 }},
                "topics": [ {{ "name": "Category", "depth": 4 }} ]
            }}
        ],
        "understanding_gaps": [ {{ "topic": "Topic", "intended": 5, "actual": 3 }} ]
    }}
    
    IMPORTANT: Return RAW JSON only. Ensure the number of lectures in output matches the input.
    """

    contents = [types.Content(role="user", parts=[types.Part.from_text(text=prompt)])]
    
    # Retry logic for rate limits (still good hygiene, even for 1 call)
    max_retries = 3
    response = None
    
    for attempt in range(max_retries + 1):
        try:
            # Configure generation for JSON output
            gen_config = types.GenerateContentConfig(
                response_mime_type="application/json"
            )

            # Try 2.5 Flash (aligning with video analysis for reliability)
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=contents,
                config=gen_config
            )
            break # Success
        except Exception as e:
            is_rate_limit = "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e)
            
            if is_rate_limit and attempt < max_retries:
                wait_time = (attempt + 1) * 20 # 20s, 40s, 60s
                print(f"Rate limit hit. Retrying in {wait_time}s...")
                time.sleep(wait_time)
                continue
            
            print(f"Generation failed: {e}")
            raise e
    
    if not response:
        return {}

    # Parse response
    try:
        text = response.text
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0]
        elif "```" in text:
            text = text.split("```")[1].split("```")[0]
        
        return json.loads(text)
        
    except Exception as e:
        print(f"Error parsing response: {e}")
        return {}


def analyze_syllabus(file_path: str, course_code: str = "") -> Dict[str, Any]:
    """
    Analyze a syllabus file (PDF/Text) using Gemini to extract structured course data.
    
    Args:
        file_path: Path to the syllabus file
        course_code: Course code for context
    
    Returns:
        Dictionary containing:
        - key_themes: List of main topics
        - weekly_schedule: List of {week: int, topic: str, description: str}
        - learning_objectives: List of strings
    """
    try:
        client = get_client()
        
        # Upload file
        file = client.files.upload(file=file_path)
        
        # Wait for processing
        while file.state == "PROCESSING":
            time.sleep(1)
            file = client.files.get(name=file.name)
            
        if file.state == "FAILED":
            raise ValueError(f"File processing failed: {file.state}")
            
        prompt = f"""
        Analyze this syllabus for course {course_code}.
        Extract the following structured information:
        
        1. **Key Themes**: Identify 5-7 distinct high-level thematic categories that this course covers. These will be used to track "Topic Drift" over time.
        2. **Weekly Schedule**: A chronological list of topics covered week by week.
        3. **Learning Objectives**: The stated goals of the course.
        
        Return JSON format:
        {{
            "key_themes": [ "Theme 1", "Theme 2" ],
            "weekly_schedule": [
                {{ "week": 1, "topic": "Intro to AI", "description": "History and basics" }},
                {{ "week": 2, "topic": "Neural Networks", "description": "Perceptrons and layers" }}
            ],
            "learning_objectives": [ "Objective 1", "Objective 2" ]
        }}
        """
        
        gen_config = types.GenerateContentConfig(
            response_mime_type="application/json"
        )
        
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Content(
                    role="user",
                    parts=[
                        types.Part.from_uri(
                            file_uri=file.uri,
                            mime_type=file.mime_type
                        ),
                        types.Part.from_text(text=prompt)
                    ]
                )
            ],
            config=gen_config
        )
        
        # Parse response
        return clean_and_parse_json(response.text)
        
    except Exception as e:
        print(f"Error analyzing syllabus: {e}")
        return {"error": str(e)}



def analyze_assignment_alignment(assignment_file_path: str, assignment_title: str, lecture_contexts: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Analyze an assignment file against a set of lecture contexts (topics/transcripts) 
    to determine alignment and generate suggestions.

    Args:
        assignment_file_path: Path to the assignment file (PDF, etc.)
        assignment_title: Title of the assignment
        lecture_contexts: List of dictionaries containing lecture info:
                          [{'title': '...', 'topics': ['...'], 'summary': '...'}]

    Returns:
        Dictionary containing alignment analysis (good points, suggestions, score)
    """
    try:
        client = get_client()

        # Determine mime type
        import mimetypes
        mime_type, _ = mimetypes.guess_type(assignment_file_path)
        if not mime_type:
            mime_type = "application/pdf"
            
        print(f"Uploading assignment file: {assignment_file_path}")
        
        # Ensure file exists locally (download from S3 if needed)
        local_path = ensure_local_file(assignment_file_path)
        
        assignment_file = client.files.upload(file=local_path, mime_type=mime_type)
        
        # Wait for processing
        print(f"Uploaded file: {assignment_file.name}, waiting for processing...")
        max_wait_time = 300
        wait_time = 0
        check_interval = 2
        
        while assignment_file.state == "PROCESSING":
            if wait_time >= max_wait_time:
                raise Exception(f"File processing timeout")
            
            print(f"File state: {assignment_file.state}, waiting... ({wait_time}s)")
            time.sleep(check_interval)
            wait_time += check_interval
            assignment_file = client.files.get(name=assignment_file.name)

        if assignment_file.state != "ACTIVE":
             raise Exception(f"File processing failed. State: {assignment_file.state}")

        print(f"File active. Preparing context from {len(lecture_contexts)} lectures...")

        # Prepare Lecture Context String
        lectures_text = ""
        for i, lec in enumerate(lecture_contexts):
            lectures_text += f"\\n--- LECTURE {i+1}: {lec.get('title', 'Untitled')} ---\\n"
            lectures_text += f"Topics Covered: {', '.join(lec.get('topics', []))}\\n"
            if lec.get('summary'):
                 lectures_text += f"Summary: {lec.get('summary')}\\n"
            # If we had full transcripts, we could include them here, 
            # but topics/summary is usually sufficient for high-level alignment.

        prompt_text = f"""You are an expert Educational Consultant and TA.
        
        Your task is to analyze this Assignment (attached file) and compare it against the content covered in the following Lectures.
        
        Assignment Title: {assignment_title}
        
        CONTEXT - COURSE LECTURES COVERED SO FAR:
        {lectures_text}
        
        Please evaluate how well this assignment aligns with the material taught. 
        We want to ensure students are being tested on things they've actually learned, 
        while also challenging them appropriately.

        Provide a response in this JSON format:
        {{
            "alignment_score": 85,  // 0-100 score of how well the assignment fits the lectures
            "topics_alignment": [
                {{
                    "topic": "Specific Concept from Assignment",
                    "status": "Covered|Not Covered|Partially Covered",
                    "lecture_reference": "Lecture 2", // Which lecture covered this best?
                    "notes": "Brief explanation"
                }}
            ],
            "strengths": [
                "Good point 1: e.g. 'Excellent practical application of the theory discussed in Lecture 3'"
            ],
            "suggestions": [
                {{
                    "type": "gap_warning|improvement_idea",
                    "title": "Short Title",
                    "description": "Detailed suggestion. E.g. 'The assignment asks about X, but Lecture 1 only briefly mentioned it. Consider adding a reference or hint.'"
                }}
            ],
            "summary": "Overall assessment of the assignment."
        }}
        """

        # Configure generation
        config = types.GenerateContentConfig(
            response_mime_type="application/json"
        )
        
        contents = [
            types.Content(
                role="user",
                parts=[
                    types.Part.from_uri(file_uri=assignment_file.uri, mime_type=assignment_file.mime_type),
                    types.Part.from_text(text=prompt_text)
                ]
            )
        ]

        print("Generating assignment alignment analysis...")
        response = client.models.generate_content(
            model="gemini-2.5-flash", 
            contents=contents,
            config=config
        )

        # Parse Response
        response_text = response.text
        if "```json" in response_text:
            json_start = response_text.find("```json") + 7
            json_end = response_text.find("```", json_start)
            response_text = response_text[json_start:json_end].strip()
        elif "```" in response_text:
            json_start = response_text.find("```") + 3
            json_end = response_text.find("```", json_start)
            response_text = response_text[json_start:json_end].strip()
        
        analysis_data = json.loads(response_text)
        return analysis_data

    except Exception as e:
        print(f"Error analyzing assignment: {e}")
        return {"error": str(e)}
    finally:
        # Clean up uploaded file
        try:
            if 'assignment_file' in locals():
                client.files.delete(name=assignment_file.name)
                print("Cleaned up uploaded assignment file")
        except:
            pass
            
        # Clean up local temp file if it was downloaded
        if 'local_path' in locals() and local_path != assignment_file_path and os.path.exists(local_path):
            try:
                os.remove(local_path)
                print(f"Cleaned up temp file {local_path}")
            except:
                pass




