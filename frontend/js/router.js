/**
 * Router
 * Handles navigation between screens and manages browser history
 */
class Router {
    constructor(templateLoader) {
        this.templateLoader = templateLoader;
        this.currentScreen = null;
        this.history = [];
        this.screens = new Map();
        this.activeSidebarLink = null;
        this.activeTabButton = null;
    }

    init() {
        // Set up navigation click handlers
        this.setupNavigation();
        this.setupBackButton();
        
        // Load initial screen
        this.navigateTo('screen-home-dashboard', document.getElementById('nav-home'));
    }

    setupNavigation() {
        // Add click handlers to all sidebar links
        document.querySelectorAll('.sidebar-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const screenId = link.getAttribute('data-screen');
                this.navigateTo(screenId, link);
            });
        });
    }

    setupBackButton() {
        const backButton = document.getElementById('history-back-button');
        if (backButton) {
            backButton.addEventListener('click', () => {
                this.goBack();
            });
        }
    }

    navigateTo(screenId, navElement = null) {
        // Hide all screens
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.add('hidden');
        });

        // Show target screen
        const targetScreen = document.getElementById(screenId);
        if (targetScreen) {
            targetScreen.classList.remove('hidden');
            
            // Add to history
            if (this.currentScreen !== screenId) {
                this.history.push(this.currentScreen);
                this.currentScreen = screenId;
            }
        }

        // Update active sidebar link
        if (navElement && navElement.classList.contains('sidebar-link')) {
            if (this.activeSidebarLink) {
                this.activeSidebarLink.classList.remove('active');
            }
            navElement.classList.add('active');
            this.activeSidebarLink = navElement;
        }

        // Reset to first tab if navigating to course hub
        if (screenId === 'screen-course-hub') {
            this.showTab('tab-overview', document.getElementById('tab-btn-overview'));
        }

        // Reset insight panel when navigating to lecture analysis
        if (screenId === 'screen-lecture-analysis' && window.showAllInsights) {
            window.showAllInsights();
        }

        // Scroll to top
        window.scrollTo(0, 0);
    }

    goBack() {
        if (this.history.length > 0) {
            const previousScreen = this.history.pop();
            if (previousScreen) {
                const navElement = document.querySelector(`[data-screen="${previousScreen}"]`);
                this.navigateTo(previousScreen, navElement);
            }
        } else {
            // Default to home
            this.navigateTo('screen-home-dashboard', document.getElementById('nav-home'));
        }
    }

    showTab(tabId, tabElement) {
        // Hide all tab content
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.add('hidden');
        });
        
        // Deactivate all tab buttons
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.remove('active');
        });

        // Show target tab
        const targetTab = document.getElementById(tabId);
        if (targetTab) {
            targetTab.classList.remove('hidden');
        }
        
        // Activate tab button
        if (tabElement) {
            tabElement.classList.add('active');
            this.activeTabButton = tabElement;
        }
    }
}

/**
 * Modal Manager - Handles modal dialogs
 */
class ModalManager {
    constructor() {
        this.activeModals = new Set();
    }

    /**
     * Show a modal
     * @param {string} modalId - ID of the modal to show
     */
    show(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('hidden');
            this.activeModals.add(modalId);
            
            // Prevent body scroll
            document.body.style.overflow = 'hidden';
        }
    }

    /**
     * Hide a modal
     * @param {string} modalId - ID of the modal to hide
     */
    hide(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('hidden');
            this.activeModals.delete(modalId);
            
            // Restore body scroll if no modals are open
            if (this.activeModals.size === 0) {
                document.body.style.overflow = '';
            }
        }
    }

    /**
     * Hide all modals
     */
    hideAll() {
        this.activeModals.forEach(modalId => this.hide(modalId));
    }

    /**
     * Show PDF modal with URL
     * @param {string} pdfUrl - URL of the PDF to display
     */
    showPdf(pdfUrl) {
        const iframe = document.getElementById('pdf-iframe');
        if (iframe) {
            iframe.src = pdfUrl;
        }
        this.show('modal-pdf-viewer');
    }
}

/**
 * App State Manager - Manages application state
 */
class AppStateManager {
    constructor() {
        this.originalInsightHTML = '';
        this.originalInsightTitle = '';
        this.currentTheme = 'theme-spring';
        this.currentView = 'pill'; // pill or graph
    }

    /**
     * Initialize state from DOM
     */
    init() {
        const insightContent = document.getElementById('insight-content');
        const insightTitle = document.getElementById('dynamic-insight-panel-title');
        
        if (insightContent) {
            this.originalInsightHTML = insightContent.innerHTML;
        }
        if (insightTitle) {
            this.originalInsightTitle = insightTitle.innerHTML;
        }
    }

    /**
     * Reset insight panel to original state
     */
    resetInsightPanel() {
        const panel = document.getElementById('insight-content');
        const title = document.getElementById('dynamic-insight-panel-title');
        
        if (panel && this.originalInsightHTML) {
            panel.innerHTML = this.originalInsightHTML;
        }
        if (title && this.originalInsightTitle) {
            title.innerHTML = this.originalInsightTitle;
        }
    }

    /**
     * Set app theme
     * @param {string} themeName - Name of the theme class
     */
    setTheme(themeName) {
        const appContainer = document.getElementById('app-container');
        const themes = ['theme-spring', 'theme-ocean', 'theme-twilight'];
        
        if (appContainer) {
            themes.forEach(theme => appContainer.classList.remove(theme));
            appContainer.classList.add(themeName);
            this.currentTheme = themeName;
        }
    }

    /**
     * Toggle between pill and graph view
     * @param {string} viewType - 'pill' or 'graph'
     */
    toggleView(viewType) {
        if (viewType === 'pill') {
            document.getElementById('pill-view')?.classList.remove('hidden');
            document.getElementById('knowledge-graph-view')?.classList.add('hidden');
            document.getElementById('view-btn-pill')?.classList.add('active');
            document.getElementById('view-btn-graph')?.classList.remove('active');
        } else {
            document.getElementById('pill-view')?.classList.add('hidden');
            document.getElementById('knowledge-graph-view')?.classList.remove('hidden');
            document.getElementById('view-btn-pill')?.classList.remove('active');
            document.getElementById('view-btn-graph')?.classList.add('active');
        }
        this.currentView = viewType;
    }
}

// Create global instances
window.Router = new Router();
window.ModalManager = new ModalManager();
window.AppState = new AppStateManager();

// Global helper functions for backward compatibility
window.showScreen = (screenId, navElement) => window.Router.navigateTo(screenId, navElement);
window.showTab = (tabId, tabElement) => window.Router.showTab(tabId, tabElement);
window.showModal = (modalId) => window.ModalManager.show(modalId);
window.hideModal = (modalId) => window.ModalManager.hide(modalId);
window.showPdfModal = (pdfUrl) => window.ModalManager.showPdf(pdfUrl);
window.setTheme = (themeName) => window.AppState.setTheme(themeName);
window.toggleCourseView = (viewType) => window.AppState.toggleView(viewType);
