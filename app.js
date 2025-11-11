// --- Globals ---
const appContainer = document.getElementById('app-container');
const themes = ['theme-spring', 'theme-ocean', 'theme-twilight'];
let activeSidebarLink = null; // Set on DOMContentLoaded
let activeTabButton = null; // Set when tab is clicked or course hub loads

// Store for reflection panel state
let originalInsightHTML = '';
let originalInsightPanelTitle = '';

// --- Mappings for Fetching ---
const screenFileMap = {
    'screen-home-dashboard': 'home.html',
    'screen-course-hub': 'course-hub.html',
    'screen-lecture-analysis': 'lecture-analysis.html',
    'screen-lecture-planning': 'lecture-planning.html',
    'screen-lecture-edit': 'lecture-edit.html',
    'screen-assignments-hub': 'assignments-hub.html',
    'screen-student-trends': 'student-trends.html',
    'screen-settings': 'settings.html'
};

const modalFileMap = {
    'modal-hw1': 'hw1.html',
    'modal-pdf-viewer': 'pdf-viewer.html',
    'modal-lecture-rewind': 'lecture-rewind.html',
    'modal-topic-detail': 'topic-detail.html',
    'modal-add-class': 'add-class.html'
};

// --- DOMContentLoaded (Initialization) ---
document.addEventListener('DOMContentLoaded', () => {
    // Set the initial active link
    activeSidebarLink = document.getElementById('nav-home');
    
    // Load the home screen by default
    // We pass the activeSidebarLink so it remains 'active'
    showScreen('screen-home-dashboard', activeSidebarLink); 

    // Add listener for the history back button
    const historyBackButton = document.getElementById('history-back-button');
    if (historyBackButton) {
        historyBackButton.addEventListener('click', () => {
            // For this demo, we'll just go "home"
            showScreen('screen-home-dashboard', document.getElementById('nav-home'));
        });
    }
});

// --- Caching Function ---
function cacheOriginalInsights() {
    const insightContent = document.getElementById('insight-content');
    const insightTitle = document.getElementById('dynamic-insight-panel-title');
    if (insightContent) {
        originalInsightHTML = insightContent.innerHTML;
    }
    if (insightTitle) {
        originalInsightPanelTitle = insightTitle.innerHTML;
    }
}

// --- NEW Fetch-based Navigation ---

/**
 * Fetches and displays a screen.
 * @param {string} screenId - The ID of the screen to show (e.g., 'screen-home-dashboard').
 * @param {HTMLElement} navElement - The sidebar link that was clicked.
 */
async function showScreen(screenId, navElement) {
    const screenFile = screenFileMap[screenId];
    if (!screenFile) {
        console.error('Unknown screen ID:', screenId);
        return;
    }

    try {
        // Fetch the new screen content
        const response = await fetch(`./screens/${screenFile}`);
        if (!response.ok) throw new Error(`Failed to load ${screenFile}`);
        const html = await response.text();
        
        // Inject the content
        const mainContainer = document.getElementById('main-content-container');
        mainContainer.innerHTML = html;

        // Update sidebar active state
        if (navElement && navElement.classList.contains('sidebar-link')) {
            if (activeSidebarLink) {
                activeSidebarLink.classList.remove('active');
            }
            navElement.classList.add('active');
            activeSidebarLink = navElement;
        }
        
        // --- Handle screen-specific initializations ---
        
        // Reset to first tab if navigating to course hub
        if (screenId === 'screen-course-hub') {
            activeTabButton = document.getElementById('tab-btn-overview');
        }
        
        // Cache insights if we just loaded the lecture analysis screen
        if (screenId === 'screen-lecture-analysis') {
            cacheOriginalInsights();
        }
        
        // Scroll to top
        window.scrollTo(0, 0);

    } catch (error) {
        console.error('Error loading screen:', error);
        // You could show an error message to the user here
    }
}

/**
 * Fetches, appends, and displays a modal.
 * @param {string} modalId - The ID of the modal to show (e.g., 'modal-hw1').
 */
