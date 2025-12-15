// --- Global API Configuration ---
// Use localhost for development, Render URL for production
const isLocalDev = window.location.hostname === 'localhost' 
    || window.location.hostname === '127.0.0.1'
    || window.location.hostname === '[::1]'
    || window.location.hostname.startsWith('192.168.')
    || window.location.hostname === '[::]';
const API_BASE_URL = isLocalDev 
    ? 'http://localhost:8001/api'
    : 'https://praxis-r64o.onrender.com/api';

// --- Globals ---
const appContainer = document.getElementById("app-container");
const themes = ["theme-spring", "theme-ocean", "theme-twilight"];
let activeSidebarLink = null; // Set on DOMContentLoaded
let activeTabButton = null; // Set when tab is clicked or course hub loads

// Store for reflection panel state
let originalInsightHTML = "";
let originalInsightPanelTitle = "";

// Store for current survey being displayed
let currentSurvey = null;

// --- Mappings for Fetching ---
const screenFileMap = {
  "screen-home-dashboard": "home.html",
  "screen-course-hub": "course-hub.html",
  "screen-lecture-analysis": "lecture-analysis.html",
  "screen-lecture-planning": "lecture-planning.html",
  "screen-lecture-edit": "lecture-edit.html",
  "screen-assignments-hub": "assignments-hub.html",
  "screen-student-trends": "student-trends.html",
  "screen-settings": "settings.html",
  "screen-student-survey": "student-survey.html",
  "screen-survey-take": "survey-take.html",
};

const modalFileMap = {
  "modal-hw1": "hw1.html",
  "modal-pdf-viewer": "pdf-viewer.html",
  "modal-lecture-rewind": "lecture-rewind.html",
  "modal-topic-detail": "topic-detail.html",
  "modal-add-class": "add-class.html",
  "modal-add-lecture": "add-lecture.html",
  "modal-generate-survey": "generate-survey.html",
  "modal-feedback": "feedback-modal.html",
  "modal-add-assignment": "add-assignment.html",
  "modal-analyze-assignment": "analyze-assignment.html",
};

// --- DOMContentLoaded (Initialization) ---
document.addEventListener("DOMContentLoaded", () => {
  // Check for survey_id in URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const surveyId = urlParams.get("survey_id");

  if (surveyId) {
    // Load the survey-taking page
    loadSurveyForStudent(surveyId);
    return;
  }

  // Set the initial active link
  activeSidebarLink = document.getElementById("nav-home");

  // Load the home screen by default
  // We pass the activeSidebarLink so it remains 'active'
  showScreen("screen-home-dashboard", activeSidebarLink);

  // Add listener for the history back button
  const historyBackButton = document.getElementById("history-back-button");
  if (historyBackButton) {
    historyBackButton.addEventListener("click", handleBackButton);
  }

  // --- Dark Mode Toggle ---
  initDarkMode();
});

// Dark mode initialization and toggle
function initDarkMode() {
  const toggle = document.getElementById("dark-mode-toggle");
  const sunIcon = document.getElementById("sun-icon");
  const moonIcon = document.getElementById("moon-icon");

  if (!toggle) return;

  // Check for saved preference or system preference
  const savedTheme = localStorage.getItem("theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  if (savedTheme === "dark" || (!savedTheme && prefersDark)) {
    document.body.classList.add("dark");
    updateDarkModeIcons(true);
  }

  toggle.addEventListener("click", () => {
    const isDark = document.body.classList.toggle("dark");
    localStorage.setItem("theme", isDark ? "dark" : "light");
    updateDarkModeIcons(isDark);
  });
}

function updateDarkModeIcons(isDark) {
  const sunIcon = document.getElementById("sun-icon");
  const moonIcon = document.getElementById("moon-icon");

  if (isDark) {
    sunIcon?.classList.remove("hidden");
    moonIcon?.classList.add("hidden");
  } else {
    sunIcon?.classList.add("hidden");
    moonIcon?.classList.remove("hidden");
  }
}

// --- Helper function to navigate to course hub with course data ---
async function navigateToCourseHub(courseId) {
  if (!courseId) {
    showScreen("screen-course-hub", document.getElementById("nav-courses"));
    return;
  }

  try {
    const courseResponse = await fetch(`${API_BASE_URL}/classes/${courseId}`);
    if (courseResponse.ok) {
      const courseData = await courseResponse.json();
      const navCourses = document.getElementById("nav-courses");
      await showScreen("screen-course-hub", navCourses, courseData);
    } else {
      showScreen("screen-course-hub", document.getElementById("nav-courses"));
    }
  } catch (error) {
    console.error("Error fetching course data for navigation:", error);
    showScreen("screen-course-hub", document.getElementById("nav-courses"));
  }
}

// Make it globally accessible
window.navigateToCourseHub = navigateToCourseHub;

// --- Back Button Handler ---
async function handleBackButton() {
  // If we're on the survey page, go back to the lecture analysis page
  if (currentScreen === "screen-student-survey") {
    if (currentSurvey && currentSurvey.lecture_id) {
      // Navigate back to the lecture analysis page
      await showLectureAnalysis(currentSurvey.lecture_id);
      return;
    } else if (currentLectureId) {
      // Fallback: use currentLectureId if available
      await showLectureAnalysis(currentLectureId);
      return;
    }
  }

  // If we're on lecture pages (edit, analysis, planning), go back to course hub
  if (
    currentScreen === "screen-lecture-analysis" ||
    currentScreen === "screen-lecture-edit" ||
    currentScreen === "screen-lecture-planning"
  ) {
    if (currentCourseId) {
      try {
        const courseResponse = await fetch(
          `${API_BASE_URL}/classes/${currentCourseId}`
        );
        if (courseResponse.ok) {
          const courseData = await courseResponse.json();
          const navCourses = document.getElementById("nav-courses");
          await showScreen("screen-course-hub", navCourses, courseData);

          // Wait for screen to fully load, then switch to lectures tab
          setTimeout(() => {
            const tabBtnLectures = document.getElementById("tab-btn-lectures");
            if (tabBtnLectures) {
              showTab("tab-lectures", tabBtnLectures);
            }
          }, 100);
          return;
        }
      } catch (error) {
        console.error("Error fetching course data for back navigation:", error);
      }
    }
  }

  // Default: go to home screen
  showScreen("screen-home-dashboard", document.getElementById("nav-home"));
}

// --- Caching Function ---
function cacheOriginalInsights() {
  const insightContent = document.getElementById("insight-content");
  const insightTitle = document.getElementById("dynamic-insight-panel-title");
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
 * @param {Object} courseData - Optional course data for course-specific screens.
 */
async function showScreen(screenId, navElement, courseData = null) {
  // Track current screen for back button navigation
  currentScreen = screenId;

  // Manage Back Button Visibility
  const historyBackButton = document.getElementById("history-back-button");
  if (historyBackButton) {
    // Hide on top-level screens
    const isRootScreen =
      screenId === "screen-home-dashboard" ||
      screenId === "screen-settings" ||
      (screenId === "screen-course-hub" && !courseData); // Course hub without data is likely the list/empty state

    if (isRootScreen) {
      historyBackButton.classList.add("hidden");
    } else {
      historyBackButton.classList.remove("hidden");
    }
  }

  const screenFile = screenFileMap[screenId];
  if (!screenFile) {
    console.error("Unknown screen ID:", screenId);
    return;
  }

  try {
    // Fetch the new screen content with aggressive cache busting (random number)
    const response = await fetch(`./screens/${screenFile}?v=${Date.now()}_${Math.floor(Math.random() * 1000)}`);
    if (!response.ok) throw new Error(`Failed to load ${screenFile}`);
    let html = await response.text();

    // If this is the course hub and we have course data, populate it dynamically
    if (screenId === "screen-course-hub" && courseData) {
      // Check if this is the original hardcoded course
      const isOriginalCourse =
        (courseData.code === "601.486/686" ||
          courseData.code === "JHU 601.486/686") &&
        courseData.name === "ML: AI System Design";

      // Replace the hardcoded course title with the actual course data
      html = html.replace(
        /<h1[^>]*>.*?<\/h1>/,
        `<h1 class="text-4xl font-bold text-gray-900">${courseData.code || ""
        } - ${courseData.name || ""}</h1>`
      );

      // If it's a new course (not the original), replace hardcoded content with blank tabs
      if (!isOriginalCourse) {
        // Create a temporary container to parse and manipulate the HTML
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = html;

        // Replace overview tab content
        const overviewTab = tempDiv.querySelector(
          '#tab-overview[data-original-content="true"]'
        );
        if (overviewTab) {
          overviewTab.removeAttribute("data-original-content");
          overviewTab.innerHTML = `
        <div class="bg-white/80 backdrop-blur-sm p-6 rounded-xl shadow-md">
            <p class="text-gray-600">Overview content will be displayed here.</p>
        </div>`;
        }

        // Don't remove the "Past Lectures" section - we need it for dynamic content
        // Just remove the hardcoded items inside it, but keep the section structure
        const pastLecturesSection = tempDiv.querySelector(
          "#past-lectures-list"
        )?.parentElement;
        if (pastLecturesSection) {
          const pastLecturesList = pastLecturesSection.querySelector("ul");
          if (pastLecturesList) {
            // Remove only the hardcoded list items, but keep the empty list
            const hardcodedItems = pastLecturesList.querySelectorAll(
              'li[data-original-content="true"]'
            );
            hardcodedItems.forEach((item) => item.remove());
          }
        }

        // Remove the hardcoded "Project Proposals" from upcoming lectures
        const projectProposals = tempDiv.querySelector(
          'li[data-original-content="true"]'
        );
        if (projectProposals) {
          projectProposals.remove();
        }

        html = tempDiv.innerHTML;
      }
    }

    // Inject the content
    const mainContainer = document.getElementById("main-content-container");
    mainContainer.innerHTML = html;

    // Update sidebar active state
    if (navElement && navElement.classList.contains("sidebar-link")) {
      if (activeSidebarLink) {
        activeSidebarLink.classList.remove("active");
      }
      navElement.classList.add("active");
      activeSidebarLink = navElement;
    }

    // --- Handle screen-specific initializations ---

    // Refresh class list when navigating to home screen
    if (screenId === "screen-home-dashboard") {
      refreshClassList();
      refreshPendingAnalyses();
    }

    // Reset to first tab if navigating to course hub
    if (screenId === "screen-course-hub") {
      // Store course ID if courseData is provided
      if (courseData && courseData.id) {
        currentCourseId = courseData.id;
      }

      setTimeout(() => {
        const overviewTab = document.getElementById("tab-btn-overview");
        if (overviewTab) {
          showTab("tab-overview", overviewTab);
        }
        // Refresh lectures list when course hub loads to show updated status
        // This ensures lectures with completed analysis appear in Past Lectures
        refreshLecturesList();
        // Also refresh the topic knowledge pills
        refreshTopicKnowledge();
      }, 100);
    }

    // Cache insights if we just loaded the lecture analysis screen
    if (screenId === "screen-lecture-analysis") {
      cacheOriginalInsights();
      // Check if analysis is already running
      if (currentLectureId) {
        checkLectureAnalysisStatus(currentLectureId);
      }
    }

    // Load existing recommendations if we are on the planning or edit screen
    if ((screenId === "screen-lecture-planning" || screenId === "screen-lecture-edit") && currentLectureId) {
      setTimeout(() => {
        loadMaterialsAnalysis(currentLectureId);
      }, 100);
    }

    // Populate priority topics if on lecture edit screen
    if (screenId === "screen-lecture-edit" && currentCourseId) {
      setTimeout(() => {
        populateLecturePriorityTopics(currentCourseId);
      }, 100);
    }

    // Load courses list when settings screen loads
    if (screenId === "screen-settings") {
      setTimeout(() => {
        loadSettingsCourses();
        loadGeminiApiKeyStatus();
      }, 100);
    }

    // Scroll to top
    window.scrollTo(0, 0);
  } catch (error) {
    console.error("Error loading screen:", error);
    // You could show an error message to the user here
  }
}

// --- Priority Topics Function ---
async function populateLecturePriorityTopics(courseId) {
  const listContainer = document.getElementById("course-delta-list");
  if (!listContainer || !courseId) return;

  try {
    const response = await fetch(`${API_BASE_URL}/classes/${courseId}/overview`);
    if (!response.ok) return;
    const data = await response.json();

    // 1. Struggling topics (High Priority)
    const struggling = (data.student_understanding || [])
      .filter(t => t.status === 'struggling')
      .map(t => ({ name: t.topic, reason: "Struggling", priority: 0 }));

    // 2. Uncovered topics (Medium Priority)
    const uncovered = (data.course_coverage || [])
      .filter(t => !t.covered)
      .map(t => ({ name: t.topic, reason: "Missing", priority: 1 }));

    // Combine and dedup
    let priorities = [...struggling, ...uncovered];
    const unique = new Map();
    priorities.forEach(p => {
      if (!unique.has(p.name)) unique.set(p.name, p);
    });
    priorities = Array.from(unique.values());

    // Sort: Struggling < Uncovered
    priorities.sort((a, b) => a.priority - b.priority);

    // Take top 5
    priorities = priorities.slice(0, 5);

    if (priorities.length === 0) {
      listContainer.innerHTML = '<div class="text-sm text-gray-500 italic py-4 text-center">No priority topics identified yet. Great job!</div>';
      return;
    }

    let html = '';
    const colors = [
      "bg-purple-600", // Highest
      "bg-orange-500",
      "bg-yellow-500",
      "bg-green-500",
      "bg-blue-500"
    ];

    priorities.forEach((item, index) => {
      const colorClass = colors[index % colors.length];
      // Escape single quotes in topic name for the onclick handler
      const safeName = item.name.replace(/'/g, "\\'");

      html += `
                <div class="py-2 px-4 rounded-lg text-white font-medium shadow-sm ${colorClass} cursor-pointer hover:opacity-90 transition-opacity" 
                     onclick="addPriorityTopic('${safeName}')"
                     title="Reason: ${item.reason}">
                    ${index + 1}. ${item.name}
                </div>`;
    });
    listContainer.innerHTML = html;

  } catch (e) {
    console.error("Error fetching course delta:", e);
    listContainer.innerHTML = '<div class="text-sm text-red-500 italic">Failed to load topics.</div>';
  }
}

/**
 * Fetches, appends, and displays a modal.
 * @param {string} modalId - The ID of the modal to show (e.g., 'modal-hw1').
 */
async function showModal(modalId) {
  const modalContainer = document.getElementById("modal-container");

  // For add-class modal, always remove existing version to force fresh fetch
  if (modalId === "modal-add-class") {
    const existingAddClassModal = document.getElementById(modalId);
    if (existingAddClassModal) {
      existingAddClassModal.remove();
    }
  }

  // Check if modal is already in DOM. If so, just show it.
  const existingModal = document.getElementById(modalId);
  if (existingModal) {
    // Special case: re-fetch content for topic detail modal
    if (modalId === "modal-topic-detail") {
      // This modal is dynamic, so we don't just "show" it.
      // The showTopicDetail() function will handle its content.
    } else {
      existingModal.classList.remove("hidden");

      // Auto-focus the first input in the modal if it exists
      const firstInput = existingModal.querySelector('input[type="text"], input[type="number"], textarea');
      if (firstInput) {
        setTimeout(() => firstInput.focus(), 100);
      }

      return;
    }
  }

  // If modal is not in DOM, fetch and append it
  // Exception: topic-detail is dynamic, not fetched.
  if (modalId === "modal-topic-detail") {
    // Find or create the modal shell
    if (!existingModal) {
      const response = await fetch(`./modals/topic-detail.html`);
      if (!response.ok) throw new Error(`Failed to load topic-detail.html`);
      const html = await response.text();
      modalContainer.insertAdjacentHTML("beforeend", html);
    }
    // The showTopicDetail function will populate and show it.
    return;
  }

  const modalFile = modalFileMap[modalId];
  if (modalFile) {
    try {
      // Add cache-busting for add-class modal to prevent stale cached versions
      const url = modalId === "modal-add-class"
        ? `./modals/${modalFile}?v=${Date.now()}`
        : `./modals/${modalFile}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to load ${modalFile}`);
      const html = await response.text();

      // Append (not innerHTML) so we can have multiple modals
      modalContainer.insertAdjacentHTML("beforeend", html);

      // Find the newly added modal and remove 'hidden' class
      const newModal = document.getElementById(modalId);
      if (newModal) {
        newModal.classList.remove("hidden");

        // Auto-focus the first input in the modal if it exists
        const firstInput = newModal.querySelector('input[type="text"], input[type="number"], textarea');
        if (firstInput) {
          setTimeout(() => firstInput.focus(), 100);
        }
      }
    } catch (error) {
      console.error("Error loading modal:", error);
    }
  } else {
    console.error("Unknown modal ID:", modalId);
  }
}

// --- ORIGINAL FUNCTIONS (Copied from your script) ---
// These functions will work perfectly with the fetched content.

function setTheme(themeName) {
  themes.forEach((theme) => appContainer.classList.remove(theme));
  appContainer.classList.add(themeName);
}

function showTab(tabId, tabElement) {
  // Hide all tab contents
  document.querySelectorAll(".tab-content").forEach((tab) => {
    tab.classList.add("hidden");
  });
  // Remove active state from all tab buttons
  document.querySelectorAll(".tab-button").forEach((btn) => {
    btn.classList.remove("active");
  });

  // Show the target tab content
  const targetTab = document.getElementById(tabId);
  if (!targetTab) {
    console.warn(`Tab content with ID "${tabId}" not found`);
    return;
  }
  targetTab.classList.remove("hidden");

  // Activate the tab button if provided
  if (tabElement) {
    tabElement.classList.add("active");
    activeTabButton = tabElement;
  } else {
    // Try to find the tab button if not provided
    const tabButton =
      document.querySelector(`[onclick*="showTab('${tabId}'"]`) ||
      document.querySelector(`#tab-btn-${tabId.replace("tab-", "")}`);
    if (tabButton) {
      tabButton.classList.add("active");
      activeTabButton = tabButton;
    }
  }

  // Refresh lectures list when lectures tab is shown to ensure latest data
  if (tabId === "tab-lectures") {
    setTimeout(() => {
      refreshLecturesList();
    }, 50);
  } else if (tabId === "tab-assignments") {
    showAssignmentsTab();
  } else if (tabId === "tab-trends") {
    // Load student trends data when the tab is shown
    // Use currentCourseId global if available
    if (typeof currentCourseId !== 'undefined') {
        loadStudentTrends(currentCourseId);
    }
  }
}

function hideModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add("hidden");
  }
}

function showPdfModal(pdfUrl) {
  // In a real app, you'd set the src. Here we just show the modal.
  // document.getElementById('pdf-iframe').src = pdfUrl;

  // Check if pdf-viewer is in the DOM, if not, load it.
  if (!document.getElementById("modal-pdf-viewer")) {
    showModal("modal-pdf-viewer").then(() => {
      // Once loaded, you could update the title/iframe src
      // For now, we just show it.
    });
  } else {
    showModal("modal-pdf-viewer");
  }
}

// ---
// ---
// --- THIS IS THE CORRECTED FUNCTION ---
// ---
// ---
// showInsight - Now uses dynamic data from timeline events
function showInsight(insightType, eventData = null) {
  const panel = document.getElementById("insight-content");
  const title = document.getElementById("dynamic-insight-panel-title");
  let content = "";
  let newTitle = "AI Reflection";

  const backButton = `<button onclick="showAllInsights()" class="mb-4 -ml-1 text-sm font-semibold primary-gradient-text flex items-center gap-1 hover:opacity-80">
        <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
        All Reflections
        </button>`;

  // Helper to format timestamp from seconds
  const formatTimestamp = (seconds) => {
    if (!seconds && seconds !== 0) return "";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `[${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}]`;
  };

  // Get data from event or use defaults
  const timestamp = eventData?.start_time ? formatTimestamp(eventData.start_time) : "";
  const eventTitle = eventData?.title || "AI Insight";
  const description = eventData?.description || eventData?.content || "No additional details available.";
  const suggestion = eventData?.suggestion || "";
  const insightId = eventData?.id || insightType;

  // Determine styling based on type
  let iconBgClass = "bg-gray-100";
  let iconTextClass = "text-gray-600";
  let iconSvg = '<path stroke-linecap="round" stroke-linejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 0a12.06 12.06 0 004.5 0m-8.25 0a12.06 12.06 0 01-4.5 0m3.75 2.023a14.077 14.077 0 01-6.75 0" />';

  switch (insightType) {
    case "clarity":
      newTitle = "Clarity Insight";
      iconBgClass = "bg-yellow-100";
      iconTextClass = "text-yellow-600";
      iconSvg = '<path stroke-linecap="round" stroke-linejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 0a12.06 12.06 0 004.5 0m-8.25 0a12.06 12.06 0 01-4.5 0m3.75 2.023a14.077 14.077 0 01-6.75 0" />';
      break;
    case "question":
      newTitle = "Interaction Insight";
      iconBgClass = "bg-blue-100";
      iconTextClass = "text-blue-600";
      iconSvg = '<path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />';
      break;
    case "answer":
      newTitle = "Interaction Insight";
      iconBgClass = "bg-green-100";
      iconTextClass = "text-green-600";
      iconSvg = '<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />';
      break;
    case "joke":
    case "positive":
      newTitle = "Positive Moment";
      iconBgClass = "bg-pink-100";
      iconTextClass = "text-pink-600";
      iconSvg = '<path stroke-linecap="round" stroke-linejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75s.168-.75.375-.75.375.336.375.75zm-.75 0h.008v.008H9v-.008zm4.5 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.75 0h.008v.008H13.5v-.008z" />';
      break;
    default:
      newTitle = "AI Insight";
  }

  // Build the content dynamically
  content = `
    <li class="flex items-start gap-3">
        <span class="flex-shrink-0 w-8 h-8 rounded-full ${iconBgClass} flex items-center justify-center mt-1">
            <svg class="w-5 h-5 ${iconTextClass}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                ${iconSvg}
            </svg>
        </span>
        <div>
            <h4 class="font-semibold text-gray-800">${timestamp} ${eventTitle}</h4>
            <p class="text-gray-600">${description}</p>
            ${suggestion ? `<p class="text-gray-600 mt-2 font-medium">Suggestion: ${suggestion}</p>` : ''}
            <div class="flex gap-2 mt-3 border-t border-gray-100 pt-2">
                <button onclick="openFeedbackModal('${insightId}', 'up')" class="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-green-600 transition-colors" title="Helpful">
                    <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a2.25 2.25 0 012.25 2.25V7.38a2.25 2.25 0 01-2.25 2.25H15M6.633 10.5H2.25A2.25 2.25 0 000 12.75v6a2.25 2.25 0 002.25 2.25h4.383m0-9H15m0 0c.806 0 1.533.446 2.031 1.08a9.041 9.041 0 012.861 2.4c.723.384 1.35.956 1.653 1.715a4.498 4.498 0 00.322 1.672V19.5a2.25 2.25 0 01-2.25 2.25H15" /></svg>
                </button>
                <button onclick="openFeedbackModal('${insightId}', 'down')" class="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-red-600 transition-colors" title="Not Helpful">
                    <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 15h2.25m8.024-9.75c.011.05.028.1.052.148.591 1.2.924 2.55.924 3.977a8.96 8.96 0 01-.999 4.125m.023-8.25c-.076-.365.183-.75.575-.75h.908c.889 0 1.713.518 1.972 1.368.339 1.11.521 2.287.521 3.507 0 1.553-.295 3.036-.831 4.398C20.613 14.547 19.833 15 19 15h-1.053c-.472 0-.745-.556-.5-.96a8.95 8.95 0 00.303-.54m.023-8.25H16.48a4.5 4.5 0 01-1.423-2.3l-2.052-4.102a2.534 2.534 0 01.141-2.732.75.75 0 01.502-.278h5.87c.455 0 .863.236 1.109.607l.143.224c.455.713.56 1.581.29 2.347l-1.043 3.012zM7.5 15a2.25 2.25 0 002.25 2.25m-2.25-2.25A2.25 2.25 0 015.25 12.75v-6a2.25 2.25 0 012.25-2.25H9.75" /></svg>
                </button>
            </div>
        </div>
    </li>`;

  title.innerHTML = newTitle;
  panel.innerHTML = backButton + '<ul class="space-y-4">' + content + "</ul>";
}
// ---
// ---
// --- END OF CORRECTED FUNCTION ---
// ---
// ---

