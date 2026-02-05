// Gemini Notes Dashboard JavaScript

let emailsData = [];
let meetingGroupsData = {};
let selectedMeeting = null;
let currentViewMode = 'todo'; // 'todo' or 'completed'

// Local storage key for completed items
const COMPLETED_ITEMS_KEY = 'geminiNotes_completedItems';

// Get completed items from local storage
function getCompletedItems() {
    const stored = localStorage.getItem(COMPLETED_ITEMS_KEY);
    return stored ? JSON.parse(stored) : {};
}

// Save completed items to local storage
function saveCompletedItems(items) {
    localStorage.setItem(COMPLETED_ITEMS_KEY, JSON.stringify(items));
}

// Set view mode (todo or completed)
function setViewMode(mode) {
    currentViewMode = mode;
    selectedMeeting = null;

    // Update toggle button states
    document.getElementById('todo-btn').classList.toggle('active', mode === 'todo');
    document.getElementById('completed-btn').classList.toggle('active', mode === 'completed');

    // Update meetings title
    const meetingsTitle = document.getElementById('meetings-title');
    if (meetingsTitle) {
        meetingsTitle.textContent = mode === 'todo' ? 'Meetings' : 'Completed Meetings';
    }

    // Re-render meeting cards
    renderMeetingCards();

    // Reset action items section
    const titleEl = document.getElementById('selected-meeting-title');
    const countBadge = document.getElementById('action-count');
    const actionContainer = document.getElementById('action-items-container');

    if (titleEl) titleEl.textContent = 'Select a meeting above';
    if (countBadge) countBadge.style.display = 'none';
    if (actionContainer) {
        actionContainer.innerHTML = '<div class="empty-state"><p>Click on a meeting card above to view its action items.</p></div>';
    }
}

// Toggle action item completion
function toggleActionItem(itemId) {
    const completedItems = getCompletedItems();
    if (completedItems[itemId]) {
        delete completedItems[itemId];
    } else {
        completedItems[itemId] = true;
    }
    saveCompletedItems(completedItems);
    updateActionItemUI(itemId, completedItems[itemId]);
    updateMeetingCardProgress();
}

// Update UI for a single action item
function updateActionItemUI(itemId, isCompleted) {
    const checkbox = document.querySelector(`input[data-item-id="${itemId}"]`);
    const actionItem = checkbox?.closest('.action-item');
    if (checkbox) {
        checkbox.checked = isCompleted;
    }
    if (actionItem) {
        actionItem.classList.toggle('completed', isCompleted);
    }

    // Update the action count badge
    if (selectedMeeting && meetingGroupsData[selectedMeeting]) {
        const meeting = meetingGroupsData[selectedMeeting];
        const completedItems = getCompletedItems();
        const completedCount = meeting.items.filter(item => completedItems[item.id]).length;
        const countBadge = document.getElementById('action-count');
        if (countBadge) {
            countBadge.textContent = `${completedCount}/${meeting.items.length}`;
        }
    }
}

// Update meeting card progress display and handle view transitions
function updateMeetingCardProgress() {
    const completedItems = getCompletedItems();

    Object.keys(meetingGroupsData).forEach(meetingName => {
        const meeting = meetingGroupsData[meetingName];
        const completedCount = meeting.items.filter(item => completedItems[item.id]).length;
        const allCompleted = completedCount === meeting.items.length && meeting.items.length > 0;

        const card = document.querySelector(`.meeting-card[data-meeting="${CSS.escape(meetingName)}"]`);
        if (card) {
            // In todo mode, hide completed meetings
            // In completed mode, hide incomplete meetings
            const shouldHide = (currentViewMode === 'todo' && allCompleted) ||
                              (currentViewMode === 'completed' && !allCompleted);

            if (shouldHide) {
                card.style.transition = 'all 0.3s ease';
                card.style.opacity = '0';
                card.style.transform = 'scale(0.9)';
                setTimeout(() => {
                    card.remove();
                    updateMeetingCount();

                    if (selectedMeeting === meetingName) {
                        selectedMeeting = null;
                        const titleEl = document.getElementById('selected-meeting-title');
                        const countBadge = document.getElementById('action-count');
                        const actionContainer = document.getElementById('action-items-container');

                        if (currentViewMode === 'todo') {
                            if (titleEl) titleEl.textContent = 'All done! Select another meeting';
                            if (actionContainer) {
                                actionContainer.innerHTML = '<div class="empty-state"><p>Great job! All action items completed for this meeting.</p></div>';
                            }
                        } else {
                            if (titleEl) titleEl.textContent = 'Select a meeting above';
                            if (actionContainer) {
                                actionContainer.innerHTML = '<div class="empty-state"><p>Click on a meeting card above to view its action items.</p></div>';
                            }
                        }
                        if (countBadge) countBadge.style.display = 'none';
                    }
                }, 300);
            } else {
                const progressEl = card.querySelector('.meeting-card-progress');
                if (progressEl) {
                    progressEl.textContent = `${completedCount}/${meeting.items.length} done`;
                }
            }
        }
    });
}