async function showModal(modalId) {
    const modalContainer = document.getElementById('modal-container');

    // Check if modal is already in DOM. If so, just show it.
    const existingModal = document.getElementById(modalId);
    if (existingModal) {
        // Special case: re-fetch content for topic detail modal
        if (modalId === 'modal-topic-detail') {
             // This modal is dynamic, so we don't just "show" it.
             // The showTopicDetail() function will handle its content.
        } else {
            existingModal.classList.remove('hidden');
            return;
        }
    }

    // If modal is not in DOM, fetch and append it
    // Exception: topic-detail is dynamic, not fetched.
    if (modalId === 'modal-topic-detail') {
        // Find or create the modal shell
        if (!existingModal) {
            const response = await fetch(`./modals/topic-detail.html`);
            if (!response.ok) throw new Error(`Failed to load topic-detail.html`);
            const html = await response.text();
            modalContainer.insertAdjacentHTML('beforeend', html);
        }
        // The showTopicDetail function will populate and show it.
        return; 
    }

    const modalFile = modalFileMap[modalId];
    if (modalFile) {
        try {
            const response = await fetch(`./modals/${modalFile}`);
            if (!response.ok) throw new Error(`Failed to load ${modalFile}`);
            const html = await response.text();
            
            // Append (not innerHTML) so we can have multiple modals
            modalContainer.insertAdjacentHTML('beforeend', html);
            
            // Find the newly added modal and remove 'hidden' class
            const newModal = document.getElementById(modalId);
            if (newModal) {
                newModal.classList.remove('hidden');
            }

        } catch (error)
        {
            console.error('Error loading modal:', error);
        }
    } else {
            console.error('Unknown modal ID:', modalId);
    }
}

// --- ORIGINAL FUNCTIONS (Copied from your script) ---
// These functions will work perfectly with the fetched content.

function setTheme(themeName) {
    themes.forEach(theme => appContainer.classList.remove(theme));
    appContainer.classList.add(themeName);
}

function showTab(tabId, tabElement) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.add('hidden');
    });
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.getElementById(tabId).classList.remove('hidden');
    tabElement.classList.add('active');
    activeTabButton = tabElement;
    
    // Refresh lectures list when lectures tab is shown
    if (tabId === 'tab-lectures') {
        refreshLecturesList();
    }
}

function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
    }
}

function showPdfModal(pdfUrl) {
    // In a real app, you'd set the src. Here we just show the modal.
    // document.getElementById('pdf-iframe').src = pdfUrl;
    
    // Check if pdf-viewer is in the DOM, if not, load it.
    if (!document.getElementById('modal-pdf-viewer')) {
        showModal('modal-pdf-viewer').then(() => {
            // Once loaded, you could update the title/iframe src
            // For now, we just show it.
        });
    } else {
        showModal('modal-pdf-viewer');
    }
}

