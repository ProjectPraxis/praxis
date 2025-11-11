# Project Praxis - Architecture Documentation

## 🏗️ Modular Architecture Overview

This project follows a **highly modular, scalable architecture** that separates concerns into:

1. **Frontend** - Stable, reusable UI components and logic
2. **Data Layer** - JSON files that emulate backend responses
3. **Backend** - Python processing scripts (ASR, clarity analysis, etc.)

---

## 📁 File Structure

```
praxis/
├── index.html                  # Original monolithic file (1000+ lines) - DEPRECATED
├── index.minimal.html          # NEW: Minimal entry point (~150 lines)
├── ARCHITECTURE.md             # This file
├── DATA_SCHEMA.md              # Data structure documentation
├── README.md                   # User guide
│
├── frontend/                   # Frontend code (stable & reusable)
│   ├── css/
│   │   └── styles.css          # All CSS extracted from inline styles
│   │
│   ├── js/                     # JavaScript modules
│   │   ├── config.js           # Configuration & API endpoints
│   │   ├── router.js           # Navigation & routing system
│   │   ├── template-loader.js  # Dynamic template loading
│   │   ├── data-service.js     # Data fetching from JSON files
│   │   ├── ui-components.js    # Reusable rendering functions
│   │   ├── utils.js            # Helper functions
│   │   └── app.js              # Main application controller
│   │
│   ├── templates/              # HTML templates (not yet created - optional)
│   │   ├── screens/            # Screen templates
│   │   ├── modals/             # Modal templates
│   │   └── components/         # Reusable component templates
│   │
│   └── components/             # Future: Web Components
│
├── data/                       # JSON data (emulates backend)
│   ├── courses/
│   │   ├── all_courses.json
│   │   └── course_overview.json
│   ├── lectures/
│   │   ├── all_lectures.json
│   │   └── lecture_3_analysis.json
│   ├── assignments/
│   │   ├── all_assignments.json
│   │   ├── assignment_1.json
│   │   └── assignment_2.json
│   ├── students/
│   │   └── understanding_metrics.json
│   └── settings/
│       └── user_preferences.json
│
└── backend/                    # Python processing scripts
    ├── asr.py                  # Automatic Speech Recognition
    ├── clarity.py              # Clarity analysis
    ├── segmenter.py            # Lecture segmentation
    ├── metrics_analyzer.py     # Analytics
    ├── requirements.txt        # Python dependencies
    └── README.md               # Backend documentation
```

---

## 🎯 Key Design Principles

### 1. **Separation of Concerns**
- **Presentation** (HTML) - Minimal, loads dynamically
- **Styling** (CSS) - All in `styles.css`
- **Logic** (JavaScript) - Modular, organized by function
- **Data** (JSON) - Completely separate from code

### 2. **Stable Frontend**
- All UI components in `ui-components.js` are **reusable**
- No hardcoded data in frontend code
- Changes to data don't require code changes

### 3. **Scalability**
- Easy to add new screens, components, or features
- Clear module boundaries
- Template system ready for large-scale apps

---

## 🔄 Data Flow

```
User Interaction
      ↓
  Router (router.js)
      ↓
  DataService (data-service.js)
      ↓
  JSON Files (data/)
      ↓
  UIComponents (ui-components.js)
      ↓
  DOM Update
```

### Example: Loading Course Data

```javascript
// 1. User clicks "Courses"
showScreen('screen-course-hub', navElement);

// 2. Router navigates
Router.navigateTo('screen-course-hub', navElement);

// 3. Screen needs data
const courses = await DataService.getCourses();

// 4. DataService fetches from JSON
fetch('data/courses/all_courses.json')

// 5. UIComponents renders
const html = courses.map(c => UIComponents.renderCourseCard(c));

// 6. DOM is updated
container.innerHTML = html;
```

---

## 📦 Module Descriptions

### Frontend Modules

#### **config.js**
- API endpoints configuration
- Environment variables
- Feature flags

#### **router.js**
- **Router**: Handles screen navigation & history
- **ModalManager**: Manages modal dialogs
- **AppStateManager**: Global application state

#### **template-loader.js**
- Dynamically loads HTML templates (optional)
- Caches templates for performance
- Handles template rendering with data

#### **data-service.js**
- **DataService**: Centralized data fetching
- Abstracts JSON file locations
- Ready to swap with real API calls

