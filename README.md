# 🛡️ WhatsApp Auto Mod (v6.0.0)

**Auto Mod V6** is a high-performance, self-hosted WhatsApp moderation suite. It combines traditional rule-based filtering with **Local AI (Ollama)** and a robust **SQLite** backend to provide near-instant group protection without relying on external cloud processing.

---

## 🚀 Core Features (v6)

### 1. 🧠 Intelligent AI Moderation
* **Local LLM Integration:** Powered by **Ollama**, the bot uses models like `llava` to understand context, avoiding the limitations of simple keyword matching.
* **Vision AI:** Capable of analyzing images (requires a vision-capable model) to detect prohibited visual content.
* **Custom AI Instructions:** Define specific moderation personalities or "forbidden themes" (e.g., "Remove commercial ads") via the dashboard.

### 2. ⚡ Advanced Anti-Spam System
* **15-Second Window Tracking:** Real-time monitoring of message frequency per user.
* **Granular Media Limits:** Set independent thresholds for:
    * **Text** (Repeated/Duplicate text detection).
    * **Images, Videos, & Audio**.
    * **Documents & Stickers**.
* **Spam Actions:** Automatically delete spam or trigger an **Admin Poll** to let moderators decide the outcome.

### 3. 🚫 Global & Group-Specific Blacklisting
* **Zero-Hour Protection:** Numbers in the Global Blacklist are kicked instantly upon joining or sending a message.
* **Global Purge:** A powerful "Sweep" feature that scans all managed groups and removes blacklisted entities in one click.
* **LID Handling:** Advanced mapping for WhatsApp's latest ID systems to prevent users from bypassing bans.

### 4. 📂 Absolute Media Filtering
* **Type Blocking:** Instantly ban specific media formats (e.g., "No Stickers allowed").
* **Enforcement Levels:** Choose between silent deletion, Admin Polls, or instant Auto-Kicking.

### 5. 🛠️ Modern Management Dashboard
* **Bi-lingual Interface:** Fully localized in **Arabic (ar-SA)** and **English (en)**.
* **Dark/Light Mode:** Full UI customization for late-night server monitoring.
* **Live Event Logs:** Built-in terminal emulator to monitor bot logic and connection status in real-time.
* **Dynamic Sync:** Automatically detects and imports all groups where the bot is present.

---

## 🏗️ Technical Stack

* **Engine:** `whatsapp-web.js` (latest)
* **Database:** `better-sqlite3` with **WAL (Write-Ahead Logging)** for high performance.
* **AI Backend:** `Ollama` (Local API).
* **Web Interface:** Express.js with a responsive CSS/JS dashboard.

---

## 🛠 Installation & Setup

### 1. Clone & Install
```bash
for windows:
extract the v6.zip file 
run the (windows_installer-runner) as administrator for first launch to install dependencies
it might ask you to reopen the installer after the install is completed to run the program

for linux/MacOS:
change the (linux_installer-runner) proprties to run as an executuble
after that just run it and it will install dependencies you wouldn't need to reopen it