function showAllInsights() {
  const panel = document.getElementById("insight-content");
  const title = document.getElementById("dynamic-insight-panel-title");
  if (panel) {
    panel.innerHTML = originalInsightHTML;
  }
  if (title) {
    title.innerHTML = originalInsightPanelTitle;
  }
}

function toggleCourseView(viewType) {
  if (viewType === "pill") {
    document.getElementById("pill-view").classList.remove("hidden");
    document.getElementById("knowledge-graph-view").classList.add("hidden");
    document.getElementById("view-btn-pill").classList.add("active");
    document.getElementById("view-btn-graph").classList.remove("active");
  } else {
    document.getElementById("pill-view").classList.add("hidden");
    document.getElementById("knowledge-graph-view").classList.remove("hidden");
    document.getElementById("view-btn-pill").classList.remove("active");
    document.getElementById("view-btn-graph").classList.add("active");
  }
}

function addManualTopic() {
  const input = document.getElementById("manual-topic-input");
  const list = document.getElementById("manual-topic-list");
  const topicName = input.value.trim();

  if (topicName) {
    const newPill = document.createElement("div");
    newPill.className =
      "py-3 px-5 rounded-full text-gray-700 font-medium bg-gray-200 border border-gray-300";
    newPill.textContent = topicName;
    list.appendChild(newPill);
    input.value = "";
  }
}

function printRewindReport() {
  window.print();
}

function toggleVisibility(elementId) {
  const element = document.getElementById(elementId);
  if (element) {
    element.classList.toggle("hidden");
  }
}

async function showTopicDetail(topicName, status, lectureId, buttonElement, reason = null) {
  console.log("showTopicDetail called with:", { topicName, status, lectureId, reason });
  // Ensure the modal shell is loaded
  await showModal("modal-topic-detail");

  const modal = document.getElementById("modal-topic-detail");
  const content = document.getElementById("topic-detail-content");

  let statusColorClass = "";
  switch (status) {
    case "Strong":
      statusColorClass = "bg-green-500";
      break;
    case "Developing":
    case "Good":
      statusColorClass = "bg-yellow-500";
      break;
    case "Struggling":
      statusColorClass = "bg-red-500";
      break;
    case "Covered":
      statusColorClass = "bg-green-500";
      break;
    case "Planned":
      statusColorClass = "bg-gray-400";
      break;
    default:
      statusColorClass = "bg-gray-500";
  }

  // Default values
  let keyConcepts = "No key concepts available yet. Analyze a video to generate this content.";
  let examples = "No examples available yet.";
  let lectureMoments = "No lecture moments identified yet.";
  let assignmentConnections = "No assignment connections available.";
  let aiReflection = "No AI reflection available yet.";
  let notes = "";

  // Try to find topic data from current lecture's analysis
  // Use passed lectureId or fall back to currentLectureId
  const targetLectureId = lectureId || currentLectureId;
  if (targetLectureId) {
    try {
      const lectureRes = await fetch(`${API_BASE_URL}/lectures/${targetLectureId}`);
      if (lectureRes.ok) {
        const lecture = await lectureRes.json();

        // Check video analysis for topic coverage (use hasAnalysis for MongoDB compatibility)
        if (lecture.hasAnalysis || lecture.analysisPath) {
          try {
            const analysisRes = await fetch(`${API_BASE_URL}/lectures/${targetLectureId}/analysis`);
            if (analysisRes.ok) {
              const analysis = await analysisRes.json();
              const topicData = (analysis.topic_coverage || []).find(
                t => t.topic && t.topic.toLowerCase() === topicName.toLowerCase()
              );

              if (topicData) {
                keyConcepts = topicData.key_concepts || keyConcepts;
                examples = topicData.examples || examples;
                lectureMoments = topicData.lecture_moments || lectureMoments;
                aiReflection = topicData.ai_reflection || aiReflection;
                notes = topicData.notes || "";
              }
            }
          } catch (e) {
            console.log("Could not fetch video analysis:", e);
          }
        }
      }
    } catch (e) {
      console.log("Could not fetch lecture data:", e);
    }
  }

  // Use provided reason, or fall back to notes if no specific AI feedback exists
  const feedbackText = reason || notes;

  // Construct HTML
  let html = `
        <div class="flex items-center gap-3 mb-4">
            <span class="w-5 h-5 rounded-full ${statusColorClass}"></span>
            <h3 class="text-2xl font-bold text-gray-900">${topicName}</h3>
            <span class="text-sm font-medium text-gray-500">(${status})</span>
        </div>
        ${feedbackText ? `<p class="mb-6 text-gray-800"><span class="font-bold">Reason:</span> ${feedbackText}</p>` : ''}
        <div class="space-y-5">
            <div><h4 class="font-semibold text-gray-700">Key Concepts</h4><p class="text-gray-600 text-sm mt-1">${keyConcepts}</p></div>
            <div><h4 class="font-semibold text-gray-700">Examples</h4><p class="text-gray-600 text-sm mt-1">${examples}</p></div>
            <div><h4 class="font-semibold text-gray-700">Relevant Lecture Moments</h4><p class="text-gray-600 text-sm mt-1">${lectureMoments}</p></div>
            <div><h4 class="font-semibold text-gray-700">AI Reflection</h4><p class="text-gray-600 text-sm mt-1">${aiReflection}</p></div>
        </div>
    `;

  content.innerHTML = html;
  modal.classList.remove("hidden");
}

function addNewClass() {
  showModal("modal-add-class");
}

async function handleAddClass(event) {
  event.preventDefault();

  const form = event.target;
  const formData = new FormData(form);
  const submitButton = form.querySelector('button[type="submit"]');
  const originalButtonText = submitButton.textContent;

  // Disable submit button and show loading state
  submitButton.disabled = true;
  submitButton.textContent = "Adding...";

  const courseData = {
    code: formData.get("course-code"),
    name: formData.get("course-name"),
    semester: formData.get("semester"),
    description: formData.get("description") || "",
    totalLectures: 0, // Default value as it's required by backend but not in form
  };

  try {
    // API endpoint - update this to match your backend
    const response = await fetch(`${API_BASE_URL}/classes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(courseData),
    });

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ detail: "Unknown error" }));

      // Handle if detail is an object/array (common in FastAPI)
      const errorMessage = typeof errorData.detail === 'object'
        ? JSON.stringify(errorData.detail, null, 2)
        : (errorData.detail || `HTTP error! status: ${response.status}`);

      throw new Error(errorMessage);
    }

    const newClass = await response.json();

    // Re-enable submit button and reset text
    submitButton.disabled = false;
    submitButton.textContent = originalButtonText;

    // Add the new class card immediately to the UI
    const classesGrid = document.getElementById("classes-grid");
    if (classesGrid) {
      const classCard = createClassCard(newClass);
      classesGrid.appendChild(classCard);
    }

    // Show success message
    alert(`Class "${courseData.name}" (${courseData.code}) has been added!`);

    // Reset form and close modal
    form.reset();
    hideModal("modal-add-class");
  } catch (error) {
    console.error("Error adding class:", error);

    // Show error message
    alert(
      `Failed to add class: ${error.message}\n\nNote: Make sure your backend API is running at http://localhost:8001`
    );

    // Re-enable submit button
    submitButton.disabled = false;
    submitButton.textContent = originalButtonText;
  }
}

// Fetch all classes from the API
async function fetchClasses() {
  try {
    const response = await fetch(`${API_BASE_URL}/classes`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const classes = await response.json();
    return classes;
  } catch (error) {
    console.error("Error fetching classes:", error);
    // Return empty array if API fails (for development)
    return [];
  }
}

// Refresh the class list on the home screen
async function refreshClassList() {
  const classesGrid = document.getElementById("classes-grid");
  if (!classesGrid) return; // Not on home screen

  try {
    const classes = await fetchClasses();

    // Clear existing classes
    classesGrid.innerHTML = '';

    // Add all classes from API
    if (classes.length > 0) {
      classes.forEach((classItem) => {
        const classCard = createClassCard(classItem);
        classesGrid.appendChild(classCard);
      });
    }
  } catch (error) {
    console.error("Error refreshing class list:", error);
    // On error, keep existing classes (both hardcoded and dynamic)
  }
}

// Create a class card element
function createClassCard(classData) {
  const card = document.createElement("div");
  card.className =
    "bg-white/80 backdrop-blur-sm p-6 rounded-xl shadow-md cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1";
  card.onclick = () => {
    currentCourseId = classData.id;
    showScreen(
      "screen-course-hub",
      document.getElementById("nav-courses"),
      classData
    );
  };

  // Progress bar for visual appeal (can be updated later if needed)
  const progress = 0;

  card.innerHTML = `
        <div class="flex justify-between items-start mb-4">
            <div>
                <div class="text-xs text-gray-500">${classData.code || ""}</div>
                <div class="text-lg font-semibold text-gray-900">${classData.name || ""
    }</div>
            </div>
            <svg class="w-5 h-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-2.5">
            <div class="primary-gradient h-2.5 rounded-full" style="width: ${progress}%"></div>
        </div>
    `;

  return card;
}

// Course and lecture management
let currentCourseId = null;
let currentLectureId = null;
let currentScreen = null; // Track current screen for back button navigation
let previousScreen = null; // Track previous screen for back navigation
let previousScreenData = null; // Store data needed to navigate back
let uploadedFile = null;
let uploadedVideoFile = null;
let uploadedMaterialsFile = null;

async function refreshTopicKnowledge() {
  // Redirect to the new comprehensive function
  await refreshCourseOverview();
}

async function refreshCourseOverview() {
  // Get the container elements
  const actionItemsContainer = document.getElementById("action-items-container");
  const unifiedTopicPills = document.getElementById("unified-topic-pills");

  // If we're not on the course hub overview tab, skip
  if (!actionItemsContainer && !unifiedTopicPills) {
    return;
  }

  if (!currentCourseId) {
    // Show empty state
    if (actionItemsContainer) {
      actionItemsContainer.innerHTML = `
        <div class="bg-white/80 backdrop-blur-sm p-6 rounded-xl shadow-md text-center col-span-2">
          <p class="text-gray-500">No course selected. Please select a course to view overview data.</p>
        </div>`;
    }
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/classes/${currentCourseId}/overview`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // Render Action Items
    if (actionItemsContainer) {
      renderActionItems(actionItemsContainer, data.action_items || []);
    }

    // Render Unified Topic Pills (merge student understanding and course coverage)
    if (unifiedTopicPills) {
      renderUnifiedTopicPills(unifiedTopicPills, data.student_understanding || [], data.course_coverage || []);
    }

  } catch (error) {
    console.error("Error refreshing course overview:", error);

    // Show error state
    if (actionItemsContainer) {
      actionItemsContainer.innerHTML = `
        <div class="bg-white/80 backdrop-blur-sm p-6 rounded-xl shadow-md text-center col-span-2">
          <p class="text-gray-500">Unable to load overview data. Make sure lectures have been analyzed.</p>
        </div>`;
    }
    if (unifiedTopicPills) {
      unifiedTopicPills.innerHTML = `<p class="text-gray-500 text-sm">No topic data available yet. Analyze some lectures to see topics.</p>`;
    }
  }
}

function renderActionItems(container, actionItems) {
  if (!actionItems || actionItems.length === 0) {
    container.innerHTML = `
      <div class="bg-white/80 backdrop-blur-sm p-6 rounded-xl shadow-md text-center col-span-2">
        <p class="text-gray-500">No action items yet. Analyze some lectures to get AI-generated recommendations.</p>
      </div>`;
    return;
  }

  const priorityConfig = {
    critical: { border: "border-red-500", bg: "bg-red-100", text: "text-red-600", icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" },
    warning: { border: "border-yellow-500", bg: "bg-yellow-100", text: "text-yellow-600", icon: "M12 9v3.75m9.303 3.376c-.866 1.5-2.217 3.374-1.948 3.374h-14.71c-1.73 0-2.813-1.874-1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" },
    success: { border: "border-green-500", bg: "bg-green-100", text: "text-green-600", icon: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" }
  };

  let html = "";
  // Render up to 4 items (keep the original compact view) and keep cards clickable
  actionItems.slice(0, 4).forEach(item => {
    const config = priorityConfig[item.priority] || priorityConfig.warning;
    // If the item has a source lecture, make the whole card clickable to navigate there
    const clickableStart = item.lecture_id ? `<a onclick="showLectureAnalysis('${item.lecture_id}')" class="block hover:shadow-lg rounded-lg focus:outline-none">` : '<div>';
    const clickableEnd = item.lecture_id ? `</a>` : '</div>';

    html += `
      ${clickableStart}
      <div class="bg-white/80 backdrop-blur-sm p-4 rounded-xl shadow-sm border-l-4 ${config.border} transition-transform hover:-translate-y-0.5">
        <div class="flex items-start gap-3">
          <span class="flex-shrink-0 w-8 h-8 rounded-full ${config.bg} flex items-center justify-center mt-1">
            <svg class="w-5 h-5 ${config.text}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="${config.icon}" />
            </svg>
          </span>
          <div>
            <h3 class="text-sm font-semibold text-gray-900">${escapeHtml(item.title)}</h3>
            <p class="text-gray-600 mb-1 text-sm">${escapeHtml(item.description || '').substring(0, 180)}${(item.description || '').length > 180 ? '...' : ''}</p>
            ${item.lecture_title ? `<p class="text-xs text-gray-400">From: ${escapeHtml(item.lecture_title)}</p>` : ''}
          </div>
        </div>
      </div>
      ${clickableEnd}`;
  });

  container.innerHTML = html;
}

// Unified topic pills - shows covered topics with understanding colors, uncovered as grey
function renderUnifiedTopicPills(container, studentUnderstanding, courseCoverage) {
  // Build a map of topic -> understanding status from analyzed topics
  const understandingMap = {};
  (studentUnderstanding || []).forEach(item => {
    understandingMap[item.topic.toLowerCase()] = {
      status: item.status,
      lecture_id: item.lecture_id
    };
  });

  // Merge coverage data with understanding data
  const allTopics = [];
  const seenTopics = new Set();

  // First, add all topics from course coverage (this includes both covered and planned)
  (courseCoverage || []).forEach(item => {
    const topicLower = item.topic.toLowerCase();
    if (!seenTopics.has(topicLower)) {
      seenTopics.add(topicLower);
      const understanding = understandingMap[topicLower];
      allTopics.push({
        topic: item.topic,
        covered: item.covered,
        status: understanding ? understanding.status : null,
        lecture_id: item.lecture_id || (understanding ? understanding.lecture_id : null)
      });
    }
  });

  // Add any topics from student understanding that weren't in coverage
  (studentUnderstanding || []).forEach(item => {
    const topicLower = item.topic.toLowerCase();
    if (!seenTopics.has(topicLower)) {
      seenTopics.add(topicLower);
      allTopics.push({
        topic: item.topic,
        covered: true, // If it's in understanding, it was analyzed
        status: item.status,
        lecture_id: item.lecture_id
      });
    }
  });

  if (allTopics.length === 0) {
    container.innerHTML = `<p class="text-gray-500 text-sm">No topics available yet. Analyze some lectures to see topic coverage.</p>`;
    return;
  }

  const statusConfig = {
    strong: { class: "bg-green-500 text-white", display: "Strong" },
    developing: { class: "bg-yellow-500 text-white", display: "Good" },
    struggling: { class: "bg-red-500 text-white", display: "Struggling" }
  };

  let html = "";
  allTopics.forEach(item => {
    const escapedTopic = escapeHtml(item.topic);
    const lectureIdAttr = item.lecture_id ? `'${item.lecture_id}'` : 'null';
    const reasonAttr = item.reason ? `'${escapeHtml(item.reason).replace(/'/g, "\\'")}'` : 'null';

    if (item.covered && item.status) {
      // Covered in video with understanding status - show colored based on understanding
      const config = statusConfig[item.status] || statusConfig.developing;
      html += `<button onclick="showTopicDetail('${escapedTopic.replace(/'/g, "\\'")}', '${config.display}', ${lectureIdAttr}, this, ${reasonAttr})" class="topic-pill py-3 px-5 rounded-full ${config.class} font-medium shadow-sm hover:opacity-90 transition-opacity">${escapedTopic}</button>`;
    } else if (item.covered) {
      // Covered in video but no understanding data yet - show as developing
      html += `<button onclick="showTopicDetail('${escapedTopic.replace(/'/g, "\\'")}', 'Developing', ${lectureIdAttr}, this)" class="topic-pill py-3 px-5 rounded-full bg-yellow-500 text-white font-medium shadow-sm hover:opacity-90 transition-opacity">${escapedTopic}</button>`;
    } else {
      // Not covered in video yet (only in slides/materials) - show greyed out
      html += `<button onclick="showTopicDetail('${escapedTopic.replace(/'/g, "\\'")}', 'Not Covered', ${lectureIdAttr}, this)" class="topic-pill py-3 px-5 rounded-full bg-gray-300 text-gray-600 font-medium border border-gray-400 hover:bg-gray-400 transition-colors">${escapedTopic}</button>`;
    }
  });

  container.innerHTML = html;
}

// Keep old functions for backward compatibility (they may be used elsewhere)
function renderStudentUnderstandingPills(container, topics) {
  if (!topics || topics.length === 0) {
    container.innerHTML = `<p class="text-gray-500 text-sm">No topic data available yet. Analyze some lectures to see topic understanding.</p>`;
    return;
  }

  const statusConfig = {
    struggling: { class: "bg-red-500 text-white", display: "Struggling" },
    developing: { class: "bg-yellow-500 text-white", display: "Good" },
    strong: { class: "bg-green-500 text-white", display: "Strong" }
  };

  let html = "";
  topics.forEach(topic => {
    const config = statusConfig[topic.status] || statusConfig.developing;
    const escapedTopic = escapeHtml(topic.topic);
    const escapedStatus = config.display;
    const lectureIdAttr = topic.lecture_id ? `'${topic.lecture_id}'` : 'null';
    html += `<button onclick="showTopicDetail('${escapedTopic.replace(/'/g, "\\'")}', '${escapedStatus}', ${lectureIdAttr}, this)" class="topic-pill py-3 px-5 rounded-full ${config.class} font-medium shadow-sm hover:opacity-90 transition-opacity">${escapedTopic}</button>`;
  });

  container.innerHTML = html;
}

function renderCourseCoveragePills(container, coverage) {
  if (!coverage || coverage.length === 0) {
    container.innerHTML = `<p class="text-gray-500 text-sm">No coverage data available yet. Analyze some lectures to see course coverage.</p>`;
    return;
  }

  let html = "";
  coverage.forEach(item => {
    const escapedTopic = escapeHtml(item.topic);
    const lectureIdAttr = item.lecture_id ? `'${item.lecture_id}'` : 'null';
    if (item.covered) {
      html += `<button onclick="showTopicDetail('${escapedTopic.replace(/'/g, "\\'")}', 'Covered', ${lectureIdAttr}, this)" class="topic-pill py-3 px-5 rounded-full text-white font-medium shadow-sm course-coverage-gradient hover:opacity-90 transition-opacity">${escapedTopic}</button>`;
    } else {
      html += `<button onclick="showTopicDetail('${escapedTopic.replace(/'/g, "\\'")}', 'Planned', ${lectureIdAttr}, this)" class="topic-pill py-3 px-5 rounded-full text-gray-700 font-medium bg-gray-200 border border-gray-300 hover:bg-gray-300 transition-colors">${escapedTopic}</button>`;
    }
  });

  container.innerHTML = html;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function addNewLecture() {
  if (!currentCourseId) {
    alert("Please select a course first.");
    return;
  }

  // Show the modal to get the lecture name
  showModal("modal-add-lecture");
}

async function handleAddLecture(event) {
  event.preventDefault();

  const form = event.target;
  const formData = new FormData(form);
  const submitButton = form.querySelector('button[type="submit"]');
  const originalButtonText = submitButton.textContent;

  const lectureTitle = formData.get("lecture-name").trim();

  if (!lectureTitle) {
    alert("Please enter a lecture name.");
    return;
  }

  // Disable submit button and show loading state
  submitButton.disabled = true;
  submitButton.textContent = "Creating...";

  try {
    const formDataToSend = new FormData();
    formDataToSend.append("title", lectureTitle);
    formDataToSend.append("topics", JSON.stringify([]));
    if (currentCourseId) {
      formDataToSend.append("classId", currentCourseId);
    }

    const response = await fetch(`${API_BASE_URL}/lectures`, {
      method: "POST",
      body: formDataToSend,
    });

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ detail: "Unknown error" }));
      throw new Error(
        errorData.detail || `HTTP error! status: ${response.status}`
      );
    }

    const savedLecture = await response.json();
    currentLectureId = savedLecture.id;
    uploadedFile = null;
    uploadedVideoFile = null;

    // Re-enable submit button and reset text
    submitButton.disabled = false;
    submitButton.textContent = originalButtonText;

    // Reset form and close modal
    form.reset();
    hideModal("modal-add-lecture");

    // Navigate to the edit screen
    showScreen("screen-lecture-edit", document.getElementById("nav-courses"));

    // Update the title input with the saved lecture title and breadcrumb
    setTimeout(async () => {
      // Update breadcrumb course name - select the span with onclick that contains screen-course-hub
      const courseBreadcrumb = document.querySelector(
        "#screen-lecture-edit .text-sm.text-gray-600 span[onclick*='screen-course-hub']"
      );
      if (courseBreadcrumb && currentCourseId) {
        try {
          const courseResponse = await fetch(`${API_BASE_URL}/classes/${currentCourseId}`);
          if (courseResponse.ok) {
            const courseData = await courseResponse.json();
            const courseName = courseData.code ? `${courseData.code} - ${courseData.name}` : courseData.name;
            courseBreadcrumb.textContent = courseName;
            // Update onclick to navigate to the correct course
            courseBreadcrumb.setAttribute('onclick', `navigateToCourseHub('${currentCourseId}')`);
          }
        } catch (error) {
          console.error("Error fetching course for breadcrumb:", error);
        }
      }

      const titleInput = document.getElementById("lecture-title-input");
      const topicList = document.getElementById("lecture-topic-list");
      const fileInfo = document.getElementById("uploaded-file-info");
      const videoInfo = document.getElementById("uploaded-video-info");

      if (titleInput) titleInput.value = lectureTitle;
      if (topicList) topicList.innerHTML = "";
      if (fileInfo) {
        fileInfo.classList.add("hidden");
        const fileNameEl = document.getElementById("uploaded-file-name");
        if (fileNameEl) fileNameEl.textContent = "";
      }
      if (videoInfo) {
        videoInfo.classList.add("hidden");
        const videoNameEl = document.getElementById("uploaded-video-name");
        if (videoNameEl) videoNameEl.textContent = "";
      }
    }, 100);
  } catch (error) {
    console.error("Error creating lecture:", error);

    // Re-enable submit button and reset text
    submitButton.disabled = false;
    submitButton.textContent = originalButtonText;

    alert(
      `Failed to create lecture: ${error.message}\n\nNote: Make sure your backend API is running at http://localhost:8001`
    );
  }
}

