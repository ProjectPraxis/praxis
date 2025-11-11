/**
 * Template Loader
 * Handles loading and caching of HTML template components
 */
class TemplateLoader {
    constructor() {
        this.cache = new Map();
        this.baseUrl = 'frontend/components/';
    }

    async loadTemplate(templatePath) {
        // Check cache first
        if (this.cache.has(templatePath)) {
            return this.cache.get(templatePath);
        }

        try {
            const response = await fetch(this.baseUrl + templatePath);
            if (!response.ok) {
                throw new Error(`Failed to load template: ${templatePath}`);
            }
            const html = await response.text();
            this.cache.set(templatePath, html);
            return html;
        } catch (error) {
            console.error('Template loading error:', error);
            return '';
        }
    }

    async loadComponent(containerId, templatePath) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`Container not found: ${containerId}`);
            return;
        }

        const html = await this.loadTemplate(templatePath);
        container.innerHTML = html;
    }

    clearCache() {
        this.cache.clear();
    }
}

// Export for global access
window.TemplateLoader = TemplateLoader;
