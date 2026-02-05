import os
import pickle
import re
import base64
from datetime import datetime
from email.utils import parsedate_to_datetime

from flask import Flask, render_template, jsonify, redirect, url_for, session, request
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

app = Flask(__name__)
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'dev-secret-key-change-in-production')

# Gmail API scopes
SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']

# Path to credentials
CREDENTIALS_FILE = 'credentials.json'
TOKEN_FILE = 'token.json'


def get_credentials():
    """Get valid user credentials from storage or return None."""
    creds = None

    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)

    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
            save_credentials(creds)
        except Exception:
            creds = None

    return creds


def save_credentials(creds):
    """Save credentials to token file."""
    with open(TOKEN_FILE, 'w') as token:
        token.write(creds.to_json())


def get_gmail_service():
    """Build and return Gmail API service."""
    creds = get_credentials()
    if not creds or not creds.valid:
        return None
    return build('gmail', 'v1', credentials=creds)


def get_label_id(service, label_name):
    """Get the label ID for a given label name."""
    results = service.users().labels().list(userId='me').execute()
    labels = results.get('labels', [])

    for label in labels:
        if label['name'].lower() == label_name.lower():
            return label['id']
    return None


def decode_email_body(payload):
    """Decode email body from various formats."""
    body = ""

    if 'body' in payload and payload['body'].get('data'):
        body = base64.urlsafe_b64decode(payload['body']['data']).decode('utf-8', errors='ignore')
    elif 'parts' in payload:
        for part in payload['parts']:
            if part['mimeType'] == 'text/plain' and part['body'].get('data'):
                body = base64.urlsafe_b64decode(part['body']['data']).decode('utf-8', errors='ignore')
                break
            elif part['mimeType'] == 'text/html' and part['body'].get('data'):
                body = base64.urlsafe_b64decode(part['body']['data']).decode('utf-8', errors='ignore')
            elif 'parts' in part:
                body = decode_email_body(part)
                if body:
                    break

    return body


def extract_action_items(body, subject):
    """Extract action items from Gemini Notes 'Suggested next steps' section."""
    action_items = []

    # Phrases that indicate footer/feedback content to exclude
    exclude_phrases = [
        'is the summary section',
        'is this email helpful',
        'feedback',
        'unsubscribe',
        'privacy policy',
        'terms of service',
        'google llc',
        'click here',
        'learn more',
        'was this helpful',
        'rate this',
        'notes by gemini',
        'open meeting notes',
    ]

    def is_valid_action_item(text):
        """Check if text is a valid action item (not footer/feedback content)."""
        text_lower = text.lower()
        for phrase in exclude_phrases:
            if phrase in text_lower:
                return False
        # Must be reasonable length
        if len(text) < 10 or len(text) > 1000:
            return False
        return True

    def clean_html(html_text):
        """Convert HTML to clean text while preserving structure."""
        # Replace common block elements with newlines
        text = re.sub(r'<br\s*/?>', '\n', html_text, flags=re.IGNORECASE)
        text = re.sub(r'</?(div|p|tr|li|h[1-6])[^>]*>', '\n', text, flags=re.IGNORECASE)
        # Remove all other HTML tags
        text = re.sub(r'<[^>]+>', ' ', text)
        # Decode HTML entities
        text = text.replace('&nbsp;', ' ')
        text = text.replace('&amp;', '&')
        text = text.replace('&lt;', '<')
        text = text.replace('&gt;', '>')
        text = text.replace('&quot;', '"')
        text = text.replace('&#39;', "'")
        text = text.replace('&rarr;', '→')
        text = text.replace('&#8594;', '→')
        # Normalize whitespace
        text = re.sub(r'[ \t]+', ' ', text)
        text = re.sub(r'\n\s*\n', '\n\n', text)
        return text.strip()

    # Clean the HTML body first
    clean_body = clean_html(body)

    # First, try to find the "Suggested next steps" section
    # Look for the section header and extract content after it
    next_steps_patterns = [
        r'Suggested next steps\s*(.*?)(?=\n\n[A-Z]|\n\n\n|Notes by Gemini|\Z)',
        r'Suggested next steps\s*:?\s*(.*?)(?=\n\n[A-Z]|\n\n\n|Notes by Gemini|\Z)',
        r'Next steps\s*(.*?)(?=\n\n[A-Z]|\n\n\n|Notes by Gemini|\Z)',
    ]

    next_steps_section = None
    for pattern in next_steps_patterns:
        match = re.search(pattern, clean_body, re.IGNORECASE | re.DOTALL)
        if match:
            next_steps_section = match.group(1).strip()
            if len(next_steps_section) > 10:  # Make sure we got meaningful content
                break
            next_steps_section = None

    if next_steps_section:
        # Extract items that start with arrows or bullet points
        # Common markers: →, -, •, *, etc.
        # Split by line and look for items starting with arrow
        lines = next_steps_section.split('\n')
        current_item = ""

        for line in lines:
            line = line.strip()
            # Check if line starts with an arrow or bullet
            if re.match(r'^[→➜➔⟶►▶\-•*]\s*', line):
                # Save previous item if exists
                if current_item and is_valid_action_item(current_item):
                    if current_item not in [ai['text'] for ai in action_items]:
                        action_items.append({
                            'text': current_item,
                            'source_subject': subject
                        })
                # Start new item
                current_item = re.sub(r'^[→➜➔⟶►▶\-•*]\s*', '', line).strip()
            elif current_item and line:
                # Continuation of previous item
                current_item += ' ' + line

        # Don't forget the last item
        if current_item and is_valid_action_item(current_item):
            if current_item not in [ai['text'] for ai in action_items]:
                action_items.append({
                    'text': current_item,
                    'source_subject': subject
                })

    # If no items found, try looking for arrow items anywhere in the body
    # but ONLY within the first 80% (exclude footer area)
    if not action_items:
        body_length = len(clean_body)
        main_body = clean_body[:int(body_length * 0.8)]

        # Find all lines with arrow markers
        arrow_lines = re.findall(r'[→➜➔⟶►▶]\s*(.+?)(?=\n|$)', main_body)
        for item in arrow_lines:
            item = item.strip()
            item = re.sub(r'\s+', ' ', item).strip()
            if is_valid_action_item(item):
                if item not in [ai['text'] for ai in action_items]:
                    action_items.append({
                        'text': item,
                        'source_subject': subject
                    })

    return action_items


