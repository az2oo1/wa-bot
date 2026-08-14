try { require('dotenv').config(); } catch (e) {}
const express = require('express');
const path = require('path');
const { db, loadConfigFromDB } = require('./src/db/index.js');
const authRoutes = require('./src/routes/auth.js');
const userRoutes = require('./src/routes/users.js');
const apiRoutes = require('./src/routes/api.js');
const { client, initializeClientWithRetry } = require('./src/bot/client.js');
const { setupBotHandlers } = require('./src/bot/handlers.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Body parsing & static file middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public')));

// Mount routes
app.use('/', authRoutes);
app.use('/', userRoutes);
app.use('/', apiRoutes);

// Setup WhatsApp event handlers & boot client
setupBotHandlers();
initializeClientWithRetry().catch(err => {
    console.error('[خطأ] فشل تشغيل بوت واتساب:', err);
});

// Start Express HTTP Server
const server = app.listen(PORT, () => {
    console.log(`[السيرفر] شغال على http://localhost:${PORT}`);
});

// Graceful shutdown handling
async function shutdown(signal) {
    console.log(`[معلومة] تم استقبال إشارة ${signal}، جاري إغلاق البوت والسيرفر...`);
    try {
        await client.destroy();
    } catch (e) {
        console.error('[خطأ] خطأ أثناء إغلاق البوت:', e.message);
    }
    server.close(() => {
        console.log('[السيرفر] تم إغلاق السيرفر بنجاح.');
        process.exit(0);
    });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = { app, server };