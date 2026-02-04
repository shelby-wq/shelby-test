# Gmail Gemini Notes Dashboard - Setup Guide

This guide walks you through setting up the Gmail API credentials needed to run the dashboard.

## Prerequisites

- Python 3.8 or higher
- A Google account with Gmail
- Emails labeled "Gemini Notes" in your Gmail

## Step 1: Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" at the top, then "New Project"
3. Name your project (e.g., "Gemini Notes Dashboard")
4. Click "Create"

## Step 2: Enable the Gmail API

1. In your new project, go to "APIs & Services" > "Library"
2. Search for "Gmail API"
3. Click on "Gmail API" and then "Enable"

## Step 3: Configure OAuth Consent Screen

1. Go to "APIs & Services" > "OAuth consent screen"
2. Select "External" (unless you have a Google Workspace account)
3. Click "Create"
4. Fill in the required fields:
   - App name: "Gemini Notes Dashboard"
   - User support email: Your email
   - Developer contact email: Your email
5. Click "Save and Continue"
6. On the "Scopes" page, click "Add or Remove Scopes"
7. Find and select `https://www.googleapis.com/auth/gmail.readonly`
8. Click "Update" then "Save and Continue"
9. On "Test users", click "Add Users" and add your Gmail address
10. Click "Save and Continue"

## Step 4: Create OAuth 2.0 Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth client ID"
3. Select "Web application" as the application type
4. Name it (e.g., "Gemini Dashboard Web Client")
5. Under "Authorized redirect URIs", add:
   - `http://localhost:5000/oauth/callback`
   - `http://127.0.0.1:5000/oauth/callback`
6. Click "Create"
7. Click "Download JSON" on the popup
8. Rename the downloaded file to `credentials.json`
9. Move `credentials.json` to the project root directory (same folder as `app.py`)

## Step 5: Install Dependencies

```bash
# Create a virtual environment (recommended)
python -m venv venv

# Activate it
# On macOS/Linux:
source venv/bin/activate
# On Windows:
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

## Step 6: Run the Application

```bash
python app.py
```

The dashboard will be available at `http://localhost:5000`

## Step 7: Connect Your Gmail

1. Open `http://localhost:5000` in your browser
2. Click "Connect Gmail"
3. Sign in with your Google account
4. Grant the requested permissions (read-only access to Gmail)
5. You'll be redirected back to the dashboard

## Creating the "Gemini Notes" Label

If you don't have a "Gemini Notes" label in Gmail:

1. Open Gmail
2. On the left sidebar, scroll down and click "Create new label"
3. Name it exactly "Gemini Notes" (case-insensitive)
4. Click "Create"
5. Apply this label to emails you want to track

## Troubleshooting

### "credentials.json not found"
Make sure you downloaded the OAuth credentials and placed the `credentials.json` file in the project root directory.

### "Label 'Gemini Notes' not found"
Create a label named "Gemini Notes" in your Gmail account.

### OAuth errors
- Ensure your redirect URIs match exactly (including the trailing slash or lack thereof)
- Make sure your email is added as a test user in the OAuth consent screen
- Try clearing `token.json` and re-authenticating

### No action items showing
Action items are extracted from:
- Bullet points (-, *, •)
- Numbered lists (1., 2., etc.)
- Checkbox patterns ([ ])
- Lines containing keywords like TODO, ACTION, TASK, etc.
- Sentences with action verbs (need, must, should, please, etc.)

## Security Notes

- Never commit `credentials.json` or `token.json` to version control
- These files are already in `.gitignore`
- For production deployment, use environment variables for sensitive configuration
- Consider using a proper secret key for Flask sessions

## Production Deployment

For production:

1. Set a secure `FLASK_SECRET_KEY` environment variable
2. Use HTTPS (remove `OAUTHLIB_INSECURE_TRANSPORT` setting)
3. Update OAuth redirect URIs to your production domain
4. Consider using a production WSGI server like Gunicorn
