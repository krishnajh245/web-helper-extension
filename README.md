
# 🤖 Web Helper - AI Assistant Chrome Extension

A powerful Chrome extension that extracts content from web pages and enables AI-powered question answering using vector embeddings and RAG (Retrieval-Augmented Generation) technology.

## ✨ Features

- **🔍 Intelligent Content Extraction**: Advanced content extraction that works with static sites, SPAs (React, Vue, Angular), and dynamic content
- **🧠 AI-Powered Q&A**: Ask questions about extracted content using Google's Gemini AI
- **📊 Vector Storage**: Store content as embeddings in Pinecone for semantic search
- **🚀 Dynamic Site Support**: Built-in support for React, Vue, Angular, and other modern web frameworks
- **⚡ Smart Content Processing**: Automatic content filtering, deduplication, and chunking
- **🎯 Context-Aware Responses**: Answers based on the actual content you've browsed
- **📚 Search History**: Keep track of your queries and answers
## Video Demo
https://github.com/user-attachments/assets/48de4dd9-4369-4408-8200-face19e33b01
## 🚀 Quick Start

### Prerequisites

1. **Gemini API Key**: Get from [Google AI Studio](https://aistudio.google.com/)
2. **Pinecone Account**: Sign up at [Pinecone](https://www.pinecone.io/) (free tier available)
3. **Chrome Browser**: Version 88 or higher

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/krishnajh245/web-helper-extension.git
   cd web-helper-extension
   ```

2. **Load the extension in Chrome**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (top right corner)
   - Click "Load unpacked" and select the extension folder
   - The Web Helper icon should appear in your toolbar

3. **Configure API Keys**:
   - Right-click the extension icon → "Options"
   - Enter your Gemini API key
   - Enter your Pinecone API key  
   - Enter your Pinecone index host URL (format: `https://your-index-abc123.svc.pinecone.io`)
   - Click "Test Connection" to verify setup
   - Save settings

## 🛠️ Setup Guide

### Getting API Keys

#### Gemini API Key
1. Visit [Google AI Studio](https://aistudio.google.com/)
2. Sign in with your Google account
3. Click "Get API key" → "Create API key"
4. Copy the generated key

#### Pinecone Setup
1. Sign up at [Pinecone](https://www.pinecone.io/)
2. Create a new index:
   - **Index name**: Choose any name (e.g., `web-helper-index`)
   - **Dimensions**: `768` (for Gemini text-embedding-004)
   - **Metric**: `cosine`
   - **Cloud**: `gcp-starter` (for free tier)
3. Get your API key from the Pinecone console
4. Copy your index host URL (found in index details)


### Configuration Example
```
Gemini API Key: AIzaSyC9X4xF2hG8kL3mN5pQ7rS9tU6vW8yZ...
Pinecone API Key: 12345678-1234-1234-1234-123456789abc
Pinecone Host: https://web-helper-index-abc123.svc.gcp-starter.pinecone.io
```


## 🎯 How to Use

### 1. Extract Content
1. Navigate to any webpage you want to analyze
2. Click the Web Helper extension icon
3. Click "📤 Extract Page" button
4. Wait for processing to complete (shows progress)

### 2. Ask Questions
1. After extraction, type your question in the input field
2. Click "🔍 Search" or press Enter
3. View AI-generated answers based on the page content

### 3. Browse History
- Click the "History" tab to see previous queries
- Click on any historical query to re-run it

## 🔧 Technical Features

### Enhanced Content Extraction

The extension includes advanced extraction capabilities:

- **Dynamic Content Handling**: Waits for JavaScript frameworks to load
- **Lazy Loading Support**: Triggers lazy-loaded content by scrolling
- **Shadow DOM Extraction**: Extracts content from shadow DOM elements
- **Framework Detection**: Auto-detects React, Vue, Angular, Gatsby, Next.js, etc.
- **Smart Content Filtering**: Removes ads, navigation, and other noise
- **Intelligent Chunking**: Breaks content into meaningful, searchable pieces

### Supported Website Types

✅ **Static HTML sites**  
✅ **React applications** 
✅ **Single Page Applications (SPAs)**  
✅ **Documentation sites**  
✅ **E-commerce sites**  
✅ **News and blog sites**  
✅ **Content Management Systems**  

### Processing Modes

1. **Vector Storage Mode**: Large content (500+ words) stored in Pinecone for semantic search
2. **Direct Context Mode**: Small content (<500 words) processed directly for efficiency

## ⚙️ Configuration Options

### Extension Options Page

Access via right-click → "Options" or Chrome Extensions page:

- **Gemini API Key**: Your Google AI Studio API key
- **Pinecone API Key**: Your Pinecone project API key
- **Pinecone Host URL**: Your specific index endpoint URL
- **Test Connection**: Verify all services are working
- **Connection Status**: Real-time status of API connections

### Keyboard Shortcuts

- `Ctrl+Shift+E` (Windows/Linux) or `Cmd+Shift+E` (Mac): Quick extract current page

## 🏗️ Architecture

### Components

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   popup.js      │    │  background.js   │    │   final.js      │
│   (UI Logic)    │◄──►│  (Coordinator)   │◄──►│  (Extractor)    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│browser-query.js │    │browser-embedding.│    │  Content Pages  │
│ (AI Queries)    │    │js (Vector Store) │    │   (Websites)    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Data Flow

1. **Extract**: Content script (`final.js`) extracts page content
2. **Process**: Background script coordinates processing
3. **Embed**: `browser-embedding.js` creates vectors and stores in Pinecone
4. **Query**: User asks questions via popup
5. **Search**: `browser-query.js` retrieves relevant content and queries Gemini
6. **Display**: Popup shows AI-generated answers with sources

### File Structure

```
web-helper-extension/
├── manifest.json          # Extension configuration
├── popup.html             # Extension popup UI
├── popup.js               # Popup logic and UI interactions
├── options.html           # Settings page
├── options.js             # Settings management
├── background.js          # Service worker (coordinator)
├── final.js               # Content extraction script
├── browser-embedding.js   # Vector embeddings service
├── browser-query.js       # AI query processing
└── README.md             # This file
```

## 🐛 Troubleshooting

### Common Issues

#### "No content extracted"
- **Cause**: Page hasn't finished loading or contains mostly dynamic content
- **Solution**: Wait longer before extracting, or try scrolling the page first

#### "API key not configured"
- **Cause**: Missing or invalid API keys
- **Solution**: Check extension options and verify API keys

#### "Connection failed"
- **Cause**: Network issues or incorrect Pinecone host URL
- **Solution**: Test connection in options page, verify host URL format

#### "Processing timeout"
- **Cause**: Very large pages or slow network
- **Solution**: Try a simpler page first, check internet connection

#### Dynamic content not extracted
- **Cause**: Page uses complex JavaScript loading
- **Solution**: Wait for page to fully load, try refreshing and extracting again

### Debug Mode

Enable debug logging by setting `config.debug = true` in `final.js`:

```javascript
const config = {
  debug: true,  // Enable debug logging
  // ... other config
};
```

Then check browser console (F12) for detailed extraction logs.

### Performance Tips

1. **For large sites**: Wait for full page load before extracting
2. **For SPAs**: Allow extra time for framework initialization  
3. **For infinite scroll**: Scroll to load more content before extracting
4. **For better accuracy**: Extract content-rich pages rather than navigation pages

### Development Setup

1. Clone the repository
2. Make your changes
3. Test in Chrome developer mode
4. Submit a pull request



*Star ⭐ this repo if you find it useful!*