function handleFileUpload(event) {
  const file = event.target.files[0];
  if (file) {
    processUploadedFile(file);
  }
}

function handleFileUploadWithAnalysis(event) {
  const file = event.target.files[0];
  if (file) {
    uploadedFile = file;

    // Show file info
    const fileInfo = document.getElementById("uploaded-file-info");
    const fileName = document.getElementById("uploaded-file-name");
    if (fileInfo && fileName) {
      fileName.textContent = file.name;
      fileInfo.classList.remove("hidden");
    }

    // Show the analyze button (works for both edit and planning screens)
    const analyzeBtn =
      document.getElementById("analyze-materials-btn-edit") ||
      document.getElementById("analyze-materials-btn");
    if (analyzeBtn) {
      analyzeBtn.classList.remove("hidden");
    }
  }
}

function handleMaterialsUploadWithButton(event) {
  const file = event.target.files[0];
  if (file) {
    uploadedMaterialsFile = file;

    // Show file info
    const materialsInfo = document.getElementById("uploaded-materials-info");
    const materialsName = document.getElementById("uploaded-materials-name");
    if (materialsInfo && materialsName) {
      materialsName.textContent = file.name;
      materialsInfo.classList.remove("hidden");
    }

    // Show the analyze button
    const analyzeBtn = document.getElementById("analyze-materials-btn");
    if (analyzeBtn) {
      analyzeBtn.classList.remove("hidden");
    }
  }
}

function handleMaterialsDrop(event) {
  event.preventDefault();
  event.stopPropagation();

  const uploadArea = event.currentTarget;
  uploadArea.classList.remove("border-indigo-500", "bg-indigo-50");

  const files = event.dataTransfer.files;
  if (files.length > 0) {
    const file = files[0];
    // Check if it's a valid file type
    const validTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.ms-powerpoint",
    ];
    if (
      validTypes.includes(file.type) ||
      file.name.endsWith(".pdf") ||
      file.name.endsWith(".pptx") ||
      file.name.endsWith(".ppt")
    ) {
      uploadedMaterialsFile = file;

      // Update the file input
      const fileInput = document.getElementById("materials-file-upload");
      if (fileInput) {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInput.files = dataTransfer.files;
      }

      // Show file info
      const materialsInfo = document.getElementById("uploaded-materials-info");
      const materialsName = document.getElementById("uploaded-materials-name");
      if (materialsInfo && materialsName) {
        materialsName.textContent = file.name;
        materialsInfo.classList.remove("hidden");
      }

      // Show the analyze button
      const analyzeBtn = document.getElementById("analyze-materials-btn");
      if (analyzeBtn) {
        analyzeBtn.classList.remove("hidden");
      }
    } else {
      alert("Please upload a PDF or PowerPoint file (.pdf, .ppt, .pptx)");
    }
  }
}

function removeUploadedMaterialsFile(event) {
  event.stopPropagation();
  uploadedMaterialsFile = null;

  const fileInput = document.getElementById("materials-file-upload");
  const materialsInfo = document.getElementById("uploaded-materials-info");
  const analyzeBtn = document.getElementById("analyze-materials-btn");

  if (fileInput) fileInput.value = "";
  if (materialsInfo) {
    materialsInfo.classList.add("hidden");
    document.getElementById("uploaded-materials-name").textContent = "";
  }
  if (analyzeBtn) {
    analyzeBtn.classList.add("hidden");
  }
}

async function handleMaterialsUpload(event) {
  const file = event.target.files[0];
  if (file) {
    // Process the uploaded file
    processUploadedFile(file);

    // If we're in the planning screen and have a lecture ID, analyze immediately
    const planningScreen = document.getElementById("screen-lecture-planning");
    if (
      planningScreen &&
      !planningScreen.classList.contains("hidden") &&
      currentLectureId
    ) {
      // Show confirmation
      const shouldAnalyze = confirm(
        "Would you like to analyze this file to extract topics automatically?"
      );
      if (shouldAnalyze) {
        await analyzeMaterials(currentLectureId, file);
      }
    }
  }
}

async function analyzeMaterials(lectureId, materialsFile = null) {
  // Use the passed file, or check both uploadedFile (lecture slides) and uploadedMaterialsFile (materials)
  const fileToAnalyze = materialsFile || uploadedMaterialsFile || uploadedFile;

  if (!lectureId) {
    alert("Please save the lecture first before analyzing materials.");
    return;
  }

  if (!fileToAnalyze) {
    alert("No materials file available. Please upload materials first.");
    hideMaterialsLoadingScreen();
    return;
  }

  // Prevent double-submission
  const existingOverlay = document.getElementById("materials-loading-overlay");
  if (existingOverlay) {
    return;
  }

  // Show loading modal
  showMaterialsLoadingScreen();

  try {
    const formData = new FormData();

    // Append materials file
    formData.append("materials", fileToAnalyze);

    const response = await fetch(
      `${API_BASE_URL}/lectures/${lectureId}/analyze-materials`,
      {
        method: "POST",
        body: formData,
      }
    );

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ detail: "Unknown error" }));
      throw new Error(
        errorData.detail || `HTTP error! status: ${response.status}`
      );
    }

    const result = await response.json();

    // Hide loading modal
    hideMaterialsLoadingScreen();

    // Update the UI with extracted topics
    if (result.analysis && result.analysis.topics && result.analysis.topics.length > 0) {
      // Pass the FULL rich topic objects!
      updateTopicsList(result.analysis.topics);
    } else if (result.extracted_topics && result.extracted_topics.length > 0) {
      // Fallback to string list
      updateTopicsList(result.extracted_topics);
    }

    // Handle Slide Recommendations
    if (result.analysis && result.analysis.recommendations && result.analysis.recommendations.length > 0) {
      renderRecommendations(result.analysis.recommendations);
    }

    // Success alert logic
    const scrollPosition = window.scrollY;
    let message = "Materials analyzed successfully!";
    if (result.extracted_topics && result.extracted_topics.length > 0) {
      message += ` Found ${result.extracted_topics.length} topics.`;
    }
    if (result.analysis && result.analysis.recommendations && result.analysis.recommendations.length > 0) {
      message += `\n\nCheck below for ${result.analysis.recommendations.length} slide improvement recommendations.`;
    }

    alert(message);

    setTimeout(() => {
      window.scrollTo(0, scrollPosition);
      // Scroll to recommendations if they exist
      const recSection = document.getElementById("slide-recommendations-section");
      if (recSection && result.analysis && result.analysis.recommendations && result.analysis.recommendations.length > 0) {
        recSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 0);

    return result;
  } catch (error) {
    console.error("Error analyzing materials:", error);
    hideMaterialsLoadingScreen();

    // Store scroll position before showing alert
    const scrollPosition = window.scrollY;

    alert(
      `Failed to analyze materials: ${error.message}\n\nNote: Make sure your backend API is running at http://localhost:8001`
    );

    // Restore scroll position after alert is dismissed
    window.scrollTo(0, scrollPosition);

    return null;
  }
}

function showMaterialsLoadingScreen() {
  // Create loading overlay
  const overlay = document.createElement("div");
  overlay.id = "materials-loading-overlay";
  overlay.className =
    "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50";
  overlay.innerHTML = `
        <div class="bg-white rounded-xl p-8 max-w-md mx-4 text-center shadow-2xl">
            <div class="mb-6">
                <svg class="w-16 h-16 mx-auto text-indigo-600 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            </div>
            <h3 class="text-2xl font-bold text-gray-900 mb-2">Analyzing Materials...</h3>
            <p class="text-gray-600 mb-4">Praxis AI is analyzing your lecture materials to extract topics and learning objectives.</p>
            <div class="flex items-center justify-center gap-2 text-sm text-gray-500">
                <div class="w-2 h-2 bg-indigo-600 rounded-full animate-pulse"></div>
                <div class="w-2 h-2 bg-indigo-600 rounded-full animate-pulse" style="animation-delay: 0.2s"></div>
                <div class="w-2 h-2 bg-indigo-600 rounded-full animate-pulse" style="animation-delay: 0.4s"></div>
            </div>
            <p class="text-xs text-gray-500 mt-4">This may take 30-60 seconds...</p>
        </div>
    `;
  document.body.appendChild(overlay);
}

function hideMaterialsLoadingScreen() {
  const overlay = document.getElementById("materials-loading-overlay");
  if (overlay) {
    overlay.remove();
  }
}

function updateTopicsList(topics) {
  // Try to find the topic list - could be in either planning or edit screen
  const topicList =
    document.getElementById("manual-topic-list") ||
    document.getElementById("lecture-topic-list");

  if (!topicList) {
    console.warn("Could not find topic list container");
    return;
  }

  // Clear existing dynamic topics (keep manual ones if any)
  topicList.innerHTML = "";

  // Pastel colors for variety
  const colorSchemes = [
    { bg: "bg-blue-50", border: "border-blue-100", text: "text-blue-800", badge: "bg-blue-100 text-blue-700" },
    { bg: "bg-purple-50", border: "border-purple-100", text: "text-purple-800", badge: "bg-purple-100 text-purple-700" },
    { bg: "bg-rose-50", border: "border-rose-100", text: "text-rose-800", badge: "bg-rose-100 text-rose-700" },
    { bg: "bg-amber-50", border: "border-amber-100", text: "text-amber-800", badge: "bg-amber-100 text-amber-700" },
    { bg: "bg-emerald-50", border: "border-emerald-100", text: "text-emerald-800", badge: "bg-emerald-100 text-emerald-700" },
    { bg: "bg-indigo-50", border: "border-indigo-100", text: "text-indigo-800", badge: "bg-indigo-100 text-indigo-700" },
  ];

  topics.forEach((topic, index) => {
    // Determine if topic is a string or an object
    const isObject = typeof topic === "object" && topic !== null;
    const topicName = isObject ? topic.name : topic;
    const colors = colorSchemes[index % colorSchemes.length];

    // Create a container for the card
    const topicCard = document.createElement("div");

    // Base classes for the card - using the color scheme
    topicCard.className = `group w-full ${colors.bg} border ${colors.border} rounded-lg p-3 hover:shadow-md transition-all cursor-pointer relative overflow-hidden`;

    if (isObject) {
      // RICH TOPIC CARD
      const description = topic.description || "No description available.";
      const subtopics = topic.subtopics || [];
      const keyConcepts = topic.key_concepts || [];
      const time = topic.estimated_time || "";

      // Unique ID for toggling
      const topicId = "topic-" + Math.random().toString(36).substr(2, 9);

      topicCard.innerHTML = `
            <div class="flex justify-between items-start mb-1" onclick="toggleTopicDetails('${topicId}')">
                <div class="flex flex-col gap-1 flex-grow min-w-0 mr-2">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-semibold ${colors.text} text-sm leading-tight">${topicName}</span>
                        ${time ? `<span class="text-[10px] px-1.5 py-0.5 bg-white/60 ${colors.text} rounded-full font-medium whitespace-normal max-w-full">${time}</span>` : ''}
                    </div>
                </div>
                <div class="flex items-center gap-1 flex-shrink-0">
                    <button class="text-gray-400 hover:text-gray-600 transition-colors transform duration-200" id="btn-${topicId}">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    <button onclick="event.stopPropagation(); removeTopicPill(this)" class="text-gray-300 hover:text-red-500 transition-colors ml-1">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
            </div>
            
            <!-- Collapsed Description (Truncated) -->
            <p class="text-xs text-gray-500 line-clamp-2 group-hover:text-gray-700 transition-colors" onclick="toggleTopicDetails('${topicId}')">${description}</p>
            
            <!-- Expanded Details -->
            <div id="${topicId}" class="hidden mt-3 pt-3 border-t ${colors.border} space-y-3">
                <!-- Full Description -->
                <p class="text-xs text-gray-600 italic">${description}</p>

                ${subtopics.length > 0 ? `
                <div>
                    <p class="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1">Subtopics</p>
                    <ul class="text-xs text-gray-600 list-disc list-inside space-y-1 pl-1">
                        ${subtopics.map(st => `<li>${st}</li>`).join('')}
                    </ul>
                </div>
                ` : ''}
                
                ${keyConcepts.length > 0 ? `
                <div>
                    <p class="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1">Key Concepts</p>
                    <div class="flex flex-wrap gap-1.5">
                        ${keyConcepts.map(kc => `<span class="px-2 py-0.5 bg-white ${colors.text} border ${colors.border} text-[10px] rounded-md font-medium shadow-sm">${kc}</span>`).join('')}
                    </div>
                </div>
                ` : ''}
            </div>
        `;
    } else {
      // SIMPLE TOPIC PILL (Legacy / Manual)
      topicCard.className = `py-2 px-3 rounded-lg ${colors.bg} border ${colors.border} ${colors.text} text-sm font-medium flex items-center justify-between hover:shadow-sm transition-all`;
      topicCard.innerHTML = `
            <span>${topicName}</span>
            <button onclick="removeTopicPill(this)" class="text-gray-400 hover:text-red-600 ml-2">
                <svg class="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        `;
    }

    topicList.appendChild(topicCard);
  });
}

function toggleTopicDetails(id) {
  const content = document.getElementById(id);
  const btn = document.getElementById('btn-' + id);

  if (content.classList.contains('hidden')) {
    content.classList.remove('hidden');
    if (btn) btn.classList.add('rotate-180');
  } else {
    content.classList.add('hidden');
    if (btn) btn.classList.remove('rotate-180');
  }
}

function removeTopicPill(button) {
  if (button && button.parentElement) {
    button.parentElement.remove();
  }
}

function handleFileDrop(event) {
  event.preventDefault();
  event.stopPropagation();

  const uploadArea = event.currentTarget;
  uploadArea.classList.remove("border-indigo-500", "bg-indigo-50");

  const files = event.dataTransfer.files;
  if (files.length > 0) {
    const file = files[0];
    // Check if it's a valid file type
    const validTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.ms-powerpoint",
    ];
    if (
      validTypes.includes(file.type) ||
      file.name.endsWith(".pdf") ||
      file.name.endsWith(".pptx") ||
      file.name.endsWith(".ppt")
    ) {
      processUploadedFile(file);
      // Update the file input
      const fileInput = document.getElementById("lecture-slides-upload");
      if (fileInput) {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInput.files = dataTransfer.files;
      }

      // Trigger analysis if in planning screen
      const planningScreen = document.getElementById("screen-lecture-planning");
      if (
        planningScreen &&
        !planningScreen.classList.contains("hidden") &&
        currentLectureId
      ) {
        const shouldAnalyze = confirm(
          "Would you like to analyze this file to extract topics automatically?"
        );
        if (shouldAnalyze) {
          analyzeMaterials(currentLectureId, file);
        }
      }
    } else {
      alert("Please upload a PDF or PowerPoint file (.pdf, .ppt, .pptx)");
    }
  }
}

function processUploadedFile(file) {
  uploadedFile = file;
  const fileInfo = document.getElementById("uploaded-file-info");
  const fileName = document.getElementById("uploaded-file-name");

  if (fileInfo && fileName) {
    fileName.textContent = file.name;
    fileInfo.classList.remove("hidden");
  }
}

function removeUploadedFile() {
  uploadedFile = null;
  const fileInput = document.getElementById("lecture-slides-upload");
  const fileInfo = document.getElementById("uploaded-file-info");

  if (fileInput) fileInput.value = "";
  if (fileInfo) {
    fileInfo.classList.add("hidden");
    document.getElementById("uploaded-file-name").textContent = "";
  }
}

function handleVideoUpload(event) {
  const file = event.target.files[0];
  if (file) {
    processUploadedVideoFile(file);
    // Also update the planning screen if it exists
    const planningVideoInfo = document.getElementById(
      "uploaded-video-info-planning"
    );
    const planningVideoName = document.getElementById(
      "uploaded-video-name-planning"
    );
    if (planningVideoInfo && planningVideoName) {
      planningVideoName.textContent = file.name;
      planningVideoInfo.classList.remove("hidden");
    }
  }
}

function handleVideoDrop(event) {
  event.preventDefault();
  event.stopPropagation();

  const uploadArea = event.currentTarget;
  uploadArea.classList.remove("border-indigo-500", "bg-indigo-50");

  const files = event.dataTransfer.files;
  if (files.length > 0) {
    const file = files[0];
    // Check if it's a video file
    if (
      file.type.startsWith("video/") ||
      file.name.match(/\.(mp4|mov|avi|mkv|webm|flv|wmv)$/i)
    ) {
      processUploadedVideoFile(file);
      // Update the file inputs (both edit and planning screens)
      const fileInput = document.getElementById("lecture-video-upload");
      const planningFileInput = document.getElementById(
        "lecture-video-upload-planning"
      );
      if (fileInput) {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInput.files = dataTransfer.files;
      }
      if (planningFileInput) {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        planningFileInput.files = dataTransfer.files;
      }
    } else {
      alert(
        "Please upload a video file (.mp4, .mov, .avi, .mkv, .webm, .flv, .wmv)"
      );
    }
  }
}

function processUploadedVideoFile(file) {
  uploadedVideoFile = file;
  const fileInfo = document.getElementById("uploaded-video-info");
  const fileName = document.getElementById("uploaded-video-name");
  const planningVideoInfo = document.getElementById(
    "uploaded-video-info-planning"
  );
  const planningVideoName = document.getElementById(
    "uploaded-video-name-planning"
  );

  if (fileInfo && fileName) {
    fileName.textContent = file.name;
    fileInfo.classList.remove("hidden");

    // Show video preview
    const videoPreviewContainer = document.getElementById(
      "video-preview-container"
    );
    const videoPreview = document.getElementById("video-preview");
    const submitBtn = document.getElementById("submit-analysis-btn");

    if (videoPreviewContainer && videoPreview) {
      const videoUrl = URL.createObjectURL(file);
      videoPreview.src = videoUrl;
      videoPreviewContainer.classList.remove("hidden");
    }

    if (submitBtn) {
      submitBtn.classList.remove("hidden");
    }
  }
  if (planningVideoInfo && planningVideoName) {
    planningVideoName.textContent = file.name;
    planningVideoInfo.classList.remove("hidden");
  }
}

function removeUploadedVideoFile() {
  uploadedVideoFile = null;
  const fileInput = document.getElementById("lecture-video-upload");
  const planningFileInput = document.getElementById(
    "lecture-video-upload-planning"
  );
  const fileInfo = document.getElementById("uploaded-video-info");
  const planningVideoInfo = document.getElementById(
    "uploaded-video-info-planning"
  );
  const videoPreviewContainer = document.getElementById(
    "video-preview-container"
  );
  const videoPreview = document.getElementById("video-preview");
  const submitBtn = document.getElementById("submit-analysis-btn");

  if (fileInput) fileInput.value = "";
  if (planningFileInput) planningFileInput.value = "";
  if (fileInfo) {
    fileInfo.classList.add("hidden");
    document.getElementById("uploaded-video-name").textContent = "";
  }
  if (planningVideoInfo) {
    planningVideoInfo.classList.add("hidden");
    document.getElementById("uploaded-video-name-planning").textContent = "";
  }
  if (videoPreviewContainer) {
    videoPreviewContainer.classList.add("hidden");
  }
  if (videoPreview) {
    videoPreview.src = "";
    // Revoke object URL to free memory
    if (videoPreview.src.startsWith("blob:")) {
      URL.revokeObjectURL(videoPreview.src);
    }
  }
  if (submitBtn) {
    submitBtn.classList.add("hidden");
  }
}

function addLectureTopic() {
  const input = document.getElementById("lecture-topic-input");
  const topicList = document.getElementById("lecture-topic-list");

  if (input && topicList) {
    const topicName = input.value.trim();
    if (topicName) {
      // Check if topic already exists
      const existingTopics = Array.from(topicList.children).map((el) =>
        el.textContent.trim()
      );
      if (existingTopics.includes(topicName)) {
        alert("This topic is already added.");
        return;
      }

      const topicPill = document.createElement("div");
      topicPill.className =
        "py-3 px-5 rounded-full text-gray-700 font-medium bg-gray-200 border border-gray-300 flex items-center gap-2";
      topicPill.innerHTML = `
                <span>${topicName}</span>
                <button onclick="removeLectureTopic(this)" class="text-red-600 hover:text-red-800 ml-1">
                    <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            `;
      topicList.appendChild(topicPill);
      input.value = "";
    }
  }
}

function removeLectureTopic(button) {
  if (button && button.parentElement) {
    button.parentElement.remove();
  }
}

function addPriorityTopic(topicName) {
  const input = document.getElementById("lecture-topic-input");
  if (input) {
    input.value = topicName;
    addLectureTopic();
  }
}