// --- 
// --- 
// --- THIS IS THE CORRECTED FUNCTION ---
// --- 
// --- 
function showInsight(insightType) {
    const panel = document.getElementById('insight-content');
    const title = document.getElementById('dynamic-insight-panel-title');
    let content = '';
    let newTitle = 'AI Reflection';
    
    const backButton = `<button onclick="showAllInsights()" class="mb-4 -ml-1 text-sm font-semibold primary-gradient-text flex items-center gap-1 hover:opacity-80">
        <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
        All Reflections
        </button>`;
    
    switch (insightType) {
        case 'clarity':
            newTitle = 'Clarity Insight';
            content = `
                <li class="flex items-start gap-3">
                    <span class="flex-shrink-0 w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center mt-1"><svg class="w-5 h-5 text-yellow-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 0a12.06 12.06 0 004.5 0m-8.25 0a12.06 12.06 0 01-4.5 0m3.75 2.023a14.077 14.077 0 01-6.75 0" /></svg></span>
                    <div>
                        <h4 class="font-semibold text-gray-800">[00:50:07] Rushed Theory</h4>
                        <p class="text-gray-600">The definitions of dataset shift, covariate shift, and label shift were presented *extremely* rapidly. This is a high-risk area for student confusion.</p>
                        <p class="text-gray-600 mt-2 font-medium">Suggestion: Create a 5-minute recap video or handout that visually defines these terms.</p>
                    </div>
                </li>`;
            break;
        case 'question':
            newTitle = 'Interaction Insight';
            content = `
                <li class="flex items-start gap-3">
                    <span class="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center mt-1"><svg class="w-5 h-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" /></svg></span>
                    <div>
                        <h4 class="font-semibold text-gray-800">[00:10:59] Student Question</h4>
                        <p class="text-gray-600">LaRue asked if email open time could be used as a label for 'importance'.</p>
                    </div>
                </li>`;
            break;
        case 'answer':
            newTitle = 'Interaction Insight';
                content = `
                <li class="flex items-start gap-3">
                    <span class="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 flex items-center justify-center mt-1"><svg class="w-5 h-5 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg></span>
                    <div>
                        <h4 class="font-semibold text-gray-800">[00:11:09] Socratic Answer</h4>
                        <p class="text-gray-600">This was a model response. You validated the idea ("Great, okay...") and then used a Socratic question to lead the class to the problem ("What's the obvious problem with that?").</p>
                    </div>
                </li>`;
            break;
        case 'joke':
            newTitle = 'Positive Moment';
                content = `
                <li class="flex items-start gap-3">
                    <span class="flex-shrink-0 w-8 h-8 rounded-full bg-pink-100 flex items-center justify-center mt-1"><svg class="w-5 h-5 text-pink-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75s.168-.75.375.75.375.336.375.75zm-.75 0h.008v.008H9v-.008zm4.5 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375.75.375.336.375.75zm-.75 0h.008v.008H13.5v-.008z" /></svg></span>
                    <div>
                        <h4 class="font-semibold text-gray-800">[00:13:20] Good Joke</h4>
                        <p class="text-gray-600">The "I'm told kids today don't use email..." joke landed well. These moments are great for building rapport and making the content more engaging.</p>
                    </div>
                </li>`;
            break;
    }

    title.innerHTML = newTitle;
    panel.innerHTML = backButton + '<ul class="space-y-4">' + content + '</ul>';
}
// --- 
// --- 
// --- END OF CORRECTED FUNCTION ---
// --- 
// --- 

function showAllInsights() {
    const panel = document.getElementById('insight-content');
    const title = document.getElementById('dynamic-insight-panel-title');
    if (panel) {
        panel.innerHTML = originalInsightHTML;
    }
    if (title) {
        title.innerHTML = originalInsightPanelTitle;
    }
}

function toggleCourseView(viewType) {
    if (viewType === 'pill') {
        document.getElementById('pill-view').classList.remove('hidden');
        document.getElementById('knowledge-graph-view').classList.add('hidden');
        document.getElementById('view-btn-pill').classList.add('active');
        document.getElementById('view-btn-graph').classList.remove('active');
    } else {
        document.getElementById('pill-view').classList.add('hidden');
        document.getElementById('knowledge-graph-view').classList.remove('hidden');
        document.getElementById('view-btn-pill').classList.remove('active');
        document.getElementById('view-btn-graph').classList.add('active');
    }
}

function addManualTopic() {
    const input = document.getElementById('manual-topic-input');
    const list = document.getElementById('manual-topic-list');
    const topicName = input.value.trim();
    
    if (topicName) {
        const newPill = document.createElement('div');
        newPill.className = "py-3 px-5 rounded-full text-gray-700 font-medium bg-gray-200 border border-gray-300";
        newPill.textContent = topicName;
        list.appendChild(newPill);
        input.value = '';
    }
}

function printRewindReport() {
    window.print();
}

function toggleVisibility(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.classList.toggle('hidden');
    }
}

