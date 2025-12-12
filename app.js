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
    const API_BASE_URL = "http://localhost:8001/api";
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
        const API_BASE_URL = "http://localhost:8001/api";
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

    // Scroll to top
    window.scrollTo(0, 0);
  } catch (error) {
    console.error("Error loading screen:", error);
    // You could show an error message to the user here
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
      const API_BASE_URL = "http://localhost:8001/api";
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
    const API_BASE_URL = "http://localhost:8001/api"; // FastAPI port
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
    const API_BASE_URL = "http://localhost:8001/api";
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
    const API_BASE_URL = "http://localhost:8001/api";
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
    const API_BASE_URL = "http://localhost:8001/api";
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
          const API_BASE_URL = "http://localhost:8001/api";
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
    const API_BASE_URL = "http://localhost:8001/api";
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
            <p class="text-gray-600 mb-4">Gemini AI is analyzing your lecture materials to extract topics and learning objectives.</p>
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
      const API_BASE_URL = "http://localhost:8001/api";
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
          const API_BASE_URL = "http://localhost:8001/api";
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
    const API_BASE_URL = "http://localhost:8001/api";
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
          const API_BASE_URL = "http://localhost:8001/api";
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
          const API_BASE_URL = "http://localhost:8001/api";
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
    const API_BASE_URL = "http://localhost:8001/api";
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

    const API_BASE_URL = "http://localhost:8001/api";

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
      const API_BASE_URL = "http://localhost:8001/api";
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
  const videoContainer = document.querySelector(
    "#screen-lecture-analysis .bg-gray-900.rounded-xl"
  );
  if (videoContainer && lecture.hasVideo) {
    const API_BASE_URL = "http://localhost:8001/api";
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
      const API_BASE_URL = "http://localhost:8001/api";
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
                        <div class="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onclick="openFeedbackModal('${insightId}', 'up')" class="p-1.5 rounded-full hover:bg-gray-100 transition-colors" title="Helpful">
                                <svg class="w-4 h-4 text-gray-600 hover:text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75A2.25 2.25 0 0116.5 4.5c0 1.152-.26 2.243-.723 3.218-.266.558-.645 1.08-1.084 1.533a9.04 9.04 0 01-2.861 2.4c-.723.384-1.35.956-1.653 1.715a4.498 4.498 0 00-.322 1.672V12.75a.75.75 0 01-.75.75h-4.5A2.25 2.25 0 013 11.25v-1.5A2.25 2.25 0 015.25 7.5h1.383z" />
                                </svg>
                            </button>
                            <button onclick="openFeedbackModal('${insightId}', 'down')" class="p-1.5 rounded-full hover:bg-gray-100 transition-colors" title="Not helpful">
                                <svg class="w-4 h-4 text-gray-600 hover:text-red-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M17.367 13.5c-.806 0-1.533.446-2.031 1.08a9.041 9.041 0 01-2.861 2.4c-.723.384-1.35.956-1.653 1.715a4.498 4.498 0 00-.322 1.672V21a.75.75 0 01-.75.75A2.25 2.25 0 017.5 19.5c0-1.152.26-2.243.723-3.218.266-.558.645-1.08 1.084-1.533a9.04 9.04 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V11.25a.75.75 0 01.75-.75h4.5A2.25 2.25 0 0119.5 12.75v1.5a2.25 2.25 0 01-2.25 2.25h-1.883z" />
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
}

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
  if (submitBtn.disabled) {
    return;
  }

  // Disable button and show loading state with progress bar
  submitBtn.disabled = true;
  const originalText = submitBtn.innerHTML;

  // Initial loading state
  submitBtn.innerHTML = `
    <div class="flex flex-col items-center w-full">
        <div class="flex items-center gap-2 mb-1">
            <svg class="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            <span>Analyzing Video... <span id="analysis-progress-text">0%</span></span>
        </div>
        <div class="w-full bg-indigo-700/50 rounded-full h-1.5 mt-1 overflow-hidden">
            <div id="analysis-progress-bar" class="bg-white h-1.5 rounded-full transition-all duration-500 ease-out" style="width: 0%"></div>
        </div>
    </div>
  `;

  // Simulated progress logic
  let progress = 0;
  const progressInterval = setInterval(() => {
    // Fast at first, then slows down
    let increment = 0;
    if (progress < 30) increment = Math.random() * 5;
    else if (progress < 60) increment = Math.random() * 2;
    else if (progress < 90) increment = Math.random() * 0.5;

    progress = Math.min(progress + increment, 90); // Cap at 90% until done

    const progressBar = document.getElementById('analysis-progress-bar');
    const progressText = document.getElementById('analysis-progress-text');

    if (progressBar) progressBar.style.width = `${progress}%`;
    if (progressText) progressText.textContent = `${Math.round(progress)}%`;
  }, 500);

  try {
    const API_BASE_URL = "http://localhost:8001/api";
    const formData = new FormData();

    // Only append video if we have a new upload, otherwise backend will use saved video
    if (uploadedVideoFile) {
      formData.append("video", uploadedVideoFile);
    }

    const response = await fetch(
      `${API_BASE_URL}/lectures/${currentLectureId}/analyze`,
      {
        method: "POST",
        body: formData,
      }
    );

    clearInterval(progressInterval);

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ detail: "Unknown error" }));
      throw new Error(
        errorData.detail || `HTTP error! status: ${response.status}`
      );
    }

    // Complete progress bar
    const progressBar = document.getElementById('analysis-progress-bar');
    const progressText = document.getElementById('analysis-progress-text');
    if (progressBar) progressBar.style.width = "100%";
    if (progressText) progressText.textContent = "100%";

    // Brief pause to show 100%
    await new Promise(resolve => setTimeout(resolve, 500));

    const result = await response.json();

    if (result.status === "processing") {
      // Analysis started in background
      alert("Analysis started! It will continue in the background. You can navigate away and check the status on the Home dashboard.");

      // Update UI to show processing state
      submitBtn.innerHTML = `
        <div class="flex items-center gap-2">
            <svg class="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            <span>Processing in Background...</span>
        </div>
      `;
      // Don't re-enable button immediately to prevent double-submit
      // But allow navigation (which is effectively allowed since we return)
      return;
    }

    const analysisResult = result.analysis;

    // Show success message
    alert(
      "Analysis complete! The lecture has been analyzed with AI-powered insights."
    );

    // Re-enable button first
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;

    // Small delay to ensure backend has saved the lecture update
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Navigate back to course hub to show the lecture has moved to Past Lectures
    if (currentCourseId) {
      try {
        const API_BASE_URL = "http://localhost:8001/api";
        const courseResponse = await fetch(
          `${API_BASE_URL}/classes/${currentCourseId}`
        );
        if (courseResponse.ok) {
          const courseData = await courseResponse.json();
          const navCourses = document.getElementById("nav-courses");
          await showScreen("screen-course-hub", navCourses, courseData);

          // Wait for screen to fully load, then switch to lectures tab
          // The showScreen function already calls refreshLecturesList when course hub loads,
          // but we need to make sure we're on the lectures tab to see it
          setTimeout(() => {
            const tabBtnLectures = document.getElementById("tab-btn-lectures");
            if (tabBtnLectures) {
              showTab("tab-lectures", tabBtnLectures);
              // Force a refresh after switching to lectures tab to ensure we have latest data
              // Add a small delay to ensure the tab is fully visible
              setTimeout(() => {
                refreshLecturesList();
              }, 200);
            } else {
              console.error("Could not find tab-btn-lectures button");
            }
          }, 400);
        } else {
          // If course fetch fails, just navigate to analysis page
          await showLectureAnalysis(currentLectureId);
        }
      } catch (error) {
        console.error("Error fetching course data:", error);
        // If error, navigate to analysis page
        await showLectureAnalysis(currentLectureId);
      }
    } else {
      // No course ID, just navigate to analysis page
      await showLectureAnalysis(currentLectureId);
    }
  } catch (error) {
    console.error("Error submitting for analysis:", error);
    alert(
      `Failed to analyze lecture: ${error.message}\n\nNote: Make sure your backend API is running at http://localhost:8001`
    );

    // Re-enable button
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
            <p class="text-gray-600 mb-4">Gemini AI is creating a comprehension survey based on the lecture analysis.</p>
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
    const API_BASE_URL = "http://localhost:8001/api";
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
    const API_BASE_URL = "http://localhost:8001/api";
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
    const API_BASE_URL = "http://localhost:8001/api";
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
      const API_BASE_URL = "http://localhost:8001/api";
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
      const API_BASE_URL = "http://localhost:8001/api";
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
    const API_BASE_URL = "http://localhost:8001/api";

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

    const API_BASE_URL = "http://localhost:8001/api";
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
    const API_BASE_URL = "http://localhost:8001/api";
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
    const API_BASE_URL = "http://localhost:8001/api";
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
    const API_BASE_URL = "http://localhost:8001/api";
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
            ${downloadBtn}
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
    const API_BASE_URL = "http://localhost:8001/api";
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
    const API_BASE_URL = "http://localhost:8001/api";
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

// Refresh the pending analyses list on the home screen
async function refreshPendingAnalyses() {
  const container = document.getElementById("pending-analyses-container");
  if (!container) return; // Not on home screen

  try {
    const API_BASE_URL = "http://localhost:8001/api";
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