async function saveLecture() {
  const titleInput = document.getElementById("lecture-title-input");
  const topicList = document.getElementById("lecture-topic-list");
  const saveButton = document.querySelector('button[onclick="saveLecture()"]');

  if (!titleInput) return;

  const title = titleInput.value.trim();
  if (!title) {
    alert("Please enter a lecture title.");
    return;
  }

  // Collect topics
  const topics = Array.from(topicList.children)
    .map((el) => {
      const textNode = el.querySelector("span");
      return textNode ? textNode.textContent.trim() : "";
    })
    .filter((t) => t);

  // Disable save button and show loading
  if (saveButton) {
    saveButton.disabled = true;
    const originalText = saveButton.innerHTML;
    saveButton.innerHTML =
      '<svg class="w-5 h-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Saving...';

    try {
      const formData = new FormData();
      formData.append("title", title);
      formData.append("topics", JSON.stringify(topics));
      if (currentCourseId) {
        formData.append("classId", currentCourseId);
      }

      // Add slides file if uploaded
      if (uploadedFile) {
        formData.append("file", uploadedFile);
      }

      // Add video file if uploaded
      if (uploadedVideoFile) {
        formData.append("video", uploadedVideoFile);
      }

      let response;
      // If currentLectureId starts with 'lecture-', it's a temporary ID for a new lecture
      // Otherwise, it's an existing lecture ID from the server
      if (currentLectureId && currentLectureId.startsWith("lecture-")) {
        // This is a new lecture, create it
        response = await fetch(`${API_BASE_URL}/lectures`, {
          method: "POST",
          body: formData,
        });
      } else if (currentLectureId) {
        // Update existing lecture
        response = await fetch(`${API_BASE_URL}/lectures/${currentLectureId}`, {
          method: "PUT",
          body: formData,
        });
      } else {
        // No ID, create new lecture
        response = await fetch(`${API_BASE_URL}/lectures`, {
          method: "POST",
          body: formData,
        });
      }

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ detail: "Unknown error" }));
        throw new Error(
          errorData.detail || `HTTP error! status: ${response.status}`
        );
      }

      const savedLecture = await response.json();
      currentLectureId = savedLecture.id; // Update with server-generated ID

      // Show success message
      alert(`Lecture "${title}" has been saved!`);

      // Navigate back to course hub - need to fetch course data first
      const navCourses = document.getElementById("nav-courses");
      if (currentCourseId) {
        try {
          const courseResponse = await fetch(
            `${API_BASE_URL}/classes/${currentCourseId}`
          );
          if (courseResponse.ok) {
            const courseData = await courseResponse.json();
            await showScreen("screen-course-hub", navCourses, courseData);
          } else {
            await showScreen("screen-course-hub", navCourses);
          }
        } catch (error) {
          console.error("Error fetching course data:", error);
          await showScreen("screen-course-hub", navCourses);
        }
      } else {
        await showScreen("screen-course-hub", navCourses);
      }

      // Wait for the screen to be fully loaded before showing the tab
      setTimeout(() => {
        const tabBtnLectures = document.getElementById("tab-btn-lectures");
        if (tabBtnLectures) {
          showTab("tab-lectures", tabBtnLectures);
        } else {
          // If tab button not found, try to show tab anyway (it will find the button)
          showTab("tab-lectures", null);
        }
      }, 100);
    } catch (error) {
      console.error("Error saving lecture:", error);
      alert(
        `Failed to save lecture: ${error.message}\n\nNote: Make sure your backend API is running at http://localhost:8001`
      );

      // Re-enable button
      if (saveButton) {
        saveButton.disabled = false;
        saveButton.innerHTML = originalText;
      }
    }
  }
}

async function editLecture(lectureId) {
  try {
    const response = await fetch(`${API_BASE_URL}/lectures/${lectureId}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const lecture = await response.json();
    currentLectureId = lectureId;

    // Set currentCourseId from lecture
    if (lecture.classId) {
      currentCourseId = lecture.classId;
    } else if (lecture.class_id) {
      currentCourseId = lecture.class_id;
    }

    // Navigate to edit screen
    showScreen("screen-lecture-edit", document.getElementById("nav-courses"));

    // Populate the form and update breadcrumb
    setTimeout(async () => {
      // Update breadcrumb course name - select the span with onclick that contains screen-course-hub
      const courseBreadcrumb = document.querySelector(
        "#screen-lecture-edit .text-sm.text-gray-600 span[onclick*='screen-course-hub']"
      );
      if (courseBreadcrumb && currentCourseId) {
        try {
          const courseResponse = await fetch(`${API_BASE_URL}/classes/${currentCourseId}`);
          if (courseResponse.ok) {
            const courseData = await courseResponse.json();
            const courseName = courseData.code ? `${courseData.code} - ${courseData.name}` : courseData.name;
            courseBreadcrumb.textContent = courseName;
            // Update onclick to navigate to the correct course
            courseBreadcrumb.setAttribute('onclick', `navigateToCourseHub('${currentCourseId}')`);
          }
        } catch (error) {
          console.error("Error fetching course for breadcrumb:", error);
        }
      }
      const titleInput = document.getElementById("lecture-title-input");
      const topicList = document.getElementById("lecture-topic-list");

      if (titleInput) titleInput.value = lecture.title || "New Lecture";
      if (topicList) {
        topicList.innerHTML = "";
        if (lecture.topics && lecture.topics.length > 0) {
          lecture.topics.forEach((topic) => {
            const topicPill = document.createElement("div");
            topicPill.className =
              "py-3 px-5 rounded-full text-gray-700 font-medium bg-gray-200 border border-gray-300 flex items-center gap-2";
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
        uploadedFile = null; // Reset uploaded file since we're editing
        const fileInfo = document.getElementById("uploaded-file-info");
        const fileName = document.getElementById("uploaded-file-name");
        if (fileInfo && fileName) {
          fileName.textContent = lecture.fileName;
          fileInfo.classList.remove("hidden");
        }
      }

      // Show video info if video was uploaded
      if (lecture.hasVideo && lecture.videoName) {
        uploadedVideoFile = null; // Reset uploaded video since we're editing
        const videoInfo = document.getElementById("uploaded-video-info");
        const videoName = document.getElementById("uploaded-video-name");
        const videoPreviewContainer = document.getElementById(
          "video-preview-container"
        );
        const videoPreview = document.getElementById("video-preview");
        const submitBtn = document.getElementById("submit-analysis-btn");

        if (videoInfo && videoName) {
          videoName.textContent = lecture.videoName;
          videoInfo.classList.remove("hidden");
        }

        // Show video preview if video path exists
        if (lecture.videoPath && videoPreviewContainer && videoPreview) {
          // Serve video through API endpoint
          videoPreview.src = `${API_BASE_URL}/lectures/${lectureId}/video`;
          videoPreviewContainer.classList.remove("hidden");
        }

        if (submitBtn) {
          submitBtn.classList.remove("hidden");
        }
      }
    }, 100);
  } catch (error) {
    console.error("Error loading lecture:", error);
    alert(`Failed to load lecture: ${error.message}`);
  }
}

async function refreshLecturesList() {
  const tabLectures = document.getElementById("tab-lectures");
  if (!tabLectures) return;

  // Find Past Lectures and Upcoming Lectures sections
  const sections = tabLectures.querySelectorAll(".bg-white\\/80");
  let pastLecturesUl = null;
  let upcomingUl = document.getElementById("upcoming-lectures-list");

  // Find Past Lectures list (first section with ul)
  if (sections.length > 0) {
    const pastSection = sections[0];
    pastLecturesUl = pastSection.querySelector("ul");
  }

  // Fallback to finding upcoming lectures the old way
  if (!upcomingUl && sections.length >= 2) {
    upcomingUl = sections[1].querySelector("ul");
  }

  if (!pastLecturesUl || !upcomingUl) return;

  try {
    const url = currentCourseId
      ? `${API_BASE_URL}/lectures?class_id=${currentCourseId}`
      : `${API_BASE_URL}/lectures`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const lectures = await response.json();

    // Separate analyzed (past) and non-analyzed (upcoming) lectures
    const pastLectures = lectures.filter((l) => l.hasAnalysis === true);
    const upcomingLectures = lectures.filter((l) => !l.hasAnalysis);

    // Clear existing dynamic lectures from both lists
    pastLecturesUl.innerHTML = '';
    upcomingUl.innerHTML = '';

    // Add past lectures (analyzed)
    pastLectures.forEach((lecture) => {
      const li = document.createElement("li");
      li.innerHTML = `
                <a onclick="showLectureAnalysis('${lecture.id}')" class="flex justify-between items-center p-3 -m-3 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors">
                    <span class="font-medium text-gray-700">${lecture.title}</span>
                    <svg class="w-5 h-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                </a>`;
      pastLecturesUl.appendChild(li);
    });

    // Add upcoming lectures from API
    upcomingLectures.forEach((lecture) => {
      const li = document.createElement("li");
      li.innerHTML = `
                <a onclick="editLecture('${lecture.id}')" class="flex justify-between items-center p-3 -m-3 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors">
                    <span class="font-medium text-gray-700">${lecture.title}</span>
                    <svg class="w-5 h-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                </a>`;
      upcomingUl.appendChild(li);
    });
  } catch (error) {
    console.error("Error refreshing lectures list:", error);
  }
}

async function showLectureAnalysis(lectureId) {
  try {
    // --- FIX: Set the global lecture ID when loading the analysis page ---
    currentLectureId = lectureId;


    // Fetch lecture, analysis, survey data, survey responses, AND materials analysis
    const [lectureResponse, analysisResponse, surveysResponse, responsesResponse, materialsResponse] =
      await Promise.all([
        fetch(`${API_BASE_URL}/lectures/${lectureId}`),
        fetch(`${API_BASE_URL}/lectures/${lectureId}/analysis`),
        fetch(`${API_BASE_URL}/lectures/${lectureId}/surveys`), // Fetch existing surveys
        fetch(`${API_BASE_URL}/lectures/${lectureId}/survey-responses`), // Fetch survey responses
        fetch(`${API_BASE_URL}/lectures/${lectureId}/materials-analysis`).catch(() => ({ ok: false })), // Fetch materials analysis (optional)
      ]);

    if (!lectureResponse.ok) {
      throw new Error(`Failed to load lecture: ${lectureResponse.status}`);
    }

    if (!analysisResponse.ok) {
      throw new Error(`Failed to load analysis: ${analysisResponse.status}`);
    }

    // Surveys and responses can be empty, so we don't throw an error if not found
    const surveys = surveysResponse.ok ? await surveysResponse.json() : [];
    const responses = responsesResponse.ok ? await responsesResponse.json() : [];
    const materialsAnalysis = materialsResponse.ok ? await materialsResponse.json() : null;

    const lecture = await lectureResponse.json();
    const analysis = await analysisResponse.json();

    // Store the course ID from the lecture for back button navigation
    if (lecture.classId) {
      currentCourseId = lecture.classId;
    } else if (lecture.class_id) {
      currentCourseId = lecture.class_id;
    }

    // Navigate to analysis screen
    await showScreen(
      "screen-lecture-analysis",
      document.getElementById("nav-courses")
    );

    // Wait for the screen to be fully loaded before populating
    setTimeout(async () => {
      await populateAnalysisPage(lecture, analysis, surveys, responses, materialsAnalysis); // Pass surveys, responses, and materials analysis
    }, 100);
  } catch (error) {
    console.error("Error loading lecture analysis:", error);
    alert(`Failed to load lecture analysis: ${error.message}`);
  }
}

