FROM node:20.20.0

# Install Chromium and dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# 1. Put everything in a safe STAGING folder first (not /app)
WORKDIR /app_staging
COPY package*.json ./
RUN npm install
RUN npm rebuild better-sqlite3
COPY . .
RUN rm -f /app_staging/bot_data.sqlite /app_staging/bot_data.sqlite-wal /app_staging/bot_data.sqlite-shm

# 2. Ensure UI modules and index.js are regenerated on every image build
# Store original versions for regeneration
RUN cp UI.js UI.js.original && cp index.js index.js.original

# 3. Create the Magic Startup Script
# This script regenerates UI.js and index.js every time the container starts
RUN echo '#!/bin/sh\n\
set -e\n\
mkdir -p /app\n\
mkdir -p /app/.wwebjs_auth /app/.wwebjs_cache /app/media\n\
echo "🔄 Regenerating UI modules and index.js..."\n\
if [ -f /app_staging/UI.js.original ]; then\n\
  cp /app_staging/UI.js.original /app_staging/UI.js\n\
fi\n\
if [ -f /app_staging/index.js.original ]; then\n\
  cp /app_staging/index.js.original /app_staging/index.js\n\
fi\n\
if [ ! -f /app/index.js ]; then\n\
if [ ! -f /app/index.js ]; then\n\
  echo "First run detected! Copying app files to /app..."\n\
  for item in /app_staging/*; do\n\
    base="$(basename "$item")"\n\
    case "$base" in\n\
      bot_data.sqlite|bot_data.sqlite-wal|bot_data.sqlite-shm) continue ;;\n\
    esac\n\
    cp -r "$item" /app/\n\
  done\n\
else\n\
  echo "Updating UI modules and index.js in /app..."\n\
  cp /app_staging/UI.js /app/UI.js\n\
  cp /app_staging/index.js /app/index.js\n\
fi\n\
mkdir -p /app/public\n\
if [ -f /app_staging/public/logo.png ]; then\n\
  cp /app_staging/public/logo.png /app/public/logo.png\n\
fi\n\
if [ ! -f /app/public/logo.png ]; then\n\
  FIRST_IMAGE="$(find /app -maxdepth 1 -type f \( -iname "*.png" -o -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.webp" \) | head -n 1)"\n\
  if [ -n "$FIRST_IMAGE" ]; then\n\
    cp "$FIRST_IMAGE" /app/public/logo.png\n\
  fi\n\
fi\n\
\n\
if [ ! -d /app/node_modules ] || [ ! -f /app/node_modules/express/package.json ]; then\n\
  echo "📦 Restoring node_modules to /app..."\n\
  if [ -d /app_staging/node_modules ]; then\n\
    cp -a /app_staging/node_modules /app/\n\
  fi\n\
fi\n\
\n\
if [ ! -f /app/node_modules/express/package.json ]; then\n\
  echo "📦 Installing dependencies in /app (fallback)..."\n\
  cd /app\n\
  npm install --omit=dev\n\
fi\n\
\n\
echo "🧹 Performing cleanup..."\n\
pkill -9 -f chromium 2>/dev/null || true\n\
pkill -9 -f chrome 2>/dev/null || true\n\
pkill -9 -f puppet 2>/dev/null || true\n\
sleep 1\n\
rm -rf /tmp/chromium-* 2>/dev/null || true\n\
rm -rf /tmp/.org.chromium.* 2>/dev/null || true\n\
rm -rf /tmp/.pki 2>/dev/null || true\n\
rm -rf /tmp/.X* 2>/dev/null || true\n\
sleep 1\n\
echo "🔧 Cleaning stale lock files only (preserving session data)..."\n\
find /app/.wwebjs_auth -name "*lock*" -delete 2>/dev/null || true\n\
find /app/.wwebjs_auth -name ".parent-lock" -delete 2>/dev/null || true\n\
find /app/.wwebjs_auth -name "Singleton*" -delete 2>/dev/null || true\n\
sleep 1\n\
DB_PATH="${WA_DB_PATH:-/app/bot_data.sqlite}"\n\
DB_DIR="$(dirname "$DB_PATH")"\n\
mkdir -p "$DB_DIR"\n\
if [ -L "$DB_PATH" ]; then\n\
  LINK_TARGET="$(readlink "$DB_PATH" || true)"\n\
  if [ -z "$LINK_TARGET" ]; then\n\
    echo "❌ Invalid DB symlink detected at $DB_PATH (empty target)."\n\
    echo "🔒 Refusing to replace DB path automatically to prevent data loss."\n\
    exit 1\n\
  fi\n\
  case "$LINK_TARGET" in\n\
    /*) TARGET_PATH="$LINK_TARGET" ;;\n\
    *) TARGET_PATH="$DB_DIR/$LINK_TARGET" ;;\n\
  esac\n\
  TARGET_DIR="$(dirname "$TARGET_PATH")"\n\
  if ! mkdir -p "$TARGET_DIR" 2>/dev/null || ! touch "$TARGET_PATH" 2>/dev/null; then\n\
    echo "❌ Broken or unwritable DB symlink detected: $DB_PATH -> $LINK_TARGET"\n\
    echo "🔒 Refusing to replace DB path automatically to prevent data loss."\n\
    exit 1\n\
  fi\n\
fi\n\
if [ -d "$DB_PATH" ]; then\n\
  echo "❌ DB path points to a directory: $DB_PATH"\n\
  echo "🔒 Refusing to auto-move directory to prevent accidental data replacement."\n\
  exit 1\n\
fi\n\
if [ -f "$DB_PATH" ]; then\n\
  cp -n "$DB_PATH" "${DB_PATH}.startup-backup" 2>/dev/null || true\n\
fi\n\
if [ ! -f "$DB_PATH" ] && [ -f "${DB_PATH}.startup-backup" ]; then\n\
  echo "♻️ Restoring missing DB file from startup backup..."\n\
  cp -a "${DB_PATH}.startup-backup" "$DB_PATH"\n\
fi\n\
if ! touch "$DB_PATH"; then\n\
  echo "❌ Cannot create database file at $DB_PATH"\n\
  echo "📂 Directory listing for $DB_DIR:"\n\
  ls -la "$DB_DIR" || true\n\
  exit 1\n\
fi\n\
cd /app\n\
echo "✅ Cleanup and regeneration complete. Starting bot..."\n\
exec node index.js' > /start.sh && chmod +x /start.sh

# 3. Tell the container to run the script when it starts
CMD ["/start.sh"]