async function showTopicDetail(topicName, status, buttonElement) {
    // Ensure the modal shell is loaded
    await showModal('modal-topic-detail'); 

    const modal = document.getElementById('modal-topic-detail');
    const content = document.getElementById('topic-detail-content');
    
    let statusColorClass = '';
    switch (status) {
        case 'Strong': statusColorClass = 'bg-green-500'; break;
        case 'Developing': statusColorClass = 'bg-yellow-500'; break;
        case 'Struggling': statusColorClass = 'bg-red-500'; break;
        default: statusColorClass = 'bg-gray-500';
    }

    // Placeholders
    let keyConcepts = "AI should fetch brief definition from lecture notes/summary for this topic.";
    let examples = "AI should fetch examples related to this topic from lectures, e.g., COMPAS for Fairness.";
    let lectureMoments = "AI should list relevant slides/timestamps. E.g., Lecture 4, Slides 47-51 for Data Shift.";
    let assignmentConnections = "AI should list connections to assignments. E.g., A2 Data Section for Data Source Selection.";
    let aiReflection = "AI add brief note on common student misconceptions or teaching tips for this topic.";

    // Specific Examples from Prompt
    if (topicName.includes('Data Shift')) {
        lectureMoments = "Lecture 4, Slides 47-51. <br><strong>Note:</strong> This section was identified as rushed in the lecture analysis, potentially impacting comprehension.";
        aiReflection = "<strong>Common confusion:</strong> Differentiating when P(x) changes (covariate) vs. when P(y) changes (label) vs. when P(y|x) changes (concept).";
    }
    if (topicName.includes('Data Preparation') || topicName.includes('Data Understanding') || topicName.includes('Data Documentation')) {
        lectureMoments = "Lecture 4. <br><strong>Note:</strong> This topic was deferred due to time constraints in Lecture 4. Ensure coverage in Lecture 5.";
    }
    if (topicName.includes('Appropriate Data Source Selection')) {
        assignmentConnections = "<strong>Assignment 2: Full Proposal, Section 4 (Data).</strong> <br><strong>Feedback Insight:</strong> Average score was 6/10. Common issue: Selected data sources (e.g., YouTube) didn't match the target context (small interactive courses).";
    }
    if (topicName.includes('Justifying AI')) {
        assignmentConnections = "<strong>Assignment 2: Full Proposal, Introduction.</strong> <br><strong>Feedback Insight:</strong> Average score was 2.5/5. Common issue: Weak justification for why AI/ML was necessary compared to simpler alternatives.";
    }

    // Construct HTML
    let html = `
        <div class="flex items-center gap-3 mb-4">
            <span class="w-5 h-5 rounded-full ${statusColorClass}"></span>
            <h3 class="text-2xl font-bold text-gray-900">${topicName}</h3>
            <span class="text-sm font-medium text-gray-500">(${status})</span>
        </div>
        <div class="space-y-5">
            <div><h4 class="font-semibold text-gray-700">Key Concepts</h4><p class="text-gray-600 text-sm mt-1">${keyConcepts}</p></div>
            <div><h4 class="font-semibold text-gray-700">Examples</h4><p class="text-gray-600 text-sm mt-1">${examples}</p></div>
            <div><h4 class="font-semibold text-gray-700">Relevant Lecture Moments</h4><p class="text-gray-600 text-sm mt-1">${lectureMoments}</p></div>
            <div><h4 class="font-semibold text-gray-700">Assignment Connections</h4><p class="text-gray-600 text-sm mt-1">${assignmentConnections}</p></div>
            <div><h4 class="font-semibold text-gray-700">AI Reflection</h4><p class="text-gray-600 text-sm mt-1">${aiReflection}</p></div>
        </div>
    `;
    
    content.innerHTML = html;
    modal.classList.remove('hidden');
}

function addNewClass() {
    showModal('modal-add-class');
}

