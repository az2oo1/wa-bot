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

# 2. Ensure UI.js and index.js are regenerated on every image build
# Store original versions for regeneration
RUN cp UI.js UI.js.original && cp index.js index.js.original

# 3. Create the Magic Startup Script
# This script regenerates UI.js and index.js every time the container starts
RUN echo '#!/bin/sh\n\
set -e\n\
mkdir -p /app\n\
mkdir -p /app/.wwebjs_auth /app/.wwebjs_cache /app/media\n\
echo "🔄 Regenerating UI.js and index.js..."\n\
if [ -f /app_staging/UI.js.original ]; then\n\
  cp /app_staging/UI.js.original /app_staging/UI.js\n\
fi\n\
if [ -f /app_staging/index.js.original ]; then\n\
  cp /app_staging/index.js.original /app_staging/index.js\n\
fi\n\
\n\
if [ ! -f /app/index.js ]; then\n\
  echo "First run detected! Copying app files to /app..."\n\
  cp -r /app_staging/* /app/\n\
else\n\
  echo "Updating UI.js and index.js in /app..."\n\
  cp /app_staging/UI.js /app/UI.js\n\
  cp /app_staging/index.js /app/index.js\n\
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
cd /app\n\
echo "✅ Cleanup and regeneration complete. Starting bot..."\n\
exec node index.js' > /start.sh && chmod +x /start.sh

# 3. Tell the container to run the script when it starts
CMD ["/start.sh"]