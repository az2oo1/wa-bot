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

for windows:
```bash
1-extract the v6.zip file.
2-run the (windows_installer-runner) as administrator.
for first launch to install dependencies.
3-it might ask you to reopen the installer
after theinstall is completed to run the program.
```
for linux/MacOS:
```bash
1-extract the v6.zip file.
2-change the (linux_installer-runner) proprties to run as an executuble.
3-after that just run it and it will install dependencies you wouldn't need to reopen it.

```
arabic Preview:

<img width="2559" height="1274" alt="Screenshot 2026-03-12 020936" src="https://github.com/user-attachments/assets/65139cc3-2e0b-4ef0-83b3-98472b52417a" />

<img width="2559" height="1276" alt="Screenshot 2026-03-12 021033" src="https://github.com/user-attachments/assets/30494c9a-38bb-4e95-aeea-1ce0e0197723" />

<img width="2559" height="1276" alt="Screenshot 2026-03-12 021052" src="https://github.com/user-attachments/assets/04cbb869-d2ae-4cd0-85be-90f564206147" />

<img width="2559" height="1273" alt="Screenshot 2026-03-12 021113" src="https://github.com/user-attachments/assets/689e3219-02b7-49ed-b511-bf026344af27" />

<img width="2559" height="1272" alt="Screenshot 2026-03-12 021125" src="https://github.com/user-attachments/assets/9e96ef34-0791-4c90-bc66-5c3fe5764e78" />

<img width="2559" height="1271" alt="Screenshot 2026-03-12 021136" src="https://github.com/user-attachments/assets/834658cb-3157-4695-983f-bee55a3adb26" />

<img width="2559" height="1275" alt="Screenshot 2026-03-12 021146" src="https://github.com/user-attachments/assets/15f46197-07c3-47b2-9d7a-1701eb353321" />

<img width="2559" height="1270" alt="Screenshot 2026-03-12 021209" src="https://github.com/user-attachments/assets/aa4a5c0f-1fca-4ae1-8a2f-62e02e5c68d7" />

<img width="2559" height="1272" alt="Screenshot 2026-03-12 021221" src="https://github.com/user-attachments/assets/68f21740-8c11-4043-bd9b-363c6becec53" />
