// Gemini Notes Dashboard JavaScript

let emailsData = [];
let meetingGroupsData = {};
let selectedMeeting = null;

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

// Update meeting card progress display
function updateMeetingCardProgress() {
    const completedItems = getCompletedItems();

    Object.keys(meetingGroupsData).forEach(meetingName => {
        const meeting = meetingGroupsData[meetingName];
        const completedCount = meeting.items.filter(item => completedItems[item.id]).length;

        const card = document.querySelector(`.meeting-card[data-meeting="${CSS.escape(meetingName)}"]`);
        if (card) {
            const progressEl = card.querySelector('.meeting-card-progress');
            if (progressEl) {
                progressEl.textContent = `${completedCount}/${meeting.items.length} done`;
            }
        }
    });
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

// Render meeting cards
function renderMeetingCards() {
    const container = document.getElementById('meeting-cards-container');
    const meetingCountBadge = document.getElementById('meeting-count');
    const completedItems = getCompletedItems();

    const meetings = Object.values(meetingGroupsData);

    // Update meeting count
    if (meetingCountBadge) {
        meetingCountBadge.textContent = meetings.length;
    }

    if (meetings.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>No meetings found with action items.</p>
            </div>
        `;
        return;
    }

    // Sort meetings by number of items (descending)
    meetings.sort((a, b) => b.items.length - a.items.length);

    const html = meetings.map(meeting => {
        const completedCount = meeting.items.filter(item => completedItems[item.id]).length;
        const isActive = selectedMeeting === meeting.name;

        return `
            <div class="meeting-card ${isActive ? 'active' : ''}"
                 data-meeting="${escapeHtml(meeting.name)}"
                 onclick="selectMeeting('${escapeAttr(meeting.name)}')">
                <div class="meeting-card-header">
                    <div class="meeting-card-avatar">${meeting.name.charAt(0).toUpperCase()}</div>
                    <div class="meeting-card-title">${escapeHtml(meeting.name)}</div>
                </div>
                <div class="meeting-card-footer">
                    <span class="meeting-card-progress">${completedCount}/${meeting.items.length} done</span>
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

    const html = meeting.items.map(item => `
        <div class="action-item ${item.completed ? 'completed' : ''}" data-item-id="${item.id}">
            <label class="checkbox-container">
                <input type="checkbox"
                    data-item-id="${item.id}"
                    ${item.completed ? 'checked' : ''}
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
    `).join('');

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