// Update meeting count badge
function updateMeetingCount() {
    const meetingCountBadge = document.getElementById('meeting-count');
    const remainingCards = document.querySelectorAll('.meeting-card').length;
    if (meetingCountBadge) {
        meetingCountBadge.textContent = remainingCards;
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = document.getElementById('refresh-btn');

    if (refreshBtn) {
        refreshBtn.addEventListener('click', fetchEmails);
    }

    // Initial fetch
    if (document.getElementById('meeting-cards-container')) {
        fetchEmails();
    }
});

// Fetch emails from API
async function fetchEmails() {
    const meetingCardsContainer = document.getElementById('meeting-cards-container');
    const actionItemsContainer = document.getElementById('action-items-container');

    meetingCardsContainer.innerHTML = '<div class="loading">Loading meetings</div>';
    actionItemsContainer.innerHTML = '<div class="empty-state"><p>Click on a meeting card above to view its action items.</p></div>';

    try {
        const response = await fetch('/api/emails');
        const data = await response.json();

        if (!response.ok) {
            if (data.authenticated === false) {
                window.location.href = '/';
                return;
            }
            throw new Error(data.error || 'Failed to fetch emails');
        }

        emailsData = data.emails || [];

        // Process and render meeting cards
        processMeetings(emailsData);
        renderMeetingCards();

    } catch (error) {
        meetingCardsContainer.innerHTML = `<div class="error">Error: ${error.message}</div>`;
        actionItemsContainer.innerHTML = `<div class="error">Error loading data</div>`;
    }
}

// Extract meeting title from email subject
function extractMeetingTitle(subject) {
    // Try to extract title from quotes
    const quoteMatch = subject.match(/[""]([^""]+)[""]/);
    if (quoteMatch) {
        return quoteMatch[1].trim();
    }
    // Try to extract from "Notes: X" pattern
    const notesMatch = subject.match(/Notes:\s*(.+?)(?:\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)|\s*$)/i);
    if (notesMatch) {
        return notesMatch[1].trim().replace(/^[""]|[""]$/g, '');
    }
    // Fallback to subject
    return subject || 'Untitled Meeting';
}

// Generate unique ID for action item
function generateItemId(emailId, itemText) {
    return `${emailId}_${hashCode(itemText)}`;
}

// Simple hash function for generating IDs
function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
}

// Process emails into meeting groups
function processMeetings(emails) {
    const completedItems = getCompletedItems();
    meetingGroupsData = {};

    emails.forEach(email => {
        const meetingTitle = extractMeetingTitle(email.subject);

        if (!meetingGroupsData[meetingTitle]) {
            meetingGroupsData[meetingTitle] = {
                name: meetingTitle,
                date: email.date,
                items: []
            };
        }

        email.action_items.forEach(item => {
            const itemId = generateItemId(email.id, item.text);
            meetingGroupsData[meetingTitle].items.push({
                id: itemId,
                text: item.text,
                sourceSubject: email.subject,
                sourceDate: email.date,
                emailId: email.id,
                completed: !!completedItems[itemId]
            });
        });
    });
}

