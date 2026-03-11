#!/bin/bash
echo "=========================================="
echo "   WhatsApp Auto-Moderator Installer"
echo "=========================================="

echo "[INFO] Installing C++ build tools & prerequisites..."
sudo apt-get update
sudo apt-get install -y python3 make g++ build-essential curl wget

echo "[INFO] Setting up Node Version Manager (NVM)..."
if [ ! -d "$HOME/.nvm" ]; then
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
fi

# Load NVM into the current shell session
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

echo "[INFO] Installing Node.js v20.20.0..."
nvm install 20.20.0
nvm use 20.20.0
nvm alias default 20.20.0

echo "[INFO] Current Node version: $(node -v)"

echo "[INFO] Installing Node.js packages..."
npm install

echo ""
echo "[SUCCESS] Installation Complete!"
echo "[INFO] Starting the bot..."
echo "=========================================="
node index.js