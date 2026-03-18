# 🛡️ WhatsApp Auto Mod (v6.0.0)

**Auto Mod V6** is a high-performance, self-hosted WhatsApp moderation suite designed for powerful group management. It combines intelligent rule-based filtering with **Local AI (Ollama)** and a robust **SQLite** backend to provide near-instant group protection without relying on external cloud processing.

---

## 📋 Table of Contents

- [🚀 Core Features](#-core-features)
- [🏗️ Technical Stack](#-technical-stack)
- [⚙️ System Requirements](#-system-requirements)
- [🛠️ Installation & Setup](#-installation--setup)
  - [Docker Compose Setup (Recommended)](#docker-compose-setup-recommended)
  - [Local Installation](#local-installation)
- [🚀 Quick Start](#-quick-start)
- [📊 Configuration](#-configuration)
- [🤖 AI Integration](#-ai-integration)
- [🖼️ Dashboard Features](#-dashboard-features)
- [📝 API Documentation](#-api-documentation)
- [❓ Troubleshooting](#-troubleshooting)
- [📜 License](#-license)
- [🤝 Contributing](#-contributing)

---

## 🚀 Core Features

### 1. 🧠 Intelligent AI Moderation

- **Local LLM Integration:** Powered by **Ollama**, the bot uses models like `llava` to understand context and avoid limitations of simple keyword matching
- **Vision AI:** Capable of analyzing images to detect prohibited visual content (requires a vision-capable model)
- **Custom AI Instructions:** Define specific moderation personalities or "forbidden themes" via the dashboard (e.g., "Remove commercial ads")
- **Privacy-First:** All processing happens locally on your server—no data sent to external APIs

### 2. ⚡ Advanced Anti-Spam System

- **Real-Time Monitoring:** 15-second window tracking of message frequency per user
- **Granular Media Limits:** Set independent thresholds for:
  - Text messages (Repeated/Duplicate text detection)
  - Images, Videos, and Audio files
  - Documents and Stickers
- **Flexible Actions:** Automatically delete spam or trigger Admin Polls to let moderators decide outcomes
- **Smart Rate Limiting:** Prevents abuse while maintaining natural conversation flow

### 3. 🚫 Global & Group-Specific Blacklisting

- **Zero-Hour Protection:** Numbers in the Global Blacklist are kicked instantly upon joining or sending messages
- **Global Purge:** Powerful "Sweep" feature scans all managed groups and removes blacklisted entities in one click
- **Advanced ID Handling:** Maps WhatsApp's latest ID systems to prevent users from bypassing bans
- **Customizable Rules:** Different rules per group or global enforcement

### 4. 📂 Absolute Media Filtering

- **Type Blocking:** Instantly ban specific media formats (stickers, documents, etc.)
- **Enforcement Levels:** Choose between silent deletion, Admin Polls, or instant Auto-Kicking
- **Whitelist Support:** Allow specific users or file types despite global restrictions

### 5. 🛠️ Modern Management Dashboard

- **Bi-lingual Interface:** Fully localized in Arabic (ar-SA) and English (en-US)
- **Dark/Light Mode:** Full UI customization for convenient server monitoring
- **Live Event Logs:** Built-in terminal emulator to monitor bot logic and connection status in real-time
- **Dynamic Sync:** Automatically detects and imports all groups where the bot is a member
- **Real-Time Statistics:** View moderation activities, spam detection stats, and group health metrics

---

## 🏗️ Technical Stack

| Component | Technology |
|-----------|------------|
| **Engine** | `whatsapp-web.js` (latest) |
| **Database** | `better-sqlite3` with WAL (Write-Ahead Logging) |
| **AI Backend** | `Ollama` (Local API) |
| **Web Interface** | Express.js with responsive CSS/JS dashboard |
| **Runtime** | Node.js 16+ |
| **Containerization** | Docker & Docker Compose |

---

## ⚙️ System Requirements

### Minimum Requirements
- **RAM:** 2GB (4GB+ recommended for AI models)
- **Storage:** 5GB (more if using large AI models)
- **CPU:** Dual-core processor
- **Network:** Stable internet connection

### For AI Features (Ollama)
- **RAM:** 8GB+ recommended
- **Storage:** 10-20GB (depends on model size)
- **VRAM:** GPU support optional but recommended (NVIDIA/AMD/Intel Arc)

### Operating Systems
- ✅ Linux (Ubuntu 20.04+, Debian 11+)
- ✅ macOS (Intel & Apple Silicon)
- ✅ Windows 10+ (with Docker Desktop)

---

## 🛠️ Installation & Setup

### Docker Compose Setup (Recommended)

This method is the easiest and most reliable way to run the bot.

#### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) installed
- [Docker Compose](https://docs.docker.com/compose/install/) installed
- 2GB+ free RAM

#### Step 1: Create Project Directory

```bash
mkdir wa-bot-app
cd wa-bot-app
```

#### Step 2: Create the Necessary Files

Create the following file structure:

```
wa-bot-app/
├── index.js
├── package.json
├── package-lock.json
├── docker-compose.yml
└── .gitignore
```

#### Step 3: Add Docker Compose Configuration

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  bot:
    image: ghcr.io/az2oo1/wa-bot:latest
    ports:
      - "3000:3000"
    volumes:
      - /DATA/AppData/wa-bot:/app
    restart: unless-stopped
```

**Volume Explanations:**
- `node_modules`: Persists Node.js dependencies across container restarts
- `.wwebjs_auth`: Stores WhatsApp authentication tokens (persistent login)
- `.wwebjs_cache`: Caches WhatsApp Web data for faster startup
- `bot_data.sqlite`: Stores all bot data (blacklists, settings, logs)

#### Step 4: Prepare Application Files

Copy your `index.js`, `package.json`, and `package-lock.json` to the `wa-bot-app` directory.

Ensure `package.json` includes essential dependencies:

```json
{
  "name": "wa-bot",
  "version": "6.0.0",
  "description": "WhatsApp Auto Mod - Group Management Bot",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js"
  },
  "dependencies": {
    "whatsapp-web.js": "^1.0.0",
    "better-sqlite3": "^9.0.0",
    "express": "^4.18.0",
    "body-parser": "^1.20.0",
    "axios": "^1.6.0"
  }
}
```

#### Step 5: Start the Bot with Docker Compose

```bash
# Build and start the bot (first time)
docker-compose up --build -d

# View logs
docker-compose logs -f bot

# Stop the bot
docker-compose down

# Restart the bot
docker-compose restart
```

**Note:** On first launch, you'll need to scan a QR code from WhatsApp. Monitor the logs and access the dashboard to complete authentication.

---

### Local Installation

For development or if you prefer not to use Docker.

#### For Windows

```bash
# 1. Extract the v6.zip file
# 2. Right-click windows_installer-runner.bat and select "Run as administrator"
# 3. Wait for dependencies to install
# 4. The installer may ask you to reopen it—do so if prompted
# 5. Once complete, the bot will start automatically
```

#### For Linux/macOS

```bash
# 1. Extract the v6.zip file
cd v6

# 2. Make the installer executable
chmod +x linux_installer-runner.sh

# 3. Run the installer
./linux_installer-runner.sh

# 4. The bot will start automatically (no need to reopen)
```

#### Manual Setup (All Platforms)

```bash
# Clone the repository
git clone https://github.com/az2oo1/wa-bot.git
cd wa-bot

# Install dependencies
npm install

# Start the bot
npm start
```

---

## 🚀 Quick Start

### 1. Access the Dashboard

Once the bot is running, open your browser and navigate to:

```
http://localhost:3000
```

### 2. Authenticate with WhatsApp

- A QR code will appear on the dashboard
- Open WhatsApp on your phone
- Go to **Settings → Linked Devices** (or **Devices and Computers**)
- Tap **"Link a Device"** and scan the QR code
- The bot will authenticate and begin monitoring your groups

### 3. Configure Your First Group

- Navigate to **Groups** in the dashboard
- Select a group to configure
- Set up moderation rules:
  - Spam thresholds
  - Media type restrictions
  - Blacklist enforcement
  - AI content filters

### 4. Monitor Activity

- Check the **Live Logs** tab to see real-time moderation activities
- Review **Statistics** for spam detection and member management insights
- Adjust settings as needed

---

## 📊 Configuration

Configuration is managed through the web dashboard or via the SQLite database. Key settings include:

### Group Settings
- **Spam Detection:** Message frequency thresholds (messages per 15 seconds)
- **Media Filtering:** Enable/disable specific media types
- **Auto-Actions:** Auto-delete, poll, or kick for violations
- **Whitelist:** Exempt specific users or content types

### AI Settings (Requires Ollama)
- **Model Selection:** Choose LLM model (default: `llama2`)
- **Vision Model:** For image analysis (optional)
- **Custom Prompts:** Define moderation instructions
- **Confidence Threshold:** Set AI decision sensitivity

### Admin Configuration
- **Admin Users:** Designate dashboard administrators
- **API Keys:** Generate tokens for external integrations
- **Backup Frequency:** Configure database backups
- **Log Retention:** Set how long to keep activity logs

---

## 🤖 AI Integration

### Setting Up Ollama (Optional but Recommended)

#### Install Ollama

Download from [ollama.ai](https://ollama.ai) and install for your OS.

#### Pull a Model

```bash
# Pull the Llama 2 model (7B - balanced size/performance)
ollama pull llama2

# Optional: Pull a vision model for image analysis
ollama pull llava
```

#### Configure Bot to Use Ollama

In the dashboard, go to **Settings → AI Configuration** and set:
- **Ollama URL:** `http://localhost:11434` (or your Ollama server address)
- **Model:** `llama2`
- **Vision Model:** `llava` (optional)

### Using Custom Moderation Instructions

In the dashboard, define custom moderation rules like:

```
You are a WhatsApp group moderator. Your job is to:
1. Detect promotional/spam content
2. Identify inappropriate language
3. Flag suspicious links or files
4. Remove phishing attempts

If content violates these rules, respond with "REMOVE" only.
Otherwise, respond with "ALLOW".
```

---

## 🖼️ Dashboard Features

### Dashboard Tabs

1. **Overview:** Real-time stats, recent actions, group summary
2. **Groups:** Manage connected groups and their settings
3. **Blacklist:** Global and group-specific blacklists
4. **Members:** View and manage group members
5. **Logs:** Real-time activity logs with filtering
6. **Settings:** Configure bot behavior and AI models
7. **Dashboard Preferences:** UI theme, language, layout

### Language Support

- 🇸🇦 **Arabic (ar-SA)** - Full localization
- 🇺🇸 **English (en-US)** - Complete support
- Switch languages from dashboard settings

### Dark/Light Mode

Toggle between dark and light themes for comfortable monitoring at any time.

---

## 📝 API Documentation

### Authentication

All API requests require an API key (generated in dashboard settings).

```bash
# Include in header
Authorization: Bearer YOUR_API_KEY
```

### Endpoints

#### Get Groups

```bash
GET /api/groups
Authorization: Bearer YOUR_API_KEY
```

Response:
```json
{
  "groups": [
    {
      "id": "123456789-1234567890@g.us",
      "name": "Example Group",
      "members": 50,
      "created": "2024-01-15T10:30:00Z"
    }
  ]
}
```

#### Add to Blacklist

```bash
POST /api/blacklist/add
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "number": "+1234567890",
  "reason": "Spam/Commercial",
  "global": true
}
```

#### Remove from Blacklist

```bash
POST /api/blacklist/remove
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "number": "+1234567890"
}
```

---

## ❓ Troubleshooting

### Bot Won't Start

**Issue:** Docker container exits immediately

**Solution:**
```bash
# Check logs
docker-compose logs bot

# Ensure all required files are in place
ls -la
# Should show: index.js, package.json, package-lock.json

# Rebuild the image
docker-compose up --build -d
```

### Cannot Authenticate WhatsApp

**Issue:** QR code doesn't appear or times out

**Solution:**
1. Clear authentication cache:
   ```bash
   docker-compose down
   rm -rf .wwebjs_auth .wwebjs_cache
   docker-compose up -d
   ```

2. Check logs for errors:
   ```bash
   docker-compose logs -f bot
   ```

3. Ensure you're using WhatsApp with a linked device setup

### Database Locked Error

**Issue:** `database is locked` error in logs

**Solution:**
```bash
# Restart the container
docker-compose restart bot

# If persistent, rebuild:
docker-compose down
rm bot_data.sqlite
docker-compose up -d
```

### AI Features Not Working

**Issue:** Ollama integration not responding

**Solution:**
1. Ensure Ollama is running:
   ```bash
   ollama serve  # Run in another terminal
   ```

2. Check connection:
   ```bash
   curl http://localhost:11434/api/tags
   ```

3. Verify model is installed:
   ```bash
   ollama list
   ```

4. Update Ollama URL in dashboard settings

### High Memory Usage

**Issue:** Container consuming too much RAM

**Solution:**
1. Reduce AI model size (use `phi` instead of `llama2`)
2. Limit cache size in settings
3. Increase system RAM or use a lightweight model

---

## 📜 License

This project is open-source. Check the LICENSE file for details.

---

## 🤝 Contributing

Contributions are welcome! To contribute:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📞 Support

For issues and questions:

- 📧 Create an issue on [GitHub Issues](https://github.com/az2oo1/wa-bot/issues)
- 💬 Check existing discussions for solutions
- 📖 Review the documentation in this README

---

## 🙏 Acknowledgments

- [whatsapp-web.js](https://github.com/pedrosans/whatsapp-web.js) - WhatsApp Web API
- [Ollama](https://ollama.ai) - Local AI models
- [Express.js](https://expressjs.com) - Web framework
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) - Database engine

---

**Version:** 6.0.0  
**Last Updated:** March 2026  
**Status:** Active Development ✅