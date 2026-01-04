# 🚀 One-Click OpenAI Integration

Your Context Memory Mesh now supports **one-click OpenAI integration** directly from the UI!

## ✨ Features

- **No file editing required** - Configure everything from the web UI
- **Instant mode switching** - Toggle between Testing and OpenAI modes
- **Persistent configuration** - Settings are automatically saved to `.env`
- **Visual feedback** - See your current mode at a glance
- **Safe validation** - API key is validated before switching modes

## 📖 How to Use

### Step 1: Access Settings

1. Open the web UI at `http://localhost:3000`
2. Click the **Settings** button (⚙️ icon) in the header

### Step 2: Choose Your Mode

#### Testing Mode (Default)
- **Free** - No API costs
- **Instant** - No network calls
- **Perfect for development** - Test the system without OpenAI
- Click "Testing Mode" button to activate

#### OpenAI Mode
- **True semantic search** - Uses OpenAI's `text-embedding-3-small` model
- **Production-ready** - Real AI-powered embeddings
- **Requires API key** - Get one from [platform.openai.com](https://platform.openai.com/api-keys)

### Step 3: Enable OpenAI (Optional)

1. Get your OpenAI API key from https://platform.openai.com/api-keys
2. In the Settings modal, paste your API key in the "OpenAI API Key" field
3. Click the "OpenAI Mode" button
4. Wait for confirmation message
5. Done! Your system is now using OpenAI embeddings

### Step 4: Switch Back Anytime

- Click Settings → "Testing Mode" to switch back
- No API key needed
- Instant switch

## 🔧 Technical Details

### Backend API

**GET `/config`** - View current configuration
```bash
curl http://127.0.0.1:2789/config
```

**POST `/config`** - Update configuration
```bash
curl -X POST http://127.0.0.1:2789/config \
  -H "Content-Type: application/json" \
  -d '{
    "embedding_mode": "openai",
    "openai_api_key": "sk-proj-xxxxx",
    "persist": true
  }'
```

### Configuration Persistence

- Settings are saved to `daemon/.env`
- Survives daemon restarts
- Can be edited manually if needed

### Mode Indicators

The UI shows your current mode:
- 🧪 **Testing Mode** (Blue) - Hash-based embeddings
- 💡 **OpenAI Mode** (Green) - OpenAI embeddings

## 🛡️ Security

- API keys are stored in `.env` (gitignored by default)
- Password field hides your API key in the UI
- Keys are never logged or exposed in responses

## 💡 Tips

1. **Start with Testing Mode** - Try the system for free first
2. **Monitor API costs** - OpenAI charges per embedding request
3. **Use OpenAI for production** - Better semantic understanding
4. **Keep your API key safe** - Never commit `.env` to git

## 🔄 Workflow

```
Testing Mode (Free) → Try the system → Like it? → 
Add API Key → One Click → OpenAI Mode (Production)
```

## 📊 Cost Comparison

| Mode | Cost | Quality | Speed |
|------|------|---------|-------|
| Testing | Free | Hash-based | Instant |
| OpenAI | ~$0.0001/1K tokens | Semantic AI | ~100ms |

## 🎉 That's It!

No command line. No file editing. Just click and go!

---

## 🔌 Chrome Extension - Search Anywhere

The Context Mesh extension now includes a **built-in search interface**!

### Features:

- **🔍 Quick Search** - Search your memories directly from the extension popup
- **📋 Click to Copy** - Click any result to copy it to clipboard
- **🕐 Timestamps** - See when each memory was captured
- **📱 Source Tags** - Know which app it came from (Perplexity, ChatGPT, etc.)
- **📊 Full Dashboard** - One-click access to the full web UI

### How to Use:

1. **Click the extension icon** in Chrome toolbar
2. **Type your search** in the search box
3. **Press Enter** or click Search
4. **Click any result** to copy it to clipboard
5. **Paste anywhere** you need it!

### Benefits:

- ✅ **No need to open dashboard** for quick searches
- ✅ **Instant access** from any tab
- ✅ **Beautiful glassmorphism UI** matching the main app
- ✅ **Shows top 5 results** sorted by recency
- ✅ **Auto-filters** in testing mode for exact matches

### Status Indicator:

- 🟢 **Green dot** = Daemon connected, ready to search
- 🔴 **Red dot** = Daemon offline, start the daemon first