def fetch_gemini_notes_emails():
    """Fetch all emails with the 'Gemini Notes' label."""
    service = get_gmail_service()
    if not service:
        return None, "Not authenticated"

    label_id = get_label_id(service, 'Gemini Notes')
    if not label_id:
        return [], "Label 'Gemini Notes' not found"

    emails = []
    page_token = None

    while True:
        results = service.users().messages().list(
            userId='me',
            labelIds=[label_id],
            pageToken=page_token,
            maxResults=100
        ).execute()

        messages = results.get('messages', [])

        for msg in messages:
            msg_data = service.users().messages().get(
                userId='me',
                id=msg['id'],
                format='full'
            ).execute()

            headers = msg_data.get('payload', {}).get('headers', [])

            subject = ''
            sender = ''
            date = ''

            for header in headers:
                name = header.get('name', '').lower()
                if name == 'subject':
                    subject = header.get('value', '(No Subject)')
                elif name == 'from':
                    sender = header.get('value', '')
                elif name == 'date':
                    date = header.get('value', '')

            # Parse date
            try:
                parsed_date = parsedate_to_datetime(date)
                date_formatted = parsed_date.strftime('%Y-%m-%d %H:%M')
                date_sortable = parsed_date.isoformat()
            except Exception:
                date_formatted = date
                date_sortable = date

            # Get body
            body = decode_email_body(msg_data.get('payload', {}))

            # Extract action items
            action_items = extract_action_items(body, subject)

            emails.append({
                'id': msg['id'],
                'subject': subject,
                'sender': sender,
                'date': date_formatted,
                'date_sortable': date_sortable,
                'snippet': msg_data.get('snippet', ''),
                'body_preview': body[:500] if body else '',
                'action_items': action_items
            })

        page_token = results.get('nextPageToken')
        if not page_token:
            break

    return emails, None


@app.route('/debug')
def debug_list():
    """List all emails with debug links."""
    emails, error = fetch_gemini_notes_emails()
    if error:
        return f"Error: {error}", 400

    html = "<html><body><h1>Emails (click to debug)</h1><ul>"
    for email in emails:
        html += f'<li><a href="/debug/{email["id"]}">{email["subject"]}</a> - {len(email["action_items"])} items</li>'
    html += "</ul></body></html>"
    return html


