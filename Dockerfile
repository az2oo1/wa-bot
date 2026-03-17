FROM node:20.20.0

# Install Chromium and dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copy package files FIRST to cache the npm install step
COPY package*.json ./

# Install dependencies and rebuild sqlite3 during the GitHub Action
RUN npm install
RUN npm rebuild better-sqlite3

# Copy the rest of your bot's code into the image
COPY . .

# The command to start the bot
CMD ["node", "index.js"]