async function populateAnalysisPage(lecture, analysis, surveys = [], responses = []) {
  // Update title
  const titleElement = document.querySelector("#screen-lecture-analysis h1");
  if (titleElement) {
    titleElement.textContent = lecture.title;
  }

  // Update breadcrumb course name - select the span with onclick that contains screen-course-hub
  const courseBreadcrumb = document.querySelector(
    "#screen-lecture-analysis .text-sm.text-gray-600 span[onclick*='screen-course-hub']"
  );
  if (courseBreadcrumb && currentCourseId) {
    try {
      const courseResponse = await fetch(`${API_BASE_URL}/classes/${currentCourseId}`);
      if (courseResponse.ok) {
        const courseData = await courseResponse.json();
        const courseName = courseData.code ? `${courseData.code} - ${courseData.name}` : courseData.name;
        courseBreadcrumb.textContent = courseName;
        // Update onclick to navigate to the correct course
        courseBreadcrumb.setAttribute('onclick', `navigateToCourseHub('${currentCourseId}')`);
      }
    } catch (error) {
      console.error("Error fetching course for breadcrumb:", error);
    }
  }

  // Update breadcrumb last part
  const breadcrumbElement = document.querySelector(
    "#screen-lecture-analysis .text-sm.text-gray-600 span:last-child"
  );
  if (breadcrumbElement) {
    breadcrumbElement.textContent = `${lecture.title}: Analysis`;
  }

  // --- NEW: Update Action Buttons ---
  const surveyButtonContainer = document.getElementById(
    "survey-button-container"
  );
  if (surveyButtonContainer) {
    let buttonsHtml = "";

    // 1. View Plan Button
    buttonsHtml += `
            <button onclick="editLecture('${lecture.id}')"
                class="flex items-center gap-2 text-gray-700 font-semibold py-2 px-4 rounded-lg bg-white border border-gray-300 shadow-sm hover:bg-gray-50 transition-colors">
                <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2"
                    stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round"
                        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                View Plan & Materials
            </button>`;

    // 2. Survey Button (Dynamic)
    if (surveys && surveys.length > 0) {
      // Survey exists, show "View" button
      // We'll pass the latest survey to the view function
      const latestSurvey = surveys.sort(
        (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
      )[0];
      // Store survey_id for the onclick handler
      const surveyId = latestSurvey.survey_id || latestSurvey.id;
      buttonsHtml += `
                <button onclick="viewStudentSurveyById('${surveyId}')" class="flex items-center gap-2 text-white font-semibold py-2 px-4 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 shadow-md hover:opacity-90 transition-opacity">
                    <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    View Student Survey
                </button>
            `;
    } else {
      // No survey, show "Generate" button
      buttonsHtml += `
                <button onclick="showModal('modal-generate-survey')" class="flex items-center gap-2 text-white font-semibold py-2 px-4 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 shadow-md hover:opacity-90 transition-opacity">
                    <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                    </svg>
                    Generate Student Survey
                </button>
            `;
    }

    // 3. Rewind Button
    buttonsHtml += `
            <button onclick="openLectureRewind('${lecture.id}')"
                class="flex items-center gap-2 text-white font-semibold py-2 px-4 rounded-lg primary-gradient shadow-md hover:opacity-90 transition-opacity">
                <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2"
                    stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round"
                        d="M11.25 4.5l7.5 7.5-7.5 7.5m-6-15l7.5 7.5-7.5 7.5" />
                </svg>
                Launch Lecture Rewind
            </button>`;

    surveyButtonContainer.innerHTML = buttonsHtml;
  }

  // Update video player
  const videoContainer = document.getElementById("lecture-video-container");
  if (videoContainer && lecture.hasVideo) {
    const videoUrl = `${API_BASE_URL}/lectures/${lecture.id}/video`;

    // Clear the container and set up proper styling
    videoContainer.innerHTML = "";
    videoContainer.className = "bg-gray-900 rounded-xl shadow-md aspect-video";
    videoContainer.style.display = "block";
    videoContainer.style.position = "relative";
    videoContainer.style.overflow = "hidden";

    // Create video element programmatically and set src directly (more reliable than source element)
    const videoElement = document.createElement("video");
    videoElement.controls = true;
    videoElement.className = "w-full rounded-xl";
    videoElement.style.display = "block";
    videoElement.style.width = "100%";
    videoElement.style.height = "auto";
    videoElement.style.maxHeight = "100%";
    videoElement.style.objectFit = "contain";
    videoElement.preload = "metadata";
    videoElement.controlsList = "nodownload";

    // Set src directly on video element (this is the fix - more reliable than source element)
    videoElement.src = videoUrl;

    // Add error handler
    videoElement.addEventListener("error", (e) => {
      console.error("Video load error:", e);
      console.error("Video URL:", videoUrl);
      console.error("Video element error code:", videoElement.error?.code);
      console.error("Video element error message:", videoElement.error?.message);

      const errorMsg = document.createElement("div");
      errorMsg.className = "text-red-600 text-sm mt-2 p-2 bg-red-50 rounded";
      errorMsg.textContent = `Failed to load video. Please check if the file exists.`;
      videoContainer.appendChild(errorMsg);
    });

    // Add loaded event to verify it's working
    videoElement.addEventListener("loadedmetadata", () => {
      console.log("Video metadata loaded successfully");
    });

    // Make sure video is visible
    videoElement.style.visibility = "visible";
    videoElement.style.opacity = "1";

    // Append video element to container
    videoContainer.appendChild(videoElement);

    // Load the video
    videoElement.load();
  }

  // Populate timeline
  populateTimeline(analysis.timeline || {}, analysis.video_duration || 3600);

  // Populate transcript
  populateTranscript(analysis.transcript || []);

  // Populate topic coverage
  populateTopicCoverage(analysis.topic_coverage || []);

  // Populate AI reflections
  populateAIReflections(analysis.ai_reflections || {});

  // Populate student feedback
  populateStudentFeedback(responses, surveys);

  // --- Render class-level action items in the lecture analysis sidebar ---
  try {
    const lectureActionContainer = document.getElementById('lecture-action-items');
    if (lectureActionContainer && currentCourseId) {
      const resp = await fetch(`${API_BASE_URL}/classes/${currentCourseId}/overview`);
      if (resp.ok) {
        const overviewData = await resp.json();
        renderActionItems(lectureActionContainer, overviewData.action_items || []);
      }
    }
  } catch (err) {
    console.error('Error loading class overview action items:', err);
  }
}

function populateTimeline(timeline, videoDuration) {
  // Find the timeline container - it's inside the Analysis Timeline section
  const timelineSection = document.querySelector(
    "#screen-lecture-analysis .bg-white\\/80.backdrop-blur-sm.p-6.rounded-xl.shadow-md.overflow-x-auto"
  );
  if (!timelineSection) return;

  const timelineContainer = timelineSection.querySelector(".space-y-2");
  if (!timelineContainer) return;

  let html = "";

  // Clarity events
  if (timeline.clarity && timeline.clarity.length > 0) {
    html += '<div class="font-medium text-sm text-gray-700">Clarity</div>';
    html += '<div class="timeline-track">';
    timeline.clarity.forEach((event) => {
      const left =
        event.left_percent || (event.start_time / videoDuration) * 100;
      const width =
        event.width_percent || (event.duration / videoDuration) * 100;
      const timeStr = formatTime(event.start_time);
      html += `<div class="timeline-event bg-yellow-500" style="left: ${left}%; width: ${width}%;" title="${event.title
        } (${timeStr})" onclick="showTimelineInsight('clarity', ${JSON.stringify(
          event
        ).replace(/"/g, "&quot;")})"></div>`;
    });
    html += "</div>";
  }

  // Interaction events
  if (timeline.interaction && timeline.interaction.length > 0) {
    html += '<div class="font-medium text-sm text-gray-700">Interaction</div>';
    html += '<div class="timeline-track">';
    timeline.interaction.forEach((event) => {
      const left =
        event.left_percent || (event.start_time / videoDuration) * 100;
      const width =
        event.width_percent || (event.duration / videoDuration) * 100;
      const timeStr = formatTime(event.start_time);
      const bgColor =
        event.type === "question" ? "bg-blue-500" : "bg-green-500";
      const title =
        event.type === "question" ? "Student Question" : "Professor Answer";
      html += `<div class="timeline-event ${bgColor}" style="left: ${left}%; width: ${width}%;" title="${title} (${timeStr})" onclick="showTimelineInsight('${event.type
        }', ${JSON.stringify(event).replace(/"/g, "&quot;")})"></div>`;
    });
    html += "</div>";
  }

  // Positive events
  if (timeline.positive && timeline.positive.length > 0) {
    html += '<div class="font-medium text-sm text-gray-700">Positive</div>';
    html += '<div class="timeline-track">';
    timeline.positive.forEach((event) => {
      const left =
        event.left_percent || (event.start_time / videoDuration) * 100;
      const width =
        event.width_percent || (event.duration / videoDuration) * 100;
      const timeStr = formatTime(event.start_time);
      html += `<div class="timeline-event bg-green-500" style="left: ${left}%; width: ${width}%;" title="${event.title
        } (${timeStr})" onclick="showTimelineInsight('positive', ${JSON.stringify(
          event
        ).replace(/"/g, "&quot;")})"></div>`;
    });
    html += "</div>";
  }

  timelineContainer.innerHTML = html;
}

function populateTranscript(transcript) {
  // Find the transcript container - it's the div with h-96 class
  const transcriptSection = document.querySelector(
    "#screen-lecture-analysis .bg-white\\/80.backdrop-blur-sm.p-6.rounded-xl.shadow-md.h-96.overflow-y-auto"
  );
  if (!transcriptSection) return;

  const transcriptContainer = transcriptSection.querySelector(".space-y-3");
  if (!transcriptContainer) return;

  let html = "";
  transcript.forEach((item) => {
    const typeClass =
      item.type === "Success"
        ? "text-green-700"
        : item.type === "Opportunity"
          ? "text-yellow-700"
          : item.type === "Question"
            ? "text-blue-600"
            : "text-gray-700";
    const speakerLabel =
      item.speaker === "Student"
        ? "[Student Question]"
        : item.speaker === "Professor" && item.type === "Answer"
          ? "[Professor Answer]"
          : "";
    html += `<p><span class="font-semibold text-black">${item.timestamp
      }</span> ${speakerLabel ? `<span class="font-semibold">${speakerLabel}</span> ` : ""
      }<span class="${typeClass}">${item.text}</span></p>`;
  });

  transcriptContainer.innerHTML = html;
}

function populateTopicCoverage(topics, materialsAnalysis = null) {
  // Find the topic coverage container - it's the first aside section
  const topicSection = document.querySelector(
    "#screen-lecture-analysis aside .bg-white\\/80.backdrop-blur-sm.p-6.rounded-xl.shadow-md"
  );
  if (!topicSection) return;

  const topicContainer = topicSection.querySelector(".space-y-3");
  if (!topicContainer) return;

  // Use the same pastel color schemes as the planning stage
  const colorSchemes = [
    { bg: "bg-blue-50", border: "border-blue-100", text: "text-blue-800", badge: "bg-blue-100 text-blue-700" },
    { bg: "bg-purple-50", border: "border-purple-100", text: "text-purple-800", badge: "bg-purple-100 text-purple-700" },
    { bg: "bg-rose-50", border: "border-rose-100", text: "text-rose-800", badge: "bg-rose-100 text-rose-700" },
    { bg: "bg-amber-50", border: "border-amber-100", text: "text-amber-800", badge: "bg-amber-100 text-amber-700" },
    { bg: "bg-emerald-50", border: "border-emerald-100", text: "text-emerald-800", badge: "bg-emerald-100 text-emerald-700" },
    { bg: "bg-indigo-50", border: "border-indigo-100", text: "text-indigo-800", badge: "bg-indigo-100 text-indigo-700" },
  ];

  topicContainer.innerHTML = ""; // Clear existing

  topics.forEach((topic, index) => {
    const isCovered = topic.covered;
    // Different icon logic for covered/missed, but keeping the card style rich
    const statusIcon = isCovered
      ? `<span class="flex-shrink-0 w-5 h-5 rounded-full bg-green-100 flex items-center justify-center"><svg class="w-3 h-3 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg></span>`
      : `<span class="flex-shrink-0 w-5 h-5 rounded-full bg-red-100 flex items-center justify-center"><svg class="w-3 h-3 text-red-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></span>`;

    const statusText = isCovered
      ? `<span class="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full font-medium uppercase tracking-wide">Covered</span>`
      : `<span class="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full font-medium uppercase tracking-wide">Missed</span>`;

    // Try to find rich data from materialsAnalysis
    let richData = null;
    if (materialsAnalysis && materialsAnalysis.topics) {
      // Loose matching logic
      richData = materialsAnalysis.topics.find(t =>
        t.name.toLowerCase().includes(topic.topic.toLowerCase()) ||
        topic.topic.toLowerCase().includes(t.name.toLowerCase())
      );
    }

    const colors = colorSchemes[index % colorSchemes.length];
    const topicCard = document.createElement("div");

    // Base style matching the planning stage
    topicCard.className = `group w-full ${colors.bg} border ${colors.border} rounded-lg p-3 hover:shadow-md transition-all cursor-pointer relative overflow-hidden`;

    // Unique ID for toggling
    const topicId = "analysis-topic-" + Math.random().toString(36).substr(2, 9);

    // Content for the card
    let description = "No description available.";
    let subtopics = [];
    let keyConcepts = [];

    if (richData) {
      description = richData.description || description;
      subtopics = richData.subtopics || [];
      keyConcepts = richData.key_concepts || [];
    }

    topicCard.innerHTML = `
        <div class="flex justify-between items-start mb-1" onclick="toggleTopicDetails('${topicId}')">
            <div class="flex flex-col gap-1 flex-grow min-w-0 mr-2">
                <div class="flex items-center gap-2 flex-wrap">
                    ${statusIcon}
                    <span class="font-semibold ${colors.text} text-sm leading-tight">${topic.topic}</span>
                    ${statusText}
                </div>
            </div>
            <div class="flex items-center gap-1 flex-shrink-0">
                <button class="text-gray-400 hover:text-gray-600 transition-colors transform duration-200" id="btn-${topicId}">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
                </button>
            </div>
        </div>
        
        <!-- Collapsed Description (Truncated) -->
        <p class="text-xs text-gray-500 line-clamp-2 group-hover:text-gray-700 transition-colors mt-1" onclick="toggleTopicDetails('${topicId}')">${description}</p>
        
        <!-- Expanded Details -->
        <div id="${topicId}" class="hidden mt-3 pt-3 border-t ${colors.border} space-y-3">
            <p class="text-xs text-gray-600 italic">${description}</p>

            ${subtopics.length > 0 ? `
            <div>
                <p class="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1">Subtopics</p>
                <ul class="text-xs text-gray-600 list-disc list-inside space-y-1 pl-1">
                    ${subtopics.map(st => `<li>${st}</li>`).join('')}
                </ul>
            </div>
            ` : ''}
            
            ${keyConcepts.length > 0 ? `
            <div>
                <p class="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1">Key Concepts</p>
                <div class="flex flex-wrap gap-1.5">
                    ${keyConcepts.map(kc => `<span class="px-2 py-0.5 bg-white ${colors.text} border ${colors.border} text-[10px] rounded-md font-medium shadow-sm">${kc}</span>`).join('')}
                </div>
            </div>
            ` : ''}
            
            <!-- Analysis Note (if any from video analysis) -->
            ${topic.notes ? `
            <div class="mt-2 pt-2 border-t border-dashed ${colors.border}">
                <p class="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1">Analysis Note</p>
                <p class="text-xs text-gray-700">${topic.notes}</p>
            </div>
            ` : ''}
        </div>
    `;

    topicContainer.appendChild(topicCard);
  });
}

function populateAIReflections(reflections) {
  const insightPanel = document.getElementById("insight-content");
  if (!insightPanel) return;

  let html = '<ul class="space-y-4">';

  // Add insights
  if (reflections.insights && reflections.insights.length > 0) {
    reflections.insights.forEach((insight, index) => {
      // Create a unique ID for this insight
      const insightId = insight.id || `insight-${index}-${insight.title?.replace(/\s+/g, '-').toLowerCase() || index}`;

      const iconClass =
        insight.icon === "yellow"
          ? "bg-yellow-100 text-yellow-600"
          : insight.icon === "green"
            ? "bg-green-100 text-green-600"
            : "bg-red-100 text-red-600";

      const iconSvg =
        insight.icon === "yellow"
          ? '<path stroke-linecap="round" stroke-linejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 0a12.06 12.06 0 004.5 0m-8.25 0a12.06 12.06 0 01-4.5 0m3.75 2.023a14.077 14.077 0 01-6.75 0" />'
          : insight.icon === "green"
            ? '<path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.31h5.418a.563.563 0 01.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.528 4.707a.563.563 0 01-.84.622l-4.1-3.21a.563.563 0 00-.67 0l-4.1 3.21a.563.563 0 01-.84-.622l1.528-4.707a.563.563 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988H8.88a.563.563 0 00.475-.31l2.125-5.111z" />'
            : '<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />';

      const typeLabel =
        insight.type === "success"
          ? "Success"
          : insight.type === "opportunity"
            ? "Opportunity"
            : "Warning";

      html += `
                <li class="flex items-start gap-3 group" data-insight-id="${insightId}">
                    <span class="flex-shrink-0 w-8 h-8 rounded-full ${iconClass} flex items-center justify-center mt-1">
                        <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                            ${iconSvg}
                        </svg>
                    </span>
                    <div class="flex-1">
                        <h4 class="font-semibold text-gray-800">${typeLabel}: ${insight.title}</h4>
                        <p class="text-gray-600">${insight.description}</p>
                        <div class="flex items-center gap-2 mt-2 transition-opacity">
                            <button onclick="openFeedbackModal('${insightId}', 'up')" class="p-1.5 rounded-full hover:bg-green-50 hover:text-green-600 text-gray-400 transition-colors" title="Upvote">
                                <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
                                </svg>
                            </button>
                            <button onclick="openFeedbackModal('${insightId}', 'down')" class="p-1.5 rounded-full hover:bg-red-50 hover:text-red-600 text-gray-400 transition-colors" title="Downvote">
                                <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </li>
            `;
    });
  }

  html += "</ul>";

  // Add action items
  if (reflections.action_items && reflections.action_items.length > 0) {
    html += '<hr class="my-4 border-gray-200">';
    html +=
      '<h4 class="font-semibold text-gray-800 mb-3">Action Items for Next Lecture</h4>';
    html +=
      '<ul class="space-y-2 list-disc list-inside text-sm text-gray-700">';
    reflections.action_items.forEach((item) => {
      html += `<li><b>${item.priority}:</b> ${item.item}</li>`;
    });
    html += "</ul>";
  }

  insightPanel.innerHTML = html;

  // Cache the original content
  cacheOriginalInsights();
}

function populateStudentFeedback(responses, surveys) {
  const feedbackContainer = document.getElementById("student-feedback-content");
  if (!feedbackContainer) return;

  if (!responses || responses.length === 0) {
    feedbackContainer.innerHTML = `
      <div class="text-center py-8 text-gray-500">
        <svg class="w-12 h-12 mx-auto mb-3 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
        </svg>
        <p class="text-sm">No student feedback yet. Share the survey link with your students to collect responses.</p>
      </div>
    `;
    return;
  }

  // Get survey questions for reference
  const surveyMap = {};
  surveys.forEach(survey => {
    surveyMap[survey.survey_id] = survey;
  });

  let html = `<div class="space-y-3">`;
  html += `<div class="text-sm text-gray-600 mb-4">${responses.length} response${responses.length !== 1 ? 's' : ''} received</div>`;

  responses.forEach((response, index) => {
    const survey = surveyMap[response.survey_id];
    const submittedDate = new Date(response.submitted_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    const responseId = `response-${index}`;
    const isOpen = index === 0; // First one open by default

    html += `<div class="border border-gray-200 rounded-lg overflow-hidden">`;
    // Dropdown header
    html += `<button 
      onclick="toggleFeedbackResponse('${responseId}')" 
      class="w-full flex justify-between items-center p-4 hover:bg-gray-50 transition-colors text-left"
    >`;
    html += `<div class="flex-1">`;
    html += `<div class="font-semibold text-gray-900">${response.student_name}</div>`;
    html += `<div class="text-xs text-gray-500 mt-1">Submitted on ${submittedDate}</div>`;
    html += `</div>`;
    html += `<svg id="${responseId}-icon" class="w-5 h-5 text-gray-400 transform transition-transform ${isOpen ? 'rotate-180' : ''}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">`;
    html += `<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />`;
    html += `</svg>`;
    html += `</button>`;

    // Dropdown content
    html += `<div id="${responseId}-content" class="${isOpen ? '' : 'hidden'} border-t border-gray-200 p-4 bg-gray-50">`;
    html += `<div class="space-y-3">`;

    if (survey && survey.questions) {
      survey.questions.forEach((question) => {
        const questionId = `q${question.id}`;
        const answer = response.responses[questionId];

        if (answer !== undefined && answer !== null && answer !== '') {
          html += `<div class="border-l-2 border-purple-200 pl-3 py-2 bg-white rounded">`;
          html += `<div class="text-sm font-medium text-gray-700 mb-1">${question.question}</div>`;

          if (question.type === "likert") {
            html += `<div class="text-lg font-semibold text-purple-600">${answer} / ${question.scale.max}</div>`;
          } else if (question.type === "multiple_choice") {
            const answerArray = Array.isArray(answer) ? answer : [answer];
            const selectedOptions = answerArray.map(idx => question.options[parseInt(idx)]).filter(Boolean);
            html += `<div class="text-sm text-gray-700">${selectedOptions.join(', ')}</div>`;
          } else if (question.type === "open_ended") {
            html += `<div class="text-sm text-gray-700 whitespace-pre-wrap">${answer}</div>`;
          }

          html += `</div>`;
        }
      });
    } else {
      // Fallback: display raw responses if survey not found
      Object.entries(response.responses).forEach(([key, value]) => {
        html += `<div class="border-l-2 border-purple-200 pl-3 py-2 bg-white rounded">`;
        html += `<div class="text-sm font-medium text-gray-700 mb-1">${key}</div>`;
        html += `<div class="text-sm text-gray-700">${Array.isArray(value) ? value.join(', ') : value}</div>`;
        html += `</div>`;
      });
    }

    html += `</div>`;
    html += `</div>`;
    html += `</div>`;
  });

  html += `</div>`;
  feedbackContainer.innerHTML = html;
}

function toggleFeedbackResponse(responseId) {
  const content = document.getElementById(`${responseId}-content`);
  const icon = document.getElementById(`${responseId}-icon`);

  if (content && icon) {
    const isHidden = content.classList.contains('hidden');
    if (isHidden) {
      content.classList.remove('hidden');
      icon.classList.add('rotate-180');
    } else {
      content.classList.add('hidden');
      icon.classList.remove('rotate-180');
    }
  }
}

// Make function globally accessible
window.toggleFeedbackResponse = toggleFeedbackResponse;

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
}

function showTimelineInsight(type, event) {
  // Pass the dynamic event data to showInsight
  showInsight(type, event);
  
  // Collapse Topic Coverage smoothly to make reflections more prominent
  collapseTopicCoverage();
  
  // Scroll to the AI Reflections panel smoothly
  setTimeout(() => {
    const insightPanel = document.getElementById("dynamic-insight-panel");
    if (insightPanel) {
      insightPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Add a brief highlight effect
      insightPanel.classList.add("ring-2", "ring-purple-400", "ring-opacity-75");
      setTimeout(() => {
        insightPanel.classList.remove("ring-2", "ring-purple-400", "ring-opacity-75");
      }, 1500);
    }
  }, 100);
  
  // Seek video to the event's start time if available
  if (event && event.start_time !== undefined) {
    seekLectureVideo(event.start_time);
  }
}

/**
 * Seek the lecture video to a specific time in seconds
 */
function seekLectureVideo(timeInSeconds) {
  const videoContainer = document.getElementById("lecture-video-container");
  if (!videoContainer) return;
  
  const video = videoContainer.querySelector("video");
  if (video) {
    video.currentTime = timeInSeconds;
    // Don't scroll to video - let user focus on reflections instead
    video.play().catch(e => console.log("Auto-play prevented:", e));
  }
}

/**
 * Collapse the Topic Coverage section with smooth animation
 */
function collapseTopicCoverage() {
  const content = document.getElementById("topic-coverage-content");
  const icon = document.getElementById("topic-coverage-icon");
  
  if (!content || content.classList.contains("animating")) return;
  
  // If already collapsed, do nothing
  if (content.style.maxHeight === "0px") return;
  
  // Add transition styles if not present
  content.style.transition = "max-height 0.3s ease-out, opacity 0.2s ease-out, margin 0.3s ease-out";
  content.style.overflow = "hidden";
  
  // Get current height
  const currentHeight = content.scrollHeight;
  content.style.maxHeight = currentHeight + "px";
  
  // Force reflow
  content.offsetHeight;
  
  // Collapse
  content.classList.add("animating");
  content.style.maxHeight = "0px";
  content.style.opacity = "0";
  content.style.marginTop = "0";
  
  // Rotate icon
  if (icon) {
    icon.style.transition = "transform 0.3s ease-out";
    icon.style.transform = "rotate(-90deg)";
  }
  
  // Clean up after animation
  setTimeout(() => {
    content.classList.remove("animating");
    content.classList.add("collapsed");
  }, 300);
}

/**
 * Expand the Topic Coverage section with smooth animation
 */
function expandTopicCoverage() {
  const content = document.getElementById("topic-coverage-content");
  const icon = document.getElementById("topic-coverage-icon");
  
  if (!content || content.classList.contains("animating")) return;
  
  // If already expanded, do nothing
  if (content.style.maxHeight !== "0px" && !content.classList.contains("collapsed")) return;
  
  content.classList.remove("collapsed");
  content.classList.add("animating");
  
  // Add transition styles
  content.style.transition = "max-height 0.3s ease-out, opacity 0.2s ease-out, margin 0.3s ease-out";
  content.style.overflow = "hidden";
  
  // Set to auto height by measuring scrollHeight
  content.style.opacity = "1";
  content.style.marginTop = "1rem";
  content.style.maxHeight = content.scrollHeight + "px";
  
  // Rotate icon back
  if (icon) {
    icon.style.transition = "transform 0.3s ease-out";
    icon.style.transform = "rotate(0deg)";
  }
  
  // Clean up after animation
  setTimeout(() => {
    content.classList.remove("animating");
    content.style.maxHeight = "none";
  }, 300);
}

/**
 * Toggle the Topic Coverage section collapse state with animation
 */
function toggleTopicCoverage() {
  const content = document.getElementById("topic-coverage-content");
  
  if (!content) return;
  
  const isCollapsed = content.style.maxHeight === "0px" || content.classList.contains("collapsed");
  
  if (isCollapsed) {
    expandTopicCoverage();
  } else {
    collapseTopicCoverage();
  }
}

// Make functions available globally
window.seekLectureVideo = seekLectureVideo;
window.toggleTopicCoverage = toggleTopicCoverage;
window.collapseTopicCoverage = collapseTopicCoverage;
window.expandTopicCoverage = expandTopicCoverage;

async function submitForAnalysis() {
  if (!uploadedVideoFile) {
    alert("Please upload a video file first.");
    return;
  }

  if (!currentLectureId) {
    alert("Please save the lecture first before submitting for analysis.");
    return;
  }

  const submitBtn = document.getElementById("submit-analysis-btn");
  if (!submitBtn) return;

  // Prevent double-submission
  if (submitBtn.disabled) return;

  // Disable button and show loading state
  submitBtn.disabled = true;
  const originalText = submitBtn.innerHTML;

  submitBtn.innerHTML = `
      <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-purple-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      Processing...
    `;

  try {
    const formData = new FormData();
    formData.append("video", uploadedVideoFile);

    const response = await fetch(
      `${API_BASE_URL}/lectures/${currentLectureId}/analyze`,
      {
        method: "POST",
        body: formData,
      }
    );

    const result = await response.json();

    if (response.ok) {
        // Just add to tracking, the poller will handle the rest
        if (typeof processingLectures !== 'undefined') {
            processingLectures.add(currentLectureId);
        }
        
        // Button stays in "Processing..." state until poller completes it
        submitBtn.innerHTML = `
            <svg class="animate-pulse -ml-1 mr-2 h-4 w-4 text-purple-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.788m13.788 0c3.808 3.808 3.808 9.98 0 13.788M12 10.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
            </svg>
            Analyzing in background...
        `;
    } else {
        throw new Error(result.detail || "Analysis failed to start");
    }

  } catch (error) {
    console.error("Error submitting analysis:", error);
    alert(`Error: ${error.message}`);
    
    // Reset button
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
}

async function handleGenerateSurvey(event) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  const professorInput = formData.get("professor-input")?.trim() || null;

  // Close modal
  hideModal("modal-generate-survey");

  // Generate survey with optional professor input
  await generateStudentSurvey(professorInput);
}

// Make it globally accessible
window.handleGenerateSurvey = handleGenerateSurvey;

async function generateStudentSurvey(professorInput = null) {
  if (!currentLectureId) {
    alert("No lecture selected. Please navigate from a lecture analysis page.");
    return;
  }

  // Show loading message
  const loadingOverlay = document.createElement("div");
  loadingOverlay.id = "survey-loading-overlay";
  loadingOverlay.className =
    "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50";
  loadingOverlay.innerHTML = `
        <div class="bg-white rounded-xl p-8 max-w-md mx-4 text-center shadow-2xl">
            <div class="mb-6">
                <svg class="w-16 h-16 mx-auto text-purple-600 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            </div>
            <h3 class="text-2xl font-bold text-gray-900 mb-2">Generating Survey...</h3>
            <p class="text-gray-600 mb-4">Praxis AI is creating a comprehension survey based on the lecture analysis.</p>
            <div class="flex items-center justify-center gap-2 text-sm text-gray-500">
                <div class="w-2 h-2 bg-purple-600 rounded-full animate-pulse"></div>
                <div class="w-2 h-2 bg-purple-600 rounded-full animate-pulse" style="animation-delay: 0.2s"></div>
                <div class="w-2 h-2 bg-purple-600 rounded-full animate-pulse" style="animation-delay: 0.4s"></div>
            </div>
            <p class="text-xs text-gray-500 mt-4">This may take 20-40 seconds...</p>
        </div>
    `;
  document.body.appendChild(loadingOverlay);

  try {
    const requestBody = {};
    if (professorInput) {
      requestBody.professor_input = professorInput;
    }

    const response = await fetch(
      `${API_BASE_URL}/lectures/${currentLectureId}/generate-survey`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ detail: "Unknown error" }));
      throw new Error(
        errorData.detail || `HTTP error! status: ${response.status}`
      );
    }

    const result = await response.json();

    // Remove loading overlay
    loadingOverlay.remove();

    // Store the survey
    currentSurvey = result.survey;

    // Navigate to survey screen
    await showScreen(
      "screen-student-survey",
      document.getElementById("nav-courses")
    );

    // Populate the survey
    setTimeout(async () => {
      await populateSurveyScreen(currentSurvey);
    }, 100);
  } catch (error) {
    console.error("Error generating survey:", error);
    loadingOverlay.remove();
    alert(
      `Failed to generate survey: ${error.message}\n\nNote: Make sure your backend API is running at http://localhost:8001`
    );
  }
}

// Make the function globally accessible
window.generateStudentSurvey = generateStudentSurvey;

// --- Feedback Functions ---
// --- Feedback Functions ---
async function openFeedbackModal(insightId, rating) {
  // Ensure the modal is loaded into the DOM first
  await showModal("modal-feedback");

  const modal = document.getElementById("modal-feedback");
  const insightIdInput = document.getElementById("feedback-insight-id");
  const ratingInput = document.getElementById("feedback-rating");
  const titleElement = document.getElementById("feedback-modal-title");
  const labelElement = document.getElementById("feedback-label");
  const feedbackText = document.getElementById("feedback-text");

  if (insightIdInput) insightIdInput.value = insightId;
  if (ratingInput) ratingInput.value = rating;
  if (feedbackText) feedbackText.value = "";

  if (rating === "up") {
    if (titleElement) titleElement.textContent = "Thumbs Up";
    if (labelElement) labelElement.textContent = "Why did you like this reflection?";
  } else {
    if (titleElement) titleElement.textContent = "Thumbs Down";
    if (labelElement) labelElement.textContent = "Why didn't you like this reflection?";
  }
}

// Make it globally accessible
window.openFeedbackModal = openFeedbackModal;

async function handleFeedbackSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  const insightId = formData.get("insight-id");
  const rating = formData.get("rating");
  const feedbackText = formData.get("feedback-text")?.trim() || "";

  if (!currentCourseId) {
    alert("No course selected.");
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/classes/${currentCourseId}/feedback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        insight_id: insightId,
        rating: rating,
        feedback_text: feedbackText,
        lecture_id: currentLectureId,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to save feedback");
    }

    hideModal("modal-feedback");

    // Show a subtle success indicator
    const insightElement = document.querySelector(`[data-insight-id="${insightId}"]`);
    if (insightElement) {
      const buttons = insightElement.querySelectorAll("button");
      buttons.forEach(btn => {
        if ((rating === "up" && btn.onclick.toString().includes("'up'")) ||
          (rating === "down" && btn.onclick.toString().includes("'down'"))) {
          btn.classList.add("opacity-100");
          btn.querySelector("svg").classList.add(rating === "up" ? "text-green-600" : "text-red-600");
        }
      });
    }
  } catch (error) {
    console.error("Error saving feedback:", error);
    alert("Failed to save feedback. Please try again.");
  }
}

// Make it globally accessible
window.handleFeedbackSubmit = handleFeedbackSubmit;

async function viewStudentSurveyById(surveyId) {
  try {
    const response = await fetch(`${API_BASE_URL}/surveys/${surveyId}`);
    if (!response.ok) {
      throw new Error("Failed to load survey");
    }
    const survey = await response.json();
    await viewStudentSurvey(survey);
  } catch (error) {
    console.error("Error loading survey:", error);
    alert(`Failed to load survey: ${error.message}`);
  }
}

// Make function globally accessible
window.viewStudentSurveyById = viewStudentSurveyById;