#### **ui-components.js**
- **UIComponents**: Reusable rendering functions
- Pure functions (no side effects)
- Examples:
  - `renderCourseCard(course)`
  - `renderPriorityAction(action)`
  - `renderTopicPill(topic)`

#### **utils.js**
- Interactive utility functions
- Examples:
  - `showTopicDetail()`
  - `showInsight()`
  - `addManualTopic()`
  - `printRewindReport()`

#### **app.js**
- **PraxisApp**: Main application controller
- Initializes all systems
- Sets up global event listeners
- Orchestrates modules

---

## 🎨 Styling Strategy

### CSS Organization
All styles in `frontend/css/styles.css`:

```css
/* Base styles */
body { ... }

/* CSS Variables for theming */
:root {
  --grad-1: #10B981;
  --grad-2: #F59E0B;
}

/* Component styles */
.sidebar-link { ... }
.timeline-track { ... }
.tab-button { ... }

/* Utility classes */
.primary-gradient { ... }
.primary-gradient-text { ... }
```

### Theme System
- CSS variables for easy theming
- Three built-in themes: Spring, Ocean, Twilight
- Change theme: `AppState.setTheme('theme-ocean')`

---

## 🚀 Migration from Monolithic to Modular

### What Changed

| Before | After |
|--------|-------|
| 1000+ line index.html | 150 line index.minimal.html |
| Inline `<style>` tags | `styles.css` |
| Inline `<script>` tags | Modular JS files |
| Hardcoded data | JSON data files |
| No routing | Router system |
| No state management | AppStateManager |

### Benefits

✅ **Maintainability**: Easy to find and modify code  
✅ **Scalability**: Add features without breaking existing code  
✅ **Testability**: Modules can be unit tested  
✅ **Reusability**: UI components work across screens  
✅ **Performance**: Templates & data can be cached  
✅ **Collaboration**: Team members can work on different modules  

---

## 🔮 Future Enhancements

### Template System (Optional)
Extract all screen HTML into separate files:
```
frontend/templates/screens/
  ├── home.html
  ├── course-hub.html
  ├── lecture-analysis.html
  └── settings.html
```

Load dynamically:
```javascript
await TemplateLoader.loadInto('screens/home.html', '#screen-container');
```

### Web Components
Create custom elements:
```javascript
<praxis-course-card course-id="123"></praxis-course-card>
<praxis-topic-pill topic="Data Shift" status="struggling"></praxis-topic-pill>
```

### Backend Integration
Update `config.js`:
```javascript
const API_CONFIG = {
  BASE_URL: 'https://api.praxis.edu',
  ENDPOINTS: {
    COURSES: '/api/v1/courses',
    LECTURES: '/api/v1/lectures'
  }
};
```

---

## 📝 Development Workflow

### Adding a New Screen

1. **Update Router** (if needed)
2. **Create Data JSON** in `data/`
3. **Add Method to DataService** in `data-service.js`
4. **Create Render Function** in `ui-components.js`
5. **Add HTML** to index or template file
6. **Wire Navigation** in existing screens

### Adding a New Feature

1. **Define Data Structure** in relevant JSON
2. **Create Rendering Logic** in `ui-components.js`
3. **Add Interactivity** in `utils.js` or `app.js`
4. **Style** in `styles.css`

---

## 🧪 Testing Strategy

### Manual Testing
1. Open `index.minimal.html` in browser
2. Use local server for JSON loading:
   ```bash
   python -m http.server 8000
   ```
3. Navigate to `http://localhost:8000/index.minimal.html`

### Future: Automated Testing
- **Unit Tests**: Test `UIComponents`, `DataService` modules
- **Integration Tests**: Test routing, data flow
- **E2E Tests**: Test user workflows with Playwright/Cypress

---

## 📚 Related Documentation

- **DATA_SCHEMA.md** - Detailed data structure documentation
- **README.md** - User guide and setup instructions
- **backend/README.md** - Backend processing documentation

---

## 👥 Contributing

When adding features:
1. Follow the modular architecture
2. Keep data separate from presentation
3. Document data structures in DATA_SCHEMA.md
4. Add JSDoc comments to functions
5. Test in multiple browsers

---

**Last Updated**: 2025-11-02  
**Version**: 2.0 (Modular Architecture)
