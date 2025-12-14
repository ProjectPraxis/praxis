"""
MongoDB database connection and configuration
"""
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient
from typing import Optional
import os
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime

# Load environment variables
ENV_PATH = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=ENV_PATH)

# MongoDB connection settings
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
MONGODB_DB_NAME = os.getenv("MONGODB_DB_NAME", "Praxis")

# Global client and database instances
client: Optional[AsyncIOMotorClient] = None
db = None


async def connect_to_mongo():
    """Create database connection"""
    global client, db
    
    try:
        # Use permissive TLS settings for older SSL libraries
        client = AsyncIOMotorClient(
            MONGODB_URL,
            tls=True,
            tlsAllowInvalidCertificates=True,
            tlsAllowInvalidHostnames=True
        )
        db = client[MONGODB_DB_NAME]
        # Test the connection
        await client.admin.command('ping')
        print(f"Connected to MongoDB: {MONGODB_DB_NAME}")
        return db
    except Exception as e:
        print(f"Error connecting to MongoDB: {e}")
        raise


async def close_mongo_connection():
    """Close database connection"""
    global client
    if client:
        client.close()
        print("MongoDB connection closed")


def get_database():
    """Get database instance"""
    if db is None:
        raise RuntimeError("Database not connected. Call connect_to_mongo() first.")
    return db


# Collections
def get_classes_collection():
    """Get classes collection"""
    return get_database()["classes"]


def get_lectures_collection():
    """Get lectures collection"""
    return get_database()["lectures"]


def get_surveys_collection():
    """Get surveys collection"""
    return get_database()["surveys"]


def get_survey_responses_collection():
    """Get survey responses collection"""
    return get_database()["survey_responses"]


def get_assignments_collection():
    """Get assignments collection"""
    return get_database()["assignments"]


def get_feedback_collection():
    """Get professor feedback collection"""
    return get_database()["feedback"]


def get_analyses_collection():
    """Get analyses collection"""
    return get_database()["analyses"]


def get_materials_analyses_collection():
    """Get materials analyses collection"""
    return get_database()["materials_analyses"]


async def save_analysis_to_db(lecture_id: str, analysis_data: dict) -> str:
    """Save analysis result to MongoDB"""
    collection = get_analyses_collection()
    doc = {
        "lecture_id": lecture_id,
        "analysis_data": analysis_data,
        "created_at": datetime.now().isoformat()
    }
    # Use upsert to update if exists, insert if not
    await collection.update_one(
        {"lecture_id": lecture_id},
        {"$set": doc},
        upsert=True
    )
    return lecture_id


async def get_analysis_from_db(lecture_id: str) -> Optional[dict]:
    """Get analysis result from MongoDB"""
    collection = get_analyses_collection()
    doc = await collection.find_one({"lecture_id": lecture_id})
    return doc


async def save_materials_analysis_to_db(lecture_id: str, analysis_data: dict) -> str:
    """Save materials analysis result to MongoDB"""
    collection = get_materials_analyses_collection()
    doc = {
        "lecture_id": lecture_id,
        "analysis_data": analysis_data,
        "created_at": datetime.now().isoformat()
    }
    await collection.update_one(
        {"lecture_id": lecture_id},
        {"$set": doc},
        upsert=True
    )
    return lecture_id


async def get_materials_analysis_doc(lecture_id: str) -> Optional[dict]:
    """Get materials analysis from MongoDB"""
    collection = get_materials_analyses_collection()
    doc = await collection.find_one({"lecture_id": lecture_id})
    return doc


async def save_survey_to_db(survey_id: str, survey_data: dict) -> str:
    """Save survey to MongoDB"""
    collection = get_surveys_collection()
    doc = {
        "_id": survey_id,
        "survey_data": survey_data,
        "created_at": datetime.now().isoformat()
    }
    await collection.update_one(
        {"_id": survey_id},
        {"$set": doc},
        upsert=True
    )
    return survey_id


async def get_survey_from_db(survey_id: str) -> Optional[dict]:
    """Get survey from MongoDB"""
    collection = get_surveys_collection()
    doc = await collection.find_one({"_id": survey_id})
    return doc

