// Gemini Notes Dashboard JavaScript

let emailsData = [];

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
    updateProgressCounts();
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
}

// Update progress counts for each account
function updateProgressCounts() {
    const completedItems = getCompletedItems();
    const accountGroups = document.querySelectorAll('.account-group');

    accountGroups.forEach(group => {
        const items = group.querySelectorAll('.action-item');
        const completedCount = Array.from(items).filter(item => {
            const checkbox = item.querySelector('input[type="checkbox"]');
            return checkbox?.checked;
        }).length;

        const progressSpan = group.querySelector('.account-progress');
        if (progressSpan) {
            progressSpan.textContent = `${completedCount}/${items.length} done`;
        }
    });

    // Update total count
    const totalItems = document.querySelectorAll('.action-item').length;
    const totalCompleted = Object.keys(completedItems).length;
    const countBadge = document.getElementById('action-count');
    if (countBadge) {
        countBadge.textContent = `${totalCompleted}/${totalItems}`;
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = document.getElementById('refresh-btn');
    const sortSelect = document.getElementById('sort-select');

    if (refreshBtn) {
        refreshBtn.addEventListener('click', fetchEmails);
    }

    if (sortSelect) {
        sortSelect.addEventListener('change', () => sortAndRenderEmails());
    }

    // Initial fetch
    if (document.getElementById('emails-container')) {
        fetchEmails();
    }
});

// Fetch emails from API
async function fetchEmails() {
    const emailsContainer = document.getElementById('emails-container');
    const actionItemsContainer = document.getElementById('action-items-container');

    emailsContainer.innerHTML = '<div class="loading">Loading emails</div>';
    actionItemsContainer.innerHTML = '<div class="loading">Loading action items</div>';

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

        // Show warning if any
        let warningHtml = '';
        if (data.warning) {
            warningHtml = `<div class="warning">${data.warning}</div>`;
        }

        // Render emails
        sortAndRenderEmails(warningHtml);

        // Render action items grouped by account
        renderActionItemsByAccount(emailsData);

    } catch (error) {
        emailsContainer.innerHTML = `<div class="error">Error: ${error.message}</div>`;
        actionItemsContainer.innerHTML = `<div class="error">Error loading action items</div>`;
    }
}

// Sort and render emails
function sortAndRenderEmails(warningHtml = '') {
    const container = document.getElementById('emails-container');
    const sortSelect = document.getElementById('sort-select');
    const sortValue = sortSelect ? sortSelect.value : 'date-desc';

    // Sort emails
    const sortedEmails = [...emailsData].sort((a, b) => {
        switch (sortValue) {
            case 'date-desc':
                return new Date(b.date_sortable) - new Date(a.date_sortable);
            case 'date-asc':
                return new Date(a.date_sortable) - new Date(b.date_sortable);
            case 'title-asc':
                return a.subject.localeCompare(b.subject);
            case 'title-desc':
                return b.subject.localeCompare(a.subject);
            default:
                return 0;
        }
    });

    if (sortedEmails.length === 0) {
        container.innerHTML = warningHtml + `
            <div class="empty-state">
                <p>No emails found with the "Gemini Notes" label.</p>
                <p>Make sure you have emails labeled "Gemini Notes" in your Gmail.</p>
            </div>
        `;
        return;
    }

    const emailsHtml = sortedEmails.map(email => `
        <div class="email-card" data-id="${email.id}">
            <div class="email-header">
                <div class="email-subject">${escapeHtml(email.subject)}</div>
                <div class="email-date">${email.date}</div>
            </div>
            <div class="email-sender">${escapeHtml(email.sender)}</div>
            <div class="email-snippet">${escapeHtml(email.snippet)}</div>
            ${email.action_items.length > 0 ? `
                <div class="email-actions">
                    ${email.action_items.slice(0, 3).map(item => `
                        <span class="email-action-tag" title="${escapeHtml(item.text)}">
                            ${escapeHtml(truncate(item.text, 50))}
                        </span>
                    `).join('')}
                    ${email.action_items.length > 3 ? `
                        <span class="email-action-tag">+${email.action_items.length - 3} more</span>
                    ` : ''}
                </div>
            ` : ''}
        </div>
    `).join('');

    container.innerHTML = warningHtml + emailsHtml;
}

// Extract meeting title from email subject
// e.g., 'Notes: "MWC / Shelby" Feb 4, 2026' -> 'MWC / Shelby'
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

// Render action items grouped by meeting title
function renderActionItemsByAccount(emails) {
    const container = document.getElementById('action-items-container');
    const countBadge = document.getElementById('action-count');
    const completedItems = getCompletedItems();

    // Group action items by meeting title
    const meetingGroups = {};
    let totalItems = 0;

    emails.forEach(email => {
        const meetingTitle = extractMeetingTitle(email.subject);

        if (!meetingGroups[meetingTitle]) {
            meetingGroups[meetingTitle] = {
                name: meetingTitle,
                date: email.date,
                items: []
            };
        }

        email.action_items.forEach(item => {
            const itemId = generateItemId(email.id, item.text);
            meetingGroups[meetingTitle].items.push({
                id: itemId,
                text: item.text,
                sourceSubject: email.subject,
                sourceDate: email.date,
                emailId: email.id,
                completed: !!completedItems[itemId]
            });
            totalItems++;
        });
    });

    // Update count badge
    const completedCount = Object.keys(completedItems).length;
    if (countBadge) {
        countBadge.textContent = `${completedCount}/${totalItems}`;
    }

    // Check if no action items
    if (totalItems === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>No action items found.</p>
                <p>Action items are extracted from bullet points, numbered lists, and task-related keywords.</p>
            </div>
        `;
        return;
    }

    // Sort meetings by number of items (descending)
    const sortedMeetings = Object.values(meetingGroups).sort((a, b) => b.items.length - a.items.length);

    // Render grouped action items
    const html = sortedMeetings.map(meeting => {
        const completedInGroup = meeting.items.filter(item => item.completed).length;

        return `
            <div class="account-group">
                <div class="account-header">
                    <div class="account-info">
                        <span class="account-avatar">${meeting.name.charAt(0).toUpperCase()}</span>
                        <span class="account-name">${escapeHtml(meeting.name)}</span>
                    </div>
                    <span class="account-progress">${completedInGroup}/${meeting.items.length} done</span>
                </div>
                <div class="account-items">
                    ${meeting.items.map(item => `
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
                    `).join('')}
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

// Utility: Truncate text
function truncate(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}
