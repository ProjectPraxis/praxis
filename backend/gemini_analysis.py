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

# Configure Gemini API
GEMINI_API_KEY = "AIzaSyCuYdB7RObwDyYqV8dZa6K52_2wKg75L9g"

def get_client():
    """Get the Gemini client"""
    return genai.Client(api_key=GEMINI_API_KEY)

def get_model():
    """Get the Gemini model, trying 2.5 Pro first, then falling back to 1.5 Pro"""
    try:
        return genai.GenerativeModel('gemini-2.5-pro')
    except:
        # Fallback to 1.5 Pro if 2.5 Pro is not available
        return genai.GenerativeModel('gemini-1.5-flash')


def format_time(seconds: float) -> str:
    """Convert seconds to MM:SS format."""
    minutes = int(seconds // 60)
    secs = int(seconds % 60)
    return f"{minutes:02d}:{secs:02d}"


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
        materials_file = client.files.upload(file=file_path)
        
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

        Return the analysis in this exact JSON structure:
        {{
            "topics": [
                {{
                    "name": "Topic Name",
                    "subtopics": ["Subtopic 1", "Subtopic 2"],
                    "description": "Brief description of what this topic covers",
                    "key_concepts": ["Concept 1", "Concept 2"],
                    "estimated_time": "Brief note on coverage depth"
                }}
            ],
            "learning_objectives": [
                "Objective 1",
                "Objective 2"
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
        
        # Create content with materials file and prompt
        contents = [
            types.Content(
                role="user",
                parts=[
                    types.Part.from_uri(file_uri=materials_file.uri, mime_type=mime_type),
                    types.Part.from_text(text=prompt_text)
                ]
            )
        ]
        
        # Generate content with the materials file
        print("Generating analysis with Gemini...")
        
        # Retry logic for handling API overload (503 errors)
        max_retries = 3
        retry_delay = 5  # seconds
        
        for attempt in range(max_retries):
            try:
                response = client.models.generate_content(
                    model="gemini-2.5-pro",
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


def analyze_lecture_video(video_path: str, lecture_id: str, lecture_title: str = "Lecture", topics: list = None, materials_analysis: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    Analyze a lecture video using Gemini 2.5 Pro with low resolution to save tokens.
    
    Args:
        video_path: Path to the video file
        lecture_id: Unique identifier for the lecture
        lecture_title: Title of the lecture
        topics: List of topics that should be covered
        materials_analysis: Optional analysis from lecture materials to provide context
    
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
        
        # Upload video file (use 'file' parameter, not 'path')
        print(f"Uploading video file: {video_path} (mime type: {mime_type})")
        video_file = client.files.upload(file=video_path)
        
        # Wait for the file to be processed and become ACTIVE
        print(f"Uploaded file: {video_file.name}, waiting for processing...")
        max_wait_time = 300  # Maximum 5 minutes
        wait_time = 0
        check_interval = 2  # Check every 2 seconds
        
        while video_file.state == "PROCESSING":
            if wait_time >= max_wait_time:
                raise Exception(f"File processing timeout after {max_wait_time} seconds. File state: {video_file.state}")
            
            print(f"File state: {video_file.state}, waiting... ({wait_time}s)")
            time.sleep(check_interval)
            wait_time += check_interval
            video_file = client.files.get(name=video_file.name)
        
        if video_file.state != "ACTIVE":
            raise Exception(f"File processing failed. State: {video_file.state}")
        
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
        
        prompt_text = f"""Analyze this lecture video and provide a comprehensive analysis in JSON format.

        Lecture Title: {lecture_title}
        Expected Topics: {topics_text}
        {materials_context}

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
        4. **AI Reflections**: Provide insights and action items:
        - Opportunities for improvement
        - Successes to highlight
        - Action items for next lecture

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
                    "notes": "Brief notes on how well it was covered"
                }}
            ],
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
                    model="gemini-2.5-pro",
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


def save_analysis_result(analysis_data: Dict[str, Any], output_dir: Path) -> str:
    """
    Save analysis result to a JSON file.
    
    Args:
        analysis_data: The analysis data dictionary
        output_dir: Directory to save the JSON file
    
    Returns:
        Path to the saved JSON file
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    
    lecture_id = analysis_data.get("lecture_id", "unknown")
    output_file = output_dir / f"{lecture_id}_analysis.json"
    
    with open(output_file, 'w') as f:
        json.dump(analysis_data, f, indent=2)
    
    return str(output_file)


def save_materials_analysis_result(analysis_data: Dict[str, Any], output_dir: Path) -> str:
    """
    Save materials analysis result to a JSON file.
    
    Args:
        analysis_data: The analysis data dictionary
        output_dir: Directory to save the JSON file
    
    Returns:
        Path to the saved JSON file
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    
    lecture_id = analysis_data.get("lecture_id", "unknown")
    output_file = output_dir / f"{lecture_id}_materials_analysis.json"
    
    with open(output_file, 'w') as f:
        json.dump(analysis_data, f, indent=2)
    
    return str(output_file)


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
            model="gemini-2.5-pro",
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
        
        # Generate shareable link - use current host or localhost for development
        # In production, this would be the actual domain
        import os
        base_url = os.getenv("SURVEY_BASE_URL", "http://localhost:8000")
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


def save_survey(survey_data: Dict[str, Any], output_dir: Path) -> str:
    """
    Save survey to a JSON file.
    
    Args:
        survey_data: The survey data dictionary
        output_dir: Directory to save the JSON file
    
    Returns:
        Path to the saved JSON file
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    
    survey_id = survey_data.get("survey_id", "unknown")
    lecture_id = survey_data.get("lecture_id", "unknown")
    # Use consistent naming pattern: {lecture_id}_survey_{survey_id}.json
    output_file = output_dir / f"{lecture_id}_survey_{survey_id}.json"
    
    with open(output_file, 'w') as f:
        json.dump(survey_data, f, indent=2)
    
    return str(output_file)

