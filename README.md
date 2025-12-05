# Project Praxis

An AI-powered teaching assistant that helps instructors analyze lecture content, track student understanding, and improve course delivery.

## Features

- 📊 **Dynamic Course Overview** - Aggregated topic coverage and student understanding across all lectures
- 🎥 **Lecture Video Analysis** - AI-powered analysis of lecture videos using Google Gemini
- 📑 **Materials Analysis** - Extract topics and get feedback on lecture slides/PDFs
- 📈 **Topic Tracking** - Visualize which topics are covered vs planned
- 🎯 **Action Items** - AI-generated recommendations based on lecture analysis

## Quick Start

### Prerequisites

- Python 3.9+
- Node.js (optional, for development)
- Google Gemini API key ([Get one here](https://aistudio.google.com/app/apikey))

### 1. Clone and Setup

```bash
git clone https://github.com/ProjectPraxis/praxis.git
cd praxis
git checkout yogee-changes
```

### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure API key
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY
```

### 3. Start the Servers

**Terminal 1 - Backend API (port 8001):**
```bash
cd backend
./start_api.sh
```

**Terminal 2 - Frontend (port 8000):**
```bash
# From project root
python3 -m http.server 8000
```

### 4. Open the App

Navigate to: **http://localhost:8000**

## Project Structure

```
praxis/
├── backend/
│   ├── api.py              # FastAPI server
│   ├── gemini_analysis.py  # Gemini AI integration
│   ├── .env                # API keys (create from .env.example)
│   └── requirements.txt    # Python dependencies
├── screens/                # HTML screen templates
├── modals/                 # Modal dialog templates
├── app.js                  # Frontend JavaScript
├── style.css               # Styles
└── index.html              # Entry point
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/classes` | List all courses |
| GET | `/api/classes/{id}/overview` | Get aggregated course overview |
| GET | `/api/lectures` | List lectures (optionally filter by class_id) |
| POST | `/api/lectures/{id}/analyze-materials` | Analyze lecture slides |
| POST | `/api/lectures/{id}/analyze-video` | Analyze lecture video |

## Notes

- **PDF Size Limit**: Gemini API has a file size limit. Keep PDFs under ~30MB for reliable analysis.
- **Supported Models**: Uses `gemini-2.5-flash` by default (fast and capable)

## Branch: yogee-changes

This branch includes:
- ✅ Dynamic Overview tab (Student Understanding, Course Coverage, Action Items)
- ✅ Secure API key handling via environment variables
- ✅ Updated Gemini model configuration