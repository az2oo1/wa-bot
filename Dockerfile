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

# 2. Create the Magic Startup Script
# This script checks if index.js is missing from your CasaOS folder. 
# If it's missing, it dumps all the pre-compiled code into it!
# It also cleans up any orphaned Chromium processes
RUN echo '#!/bin/sh\n\
echo "Performing aggressive cleanup..."\n\
pkill -9 -f chromium 2>/dev/null || true\n\
pkill -9 -f chrome 2>/dev/null || true\n\
sleep 1\n\
rm -rf /tmp/chromium-* 2>/dev/null || true\n\
rm -rf /tmp/.org.chromium.* 2>/dev/null || true\n\
rm -rf /tmp/.pki 2>/dev/null || true\n\
sleep 2\n\
\n\
if [ ! -f /app/index.js ]; then\n\
  echo "First run detected! Copying files to your CasaOS server..."\n\
  cp -r /app_staging/* /app/\n\
fi\n\
\n\
cd /app\n\
exec node index.js' > /start.sh && chmod +x /start.sh

# 3. Tell the container to run the script when it starts
CMD ["/start.sh"]