async function handleAddClass(event) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    const submitButton = form.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.textContent;
    
    // Disable submit button and show loading state
    submitButton.disabled = true;
    submitButton.textContent = 'Adding...';
    
    const courseData = {
        code: formData.get('course-code'),
        name: formData.get('course-name'),
        totalLectures: parseInt(formData.get('total-lectures')),
        semester: formData.get('semester'),
        description: formData.get('description') || ''
    };
    
    try {
        // API endpoint - update this to match your backend
        const API_BASE_URL = 'http://localhost:8001/api'; // FastAPI port
        const response = await fetch(`${API_BASE_URL}/classes`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(courseData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
            throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
        }
        
        const newClass = await response.json();
        
        // Add the new class card immediately to the UI
        const classesGrid = document.getElementById('classes-grid');
        if (classesGrid) {
            const classCard = createClassCard(newClass);
            classesGrid.appendChild(classCard);
        }
        
        // Show success message
        alert(`Class "${courseData.name}" (${courseData.code}) has been added!`);
        
        // Reset form and close modal
        form.reset();
        hideModal('modal-add-class');
        
    } catch (error) {
        console.error('Error adding class:', error);
        
        // Show error message
        alert(`Failed to add class: ${error.message}\n\nNote: Make sure your backend API is running at http://localhost:8001`);
        
        // Re-enable submit button
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
    }
}

// Fetch all classes from the API
async function fetchClasses() {
    try {
        const API_BASE_URL = 'http://localhost:8001/api';
        const response = await fetch(`${API_BASE_URL}/classes`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const classes = await response.json();
        return classes;
    } catch (error) {
        console.error('Error fetching classes:', error);
        // Return empty array if API fails (for development)
        return [];
    }
}

// Refresh the class list on the home screen
async function refreshClassList() {
    const classesGrid = document.getElementById('classes-grid');
    if (!classesGrid) return; // Not on home screen
    
    try {
        const classes = await fetchClasses();
        
        // Only update if we got classes from the API
        if (classes.length > 0) {
            // Clear existing classes
            classesGrid.innerHTML = '';
            
            // Render all classes from API
            classes.forEach(classItem => {
                const classCard = createClassCard(classItem);
                classesGrid.appendChild(classCard);
            });
        }
        // If API returns empty array or fails, keep existing classes
    } catch (error) {
        console.error('Error refreshing class list:', error);
        // Keep existing classes on error
    }
}

// Create a class card element
function createClassCard(classData) {
    const card = document.createElement('div');
    card.className = 'bg-white/80 backdrop-blur-sm p-6 rounded-xl shadow-md cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1';
    card.onclick = () => showScreen('screen-course-hub', document.getElementById('nav-courses'));
    
    // Calculate progress (assuming currentLecture is 0 for new classes)
    const currentLecture = classData.currentLecture || 0;
    const totalLectures = classData.totalLectures || 1;
    const progress = totalLectures > 0 ? (currentLecture / totalLectures) * 100 : 0;
    
    card.innerHTML = `
        <div class="flex justify-between items-start mb-4">
            <div>
                <div class="text-xs text-gray-500">${classData.code || ''}</div>
                <div class="text-lg font-semibold text-gray-900">${classData.name || ''}</div>
            </div>
            <svg class="w-5 h-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
        </div>
        <div class="text-sm text-gray-600 mb-1">Lecture ${currentLecture} of ${totalLectures}</div>
        <div class="w-full bg-gray-200 rounded-full h-2.5">
            <div class="primary-gradient h-2.5 rounded-full" style="width: ${progress}%"></div>
        </div>
    `;
    
    return card;
}

// Lecture management functions
let currentLectureId = null;
let uploadedFile = null;

function addNewLecture() {
    // Create a new blank lecture
    currentLectureId = 'lecture-' + Date.now(); // Generate a temporary ID
    uploadedFile = null;
    
    // Navigate to the edit screen
    showScreen('screen-lecture-edit', document.getElementById('nav-courses'));
    
    // Reset the form
    setTimeout(() => {
        const titleInput = document.getElementById('lecture-title-input');
        const topicList = document.getElementById('lecture-topic-list');
        const fileInfo = document.getElementById('uploaded-file-info');
        
        if (titleInput) titleInput.value = 'New Lecture';
        if (topicList) topicList.innerHTML = '';
        if (fileInfo) {
            fileInfo.classList.add('hidden');
            document.getElementById('uploaded-file-name').textContent = '';
        }
    }, 100);
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (file) {
        processUploadedFile(file);
    }
}

function handleFileDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const uploadArea = event.currentTarget;
    uploadArea.classList.remove('border-indigo-500', 'bg-indigo-50');
    
    const files = event.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        // Check if it's a valid file type
        const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.ms-powerpoint'];
        if (validTypes.includes(file.type) || file.name.endsWith('.pdf') || file.name.endsWith('.pptx') || file.name.endsWith('.ppt')) {
            processUploadedFile(file);
            // Update the file input
            const fileInput = document.getElementById('lecture-slides-upload');
            if (fileInput) {
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                fileInput.files = dataTransfer.files;
            }
        } else {
            alert('Please upload a PDF or PowerPoint file (.pdf, .ppt, .pptx)');
        }
    }
}

