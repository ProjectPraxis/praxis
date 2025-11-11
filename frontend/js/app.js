/**
 * Main Application Controller
 * Orchestrates data loading and UI rendering
 */
class PraxisApp {
    constructor() {
        this.dataService = new DataService();
        this.templateLoader = new TemplateLoader();
        this.router = null;
        this.currentCourse = null;
        this.currentLecture = null;
    }

    async init() {
        console.log('Initializing Praxis App...');
        
        // Initialize app state
        window.AppState.init();
        
        // Load core components
        await this.loadCoreComponents();
        
        // Initialize router
        window.Router.init();
        
        // Load user preferences and apply theme
        await this.loadUserPreferences();
        
        // Load initial screen data
        await this.loadHomeDashboard();
        
        // Set up global event listeners
        this.setupEventListeners();
    }

    async loadCoreComponents() {
        // Components are already in the DOM, no need to load
        // This method can be used for future dynamic component loading
        console.log('Core components loaded');
    }

    setupEventListeners() {
        // Set up any global event listeners here
        // Modal close on ESC key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                window.ModalManager.hideAll();
            }
        });
    }

    async loadUserPreferences() {
        const prefs = await this.dataService.getUserPreferences();
        if (prefs) {
            // Apply theme
            window.AppState.setTheme(`theme-${prefs.preferences.theme}`);
        }
    }

    async loadHomeDashboard() {
        const coursesData = await this.dataService.getAllCourses();
        if (!coursesData) return;

        const coursesContainer = document.getElementById('courses-container');
        if (coursesContainer) {
            coursesContainer.innerHTML = coursesData.courses
                .map(course => UIComponents.renderCourseCard(course))
                .join('');
        }
    }

    async loadCourseOverview() {
        const overview = await this.dataService.getCourseOverview('601.486/686');
        if (!overview) return;

        this.currentCourse = overview;

        // Render priority actions
        const actionsContainer = document.getElementById('priority-actions-container');
        if (actionsContainer) {
            actionsContainer.innerHTML = overview.priority_actions
                .map(action => UIComponents.renderPriorityAction(action))
                .join('');
        }

        // Render student understanding topics
        const metricsData = await this.dataService.getStudentMetrics(overview.course_id);
        if (metricsData) {
            const topicsContainer = document.getElementById('understanding-topics-container');
            if (topicsContainer) {
                topicsContainer.innerHTML = metricsData.topics
                    .map(topic => UIComponents.renderTopicPill(topic))
                    .join('');
            }
        }

        // Render general feedback
        const sustainsContainer = document.getElementById('sustains-container');
        const improvesContainer = document.getElementById('improves-container');
        
        if (sustainsContainer) {
            sustainsContainer.innerHTML = UIComponents.renderFeedbackSection(
                'Sustains', 
                overview.general_feedback.sustains,
                'sustains'
            );
        }
        
        if (improvesContainer) {
            improvesContainer.innerHTML = UIComponents.renderFeedbackSection(
                'Improves',
                overview.general_feedback.improves,
                'improves'
            );
        }
    }

    async loadLectureAnalysis(lectureId = 'lecture_3') {
        const analysis = await this.dataService.getLectureAnalysis(lectureId);
        if (!analysis) return;

        this.currentLecture = analysis;

        // Render insights timeline
        const insightsContainer = document.getElementById('lecture-insights-container');
        if (insightsContainer) {
            insightsContainer.innerHTML = analysis.insights
                .map(insight => UIComponents.renderInsightCard(insight))
                .join('');
        }

        // Render topics covered
        const topicsContainer = document.getElementById('lecture-topics-container');
        if (topicsContainer) {
            topicsContainer.innerHTML = analysis.topics_covered
                .map(topic => UIComponents.renderTopicPill(topic))
                .join('');
        }

        // Update scores
        this.updateScoreDisplay('clarity-score', analysis.overall_clarity_score);
        this.updateScoreDisplay('engagement-score', analysis.student_engagement_score);
        this.updateScoreDisplay('pacing-score', analysis.pacing_score);
    }

    async loadAssignmentAnalysis(assignmentId = 'hw1') {
        const assignment = await this.dataService.getAssignment(assignmentId);
        if (!assignment) return;

        // Render assignment details
        console.log('Loaded assignment:', assignment);
    }

    updateScoreDisplay(elementId, score) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = score;
        }
    }
}

// Initialize app when DOM is ready
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new PraxisApp();
    app.init();
});

// Export for global access
window.PraxisApp = PraxisApp;
