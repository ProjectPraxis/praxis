/**
 * Configuration file for the Praxis application
 * Centralized place for all configuration settings
 */
const Config = {
    // API/Data endpoints
    dataBasePath: '',
    
    // Default values
    defaultCourse: '601.486/686',
    defaultTheme: 'spring',
    
    // UI Settings
    animationDuration: 300,
    toastDuration: 3000,
    
    // Data refresh intervals (in milliseconds)
    refreshIntervals: {
        lectures: 300000,  // 5 minutes
        assignments: 600000, // 10 minutes
        metrics: 300000     // 5 minutes
    },
    
    // Feature flags
    features: {
        autoAnalysis: true,
        notifications: true,
        printReports: true
    },
    
    // Color schemes for themes
    themes: {
        spring: {
            primary: '#10B981',
            secondary: '#F59E0B'
        },
        ocean: {
            primary: '#0EA5E9',
            secondary: '#3B82F6'
        },
        twilight: {
            primary: '#6366F1',
            secondary: '#A855F7'
        }
    }
};

window.Config = Config;