// Render meeting cards based on current view mode
function renderMeetingCards() {
    const container = document.getElementById('meeting-cards-container');
    const meetingCountBadge = document.getElementById('meeting-count');
    const completedItems = getCompletedItems();

    // Filter meetings based on view mode
    const meetings = Object.values(meetingGroupsData).filter(meeting => {
        // Show meetings with 0 items only in todo mode (so user can see all meetings)
        if (meeting.items.length === 0) {
            return currentViewMode === 'todo';
        }
        const completedCount = meeting.items.filter(item => completedItems[item.id]).length;
        const allCompleted = completedCount === meeting.items.length;

        if (currentViewMode === 'todo') {
            return !allCompleted; // Show incomplete meetings
        } else {
            return allCompleted; // Show completed meetings
        }
    });

    // Update meeting count
    if (meetingCountBadge) {
        meetingCountBadge.textContent = meetings.length;
    }

    if (meetings.length === 0) {
        const message = currentViewMode === 'todo'
            ? 'All caught up! No pending action items.'
            : 'No completed meetings yet.';
        container.innerHTML = `
            <div class="empty-state">
                <p>${message}</p>
            </div>
        `;
        return;
    }

    // Sort meetings by date (newest first), then by number of items (descending)
    meetings.sort((a, b) => {
        // First compare by date (newest first)
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        if (dateB - dateA !== 0) return dateB - dateA;
        // Then by number of items (more items first)
        return b.items.length - a.items.length;
    });

    const html = meetings.map(meeting => {
        const completedCount = meeting.items.filter(item => completedItems[item.id]).length;
        const isActive = selectedMeeting === meeting.name;
        const hasItems = meeting.items.length > 0;

        return `
            <div class="meeting-card ${isActive ? 'active' : ''} ${!hasItems ? 'no-items' : ''}"
                 data-meeting="${escapeHtml(meeting.name)}"
                 onclick="selectMeeting('${escapeAttr(meeting.name)}')">
                <div class="meeting-card-header">
                    <div class="meeting-card-avatar">${meeting.name.charAt(0).toUpperCase()}</div>
                    <div class="meeting-card-title">${escapeHtml(meeting.name)}</div>
                </div>
                <div class="meeting-card-footer">
                    <span class="meeting-card-progress">${hasItems ? `${completedCount}/${meeting.items.length} done` : 'No action items'}</span>
                    <span class="meeting-card-count">${meeting.items.length} items</span>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

// Select a meeting and show its action items
function selectMeeting(meetingName) {
    selectedMeeting = meetingName;

    // Update card active states
    document.querySelectorAll('.meeting-card').forEach(card => {
        card.classList.remove('active');
        if (card.dataset.meeting === meetingName) {
            card.classList.add('active');
        }
    });

    // Update title
    const titleEl = document.getElementById('selected-meeting-title');
    if (titleEl) {
        titleEl.textContent = meetingName;
    }

    // Show action count badge
    const countBadge = document.getElementById('action-count');
    if (countBadge) {
        countBadge.style.display = 'inline-block';
    }

    // Render action items for selected meeting
    renderActionItems(meetingName);
}

// Render action items for a specific meeting
function renderActionItems(meetingName) {
    const container = document.getElementById('action-items-container');
    const countBadge = document.getElementById('action-count');
    const completedItems = getCompletedItems();

    const meeting = meetingGroupsData[meetingName];

    if (!meeting || meeting.items.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>No action items found for this meeting.</p>
            </div>
        `;
        if (countBadge) {
            countBadge.textContent = '0';
        }
        return;
    }

    // Update count badge
    const completedCount = meeting.items.filter(item => completedItems[item.id]).length;
    if (countBadge) {
        countBadge.textContent = `${completedCount}/${meeting.items.length}`;
    }

    const html = meeting.items.map(item => {
        const isCompleted = !!completedItems[item.id];
        return `
            <div class="action-item ${isCompleted ? 'completed' : ''}" data-item-id="${item.id}">
                <label class="checkbox-container">
                    <input type="checkbox"
                        data-item-id="${item.id}"
                        ${isCompleted ? 'checked' : ''}
                        onchange="toggleActionItem('${item.id}')">
                    <span class="checkmark"></span>
                </label>
                <div class="action-item-content">
                    <div class="action-item-text">${escapeHtml(item.text)}</div>
                    <div class="action-item-source">
                        ${item.sourceDate}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

// Utility: Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Utility: Escape for attribute
function escapeAttr(text) {
    return text.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// Utility: Truncate text
function truncate(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}
