"""
Gemini API integration for lecture video analysis.
Uses Google AI Studio Gemini 2.5 Pro to analyze lecture videos.
"""

import google.generativeai as genai
import json
import base64
from pathlib import Path
from typing import Dict, Any, List
import os
import time

# Configure Gemini API
GEMINI_API_KEY = "AIzaSyDHEw5W2fTsJjrp2XyICOAJURsI2m2GQP4"
genai.configure(api_key=GEMINI_API_KEY)

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
        # Upload the file to Gemini
        print(f"Uploading materials file: {file_path}")
        materials_file = genai.upload_file(path=file_path)
        
        # Wait for the file to be processed and become ACTIVE
        print(f"Uploaded file: {materials_file.name}, waiting for processing...")
        max_wait_time = 300  # Maximum 5 minutes
        wait_time = 0
        check_interval = 2  # Check every 2 seconds
        
        while materials_file.state.name == "PROCESSING":
            if wait_time >= max_wait_time:
                raise Exception(f"File processing timeout after {max_wait_time} seconds. File state: {materials_file.state.name}")
            
            print(f"File state: {materials_file.state.name}, waiting... ({wait_time}s)")
            time.sleep(check_interval)
            wait_time += check_interval
            materials_file = genai.get_file(materials_file.name)
        
        if materials_file.state.name != "ACTIVE":
            raise Exception(f"File processing failed. State: {materials_file.state.name}")
        
        print(f"File is now {materials_file.state.name}, proceeding with analysis...")
        
        # Prepare prompt for materials analysis
        prompt = f"""Analyze these lecture materials (slides/presentation/document) and extract the key topics that are intended to be covered in this lecture.

Lecture Title: {lecture_title}

Please provide a comprehensive analysis of the materials including:

1. **Main Topics**: List all major topics/concepts that will be covered in this lecture
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

        # Get the model
        model = get_model()
        
        # Generate content with the materials file
        print("Generating analysis with Gemini...")
        response = model.generate_content([materials_file, prompt])
        
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
            genai.delete_file(materials_file.name)
            print("Cleaned up uploaded materials file")
        except:
            pass


def analyze_lecture_video(video_path: str, lecture_id: str, lecture_title: str = "Lecture", topics: list = None, materials_analysis: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    Analyze a lecture video using Gemini 2.5 Pro.
    
    Args:
        video_path: Path to the video file
        lecture_id: Unique identifier for the lecture
        lecture_title: Title of the lecture
        topics: List of topics that should be covered
        materials_analysis: Optional analysis from lecture materials to provide context
    
    Returns:
        Dictionary containing analysis results in the format expected by lecture-analysis.html
    """
    
    # Read video file and upload to Gemini
    video_file = genai.upload_file(path=video_path)
    
    # Wait for the file to be processed and become ACTIVE
    print(f"Uploaded file: {video_file.name}, waiting for processing...")
    max_wait_time = 300  # Maximum 5 minutes
    wait_time = 0
    check_interval = 2  # Check every 2 seconds
    
    while video_file.state.name == "PROCESSING":
        if wait_time >= max_wait_time:
            raise Exception(f"File processing timeout after {max_wait_time} seconds. File state: {video_file.state.name}")
        
        print(f"File state: {video_file.state.name}, waiting... ({wait_time}s)")
        time.sleep(check_interval)
        wait_time += check_interval
        video_file = genai.get_file(video_file.name)
    
    if video_file.state.name != "ACTIVE":
        raise Exception(f"File processing failed. State: {video_file.state.name}")
    
    print(f"File is now {video_file.state.name}, proceeding with analysis...")
    
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
    
    prompt = f"""Analyze this lecture video and provide a comprehensive analysis in JSON format.

Lecture Title: {lecture_title}
Expected Topics: {topics_text}
{materials_context}

Please provide a detailed analysis including:

1. **Transcript**: Generate a full transcript with timestamps in [MM:SS] format for key moments
2. **Timeline Events**: Identify and categorize events:
   - Clarity issues (rushed explanations, unclear segments) - mark as yellow
   - Student interactions (questions, answers) - mark as blue for questions, green for answers
   - Positive moments (good examples, jokes, engaging content) - mark as green or pink
3. **Topic Coverage**: List which topics were covered and which were missed. {
    "If materials analysis was provided, compare against those topics and indicate whether each intended topic was covered in the video." if materials_context else ""
}
4. **AI Reflections**: Provide insights and action items:
   - Opportunities for improvement
   - Successes to highlight
   - Action items for next lecture

Return the analysis in this exact JSON structure:
{{
    "transcript": [
        {{
            "timestamp": "[00:02:40]",
            "text": "transcript text here",
            "type": "Success|Opportunity|Question|Answer",
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
                "description": "Question text"
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
                "title": "Good Joke",
                "description": "Description"
            }}
        ]
    }},
    "topic_coverage": [
        {{
            "topic": "Topic Name",
            "covered": true,
            "notes": "Brief notes"
        }}
    ],
    "ai_reflections": {{
        "insights": [
            {{
                "type": "opportunity|success|warning",
                "title": "Title",
                "description": "Description",
                "icon": "yellow|green|red"
            }}
        ],
        "action_items": [
            {{
                "priority": "Must Do|Should Do|Continue Doing",
                "item": "Action item text"
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
"""

    try:
        # Get the model
        model = get_model()
        
        # Generate content with video
        response = model.generate_content([video_file, prompt])
        
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
            genai.delete_file(video_file.name)
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