@app.route('/debug/<email_id>')
def debug_email(email_id):
    """Debug endpoint to see raw email content."""
    service = get_gmail_service()
    if not service:
        return "Not authenticated", 401

    msg_data = service.users().messages().get(
        userId='me',
        id=email_id,
        format='full'
    ).execute()

    body = decode_email_body(msg_data.get('payload', {}))

    # Clean the body for display
    def clean_html(html_text):
        text = re.sub(r'<br\s*/?>', '\n', html_text, flags=re.IGNORECASE)
        text = re.sub(r'</?(div|p|tr|li|h[1-6])[^>]*>', '\n', text, flags=re.IGNORECASE)
        text = re.sub(r'<[^>]+>', ' ', text)
        text = text.replace('&nbsp;', ' ')
        text = text.replace('&amp;', '&')
        text = text.replace('&rarr;', '→')
        text = text.replace('&#8594;', '→')
        text = re.sub(r'[ \t]+', ' ', text)
        text = re.sub(r'\n\s*\n', '\n\n', text)
        return text.strip()

    clean_body = clean_html(body)

    headers = msg_data.get('payload', {}).get('headers', [])
    subject = next((h['value'] for h in headers if h['name'].lower() == 'subject'), 'No subject')

    action_items = extract_action_items(body, subject)

    return f"""
    <html><head><style>
    body {{ font-family: monospace; white-space: pre-wrap; padding: 20px; }}
    h2 {{ color: #333; }}
    .section {{ background: #f5f5f5; padding: 10px; margin: 10px 0; border: 1px solid #ddd; }}
    </style></head><body>
    <h2>Subject: {subject}</h2>

    <h3>Extracted Action Items ({len(action_items)}):</h3>
    <div class="section">{action_items}</div>

    <h3>Cleaned Body:</h3>
    <div class="section">{clean_body[:5000]}</div>

    <h3>Raw Body (first 5000 chars):</h3>
    <div class="section">{body[:5000].replace('<', '&lt;').replace('>', '&gt;')}</div>
    </body></html>
    """


@app.route('/')
def index():
    """Main dashboard page."""
    creds = get_credentials()
    if not creds or not creds.valid:
        return render_template('dashboard.html', authenticated=False)
    return render_template('dashboard.html', authenticated=True)


@app.route('/auth')
def auth():
    """Start OAuth flow."""
    if not os.path.exists(CREDENTIALS_FILE):
        return jsonify({'error': 'credentials.json not found. Please follow setup instructions.'}), 400

    flow = Flow.from_client_secrets_file(
        CREDENTIALS_FILE,
        scopes=SCOPES,
        redirect_uri=url_for('oauth_callback', _external=True)
    )

    authorization_url, state = flow.authorization_url(
        access_type='offline',
        include_granted_scopes='true',
        prompt='consent'
    )

    session['state'] = state
    return redirect(authorization_url)


@app.route('/oauth/callback')
def oauth_callback():
    """Handle OAuth callback."""
    if not os.path.exists(CREDENTIALS_FILE):
        return jsonify({'error': 'credentials.json not found'}), 400

    flow = Flow.from_client_secrets_file(
        CREDENTIALS_FILE,
        scopes=SCOPES,
        redirect_uri=url_for('oauth_callback', _external=True)
    )

    flow.fetch_token(authorization_response=request.url)
    creds = flow.credentials
    save_credentials(creds)

    return redirect(url_for('index'))


@app.route('/logout')
def logout():
    """Clear credentials."""
    if os.path.exists(TOKEN_FILE):
        os.remove(TOKEN_FILE)
    return redirect(url_for('index'))


@app.route('/api/emails')
def api_emails():
    """API endpoint to fetch emails."""
    emails, error = fetch_gemini_notes_emails()

    if emails is None:
        return jsonify({'error': error, 'authenticated': False}), 401

    if error:
        return jsonify({'emails': emails, 'warning': error})

    return jsonify({'emails': emails})


@app.route('/api/action-items')
def api_action_items():
    """API endpoint to get all action items."""
    emails, error = fetch_gemini_notes_emails()

    if emails is None:
        return jsonify({'error': error, 'authenticated': False}), 401

    all_action_items = []
    for email in emails:
        for item in email.get('action_items', []):
            all_action_items.append({
                'text': item['text'],
                'source_subject': email['subject'],
                'source_date': email['date'],
                'email_id': email['id']
            })

    return jsonify({'action_items': all_action_items, 'warning': error})


if __name__ == '__main__':
    # Allow OAuth over HTTP for local development
    os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'
    app.run(debug=True, port=5000)
