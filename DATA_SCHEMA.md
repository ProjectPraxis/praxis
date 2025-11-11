# Data Schema Documentation

This document describes the structure of all JSON data files used in Project Praxis.

## Courses

### `data/courses/all_courses.json`
List of all courses accessible by the user.

```json
{
  "courses": [
    {
      "id": "string",              // Unique course identifier
      "code": "string",            // Display code (e.g., "JHU 601.486")
      "name": "string",            // Course name
      "current_lecture": "number", // Current lecture number
      "total_lectures": "number",  // Total number of lectures
      "progress_percentage": "number", // 0-100
      "is_active": "boolean"       // Whether course is currently active
    }
  ]
}
```

### `data/courses/course_overview.json`
Detailed information for a specific course.

```json
{
  "course_id": "string",
  "course_name": "string",
  "institution": "string",
  "instructor": "string",
  "total_lectures": "number",
  "current_lecture": "number",
  "progress_percentage": "number",
  "priority_actions": [
    {
      "id": "string",
      "type": "critical|warning|info",
      "title": "string",
      "description": "string",
      "related_lecture": "string",
      "actions": [
        {
          "label": "string",
          "action": "navigate|dismiss",
          "target": "string"  // Screen ID for navigation
        }
      ]
    }
  ],
  "general_feedback": {
    "sustains": ["string"],  // Things going well
    "improves": ["string"]   // Areas for improvement
  }
}
```

## Lectures

### `data/lectures/all_lectures.json`
List of all lectures in a course.

```json
{
  "lectures": [
    {
      "id": "string",              // e.g., "lecture_3"
      "number": "number",
      "title": "string",
      "date": "YYYY-MM-DD",
      "status": "analyzed|processing|upcoming",
      "clarity_score": "number|null",  // 0-100
      "has_analysis": "boolean"
    }
  ]
}
```

### `data/lectures/lecture_X_analysis.json`
Detailed analysis for a specific lecture.

```json
{
  "lecture_id": "string",
  "lecture_number": "number",
  "title": "string",
  "date": "YYYY-MM-DD",
  "duration_minutes": "number",
  "course_id": "string",
  "insights": [
    {
      "timestamp": "string",      // e.g., "12:30"
      "type": "confusion|clarity|digression|pacing",
      "title": "string",
      "description": "string",
      "severity": "positive|medium|low",
      "icon": "string"            // Icon name
    }
  ],
  "topics_covered": [
    {
      "topic": "string",
      "status": "strong|moderate|weak|struggling|mentioned",
      "coverage_percentage": "number",  // 0-100
      "student_understanding": "high|medium|low"
    }
  ],
  "deferred_content": ["string"],  // Topics not covered
  "overall_clarity_score": "number",      // 0-100
  "student_engagement_score": "number",   // 0-100
  "pacing_score": "number"                // 0-100
}
```

## Assignments

### `data/assignments/all_assignments.json`
List of all assignments.

```json
{
  "assignments": [
    {
      "id": "string",
      "title": "string",
      "due_date": "YYYY-MM-DD",
      "status": "graded|grading|open",
      "submissions": "number",
      "average_score": "number|null"  // 0-100
    }
  ]
}
```

### `data/assignments/assignment_X.json`
Detailed analysis for a specific assignment.

```json
{
  "assignment_id": "string",
  "title": "string",
  "course_id": "string",
  "due_date": "YYYY-MM-DD",
  "total_submissions": "number",
  "graded": "number",
  "average_score": "number",  // 0-100
  "questions": [
    {
      "question_number": "number",
      "title": "string",
      "max_points": "number",
      "average_score": "number",
      "difficulty": "easy|medium|hard",
      "common_mistakes": ["string"]
    }
  ],
  "topic_alignment": [
    {
      "topic": "string",
      "lecture_coverage": ["string"],  // Lecture IDs
      "alignment_score": "number"      // 0-100
    }
  ],
  "feedback_summary": "string"
}
```

## Students

### `data/students/understanding_metrics.json`
Student understanding metrics for a course.

```json
{
  "course_id": "string",
  "overall_understanding": {
    "average_score": "number",    // 0-100
    "trend": "improving|stable|declining",
    "last_updated": "YYYY-MM-DD"
  },
  "topics": [
    {
      "name": "string",
      "understanding_score": "number",  // 0-100
      "status": "strong|moderate|struggling",
      "lectures_covered": ["string"]    // Lecture IDs
    }
  ],
  "graph_data": {
    "labels": ["string"],  // X-axis labels (e.g., weeks)
    "datasets": [
      {
        "label": "string",
        "data": ["number"],     // Y-axis values
        "color": "string"       // Hex color code
      }
    ]
  }
}
```

## Settings

### `data/settings/user_preferences.json`
User profile and application settings.

```json
{
  "user": {
    "name": "string",
    "email": "string",
    "institution": "string"
  },
  "preferences": {
    "theme": "spring|ocean|twilight",
    "notifications_enabled": "boolean",
    "auto_analyze_lectures": "boolean",
    "weekly_summary_email": "boolean"
  },
  "available_themes": [
    {
      "id": "string",
      "name": "string",
      "colors": {
        "primary": "string",    // Hex color
        "secondary": "string"   // Hex color
      }
    }
  ]
}
```

## Backend Output Files

These files are generated by the Python backend.

### `backend/transcript.json`
Word-level transcript with confidence scores.

```json
[
  {
    "start": "number",      // Start time in seconds
    "end": "number",        // End time in seconds
    "text": "string",       // Word or phrase
    "conf": "number"        // Confidence score (0-1)
  }
]
```

### `backend/segments.json`
Segmented lecture portions with metrics.

```json
[
  {
    "start": "number",
    "end": "number",
    "text": "string",               // Segment text
    "speech_rate": "number",       // Words per second
    "lexical_diversity": "number", // 0-1
    "silence_ratio": "number",     // 0-1
    "asr_confidence": "number"     // 0-1
  }
]
```

### `backend/lecture_result.json`
Complete analysis results with clarity labels.

```json
{
  "lecture_id": "string",
  "segments": [
    {
      "start": "number",
      "end": "number",
      "text": "string",
      "speech_rate": "number",
      "lexical_diversity": "number",
      "silence_ratio": "number",
      "asr_confidence": "number",
      "label": "Clear|Unclear",
      "reason": "string"
    }
  ],
  "summary": {
    "counts": {
      "Clear": "number",
      "Unclear": "number"
    }
  }
}
```

## Data Types Reference

- **string**: Text value
- **number**: Numeric value (integer or float)
- **boolean**: true or false
- **YYYY-MM-DD**: Date string (ISO 8601)
- **null**: Explicitly null value (vs undefined)
- **array**: List of values `[]`
- **object**: Key-value pairs `{}`

## Validation Rules

1. **IDs**: Must be unique within their scope
2. **Percentages**: 0-100 inclusive
3. **Scores**: 0-100 inclusive
4. **Dates**: ISO 8601 format (YYYY-MM-DD)
5. **Status enums**: Must match defined values exactly
6. **Required fields**: All fields shown are required unless marked `|null`
