/**
 * Utility Functions
 * Helper functions used throughout the app
 */

/**
 * Show insight details in the lecture analysis panel
 * @param {string} insightType - Type of insight to show
 */
function showInsight(insightType) {
    const panel = document.getElementById('insight-content');
    const title = document.getElementById('dynamic-insight-panel-title');
    let content = '';
    let newTitle = 'AI Reflection';
    
    // Contextual "Back" button
    const backButton = `<button onclick="showAllInsights()" class="mb-4 -ml-1 text-sm font-semibold primary-gradient-text flex items-center gap-1 hover:opacity-80">
        <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
        All Reflections
    </button>`;
    
    const insights = {
        clarity: {
            title: 'Clarity Insight',
            content: `
                <li class="flex items-start gap-3">
                    <span class="flex-shrink-0 w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center mt-1"><svg class="w-5 h-5 text-yellow-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 0a12.06 12.06 0 004.5 0m-8.25 0a12.06 12.06 0 01-4.5 0m3.75 2.023a14.077 14.077 0 01-6.75 0" /></svg></span>
                    <div>
                        <h4 class="font-semibold text-gray-800">[00:50:07] Rushed Theory</h4>
                        <p class="text-gray-600">The definitions of dataset shift, covariate shift, and label shift were presented *extremely* rapidly. This is a high-risk area for student confusion.</p>
                        <p class="text-gray-600 mt-2 font-medium">Suggestion: Create a 5-minute recap video or handout that visually defines these terms.</p>
                    </div>
                </li>`
        },
        question: {
            title: 'Interaction Insight',
            content: `
                <li class="flex items-start gap-3">
                    <span class="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center mt-1"><svg class="w-5 h-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" /></svg></span>
                    <div>
                        <h4 class="font-semibold text-gray-800">[00:10:59] Student Question</h4>
                        <p class="text-gray-600">LaRue asked if email open time could be used as a label for 'importance'.</p>
                    </div>
                </li>`
        },
        answer: {
            title: 'Interaction Insight',
            content: `
                <li class="flex items-start gap-3">
                    <span class="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 flex items-center justify-center mt-1"><svg class="w-5 h-5 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg></span>
                    <div>
                        <h4 class="font-semibold text-gray-800">[00:11:09] Socratic Answer</h4>
                        <p class="text-gray-600">This was a model response. You validated the idea ("Great, okay...") and then used a Socratic question to lead the class to the problem ("What's the obvious problem with that?").</p>
                    </div>
                </li>`
        },
        joke: {
            title: 'Positive Moment',
            content: `
                <li class="flex items-start gap-3">
                    <span class="flex-shrink-0 w-8 h-8 rounded-full bg-pink-100 flex items-center justify-center mt-1"><svg class="w-5 h-5 text-pink-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75s.168-.75.375.75.375.336.375.75zm-.75 0h.008v.008H9v-.008zm4.5 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375.75.375.336.375.75zm-.75 0h.008v.008H13.5v-.008z" /></svg></span>
                    <div>
                        <h4 class="font-semibold text-gray-800">[00:13:20] Good Joke</h4>
                        <p class="text-gray-600">The "I'm told kids today don't use email..." joke landed well. These moments are great for building rapport and making the content more engaging.</p>
                    </div>
                </li>`
        }
    };
    
    const insight = insights[insightType];
    if (insight && title && panel) {
        title.innerHTML = insight.title;
        panel.innerHTML = backButton + '<ul class="space-y-4">' + insight.content + '</ul>';
    }
}

/**
 * Restore the insight panel to show all insights
 */
function showAllInsights() {
    window.AppState?.resetInsightPanel();
}

/**
 * Add a manual topic to the lecture planning
 */
function addManualTopic() {
    const input = document.getElementById('manual-topic-input');
    const list = document.getElementById('manual-topic-list');
    const topicName = input?.value.trim();
    
    if (topicName && list) {
        const newPill = document.createElement('div');
        newPill.className = "py-3 px-5 rounded-full text-gray-700 font-medium bg-gray-200 border border-gray-300";
        newPill.textContent = topicName;
        list.appendChild(newPill);
        input.value = '';
    }
}

/**
 * Print the lecture rewind report
 */
function printRewindReport() {
    window.print();
}

/**
 * Toggle visibility of an element
 * @param {string} elementId - ID of element to toggle
 */
function toggleVisibility(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.classList.toggle('hidden');
    }
}

/**
 * Show topic detail modal
 * @param {string} topicName - Name of the topic
 * @param {string} status - Status of the topic (Strong/Developing/Struggling)
 * @param {HTMLElement} buttonElement - Button that was clicked
 */
function showTopicDetail(topicName, status, buttonElement) {
    const modal = document.getElementById('modal-topic-detail');
    const content = document.getElementById('topic-detail-content');
    
    if (!content) return;
    
    let statusColorClass = '';
    switch (status) {
        case 'Strong':
            statusColorClass = 'bg-green-500';
            break;
        case 'Developing':
            statusColorClass = 'bg-yellow-500';
            break;
        case 'Struggling':
            statusColorClass = 'bg-red-500';
            break;
        default:
            statusColorClass = 'bg-gray-500';
    }

    // Build dynamic content based on topicName
    let keyConcepts = "AI should fetch brief definition from lecture notes/summary for this topic.";
    let examples = "AI should fetch examples related to this topic from lectures, e.g., COMPAS for Fairness.";
    let lectureMoments = "AI should list relevant slides/timestamps. E.g., Lecture 4, Slides 47-51 for Data Shift.";
    let assignmentConnections = "AI should list connections to assignments. E.g., A2 Data Section for Data Source Selection.";
    let aiReflection = "AI add brief note on common student misconceptions or teaching tips for this topic.";

    // Specific examples from real data
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
    const html = `
        <div class="flex items-center gap-3 mb-4">
            <span class="w-5 h-5 rounded-full ${statusColorClass}"></span>
            <h3 class="text-2xl font-bold text-gray-900">${topicName}</h3>
            <span class="text-sm font-medium text-gray-500">(${status})</span>
        </div>
        
        <div class="space-y-5">
            <div>
                <h4 class="font-semibold text-gray-700">Key Concepts</h4>
                <p class="text-gray-600 text-sm mt-1">${keyConcepts}</p>
            </div>
            <div>
                <h4 class="font-semibold text-gray-700">Examples</h4>
                <p class="text-gray-600 text-sm mt-1">${examples}</p>
            </div>
            <div>
                <h4 class="font-semibold text-gray-700">Relevant Lecture Moments</h4>
                <p class="text-gray-600 text-sm mt-1">${lectureMoments}</p>
            </div>
            <div>
                <h4 class="font-semibold text-gray-700">Assignment Connections</h4>
                <p class="text-gray-600 text-sm mt-1">${assignmentConnections}</p>
            </div>
            <div>
                <h4 class="font-semibold text-gray-700">AI Reflection</h4>
                <p class="text-gray-600 text-sm mt-1">${aiReflection}</p>
            </div>
        </div>
    `;
    
    content.innerHTML = html;
    window.ModalManager?.show('modal-topic-detail');
}

// Make functions globally accessible
window.showInsight = showInsight;
window.showAllInsights = showAllInsights;
window.addManualTopic = addManualTopic;
window.printRewindReport = printRewindReport;
window.toggleVisibility = toggleVisibility;
window.showTopicDetail = showTopicDetail;