async function viewStudentSurvey(survey) {
  if (!survey) {
    alert("Survey data is missing.");
    return;
  }

  try {
    // Store the lecture_id from the survey for back navigation
    if (survey.lecture_id) {
      currentLectureId = survey.lecture_id;
    }

    // If survey doesn't have questions, fetch the full survey data
    let fullSurvey = survey;
    if (!survey.questions && survey.survey_id) {
      const response = await fetch(`${API_BASE_URL}/surveys/${survey.survey_id}`);
      if (response.ok) {
        fullSurvey = await response.json();
        // Make sure we have the lecture_id from the full survey
        if (fullSurvey.lecture_id && !currentLectureId) {
          currentLectureId = fullSurvey.lecture_id;
        }
      } else {
        throw new Error("Failed to load survey data");
      }
    }

    // Store the survey
    currentSurvey = fullSurvey;

    // Navigate to survey screen
    await showScreen(
      "screen-student-survey",
      document.getElementById("nav-courses")
    );

    // Populate the survey
    setTimeout(async () => {
      await populateSurveyScreen(currentSurvey);
    }, 100);
  } catch (error) {
    console.error("Error loading survey:", error);
    alert(`Failed to load survey: ${error.message}`);
  }
}

async function populateSurveyScreen(survey) {
  // Update breadcrumb course name - select the span with onclick that contains screen-course-hub
  const courseBreadcrumb = document.querySelector(
    "#screen-student-survey .text-sm.text-gray-600 span[onclick*='screen-course-hub']"
  );
  if (courseBreadcrumb && currentCourseId) {
    try {
      const courseResponse = await fetch(`${API_BASE_URL}/classes/${currentCourseId}`);
      if (courseResponse.ok) {
        const courseData = await courseResponse.json();
        const courseName = courseData.code ? `${courseData.code} - ${courseData.name}` : courseData.name;
        courseBreadcrumb.textContent = courseName;
        // Update onclick to navigate to the correct course
        courseBreadcrumb.setAttribute('onclick', `navigateToCourseHub('${currentCourseId}')`);
      }
    } catch (error) {
      console.error("Error fetching course for breadcrumb:", error);
    }
  }

  // Update title and subtitle
  const titleElement = document.getElementById("survey-title");
  const subtitleElement = document.getElementById("survey-subtitle");
  const linkElement = document.getElementById("survey-link");

  if (titleElement) {
    titleElement.textContent = `${survey.lecture_title} - Comprehension Survey`;
  }

  if (subtitleElement) {
    subtitleElement.textContent =
      survey.summary ||
      "Help us understand how well you've grasped the lecture concepts";
  }

  if (linkElement) {
    // Generate the actual working link
    const baseUrl = window.location.origin + window.location.pathname;
    const surveyLink = survey.shareable_link || `${baseUrl}?survey_id=${survey.survey_id}`;
    linkElement.textContent = surveyLink;
  }

  // Populate questions
  const questionsContainer = document.getElementById(
    "survey-questions-container"
  );
  if (!questionsContainer) return;

  let html = "";

  survey.questions.forEach((question, index) => {
    html += `<div class="pb-6 ${index < survey.questions.length - 1 ? "border-b border-gray-200" : ""
      }">`;
    html += `<h3 class="text-lg font-semibold text-gray-900 mb-3">${index + 1
      }. ${question.question}</h3>`;

    if (question.type === "likert") {
      // Likert scale question
      html += '<div class="space-y-2">';
      html += '<div class="flex justify-between items-center gap-2">';

      for (let i = question.scale.min; i <= question.scale.max; i++) {
        html += `
                    <label class="flex-1 cursor-pointer">
                        <input type="radio" name="q${question.id}" value="${i}" class="peer hidden">
                        <div class="text-center p-3 border-2 border-gray-300 rounded-lg peer-checked:border-purple-500 peer-checked:bg-purple-50 hover:border-purple-300 transition-colors">
                            <div class="text-2xl font-bold text-gray-700 peer-checked:text-purple-600">${i}</div>
                        </div>
                    </label>
                `;
      }

      html += "</div>";
      html += `<div class="flex justify-between text-xs text-gray-500 mt-1">`;
      html += `<span>${question.scale.min_label}</span>`;
      html += `<span>${question.scale.max_label}</span>`;
      html += `</div>`;
      html += "</div>";
    } else if (question.type === "multiple_choice") {
      // Multiple choice question
      html += '<div class="space-y-2">';
      question.options.forEach((option, optIndex) => {
        const inputType = question.allow_multiple ? "checkbox" : "radio";
        html += `
                    <label class="flex items-center gap-3 p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                        <input type="${inputType}" name="q${question.id}" value="${optIndex}" class="w-4 h-4 text-purple-600">
                        <span class="text-gray-700">${option}</span>
                    </label>
                `;
      });
      html += "</div>";
    } else if (question.type === "open_ended") {
      // Open-ended question
      html += `
                <textarea 
                    name="q${question.id}" 
                    rows="4" 
                    class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                    placeholder="Type your answer here..."
                ></textarea>
            `;
    }

    html += "</div>";
  });

  questionsContainer.innerHTML = html;
}

function copySurveyLink() {
  const linkElement = document.getElementById("survey-link");
  if (!linkElement) return;

  const link = linkElement.textContent;

  // Copy to clipboard
  navigator.clipboard
    .writeText(link)
    .then(() => {
      // Show success message
      const button = event.target.closest("button");
      const originalText = button.innerHTML;

      button.innerHTML = `
            <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            Copied!
        `;

      setTimeout(() => {
        button.innerHTML = originalText;
      }, 2000);
    })
    .catch((err) => {
      console.error("Failed to copy:", err);
      alert("Failed to copy link. Please copy it manually: " + link);
    });
}

// --- Survey Taking Functions ---

async function loadSurveyForStudent(surveyId) {
  try {

    // Fetch the survey
    const response = await fetch(`${API_BASE_URL}/surveys/${surveyId}`);
    if (!response.ok) {
      throw new Error(`Failed to load survey: ${response.status}`);
    }

    const survey = await response.json();

    // Navigate to survey-taking screen
    await showScreen("screen-survey-take", null);

    // Wait for screen to load, then populate
    setTimeout(() => {
      populateSurveyTakePage(survey);
    }, 100);
  } catch (error) {
    console.error("Error loading survey:", error);
    alert(`Failed to load survey: ${error.message}`);
  }
}

function populateSurveyTakePage(survey) {
  // Update title and subtitle
  const titleElement = document.getElementById("survey-take-title");
  const subtitleElement = document.getElementById("survey-take-subtitle");

  if (titleElement) {
    titleElement.textContent = `${survey.lecture_title} - Comprehension Survey`;
  }

  if (subtitleElement) {
    subtitleElement.textContent =
      survey.summary ||
      "Help us understand how well you've grasped the lecture concepts";
  }

  // Populate questions
  const questionsContainer = document.getElementById("survey-take-questions-container");
  if (!questionsContainer) return;

  let html = "";

  survey.questions.forEach((question, index) => {
    html += `<div class="pb-6 ${index < survey.questions.length - 1 ? "border-b border-gray-200" : ""
      }">`;
    html += `<h3 class="text-lg font-semibold text-gray-900 mb-3">${index + 1
      }. ${question.question}</h3>`;

    if (question.type === "likert") {
      // Likert scale question
      html += '<div class="space-y-2">';
      html += '<div class="flex justify-between items-center gap-2">';

      for (let i = question.scale.min; i <= question.scale.max; i++) {
        html += `
          <label class="flex-1 cursor-pointer">
            <input type="radio" name="q${question.id}" value="${i}" required class="peer hidden">
            <div class="text-center p-3 border-2 border-gray-300 rounded-lg peer-checked:border-purple-500 peer-checked:bg-purple-50 hover:border-purple-300 transition-colors">
              <div class="text-2xl font-bold text-gray-700 peer-checked:text-purple-600">${i}</div>
            </div>
          </label>
        `;
      }

      html += "</div>";
      html += `<div class="flex justify-between text-xs text-gray-500 mt-1">`;
      html += `<span>${question.scale.min_label}</span>`;
      html += `<span>${question.scale.max_label}</span>`;
      html += `</div>`;
      html += "</div>";
    } else if (question.type === "multiple_choice") {
      // Multiple choice question
      html += '<div class="space-y-2">';
      question.options.forEach((option, optIndex) => {
        const inputType = question.allow_multiple ? "checkbox" : "radio";
        const requiredAttr = question.allow_multiple ? "" : "required";
        html += `
          <label class="flex items-center gap-3 p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
            <input type="${inputType}" name="q${question.id}" value="${optIndex}" ${requiredAttr} class="w-4 h-4 text-purple-600">
            <span class="text-gray-700">${option}</span>
          </label>
        `;
      });
      html += "</div>";
    } else if (question.type === "open_ended") {
      // Open-ended question
      html += `
        <textarea 
          name="q${question.id}" 
          rows="4" 
          required
          class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
          placeholder="Type your answer here..."
        ></textarea>
      `;
    }

    html += "</div>";
  });

  questionsContainer.innerHTML = html;

  // Add form submit handler
  const form = document.getElementById("survey-take-form");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      await submitSurveyResponse(survey.survey_id, survey.lecture_id);
    });
  }
}

async function submitSurveyResponse(surveyId, lectureId) {
  try {
    const surveyForm = document.getElementById("survey-take-form");
    if (!surveyForm) return;

    const formData = new FormData(surveyForm);
    const responses = {};
    const studentName = formData.get("student_name") || "Anonymous";

    // Collect all responses
    for (const [key, value] of formData.entries()) {
      if (key === "student_name") continue;

      if (responses[key]) {
        // Multiple values (checkboxes)
        if (Array.isArray(responses[key])) {
          responses[key].push(value);
        } else {
          responses[key] = [responses[key], value];
        }
      } else {
        responses[key] = value;
      }
    }

    const response = await fetch(`${API_BASE_URL}/surveys/${surveyId}/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        survey_id: surveyId,
        lecture_id: lectureId,
        student_name: studentName,
        responses: responses,
        submitted_at: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || "Failed to submit survey");
    }

    // Show success message
    const successDiv = document.getElementById("survey-submit-success");
    const errorDiv = document.getElementById("survey-submit-error");

    if (successDiv) successDiv.classList.remove("hidden");
    if (errorDiv) errorDiv.classList.add("hidden");
    if (surveyForm) surveyForm.style.display = "none";

    // Scroll to success message
    if (successDiv) {
      successDiv.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  } catch (error) {
    console.error("Error submitting survey:", error);

    // Show error message
    const successDiv = document.getElementById("survey-submit-success");
    const errorDiv = document.getElementById("survey-submit-error");
    const errorMessage = document.getElementById("survey-error-message");

    if (errorDiv) errorDiv.classList.remove("hidden");
    if (successDiv) successDiv.classList.add("hidden");
    if (errorMessage) errorMessage.textContent = error.message;

    // Scroll to error message
    if (errorDiv) {
      errorDiv.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }
}

// --- Course Profile Functions ---

function selectProfileOption(element, group) {
  // Find all buttons in the same group (siblings or within the same container context)
  const container = element.parentElement;
  const buttons = container.querySelectorAll('.profile-option-card');

  // Remove active state from all
  buttons.forEach(btn => {
    btn.classList.remove('border-indigo-500', 'bg-indigo-50/50', 'border-teal-500', 'bg-teal-50/50');
    btn.classList.add('border-gray-100');

    // Reset the check dot
    const dot = btn.querySelector('.check-dot');
    if (dot) {
      dot.classList.remove('opacity-100', 'transform', 'scale-100');
      dot.classList.add('opacity-0', 'transform', 'scale-0');
    }
  });

  // Add active state to clicked element
  if (group === 'format') {
    element.classList.remove('border-gray-100');
    element.classList.add('border-indigo-500', 'bg-indigo-50/50');
  } else if (group === 'feedback') {
    element.classList.remove('border-gray-100');
    element.classList.add('border-teal-500', 'bg-teal-50/50');
  }

  // Show check dot
  const dot = element.querySelector('.check-dot');
  if (dot) {
    dot.classList.remove('opacity-0', 'transform', 'scale-0');
    dot.classList.add('opacity-100', 'transform', 'scale-100');
  }
}

function toggleProfilePill(element) {
  // Toggle selection state
  if (element.classList.contains('bg-pink-500')) {
    // Deselect
    element.classList.remove('bg-pink-500', 'text-white', 'border-pink-500');
    element.classList.add('border-gray-200', 'text-gray-600');
  } else {
    // Select
    element.classList.remove('border-gray-200', 'text-gray-600');
    element.classList.add('bg-pink-500', 'text-white', 'border-pink-500');
  }
}

function updatePersonaLabel(value) {
  const label = document.getElementById('persona-description');
  if (!label) return;

  switch (parseInt(value)) {
    case 1:
      label.textContent = "Supportive Cheerleader: Focuses on encouragement, strengths, and positive reinforcement.";
      break;
    case 2:
      label.textContent = "Balanced Partner: Constructive feedback that highlights both wins and opportunities.";
      break;
    case 3:
      label.textContent = "Strict Critic: Rigorous, high-standards evaluation focused on identifying every flaw.";
      break;
  }
}

function saveCourseProfile(button) {
  const originalText = button.innerHTML;

  // Show loading state
  button.disabled = true;
  button.innerHTML = `
    <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
    Saving...
  `;

  // Simulate API call
  setTimeout(() => {
    button.innerHTML = `
      <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
      Saved Successfully!
    `;
    button.classList.remove('bg-gray-900', 'hover:bg-gray-800');
    button.classList.add('bg-green-600', 'hover:bg-green-500');

    setTimeout(() => {
      button.disabled = false;
      button.innerHTML = originalText;
      button.classList.add('bg-gray-900', 'hover:bg-gray-800');
      button.classList.remove('bg-green-600', 'hover:bg-green-500');
    }, 2000);
  }, 1000);
}

/**
 * Renders recommendations to the UI
 */
function renderRecommendations(recommendations) {
  const recommendationsSection = document.getElementById("slide-recommendations-section");
  const recommendationsList = document.getElementById("recommendations-list");
  const placeholder = document.getElementById("recommendations-placeholder");
  const content = document.getElementById("recommendations-content");

  if (!recommendationsList) return;

  // Helper to get icon
  const getIconForType = (type) => {
    const normalizedType = (type || "").toLowerCase();
    if (normalizedType.includes("visual")) {
      return `<div class="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            </div>`;
    } else if (normalizedType.includes("text")) {
      return `<div class="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-600">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            </div>`;
    } else if (normalizedType.includes("clarity")) {
      return `<div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>`;
    } else {
      return `<div class="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
            </div>`;
    }
  };

  // Helper to get badge class
  const getBadgeClass = (type) => {
    const normalizedType = (type || "").toLowerCase();
    if (normalizedType.includes("visual")) return "bg-purple-100 text-purple-800";
    if (normalizedType.includes("text")) return "bg-yellow-100 text-yellow-800";
    if (normalizedType.includes("clarity")) return "bg-blue-100 text-blue-800";
    return "bg-green-100 text-green-800";
  };

  // Clear previous
  recommendationsList.innerHTML = "";

  recommendations.forEach(rec => {
    const html = `
        <div class="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow animate-fade-in">
            <div class="flex items-start gap-4">
                <div class="flex-shrink-0 mt-1">
                    ${getIconForType(rec.type)}
                </div>
                <div>
                    <div class="flex items-center gap-2 mb-1">
                        <span class="text-xs font-bold uppercase tracking-wide text-gray-500">Slide ${rec.slide_number || 'General'}</span>
                        <span class="text-xs font-medium px-2 py-0.5 rounded-full ${getBadgeClass(rec.type)}">${(rec.type || 'General').charAt(0).toUpperCase() + (rec.type || 'General').slice(1)}</span>
                    </div>
                    <h4 class="text-md font-semibold text-gray-800 mb-1">${rec.suggestion}</h4>
                    <p class="text-sm text-gray-600">${rec.rationale}</p>
                </div>
            </div>
        </div>
        `;
    recommendationsList.innerHTML += html;
  });

  // Toggle views
  if (placeholder) placeholder.classList.add("hidden");
  if (content) content.classList.remove("hidden");
  if (recommendationsSection) {
    recommendationsSection.classList.remove("hidden");
    recommendationsSection.classList.add("animate-fade-in");
  }
}

/**
 * Loads existing materials analysis for a lecture
 */
async function loadMaterialsAnalysis(lectureId) {
  if (!lectureId) return;

  try {
    const response = await fetch(`${API_BASE_URL}/lectures/${lectureId}/materials-analysis`);

    if (response.ok) {
      const analysisData = await response.json();

      // Check for recommendations
      if (analysisData.recommendations && analysisData.recommendations.length > 0) {
        renderRecommendations(analysisData.recommendations);
      }

      // Also update topics if present
      if (analysisData.topics && analysisData.topics.length > 0) {
        // Pass full objects for rich rendering
        updateTopicsList(analysisData.topics);
      }
    }
  } catch (error) {
    // Silent fail if no analysis exists yet
    console.log("No existing materials analysis found or error loading it.");
  }
}

// --- Recommendations UI Toggles ---

function toggleRecommendations() {
  const body = document.getElementById('recommendations-body');
  const chevron = document.getElementById('recommendations-chevron');

  if (body.classList.contains('hidden')) {
    body.classList.remove('hidden');
    chevron.classList.add('rotate-180');
  } else {
    body.classList.add('hidden');
    chevron.classList.remove('rotate-180');
  }
}

/**
 * Opens the Lecture Rewind modal and populates it with data
 */
async function openLectureRewind(lectureId) {
  if (!lectureId) return;

  // Show the modal first
  await showModal('modal-lecture-rewind');

  try {
    // Fetch lecture details and analysis
    const [lectureResponse, analysisResponse] = await Promise.all([
      fetch(`${API_BASE_URL}/lectures/${lectureId}`),
      fetch(`${API_BASE_URL}/lectures/${lectureId}/analysis`)
    ]);

    if (lectureResponse.ok && analysisResponse.ok) {
      const lecture = await lectureResponse.json();
      const analysis = await analysisResponse.json();
      populateLectureRewind(lecture, analysis);
    } else {
      console.error("Failed to fetch data for rewind");
    }
  } catch (error) {
    console.error("Error loading lecture rewind:", error);
  }
}

/**
 * Populates the Lecture Rewind modal with dynamic data
 */
function populateLectureRewind(lecture, analysis) {
  const modal = document.getElementById('modal-lecture-rewind');
  if (!modal) return;

  // 1. Update Header Info
  const rewindTitle = modal.querySelector('h2');
  if (rewindTitle) rewindTitle.textContent = `${lecture.title} Rewind`;

  const mainTitle = modal.querySelector('h1.text-xl');
  if (mainTitle) mainTitle.textContent = lecture.title + (lecture.topic ? `: ${lecture.topic}` : '');

  // Summary Text
  const summaryP = modal.querySelector('p.text-gray-600.mb-6');
  if (summaryP && analysis.summary) {
    summaryP.textContent = analysis.summary;
  }

  // 2. Process Insights for Cards & Lists
  const insights = analysis.ai_reflections ? analysis.ai_reflections.insights : [];
  const strengths = insights.filter(i => i.type === 'success' || (i.title && i.title.toLowerCase().includes('success')) || i.icon === 'green');
  const opportunities = insights.filter(i => i.type === 'opportunity' || i.type === 'warning' || i.icon === 'yellow' || i.icon === 'red');

  // Calculate "Core Vibe" based on analysis data
  let vibe = "Balanced"; // Default
  const interactionCount = analysis.timeline && analysis.timeline.interaction ? analysis.timeline.interaction.length : 0;
  const clarityIssues = analysis.timeline && analysis.timeline.clarity ? analysis.timeline.clarity.length : 0;
  const positiveMoments = analysis.timeline && analysis.timeline.positive ? analysis.timeline.positive.length : 0;
  const topicCount = analysis.total_topics_count || 0;

  if (interactionCount > 4) {
    vibe = "Socratic & Interactive";
  } else if (clarityIssues > 2) {
    vibe = "Fast-Paced";
  } else if (positiveMoments > 4) {
    vibe = "Highly Engaging";
  } else if (topicCount > 8) {
    vibe = "Content-Heavy";
  } else if (interactionCount === 0 && topicCount < 5) {
    vibe = "Focused Dive";
  }

  // 3. Update Summary Cards
  const scoreCard = modal.querySelectorAll('.rewind-summary-card')[0];
  if (scoreCard) {
    // Change Title
    const titleEl = scoreCard.querySelector('h4');
    if (titleEl) titleEl.textContent = "Core Vibe";

    // Change Value
    const valueEl = scoreCard.querySelector('p'); // selects the p with text-3xl
    if (valueEl) {
      valueEl.className = "text-2xl font-bold text-gray-900"; // Slightly smaller text for vibe strings
      valueEl.textContent = vibe;
    }
  }

  const strengthCard = modal.querySelectorAll('.rewind-summary-card')[1];
  if (strengthCard) {
    const topStrength = strengths.length > 0 ? strengths[0].title : "Pending Analysis";
    strengthCard.querySelector('p.text-2xl').textContent = topStrength;
  }

  const opportunityCard = modal.querySelectorAll('.rewind-summary-card')[2];
  if (opportunityCard) {
    const topOpp = opportunities.length > 0 ? opportunities[0].title : "None Identified";
    opportunityCard.querySelector('p.text-2xl').textContent = topOpp;
  }

  // 4. Update Master Timeline
  const timelineContainer = modal.querySelector('.max-w-3xl');
  if (timelineContainer && analysis.timeline) {
    // Merge all events
    let allEvents = [];

    if (analysis.timeline.positive) {
      allEvents = allEvents.concat(analysis.timeline.positive.map(e => ({ ...e, category: 'success', iconColor: 'green' })));
    }
    if (analysis.timeline.clarity) {
      allEvents = allEvents.concat(analysis.timeline.clarity.map(e => ({ ...e, category: 'opportunity', iconColor: 'yellow' })));
    }
    if (analysis.timeline.interaction) {
      allEvents = allEvents.concat(analysis.timeline.interaction.map(e => ({ ...e, category: 'interaction', iconColor: 'blue' })));
    }

    // Sort by start time
    allEvents.sort((a, b) => a.start_time - b.start_time);

    // Generate HTML
    let timelineHtml = '';
    allEvents.forEach(event => {
      const timestamp = formatTimestamp(event.start_time);
      let iconSvg = '';
      let badgeColor = '';
      let borderColor = '';

      if (event.category === 'success') {
        badgeColor = 'text-green-600';
        borderColor = 'border-green-500';
        iconSvg = `<svg class="w-5 h-5 text-green-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>`;
      } else if (event.category === 'opportunity') {
        badgeColor = 'text-yellow-600';
        borderColor = 'border-yellow-500';
        iconSvg = `<svg class="w-5 h-5 text-yellow-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 0a12.06 12.06 0 004.5 0m-8.25 0a12.06 12.06 0 01-4.5 0m3.75 2.023a14.077 14.077 0 01-6.75 0" /></svg>`;
      } else {
        badgeColor = 'text-blue-600';
        borderColor = 'border-blue-500';
        iconSvg = `<svg class="w-5 h-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>`;
      }

      timelineHtml += `
            <div class="relative rewind-timeline-item pb-10">
                <div class="flex items-start">
                    <div class="rewind-icon flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center mr-5 ${borderColor}">
                        ${iconSvg}
                    </div>
                    <div class="rewind-timeline-card bg-white/80 backdrop-blur-sm border border-gray-200 p-4 rounded-lg shadow-sm flex-1">
                        <span class="font-semibold text-sm ${badgeColor}">[${timestamp}] - ${event.title || event.type}</span>
                        <h4 class="text-lg font-semibold text-gray-900 mt-1">${event.title}</h4>
                        <p class="text-gray-600">${event.description}</p>
                    </div>
                </div>
            </div>
        `;
    });
    timelineContainer.innerHTML = timelineHtml;
  }

  // 5. Update Reports Sections
  const reportSections = modal.querySelectorAll('.rewind-report-section ul');

  // Strengths
  if (reportSections[0]) {
    reportSections[0].innerHTML = strengths.map(s => `
        <li class="bg-green-50 border-l-4 border-green-500 p-4 rounded-r-lg">
            <h4 class="font-semibold text-green-800">${s.title}</h4>
            <p class="text-gray-700">${s.description}</p>
        </li>
      `).join('');
  }

  // Opportunities
  if (reportSections[1]) {
    reportSections[1].innerHTML = opportunities.map(o => `
        <li class="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-r-lg">
            <h4 class="font-semibold text-yellow-800">${o.title}</h4>
            <p class="text-gray-700">${o.description}</p>
        </li>
      `).join('');
  }
}

