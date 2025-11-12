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
};

const modalFileMap = {
  "modal-hw1": "hw1.html",
  "modal-pdf-viewer": "pdf-viewer.html",
  "modal-lecture-rewind": "lecture-rewind.html",
  "modal-topic-detail": "topic-detail.html",
  "modal-add-class": "add-class.html",
};

// --- DOMContentLoaded (Initialization) ---
document.addEventListener("DOMContentLoaded", () => {
  // Set the initial active link
  activeSidebarLink = document.getElementById("nav-home");

  // Load the home screen by default
  // We pass the activeSidebarLink so it remains 'active'
  showScreen("screen-home-dashboard", activeSidebarLink);

  // Add listener for the history back button
  const historyBackButton = document.getElementById("history-back-button");
  if (historyBackButton) {
    historyBackButton.addEventListener("click", () => {
      // For this demo, we'll just go "home"
      showScreen("screen-home-dashboard", document.getElementById("nav-home"));
    });
  }
});

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
  const screenFile = screenFileMap[screenId];
  if (!screenFile) {
    console.error("Unknown screen ID:", screenId);
    return;
  }

  try {
    // Fetch the new screen content
    const response = await fetch(`./screens/${screenFile}`);
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
        `<h1 class="text-4xl font-bold text-gray-900">${
          courseData.code || ""
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
    }

    // Reset to first tab if navigating to course hub
    if (screenId === "screen-course-hub") {
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

  // Check if modal is already in DOM. If so, just show it.
  const existingModal = document.getElementById(modalId);
  if (existingModal) {
    // Special case: re-fetch content for topic detail modal
    if (modalId === "modal-topic-detail") {
      // This modal is dynamic, so we don't just "show" it.
      // The showTopicDetail() function will handle its content.
    } else {
      existingModal.classList.remove("hidden");
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
      const response = await fetch(`./modals/${modalFile}`);
      if (!response.ok) throw new Error(`Failed to load ${modalFile}`);
      const html = await response.text();

      // Append (not innerHTML) so we can have multiple modals
      modalContainer.insertAdjacentHTML("beforeend", html);

      // Find the newly added modal and remove 'hidden' class
      const newModal = document.getElementById(modalId);
      if (newModal) {
        newModal.classList.remove("hidden");
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
function showInsight(insightType) {
  const panel = document.getElementById("insight-content");
  const title = document.getElementById("dynamic-insight-panel-title");
  let content = "";
  let newTitle = "AI Reflection";

  const backButton = `<button onclick="showAllInsights()" class="mb-4 -ml-1 text-sm font-semibold primary-gradient-text flex items-center gap-1 hover:opacity-80">
        <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
        All Reflections
        </button>`;

  switch (insightType) {
    case "clarity":
      newTitle = "Clarity Insight";
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
    case "question":
      newTitle = "Interaction Insight";
      content = `
                <li class="flex items-start gap-3">
                    <span class="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center mt-1"><svg class="w-5 h-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" /></svg></span>
                    <div>
                        <h4 class="font-semibold text-gray-800">[00:10:59] Student Question</h4>
                        <p class="text-gray-600">LaRue asked if email open time could be used as a label for 'importance'.</p>
                    </div>
                </li>`;
      break;
    case "answer":
      newTitle = "Interaction Insight";
      content = `
                <li class="flex items-start gap-3">
                    <span class="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 flex items-center justify-center mt-1"><svg class="w-5 h-5 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg></span>
                    <div>
                        <h4 class="font-semibold text-gray-800">[00:11:09] Socratic Answer</h4>
                        <p class="text-gray-600">This was a model response. You validated the idea ("Great, okay...") and then used a Socratic question to lead the class to the problem ("What's the obvious problem with that?").</p>
                    </div>
                </li>`;
      break;
    case "joke":
      newTitle = "Positive Moment";
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

async function showTopicDetail(topicName, status, buttonElement) {
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
      statusColorClass = "bg-yellow-500";
      break;
    case "Struggling":
      statusColorClass = "bg-red-500";
      break;
    default:
      statusColorClass = "bg-gray-500";
  }

  // Placeholders
  let keyConcepts =
    "AI should fetch brief definition from lecture notes/summary for this topic.";
  let examples =
    "AI should fetch examples related to this topic from lectures, e.g., COMPAS for Fairness.";
  let lectureMoments =
    "AI should list relevant slides/timestamps. E.g., Lecture 4, Slides 47-51 for Data Shift.";
  let assignmentConnections =
    "AI should list connections to assignments. E.g., A2 Data Section for Data Source Selection.";
  let aiReflection =
    "AI add brief note on common student misconceptions or teaching tips for this topic.";

  // Specific Examples from Prompt
  if (topicName.includes("Data Shift")) {
    lectureMoments =
      "Lecture 4, Slides 47-51. <br><strong>Note:</strong> This section was identified as rushed in the lecture analysis, potentially impacting comprehension.";
    aiReflection =
      "<strong>Common confusion:</strong> Differentiating when P(x) changes (covariate) vs. when P(y) changes (label) vs. when P(y|x) changes (concept).";
  }
  if (
    topicName.includes("Data Preparation") ||
    topicName.includes("Data Understanding") ||
    topicName.includes("Data Documentation")
  ) {
    lectureMoments =
      "Lecture 4. <br><strong>Note:</strong> This topic was deferred due to time constraints in Lecture 4. Ensure coverage in Lecture 5.";
  }
  if (topicName.includes("Appropriate Data Source Selection")) {
    assignmentConnections =
      "<strong>Assignment 2: Full Proposal, Section 4 (Data).</strong> <br><strong>Feedback Insight:</strong> Average score was 6/10. Common issue: Selected data sources (e.g., YouTube) didn't match the target context (small interactive courses).";
  }
  if (topicName.includes("Justifying AI")) {
    assignmentConnections =
      "<strong>Assignment 2: Full Proposal, Introduction.</strong> <br><strong>Feedback Insight:</strong> Average score was 2.5/5. Common issue: Weak justification for why AI/ML was necessary compared to simpler alternatives.";
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
    totalLectures: parseInt(formData.get("total-lectures")),
    semester: formData.get("semester"),
    description: formData.get("description") || "",
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
      throw new Error(
        errorData.detail || `HTTP error! status: ${response.status}`
      );
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

    // Remove only dynamically added API classes (those created by createClassCard)
    // Keep hardcoded classes that were in the original HTML
    const existingCards = Array.from(classesGrid.children);
    existingCards.forEach((card) => {
      // Check if this card was created dynamically (has onclick that calls showScreen with courseData)
      // Hardcoded cards have onclick="showScreen('screen-course-hub', document.getElementById('nav-courses'))"
      // Dynamic cards have onclick that sets currentCourseId and passes courseData
      const onclick = card.getAttribute("onclick");
      if (onclick && onclick.includes("currentCourseId")) {
        card.remove();
      }
    });

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

  // Calculate progress (assuming currentLecture is 0 for new classes)
  const currentLecture = classData.currentLecture || 0;
  const totalLectures = classData.totalLectures || 1;
  const progress =
    totalLectures > 0 ? (currentLecture / totalLectures) * 100 : 0;

  card.innerHTML = `
        <div class="flex justify-between items-start mb-4">
            <div>
                <div class="text-xs text-gray-500">${classData.code || ""}</div>
                <div class="text-lg font-semibold text-gray-900">${
                  classData.name || ""
                }</div>
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

// Course and lecture management
let currentCourseId = null;
let currentLectureId = null;
let uploadedFile = null;
let uploadedVideoFile = null;
let uploadedMaterialsFile = null;

async function refreshTopicKnowledge() {
  const topicContainer = document.getElementById("topic-knowledge-pills");
  if (!topicContainer || !currentCourseId) return;

  try {
    const API_BASE_URL = "http://localhost:8001/api";
    const response = await fetch(
      `${API_BASE_URL}/classes/${currentCourseId}/topic-knowledge`
    );
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const topics = await response.json();

    // Clear only dynamically added pills
    Array.from(topicContainer.children).forEach((pill) => {
      if (!pill.hasAttribute("data-original-content")) {
        pill.remove();
      }
    });

    // Add pills from API
    topics.forEach((topic) => {
      const pill = document.createElement("div");
      let statusClass = "";
      switch (topic.status) {
        case "Strong":
          statusClass = "topic-pill-strong";
          break;
        case "Developing":
          statusClass = "topic-pill-developing";
          break;
        case "Struggling":
          statusClass = "topic-pill-struggling";
          break;
        default:
          statusClass = "topic-pill-neutral";
      }
      pill.className = statusClass;
      pill.textContent = topic.name;
      pill.onclick = () => showTopicDetail(topic.name, topic.status, pill);
      topicContainer.appendChild(pill);
    });
  } catch (error) {
    console.error("Error refreshing topic knowledge:", error);
  }
}

function addNewLecture() {
  if (!currentCourseId) {
    alert("Please select a course first.");
    return;
  }

  // Create a new blank lecture
  currentLectureId = "lecture-" + Date.now(); // Generate a temporary ID
  uploadedFile = null;
  uploadedVideoFile = null;

  // Navigate to the edit screen
  showScreen("screen-lecture-edit", document.getElementById("nav-courses"));

  // Reset the form
  setTimeout(() => {
    const titleInput = document.getElementById("lecture-title-input");
    const topicList = document.getElementById("lecture-topic-list");
    const fileInfo = document.getElementById("uploaded-file-info");
    const videoInfo = document.getElementById("uploaded-video-info");

    if (titleInput) titleInput.value = "New Lecture";
    if (topicList) topicList.innerHTML = "";
    if (fileInfo) {
      fileInfo.classList.add("hidden");
      document.getElementById("uploaded-file-name").textContent = "";
    }
    if (videoInfo) {
      videoInfo.classList.add("hidden");
      document.getElementById("uploaded-video-name").textContent = "";
    }
  }, 100);
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
  // Use the global uploaded materials file if no file is passed
  const fileToAnalyze = materialsFile || uploadedMaterialsFile;

  if (!lectureId) {
    alert("Please save the lecture first before analyzing materials.");
    return;
  }

  // Show loading modal
  showMaterialsLoadingScreen();

  try {
    const API_BASE_URL = "http://localhost:8001/api";
    const formData = new FormData();

    // Only append materials if we have a new upload, otherwise backend will use saved file
    if (fileToAnalyze) {
      formData.append("materials", fileToAnalyze);
    }

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
    if (result.extracted_topics && result.extracted_topics.length > 0) {
      updateTopicsList(result.extracted_topics);

      // Show success message with topic count
      alert(
        `Materials analyzed successfully! Found ${result.extracted_topics.length} topics.`
      );
    } else {
      alert("Materials analyzed, but no topics were extracted.");
    }

    return result;
  } catch (error) {
    console.error("Error analyzing materials:", error);
    hideMaterialsLoadingScreen();
    alert(
      `Failed to analyze materials: ${error.message}\n\nNote: Make sure your backend API is running at http://localhost:8001`
    );
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
  // Or just clear all and add the new topics
  topicList.innerHTML = "";

  topics.forEach((topicName) => {
    const topicPill = document.createElement("div");
    topicPill.className =
      "py-3 px-5 rounded-full text-gray-700 font-medium bg-gray-200 border border-gray-300 flex items-center gap-2";
    topicPill.innerHTML = `
            <span>${topicName}</span>
            <button onclick="removeTopicPill(this)" class="text-red-600 hover:text-red-800 ml-1">
                <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        `;
    topicList.appendChild(topicPill);
  });
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

    // Navigate to edit screen
    showScreen("screen-lecture-edit", document.getElementById("nav-courses"));

    // Populate the form
    setTimeout(() => {
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
    // Keep only items with data-original-content="true"
    Array.from(pastLecturesUl.children).forEach((item) => {
      if (!item.hasAttribute("data-original-content")) {
        item.remove();
      }
    });

    Array.from(upcomingUl.children).forEach((item) => {
      if (!item.hasAttribute("data-original-content")) {
        item.remove();
      }
    });

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

    // Fetch lecture, analysis, and survey data
    const [lectureResponse, analysisResponse, surveysResponse] =
      await Promise.all([
        fetch(`${API_BASE_URL}/lectures/${lectureId}`),
        fetch(`${API_BASE_URL}/lectures/${lectureId}/analysis`),
        fetch(`${API_BASE_URL}/lectures/${lectureId}/surveys`), // Fetch existing surveys
      ]);

    if (!lectureResponse.ok) {
      throw new Error(`Failed to load lecture: ${lectureResponse.status}`);
    }

    if (!analysisResponse.ok) {
      throw new Error(`Failed to load analysis: ${analysisResponse.status}`);
    }

    // Surveys can be empty, so we don't throw an error if not found, just check if ok
    const surveys = surveysResponse.ok ? await surveysResponse.json() : [];

    const lecture = await lectureResponse.json();
    const analysis = await analysisResponse.json();

    // Navigate to analysis screen
    await showScreen(
      "screen-lecture-analysis",
      document.getElementById("nav-courses")
    );

    // Wait for the screen to be fully loaded before populating
    setTimeout(() => {
      populateAnalysisPage(lecture, analysis, surveys); // Pass surveys to populate function
    }, 100);
  } catch (error) {
    console.error("Error loading lecture analysis:", error);
    alert(`Failed to load lecture analysis: ${error.message}`);
  }
}

function populateAnalysisPage(lecture, analysis, surveys = []) {
  // Update title
  const titleElement = document.querySelector("#screen-lecture-analysis h1");
  if (titleElement) {
    titleElement.textContent = lecture.title;
  }

  // Update breadcrumb
  const breadcrumbElement = document.querySelector(
    "#screen-lecture-analysis .text-sm.text-gray-600 span:last-child"
  );
  if (breadcrumbElement) {
    breadcrumbElement.textContent = `${lecture.title}: Analysis`;
  }

  // --- NEW: Update Survey Button based on existence ---
  const surveyButtonContainer = document.getElementById(
    "survey-button-container"
  );
  if (surveyButtonContainer) {
    let buttonHtml = "";
    if (surveys && surveys.length > 0) {
      // Survey exists, show "View" button
      // We'll pass the latest survey to the view function
      const latestSurvey = surveys.sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      )[0];
      buttonHtml = `
                <button onclick='viewStudentSurvey(${JSON.stringify(
                  latestSurvey
                )})' class="flex items-center gap-2 text-white font-semibold py-2 px-4 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 shadow-md hover:opacity-90 transition-opacity">
                    <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    View Student Survey
                </button>
            `;
    } else {
      // No survey, show "Generate" button
      buttonHtml = `
                <button onclick="generateStudentSurvey()" class="flex items-center gap-2 text-white font-semibold py-2 px-4 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 shadow-md hover:opacity-90 transition-opacity">
                    <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                    </svg>
                    Generate Student Survey
                </button>
            `;
    }
    surveyButtonContainer.innerHTML = buttonHtml;
  }

  // Update video player
  const videoContainer = document.querySelector(
    "#screen-lecture-analysis .bg-gray-900.rounded-xl"
  );
  if (videoContainer && lecture.hasVideo) {
    const API_BASE_URL = "http://localhost:8001"; // Corrected base URL
    const videoUrl = `${API_BASE_URL}/api/lectures/${lecture.id}/video`;

    // Determine video type based on file extension
    const videoExt = lecture.videoName
      ? lecture.videoName.split(".").pop().toLowerCase()
      : "mp4";
    const videoTypes = {
      mp4: "video/mp4",
      mov: "video/quicktime",
      avi: "video/x-msvideo",
      mkv: "video/x-matroska",
      webm: "video/webm",
      flv: "video/x-flv",
      wmv: "video/x-ms-wmv",
    };
    const videoType = videoTypes[videoExt] || "video/mp4";

    videoContainer.innerHTML = `
            <video controls class="w-full h-full rounded-xl" style="max-height: 100%;" preload="metadata" controlsList="nodownload">
                <source src="${videoUrl}" type="${videoType}">
                Your browser does not support the video tag.
            </video>
        `;

    // Load and attach error handler after a short delay to ensure DOM is ready
    setTimeout(() => {
      const videoElement = videoContainer.querySelector("video");
      if (videoElement) {
        // Add error handler for debugging
        videoElement.addEventListener("error", (e) => {
          console.error("Video Error:", e);
          // You could display a user-friendly error message here
        });

        // Add loadstart handler to show loading state
        videoElement.addEventListener("loadstart", () => {
          console.log("Video load started...");
        });

        // Add canplay handler to confirm video is ready
        videoElement.addEventListener("canplay", () => {
          console.log("Video can play.");
        });

        // Explicitly load the video
        videoElement.load();
      }
    }, 100);
  }

  // Populate timeline
  populateTimeline(analysis.timeline || {}, analysis.video_duration || 3600);

  // Populate transcript
  populateTranscript(analysis.transcript || []);

  // Populate topic coverage
  populateTopicCoverage(analysis.topic_coverage || []);

  // Populate AI reflections
  populateAIReflections(analysis.ai_reflections || {});
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
      html += `<div class="timeline-event bg-yellow-500" style="left: ${left}%; width: ${width}%;" title="${
        event.title
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
      html += `<div class="timeline-event ${bgColor}" style="left: ${left}%; width: ${width}%;" title="${title} (${timeStr})" onclick="showTimelineInsight('${
        event.type
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
      html += `<div class="timeline-event bg-green-500" style="left: ${left}%; width: ${width}%;" title="${
        event.title
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
    html += `<p><span class="font-semibold text-black">${
      item.timestamp
    }</span> ${
      speakerLabel ? `<span class="font-semibold">${speakerLabel}</span> ` : ""
    }<span class="${typeClass}">${item.text}</span></p>`;
  });

  transcriptContainer.innerHTML = html;
}

function populateTopicCoverage(topics) {
  // Find the topic coverage container - it's the first aside section
  const topicSection = document.querySelector(
    "#screen-lecture-analysis aside .bg-white\\/80.backdrop-blur-sm.p-6.rounded-xl.shadow-md"
  );
  if (!topicSection) return;

  const topicContainer = topicSection.querySelector(".space-y-3");
  if (!topicContainer) return;

  let html = "";
  topics.forEach((topic) => {
    const iconColor = topic.covered ? "bg-green-100" : "bg-red-100";
    const textColor = topic.covered ? "text-green-600" : "text-red-600";
    const status = topic.covered ? "Covered" : "Missed";
    const icon = topic.covered
      ? '<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />'
      : '<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />';

    html += `
            <div class="flex items-center gap-3">
                <span class="flex-shrink-0 w-6 h-6 rounded-full ${iconColor} flex items-center justify-center">
                    <svg class="w-4 h-4 ${textColor}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        ${icon}
                    </svg>
                </span>
                <span class="font-medium text-gray-700">${topic.topic} (${status})</span>
            </div>
        `;
  });

  topicContainer.innerHTML = html;
}

function populateAIReflections(reflections) {
  const insightPanel = document.getElementById("insight-content");
  if (!insightPanel) return;

  let html = '<ul class="space-y-4">';

  // Add insights
  if (reflections.insights && reflections.insights.length > 0) {
    reflections.insights.forEach((insight) => {
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
                <li class="flex items-start gap-3">
                    <span class="flex-shrink-0 w-8 h-8 rounded-full ${iconClass} flex items-center justify-center mt-1">
                        <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                            ${iconSvg}
                        </svg>
                    </span>
                    <div>
                        <h4 class="font-semibold text-gray-800">${typeLabel}: ${insight.title}</h4>
                        <p class="text-gray-600">${insight.description}</p>
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

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
}

function showTimelineInsight(type, event) {
  // This can be enhanced to show specific insights when clicking timeline events
  showInsight(type);
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

  // Disable button and show loading state
  submitBtn.disabled = true;
  const originalText = submitBtn.innerHTML;
  submitBtn.innerHTML =
    '<svg class="w-5 h-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Analyzing...';

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

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ detail: "Unknown error" }));
      throw new Error(
        errorData.detail || `HTTP error! status: ${response.status}`
      );
    }

    const analysisResult = await response.json();

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

async function generateStudentSurvey() {
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
    const response = await fetch(
      `${API_BASE_URL}/lectures/${currentLectureId}/generate-survey`,
      {
        method: "POST",
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
    setTimeout(() => {
      populateSurveyScreen(currentSurvey);
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

async function viewStudentSurvey(survey) {
  if (!survey) {
    alert("Survey data is missing.");
    return;
  }

  // Store the survey
  currentSurvey = survey;

  // Navigate to survey screen
  await showScreen(
    "screen-student-survey",
    document.getElementById("nav-courses")
  );

  // Populate the survey
  setTimeout(() => {
    populateSurveyScreen(currentSurvey);
  }, 100);
}

function populateSurveyScreen(survey) {
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
    linkElement.textContent =
      survey.shareable_link || `https://praxis.edu/survey/${survey.survey_id}`;
  }

  // Populate questions
  const questionsContainer = document.getElementById(
    "survey-questions-container"
  );
  if (!questionsContainer) return;

  let html = "";

  survey.questions.forEach((question, index) => {
    html += `<div class="pb-6 ${
      index < survey.questions.length - 1 ? "border-b border-gray-200" : ""
    }">`;
    html += `<h3 class="text-lg font-semibold text-gray-900 mb-3">${
      index + 1
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
