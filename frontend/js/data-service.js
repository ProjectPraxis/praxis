/**
 * Data Service - Handles all data fetching from JSON files
 * This is the only place that knows about data sources
 */
class DataService {
    constructor(baseUrl = '') {
        this.baseUrl = baseUrl;
        this.cache = {};
    }

    async fetchJSON(path) {
        if (this.cache[path]) {
            return this.cache[path];
        }
        
        try {
            const response = await fetch(`${this.baseUrl}${path}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch ${path}`);
            }
            const data = await response.json();
            this.cache[path] = data;
            return data;
        } catch (error) {
            console.error(`Error fetching ${path}:`, error);
            return null;
        }
    }

    // Course data
    async getAllCourses() {
        return await this.fetchJSON('data/courses/all_courses.json');
    }

    async getCourseOverview(courseId) {
        return await this.fetchJSON('data/courses/course_overview.json');
    }

    // Lecture data
    async getAllLectures() {
        return await this.fetchJSON('data/lectures/all_lectures.json');
    }

    async getLectureAnalysis(lectureId) {
        return await this.fetchJSON(`data/lectures/${lectureId}_analysis.json`);
    }

    async getLectureSegments(lectureId) {
        return await this.fetchJSON('backend/segments.json');
    }

    async getLectureTranscript(lectureId) {
        return await this.fetchJSON('backend/transcript.json');
    }

    async getLectureResult(lectureId) {
        return await this.fetchJSON('backend/lecture_result.json');
    }

    // Student data
    async getStudentMetrics(courseId) {
        return await this.fetchJSON('data/students/understanding_metrics.json');
    }

    // Assignment data
    async getAllAssignments() {
        return await this.fetchJSON('data/assignments/all_assignments.json');
    }

    async getAssignment(assignmentId) {
        return await this.fetchJSON(`data/assignments/${assignmentId}.json`);
    }

    // Settings
    async getUserPreferences() {
        return await this.fetchJSON('data/settings/user_preferences.json');
    }

    // Clear cache if needed
    clearCache() {
        this.cache = {};
    }
}

// Export for use in other modules
window.DataService = DataService;