function processUploadedFile(file) {
    uploadedFile = file;
    const fileInfo = document.getElementById('uploaded-file-info');
    const fileName = document.getElementById('uploaded-file-name');
    
    if (fileInfo && fileName) {
        fileName.textContent = file.name;
        fileInfo.classList.remove('hidden');
    }
}

function removeUploadedFile() {
    uploadedFile = null;
    const fileInput = document.getElementById('lecture-slides-upload');
    const fileInfo = document.getElementById('uploaded-file-info');
    
    if (fileInput) fileInput.value = '';
    if (fileInfo) {
        fileInfo.classList.add('hidden');
        document.getElementById('uploaded-file-name').textContent = '';
    }
}

function addLectureTopic() {
    const input = document.getElementById('lecture-topic-input');
    const topicList = document.getElementById('lecture-topic-list');
    
    if (input && topicList) {
        const topicName = input.value.trim();
        if (topicName) {
            // Check if topic already exists
            const existingTopics = Array.from(topicList.children).map(el => el.textContent.trim());
            if (existingTopics.includes(topicName)) {
                alert('This topic is already added.');
                return;
            }
            
            const topicPill = document.createElement('div');
            topicPill.className = 'py-3 px-5 rounded-full text-gray-700 font-medium bg-gray-200 border border-gray-300 flex items-center gap-2';
            topicPill.innerHTML = `
                <span>${topicName}</span>
                <button onclick="removeLectureTopic(this)" class="text-red-600 hover:text-red-800 ml-1">
                    <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            `;
            topicList.appendChild(topicPill);
            input.value = '';
        }
    }
}

function removeLectureTopic(button) {
    if (button && button.parentElement) {
        button.parentElement.remove();
    }
}

function addPriorityTopic(topicName) {
    const input = document.getElementById('lecture-topic-input');
    if (input) {
        input.value = topicName;
        addLectureTopic();
    }
}

async function saveLecture() {
    const titleInput = document.getElementById('lecture-title-input');
    const topicList = document.getElementById('lecture-topic-list');
    
    if (!titleInput) return;
    
    const title = titleInput.value.trim();
    if (!title) {
        alert('Please enter a lecture title.');
        return;
    }
    
    // Collect topics
    const topics = Array.from(topicList.children).map(el => {
        const textNode = el.querySelector('span');
        return textNode ? textNode.textContent.trim() : '';
    }).filter(t => t);
    
    // Prepare lecture data
    const lectureData = {
        id: currentLectureId,
        title: title,
        topics: topics,
        hasSlides: uploadedFile !== null,
        fileName: uploadedFile ? uploadedFile.name : null,
        createdAt: new Date().toISOString()
    };
    
    // If file is uploaded, you would upload it to the server here
    if (uploadedFile) {
        // In a real implementation, you would upload the file to the server
        console.log('File to upload:', uploadedFile.name);
        // Example: await uploadFile(uploadedFile, currentLectureId);
    }
    
    // Save lecture data (in a real app, this would be an API call)
    console.log('Saving lecture:', lectureData);
    
    // Store in localStorage for now (in a real app, this would be an API call)
    let lectures = JSON.parse(localStorage.getItem('lectures') || '[]');
    const existingIndex = lectures.findIndex(l => l.id === currentLectureId);
    if (existingIndex >= 0) {
        lectures[existingIndex] = lectureData;
    } else {
        lectures.push(lectureData);
    }
    localStorage.setItem('lectures', JSON.stringify(lectures));
    
    // Show success message
    alert(`Lecture "${title}" has been saved!`);
    
    // Navigate back to course hub
    showScreen('screen-course-hub', document.getElementById('nav-courses'));
    showTab('tab-lectures', document.getElementById('tab-btn-lectures'));
    
    // Refresh the lectures list
    refreshLecturesList();
}

