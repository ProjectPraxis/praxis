/**
 * UI Components Library
 * Reusable rendering functions for all UI elements
 */
class UIComponents {
    /**
     * Render a course card for the dashboard
     */
    static renderCourseCard(course) {
        const progress = (course.current_lecture / course.total_lectures) * 100;
        return `
            <div onclick="showScreen('screen-course-hub', document.getElementById('nav-courses'))" 
                 class="bg-white/80 backdrop-blur-sm p-6 rounded-xl shadow-md cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1">
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <div class="text-xs text-gray-500">${course.course_code}</div>
                        <div class="text-lg font-semibold text-gray-900">${course.course_name}</div>
                    </div>
                    <div class="text-right">
                        <div class="text-sm font-medium text-gray-700">${course.current_lecture} of ${course.total_lectures}</div>
                        <div class="text-xs text-gray-500">lectures</div>
                    </div>
                </div>
                <div class="text-sm text-gray-600 mb-1">Lecture ${course.current_lecture} of ${course.total_lectures}</div>
                <div class="w-full bg-gray-200 rounded-full h-2.5">
                    <div class="primary-gradient h-2.5 rounded-full" style="width: ${progress}%"></div>
                </div>
            </div>
        `;
    }

    /**
     * Render a priority action card
     */
    static renderPriorityAction(action) {
        const borderColors = {
            critical: 'border-red-500',
            warning: 'border-yellow-500',
            info: 'border-blue-500'
        };
        
        const iconColors = {
            critical: 'bg-red-100 text-red-600',
            warning: 'bg-yellow-100 text-yellow-600',
            info: 'bg-blue-100 text-blue-600'
        };

        const icons = {
            critical: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z',
            warning: 'M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 0a12.06 12.06 0 004.5 0m-8.25 0a12.06 12.06 0 01-4.5 0m3.75 2.023a14.077 14.077 0 01-6.75 0',
            info: 'M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z'
        };

        const borderClass = borderColors[action.severity] || 'border-gray-500';
        const iconClass = iconColors[action.severity] || 'bg-gray-100 text-gray-600';
        const iconPath = icons[action.severity] || icons.info;

        return `
            <div class="bg-white/80 backdrop-blur-sm p-6 rounded-xl shadow-md border-l-4 ${borderClass}">
                <div class="flex items-start gap-3">
                    <span class="flex-shrink-0 w-8 h-8 rounded-full ${iconClass} flex items-center justify-center mt-1">
                        <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="${iconPath}" />
                        </svg>
                    </span>
                    <div>
                        <h3 class="text-lg font-semibold text-gray-900">${action.title}</h3>
                        <p class="text-gray-600 mb-3">${action.description}</p>
                        ${action.actions ? this.renderActionButtons(action.actions) : ''}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render action buttons
     */
    static renderActionButtons(actions) {
        return `
            <div class="flex gap-2">
                ${actions.map(action => `
                    <button onclick="${action.onclick}" 
                            class="text-sm font-medium text-white py-1.5 px-3 rounded-md primary-gradient hover:opacity-90">
                        ${action.label}
                    </button>
                `).join('')}
            </div>
        `;
    }

    /**
     * Render a topic pill
     */
    static renderTopicPill(topic) {
        const statusColors = {
            'Strong': 'bg-green-500',
            'Developing': 'bg-yellow-500',
            'Struggling': 'bg-red-500',
            'Covered': 'course-coverage-gradient',
            'Missed': 'bg-gray-400'
        };

        const colorClass = statusColors[topic.status] || 'bg-gray-500';
        const textClass = colorClass.includes('gradient') ? 'text-white' : 'text-white';

        return `
            <button onclick="showTopicDetail('${topic.name}', '${topic.status}', this)" 
                    class="topic-pill py-3 px-5 rounded-full ${colorClass} ${textClass} font-medium shadow-sm">
                ${topic.name}
            </button>
        `;
    }

    /**
     * Render feedback section (Sustains/Improves)
     */
    static renderFeedbackSection(title, items, type) {
        const isPositive = type === 'sustains';
        const bgClass = isPositive ? 'bg-green-100' : 'bg-yellow-100';
        const textClass = isPositive ? 'text-green-700' : 'text-yellow-700';
        const iconPath = isPositive 
            ? 'M4.5 12.75l6 6 9-13.5'
            : 'M12 19.5v-15m0 0l-6.75 6.75M12 4.5l6.75 6.75';

        return `
            <div class="bg-white/80 backdrop-blur-sm p-6 rounded-xl shadow-md">
                <div class="flex items-center gap-3 mb-3">
                    <span class="flex-shrink-0 w-10 h-10 rounded-full ${bgClass} flex items-center justify-center">
                        <svg class="w-6 h-6 ${textClass}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="${iconPath}" />
                        </svg>
                    </span>
                    <h3 class="text-xl font-semibold ${textClass}">${title}</h3>
                </div>
                <ul class="space-y-2 list-disc list-inside text-gray-700">
                    ${items.map(item => `<li>${item}</li>`).join('')}
                </ul>
            </div>
        `;
    }

    /**
     * Render an insight card for lecture analysis
     */
    static renderInsightCard(insight) {
        const typeColors = {
            'clarity': 'bg-yellow-500',
            'interaction': 'bg-blue-500',
            'positive': 'bg-green-500',
            'opportunity': 'bg-red-500'
        };

        const color = typeColors[insight.type] || 'bg-gray-500';

        return `
            <div class="timeline-event ${color}" 
                 style="left: ${insight.position_percent}%; width: ${insight.width_percent || 3}%;" 
                 title="${insight.title} (${insight.timestamp})" 
                 onclick="showInsight('${insight.type}')">
            </div>
        `;
    }

    /**
     * Render timeline track for lecture analysis
     */
    static renderTimelineTrack(label, events) {
        return `
            <div class="font-medium text-sm text-gray-700">${label}</div>
            <div class="timeline-track">
                ${events.map(event => this.renderInsightCard(event)).join('')}
            </div>
        `;
    }

    /**
     * Render assignment performance section
     */
    static renderAssignmentPerformance(assignment) {
        return `
            <div class="bg-white/80 backdrop-blur-sm p-6 rounded-xl shadow-md">
                <div class="flex justify-between items-start">
                    <div>
                        <h3 class="text-xl font-semibold text-gray-800 mb-1">${assignment.title}</h3>
                        <p class="text-sm text-gray-500 mb-4">Status: ${assignment.status} | Overall Avg. Score: ${assignment.avg_score}</p>
                    </div>
                    <div class="flex gap-2 items-center">
                        ${assignment.pdf_url ? `
                            <button onclick="showPdfModal('${assignment.pdf_url}')" 
                                    class="text-sm font-semibold text-gray-600 hover:text-black">
                                View PDF
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render topic detail modal content
     */
    static renderTopicDetail(topic) {
        const statusColorClass = {
            'Strong': 'bg-green-500',
            'Developing': 'bg-yellow-500',
            'Struggling': 'bg-red-500'
        }[topic.status] || 'bg-gray-500';

        return `
            <div class="flex items-center gap-3 mb-4">
                <span class="w-5 h-5 rounded-full ${statusColorClass}"></span>
                <h3 class="text-2xl font-bold text-gray-900">${topic.name}</h3>
                <span class="text-sm font-medium text-gray-500">(${topic.status})</span>
            </div>
            
            <div class="space-y-5">
                <div>
                    <h4 class="font-semibold text-gray-700">Key Concepts</h4>
                    <p class="text-gray-600 text-sm mt-1">${topic.key_concepts || 'No concepts defined yet.'}</p>
                </div>
                <div>
                    <h4 class="font-semibold text-gray-700">Examples</h4>
                    <p class="text-gray-600 text-sm mt-1">${topic.examples || 'No examples available.'}</p>
                </div>
                <div>
                    <h4 class="font-semibold text-gray-700">Relevant Lecture Moments</h4>
                    <p class="text-gray-600 text-sm mt-1">${topic.lecture_moments || 'Not covered in lectures yet.'}</p>
                </div>
                <div>
                    <h4 class="font-semibold text-gray-700">Assignment Connections</h4>
                    <p class="text-gray-600 text-sm mt-1">${topic.assignment_connections || 'No assignments yet.'}</p>
                </div>
                <div>
                    <h4 class="font-semibold text-gray-700">AI Reflection</h4>
                    <p class="text-gray-600 text-sm mt-1">${topic.ai_reflection || 'No AI insights available.'}</p>
                </div>
            </div>
        `;
    }
}

// Export for global access
window.UIComponents = UIComponents;