// Helper for timestamp formatting
function formatTimestamp(seconds) {
  if (!seconds && seconds !== 0) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Make globally available
window.openLectureRewind = openLectureRewind;

// --- Assignment Functions ---

async function showAssignmentsTab() {
  if (!currentCourseId) return;

  const listContainer = document.getElementById("assignments-list");
  if (listContainer) {
    listContainer.innerHTML = `
        <div class="bg-white/80 backdrop-blur-sm p-6 rounded-xl shadow-md text-center">
            <p class="text-gray-500">Loading assignments...</p>
        </div>`;
  }

  await fetchAssignments(currentCourseId);
}

async function fetchAssignments(courseId) {
  try {
    const response = await fetch(`${API_BASE_URL}/assignments?class_id=${courseId}`);

    if (response.ok) {
      const assignments = await response.json();
      renderAssignments(assignments);
    } else {
      console.error("Failed to fetch assignments");
      document.getElementById("assignments-list").innerHTML =
        `<p class="text-red-500 text-center">Error loading assignments.</p>`;
    }
  } catch (error) {
    console.error("Error fetching assignments:", error);
  }
}

function renderAssignments(assignments) {
  const listContainer = document.getElementById("assignments-list");
  if (!listContainer) return;

  if (assignments.length === 0) {
    listContainer.innerHTML = `
        <div class="bg-white/80 backdrop-blur-sm p-12 rounded-xl shadow-md text-center">
            <svg class="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
            </svg>
            <p class="text-gray-500 text-lg">No assignments yet.</p>
            <p class="text-gray-400 text-sm mt-2">Click "Add Assignment" to create one.</p>
        </div>`;
    return;
  }

  let html = "";
  assignments.forEach(assignment => {
    // Determine color based on type
    let typeColor = "bg-gray-100 text-gray-600";
    if (assignment.type === 'Essay') typeColor = "bg-blue-100 text-blue-700";
    if (assignment.type === 'Problem Set') typeColor = "bg-purple-100 text-purple-700";
    if (assignment.type === 'Project') typeColor = "bg-green-100 text-green-700";
    if (assignment.type === 'Exam') typeColor = "bg-red-100 text-red-700";
    if (assignment.type === 'Reading') typeColor = "bg-yellow-100 text-yellow-700";

    // Download button HTML if file exists
    let downloadBtn = "";
    if (assignment.hasFile) {
      const downloadUrl = `http://localhost:8001/api/assignments/${assignment.id}/file`;
      downloadBtn = `
            <a href="${downloadUrl}" target="_blank" class="flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors mt-3">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                Download Attachment
            </a>
        `;
    }

    // Add Analyze Button (only if file exists)
    let analyzeBtn = "";
    let analysisPreview = "";

    if (assignment.hasFile) {
      analyzeBtn = `
            <button onclick="openAnalyzeModal('${assignment.id}')" class="flex items-center gap-1 text-sm font-medium text-purple-600 hover:text-purple-800 transition-colors mt-3">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
                ${assignment.latestAnalysis ? 'Re-analyze Alignment' : 'Analyze Alignment'}
            </button>
        `;

      // Check for saved analysis
      if (assignment.latestAnalysis) {
        const score = assignment.latestAnalysis.alignment_score || 0;
        let scoreColor = 'bg-red-100 text-red-800';
        let scoreLabel = 'Weak Alignment';

        if (score >= 90) { scoreColor = 'bg-green-100 text-green-800'; scoreLabel = 'Excellent Alignment'; }
        else if (score >= 75) { scoreColor = 'bg-green-100 text-green-800'; scoreLabel = 'Strong Alignment'; }
        else if (score >= 60) { scoreColor = 'bg-yellow-100 text-yellow-800'; scoreLabel = 'Moderate Alignment'; }
        else if (score >= 40) { scoreColor = 'bg-orange-100 text-orange-800'; scoreLabel = 'Weak Alignment'; }
        else { scoreColor = 'bg-red-100 text-red-800'; scoreLabel = 'Poor Alignment'; }

        analysisPreview = `
                <div onclick="showSavedAnalysis('${assignment.id}')" class="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors group/preview">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-sm font-semibold text-gray-700 group-hover/preview:text-indigo-600 transition-colors">AI Alignment Check</span>
                        <span class="px-2 py-0.5 rounded-full text-xs font-bold ${scoreColor}">${scoreLabel}</span>
                    </div>
                    <div class="space-y-2">
                         ${(assignment.latestAnalysis.suggestions || []).slice(0, 2).map(s => `
                            <div class="flex items-start gap-2 text-xs text-gray-600">
                                <span class="mt-0.5 text-${s.type === 'gap_warning' ? 'orange' : 'blue'}-500">●</span>
                                <span>${escapeHtml(s.title)}</span>
                            </div>
                        `).join('')}
                    </div>
                    <div class="mt-2 text-center text-xs text-indigo-500 font-medium opacity-0 group-hover/preview:opacity-100 transition-opacity">
                        Click to view full analysis
                    </div>
                </div>
            `;
      }
    }

    html += `
        <div class="bg-white/80 backdrop-blur-sm p-6 rounded-xl shadow-md border border-gray-100 hover:shadow-lg transition-shadow relative group">
            <button onclick="deleteAssignment('${assignment.id}')" class="absolute top-4 right-4 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" title="Delete Assignment">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
            <div class="flex justify-between items-start mb-2">
                <div>
                     <span class="inline-block px-3 py-1 rounded-full text-xs font-semibold ${typeColor} mb-2">${assignment.type}</span>
                     <h3 class="text-xl font-bold text-gray-800">${assignment.title}</h3>
                </div>
                <div class="text-right">
                    <p class="text-sm font-semibold text-gray-500 uppercase tracking-wide">Due</p>
                    <p class="text-lg font-medium text-gray-900">${new Date(assignment.dueDate).toLocaleDateString()}</p>
                </div>
            </div>
            <p class="text-gray-600 mt-2 line-clamp-2">${assignment.description || 'No description provided.'}</p>
            ${analysisPreview}
            <div class="flex gap-4">
                ${downloadBtn}
                ${analyzeBtn}
            </div>
        </div>
    `;
  });
  listContainer.innerHTML = html;
}

async function handleAddAssignment(event) {
  event.preventDefault();
  if (!currentCourseId) return;

  const form = event.target;
  // Create FormData directly from the form
  const formData = new FormData(form);
  // Append classId manually as it might not be in the form inputs
  formData.append("classId", currentCourseId);

  try {
    // Send FormData directly - do NOT set Content-Type header manually (browser does it for multipart)
    const response = await fetch(`${API_BASE_URL}/assignments`, {
      method: 'POST',
      body: formData
    });

    if (response.ok) {
      hideModal('modal-add-assignment');
      form.reset();
      // Refresh list
      await fetchAssignments(currentCourseId);
    } else {
      alert("Failed to create assignment");
    }
  } catch (error) {
    console.error("Error creating assignment:", error);
    alert("Error creating assignment");
  }
}

async function deleteAssignment(assignmentId) {
  if (!confirm("Are you sure you want to delete this assignment?")) return;

  try {
    const response = await fetch(`${API_BASE_URL}/assignments/${assignmentId}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      await fetchAssignments(currentCourseId);
    } else {
      alert("Failed to delete assignment");
    }
  } catch (error) {
    console.error("Error deleting assignment:", error);
  }
}

// Make globally available
window.handleAddAssignment = handleAddAssignment;
window.deleteAssignment = deleteAssignment;

// --- Assignment Analysis Functions ---

let currentAssignmentIdForAnalysis = null;

async function openAnalyzeModal(assignmentId) {
  currentAssignmentIdForAnalysis = assignmentId;
  await showModal('modal-analyze-assignment');

  // Fetch lectures for the checklist
  const listContainer = document.getElementById('analyze-lectures-list');
  listContainer.innerHTML = '<div class="text-center text-gray-500 py-4">Loading lectures...</div>';

  try {
    // Fetch lectures for current class
    const response = await fetch(`${API_BASE_URL}/lectures?class_id=${currentCourseId}`);
    if (response.ok) {
      const lectures = await response.json();
      if (lectures.length === 0) {
        listContainer.innerHTML = '<div class="text-center text-gray-500 py-4">No lectures found for this course.</div>';
        return;
      }

      let html = '';
      lectures.forEach(lec => {
        html += `
                <div class="flex items-center p-2 hover:bg-gray-50 rounded">
                    <input type="checkbox" id="lec-${lec.id}" value="${lec.id}" class="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded">
                    <label for="lec-${lec.id}" class="ml-3 block text-sm font-medium text-gray-700 w-full cursor-pointer">
                        ${escapeHtml(lec.title)}
                        ${lec.hasAnalysis ? '<span class="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Analyzed</span>' : ''}
                    </label>
                </div>
            `;
      });
      listContainer.innerHTML = html;

      // Reset results area
      document.getElementById('analyze-results-area').classList.add('hidden');
      document.getElementById('analyze-content').innerHTML = '';
    }
  } catch (error) {
    console.error("Error fetching lectures:", error);
    listContainer.innerHTML = '<div class="text-center text-red-500 py-4">Error loading lectures.</div>';
  }
}

async function runAssignmentAnalysis() {
  // Get selected lectures
  const checkboxes = document.querySelectorAll('#analyze-lectures-list input[type="checkbox"]:checked');
  const selectedLectureIds = Array.from(checkboxes).map(cb => cb.value);

  if (selectedLectureIds.length === 0) {
    alert("Please select at least one lecture to compare against.");
    return;
  }

  // Show loading
  const resultsArea = document.getElementById('analyze-results-area');
  const loadingDiv = document.getElementById('analyze-loading');
  const contentDiv = document.getElementById('analyze-content');
  const runBtn = document.getElementById('btn-run-analysis');

  resultsArea.classList.remove('hidden');
  loadingDiv.classList.remove('hidden');
  contentDiv.innerHTML = '';
  runBtn.disabled = true;
  runBtn.classList.add('opacity-50', 'cursor-not-allowed');

  try {
    const response = await fetch(`${API_BASE_URL}/assignments/${currentAssignmentIdForAnalysis}/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ lecture_ids: selectedLectureIds })
    });

    if (response.ok) {
      const result = await response.json();
      renderAnalysisResults(result);
      // Refresh assignment list to show the new analysis on the card
      await fetchAssignments(currentCourseId);
    } else {
      const err = await response.json();
      contentDiv.innerHTML = `<div class="p-4 bg-red-50 text-red-700 rounded-lg">Error: ${err.detail || 'Analysis failed'}</div>`;
    }
  } catch (error) {
    console.error("Analysis error:", error);
    contentDiv.innerHTML = `<div class="p-4 bg-red-50 text-red-700 rounded-lg">Network error occurred.</div>`;
  } finally {
    loadingDiv.classList.add('hidden');
    runBtn.disabled = false;
    runBtn.classList.remove('opacity-50', 'cursor-not-allowed');
  }
}

function renderAnalysisResults(data) {
  const container = document.getElementById('analyze-content');
  let html = '';

  // Score Badge with reasoning
  const score = data.alignment_score || 0;
  let scoreColor = 'bg-red-100 text-red-800 border-red-200';
  let scoreLabel = 'Poor Alignment';
  let scoreBg = 'from-red-500 to-red-600';

  if (score >= 90) { scoreColor = 'bg-emerald-100 text-emerald-800 border-emerald-200'; scoreLabel = 'Excellent'; scoreBg = 'from-emerald-500 to-emerald-600'; }
  else if (score >= 75) { scoreColor = 'bg-green-100 text-green-800 border-green-200'; scoreLabel = 'Strong'; scoreBg = 'from-green-500 to-green-600'; }
  else if (score >= 60) { scoreColor = 'bg-yellow-100 text-yellow-800 border-yellow-200'; scoreLabel = 'Moderate'; scoreBg = 'from-yellow-500 to-yellow-600'; }
  else if (score >= 40) { scoreColor = 'bg-orange-100 text-orange-800 border-orange-200'; scoreLabel = 'Weak'; scoreBg = 'from-orange-500 to-orange-600'; }
  else { scoreColor = 'bg-red-100 text-red-800 border-red-200'; scoreLabel = 'Poor'; scoreBg = 'from-red-500 to-red-600'; }

  // Header with score
  html += `
    <div class="bg-gradient-to-r ${scoreBg} rounded-xl p-5 mb-6 text-white">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-white/80 text-sm font-medium">Alignment Score</p>
          <p class="text-3xl font-bold">${score}/100</p>
          <p class="text-sm text-white/90 mt-1">${scoreLabel} Alignment</p>
        </div>
        <div class="text-6xl font-bold opacity-20">${score}</div>
      </div>
    </div>
  `;

  // Score reasoning
  if (data.score_reasoning) {
    html += `
      <div class="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
        <div class="flex items-start gap-3">
          <svg class="w-5 h-5 text-gray-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <div>
            <p class="text-sm font-semibold text-gray-700">Why This Score?</p>
            <p class="text-sm text-gray-600 mt-1">${data.score_reasoning}</p>
          </div>
        </div>
      </div>
    `;
  }

  // Summary
  if (data.summary) {
    html += `
      <div class="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-6">
        <p class="text-sm font-semibold text-indigo-800 mb-1">Summary</p>
        <p class="text-sm text-indigo-700">${data.summary}</p>
      </div>
    `;
  }

  // Professor Gaps - What's missing in teaching
  if (data.professor_gaps && data.professor_gaps.length > 0) {
    html += `
      <div class="mb-6">
        <h5 class="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <svg class="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          Teaching Gaps to Address
        </h5>
        <div class="space-y-3">
    `;
    data.professor_gaps.forEach(gap => {
      html += `
        <div class="bg-red-50 border border-red-200 rounded-lg p-4">
          <p class="font-semibold text-red-800">${gap.gap}</p>
          <p class="text-sm text-red-700 mt-1"><strong>Impact:</strong> ${gap.impact}</p>
          <p class="text-sm text-red-700 mt-1"><strong>Recommendation:</strong> ${gap.recommendation}</p>
        </div>
      `;
    });
    html += `</div></div>`;
  }

  // Reinforcement Topics - What needs strengthening
  if (data.reinforcement_topics && data.reinforcement_topics.length > 0) {
    html += `
      <div class="mb-6">
        <h5 class="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <svg class="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
          </svg>
          Topics to Reinforce
        </h5>
        <div class="grid gap-3">
    `;
    data.reinforcement_topics.forEach(topic => {
      html += `
        <div class="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p class="font-semibold text-amber-800">${topic.topic}</p>
          <p class="text-sm text-amber-700 mt-1">${topic.reason}</p>
          <div class="mt-2 flex items-start gap-2">
            <svg class="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
            <p class="text-sm text-amber-800 font-medium">${topic.teaching_tip}</p>
          </div>
        </div>
      `;
    });
    html += `</div></div>`;
  }

  // Suggestions with priority
  if (data.suggestions && data.suggestions.length > 0) {
    html += `
      <div class="mb-6">
        <h5 class="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <svg class="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
          </svg>
          Suggestions & Improvements
        </h5>
        <div class="space-y-3">
    `;
    data.suggestions.forEach(item => {
      const isGap = item.type === 'gap_warning' || item.type === 'prerequisite_missing';
      const priorityColors = {
        'High': 'bg-red-100 text-red-700',
        'Medium': 'bg-yellow-100 text-yellow-700',
        'Low': 'bg-gray-100 text-gray-700'
      };
      const priorityClass = priorityColors[item.priority] || priorityColors['Medium'];
      
      html += `
        <div class="p-4 rounded-lg border ${isGap ? 'bg-orange-50 border-orange-200' : 'bg-blue-50 border-blue-200'}">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-start gap-3 flex-1">
              <div class="mt-0.5">
                ${isGap
                  ? '<svg class="w-5 h-5 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>'
                  : '<svg class="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>'}
              </div>
              <div>
                <h6 class="text-sm font-bold ${isGap ? 'text-orange-800' : 'text-blue-800'}">${item.title}</h6>
                <p class="text-sm text-gray-700 mt-1">${item.description}</p>
              </div>
            </div>
            ${item.priority ? `<span class="px-2 py-0.5 text-xs font-semibold rounded ${priorityClass}">${item.priority}</span>` : ''}
          </div>
        </div>
      `;
    });
    html += `</div></div>`;
  }

  // Strengths
  if (data.strengths && data.strengths.length > 0) {
    html += `
      <div class="mb-6">
        <h5 class="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <svg class="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          What's Working Well
        </h5>
        <div class="bg-green-50 border border-green-200 rounded-lg p-4">
          <ul class="space-y-2">
    `;
    data.strengths.forEach(str => {
      html += `
        <li class="flex items-start gap-2 text-sm text-green-800">
          <svg class="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
          </svg>
          ${str}
        </li>
      `;
    });
    html += `</ul></div></div>`;
  }

  // Topic Alignment Table
  if (data.topics_alignment && data.topics_alignment.length > 0) {
    html += `
      <div class="mb-6">
        <h5 class="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <svg class="w-5 h-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
          </svg>
          Topic-by-Topic Analysis
        </h5>
        <div class="overflow-x-auto">
          <table class="w-full text-sm border-collapse">
            <thead>
              <tr class="bg-gray-100">
                <th class="text-left p-3 font-semibold text-gray-700 border-b">Topic</th>
                <th class="text-center p-3 font-semibold text-gray-700 border-b">Status</th>
                <th class="text-center p-3 font-semibold text-gray-700 border-b">Depth</th>
                <th class="text-left p-3 font-semibold text-gray-700 border-b">Lecture</th>
              </tr>
            </thead>
            <tbody>
    `;
    data.topics_alignment.forEach(topic => {
      const statusColors = {
        'Covered': 'bg-green-100 text-green-800',
        'Partially Covered': 'bg-yellow-100 text-yellow-800',
        'Not Covered': 'bg-red-100 text-red-800'
      };
      const depthColors = {
        'Deep': 'bg-purple-100 text-purple-800',
        'Moderate': 'bg-blue-100 text-blue-800',
        'Surface': 'bg-gray-100 text-gray-700',
        'None': 'bg-red-100 text-red-700'
      };
      html += `
        <tr class="border-b hover:bg-gray-50">
          <td class="p-3">
            <p class="font-medium text-gray-800">${topic.topic}</p>
            ${topic.notes ? `<p class="text-xs text-gray-500 mt-1">${topic.notes}</p>` : ''}
          </td>
          <td class="p-3 text-center">
            <span class="px-2 py-1 rounded text-xs font-medium ${statusColors[topic.status] || 'bg-gray-100'}">${topic.status}</span>
          </td>
          <td class="p-3 text-center">
            <span class="px-2 py-1 rounded text-xs font-medium ${depthColors[topic.coverage_depth] || 'bg-gray-100'}">${topic.coverage_depth || 'N/A'}</span>
          </td>
          <td class="p-3 text-gray-600">${topic.lecture_reference || 'N/A'}</td>
        </tr>
      `;
    });
    html += `</tbody></table></div></div>`;
  }

  container.innerHTML = html;
}

// Make globally available
// --- New Function: Show Saved Analysis ---
async function showSavedAnalysis(assignmentId) {
  // 1. Open the modal normally to ensure structure is ready (fetches lectures, etc.)
  await openAnalyzeModal(assignmentId);

  // 2. Fetch the updated assignment details to get the saved analysis
  try {
    const response = await fetch(`${API_BASE_URL}/assignments/${assignmentId}`);
    if (response.ok) {
      const assignment = await response.json();
      if (assignment.latestAnalysis) {
        // 3. Render the results immediately
        renderAnalysisResults(assignment.latestAnalysis);
        // 4. Reveal the results area
        document.getElementById('analyze-results-area').classList.remove('hidden');

        // Optional: Scroll to results
        document.getElementById('analyze-results-area').scrollIntoView({ behavior: 'smooth' });
      }
    }
  } catch (error) {
    console.error("Error loading saved analysis:", error);
  }
}

// Make globally accessible
window.showSavedAnalysis = showSavedAnalysis;
window.openAnalyzeModal = openAnalyzeModal;
window.runAssignmentAnalysis = runAssignmentAnalysis;
window.renderAnalysisResults = renderAnalysisResults;


// Refresh the pending analyses list on the home screen
async function refreshPendingAnalyses() {
  const container = document.getElementById("pending-analyses-container");
  if (!container) return; // Not on home screen

  try {
    // Fetch all lectures
    const response = await fetch(`${API_BASE_URL}/lectures`);
    if (!response.ok) return;

    const lectures = await response.json();
    const pendingLectures = lectures.filter(l => l.analysisStatus === 'processing');

    if (pendingLectures.length === 0) {
      container.innerHTML = '<p class="text-gray-500 italic">No analyses currently in progress.</p>';
      return;
    }

    container.innerHTML = '';
    pendingLectures.forEach(lecture => {
      const el = document.createElement('div');
      el.className = 'bg-white/80 backdrop-blur-sm p-6 rounded-xl shadow-md';
      el.innerHTML = `
            <div class="flex items-center gap-4">
                <svg class="w-6 h-6 text-gray-500 animate-spin" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                <div>
                    <h3 class="font-semibold text-gray-800">Analyzing "${escapeHtml(lecture.title)}"</h3>
                    <p class="text-sm text-gray-600">This analysis is processing...</p>
                </div>
            </div>
      `;
      container.appendChild(el);
    });

  } catch (error) {
    console.error("Error refreshing pending analyses:", error);
  }
}

