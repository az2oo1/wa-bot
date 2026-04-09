#!/bin/bash
echo "=========================================="
echo "   WhatsApp Bot Smart Launcher (Linux)"
echo "=========================================="

# جلب إصدار نود الحالي
CURRENT_NODE=$(node -v 2>/dev/null)

if [ "$CURRENT_NODE" == "v20.20.0" ]; then
    echo "[OK] Node.js v20.20.0 is active."
else
    echo "[WARN] Incorrect Node version detected (Current: $CURRENT_NODE)."
    
    # 1. إزالة أي نسخة نود مثبتة مسبقاً في النظام لضمان عدم التعارض
    if command -v apt-get &> /dev/null; then
        echo "[INFO] Purging incorrect system Node.js..."
        sudo apt-get remove --purge -y nodejs npm >/dev/null 2>&1
        sudo apt-get autoremove -y >/dev/null 2>&1
    fi

    # 2. تنصيب NVM لتثبيت النسخة المطلوبة بدقة
    echo "[INFO] Setting up Node Version Manager..."
    if [ ! -d "$HOME/.nvm" ]; then
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash >/dev/null 2>&1
    fi

    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

    # 3. تثبيت واعتماد الإصدار المطلوب
    echo "[INFO] Installing Node.js v20.20.0..."
    nvm install 20.20.0
    nvm alias default 20.20.0
    nvm use 20.20.0
fi

# تفعيل NVM في حال كان مثبتاً ولكن غير مفعل في هذه الجلسة
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# فحص المكتبات المطلوبة فعلياً
if [ ! -d "node_modules" ]; then
    echo "[INFO] C++ build tools & prerequisites..."
    sudo apt-get update >/dev/null 2>&1
    sudo apt-get install -y python3 make g++ build-essential >/dev/null 2>&1
    
    echo "[INFO] Installing npm packages..."
    npm install
else
    echo "[INFO] Verifying dependencies..."
    if npm ls multer --depth=0 >/dev/null 2>&1; then
        echo "[OK] Dependencies are ready."
    else
        echo "[WARN] Missing or incomplete dependencies detected. Running npm install..."
        npm install
    fi
fi

# التشغيل
echo ""
echo "[INFO] Launching bot..."
echo "=========================================="
node index.js