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
echo "🔄 Regenerating UI.js and index.js..."\n\
if [ -f /app_staging/UI.js.original ]; then\n\
  cp /app_staging/UI.js.original /app_staging/UI.js\n\
fi\n\
if [ -f /app_staging/index.js.original ]; then\n\
  cp /app_staging/index.js.original /app_staging/index.js\n\
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
sleep 1\n\
\n\
if [ ! -f /app/index.js ]; then\n\
  echo "First run detected! Copying files to your CasaOS server..."\n\
  cp -r /app_staging/* /app/\n\
else\n\
  echo "Regenerating UI.js and index.js in /app..."\n\
  cp /app_staging/UI.js /app/UI.js\n\
  cp /app_staging/index.js /app/index.js\n\
fi\n\
\n\
cd /app\n\
echo "✅ Cleanup and regeneration complete. Starting bot..."\n\
exec node index.js' > /start.sh && chmod +x /start.sh

# 3. Tell the container to run the script when it starts
CMD ["/start.sh"]