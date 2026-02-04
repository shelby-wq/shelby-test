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
    """Extract action items from email body using pattern matching."""
    action_items = []

    # Common patterns for action items
    patterns = [
        r'(?:^|\n)\s*[-•*]\s*(?:TODO|Action|Task|Follow.?up|Need to|Must|Should|Please|Remember to)[:\s]*(.+?)(?=\n|$)',
        r'(?:^|\n)\s*\d+[.)]\s*(.+?)(?=\n|$)',
        r'(?:^|\n)\s*\[\s*\]\s*(.+?)(?=\n|$)',
        r'(?:^|\n)\s*(?:ACTION ITEM|ACTION|TODO|TASK)[:\s]*(.+?)(?=\n|$)',
        r'(?:^|\n)\s*[-•*]\s*(.+?)(?=\n|$)',
    ]

    # Try each pattern
    for pattern in patterns:
        matches = re.findall(pattern, body, re.IGNORECASE | re.MULTILINE)
        for match in matches:
            item = match.strip()
            if item and len(item) > 5 and len(item) < 500:
                # Clean up the item
                item = re.sub(r'<[^>]+>', '', item)  # Remove HTML tags
                item = re.sub(r'\s+', ' ', item).strip()
                if item and item not in [ai['text'] for ai in action_items]:
                    action_items.append({
                        'text': item,
                        'source_subject': subject
                    })

    # If no action items found, try to extract key sentences
    if not action_items:
        sentences = re.split(r'[.!?]\s+', body)
        action_keywords = ['need', 'must', 'should', 'will', 'please', 'deadline', 'by', 'complete', 'finish', 'submit', 'send', 'review', 'update', 'create', 'schedule', 'call', 'meeting', 'follow']

        for sentence in sentences:
            sentence = sentence.strip()
            if any(keyword in sentence.lower() for keyword in action_keywords):
                if len(sentence) > 10 and len(sentence) < 300:
                    clean = re.sub(r'<[^>]+>', '', sentence)
                    clean = re.sub(r'\s+', ' ', clean).strip()
                    if clean:
                        action_items.append({
                            'text': clean,
                            'source_subject': subject
                        })
                        if len(action_items) >= 3:  # Limit to 3 inferred items per email
                            break

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
