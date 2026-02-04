// Gemini Notes Dashboard JavaScript

let emailsData = [];

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

        // Render action items
        renderActionItems(emailsData);

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

// Render action items
function renderActionItems(emails) {
    const container = document.getElementById('action-items-container');
    const countBadge = document.getElementById('action-count');

    // Collect all action items
    const allActionItems = [];
    emails.forEach(email => {
        email.action_items.forEach(item => {
            allActionItems.push({
                text: item.text,
                sourceSubject: email.subject,
                sourceDate: email.date,
                emailId: email.id
            });
        });
    });

    // Update count
    if (countBadge) {
        countBadge.textContent = allActionItems.length;
    }

    if (allActionItems.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>No action items found.</p>
                <p>Action items are extracted from bullet points, numbered lists, and task-related keywords.</p>
            </div>
        `;
        return;
    }

    const actionItemsHtml = allActionItems.map((item, index) => `
        <div class="action-item" data-email-id="${item.emailId}">
            <div class="action-item-text">${escapeHtml(item.text)}</div>
            <div class="action-item-source">
                ${escapeHtml(truncate(item.sourceSubject, 40))} - ${item.sourceDate}
            </div>
        </div>
    `).join('');

    container.innerHTML = actionItemsHtml;
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