function editLecture(lectureId) {
    // Load lecture data from localStorage (in a real app, this would be an API call)
    const lectures = JSON.parse(localStorage.getItem('lectures') || '[]');
    const lecture = lectures.find(l => l.id === lectureId);
    
    if (!lecture) {
        alert('Lecture not found');
        return;
    }
    
    currentLectureId = lectureId;
    
    // Navigate to edit screen
    showScreen('screen-lecture-edit', document.getElementById('nav-courses'));
    
    // Populate the form
    setTimeout(() => {
        const titleInput = document.getElementById('lecture-title-input');
        const topicList = document.getElementById('lecture-topic-list');
        
        if (titleInput) titleInput.value = lecture.title || 'New Lecture';
        if (topicList) {
            topicList.innerHTML = '';
            if (lecture.topics && lecture.topics.length > 0) {
                lecture.topics.forEach(topic => {
                    const topicPill = document.createElement('div');
                    topicPill.className = 'py-3 px-5 rounded-full text-gray-700 font-medium bg-gray-200 border border-gray-300 flex items-center gap-2';
                    topicPill.innerHTML = `
                        <span>${topic}</span>
                        <button onclick="removeLectureTopic(this)" class="text-red-600 hover:text-red-800 ml-1">
                            <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    `;
                    topicList.appendChild(topicPill);
                });
            }
        }
        
        // Show file info if slides were uploaded
        if (lecture.hasSlides && lecture.fileName) {
            const fileInfo = document.getElementById('uploaded-file-info');
            const fileName = document.getElementById('uploaded-file-name');
            if (fileInfo && fileName) {
                fileName.textContent = lecture.fileName;
                fileInfo.classList.remove('hidden');
            }
        }
    }, 100);
}

function refreshLecturesList() {
    // Load lectures from localStorage (in a real app, this would be an API call)
    const lectures = JSON.parse(localStorage.getItem('lectures') || '[]');
    
    // Find the "Upcoming Lectures" section - look for the ul inside the last bg-white/80 div in tab-lectures
    const tabLectures = document.getElementById('tab-lectures');
    if (!tabLectures) return;
    
    const upcomingSection = tabLectures.querySelectorAll('.bg-white\\/80');
    if (upcomingSection.length < 2) return;
    
    const upcomingUl = upcomingSection[1].querySelector('ul');
    if (!upcomingUl) return;
    
    // Clear existing dynamic lectures (keep the first one which is the mock "Project Proposals")
    const existingItems = Array.from(upcomingUl.children);
    existingItems.forEach(item => {
        const onclick = item.querySelector('a')?.getAttribute('onclick');
        // Only remove items that have editLecture onclick
        if (onclick && onclick.includes('editLecture')) {
            item.remove();
        }
    });
    
    // Add saved lectures
    lectures.forEach(lecture => {
        const li = document.createElement('li');
        li.innerHTML = `
            <a onclick="editLecture('${lecture.id}')" class="flex justify-between items-center p-3 -m-3 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors">
                <span class="font-medium text-gray-700">${lecture.title}</span>
                <svg class="w-5 h-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
            </a>
        `;
        upcomingUl.appendChild(li);
    });
}