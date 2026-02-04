# Gemini Notes Dashboard

A dynamic dashboard that connects to your Gmail account, reads emails with the "Gemini Notes" label, and extracts action items for easy tracking.

## Features

- **Gmail Integration**: Securely connects to your Gmail using OAuth 2.0
- **Label Filtering**: Automatically fetches emails with the "Gemini Notes" label
- **Sortable Email List**: Sort emails by date or title (ascending/descending)
- **Action Item Extraction**: Automatically extracts action items from emails using pattern recognition
- **Running Action Items List**: Consolidated view of all action items across your Gemini Notes emails
- **Modern UI**: Dark-themed, responsive dashboard interface

## Quick Start

1. Set up Google Cloud credentials (see [SETUP.md](SETUP.md))
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the application:
   ```bash
   python app.py
   ```
4. Open `http://localhost:5000` and connect your Gmail

## Project Structure

```
├── app.py                 # Flask backend with Gmail API integration
├── requirements.txt       # Python dependencies
├── SETUP.md              # Detailed setup instructions
├── templates/
│   └── dashboard.html    # Main dashboard template
└── static/
    ├── style.css         # Dashboard styling
    └── script.js         # Frontend JavaScript
```

## How It Works

1. **Authentication**: Uses OAuth 2.0 to securely access your Gmail (read-only)
2. **Email Fetching**: Retrieves all emails with the "Gemini Notes" label
3. **Action Item Extraction**: Parses email content to identify:
   - Bullet points and numbered lists
   - TODO/ACTION/TASK markers
   - Sentences with action verbs (need, must, should, etc.)
4. **Dashboard Display**: Shows emails sorted by your preference with extracted action items

## Requirements

- Python 3.8+
- Google Cloud project with Gmail API enabled
- Gmail account with "Gemini Notes" label

## License

MIT
