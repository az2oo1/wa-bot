const fs = require('fs');
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new Database(dbPath);

try {
    const dataset = {};
    dataset.global_settings = db.prepare('SELECT * FROM global_settings').all();
    dataset.llm_settings = db.prepare('SELECT * FROM llm_settings').all();
    dataset.blacklist = db.prepare('SELECT * FROM blacklist').all();
    dataset.whitelist = db.prepare('SELECT * FROM whitelist').all();
    dataset.blocked_extensions = db.prepare('SELECT * FROM blocked_extensions').all();
    dataset.whatsapp_groups = db.prepare('SELECT * FROM whatsapp_groups').all();
    dataset.custom_groups = db.prepare('SELECT * FROM custom_groups').all();

    console.log("DB queries returned successfully");

    const mediaData = {};
    const mediaDir = path.join(__dirname, 'media');
    if (fs.existsSync(mediaDir)) {
        const groups = fs.readdirSync(mediaDir);
        for (const group of groups) {
            const groupPath = path.join(mediaDir, group);
            if (fs.statSync(groupPath).isDirectory()) {
                const files = fs.readdirSync(groupPath);
                for (const file of files) {
                    const filePath = path.join(groupPath, file);
                    if (fs.statSync(filePath).isFile()) {
                        const b64 = fs.readFileSync(filePath, { encoding: 'base64' });
                        mediaData[group + '/' + file] = "base64_" + b64.length;
                    }
                }
            }
        }
    }
    dataset.media = mediaData;
    console.log("Media generated:", Object.keys(mediaData).length, "files");

    const exportData = {
        version: '6.1',
        timestamp: new Date().toISOString(),
        data: dataset
    };

    console.log("Stringifying...");
    const jsonStr = JSON.stringify(exportData);
    console.log("Successful, string length:", jsonStr.length);
} catch (e) {
    console.error("Export Error:", e);
}