// --- STUDENT TRENDS CHARTS ---

let trendsCharts = {}; // Store chart instances to destroy them before re-rendering

async function loadStudentTrends(courseId) {
    if (!courseId) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/classes/${courseId}/trends`);
        if (!response.ok) throw new Error("Failed to fetch trends data");
        
        const data = await response.json();
        renderStudentTrendsCharts(data);
        
    } catch (error) {
        console.error("Error loading student trends:", error);
        // Show error state in charts
    }
}

function renderStudentTrendsCharts(data) {
    // Destroy existing charts
    Object.values(trendsCharts).forEach(chart => {
        if (chart) chart.destroy();
    });
    trendsCharts = {};

    // 1. Topic Drift (Streamgraph - approximated as Stacked Area)
    const ctxDrift = document.getElementById('chart-topic-drift');
    if (ctxDrift) {
        // Process data for Chart.js
        const labels = data.topic_drift.map(d => d.lecture);
        
        // Get all unique topics
        const allTopics = new Set();
        data.topic_drift.forEach(d => Object.keys(d.topics).forEach(t => allTopics.add(t)));
        
        // Professional Color Palette (Cool spectrum)
        const palette = [
             '#6366f1', '#8b5cf6', '#d946ef', '#ec4899', '#f43f5e', 
             '#3b82f6', '#0ea5e9', '#06b6d4', '#14b8a6', '#10b981'
        ];

        // Create datasets
        const datasets = Array.from(allTopics).map((topic, index) => {
            const color = palette[index % palette.length];
            return {
                label: topic,
                data: data.topic_drift.map(d => d.topics[topic] || 0),
                backgroundColor: color + '90', // 90% opacity hex
                borderColor: color,
                borderWidth: 1,
                fill: true,
                tension: 0.4, // Smooth curves
                pointRadius: 0
            };
        });

        trendsCharts.drift = new Chart(ctxDrift, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'bottom', labels: { boxWidth: 12, usePointStyle: true } },
                    tooltip: { mode: 'index', intersect: false, backgroundColor: 'rgba(255, 255, 255, 0.9)', titleColor: '#1f2937', bodyColor: '#4b5563', borderColor: '#e5e7eb', borderWidth: 1 }
                },
                scales: {
                    y: { stacked: true, beginAtZero: true, display: false },
                    x: { grid: { display: false }, ticks: { font: { size: 11 } } }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });
    }

    // 2. Sentiment & Performance
    const ctxSentiment = document.getElementById('chart-sentiment');
    if (ctxSentiment) {
        const labels = data.sentiment_history.map(d => d.lecture);
        
        // Create Gradients
        const ctx = ctxSentiment.getContext('2d');
        const gradientSentiment = ctx.createLinearGradient(0, 0, 0, 400);
        gradientSentiment.addColorStop(0, 'rgba(59, 130, 246, 0.5)'); // Blue
        gradientSentiment.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

        const gradientPerformance = ctx.createLinearGradient(0, 0, 0, 400);
        gradientPerformance.addColorStop(0, 'rgba(16, 185, 129, 0.5)'); // Green
        gradientPerformance.addColorStop(1, 'rgba(16, 185, 129, 0.0)');
        
        trendsCharts.sentiment = new Chart(ctxSentiment, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Student Sentiment',
                        data: data.sentiment_history.map(d => d.sentiment),
                        borderColor: '#3B82F6',
                        backgroundColor: gradientSentiment,
                        fill: true,
                        tension: 0.4,
                        pointBackgroundColor: '#fff',
                        pointBorderColor: '#3B82F6',
                        pointBorderWidth: 2,
                        pointRadius: 4
                    },
                    {
                        label: 'AI Performance Rating',
                        data: data.sentiment_history.map(d => d.performance),
                        borderColor: '#10B981',
                        backgroundColor: gradientPerformance,
                        fill: true,
                        tension: 0.4,
                        borderDash: [5, 5],
                        pointBackgroundColor: '#fff',
                        pointBorderColor: '#10B981',
                        pointBorderWidth: 2,
                        pointRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top', align: 'end', labels: { usePointStyle: true } },
                    tooltip: { backgroundColor: 'rgba(255, 255, 255, 0.9)', titleColor: '#1f2937', bodyColor: '#4b5563', borderColor: '#e5e7eb', borderWidth: 1 }
                },
                scales: {
                    y: { min: 0, max: 10, grid: { borderDash: [2, 4], color: '#f3f4f6' } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    // 3. Engagement Pulse
    const ctxEngagement = document.getElementById('chart-engagement');
    if (ctxEngagement) {
        const labels = data.engagement_history.map(d => d.lecture);
        
        // Gradient for bars
        const ctx = ctxEngagement.getContext('2d');
        const gradientBar = ctx.createLinearGradient(0, 0, 0, 400);
        gradientBar.addColorStop(0, '#fbbf24'); // Amber-400
        gradientBar.addColorStop(1, '#d97706'); // Amber-600

        trendsCharts.engagement = new Chart(ctxEngagement, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Interaction Count',
                        data: data.engagement_history.map(d => d.interaction_count),
                        backgroundColor: gradientBar,
                        borderRadius: 4,
                        yAxisID: 'y',
                        order: 1  // Higher order = renders behind
                    },
                    {
                        label: 'Engagement Score',
                        data: data.engagement_history.map(d => d.score),
                        borderColor: '#8B5CF6', // Purple
                        backgroundColor: '#8B5CF6',
                        type: 'line',
                        tension: 0.4,
                        pointRadius: 4,
                        pointBackgroundColor: '#fff',
                        pointBorderWidth: 2,
                        yAxisID: 'y1',
                        order: 0  // Lower order = renders on top
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                     legend: { position: 'top', align: 'end', labels: { usePointStyle: true } },
                     tooltip: { backgroundColor: 'rgba(255, 255, 255, 0.9)', titleColor: '#1f2937', bodyColor: '#4b5563', borderColor: '#e5e7eb', borderWidth: 1 }
                },
                scales: {
                    y: { beginAtZero: true, position: 'left', grid: { display: false } },
                    y1: { beginAtZero: true, position: 'right', min: 0, max: 10, grid: { borderDash: [2, 4], color: '#f3f4f6' } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    // 4. Understanding Gap
    const ctxGap = document.getElementById('chart-understanding-gap');
    if (ctxGap) {
        const labels = data.understanding_gap.map(d => d.topic);
        
        trendsCharts.gap = new Chart(ctxGap, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Intended Depth',
                        data: data.understanding_gap.map(d => d.intended),
                        backgroundColor: '#9CA3AF', // Gray
                    },
                    {
                        label: 'Actual Understanding',
                        data: data.understanding_gap.map(d => d.actual),
                        backgroundColor: data.understanding_gap.map(d => d.gap > 1 ? '#EF4444' : '#10B981'), // Red if gap > 1, else Green
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y', // Horizontal Bar Chart
                scales: {
                    x: { min: 0, max: 5 }
                }
            }
        });
    }
}

async function refreshStudentTrends() {
    if (!currentCourseId) return;

    // specific button in student-trends.html
    const btn = document.querySelector('button[onclick="refreshStudentTrends()"]');
    let originalText = "";
    
    if (btn) {
        originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `
            <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Analyzing...
        `;
    }

    try {
        // Call the generation endpoint
        const response = await fetch(`${API_BASE_URL}/classes/${currentCourseId}/generate-trends`, {
            method: 'POST'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || "Failed to generate trends");
        }
        
        const result = await response.json();
        
        // Show success toast
        if (typeof showToast === 'function') {
            showToast("Trends Updated", result.message || "Simulated trends generated successfully.");
        } else {
            alert(result.message || "Trends updated.");
        }

        // Reload the charts with the new data
        await loadStudentTrends(currentCourseId);

    } catch (error) {
        console.error("Error refreshing trends:", error);
        alert(`Failed to refresh trends: ${error.message}`);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

// Make globally available
window.loadStudentTrends = loadStudentTrends;
window.refreshStudentTrends = refreshStudentTrends;

async function refreshTrends() {
    if (!currentCourseId) return;
    
    const btn = document.querySelector('button[onclick="refreshTrends()"]');
    if (!btn) return;
    
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `
        <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-purple-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Refreshing...
    `;
    
    try {
        const response = await fetch(`${API_BASE_URL}/classes/${currentCourseId}/generate-trends`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || "Failed to refresh trends");
        }
        
        const result = await response.json();
        
        // Refresh the charts
        await loadStudentTrends(currentCourseId);
        
        alert(result.message || `Trends refreshed! ${result.analyzed_lectures} lectures have analysis data.`);
        
    } catch (error) {
        console.error("Error refreshing trends:", error);
        alert(`Error: ${error.message}`);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

window.refreshTrends = refreshTrends;
// Keep backward compatibility
window.generateAIInsights = refreshTrends;
// --- SYLLABUS UPLOAD ---

function triggerSyllabusUpload() {
    const fileInput = document.getElementById("syllabus-upload");
    if (fileInput) {
        fileInput.click();
    }
}

async function handleSyllabusUpload(event) {
    if (!currentCourseId) return;
    
    const file = event.target.files[0];
    if (!file) return;
    
    // UI Feedback
    const btn = document.querySelector('button[onclick="triggerSyllabusUpload()"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `
        <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Analyzing Syllabus...
    `;
    
    const formData = new FormData();
    formData.append("file", file);
    
    try {
        const response = await fetch(`${API_BASE_URL}/classes/${currentCourseId}/syllabus`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || "Failed to upload syllabus");
        }
        
        const result = await response.json();
        
        alert("Syllabus analyzed successfully! Course structure has been updated.");
        
        // Refresh views to show new data
        await refreshCourseOverview(currentCourseId);
        await loadStudentTrends(currentCourseId);
        
    } catch (error) {
        console.error("Error uploading syllabus:", error);
        alert(`Error: ${error.message}`);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
        event.target.value = ""; // Reset input
    }
}

// Make globally available
window.triggerSyllabusUpload = triggerSyllabusUpload;
window.handleSyllabusUpload = handleSyllabusUpload;


// --- ANALYSIS POLLER & NOTIFICATIONS ---

const processingLectures = new Set();
let analysisPollerInterval = null;

function startAnalysisPoller() {
    if (analysisPollerInterval) clearInterval(analysisPollerInterval);
    
    // Check every 3 seconds
    analysisPollerInterval = setInterval(checkAnalysisStatus, 3000);
}

async function checkAnalysisStatus() {
    try {
        const response = await fetch(`${API_BASE_URL}/lectures`);
        if (!response.ok) return;
        
        const lectures = await response.json();
        
        lectures.forEach(lecture => {
            if (lecture.analysisStatus === 'processing') {
                processingLectures.add(lecture.id);
            } else if (processingLectures.has(lecture.id)) {
                // Status changed from processing to something else (completed or failed)
                processingLectures.delete(lecture.id);
                handleAnalysisCompletion(lecture);
            }
        });
        
    } catch (error) {
        console.error("Error polling analysis status:", error);
    }
}

function handleAnalysisCompletion(lecture) {
    if (lecture.analysisStatus === 'completed') {
        // Need to determine if we are currently editing/viewing THIS lecture
        const isEditingThisLecture = (
            (typeof currentScreen !== 'undefined' && 
             (currentScreen === 'screen-lecture-edit' || currentScreen === 'screen-lecture-planning')) && 
            (typeof currentLectureId !== 'undefined' && currentLectureId === lecture.id)
        );
        
        if (isEditingThisLecture) {
            // Auto-redirect if user is waiting on the page
            showLectureAnalysis(lecture.id);
        } else {
            // Show toast notification
            showToast(
                "Analysis Complete", 
                `"${lecture.title}" is ready to view.`, 
                () => showLectureAnalysis(lecture.id)
            );
        }
    } else if (lecture.analysisStatus === 'failed') {
        showToast(
            "Analysis Failed", 
            `Analysis for "${lecture.title}" failed. Please try again.`, 
            null,
            "error"
        );
        
        // Reset button state if on the page
        const submitBtn = document.getElementById("submit-analysis-btn");
        if ((typeof currentScreen !== 'undefined' && 
             (currentScreen === 'screen-lecture-edit' || currentScreen === 'screen-lecture-planning')) && 
            (typeof currentLectureId !== 'undefined' && currentLectureId === lecture.id) && submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23-.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                </svg>
                Submit for Analysis
            `;
        }
    }
}

function showToast(title, message, onClick, type = "success") {
    // Create toast container if it doesn't exist
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'fixed top-24 right-6 z-50 flex flex-col gap-3 pointer-events-none';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    const borderClass = type === 'error' ? 'border-red-500' : 'border-green-500';
    const iconColor = type === 'error' ? 'text-red-500' : 'text-green-500';
    const icon = type === 'error' 
        ? `<svg class="w-6 h-6 ${iconColor}" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`
        : `<svg class="w-6 h-6 ${iconColor}" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`;
    
    toast.className = `pointer-events-auto bg-white/95 backdrop-blur shadow-lg rounded-lg p-4 border-l-4 ${borderClass} flex items-start gap-3 w-80 transform transition-all duration-300 translate-x-full cursor-pointer hover:shadow-xl`;
    toast.innerHTML = `
        <div class="flex-shrink-0 pt-0.5">${icon}</div>
        <div class="flex-1">
            <h4 class="font-semibold text-gray-900 text-sm">${title}</h4>
            <p class="text-gray-600 text-sm mt-1">${message}</p>
        </div>
        <button class="text-gray-400 hover:text-gray-600" onclick="event.stopPropagation(); this.parentElement.remove();">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
    `;
    
    if (onClick) {
        toast.onclick = () => {
            onClick();
            toast.remove();
        };
    }
    
    container.appendChild(toast);
    
    // Animate in
    requestAnimationFrame(() => {
        toast.classList.remove('translate-x-full');
    });
    
    // Auto remove
    setTimeout(() => {
        toast.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 6000);
}

// Start polling immediately if DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", startAnalysisPoller);
} else {
    startAnalysisPoller();
}

// --- Course Management Functions (Settings Page) ---

// Store the course ID that's pending deletion
let pendingDeleteCourseId = null;

/**
 * Load all courses into the settings page management section
 */
async function loadSettingsCourses() {
    const listContainer = document.getElementById("settings-courses-list");
    if (!listContainer) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/classes`);
        if (!response.ok) throw new Error("Failed to fetch courses");
        
        const courses = await response.json();
        
        if (courses.length === 0) {
            listContainer.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <p>No courses found.</p>
                    <p class="text-sm mt-1">Add a course from the Home page to get started.</p>
                </div>
            `;
            return;
        }
        
        // Build the courses list
        let html = '';
        for (const course of courses) {
            // Count lectures for this course
            const lecturesRes = await fetch(`${API_BASE_URL}/lectures?class_id=${course.id}`);
            const lectures = lecturesRes.ok ? await lecturesRes.json() : [];
            const lectureCount = lectures.length;
            const videoCount = lectures.filter(l => l.hasVideo).length;
            
            html += `
                <div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div class="flex-1 min-w-0">
                        <h4 class="font-semibold text-gray-900 truncate">${course.code} - ${course.name}</h4>
                        <p class="text-sm text-gray-500">${course.semester} • ${lectureCount} lecture${lectureCount !== 1 ? 's' : ''} • ${videoCount} video${videoCount !== 1 ? 's' : ''}</p>
                    </div>
                    <button 
                        onclick="showDeleteCourseModal('${course.id}', '${course.code} - ${course.name}')"
                        class="ml-4 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors flex items-center gap-2"
                    >
                        <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                        Delete
                    </button>
                </div>
            `;
        }
        
        listContainer.innerHTML = html;
    } catch (error) {
        console.error("Error loading courses for settings:", error);
        listContainer.innerHTML = `
            <div class="text-center py-8 text-red-500">
                <p>Failed to load courses.</p>
                <button onclick="loadSettingsCourses()" class="mt-2 text-sm text-blue-600 hover:underline">Try again</button>
            </div>
        `;
    }
}

/**
 * Show the delete confirmation modal for a course
 */
function showDeleteCourseModal(courseId, courseName) {
    pendingDeleteCourseId = courseId;
    
    const modal = document.getElementById("modal-delete-course");
    const courseNameElement = document.getElementById("delete-course-name");
    
    if (courseNameElement) {
        courseNameElement.textContent = courseName;
    }
    
    if (modal) {
        modal.classList.remove("hidden");
    }
}

/**
 * Confirm and execute the course deletion
 */
async function confirmDeleteCourse() {
    if (!pendingDeleteCourseId) return;
    
    const confirmBtn = document.getElementById("confirm-delete-btn");
    const originalText = confirmBtn?.textContent;
    
    try {
        // Show loading state
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = `
                <svg class="animate-spin h-4 w-4 inline mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Deleting...
            `;
        }
        
        // Call the full delete API
        const response = await fetch(`${API_BASE_URL}/classes/${pendingDeleteCourseId}/full`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || "Failed to delete course");
        }
        
        const result = await response.json();
        console.log("Delete result:", result);
        
        // Hide modal
        hideModal("modal-delete-course");
        
        // Refresh the courses list
        loadSettingsCourses();
        
        // Show success message
        showToast("success", "Course Deleted", result.message);
        
    } catch (error) {
        console.error("Error deleting course:", error);
        showToast("error", "Delete Failed", error.message || "Failed to delete course. Please try again.");
    } finally {
        // Reset button state
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = originalText;
        }
        pendingDeleteCourseId = null;
    }
}

// Make functions available globally
window.loadSettingsCourses = loadSettingsCourses;
window.showDeleteCourseModal = showDeleteCourseModal;
window.confirmDeleteCourse = confirmDeleteCourse;

// --- Gemini API Key Management ---

const GEMINI_KEY_STORAGE = 'praxis_gemini_api_key';

/**
 * Get the custom Gemini API key if set, otherwise null
 */
function getCustomGeminiApiKey() {
    return localStorage.getItem(GEMINI_KEY_STORAGE);
}

/**
 * Save a custom Gemini API key
 */
async function saveGeminiApiKey() {
    const input = document.getElementById('gemini-api-key-input');
    const message = document.getElementById('gemini-key-message');
    const status = document.getElementById('gemini-key-status');
    const saveBtn = document.querySelector('[onclick="saveGeminiApiKey()"]');
    
    if (!input) return;
    
    const key = input.value.trim();
    
    if (!key) {
        showMessage(message, 'Please enter an API key', 'error');
        return;
    }
    
    // Basic validation - Gemini keys typically start with "AIza"
    if (!key.startsWith('AIza') || key.length < 30) {
        showMessage(message, 'This doesn\'t look like a valid Gemini API key', 'error');
        return;
    }
    
    // Show loading state
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `
            <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Validating...
        `;
    }
    
    showMessage(message, 'Validating API key...', 'info');
    
    try {
        // Validate with backend
        const response = await fetch(`${API_BASE_URL}/validate-gemini-key`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: key })
        });
        
        const result = await response.json();
        
        if (result.valid) {
            // Save to localStorage
            localStorage.setItem(GEMINI_KEY_STORAGE, key);
            
            // Update UI
            if (status) {
                status.textContent = 'Custom Key';
                status.className = 'px-2 py-0.5 text-xs font-medium rounded-full bg-indigo-100 text-indigo-700';
            }
            
            showMessage(message, '✓ API key validated and saved!', 'success');
            showToast('API Key Saved', 'Your custom Gemini API key is now active.');
        } else {
            showMessage(message, result.error || 'Invalid API key', 'error');
        }
    } catch (error) {
        console.error('Error validating API key:', error);
        // Save anyway if validation endpoint fails
        localStorage.setItem(GEMINI_KEY_STORAGE, key);
        showMessage(message, '⚠️ Saved (couldn\'t validate - will test on first use)', 'warning');
    } finally {
        // Reset button
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = `
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                </svg>
                Save Key
            `;
        }
    }
}

/**
 * Clear the custom API key and use default
 */
function clearGeminiApiKey() {
    const input = document.getElementById('gemini-api-key-input');
    const message = document.getElementById('gemini-key-message');
    const status = document.getElementById('gemini-key-status');
    
    localStorage.removeItem(GEMINI_KEY_STORAGE);
    
    if (input) input.value = '';
    
    if (status) {
        status.textContent = 'Using Default';
        status.className = 'px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700';
    }
    
    showMessage(message, 'Switched to the default API key.', 'success');
}

/**
 * Toggle visibility of the API key input
 */
function toggleApiKeyVisibility() {
    const input = document.getElementById('gemini-api-key-input');
    const toggleText = document.getElementById('toggle-key-text');
    
    if (!input || !toggleText) return;
    
    if (input.type === 'password') {
        input.type = 'text';
        toggleText.textContent = 'Hide';
    } else {
        input.type = 'password';
        toggleText.textContent = 'Show';
    }
}

/**
 * Load the API key status when settings page loads
 */
function loadGeminiApiKeyStatus() {
    const input = document.getElementById('gemini-api-key-input');
    const status = document.getElementById('gemini-key-status');
    
    const savedKey = getCustomGeminiApiKey();
    
    if (savedKey) {
        if (input) {
            // Show a masked version
            input.value = savedKey;
        }
        if (status) {
            status.textContent = 'Custom Key';
            status.className = 'px-2 py-0.5 text-xs font-medium rounded-full bg-indigo-100 text-indigo-700';
        }
    }
}

/**
 * Show a message with appropriate styling
 */
function showMessage(element, text, type) {
    if (!element) return;
    
    element.textContent = text;
    element.classList.remove('hidden', 'text-green-600', 'text-red-600', 'text-gray-500');
    
    if (type === 'success') {
        element.classList.add('text-green-600');
    } else if (type === 'error') {
        element.classList.add('text-red-600');
    } else if (type === 'warning') {
        element.classList.add('text-orange-600');
    } else if (type === 'info') {
        element.classList.add('text-blue-600');
    } else {
        element.classList.add('text-gray-500');
    }
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        element.classList.add('hidden');
    }, 5000);
}

// Make API key functions available globally
window.getCustomGeminiApiKey = getCustomGeminiApiKey;
window.saveGeminiApiKey = saveGeminiApiKey;
window.clearGeminiApiKey = clearGeminiApiKey;
window.toggleApiKeyVisibility = toggleApiKeyVisibility;
window.loadGeminiApiKeyStatus = loadGeminiApiKeyStatus;
