module.exports = function renderDashboard(req, db, config, runtimeStatus = {}) {
    let lang = 'ar';
    if (req.headers.cookie && req.headers.cookie.includes('bot_lang=en')) lang = 'en';
    const currentLang = lang;
    const t = (ar, en) => lang === 'en' ? en : ar;
    const dir = lang === 'en' ? 'ltr' : 'rtl';
    const escapeHtml = (value) => String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    const getStatusIconClass = (kind) => {
        if (kind === 'connected') return 'fas fa-check-circle';
        if (kind === 'waiting_qr') return 'fas fa-qrcode';
        if (kind === 'syncing' || kind === 'initializing' || kind === 'retrying' || kind === 'terminating') return 'fas fa-spinner fa-spin';
        if (kind === 'error') return 'fas fa-exclamation-triangle';
        if (kind === 'disconnected') return 'fas fa-sign-out-alt';
        return 'fas fa-info-circle';
    };
    const getStatusDotClass = (kind) => {
        if (kind === 'connected') return 'status-dot online';
        if (kind === 'waiting_qr') return 'status-dot waiting';
        return 'status-dot';
    };
    const initialStatusKind = runtimeStatus.statusKind || 'initializing';
    const initialStatusText = escapeHtml(
        runtimeStatus.statusText || (lang === 'en' ? 'Initializing system...' : 'جاري تهيئة النظام وبدء التشغيل...')
    );
    const initialStatusIconClass = getStatusIconClass(initialStatusKind);
    const initialStatusDotClass = getStatusDotClass(initialStatusKind);
    const initialLogoutDisplay = initialStatusKind === 'connected' ? 'block' : 'none';
    const mediaTypesMeta = [
        { id: 'text', icon: '<i class="fas fa-file-alt"></i>', name: t('نصوص', 'Text') },
        { id: 'image', icon: '<i class="fas fa-image"></i>', name: t('صور', 'Images') },
        { id: 'video', icon: '<i class="fas fa-video"></i>', name: t('فيديو', 'Videos') },
        { id: 'audio', icon: '<i class="fas fa-music"></i>', name: t('صوتيات', 'Audio') },
        { id: 'document', icon: '<i class="fas fa-file"></i>', name: t('ملفات', 'Documents') },
        { id: 'sticker', icon: '<i class="fas fa-smile"></i>', name: t('ملصقات', 'Stickers') }
    ];
    const blacklistArr = db.prepare('SELECT number FROM blacklist').all().map(r => r.number);
    const blockedExtensionsArr = db.prepare('SELECT ext FROM blocked_extensions').all().map(r => r.ext);
    const whitelistArr = db.prepare('SELECT number FROM whitelist').all().map(r => r.number);

    return `<!DOCTYPE html><html dir="${dir}" lang="${lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${t('لوحة تحكم المشرف الآلي', 'Auto Mod Dashboard')}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap" rel="stylesheet"><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"><style>*{box-sizing:border-box;margin:0;padding:0}:root{--bg:#080c10;--sidebar-bg:#0e1318;--card-bg:#131920;--card-border:#1e2830;--input-bg:#0a0f14;--input-border:#1e2830;--text:#dce8f5;--text-muted:#6b8099;--accent:#00c853;--accent-dim:rgba(0,200,83,0.1);--accent-hover:#00a846;--red:#ff5252;--red-dim:rgba(255,82,82,0.1);--orange:#ffab40;--orange-dim:rgba(255,171,64,0.1);--blue:#40c4ff;--blue-dim:rgba(64,196,255,0.1);--purple:#d18cff;--purple-dim:rgba(209,140,255,0.1);--modal-bg:rgba(0,0,0,0.8);--topbar-bg:rgba(8,12,16,0.92);--radius:12px;--font:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:16px}html[lang="ar"]{--font:'IBM Plex Sans Arabic',sans-serif}html.light{--bg:#f0f4f8;--sidebar-bg:#fff;--card-bg:#fff;--card-border:#dde3eb;--input-bg:#f5f8fb;--input-border:#dde3eb;--text:#0f1923;--text-muted:#5a7289;--accent:#00a846;--accent-dim:rgba(0,168,70,0.1);--accent-hover:#008c3a;--red:#e53935;--red-dim:rgba(229,57,53,0.1);--orange:#f57c00;--orange-dim:rgba(245,124,0,0.1);--blue:#0288d1;--blue-dim:rgba(2,136,209,0.1);--purple:#7b1fa2;--purple-dim:rgba(123,31,162,0.1);--modal-bg:rgba(0,0,0,0.55);--topbar-bg:rgba(240,244,248,0.94)}html.light .nav-item:hover{background:rgba(0,0,0,0.05);color:var(--text)}html.light .toggle-row{background:rgba(0,0,0,0.03)}html.light .toggle-row.danger{background:rgba(229,57,53,0.06)}html.light .toggle-row.warning{background:rgba(245,124,0,0.06)}html.light .toggle-row.blue{background:rgba(2,136,209,0.06)}html.light .toggle-row.purple{background:rgba(123,31,162,0.06)}html.light .toggle-row.pink{background:rgba(194,24,91,0.06)}html.light .toggle-row.green{background:rgba(0,150,80,0.06)}html.light .slider{background:#d0dae4;border-color:#b8c8d8}html.light .slider:before{background:#8fa8bf}html.light input:checked+.slider{background:rgba(0,168,70,0.18);border-color:var(--accent)}html.light input:checked+.slider:before{background:var(--accent)}html.light .sub-panel{background:rgba(0,0,0,0.03)}html.light #terminalOutput{background:#1a1a2e}html.light .card.danger,html.light .card.info,html.light .card.purple,html.light .card.success,html.light .card.warning{background:linear-gradient(180deg,var(--accent-dim) 0,var(--card-bg) 60%)}html.light .card.danger{background:linear-gradient(180deg,rgba(229,57,53,0.04) 0,var(--card-bg) 60%)}html.light .card.warning{background:linear-gradient(180deg,rgba(245,124,0,0.04) 0,var(--card-bg) 60%)}html.light .card.info{background:linear-gradient(180deg,rgba(2,136,209,0.04) 0,var(--card-bg) 60%)}html.light .card.success{background:linear-gradient(180deg,rgba(0,168,70,0.04) 0,var(--card-bg) 60%)}html.light .card.purple{background:linear-gradient(180deg,rgba(123,31,162,0.04) 0,var(--card-bg) 60%)}html.light .btn-primary{box-shadow:none}html.light .qr-wrap{background:#e8edf3}html.light ::-webkit-scrollbar-track{background:var(--bg)}html.light ::-webkit-scrollbar-thumb{background:#c5d0db}html.light .group-list-card:hover{border-color:rgba(2,136,209,0.4)}.icon-btn{width:38px;height:38px;border-radius:10px;border:1.5px solid var(--card-border);background:var(--input-bg);color:var(--text-muted);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:17px;transition:all .2s;flex-shrink:0}.icon-btn:hover{filter:brightness(1.14)}body,.card,.cb-label,.chip,.chip-container,.group-card,.group-list-card,.limit-item,.main,.modal-content,.nav-item,.qr-wrap,.sidebar,.sidebar-footer button,.status-pill,.sub-panel,.toggle-row,.topbar,input,select,textarea{transition:background .25s ease,border-color .25s ease,color .15s ease,box-shadow .25s ease}html{font-size:16px}body{font-family:var(--font);font-size:1rem;background:var(--bg);color:var(--text);min-height:100vh;display:flex;line-height:1.6}.sidebar{width:260px;height:100vh;background:var(--sidebar-bg);border-inline-end:1px solid var(--card-border);display:flex;flex-direction:column;position:fixed;inset-inline-start:0;top:0;z-index:100;transition:transform .3s}.sidebar-logo{padding:28px 22px 20px;border-bottom:1px solid var(--card-border);display:flex;align-items:center;gap:14px}.sidebar-nav-scroll{flex:1;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;min-height:0}.sidebar-nav-scroll{scrollbar-width:thin;scrollbar-color:var(--card-border) transparent}.sidebar-nav-scroll::-webkit-scrollbar{width:5px}.sidebar-nav-scroll::-webkit-scrollbar-track{background:transparent}.sidebar-nav-scroll::-webkit-scrollbar-thumb{background:var(--card-border);border-radius:4px}.sidebar-nav-scroll::-webkit-scrollbar-thumb:hover{background:var(--text-muted)}.logo-icon{width:60px;height:60px;border-radius:14px;background:transparent;display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0;box-shadow:none;color:#fff}.logo-text{font-size:15px;font-weight:700;color:var(--text);line-height:1.3}.logo-text small{display:block;font-weight:400;color:var(--text-muted);font-size:12px;margin-top:2px}.nav-section{padding:18px 16px 8px;font-size:10px;font-weight:700;color:var(--text-muted);letter-spacing:1.5px;text-transform:uppercase}.nav-item{display:flex;align-items:center;gap:12px;padding:12px 18px;margin:2px 10px;border-radius:10px;cursor:pointer;color:var(--text-muted);font-size:15px;transition:all .2s;border:none;background:0 0;width:calc(100% - 20px);text-align:start;font-family:var(--font)}.nav-item:hover{background:rgba(255,255,255,0.06);color:var(--text)}.nav-item.active{background:var(--accent-dim);color:var(--accent);font-weight:600;border:1px solid rgba(0,230,118,0.2)}.nav-item .nav-icon{font-size:18px;width:24px;text-align:center;flex-shrink:0}.nav-item .nav-badge{margin-inline-start:auto;background:var(--red);color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;min-width:22px;text-align:center}.sidebar-footer{flex-shrink:0;padding:18px;border-top:1px solid var(--card-border);display:flex;gap:10px}.sidebar-footer button{flex:1;padding:11px 8px;border-radius:10px;border:1px solid var(--card-border);background:var(--input-bg);color:var(--text-muted);cursor:pointer;font-size:14px;transition:all .2s;font-family:var(--font);font-weight:600}.sidebar-footer button:hover{border-color:var(--input-border);color:var(--text);background:var(--card-bg)}.sidebar-footer button[data-variant=danger]{border-color:rgba(229,57,53,0.45);color:var(--red);background:var(--red-dim)}.sidebar-footer button[data-variant=danger]:hover{filter:brightness(1.14)}.sidebar-footer button[data-variant=primary]{border-color:rgba(0,230,118,0.35);color:var(--accent);background:var(--accent-dim)}.sidebar-footer button[data-variant=primary]:hover{filter:brightness(1.14)}.main{margin-inline-start:260px;flex:1;display:flex;flex-direction:column;min-height:100vh;min-width:0}.topbar{position:sticky;top:0;z-index:50;background:var(--topbar-bg);backdrop-filter:blur(16px);border-bottom:1px solid var(--card-border);padding:0 40px;height:66px;display:flex;align-items:center;justify-content:space-between}.topbar-title{font-size:18px;font-weight:700;color:var(--text)}.topbar-right{display:flex;align-items:center;gap:14px}.status-pill{display:flex;align-items:center;gap:10px;background:var(--card-bg);border:1px solid var(--card-border);padding:8px 18px;border-radius:24px;font-size:14px;color:var(--text-muted)}.status-dot{width:9px;height:9px;border-radius:50%;background:var(--text-muted);flex-shrink:0}.status-dot.online{background:var(--accent);box-shadow:0 0 10px var(--accent);animation:pulse 2s infinite}.status-dot.waiting{background:var(--orange);box-shadow:0 0 8px var(--orange)}@keyframes pulse{0%,100%{opacity:1;box-shadow:0 0 10px var(--accent)}50%{opacity:.6;box-shadow:0 0 4px var(--accent)}}.page{display:none;padding:32px 40px;width:100%}.page.active{display:block}.page-header{margin-bottom:28px}.page-header h2{font-size:26px;font-weight:700;color:var(--text);letter-spacing:-.3px;display:flex;align-items:center;gap:10px}.page-header p{color:var(--text-muted);font-size:15px;margin-top:5px}.card{background:var(--card-bg);border:1px solid var(--card-border);border-radius:var(--radius);padding:24px;margin-bottom:20px}.card-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--card-border)}.card-header h3{font-size:17px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:10px}.card.danger{border-color:rgba(255,82,82,0.35);background:linear-gradient(180deg,rgba(255,82,82,0.04) 0,var(--card-bg) 60%)}.card.warning{border-color:rgba(255,171,64,0.35);background:linear-gradient(180deg,rgba(255,171,64,0.04) 0,var(--card-bg) 60%)}.card.info{border-color:rgba(64,196,255,0.35);background:linear-gradient(180deg,rgba(64,196,255,0.04) 0,var(--card-bg) 60%)}.card.purple{border-color:rgba(209,140,255,0.35);background:linear-gradient(180deg,rgba(209,140,255,0.04) 0,var(--card-bg) 60%)}.card.success{border-color:rgba(0,230,118,0.35);background:linear-gradient(180deg,rgba(0,230,118,0.04) 0,var(--card-bg) 60%)}label.field-label{display:block;font-size:12px;font-weight:700;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:.8px}input[type=number],input[type=text],input[type=password],select,textarea{width:100%;padding:12px 16px;background:var(--input-bg);border:1.5px solid var(--input-border);border-radius:10px;color:var(--text);font-size:15px;font-family:var(--font);transition:border-color .2s,box-shadow .2s;outline:0}input:focus,select:focus,textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(0,230,118,0.12)}textarea{resize:vertical}select option{background:var(--card-bg);color:var(--text)}.field-group{margin-bottom:20px}.field-row{display:flex;gap:14px}.field-row>*{flex:1}.input-with-btn{display:flex;gap:10px}.input-with-btn input{margin:0}.btn{padding:11px 22px;border-radius:10px;border:1.5px solid transparent;font-size:15px;font-weight:700;cursor:pointer;font-family:var(--font);transition:all .2s;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;letter-spacing:.2px}.btn:hover,.sidebar-footer button:hover,.icon-btn:hover{filter:brightness(1.14)}.btn-primary{background:var(--accent-dim);border-color:rgba(0,230,118,0.4);color:var(--accent);font-weight:700}.btn-primary:hover{filter:brightness(1.14)}.btn-danger{background:var(--red-dim);color:var(--red);border-color:rgba(229,57,53,0.45)}.btn-danger:hover{filter:brightness(1.14)}.btn-warning{background:var(--orange);color:#000;border-color:transparent}.btn-warning:hover{filter:brightness(1.14)}.btn-ghost{background:0 0;border:1.5px solid var(--card-border);color:var(--text-muted)}.btn-ghost:hover{filter:brightness(1.14)}.btn-blue{background:var(--blue);color:#000;border-color:transparent}.btn-blue:hover{filter:brightness(1.14)}.btn-sm{padding:7px 14px;font-size:13px}.btn-full{width:100%;justify-content:center;padding:15px;font-size:16px}.toggle-row{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-radius:10px;background:rgba(255,255,255,0.03);border:1.5px solid var(--card-border);margin-bottom:12px;gap:14px}.toggle-row.danger{border-color:rgba(255,82,82,0.3);background:rgba(255,82,82,0.05)}.toggle-row.warning{border-color:rgba(255,171,64,0.3);background:rgba(255,171,64,0.05)}.toggle-row.blue{border-color:rgba(64,196,255,0.3);background:rgba(64,196,255,0.05)}.toggle-row.purple{border-color:rgba(209,140,255,0.3);background:rgba(209,140,255,0.05)}.toggle-row.pink{border-color:rgba(240,100,170,0.3);background:rgba(240,100,170,0.05)}.toggle-row.green{border-color:rgba(100,200,120,0.3);background:rgba(100,200,120,0.05)}.toggle-left{display:flex;align-items:center;gap:16px}.toggle-label{font-size:15px;font-weight:600;color:var(--text)}.toggle-label small{display:block;font-size:12px;color:var(--text-muted);font-weight:400;margin-top:2px}.toggle-label.danger{color:var(--red)}.toggle-label.warning{color:var(--orange)}.toggle-label.blue{color:var(--blue)}.toggle-label.purple{color:var(--purple)}.toggle-label.pink{color:#ff80ab}.toggle-label.green{color:#69f0ae}.switch{position:relative;display:inline-block;width:50px;height:28px;flex-shrink:0}.switch input{opacity:0;width:0;height:0}.slider{position:absolute;cursor:pointer;inset:0;background:#1e2830;border:1.5px solid #2a3a4a;transition:.3s;border-radius:28px}.slider:before{position:absolute;content:"";height:20px;width:20px;bottom:2px;inset-inline-start:2px;background:#4a5a6a;transition:.3s;border-radius:50%}input:checked+.slider{background:rgba(0,230,118,0.2);border-color:var(--accent)}input:checked+.slider:before{background:var(--accent);box-shadow:0 0 8px rgba(0,230,118,0.6)}[dir=ltr] input:checked+.slider:before{transform:translateX(22px)}[dir=rtl] input:checked+.slider:before{transform:translateX(-22px)}.lang-slider:before{height:14px;width:14px;bottom:1.5px;inset-inline-start:1.5px}[dir=ltr] input:checked+.lang-slider:before{transform:translateX(20px)}[dir=rtl] input:checked+.lang-slider:before{transform:translateX(-20px)}.chip-container{display:flex;flex-wrap:wrap;gap:10px;padding:14px;background:var(--input-bg);border-radius:10px;min-height:52px;max-height:220px;overflow-y:auto;border:1.5px dashed var(--card-border);margin-top:10px}.chip{background:var(--accent-dim);color:var(--accent);padding:6px 14px;border-radius:20px;font-size:14px;display:flex;align-items:center;gap:8px;border:1px solid rgba(0,230,118,0.3);font-weight:500}.chip.red-chip{background:var(--red-dim);color:var(--red);border-color:rgba(255,82,82,0.3)}.chip-remove{cursor:pointer;font-size:16px;font-weight:700;opacity:.6;line-height:1}.chip-remove:hover{opacity:1}.sub-panel{background:rgba(0,0,0,0.2);border:1.5px solid var(--card-border);border-radius:10px;padding:18px;margin-top:12px}.sub-panel.orange{border-color:rgba(255,171,64,0.3)}.sub-panel.red{border-color:rgba(255,82,82,0.3)}.sub-panel h4{font-size:14px;font-weight:700;color:var(--text-muted);margin-bottom:14px;display:flex;align-items:center;gap:8px;text-transform:uppercase;letter-spacing:.5px}.cb-group{display:flex;gap:10px;flex-wrap:wrap}.cb-label{display:flex;align-items:center;gap:8px;padding:8px 14px;background:var(--card-bg);border:1.5px solid var(--card-border);border-radius:8px;cursor:pointer;font-size:14px;color:var(--text-muted);transition:all .2s;user-select:none}.cb-label:hover{border-color:var(--accent);color:var(--text)}.cb-label input{accent-color:var(--accent);width:16px;height:16px;cursor:pointer}.limit-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}.limit-item{display:flex;align-items:center;gap:10px;background:var(--card-bg);padding:10px 14px;border-radius:9px;border:1.5px solid var(--card-border)}.limit-item input[type=checkbox]{accent-color:var(--accent);width:16px;height:16px;cursor:pointer;flex-shrink:0}.limit-item span{font-size:14px;flex:1;color:var(--text)}.limit-item input[type=number]{width:60px;padding:6px 8px;font-size:14px;margin:0;text-align:center}.group-list-card{background:var(--card-bg);border:1.5px solid var(--card-border);border-radius:14px;margin-bottom:14px;display:flex;align-items:center;gap:18px;padding:18px 22px;cursor:pointer;transition:border-color .2s,transform .2s}.group-list-card:hover{border-color:rgba(64,196,255,0.35);filter:brightness(1.08)}.group-list-card:hover .glc-arrow{opacity:1}.glc-avatar{width:52px;height:52px;border-radius:13px;flex-shrink:0;background:var(--accent-dim);border:1.5px solid var(--card-border);display:flex;align-items:center;justify-content:center;overflow:hidden;font-size:18px;font-weight:700;color:var(--accent)}.glc-avatar img{width:100%;height:100%;object-fit:cover;border-radius:11px}.glc-info{flex:1;min-width:0}.glc-name{font-size:16px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.glc-id{font-family:monospace;font-size:11px;color:var(--text-muted);background:var(--input-bg);padding:2px 8px;border-radius:5px;border:1px solid var(--card-border);margin-top:4px;display:inline-block}.glc-chips{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.glc-chip{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600}.glc-chip.green{background:var(--accent-dim);color:var(--accent);border:1px solid rgba(0,200,83,0.25)}.glc-chip.orange{background:var(--orange-dim);color:var(--orange);border:1px solid rgba(255,171,64,0.25)}.glc-chip.blue{background:var(--blue-dim);color:var(--blue);border:1px solid rgba(64,196,255,0.25)}.glc-chip.red{background:var(--red-dim);color:var(--red);border:1px solid rgba(255,82,82,0.25)}.glc-chip.purple{background:var(--purple-dim);color:var(--purple);border:1px solid rgba(209,140,255,0.25)}.glc-arrow{font-size:16px;color:var(--blue);opacity:0;transition:opacity .2s;flex-shrink:0;margin-inline-start:4px}.group-detail-bar{display:flex;align-items:center;gap:16px;margin-bottom:28px;flex-wrap:wrap}.group-detail-identity{display:flex;align-items:center;gap:14px;background:var(--card-bg);border:1px solid var(--card-border);border-radius:12px;padding:12px 20px;flex:1}.group-detail-avatar{width:46px;height:46px;border-radius:12px;flex-shrink:0;background:var(--accent-dim);border:1.5px solid var(--card-border);display:flex;align-items:center;justify-content:center;overflow:hidden;font-size:17px;font-weight:700;color:var(--accent)}.group-detail-avatar img{width:100%;height:100%;object-fit:cover;border-radius:10px}.group-card{background:var(--card-bg);border:1.5px solid var(--card-border);border-radius:14px;margin-bottom:16px;overflow:hidden;transition:border-color .2s}.group-card-header{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;background:rgba(255,255,255,0.02);border-bottom:1px solid var(--card-border)}.group-card-title{font-size:16px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:10px}.group-card-body{padding:20px}.group-id-badge{font-family:monospace;font-size:12px;color:var(--text-muted);background:var(--input-bg);padding:3px 10px;border-radius:6px;border:1px solid var(--card-border)}.qr-wrap{display:flex;flex-direction:column;align-items:center;gap:20px;padding:36px;background:var(--input-bg);border-radius:12px;border:1.5px dashed var(--card-border)}#qr-image{max-width:230px;border-radius:12px;border:10px solid #fff;box-shadow:0 8px 30px rgba(0,0,0,0.5);display:none}.toast{position:fixed;bottom:32px;left:50%;transform:translateX(-50%) translateY(24px);background:var(--accent);color:#000;padding:13px 28px;border-radius:40px;font-weight:700;font-size:15px;z-index:9999;opacity:0;transition:all .35s;pointer-events:none;box-shadow:0 4px 20px rgba(0,230,118,0.5)}.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}.modal{display:none;position:fixed;z-index:1000;inset:0;background:var(--modal-bg);backdrop-filter:blur(8px);align-items:center;justify-content:center}.modal.open{display:flex}.modal-content{background:var(--card-bg);border:1.5px solid var(--card-border);border-radius:16px;padding:32px;width:90%;max-width:640px;box-shadow:0 24px 80px rgba(0,0,0,0.7);animation:slideIn .25s ease;max-height:90vh;overflow-y:auto}.modal-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}.modal-header h3{font-size:20px;font-weight:700}.close-modal{background:0 0;border:none;color:var(--text-muted);font-size:26px;cursor:pointer;padding:4px;line-height:1}.close-modal:hover{color:var(--red)}@keyframes slideIn{from{transform:translateY(-24px);opacity:0}to{transform:translateY(0);opacity:1}}#terminalOutput{background:#000;color:#00ff88;font-family:'Courier New',monospace;height:400px;overflow-y:auto;padding:16px;border-radius:10px;font-size:13px;direction:ltr;text-align:start;border:1px solid #0a1a0a}#terminalOutput div{margin-bottom:5px;border-bottom:1px solid #0a1a0a;padding-bottom:5px;word-wrap:break-word;line-height:1.6}.card-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start}.card-grid .card{margin-bottom:0}.card-grid-full{grid-column:1/-1}@media (max-width:1100px){.card-grid{grid-template-columns:1fr}}.section-sep{height:1px;background:var(--card-border);margin:20px 0}::-webkit-scrollbar{width:7px}::-webkit-scrollbar-track{background:var(--bg)}::-webkit-scrollbar-thumb{background:var(--card-border);border-radius:4px}.sidebar-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99}.hamburger{display:none;background:0 0;border:none;color:var(--text);font-size:24px;cursor:pointer;padding:4px}.group-tabs{display:flex;gap:4px;border-bottom:1.5px solid var(--card-border);margin-bottom:20px}.group-tab{padding:10px 18px;border:none;background:0 0;color:var(--text-muted);font-size:14px;font-weight:600;font-family:var(--font);cursor:pointer;border-bottom:2.5px solid transparent;margin-bottom:-1.5px;transition:all .2s;display:flex;align-items:center;gap:7px;border-radius:8px 8px 0 0}.group-tab:hover{color:var(--text);background:rgba(255,255,255,0.04)}.group-tab.active{color:var(--accent);border-bottom-color:var(--accent);background:var(--accent-dim)}.group-tab-panel{display:none}.group-tab-panel.active{display:block}.step-badge{display:inline-block;background:var(--blue-dim);color:var(--blue);padding:2px 9px;border-radius:12px;margin-inline-end:6px;font-weight:700;font-size:13px}@media (max-width:768px){.sidebar{transform:translateX(100%)}[dir=ltr] .sidebar{transform:translateX(-100%)}.sidebar.open{transform:translateX(0)}.sidebar-overlay.open{display:block}.main{margin-inline-start:0}.hamburger{display:block}.page{padding:18px}.topbar{padding:0 18px}.limit-grid{grid-template-columns:1fr}.card-grid{grid-template-columns:1fr}.field-row{flex-direction:column}}</style>
    </head>
    <body>
        <style>
            #page-users .btn {
                border-radius: 10px !important;
                border: 1.5px solid var(--card-border) !important;
                background: var(--input-bg) !important;
                font-weight: 700 !important;
                transition: all .2s !important;
                display: inline-flex;
                align-items: center;
                justify-content: center;
            }

            #page-users .btn:hover {
                filter: brightness(1.14);
                box-shadow: none !important;
            }

            #page-users .btn-primary {
                background: var(--accent-dim) !important;
                border-color: rgba(0,230,118,0.4) !important;
                color: var(--accent) !important;
            }

            #page-users .btn-danger {
                background: var(--red-dim) !important;
                border-color: rgba(248,81,73,0.4) !important;
                color: var(--red) !important;
            }

            #page-users .btn-warning {
                background: var(--orange-dim) !important;
                border-color: rgba(255,171,64,0.45) !important;
                color: var(--orange) !important;
            }

            #page-users .btn-blue {
                background: var(--blue-dim) !important;
                border-color: rgba(64,196,255,0.45) !important;
                color: var(--blue) !important;
            }

            #page-users .btn-ghost {
                background: var(--input-bg) !important;
                border-color: var(--card-border) !important;
                color: var(--text-muted) !important;
            }

            .um-actions-row {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
            }

            .um-actions-row .btn {
                flex: 1 1 170px;
            }

            .um-layout {
                display: grid;
                grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
                gap: 18px;
                margin-bottom: 20px;
            }

            .um-stack {
                display: flex;
                flex-direction: column;
                gap: 20px;
            }

            .um-stats {
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 10px;
                margin-bottom: 12px;
            }

            .um-stat {
                border: 1px solid var(--card-border);
                border-radius: 10px;
                background: var(--input-bg);
                padding: 10px 12px;
            }

            .um-stat-label {
                color: var(--text-muted);
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: .6px;
            }

            .um-stat-value {
                color: var(--text);
                font-size: 20px;
                font-weight: 700;
                margin-top: 2px;
                line-height: 1.2;
            }

            .um-card-note {
                font-size: 13px;
                color: var(--text-muted);
                margin-top: -6px;
                margin-bottom: 12px;
            }

            .um-scroll-box {
                max-height: 330px;
                overflow: auto;
                padding-right: 4px;
            }

            .um-selected-user {
                border: 1px solid rgba(64,196,255,0.28);
                background: rgba(64,196,255,0.06);
            }

            .um-access-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 14px;
            }

            .um-perm-drawer {
                overflow: hidden;
                max-height: 0;
                opacity: 0;
                transition: max-height .35s ease, opacity .25s ease, margin-top .25s ease;
                margin-top: 0;
            }

            .um-perm-drawer.open {
                max-height: 420px;
                opacity: 1;
                margin-top: 12px;
            }

            .um-perm-help {
                margin-top: 12px;
                border: 1px solid rgba(64,196,255,0.28);
                background: rgba(64,196,255,0.06);
                border-radius: 10px;
                padding: 12px;
                max-height: 280px;
                overflow: auto;
            }

            .um-perm-help-item {
                padding: 7px 0;
                border-bottom: 1px dashed rgba(255,255,255,0.08);
            }

            .um-perm-help-item:last-child {
                border-bottom: 0;
                padding-bottom: 0;
            }

            .um-perm-help-key {
                font-family: monospace;
                font-size: 12px;
                color: var(--blue);
                margin-bottom: 4px;
            }

            .um-perm-help-desc {
                color: var(--text-muted);
                font-size: 12px;
                line-height: 1.5;
            }

            #page-groups #groupsContainer {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 12px;
            }

            #page-groups .group-list-card {
                margin-bottom: 0;
                padding: 14px 16px;
                gap: 14px;
                border-radius: 12px;
            }

            #page-groups .glc-avatar {
                width: 46px;
                height: 46px;
                border-radius: 11px;
                font-size: 16px;
            }

            #page-groups .glc-id {
                font-size: 12px;
                padding: 3px 8px;
            }

            #page-groups .glc-chips {
                margin-top: 8px;
            }

            #page-groups .glc-side {
                display: flex;
                align-items: center;
                gap: 10px;
                flex-shrink: 0;
            }

            #page-groups .glc-stats {
                text-align: end;
                min-width: 68px;
            }

            #page-groups .glc-stats strong {
                display: block;
                color: var(--text);
                font-size: 16px;
                line-height: 1.1;
            }

            #page-groups .glc-stats span {
                font-size: 11px;
                color: var(--text-muted);
                text-transform: uppercase;
                letter-spacing: .5px;
            }

            #page-groups .glc-arrow {
                opacity: .58;
                margin-inline-start: 0;
                font-size: 14px;
            }

            #page-groups .group-list-card:hover .glc-arrow {
                opacity: 1;
            }

            @media (max-width: 1100px) {
                .um-layout,
                .um-access-grid,
                .um-stats {
                    grid-template-columns: 1fr;
                }

                .um-actions-row .btn {
                    flex: 1 1 auto;
                }
            }

            @media (max-width: 900px) {
                #page-groups #groupsContainer {
                    grid-template-columns: 1fr;
                }

                #page-groups .glc-stats {
                    display: none;
                }
            }
        </style>
        <nav class="sidebar" id="sidebar">
            <div class="sidebar-logo">
                <div class="logo-icon"><img src="/public/logo.png?v=2" alt="${t('شعار البوت', 'Bot Logo')}" style="width:100%;height:100%;object-fit:cover;border-radius:14px;display:block;" onerror="if(!this.dataset.retry){this.dataset.retry='1';this.src='public/logo.png?v=2';return;}this.style.display='none';this.nextElementSibling.style.display='flex';"><i class="fas fa-robot" style="display:none;align-items:center;justify-content:center;width:100%;height:100%;font-size:22px;color:#fff;"></i></div>
                <div class="logo-text">${t('المشرف الآلي', 'Auto Mod')} <small>${t('لوحة التحكم V.6.6', 'Dashboard V6.6')}</small></div>
            </div>

            <div class="sidebar-nav-scroll">
                <div class="nav-section">${t('الرئيسية', 'Main')}</div>
                <button class="nav-item active" onclick="showPage('page-status', this)">
                    <span class="nav-icon"><i class="fas fa-satellite-dish"></i></span> ${t('حالة الاتصال', 'Connection Status')}
                </button>
                <button class="nav-item" onclick="showPage('page-blacklist', this)">
                    <span class="nav-icon"><i class="fas fa-users-slash"></i></span> ${t('إدارة الأرقام', 'Manage Numbers')}
                    <span class="nav-badge" id="blacklist-count">0</span>
                </button>

                <div class="nav-section">${t('الإعدادات', 'Settings')}</div>
                <button class="nav-item" onclick="showPage('page-general', this)">
                    <span class="nav-icon"><i class="fas fa-cog"></i></span> ${t('الإعدادات العامة', 'General Settings')}
                </button>
                <button class="nav-item" onclick="showPage('page-spam', this)">
                    <span class="nav-icon"><i class="fas fa-shield-alt"></i></span> ${t('مكافحة الإزعاج', 'Anti-Spam')}
                </button>
                <button class="nav-item" onclick="showPage('page-media', this)">
                    <span class="nav-icon"><i class="fas fa-filter"></i></span> ${t('فلتر الوسائط', 'Media Filter')}
                </button>
                <button class="nav-item" onclick="showPage('page-ai', this)">
                    <span class="nav-icon"><i class="fas fa-brain"></i></span> ${t('الذكاء الاصطناعي', 'AI Moderator')}
                </button>
                <button class="nav-item" onclick="showPage('page-global-qa', this)">
                    <span class="nav-icon"><i class="fas fa-comments"></i></span> ${t('الأسئلة العامة', 'Global Q&A')}
                </button>
                <button class="nav-item" onclick="showPage('page-groups', this)">
                    <span class="nav-icon"><i class="fas fa-users-cog"></i></span> ${t('المجموعات المخصصة', 'Custom Groups')}
                </button>

                <div class="nav-section">${t('أدوات', 'Tools')}</div>
                <button class="nav-item" onclick="openDebuggerModal()">
                    <span class="nav-icon"><i class="fas fa-bug"></i></span> ${t('سجل الأحداث', 'Event Logs')}
                </button>
                <button class="nav-item" onclick="showPage('page-import-export', this)">
                    <span class="nav-icon"><i class="fas fa-exchange-alt"></i></span> ${t('استيراد/تصدير', 'Import/Export')}
                </button>
                <button class="nav-item" onclick="showPage('page-users', this)">
                    <span class="nav-icon"><i class="fas fa-user-shield"></i></span> ${t('إدارة المستخدمين', 'User Management')}
                </button>
                <button class="nav-item" onclick="showPage('page-about', this)">
                    <span class="nav-icon"><i class="fas fa-info-circle"></i></span> ${t('حول', 'About')}
                </button>
            </div>

            <div class="sidebar-footer">
                <button id="signOutBtn" data-variant="danger" onclick="signOutSession()"><i class="fas fa-right-from-bracket"></i> ${t('تسجيل الخروج', 'Sign Out')}</button>
                <button data-variant="primary" onclick="saveConfig()"><i class="fas fa-save"></i> ${t('حفظ', 'Save')}</button>
            </div>
        </nav>

        <div class="sidebar-overlay" id="sidebarOverlay" onclick="closeSidebar()"></div>

        <div class="main">
            <div class="topbar">
                <div style="display:flex;align-items:center;gap:12px;">
                    <button class="hamburger" onclick="toggleSidebar()"><i class="fas fa-bars"></i></button>
                    <span class="topbar-title" id="topbarTitle">${t('حالة الاتصال', 'Connection Status')}</span>
                </div>
                <div class="topbar-right">
                    
                    <div style="display: flex; align-items: center; gap: 6px; background: var(--input-bg); padding: 4px 10px; border-radius: 20px; border: 1.5px solid var(--card-border);">
                        <span style="font-size: 11px; font-weight: 700; color: ${lang === 'ar' ? 'var(--accent)' : 'var(--text-muted)'}; transition: color 0.3s;">AR</span>
                        <label class="switch" style="width: 36px; height: 20px;">
                            <input type="checkbox" id="langToggle" onchange="switchLanguage(this)" ${lang === 'en' ? 'checked' : ''}>
                            <span class="slider lang-slider" style="border-radius: 20px;"></span>
                        </label>
                        <span style="font-size: 11px; font-weight: 700; color: ${lang === 'en' ? 'var(--accent)' : 'var(--text-muted)'}; transition: color 0.3s;">EN</span>
                    </div>

                    <div class="status-pill">
                        <div class="${initialStatusDotClass}" id="statusDot"></div>
                        <span id="status-text"><i id="status-text-icon" class="${initialStatusIconClass}"></i> <span id="status-text-label">${initialStatusText}</span></span>
                    </div>
                </div>
            </div>

            <form id="configForm">

            <div class="page active" id="page-status">
                <div class="page-header">
                    <h2><i class="fas fa-wifi"></i> ${t('حالة الاتصال بواتساب', 'WhatsApp Connection Status')}</h2>
                    <p>${t('اربط حساب واتساب بمسح رمز QR أو راقب الاتصال الحالي', 'Link WhatsApp account by scanning the QR code or monitor connection')}</p>
                </div>
                <div class="card-grid">
                    <div class="card" style="grid-column: 1;">
                        <div class="card-header"><h3><i class="fas fa-qrcode"></i> ${t('رمز QR', 'QR Code')}</h3></div>
                        <div class="qr-wrap">
                            <img id="qr-image" src="" alt="QR Code" />
                            <div id="qr-placeholder" style="text-align:center; color: var(--text-muted); padding: 20px 0;">
                                <div style="font-size: 64px; margin-bottom: 16px;"><i class="fas fa-mobile-alt"></i></div>
                                <div style="font-size: 18px; font-weight: 700; color: var(--text);">${t('في انتظار رمز QR...', 'Waiting for QR code...')}</div>
                                <div style="font-size: 14px; margin-top: 8px;">${t('سيظهر الرمز هنا تلقائياً', 'Code will appear here automatically')}</div>
                            </div>
                        </div>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:20px;">
                        <div class="card success">
                            <div class="card-header"><h3 style="color:var(--accent);"><i class="fas fa-chart-line"></i> ${t('حالة النظام', 'System Status')}</h3></div>
                            <div style="font-size:16px; color:var(--text-muted); line-height:2.2;">
                                <div><i class="fas fa-robot"></i> <strong style="color:var(--text);">${t('البوت:', 'Bot:')}</strong> <span id="status-text-detail" style="color:var(--accent);">...</span> <i id="status-text-detail-check" class="fas fa-check" style="color:var(--accent);display:none;"></i></div>
                                <div><i class="fas fa-database"></i> <strong style="color:var(--text);">${t('قاعدة البيانات:', 'Database:')}</strong> <span style="color:var(--accent);">${t('متصلة', 'Connected')} <i class="fas fa-check"></i></span></div>
                                <div><i class="fas fa-globe"></i> <strong style="color:var(--text);">${t('المنفذ:', 'Port:')}</strong> <span style="color:var(--accent);">3000 <i class="fas fa-check"></i></span></div>
                            </div>
                            <div style="margin-top:14px; padding-top:14px; border-top:1px dashed var(--card-border);">
                                <button id="logoutBtn" type="button" class="btn btn-danger" onclick="logoutBot()" style="display:none;"><i class="fas fa-link-slash"></i> ${t('قطع اتصال واتساب', 'Disconnect WhatsApp')}</button>
                                <div style="font-size:12px; color:var(--text-muted); margin-top:8px;">${t('هذا الخيار يفصل جلسة واتساب فقط وليس حساب لوحة التحكم', 'This disconnects only the WhatsApp session, not your dashboard account')}</div>
                            </div>
                        </div>
                        <div class="card info">
                            <div class="card-header"><h3 style="color:var(--blue);"><i class="fas fa-info-circle"></i> ${t('تعليمات الاستخدام', 'Instructions')}</h3></div>
                            <div style="font-size:14px; color:var(--text-muted); line-height:2.2;">
                                <div><span class="step-badge">1</span> ${t('امسح رمز QR بهاتفك من واتساب', 'Scan QR code with your phone')}</div>
                                <div><span class="step-badge">2</span> ${t('أضف البوت كمشرف في المجموعات', 'Add bot as group admin')}</div>
                                <div><span class="step-badge">3</span> ${t('افتح صفحة الإعدادات وخصّص القواعد', 'Customize rules in settings')}</div>
                                <div><span class="step-badge">4</span> ${t('اضغط على حفظ لتطبيق التغييرات', 'Click Save to apply changes')}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="page" id="page-blacklist">
                <div class="page-header">
                    <h2><i class="fas fa-shield-alt"></i> ${t('إدارة الأرقام (حظر وتوثيق)', 'Number Management (Ban & VIP)')}</h2>
                    <p>${t('أضف الأرقام المحظورة (طرد فوري) أو الموثوقة (تخطي الفلاتر)', 'Add banned numbers (instant kick) or trusted VIPs (bypass filters)')}</p>
                </div>
                <style>
                    #page-blacklist .page-header p { color: var(--text); opacity: .84; }
                    #page-blacklist .field-label { color: var(--text); opacity: .78; }
                    #page-blacklist .toggle-label small { color: var(--text); opacity: .72; }
                    #page-blacklist .blacklist-grid { 
                        align-items: start;
                        grid-template-columns: 1fr 1fr;
                    }
                    #page-blacklist .blacklist-column {
                        display: flex;
                        flex-direction: column;
                        gap: 20px;
                        min-width: 0;
                    }
                    #page-blacklist .blacklist-column .card { margin-bottom: 0; }
                    #page-blacklist .purge-card {
                        border-color: rgba(255,171,64,0.55);
                        box-shadow: 0 0 0 1px rgba(255,171,64,0.18) inset;
                    }
                    @media (max-width:1100px) {
                        #page-blacklist .blacklist-grid { grid-template-columns: 1fr; }
                    }
                </style>
                <div class="card-grid blacklist-grid">
                    <div class="blacklist-column">
                    <div class="card danger blacklist-main-card">
                        <div class="card-header">
                            <h3 style="color:var(--red);"><i class="fas fa-user-plus"></i> ${t('القائمة السوداء (حظر)', 'Blacklist (Banned)')}</h3>
                            <span style="font-size: 13px; color: var(--text-muted); background:var(--red-dim); padding:4px 10px; border-radius:20px;">${t('طرد فوري', 'Instant Kick')}</span>
                        </div>
                        <div class="field-group">
                            <label class="field-label">${t('رقم الهاتف (بدون +)', 'Phone Number (without +)')}</label>
                            <div class="input-with-btn">
                                <input type="text" id="newBlacklistNumber" placeholder="Ex: 966512345678" onkeypress="if(event.key==='Enter'){event.preventDefault();addBlacklistNumber();}">
                                <button type="button" class="btn btn-danger" onclick="addBlacklistNumber()"><i class="fas fa-ban"></i> ${t('حظر', 'Ban')}</button>
                            </div>
                        </div>
                        <label class="field-label">${t('الأرقام المحظورة حالياً', 'Currently Banned Numbers')}</label>
                        <div id="blacklistContainer" class="chip-container"></div>
                        
                        <div class="toggle-row danger" style="margin-top:20px; margin-bottom:0;">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" id="enableBlacklist" ${config.enableBlacklist ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="toggle-label danger">
                                    ${t('تفعيل نظام القائمة السوداء', 'Enable Blacklist System')}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="card warning purge-card">
                        <div class="card-header"><h3 style="color:var(--orange);"><i class="fas fa-broom"></i> ${t('طرد رجعي شامل', 'Global Purge')}</h3></div>
                        <p style="font-size:14px; color:var(--text-muted); margin-bottom: 18px; line-height:1.8;">${t('سيبحث البوت في جميع المجموعات التي هو فيها مشرف، ويطرد كل من في القائمة السوداء فوراً.', 'Bot will scan all managed groups and kick anyone in the blacklist immediately.')}</p>
                        <button type="button" id="purgeBtn" class="btn btn-warning" style="width:100%; justify-content:center; padding:15px; font-size:16px;" onclick="purgeBlacklisted()">
                            <i class="fas fa-gavel"></i> ${t('تنفيذ الطرد الشامل الآن', 'Execute Global Purge Now')}
                        </button>
                    </div>

                    <div class="card warning purge-card">
                        <div class="card-header"><h3 style="color:var(--orange);"><i class="fas fa-clock"></i> ${t('جدولة الطرد الشامل', 'Auto-Purge Schedule')}</h3></div>
                        <div class="field-row" style="align-items:end; margin-bottom:10px;">
                            <div class="field-group" style="margin-bottom:0;">
                                <label class="field-label">${t('الفاصل بالدقائق', 'Interval (minutes)')}</label>
                                <input type="number" id="autoPurgeIntervalMinutes" min="1" step="1" value="60">
                            </div>
                            <button type="button" id="saveAutoPurgeScheduleBtn" class="btn btn-warning" onclick="saveAutoPurgeSchedule()" style="height:44px;">
                                <i class="fas fa-save"></i> ${t('حفظ', 'Save')}
                            </button>
                        </div>
                        <div class="toggle-row warning" style="margin-bottom:12px;">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" id="autoPurgeScheduleEnabled"><span class="slider"></span></label>
                                <div class="toggle-label warning">${t('تفعيل الجدولة التلقائية', 'Enable automatic schedule')}</div>
                            </div>
                        </div>
                        <button type="button" id="runAutoPurgeScheduleBtn" class="btn btn-warning" style="width:100%; justify-content:center;" onclick="runAutoPurgeNow()">
                            <i class="fas fa-play"></i> ${t('تشغيل الطرد الآن', 'Run Auto-Purge Now')}
                        </button>
                    </div>
                    </div>

                    <div class="blacklist-column">
                    <div class="card danger blocked-ext-card">
                        <div class="card-header">
                            <h3 style="color:var(--red);"><i class="fas fa-globe"></i> ${t('رموز الدول المحظورة', 'Blocked Extensions')}</h3>
                            <span style="font-size: 13px; color: var(--text-muted); background:var(--red-dim); padding:4px 10px; border-radius:20px;">${t('حظر دول كاملة', 'Ban Entire Countries')}</span>
                        </div>
                        <div class="field-group">
                            <label class="field-label">${t('رمز الدولة (بدون +)', 'Country Code (without +)')}</label>
                            <div class="input-with-btn">
                                <input type="number" id="newBlockedExtension" placeholder="Ex: 1, 91" onkeypress="if(event.key==='Enter'){event.preventDefault();addBlockedExtension();}">
                                <button type="button" class="btn btn-danger" onclick="addBlockedExtension()"><i class="fas fa-ban"></i> ${t('حظر', 'Ban')}</button>
                            </div>
                        </div>
                        <label class="field-label">${t('رموز الدول المحظورة حالياً', 'Currently Blocked Extensions')}</label>
                        <div id="blockedExtensionsContainer" class="chip-container"></div>
                    </div>

                    <div class="card success whitelist-card">
                        <div class="card-header">
                            <h3 style="color:var(--accent);"><i class="fas fa-star"></i> ${t('القائمة البيضاء (VIP)', 'Whitelist (VIP)')}</h3>
                            <span style="font-size: 13px; color: var(--text-muted); background:var(--accent-dim); padding:4px 10px; border-radius:20px;">${t('تخطي جميع القيود', 'Bypasses all rules')}</span>
                        </div>
                        <div class="field-group">
                            <label class="field-label">${t('رقم الهاتف (بدون +)', 'Phone Number (without +)')}</label>
                            <div class="input-with-btn">
                                <input type="text" id="newWhitelistNumber" placeholder="Ex: 966512345678" onkeypress="if(event.key==='Enter'){event.preventDefault();addWhitelistNumber();}">
                                <button type="button" class="btn btn-primary" onclick="addWhitelistNumber()"><i class="fas fa-check"></i> ${t('إضافة', 'Add')}</button>
                            </div>
                        </div>
                        <label class="field-label">${t('الأرقام الموثوقة حالياً', 'Currently Trusted Numbers')}</label>
                        <div id="whitelistContainer" class="chip-container"></div>

                        <div class="toggle-row green" style="margin-top:20px; margin-bottom:0;">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" id="enableWhitelist" ${config.enableWhitelist ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="toggle-label green">
                                    ${t('تفعيل نظام القائمة البيضاء', 'Enable Whitelist System')}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="card info" style="border-color:rgba(64,196,255,0.4);">
                        <div class="card-header"><h3 style="color:var(--blue);"><i class="fas fa-user-shield"></i> ${t('مزامنة مشرفي المجموعات', 'Admin Whitelist Sync')}</h3></div>
                        <p style="font-size:13px; color:var(--text-muted); margin-bottom:14px; line-height:1.8;">${t('يضيف جميع مشرفي المجموعات (التي يديرها البوت) إلى القائمة البيضاء تلقائياً.', 'Automatically adds admins from bot-managed groups to the whitelist.')}</p>
                        <div class="field-row" style="align-items:end; margin-bottom:10px;">
                            <div class="field-group" style="margin-bottom:0;">
                                <label class="field-label">${t('الفاصل بالدقائق', 'Interval (minutes)')}</label>
                                <input type="number" id="adminWhitelistSyncIntervalMinutes" min="1" step="1" value="60">
                            </div>
                            <button type="button" id="saveAdminWhitelistSyncScheduleBtn" class="btn btn-blue" onclick="saveAdminWhitelistSyncSchedule()" style="height:44px;">
                                <i class="fas fa-save"></i> ${t('حفظ', 'Save')}
                            </button>
                        </div>
                        <div class="toggle-row blue" style="margin-bottom:12px;">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" id="adminWhitelistSyncEnabled"><span class="slider"></span></label>
                                <div class="toggle-label blue">${t('تفعيل الجدولة التلقائية', 'Enable automatic schedule')}</div>
                            </div>
                        </div>
                        <button type="button" id="runAdminWhitelistSyncBtn" class="btn btn-blue" style="width:100%; justify-content:center;" onclick="runAdminWhitelistSyncNow()">
                            <i class="fas fa-play"></i> ${t('تشغيل المزامنة الآن', 'Run Sync Now')}
                        </button>
                    </div>
                    </div>



                </div>
            </div>

            <div class="page" id="page-general">
                <div class="page-header">
                    <h2><i class="fas fa-cog"></i> ${t('الإعدادات العامة', 'General Settings')}</h2>
                    <p>${t('تطبّق على جميع المجموعات التي لا تملك إعدادات مخصصة', 'Applies to all groups without custom settings')}</p>
                </div>

                <div class="card-grid general-top-grid">
                    <div class="card general-top-card" style="margin-bottom:0;">
                        <div class="card-header"><h3><i class="fas fa-users"></i> ${t('مجموعة الإدارة الافتراضية', 'Default Admin Group')}</h3></div>
                        <div class="field-group" id="defaultAdminGroupContainer">
                            <label class="field-label">${t('اختر المجموعة لتلقي التنبيهات', 'Select Group for Alerts')}</label>
                        </div>
                    </div>

                    <div class="card general-top-card" style="margin-bottom:0; border-color:rgba(100,220,150,0.35); background:linear-gradient(160deg,rgba(100,220,150,0.05) 0,var(--card-bg) 58%); position:relative; overflow:hidden;">
                    <style>
                        @keyframes safePulse {
                            0%,100% { box-shadow: 0 0 0 0 rgba(100,220,150,0.55); }
                            50%      { box-shadow: 0 0 0 8px rgba(100,220,150,0); }
                        }
                        .general-top-grid { align-items: stretch; margin-bottom: 20px; }
                        .general-top-card { display: flex; flex-direction: column; }
                        .general-top-card .field-group { margin-bottom: 0; }
                        #defaultWordsContainer { max-height: 160px; gap: 8px; }
                        #defaultWordsContainer .chip { padding: 5px 10px; font-size: 13px; }
                        #safeMode + .slider { transition: background 0.35s ease, box-shadow 0.35s ease !important; }
                        #safeMode:not(:checked) + .slider { animation: safePulse 1.8s ease-in-out infinite; }
                    </style>

                    <div style="display:flex;align-items:center;gap:10px;background:linear-gradient(90deg,rgba(255,171,64,0.16),rgba(255,171,64,0.03));border:1px solid rgba(255,171,64,0.35);border-radius:10px;padding:10px 14px;margin-bottom:14px;">
                        <i class="fas fa-exclamation-triangle" style="color:var(--orange);font-size:18px;flex-shrink:0;"></i>
                        <div>
                            <strong style="color:#ffd08a;font-size:14px;">${t('يُنصح بشدة بتفعيله', '⚠️ Strongly Recommended')}</strong>
                            <div style="font-size:12px;color:var(--text);opacity:.88;margin-top:2px;">${t('تشغيل البوت بدون هذا الوضع يزيد من احتمالية حظر حسابك من واتساب', 'Running the bot without Safe Mode significantly increases the risk of your WhatsApp account being banned')}</div>
                        </div>
                    </div>

                    <div class="card-header" style="padding-bottom:14px;">
                        <h3 style="color:#64dc96;"><i class="fas fa-user-shield"></i> ${t('الوضع الآمن (Safe Mode)', 'Safe Mode')}</h3>
                        <span style="font-size:12px; background:rgba(100,220,150,0.15); color:#64dc96; border:1px solid rgba(100,220,150,0.4); padding:3px 12px; border-radius:20px; font-weight:700;">${t('حماية من الحظر', 'Anti-Ban')}</span>
                    </div>
                    <div class="toggle-row" style="border-color:rgba(100,220,150,0.35); background:rgba(100,220,150,0.07); margin-bottom:16px; padding:14px 18px; border-radius:12px;">
                        <div class="toggle-left" style="gap:16px;">
                            <label class="switch" style="flex-shrink:0;"><input type="checkbox" id="safeMode" ${config.safeMode ? 'checked' : ''}><span class="slider"></span></label>
                            <div class="toggle-label" style="color:#64dc96;">
                                ${t('تفعيل الوضع الآمن', 'Enable Safe Mode')}
                                <small>${t('تأخير عشوائي 10–60 ثانية قبل كل إجراء لتجنب كشف البوت', 'Random 10–60s delay before each action to avoid bot detection')}</small>
                            </div>
                        </div>
                        ${config.safeMode
            ? `<span style="font-size:12px;background:rgba(100,220,150,0.15);color:#64dc96;border:1px solid rgba(100,220,150,0.3);padding:3px 10px;border-radius:20px;font-weight:700;"><i class="fas fa-check"></i> ${t('مفعّل', 'Active')}</span>`
            : `<span style="font-size:12px;background:rgba(255,82,82,0.12);color:var(--red);border:1px solid rgba(255,82,82,0.3);padding:3px 10px;border-radius:20px;font-weight:700;"><i class="fas fa-times"></i> ${t('معطّل', 'Off')}</span>`
        }
                    </div>
                    <div style="font-size:12px; color:var(--text-muted); line-height:1.9; padding:11px 12px; background:var(--input-bg); border-radius:10px; border:1px solid var(--card-border);">
                        <div style="margin-bottom:6px;"><i class="fas fa-times-circle" style="color:var(--red);"></i> <strong style="color:var(--text);">${t('إيقاف:', 'Off:')}</strong> ${t('إجراءات فورية — أسرع ولكن تُعرّض حسابك للحظر', 'Instant actions — faster but risks getting your account banned')}</div>
                        <div style="margin-bottom:6px;"><i class="fas fa-shield-alt" style="color:#64dc96;"></i> <strong style="color:var(--text);">${t('تشغيل:', 'On:')}</strong> ${t('تأخير عشوائي 10–60 ث — يحاكي سلوك الإنسان ويقلل خطر الحظر بشكل كبير', 'Random 10–60s delay — mimics human behaviour, greatly reduces ban risk')}</div>
                        <div><i class="fas fa-info-circle" style="color:var(--blue);"></i> <strong style="color:var(--text);">${t('يؤثر على:', 'Covers:')}</strong> ${t('الطرد، الحذف، التصويت، الإبلاغ، رسائل الترحيب', 'Kicks, deletes, polls, reports, welcome messages')}</div>
                    </div>
                </div>
                </div>


                <div class="card-grid">
                    <div class="card">
                        <div class="card-header"><h3><i class="fas fa-filter"></i> ${t('فلتر الكلمات الممنوعة', 'Forbidden Word Filter')}</h3></div>
                        <div class="toggle-row" style="margin-bottom:18px;">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" id="enableWordFilter" ${config.enableWordFilter ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="toggle-label">${t('تفعيل فلتر الكلمات', 'Enable Word Filter')}<small>${t('حذف فوري عند رصد أي كلمة ممنوعة', 'Instant delete on detecting forbidden words')}</small></div>
                            </div>
                        </div>
                        <div class="field-group">
                            <label class="field-label">${t('الكلمات الممنوعة الافتراضية', 'Default Forbidden Words')}</label>
                            <div class="input-with-btn">
                                <input type="text" id="newDefaultWord" placeholder="${t('أدخل الكلمة الممنوعة...', 'Enter forbidden word...')}" onkeypress="if(event.key==='Enter'){event.preventDefault();addDefaultWord();}">
                                <button type="button" class="btn btn-primary" onclick="addDefaultWord()"><i class="fas fa-plus"></i> ${t('إضافة', 'Add')}</button>
                            </div>
                            <div id="defaultWordsContainer" class="chip-container"></div>
                        </div>
                    </div>
                    <div class="card">
                        <div class="card-header"><h3><i class="fas fa-bolt"></i> ${t('الإجراء التلقائي', 'Automatic Action')}</h3></div>
                        <div class="toggle-row pink">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" id="autoAction" ${config.autoAction ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="toggle-label pink">
                                    ${t('الحذف والإبلاغ المباشر', 'Direct Delete & Report')}
                                    <small>${t('تخطي تصويت الإدارة عند رصد المخالفات', 'Skip admin poll upon detecting violations')}</small>
                                </div>
                            </div>
                        </div>
                        <div class="toggle-row blue" style="margin-top:12px;">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" id="enableJoinProfileScreening" ${config.enableJoinProfileScreening ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="toggle-label blue">
                                    ${t('فحص الملف الشخصي عند الانضمام', 'Join Profile Screening')}
                                    <small>${t('يفحص الاسم/النبذة للطلبات والأعضاء الجدد باستخدام فلتر الكلمات وAI عند تفعيلهما', 'Checks name/bio for join requests and new members using Word Filter and AI when enabled')}</small>
                                </div>
                            </div>
                        </div>
                        <div style="margin-top:20px; padding:16px; background:var(--input-bg); border-radius:10px; border:1px solid var(--card-border);">
                            <div style="font-size:13px; color:var(--text-muted); line-height:2;">
                                <div><i class="fas fa-circle text-danger" style="color:var(--red); font-size: 10px; margin-inline-end: 5px;"></i> <strong style="color:var(--text);">${t('مفعّل:', 'Enabled:')}</strong> ${t('حذف فوري + طرد تلقائي', 'Instant delete + auto kick')}</div>
                                <div><i class="fas fa-circle text-warning" style="color:var(--orange); font-size: 10px; margin-inline-end: 5px;"></i> <strong style="color:var(--text);">${t('معطّل:', 'Disabled:')}</strong> ${t('حذف + تصويت للإدارة', 'Delete + admin poll')}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="page" id="page-spam">
                <div class="page-header">
                    <h2><i class="fas fa-shield-alt"></i> ${t('مكافحة الإزعاج', 'Anti-Spam')}</h2>
                    <p>${t('رصد الرسائل المتكررة خلال نافذة 15 ثانية', 'Monitor repeated messages within a 15-second window')}</p>
                </div>

                <div class="card warning" style="max-width:700px;">
                    <div class="toggle-row warning" style="margin-bottom:0; border-radius:10px;">
                        <div class="toggle-left">
                            <label class="switch">
                                <input type="checkbox" id="enableAntiSpam" ${config.enableAntiSpam ? 'checked' : ''} onchange="toggleGroupPanel('global', 'spam', this.checked)">
                                <span class="slider"></span>
                            </label>
                            <div class="toggle-label warning">
                                ${t('تفعيل نظام Anti-Spam', 'Enable Anti-Spam System')}
                                <small>${t('مراقبة معدل إرسال كل مستخدم خلال نافذة 15 ثانية', 'Monitor per-user send rate within 15 secs')}</small>
                            </div>
                        </div>
                    </div>

                    <div id="group_spam_panel_global" style="overflow: hidden; max-height: ${config.enableAntiSpam ? '800px' : '0px'}; opacity: ${config.enableAntiSpam ? '1' : '0'}; transition: max-height 0.45s ease, opacity 0.35s ease, margin-top 0.35s ease; margin-top: ${config.enableAntiSpam ? '20px' : '0px'};">
                        <div style="border-top: 1px dashed rgba(255,171,64,0.3); padding-top: 20px;">
                            <div class="field-row" style="margin-bottom:20px;">
                                <div class="field-group" style="margin-bottom:0;">
                                    <label class="field-label">${t('الإجراء عند الرصد', 'Action on Detection')}</label>
                                    <select id="spamAction">
                                        <option value="poll" ${config.spamAction === 'poll' ? 'selected' : ''}><i class="fas fa-poll"></i> ${t('تصويت للإدارة', 'Admin Poll')}</option>
                                        <option value="auto" ${config.spamAction === 'auto' ? 'selected' : ''}><i class="fas fa-hammer"></i> ${t('طرد تلقائي وحظر', 'Auto Kick & Ban')}</option>
                                    </select>
                                </div>
                                <div class="field-group" style="margin-bottom:0;">
                                    <label class="field-label">${t('حد تكرار نفس النص', 'Duplicate Text Limit')}</label>
                                    <input type="number" id="spamDuplicateLimit" value="${config.spamDuplicateLimit}" min="2" max="15" placeholder="3">
                                </div>
                            </div>
                            <label class="field-label" style="margin-bottom:12px;"><i class="fas fa-stopwatch"></i> ${t('حدود كل نوع خلال 15 ثانية', 'Limits per media type (15s)')}</label>
                            <p style="font-size:13px; color:var(--text-muted); margin-bottom:14px;">${t('فعّل النوع المراد مراقبته، ثم حدد الحد الأقصى للرسائل المسموح بها', 'Check the type to monitor, then set max allowed messages')}</p>
                            <div class="limit-grid">
                                ${mediaTypesMeta.map(tData => `
                                <div class="limit-item">
                                    <input type="checkbox" id="global_spam_check_${tData.id}" value="${tData.id}" ${config.spamTypes.includes(tData.id) ? 'checked' : ''}>
                                    <span>${tData.icon} ${tData.name}</span>
                                    <input type="number" id="global_spam_limit_${tData.id}" value="${config.spamLimits[tData.id] || 5}" min="1">
                                </div>`).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="page" id="page-media">
                <div class="page-header">
                    <h2><i class="fas fa-filter"></i> ${t('فلتر الوسائط', 'Media Filter')}</h2>
                    <p>${t('منع قطعي لأنواع محددة — الحذف يحدث فوراً بغض النظر عن أي إعداد آخر', 'Absolute ban for specific media types — deleted instantly regardless of other settings')}</p>
                </div>
                <div class="card-grid">
                    <div class="card danger">
                        <div class="card-header"><h3 style="color:var(--red);"><i class="fas fa-folder-minus"></i> ${t('اختر الأنواع الممنوعة', 'Select Blocked Types')}</h3></div>
                        <p style="font-size:14px; color:var(--text-muted); margin-bottom:18px;">${t('أي رسالة من هذه الأنواع ستُحذف تلقائياً ودون استثناء.', 'Any message of these types will be deleted automatically without exception.')}</p>
                        <div class="cb-group" id="globalBlockedTypes" style="gap:12px;">
                            ${mediaTypesMeta.map(tData => `
                            <label class="cb-label" style="flex:1; min-width:120px; justify-content:center; padding:12px;">
                                <input type="checkbox" value="${tData.id}" ${config.blockedTypes.includes(tData.id) ? 'checked' : ''}> ${tData.icon} ${tData.name}
                            </label>`).join('')}
                        </div>
                    </div>
                    <div class="card danger">
                        <div class="card-header"><h3 style="color:var(--red);"><i class="fas fa-gavel"></i> ${t('الإجراء عند الرصد', 'Action on Detection')}</h3></div>
                        <div class="field-group">
                            <label class="field-label">${t('ماذا يفعل البوت عند إرسال نوع ممنوع؟', 'What should the bot do when a blocked type is sent?')}</label>
                            <select id="globalBlockedAction" style="font-size:15px; padding:14px;">
                                <option value="delete" ${config.blockedAction === 'delete' ? 'selected' : ''}>${t('حذف الرسالة فقط (بصمت)', 'Delete Message Only (Silent)')}</option>
                                <option value="poll" ${config.blockedAction === 'poll' ? 'selected' : ''}>${t('حذف + فتح تصويت للإدارة', 'Delete + Open Admin Poll')}</option>
                                <option value="auto" ${config.blockedAction === 'auto' ? 'selected' : ''}>${t('حذف + طرد تلقائي وحظر', 'Delete + Auto Kick & Ban')}</option>
                            </select>
                        </div>
                        <div style="margin-top:16px; padding:16px; background:var(--red-dim); border-radius:10px; border:1px solid rgba(255,82,82,0.2);">
                            <div style="font-size:13px; color:var(--text-muted); line-height:2.2;">
                                <div><i class="fas fa-trash"></i> <strong style="color:var(--text);">${t('حذف فقط:', 'Delete Only:')}</strong> ${t('صامت، لا يعلم المرسل', 'Silent, sender is unaware')}</div>
                                <div><i class="fas fa-poll"></i> <strong style="color:var(--text);">${t('تصويت:', 'Poll:')}</strong> ${t('تنبيه الإدارة لاتخاذ قرار', 'Alert admins to decide')}</div>
                                <div><i class="fas fa-hammer"></i> <strong style="color:var(--text);">${t('طرد تلقائي:', 'Auto Kick:')}</strong> ${t('أقوى إجراء، حظر فوري', 'Strictest action, instant ban')}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="page" id="page-ai">
                <div class="page-header">
                    <h2><i class="fas fa-brain"></i> ${t('المشرف الذكي (AI)', 'AI Moderator')}</h2>
                    <p>${t('تحليل المحتوى باستخدام نموذج Ollama LLM محلي', 'Analyze content using a local Ollama LLM model')}</p>
                </div>
                <div class="card-grid">
                    <div class="card info">
                        <div class="card-header">
                            <h3 style="color:var(--blue);"><i class="fas fa-plug"></i> ${t('تفعيل الذكاء الاصطناعي', 'Enable AI')}</h3>
                            <button type="button" class="btn btn-blue btn-sm" onclick="openOllamaModal()"><i class="fas fa-cog"></i> ${t('إعداد الخادم', 'Server Setup')}</button>
                        </div>
                        <div class="toggle-row blue" style="margin-bottom:12px;">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" id="enableAIFilter" ${config.enableAIFilter ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="toggle-label blue">${t('تحليل النصوص بالـ AI', 'AI Text Analysis')}<small>${t('فحص كل رسالة نصية قبل السماح بها', 'Scan every text message before allowing')}</small></div>
                            </div>
                        </div>
                        <div class="toggle-row purple">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" id="enableAIMedia" ${config.enableAIMedia ? 'checked' : ''}><span class="slider"></span></label>
                                <div class="toggle-label purple">${t('تحليل الصور (Vision AI)', 'Image Analysis (Vision)')}<small>${t('يتطلب نموذجاً يدعم Vision مثل llava', 'Requires a vision-capable model like llava')}</small></div>
                            </div>
                        </div>
                    </div>
                    <div class="card" id="aiPromptContainer">
                        <div class="card-header"><h3><i class="fas fa-file-alt"></i> ${t('تعليمات الذكاء الاصطناعي', 'AI Prompt Instructions')}</h3></div>
                        <div class="field-group">
                            <label class="field-label">${t('صف المحتوى الممنوع للنموذج', 'Describe forbidden content to the model')}</label>
                            <textarea id="aiPromptText" rows="6" style="font-size:14px; line-height:1.8;">${config.aiPrompt}</textarea>
                        </div>
                        <div class="field-group">
                            <label class="field-label">${t('كلمات التشغيل (كلمات تشير إلى المخالفة)', 'Trigger Words (words indicating violation)')}</label>
                            <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 10px;">${t('عندما يجيب النموذج بأي من هذه الكلمات، سيتم حذف الرسالة', 'When the model responds with any of these words, the message will be deleted')}</p>
                            <div class="input-with-btn">
                                <input type="text" id="newAITriggerWord" placeholder="${t('مثال: نعم أو انتهاك', 'Example: نعم or violation')}" onkeypress="if(event.key==='Enter'){event.preventDefault();addAITriggerWord();}">
                                <button type="button" class="btn btn-primary" onclick="addAITriggerWord()"><i class="fas fa-plus"></i> ${t('إضافة', 'Add')}</button>
                            </div>
                            <div id="aiTriggerWordsContainer" class="chip-container"></div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="page" id="page-global-qa">
                <div class="page-header">
                    <h2><i class="fas fa-comments"></i> ${t('الأسئلة والأجوبة العامة', 'Global Q&A')}</h2>
                    <p>${t('قاعدة أسئلة واحدة يمكن تطبيقها على كل المجموعات أو المجموعات المخصصة التي تختارها', 'One Q&A knowledge base that can be applied to all groups or selected custom groups')}</p>
                </div>

                <div class="card info" style="max-width:900px;">
                    <div class="toggle-row blue" style="margin-bottom:0;border-radius:10px;">
                        <div class="toggle-left">
                            <label class="switch"><input type="checkbox" id="globalQAEnabled" ${config.globalQAEnabled ? 'checked' : ''}><span class="slider"></span></label>
                            <div class="toggle-label blue">${t('تفعيل Q&A العام', 'Enable Global Q&A')}<small>${t('عند التفعيل: يعمل للمجموعات غير المخصصة تلقائياً، ويمكن تفعيله للمجموعات المخصصة من إعداداتها', 'When enabled: applies to non-custom groups automatically, and to custom groups when opted in')}</small></div>
                        </div>
                    </div>
                </div>

                <div class="card-grid" style="align-items:start;">
                    <div class="card" style="margin-bottom:0;">
                        <div class="card-header"><h3><i class="fas fa-plus-circle"></i> ${t('إضافة / تعديل زوج سؤال وجواب', 'Add / Edit Q&A Pair')}</h3></div>

                        <div class="sub-panel blue" style="margin-bottom:16px;">
                            <h4 style="color:var(--blue);">${t('مرجع الحقول الديناميكية', 'Dynamic Fields Reference')}</h4>
                            <div style="font-size:13px;color:var(--text-muted);line-height:1.8;">
                                <div><strong style="color:var(--blue);">{eventdate}</strong> - ${t('الحدث الأساسي (الأول في القائمة)', 'Primary event/deadline (first in list)')}</div>
                                <div><strong style="color:var(--blue);">{eventdate:Label}</strong> - ${t('حدث معين حسب العنوان', 'Specific event by label')}</div>
                                <div><strong style="color:var(--blue);">{user}</strong> - ${t('اسم المرسل', 'Sender username')}</div>
                            </div>
                        </div>

                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                            <label class="field-label" style="margin-bottom:0;">${t('إدارة الأحداث والمواعيد', 'Manage Events/Deadlines')}</label>
                            <button type="button" class="btn btn-primary btn-sm" onclick="addGlobalQAEventDate()"><i class="fas fa-plus"></i> ${t('إضافة حدث', 'Add Event')}</button>
                        </div>
                        <div id="globalQAEventDatesContainer" style="margin-bottom: 20px;"></div>

                        <div class="field-row" style="margin-bottom:16px;">
                            <div class="field-group" style="margin-bottom:0;">
                                <label class="field-label" style="margin-bottom:4px;">${t('تاريخ الحدث القديم (لحقل {eventdate})', 'Legacy Event Date (for {eventdate})')}</label>
                                <input type="date" id="globalQAEventDateInput" style="color-scheme: dark; font-family: var(--font);">
                            </div>
                            <div class="field-group" style="margin-bottom:0;">
                                <label class="field-label" style="margin-bottom:4px;">${t('لغة عرض الأيام المتبقية', 'Days-Left Language')}</label>
                                <select id="globalQALanguageInput">
                                    <option value="ar">${t('العربية', 'Arabic')}</option>
                                    <option value="en">English</option>
                                </select>
                            </div>
                        </div>

                        <label class="field-label">${t('أضف صيغ السؤال', 'Add Question Variants')}</label>
                        <div class="field-group" style="margin-bottom:10px;">
                            <input type="text" id="globalQAQuestionInput" placeholder="${t('أدخل صيغة سؤال...', 'Enter a question variant...')}" onkeypress="if(event.key==='Enter'){event.preventDefault();addGlobalQAQuestion();}">
                            <button type="button" class="btn btn-primary btn-full" style="margin-top:10px;" onclick="addGlobalQAQuestion()"><i class="fas fa-plus"></i> ${t('إضافة صيغة', 'Add Variant')}</button>
                            <div class="chip-container" id="globalQAQuestionsContainer" style="min-height:40px;"></div>
                        </div>

                        <label class="field-label" style="margin-top:14px;">${t('الإجابة', 'Answer')}</label>
                        <div class="field-group" style="margin-bottom:10px;">
                            <textarea id="globalQAAnswerInput" rows="4" placeholder="${t('استخدم {date} و {eventdate} و {user} داخل النص إن أردت', 'You can use {date}, {eventdate}, and {user} placeholders')}" style="margin-bottom:10px;" oninput="updateGlobalQACurrentAnswer(this.value)" onchange="updateGlobalQACurrentAnswer(this.value)"></textarea>
                            <button type="button" id="saveGlobalQABtn" class="btn btn-full" onclick="saveGlobalQA()" style="background:var(--accent-dim);border-color:rgba(0,230,118,0.4);color:var(--accent);font-weight:700;"><i class="fas fa-save"></i> ${t('حفظ زوج س و ج', 'Save Q&A Pair')}</button>
                        </div>

                        <div class="sub-panel" style="margin-bottom:16px;border-color:rgba(100,220,150,0.3);background:rgba(100,220,150,0.04);">
                            <h4 style="color:#64dc96;margin-bottom:12px;"><i class="fas fa-paperclip"></i> ${t('إرفاق وسائط بهذه الإجابة', 'Attach Media to This Answer')}</h4>
                            <p style="font-size:12px;color:var(--text-muted);margin-bottom:14px;">${t('اختر ملفاً ليُرفق تلقائياً عند حفظ الزوج. سيرسل البوت الملف مع نص الإجابة كتعليق.', 'Select a file to automatically attach it when saving the Q&A pair. The bot will send the file + answer caption.')}</p>
                            <div id="globalQA_media_selected" style="display:none;align-items:center;gap:10px;background:rgba(100,220,150,0.1);border:1px solid rgba(100,220,150,0.3);border-radius:8px;padding:10px 14px;margin-bottom:12px;">
                                <i class="fas fa-paperclip" style="color:#64dc96;"></i>
                                <span id="globalQA_media_selected_name" style="font-size:13px;color:#64dc96;flex:1;"></span>
                                <button type="button" onclick="clearGlobalQAMedia()" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:16px;">×</button>
                            </div>
                            <div style="display:flex;gap:10px;margin-bottom:14px;">
                                <label style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;background:var(--input-bg);border:1.5px dashed rgba(100,220,150,0.4);border-radius:10px;cursor:pointer;font-size:13px;color:var(--text-muted);transition:all 0.2s;" onmouseover="this.style.borderColor='#64dc96'" onmouseout="this.style.borderColor='rgba(100,220,150,0.4)'">
                                    <i class="fas fa-cloud-upload-alt" style="color:#64dc96;font-size:18px;"></i>
                                    <span>${currentLang==='en'?'Click to upload a file':'انقر لرفع ملف'}</span>
                                    <input type="file" id="globalQA_file_input" style="display:none;" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar" onchange="uploadGlobalQAMedia(this)">
                                </label>
                            </div>
                            <div id="globalQA_upload_status" style="display:none;font-size:12px;color:var(--text-muted);margin-bottom:10px;"></div>
                            <div id="globalQA_media_grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;"></div>
                        </div>
                    </div>

                    <div class="card" style="margin-bottom:0;">
                        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
                            <h3><i class="fas fa-list"></i> ${t('الأزواج المحفوظة', 'Saved Pairs')}</h3>
                            <button type="button" class="btn btn-ghost btn-sm" onclick="pasteGlobalQA()"><i class="fas fa-paste"></i> ${t('لصق س و ج', 'Paste Q&A')}</button>
                        </div>
                        <div id="globalQAList"></div>
                    </div>
                </div>
            </div>

            <div class="page" id="page-groups">

                <div id="groupsListView">
                    <div class="page-header" style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <div>
                            <h2><i class="fas fa-users-cog"></i> ${t('المجموعات المخصصة', 'Custom Groups')}</h2>
                            <p>${t('إعدادات مخصصة لكل مجموعة — تتجاوز الإعدادات العامة', 'Custom settings per group — overrides global settings')}</p>
                        </div>
                        <button type="button" class="btn btn-blue" onclick="addGroup()"><i class="fas fa-plus"></i> ${t('إضافة مجموعة', 'Add Group')}</button>
                    </div>
                    <div id="groupsContainer"></div>
                </div>

                <div id="groupsDetailView" style="display:none;">
                    <div class="group-detail-bar">
                        <button type="button" class="btn btn-ghost" onclick="closeGroupDetail()">
                            <i class="fas fa-arrow-${lang === 'en' ? 'left' : 'right'}"></i> ${t('رجوع', 'Back')}
                        </button>
                        <div class="group-detail-identity">
                            <div class="group-detail-avatar" id="detailGroupAvatar"></div>
                            <div>
                                <div style="font-size:18px; font-weight:700;" id="detailGroupName"></div>
                                <span class="group-id-badge" id="detailGroupId"></span>
                            </div>
                        </div>
                        <button type="button" class="btn btn-danger btn-sm" id="detailDeleteBtn"><i class="fas fa-trash"></i> ${t('حذف', 'Delete')}</button>
                    </div>
                    <div id="groupDetailBody"></div>
                </div>

            </div>

            <div class="page" id="page-import-export">
                <div class="page-header">
                    <h2><i class="fas fa-exchange-alt"></i> ${t('استيراد/تصدير البيانات', 'Import/Export Dataset')}</h2>
                    <p>${t('قم بتصدير واستيراد إعدادات البوت والقوائم المختلفة', 'Export and import bot settings and lists')}</p>
                </div>

                <div class="card-grid">
                    <div class="card">
                        <div class="card-header">
                            <h3><i class="fas fa-download"></i> ${t('تصدير البيانات', 'Export Data')}</h3>
                        </div>
                        <div class="field-group">
                            <label class="field-label">${t('اختر البيانات المراد تصديرها', 'Select data to export')}</label>
                            <div class="cb-group" id="exportOptions">
                                <label class="cb-label">
                                    <input type="checkbox" id="export_global_settings" checked>
                                    ${t('الإعدادات العامة', 'Global Settings')}
                                </label>
                                <label class="cb-label">
                                    <input type="checkbox" id="export_llm_settings" checked>
                                    ${t('إعدادات الذكاء الاصطناعي', 'AI Settings')}
                                </label>
                                <label class="cb-label">
                                    <input type="checkbox" id="export_blacklist" checked>
                                    ${t('القائمة السوداء', 'Blacklist')}
                                </label>
                                <label class="cb-label">
                                    <input type="checkbox" id="export_whitelist" checked>
                                    ${t('القائمة البيضاء', 'Whitelist')}
                                </label>
                                <label class="cb-label">
                                    <input type="checkbox" id="export_blocked_extensions" checked>
                                    ${t('الرموز المحظورة', 'Blocked Extensions')}
                                </label>
                                <label class="cb-label">
                                    <input type="checkbox" id="export_whatsapp_groups" checked>
                                    ${t('مجموعات واتساب', 'WhatsApp Groups')}
                                </label>
                                <label class="cb-label">
                                    <input type="checkbox" id="export_custom_groups" checked>
                                    ${t('الإعدادات المخصصة للمجموعات', 'Custom Group Settings')}
                                </label>
                                <label class="cb-label">
                                    <input type="checkbox" id="export_media" checked>
                                    ${t('ملفات الوسائط', 'Media Files')}
                                </label>
                            </div>
                        </div>
                        <button type="button" class="btn btn-primary btn-full" onclick="exportData()">
                            <i class="fas fa-download"></i> ${t('تصدير الآن', 'Export Now')}
                        </button>
                    </div>

                    <div class="card">
                        <div class="card-header">
                            <h3><i class="fas fa-upload"></i> ${t('استيراد البيانات', 'Import Data')}</h3>
                        </div>
                        <div class="field-group">
                            <label class="field-label">${t('حدد ملف الاستيراد', 'Select import file')}</label>
                            <input type="file" id="importFile" accept=".json" style="cursor:pointer;">
                        </div>
                        <div class="field-group">
                            <label class="field-label">${t('اختر البيانات المراد استيرادها', 'Select data to import')}</label>
                            <div class="cb-group" id="importOptions">
                                <label class="cb-label">
                                    <input type="checkbox" id="import_global_settings" checked>
                                    ${t('الإعدادات العامة', 'Global Settings')}
                                </label>
                                <label class="cb-label">
                                    <input type="checkbox" id="import_llm_settings" checked>
                                    ${t('إعدادات الذكاء الاصطناعي', 'AI Settings')}
                                </label>
                                <label class="cb-label">
                                    <input type="checkbox" id="import_blacklist" checked>
                                    ${t('القائمة السوداء', 'Blacklist')}
                                </label>
                                <label class="cb-label">
                                    <input type="checkbox" id="import_whitelist" checked>
                                    ${t('القائمة البيضاء', 'Whitelist')}
                                </label>
                                <label class="cb-label">
                                    <input type="checkbox" id="import_blocked_extensions" checked>
                                    ${t('الرموز المحظورة', 'Blocked Extensions')}
                                </label>
                                <label class="cb-label">
                                    <input type="checkbox" id="import_whatsapp_groups" checked>
                                    ${t('مجموعات واتساب', 'WhatsApp Groups')}
                                </label>
                                <label class="cb-label">
                                    <input type="checkbox" id="import_custom_groups" checked>
                                    ${t('الإعدادات المخصصة للمجموعات', 'Custom Group Settings')}
                                </label>
                            </div>
                        </div>
                        <div class="sub-panel" style="margin-top:16px;">
                            <h4><i class="fas fa-exclamation-circle"></i> ${t('خيارات متقدمة', 'Advanced Options')}</h4>
                            <label class="cb-label" style="margin-bottom:10px;">
                                <input type="checkbox" id="import_blacklist_clear">
                                ${t('مسح القائمة السوداء الحالية قبل الاستيراد', 'Clear current blacklist before import')}
                            </label>
                            <label class="cb-label" style="margin-bottom:10px;">
                                <input type="checkbox" id="import_whitelist_clear">
                                ${t('مسح القائمة البيضاء الحالية قبل الاستيراد', 'Clear current whitelist before import')}
                            </label>
                            <label class="cb-label" style="margin-bottom:10px;">
                                <input type="checkbox" id="import_blocked_extensions_clear">
                                ${t('مسح الرموز المحظورة الحالية قبل الاستيراد', 'Clear current blocked extensions before import')}
                            </label>
                            <label class="cb-label">
                                <input type="checkbox" id="import_custom_groups_clear">
                                ${t('مسح إعدادات المجموعات المخصصة الحالية قبل الاستيراد', 'Clear current custom group settings before import')}
                            </label>
                            <label class="cb-label" style="margin-top:10px;">
                                <input type="checkbox" id="import_media" checked>
                                ${t('استيراد ملفات الوسائط (إن وجدت)', 'Import Media Files (if any)')}
                            </label>
                        </div>
                        <button type="button" class="btn btn-primary btn-full" onclick="importData()" style="margin-top:14px;">
                            <i class="fas fa-upload"></i> ${t('استيراد الآن', 'Import Now')}
                        </button>
                    </div>
                </div>
            </div>

            <div class="page" id="page-about">
                <style>
                    #page-about {
                        padding: 0 !important;
                        background: var(--bg);
                        color: var(--text);
                        font-family: inherit;
                    }
                    #page-about .about-hero {
                        position: relative;
                        padding: 40px 20px;
                        background: linear-gradient(135deg, var(--card-bg) 0%, var(--bg) 100%);
                        border-bottom: 1px solid var(--card-border);
                        text-align: center;
                        overflow: hidden;
                    }
                    #page-about .about-hero-content {
                        position: relative;
                        z-index: 1;
                        max-width: 800px;
                        margin: 0 auto;
                    }
                    #page-about .hero-logo {
                        font-size: 56px;
                        color: var(--accent);
                        margin-bottom: 16px;
                    }
                    #page-about .hero-title {
                        font-size: 36px;
                        font-weight: 800;
                        margin: 0 0 12px 0;
                        background: linear-gradient(90deg, var(--text) 0%, var(--text-muted) 100%);
                        -webkit-background-clip: text;
                        -webkit-text-fill-color: transparent;
                        letter-spacing: -0.5px;
                    }
                    #page-about .hero-description {
                        font-size: 16px;
                        color: var(--text-muted);
                        margin: 0 0 24px 0;
                        line-height: 1.5;
                    }
                    #page-about .badge-container {
                        display: flex;
                        gap: 10px;
                        justify-content: center;
                        flex-wrap: wrap;
                    }
                    #page-about .status-badge {
                        padding: 6px 14px;
                        border-radius: 30px;
                        font-size: 13px;
                        font-weight: 600;
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        background: var(--card-bg);
                        border: 1px solid var(--card-border);
                    }
                    #page-about .status-badge.accent { border-color: rgba(0,200,83,0.3); color: var(--accent); background: var(--accent-dim); }
                    #page-about .status-badge.blue { border-color: rgba(64,196,255,0.3); color: var(--blue); background: rgba(64,196,255,0.1); }
                    
                    #page-about .about-container {
                        max-width: 1000px;
                        margin: 0 auto;
                        padding: 30px 20px;
                        display: flex;
                        flex-direction: column;
                        gap: 40px;
                    }
                    
                    #page-about .section-header {
                        margin-bottom: 20px;
                        border-bottom: 1px solid var(--card-border);
                        padding-bottom: 10px;
                    }
                    #page-about .section-header h2 {
                        font-size: 22px;
                        color: var(--text);
                        margin: 0;
                        display: flex;
                        align-items: center;
                        gap: 10px;
                    }
                    #page-about .section-header h2 i { color: var(--accent); }
                    
                    #page-about .grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
                    #page-about .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
                    
                    #page-about .info-card {
                        background: var(--card-bg);
                        border: 1px solid var(--card-border);
                        border-radius: 12px;
                        padding: 20px;
                    }
                    #page-about .info-card:hover {
                        border-color: var(--accent);
                    }
                    
                    #page-about .feat-icon {
                        width: 40px;
                        height: 40px;
                        border-radius: 10px;
                        background: var(--accent-dim);
                        color: var(--accent);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 20px;
                        margin-bottom: 12px;
                    }
                    #page-about .feat-title {
                        font-size: 16px;
                        font-weight: 700;
                        color: var(--text);
                        margin-bottom: 6px;
                    }
                    #page-about .feat-desc {
                        font-size: 13px;
                        color: var(--text-muted);
                        line-height: 1.5;
                    }
                    
                    #page-about .tech-pill {
                        background: var(--card-bg);
                        border: 1px solid var(--card-border);
                        padding: 8px 14px;
                        border-radius: 6px;
                        text-align: center;
                        font-weight: 600;
                        font-size: 13px;
                        color: var(--text-muted);
                    }
                    
                    #page-about .req-box {
                        display: flex;
                        justify-content: space-between;
                        padding: 12px 16px;
                        background: var(--card-bg);
                        border: 1px solid var(--card-border);
                        border-radius: 6px;
                    }
                    #page-about .req-label { color: var(--text-muted); font-size: 13px; }
                    #page-about .req-val { color: var(--text); font-weight: 700; font-size: 13px; }
                    
                    #page-about .dev-profile {
                        display: flex;
                        gap: 20px;
                        align-items: flex-start;
                        background: var(--card-bg);
                        border: 1px solid var(--card-border);
                        border-radius: 12px;
                        padding: 20px;
                    }
                    #page-about .dev-avatar {
                        width: 70px;
                        height: 70px;
                        border-radius: 50%;
                        background: var(--bg);
                        border: 2px solid var(--accent);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        overflow: hidden;
                    }
                    #page-about .dev-info { flex: 1; }
                    #page-about .dev-name { font-size: 20px; font-weight: 700; color: var(--text); margin: 0 0 2px 0; }
                    #page-about .dev-handle { font-size: 13px; color: var(--accent); margin: 0 0 10px 0; font-family: monospace; }
                    #page-about .dev-bio { font-size: 14px; color: var(--text-muted); line-height: 1.5; margin: 0 0 16px 0; max-width: 500px; }
                    #page-about .dev-links { display: flex; gap: 10px; flex-wrap: wrap; }
                    #page-about .social-btn {
                        padding: 8px 16px;
                        border-radius: 6px;
                        background: var(--bg);
                        border: 1px solid var(--card-border);
                        color: var(--text);
                        text-decoration: none;
                        font-size: 13px;
                        font-weight: 600;
                        display: inline-flex;
                        align-items: center;
                        gap: 6px;
                    }
                    #page-about .social-btn:hover {
                        border-color: var(--text);
                    }
                    
                    @media (max-width: 900px) {
                        #page-about .grid-3 { grid-template-columns: repeat(2, 1fr); }
                        #page-about .grid-2 { grid-template-columns: 1fr; }
                    }
                    @media (max-width: 600px) {
                        #page-about .grid-3 { grid-template-columns: 1fr; }
                        #page-about .dev-profile { flex-direction: column; align-items: center; text-align: center; }
                        #page-about .dev-links { justify-content: center; }
                    }
                </style>

                <div class="about-hero">
                    <div class="about-hero-content">
                        <div class="hero-logo"><i class="fas fa-shield-alt"></i></div>
                        <h1 class="hero-title">${t('المشرف الآلي', 'WhatsApp Auto Mod')}</h1>
                        <p class="hero-description">${t('نظام إدارة مجموعات واتساب متقدم مع الذكاء الاصطناعي المحلي.', 'Advanced WhatsApp group management with local AI intelligence.')}</p>
                        <div class="badge-container">
                            <span class="status-badge accent"><i class="fas fa-check-circle"></i> ${t('نشط', 'Active')}</span>
                            <span class="status-badge blue"><i class="fas fa-code-branch"></i> v6.6</span>
                            <span class="status-badge"><i class="fab fa-osi"></i> ${t('مفتوح المصدر', 'Open Source')}</span>
                        </div>
                        <div style="margin-top: 28px;">
                            <a href="https://github.com/az2oo1/wa-bot" target="_blank" style="display: inline-flex; align-items: center; gap: 10px; background: var(--text); color: var(--bg); padding: 12px 28px; border-radius: 30px; font-weight: 700; font-size: 15px; text-decoration: none; transition: transform 0.2s ease;">
                                <i class="fab fa-github" style="font-size: 18px;"></i> ${t('المستودع على GitHub', 'View on GitHub')}
                            </a>
                        </div>
                    </div>
                </div>

                <div class="about-container">
                    
                    <section class="overview-section">
                        <div class="info-card" style="text-align: center;">
                            <h3 style="font-size: 18px; color: var(--text); margin-top: 0; margin-bottom: 10px;">${t('عن النظام', 'About the System')}</h3>
                            <p style="font-size: 14px; color: var(--text-muted); line-height: 1.6; max-width: 700px; margin: 0 auto;">
                                ${t('هو نظام آلي ذكي لإدارة مجموعات واتساب يوفر حماية متقدمة من الرسائل غير المرغوبة والمحتوى المخالف. يتضمن تصفية كلمات مستخدمة، حجب الملحقات الخطرة، وإدارة قوائم حظر/سماح. يعمل بذكاء اصطناعي محلي ويوفر واجهة تحكم متقدمة.', 'An intelligent automated system for managing WhatsApp groups that provides advanced protection against spam and inappropriate content. Features custom word filtering, malicious extension blocking, and blacklist/whitelist management. Powered by local AI with an advanced dashboard.')}
                            </p>
                        </div>
                    </section>

                    <section>
                        <div class="section-header">
                            <h2><i class="fas fa-bolt"></i> ${t('الميزات الأساسية', 'Core Features')}</h2>
                        </div>
                        <div class="grid-3">
                            <div class="info-card">
                                <div class="feat-icon"><i class="fas fa-brain"></i></div>
                                <div class="feat-title">${t('الذكاء الاصطناعي', 'AI Moderation')}</div>
                                <div class="feat-desc">${t('كشف ومنع الرسائل غير المناسبة بذكاء محلي', 'Detect and block inappropriate messages dynamically.')}</div>
                            </div>
                            <div class="info-card">
                                <div class="feat-icon"><i class="fas fa-shield-virus"></i></div>
                                <div class="feat-title">${t('منع البريد المزعج', 'Anti-Spam')}</div>
                                <div class="feat-desc">${t('حماية من الرسائل الملحة والفيضانات', 'Protection against repetitive and flood messages.')}</div>
                            </div>
                            <div class="info-card">
                                <div class="feat-icon"><i class="fas fa-user-lock"></i></div>
                                <div class="feat-title">${t('حظر وسماح مرن', 'Access Control')}</div>
                                <div class="feat-desc">${t('إدارة مرنة للأرقام وقوائم الدخول', 'Flexible blacklist and whitelist configurations.')}</div>
                            </div>
                            <div class="info-card">
                                <div class="feat-icon"><i class="fas fa-photo-video"></i></div>
                                <div class="feat-title">${t('تصفية الملفات', 'Media Filtering')}</div>
                                <div class="feat-desc">${t('حظر أنواع معينة من المرفقات والملفات', 'Strict restrictions on unwanted or risky media assets.')}</div>
                            </div>
                            <div class="info-card">
                                <div class="feat-icon"><i class="fas fa-sliders-h"></i></div>
                                <div class="feat-title">${t('تحكم شامل', 'Advanced Control')}</div>
                                <div class="feat-desc">${t('تحكم كامل في إعدادات كل مجموعة', 'Deep and granular configurations customizable per group.')}</div>
                            </div>
                            <div class="info-card">
                                <div class="feat-icon"><i class="fas fa-language"></i></div>
                                <div class="feat-title">${t('تعدد اللغات', 'Multilingual')}</div>
                                <div class="feat-desc">${t('دعم كامل للواجهتين العربية والإنجليزية', 'Native dashboard interfaces in both English and Arabic.')}</div>
                            </div>
                        </div>
                    </section>

                    <div class="grid-2">
                        <section>
                            <div class="section-header">
                                <h2><i class="fas fa-layer-group"></i> ${t('التقنيات المستخدمة', 'Tech Stack')}</h2>
                            </div>
                            <div class="grid-2" style="gap: 10px;">
                                <div class="tech-pill">whatsapp-web.js</div>
                                <div class="tech-pill">Node.js / Express</div>
                                <div class="tech-pill">better-sqlite3</div>
                                <div class="tech-pill">Ollama AI</div>
                                <div class="tech-pill">Docker</div>
                                <div class="tech-pill">Vanilla JS / CSS</div>
                            </div>
                        </section>

                        <section>
                            <div class="section-header">
                                <h2><i class="fas fa-server"></i> ${t('متطلبات التشغيل', 'System Requirements')}</h2>
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 8px;">
                                <div class="req-box">
                                    <span class="req-label">${t('الذاكرة (بدون AI)', 'RAM (Base)')}</span>
                                    <span class="req-val">2 GB</span>
                                </div>
                                <div class="req-box">
                                    <span class="req-label">${t('الذاكرة (مع AI)', 'RAM (w/ AI)')}</span>
                                    <span class="req-val">8 GB+</span>
                                </div>
                                <div class="req-box">
                                    <span class="req-label">${t('التخزين', 'Storage')}</span>
                                    <span class="req-val">5 GB+ (20GB+ AI)</span>
                                </div>
                                <div class="req-box">
                                    <span class="req-label">${t('بيئة العمل', 'Environment')}</span>
                                    <span class="req-val">Node 16+ / Docker</span>
                                </div>
                            </div>
                        </section>
                    </div>

                    <section>
                        <div class="section-header">
                            <h2><i class="fas fa-laptop-code"></i> ${t('المطور والمساهمون', 'Developer & Contributors')}</h2>
                        </div>
                        <div class="dev-profile" style="margin-bottom: 20px;">
                            <div class="dev-avatar">
                                <img src="https://github.com/az2oo1.png" alt="${t('عبدالعزيز القاسم', 'Abdulaziz Algassem')}" style="width: 100%; height: 100%; object-fit: cover;">
                            </div>
                            <div class="dev-info">
                                <h3 class="dev-name">${t('عبدالعزيز القاسم', 'Abdulaziz Algassem')}</h3>
                                <p class="dev-handle">@az2oo1 / INTERSTELLAR</p>
                                <p class="dev-bio">
                                    ${t('طالب تقنية معلومات متخصص في تطوير الحلول الذكية والتطبيقات المتقدمة.', 'IT student specialized in developing intelligent solutions and advanced applications.')}
                                </p>
                                <div class="dev-links">
                                    <a href="https://github.com/az2oo1" target="_blank" class="social-btn"><i class="fab fa-github"></i> GitHub</a>
                                    <a href="https://www.linkedin.com/in/agssa/" target="_blank" class="social-btn"><i class="fab fa-linkedin"></i> LinkedIn</a>
                                    <a href="https://instagram.com/az2oo1" target="_blank" class="social-btn"><i class="fab fa-instagram"></i> Instagram</a>
                                </div>
                            </div>
                        </div>

                        <div class="info-card" style="display: flex; gap: 16px; align-items: flex-start; padding: 16px 20px;">
                            <div class="dev-avatar" style="width: 50px; height: 50px; flex-shrink: 0; border-width: 1.5px; overflow: hidden;">
                                <img src="https://github.com/Fahad-Alshalawi1.png" alt="${t('فهد الشلوي', 'Fahad Alshalawi')}" style="width: 100%; height: 100%; object-fit: cover;">
                            </div>
                            <div class="dev-info">
                                <h3 class="dev-name" style="font-size: 18px; margin: 0 0 2px 0;">${t('فهد الشلوي', 'Fahad Alshalawi')}</h3>
                                <p class="dev-handle" style="font-size: 13px; margin: 0 0 8px 0; color: var(--blue);"><i class="fas fa-brain"></i> ${t('مساهم الذكاء الاصطناعي', 'AI Contributor')}</p>
                                <p class="dev-bio" style="font-size: 13px; margin: 0 0 12px 0; line-height: 1.5;">
                                    ${t('مساعدة قيمة في تطوير خوارزميات الذكاء الاصطناعي وتجهيزها للعمل داخل النظام.', 'Valuable assistance in developing and integrating AI capabilities into the system.')}
                                </p>
                                <a href="https://github.com/Fahad-Alshalawi1" target="_blank" class="social-btn" style="padding: 6px 12px; font-size: 12px; border-radius: 6px;"><i class="fab fa-github"></i> GitHub</a>
                            </div>
                        </div>
                    </section>

                </div>
            </div>

            <div class="page" id="page-users">
                <div class="page-header">
                    <h2><i class="fas fa-user-shield"></i> ${t('إدارة المستخدمين', 'User Management')}</h2>
                    <p>${t('إدارة الحسابات والصلاحيات بشكل مباشر داخل اللوحة', 'Manage users and permissions directly inside the dashboard')}</p>
                </div>

                <div class="um-stats">
                    <div class="um-stat">
                        <div class="um-stat-label">${t('إجمالي المستخدمين', 'Total Users')}</div>
                        <div class="um-stat-value" id="um_users_count">0</div>
                    </div>
                    <div class="um-stat">
                        <div class="um-stat-label">${t('المديرون العامون', 'Superadmins')}</div>
                        <div class="um-stat-value" id="um_superadmins_count">0</div>
                    </div>
                    <div class="um-stat">
                        <div class="um-stat-label">${t('مجموعات الصلاحيات', 'Permission Groups')}</div>
                        <div class="um-stat-value" id="um_perm_count">0</div>
                    </div>
                </div>

                <div class="um-layout">
                    <div class="um-stack">
                        <div class="card success">
                            <div class="card-header"><h3><i class="fas fa-user-plus"></i> ${t('إضافة مستخدم', 'Create User')}</h3></div>
                            <p class="um-card-note">${t('أنشئ حساباً جديداً بسرعة ثم عدّل وصوله من لوحة الوصول بالأسفل.', 'Create a user quickly, then fine-tune access in the access panel below.')}</p>
                            <div class="field-row">
                                <div class="field-group" style="margin-bottom:0;">
                                    <label class="field-label">${t('اسم المستخدم', 'Username')}</label>
                                    <input type="text" id="um_create_username" placeholder="agent_1">
                                </div>
                                <div class="field-group" style="margin-bottom:0;">
                                    <label class="field-label">${t('الاسم المعروض', 'Display Name')}</label>
                                    <input type="text" id="um_create_display_name" placeholder="Agent One">
                                </div>
                            </div>
                            <div class="field-row" style="margin-top:12px;">
                                <div class="field-group" style="margin-bottom:0;">
                                    <label class="field-label">${t('كلمة المرور', 'Password')}</label>
                                    <input type="password" id="um_create_password" placeholder="${t('8 أحرف على الأقل', 'At least 8 characters')}">
                                </div>
                                <div class="field-group" style="margin-bottom:0;">
                                    <label class="field-label">${t('الدور السريع', 'Quick Role')}</label>
                                    <select id="um_create_quick_role">
                                        <option value="viewer">${t('مشاهدة فقط', 'Viewer')}</option>
                                        <option value="operator" selected>${t('مشغل', 'Operator')}</option>
                                        <option value="admin">${t('مدير كامل', 'Full Admin')}</option>
                                        <option value="custom">${t('مخصص (يدوي)', 'Custom (Manual)')}</option>
                                    </select>
                                </div>
                            </div>
                            <div class="field-row" style="margin-top:12px;">
                                <div class="field-group" style="margin-bottom:0;">
                                    <label class="field-label">${t('نطاق المجموعات', 'Groups Scope')}</label>
                                    <select id="um_create_group_scope">
                                        <option value="all" selected>${t('كل المجموعات', 'All Groups')}</option>
                                        <option value="none">${t('بدون صلاحيات مجموعات الآن', 'No Groups Yet')}</option>
                                    </select>
                                </div>
                                <div class="toggle-row" style="margin-bottom:0; margin-top:21px;">
                                    <div class="toggle-left">
                                        <label class="switch"><input type="checkbox" id="um_create_superadmin"><span class="slider"></span></label>
                                        <div class="toggle-label">${t('صلاحية مدير عام', 'Superadmin Permission')}</div>
                                    </div>
                                </div>
                            </div>
                            <div class="field-row" style="margin-top:12px;">
                                <button class="btn btn-primary" type="button" onclick="umCreateUser()"><i class="fas fa-wand-magic-sparkles"></i> ${t('إضافة المستخدم', 'Create User')}</button>
                                <button class="btn btn-ghost" type="button" onclick="umLoadData(true)"><i class="fas fa-sync"></i> ${t('تحديث', 'Refresh')}</button>
                            </div>
                            <div id="um_create_status" style="margin-top:10px;color:var(--text-muted);font-size:13px;"></div>
                        </div>

                        <div class="card info">
                            <div class="card-header"><h3><i class="fas fa-users"></i> ${t('المستخدمون', 'Users')}</h3></div>
                            <div class="um-scroll-box" id="um_users_list"></div>
                        </div>

                        <div class="card warning" style="margin-bottom:0;">
                            <div class="card-header"><h3><i class="fas fa-sliders-h"></i> ${t('صلاحيات المستخدم المحدد', 'Selected User Access')}</h3></div>
                            <p id="um_selected_user" style="color:var(--text-muted);margin-bottom:14px;">${t('اختر مستخدماً من القائمة', 'Select a user from the list')}</p>
                            <div class="field-row um-actions-row" style="margin-bottom:10px;">
                                <button class="btn btn-ghost btn-sm" type="button" onclick="umToggleAll('um-perm', true)"><i class="fas fa-check-double"></i> ${t('تحديد كل الصلاحيات', 'Select All Permissions')}</button>
                                <button class="btn btn-ghost btn-sm" type="button" onclick="umToggleAll('um-perm', false)"><i class="fas fa-eraser"></i> ${t('إلغاء كل الصلاحيات', 'Clear Permissions')}</button>
                                <button class="btn btn-ghost btn-sm" type="button" onclick="umToggleAll('um-wa', true)"><i class="fas fa-check-double"></i> ${t('تحديد كل المجموعات', 'Select All Groups')}</button>
                                <button class="btn btn-ghost btn-sm" type="button" onclick="umToggleAll('um-wa', false)"><i class="fas fa-eraser"></i> ${t('إلغاء كل المجموعات', 'Clear Groups')}</button>
                            </div>
                            <div class="um-access-grid">
                                <div>
                                    <label class="field-label">${t('ماذا يمكن لهذا المستخدم أن يفعل؟', 'What can this user do?')}</label>
                                    <div id="um_assign_perm_groups" class="chip-container" style="display:block;min-height:120px;"></div>
                                </div>
                                <div>
                                    <label class="field-label">${t('في أي مجموعات يمكنه إدارة الإعدادات؟', 'Which groups can they manage?')}</label>
                                    <div id="um_assign_wa_groups" class="chip-container" style="display:block;min-height:120px;"></div>
                                </div>
                            </div>
                            <div class="field-row" style="margin-top:12px;">
                                <button class="btn btn-primary" type="button" onclick="umSaveSelectedUserAccess()"><i class="fas fa-save"></i> ${t('حفظ الوصول', 'Save Access')}</button>
                                <button class="btn btn-danger" type="button" onclick="umDeleteSelectedUser()"><i class="fas fa-trash"></i> ${t('حذف المستخدم', 'Delete User')}</button>
                            </div>
                            <div id="um_access_status" style="margin-top:10px;color:var(--text-muted);font-size:13px;"></div>
                        </div>
                    </div>

                    <div class="um-stack">
                        <div class="card purple">
                            <div class="card-header"><h3><i class="fas fa-layer-group"></i> ${t('إضافة مجموعة صلاحيات', 'Create Permission Group')}</h3></div>
                            <p class="um-card-note">${t('استخدم القوالب الجاهزة ثم عدّل الصلاحيات كما تريد.', 'Start with presets, then customize permissions as needed.')}</p>
                            <div class="field-row um-actions-row" style="margin-bottom:10px;">
                                <button class="btn btn-ghost btn-sm" type="button" onclick="umUsePermPreset('viewer')">${t('مشاهدة فقط', 'Viewer')}</button>
                                <button class="btn btn-ghost btn-sm" type="button" onclick="umUsePermPreset('operator')">${t('مشغل', 'Operator')}</button>
                                <button class="btn btn-ghost btn-sm" type="button" onclick="umUsePermPreset('admin')">${t('مدير كامل', 'Full Admin')}</button>
                            </div>
                            <div class="field-row">
                                <div class="field-group" style="margin-bottom:0;">
                                    <label class="field-label">${t('اسم المجموعة', 'Group Name')}</label>
                                    <input type="text" id="um_perm_name" placeholder="${t('المشرفون', 'Moderators')}">
                                </div>
                                <div class="field-group" style="margin-bottom:0;">
                                    <label class="field-label">${t('الوصف', 'Description')}</label>
                                    <input type="text" id="um_perm_desc" placeholder="${t('وصف مختصر', 'Short description')}">
                                </div>
                            </div>
                            <div class="field-group" style="margin-top:12px;">
                                <label class="field-label">${t('اختر الصلاحيات', 'Choose Permissions')}</label>
                                <div id="um_perm_picker" class="cb-group" style="gap:8px;"></div>
                            </div>
                            <div class="um-perm-help">
                                <label class="field-label" style="margin-bottom:8px;"><i class="fas fa-circle-info"></i> ${t('شرح الصلاحيات', 'Permissions Guide')}</label>
                                <div id="um_perm_help"></div>
                            </div>
                            <div class="field-row um-actions-row" style="margin-bottom:10px;">
                                <button class="btn btn-ghost btn-sm" type="button" onclick="umSetAllCreatePerms(true)"><i class="fas fa-check-double"></i> ${t('تحديد الكل', 'Select All')}</button>
                                <button class="btn btn-ghost btn-sm" type="button" onclick="umSetAllCreatePerms(false)"><i class="fas fa-eraser"></i> ${t('مسح الكل', 'Clear All')}</button>
                            </div>
                            <div class="field-group">
                                <label class="field-label">${t('إضافة صلاحية مخصصة', 'Add Custom Permission')}</label>
                                <div class="input-with-btn">
                                    <input type="text" id="um_perm_custom" placeholder="custom:permission" onkeypress="if(event.key==='Enter'){event.preventDefault();umAddCustomCreatePerm();}">
                                    <button class="btn btn-ghost" type="button" onclick="umAddCustomCreatePerm()"><i class="fas fa-plus"></i> ${t('إضافة', 'Add')}</button>
                                </div>
                            </div>
                            <div class="field-group">
                                <label class="field-label">${t('الصلاحيات المختارة', 'Selected Permissions')}</label>
                                <div id="um_perm_selected" class="chip-container" style="min-height:54px;"></div>
                            </div>
                            <div class="field-row" style="margin-top:6px;">
                                <button class="btn btn-primary" id="um_perm_submit_btn" type="button" onclick="umCreatePermissionGroup()"><i class="fas fa-plus"></i> ${t('إضافة المجموعة', 'Create Group')}</button>
                                <button class="btn btn-ghost" id="um_perm_cancel_btn" type="button" onclick="umResetPermissionForm()" style="display:none;"><i class="fas fa-rotate-left"></i> ${t('إلغاء التعديل', 'Cancel Edit')}</button>
                            </div>
                            <div id="um_perm_status" style="margin-top:10px;color:var(--text-muted);font-size:13px;"></div>

                            <button class="btn btn-ghost btn-sm" type="button" onclick="umTogglePermissionGroupsDrawer()" style="margin-top:10px; width:100%; justify-content:space-between;">
                                <span><i class="fas fa-key"></i> ${t('عرض مجموعات الصلاحيات الحالية', 'Show Current Permission Groups')}</span>
                                <i id="um_perm_drawer_icon" class="fas fa-chevron-down"></i>
                            </button>
                            <div id="um_perm_drawer" class="um-perm-drawer">
                                <div class="card" style="margin:0; padding:14px; background:var(--input-bg); border-color:var(--card-border);">
                                    <div class="um-scroll-box" id="um_perm_groups_list"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div id="saveMsgToast" class="toast"><i class="fas fa-check-circle"></i> ${t('تم الحفظ في قاعدة البيانات بنجاح!', 'Saved to database successfully!')}</div>

            </form>
        </div>

        <div id="ollamaModal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 style="color:var(--blue);"><i class="fas fa-link"></i> ${t('إعدادات خادم Ollama', 'Ollama Server Settings')}</h3>
                    <button class="close-modal" onclick="closeOllamaModal()">×</button>
                </div>
                <div class="field-group">
                    <label class="field-label">${t('رابط الخادم (Endpoint URL)', 'Server URL (Endpoint)')}</label>
                    <input type="text" id="ollamaUrl" value="${config.ollamaUrl}" dir="ltr" style="text-align:left; font-family:monospace;">
                </div>
                <div class="field-group">
                    <label class="field-label">${t('اسم النموذج', 'Model Name')}</label>
                    <input type="text" id="ollamaModel" value="${config.ollamaModel}" dir="ltr" style="text-align:left; font-family:monospace;" placeholder="Ex: llava">
                </div>
                <button type="button" class="btn btn-primary btn-full" onclick="closeOllamaModal()">${t('حفظ وإغلاق', 'Save & Close')}</button>
            </div>
        </div>

        <div id="debuggerModal" class="modal">
            <div class="modal-content" style="max-width:800px; background:#0d1117; border-color:#21262d;">
                <div class="modal-header">
                    <h3 style="color:var(--accent); font-family:monospace;"><i class="fas fa-terminal"></i> ${t('سجل الأحداث المباشر', 'Live Event Logs')}</h3>
                    <button class="close-modal" onclick="closeDebuggerModal()">×</button>
                </div>
                <div id="terminalOutput"></div>
                <button type="button" class="btn btn-ghost btn-full" style="margin-top:14px;" onclick="closeDebuggerModal()">${t('إغلاق', 'Close')}</button>
            </div>
        </div>

        <div id="firstLoginModal" class="modal">
            <div class="modal-content" style="max-width:620px; border-color:rgba(255,171,64,0.35); background:linear-gradient(180deg,rgba(255,171,64,0.06) 0,var(--card-bg) 60%);">
                <div class="modal-header">
                    <h3 style="color:var(--orange);"><i class="fas fa-user-lock"></i> ${t('تغيير بيانات الدخول مطلوب', 'Credential Change Required')}</h3>
                </div>
                <p style="color:var(--text-muted); margin-top:-8px; margin-bottom:14px; line-height:1.8;">
                    ${t('تم تسجيل الدخول بالحساب الافتراضي. لأمان النظام، يجب تغيير اسم المستخدم وكلمة المرور قبل المتابعة.', 'You signed in with the default account. For security, you must change username and password before continuing.')}
                </p>
                <div class="field-group">
                    <label class="field-label">${t('اسم المستخدم الجديد', 'New Username')}</label>
                    <input id="firstLoginUsername" type="text" autocomplete="username" dir="ltr" style="text-align:left; font-family:monospace;" placeholder="admin_new">
                </div>
                <div class="field-group">
                    <label class="field-label">${t('كلمة المرور الجديدة', 'New Password')}</label>
                    <input id="firstLoginPassword" type="password" autocomplete="new-password" placeholder="${t('8 أحرف على الأقل', 'At least 8 characters')}">
                </div>
                <div class="field-group">
                    <label class="field-label">${t('تأكيد كلمة المرور', 'Confirm Password')}</label>
                    <input id="firstLoginConfirm" type="password" autocomplete="new-password" placeholder="${t('أعد كتابة كلمة المرور', 'Re-enter password')}">
                </div>
                <div id="firstLoginStatus" style="min-height:20px; color:var(--text-muted); margin-bottom:8px; font-size:13px;"></div>
                <button type="button" class="btn btn-primary btn-full" onclick="submitFirstLoginChange()"><i class="fas fa-key"></i> ${t('حفظ ومتابعة', 'Save and Continue')}</button>
            </div>
        </div>

        <script>
            const currentLang = '${lang}';
            const currentDir = '${dir}';
            let fetchedGroups = [];
            let firstLoginEnforced = false;

            const dict = {
                'delete_confirm': '${t("هل أنت متأكد من رغبتك في حذف الإعدادات المخصصة لهذه المجموعة؟", "Are you sure you want to delete settings for this group?")}',
                'logout_confirm': '${t("هل أنت متأكد من رغبتك في تسجيل الخروج من حساب واتساب؟ سيتم فصل البوت.", "Are you sure you want to log out of WhatsApp? The bot will disconnect.")}',
                'signout_confirm': '${t("هل تريد تسجيل الخروج من لوحة التحكم؟", "Do you want to sign out from the dashboard?")}',
                'logging_out': '<i class="fas fa-spinner fa-spin"></i> ${t("جاري تسجيل الخروج...", "Logging out...")}',
                'purge_warn': '⚠️ ${t("تحذير: هذا الخيار سيجعل البوت يبحث في جميع المجموعات، وسيطرد أي شخص موجود في القائمة السوداء فوراً. متأكد؟", "Warning: The bot will scan all groups and instantly kick anyone in the blacklist. Sure?")}',
                'purging': '<i class="fas fa-spinner fa-spin"></i> ${t("جاري المسح والطرد من المجموعات...", "Scanning and purging...")}',
                'saving_schedule': '<i class="fas fa-spinner fa-spin"></i> ${t("جاري حفظ الجدولة...", "Saving schedule...")}',
                'running_sync': '<i class="fas fa-spinner fa-spin"></i> ${t("جاري التنفيذ...", "Running...")}',
                'schedule_saved': '${t("✅ تم حفظ الجدولة بنجاح", "✅ Schedule saved successfully")}',
                'schedule_load_fail': '${t("❌ تعذر تحميل إعدادات الجدولة", "❌ Failed to load schedule settings")}',
                'sync_success': '${t("✅ تمت المزامنة بنجاح", "✅ Sync completed successfully")}',
                'conn_err': '${t("حدث خطأ في الاتصال بالخادم.", "Connection error.")}',
                'save_success': '<i class="fas fa-check-circle"></i> ${t("تم الحفظ في قاعدة البيانات بنجاح!", "Saved to database successfully!")}',
                'save_fail': '<i class="fas fa-times-circle"></i> ${t("فشل الحفظ، تحقق من السيرفر", "Save failed, check server")}',
                'group': '${t("المجموعة", "Group")}',
                'no_id': '${t("لم يتم التحديد", "Not Selected")}',
                'delete': '${t("حذف", "Delete")}',
                'target_group': '${t("اختر المجموعة المستهدفة", "Select Target Group")}',
                'admin_group': '${t("مجموعة الإدارة (اتركه فارغاً للافتراضي)", "Admin Group (leave empty for default)")}',
                'admin_group_label': '${t("اختر المجموعة لتلقي التنبيهات", "Select Group for Alerts")}',
                'admin_msg_lang': '${t("لغة رسائل الإدارة", "Admin Message Language")}',
                'use_default_lang': '${t("استخدم الافتراضي", "Use Default")}',
                'lang_ar': 'العربية',
                'lang_en': 'English',
                'blocked_types': '${t("الأنواع الممنوعة قطعياً", "Absolute Blocked Types")}',
                'block_action': '${t("إجراء المنع", "Block Action")}',
                'act_del': '${t("حذف الرسالة فقط", "Delete Message Only")}',
                'act_poll': '${t("حذف + تصويت للإدارة", "Delete + Admin Poll")}',
                'act_auto': '${t("حذف + طرد تلقائي", "Delete + Auto Kick")}',
                'anti_spam': '${t("مكافحة الإزعاج (Anti-Spam)", "Anti-Spam")}',
                'spam_desc': '${t("رصد الرسائل المتكررة خلال 15 ثانية", "Detect repeated messages within 15s")}',
                'limits_15s': '${t("حدود كل نوع (15 ثانية)", "Type Limits (15s)")}',
                'text_dup': '${t("تكرار النص", "Text Dup Limit")}',
                'action': '${t("الإجراء", "Action")}',
                'poll': '${t("تصويت للإدارة", "Admin Poll")}',
                'auto_kick': '${t("طرد تلقائي", "Auto Kick")}',
                'welcome_msg': '${t("رسالة ترحيبية عند الانضمام", "Welcome Message on Join")}',
                'welcome_desc': '${t("يُرسلها البوت لكل عضو جديد", "Sent by bot to new members")}',
                'msg_text': '${t("نص الرسالة ({user} للمنشن)", "Message Text ({user} for mention)")}',
                'enable_bl': '${t("تفعيل القائمة السوداء", "Enable Blacklist")}',
                'bl_desc': '${t("طرد فوري لأي رقم محظور", "Instant kick for banned numbers")}',
                'word_filter': '${t("فلتر الكلمات الممنوعة", "Forbidden Word Filter")}',
                'wf_desc': '${t("حذف فوري عند رصد كلمة ممنوعة", "Instant delete on forbidden word")}',
                'use_global': '${t("تطبيق الكلمات العامة أيضاً", "Apply Global Words Too")}',
                'ug_desc': '${t("إضافة قائمة الكلمات العامة لهذه المجموعة", "Include global words list")}',
                'custom_words': '${t("كلمات ممنوعة مخصصة لهذه المجموعة", "Custom forbidden words for this group")}',
                'add': '${t("إضافة", "Add")}',
                'ai_text': '${t("المشرف الذكي (AI) للنصوص", "AI Moderator for Text")}',
                'ai_trigger_words_group': '${t("كلمات تشغيل AI لهذه المجموعة", "AI Trigger Words for this group")}',
                'ai_trigger_words_desc_group': '${t("عند وجود أي كلمة من هذه الكلمات في رد النموذج سيتم حذف الرسالة", "If AI response contains any of these words, the message will be deleted")}',
                'join_profile_screening': '${t("فحص الملف الشخصي عند الانضمام", "Join Profile Screening")}',
                'join_profile_screening_desc': '${t("يفحص الاسم/النبذة للأعضاء الجدد وطلبات الانضمام", "Checks profile name/bio for new joins and membership requests")}',
                'ai_vision': '${t("تحليل الصور (Vision)", "Image Analysis (Vision)")}',
                'direct_del': '${t("الحذف المباشر (تخطي التصويت)", "Direct Delete (Skip Poll)")}',
                'select_group': '${t("اختر مجموعة...", "Select a Group...")}',
                'default_setting': '${t("الاختيار الافتراضي (عام)", "Default (Global)")}',
                'panic_mode': '${t("وضع الطوارئ (Panic Mode)", "Panic Mode")}',
                'panic_desc': '${t("إغلاق المجموعة تلقائياً عند رصد هجوم", "Auto-lock group on raid detection")}',
                'panic_msg_limit': '${t("عدد الرسائل", "Message Limit")}',
                'panic_time_window': '${t("خلال (ثواني)", "Within (Seconds)")}',
                'panic_lock_dur': '${t("مدة الإغلاق (دقائق)", "Lockout Duration (Mins)")}',
                'panic_target': '${t("إرسال التنبيه إلى", "Send Alert To")}',
                'target_group_only': '${t("المجموعة المستهدفة فقط", "Target Group Only")}',
                'admin_group_only': '${t("مجموعة الإدارة فقط", "Admin Group Only")}',
                'target_both': '${t("كلاهما (المجموعة والإدارة)", "Both")}',
                'panic_msg_text': '${t("نص التنبيه ({time} للمدة)", "Alert Text ({time} for duration)")}',
                'enable_wl': '${t("تفعيل القائمة البيضاء", "Enable Whitelist")}',
                'wl_desc': '${t("تخطي الفلاتر للأرقام الموثوقة", "Bypass filters for trusted numbers")}',
                'use_global_bl': '${t("تطبيق القائمة السوداء العامة", "Apply Global Blacklist")}',
                'ug_bl_desc': '${t("دمج الأرقام المحظورة العامة مع هذه المجموعة", "Include globally banned numbers")}',
                'custom_bl': '${t("أرقام محظورة مخصصة لهذه المجموعة", "Custom banned numbers for this group")}',
                'use_global_wl': '${t("تطبيق القائمة البيضاء العامة", "Apply Global Whitelist")}',
                'ug_wl_desc': '${t("دمج الأرقام الموثوقة العامة مع هذه المجموعة", "Include globally trusted numbers")}',
                'custom_wl': '${t("أرقام موثوقة مخصصة لهذه المجموعة", "Custom trusted numbers for this group")}',
                'cred_change_saving': '${t("جاري حفظ بيانات الدخول الجديدة...", "Saving new credentials...")}',
                'cred_change_done': '${t("تم تحديث بيانات الدخول بنجاح", "Credentials updated successfully")}',
                'cred_change_failed': '${t("فشل تحديث بيانات الدخول", "Credential update failed")}'
            };

            async function loadKnownGroups() {
                try {
                    const res = await fetch('/api/groups', { cache: 'no-store' });
                    if (res.status === 401) {
                        window.location.replace('/login');
                        return;
                    }
                    if (!res.ok) return;
                    fetchedGroups = await res.json();

                    const defAdminContainer = document.getElementById('defaultAdminGroupContainer');
                    if (defAdminContainer) {
                        let defHTML = \`
                            <label class="field-label" style="display:flex; justify-content:space-between; align-items:center;">
                                <span>\${dict.admin_group_label}</span>
                                <span style="cursor:pointer; color:var(--accent); font-size:14px;" onclick="loadKnownGroups()" title="Refresh Groups"><i class="fas fa-sync"></i></span>
                            </label>
                            <select id="defaultAdminGroup" dir="ltr" style="text-align:\${currentDir === 'rtl' ? 'right' : 'left'};">
                        \`;
                        defHTML += \`<option value="">-- \${dict.select_group} --</option>\`;
                        
                        let defFound = false;
                        fetchedGroups.forEach(g => {
                            const sel = g.id === '${config.defaultAdminGroup}' ? 'selected' : '';
                            if(sel) defFound = true;
                            defHTML += \`<option value="\${g.id}" \${sel}>\${g.name}</option>\`;
                        });

                        if ('${config.defaultAdminGroup}' && !defFound) {
                            defHTML += \`<option value="${config.defaultAdminGroup}" selected>${config.defaultAdminGroup} (Unknown)</option>\`;
                        }
                        defHTML += \`</select>\`;
                        defHTML += \`
                            <div class="field-group" style="margin-top:12px; margin-bottom:0;">
                                <label class="field-label">\${dict.admin_msg_lang}</label>
                                <select id="defaultAdminLanguage" dir="ltr" style="text-align:\${currentDir === 'rtl' ? 'right' : 'left'};">
                                    <option value="ar" ${config.defaultAdminLanguage === 'en' ? '' : 'selected'}>\${dict.lang_ar}</option>
                                    <option value="en" ${config.defaultAdminLanguage === 'en' ? 'selected' : ''}>\${dict.lang_en}</option>
                                </select>
                            </div>
                        \`;
                        defAdminContainer.innerHTML = defHTML;
                    }
                    
                    renderGroups();

                } catch(e) {}
            }

            function createGroupSelectHTML(selectedValue, onchangeCode, allowEmpty = false) {
                let html = \`<select onchange="\${onchangeCode}" dir="ltr" style="text-align:\${currentDir === 'rtl' ? 'right' : 'left'};">\`;
                html += \`<option value="">\${allowEmpty ? '-- ' + dict.default_setting + ' --' : '-- ' + dict.select_group + ' --'}</option>\`;
                let found = false;
                fetchedGroups.forEach(g => {
                    let sel = g.id === selectedValue ? 'selected' : '';
                    if(sel) found = true;
                    html += \`<option value="\${g.id}" \${sel}>\${g.name}</option>\`;
                });
                if (selectedValue && !found) {
                    html += \`<option value="\${selectedValue}" selected>\${selectedValue} (Unknown)</option>\`;
                }
                html += \`</select>\`;
                return html;
            }

            function switchLanguage(checkbox) {
                const newLang = checkbox.checked ? 'en' : 'ar';
                document.cookie = "bot_lang=" + newLang + "; path=/; max-age=31536000";
                window.location.reload();
            }

            function openOllamaModal() { document.getElementById('ollamaModal').classList.add('open'); }
            function closeOllamaModal() { document.getElementById('ollamaModal').classList.remove('open'); }
            
            let debuggerInterval;
            function openDebuggerModal() { 
                document.getElementById('debuggerModal').classList.add('open'); 
                fetchLogs();
                debuggerInterval = setInterval(fetchLogs, 1500); 
            }
            function closeDebuggerModal() { 
                document.getElementById('debuggerModal').classList.remove('open'); 
                clearInterval(debuggerInterval);
            }

            async function enforceFirstLoginChange() {
                try {
                    const res = await fetch('/auth/me', { cache: 'no-store' });
                    if (res.status === 401) {
                        window.location.replace('/login');
                        return;
                    }
                    if (!res.ok) return;
                    const me = await res.json();
                    if (!me || !me.mustChangeCredentials) return;

                    firstLoginEnforced = true;
                    const modal = document.getElementById('firstLoginModal');
                    const usernameInput = document.getElementById('firstLoginUsername');
                    const statusEl = document.getElementById('firstLoginStatus');
                    if (statusEl) statusEl.textContent = '';
                    if (usernameInput) usernameInput.value = me.username || '';
                    modal.classList.add('open');
                    document.body.style.overflow = 'hidden';
                } catch (e) {}
            }

            async function submitFirstLoginChange() {
                const usernameEl = document.getElementById('firstLoginUsername');
                const passwordEl = document.getElementById('firstLoginPassword');
                const confirmEl = document.getElementById('firstLoginConfirm');
                const statusEl = document.getElementById('firstLoginStatus');
                if (!usernameEl || !passwordEl || !confirmEl || !statusEl) return;

                statusEl.style.color = 'var(--text-muted)';
                statusEl.textContent = dict.cred_change_saving;

                try {
                    const response = await fetch('/auth/first-login-change', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            username: usernameEl.value,
                            password: passwordEl.value,
                            confirmPassword: confirmEl.value
                        })
                    });

                    if (!response.ok) {
                        const data = await response.json().catch(() => ({ error: dict.cred_change_failed }));
                        statusEl.style.color = 'var(--red)';
                        statusEl.textContent = data.error || dict.cred_change_failed;
                        return;
                    }

                    statusEl.style.color = 'var(--accent)';
                    statusEl.textContent = dict.cred_change_done;
                    firstLoginEnforced = false;
                    document.getElementById('firstLoginModal').classList.remove('open');
                    document.body.style.overflow = '';
                    showToast('<i class="fas fa-check-circle"></i> ' + dict.cred_change_done);
                } catch (e) {
                    statusEl.style.color = 'var(--red)';
                    statusEl.textContent = dict.cred_change_failed;
                }
            }

            window.onclick = function(event) {
                if (event.target === document.getElementById('ollamaModal')) closeOllamaModal();
                if (event.target === document.getElementById('debuggerModal')) closeDebuggerModal();
                if (event.target === document.getElementById('confirmModal')) closeConfirmModal(false);
            }

            let confirmResolver = null;

            function closeConfirmModal(result) {
                const modal = document.getElementById('confirmModal');
                if (!modal) return;
                modal.classList.remove('open');
                document.body.style.overflow = '';
                if (confirmResolver) {
                    const resolve = confirmResolver;
                    confirmResolver = null;
                    resolve(Boolean(result));
                }
            }

            function showConfirmModal(message, options = {}) {
                return new Promise(resolve => {
                    const modal = document.getElementById('confirmModal');
                    const titleEl = document.getElementById('confirmModalTitle');
                    const msgEl = document.getElementById('confirmModalMessage');
                    const closeBtn = document.getElementById('confirmModalClose');
                    const cancelBtn = document.getElementById('confirmModalCancel');
                    const confirmBtn = document.getElementById('confirmModalConfirm');

                    if (!modal || !titleEl || !msgEl || !closeBtn || !cancelBtn || !confirmBtn) {
                        resolve(window.confirm(message));
                        return;
                    }

                    const title = options.title || (currentLang === 'en' ? 'Confirm Action' : 'تأكيد الإجراء');
                    const confirmText = options.confirmText || (currentLang === 'en' ? 'Confirm' : 'تأكيد');
                    const cancelText = options.cancelText || (currentLang === 'en' ? 'Cancel' : 'إلغاء');

                    titleEl.innerHTML = '<i class="fas fa-circle-question"></i> ' + umEscapeHtml(title);
                    msgEl.textContent = String(message || '');
                    confirmBtn.textContent = confirmText;
                    cancelBtn.textContent = cancelText;
                    confirmBtn.className = 'btn ' + (options.confirmClass || 'btn-danger');

                    confirmResolver = resolve;
                    modal.classList.add('open');
                    document.body.style.overflow = 'hidden';

                    confirmBtn.onclick = () => closeConfirmModal(true);
                    cancelBtn.onclick = () => closeConfirmModal(false);
                    closeBtn.onclick = () => closeConfirmModal(false);
                });
            }

            async function fetchLogs() {
                try {
                    let res = await fetch('/api/logs');
                    let logs = await res.json();
                    const term = document.getElementById('terminalOutput');
                    
                    let html = logs.map(l => {
                        let styled = l.replace(/\\[خطأ\\]/g, '<span style="color:#ff3b30">[ERROR]</span>')
                                      .replace(/\\[معلومة\\]/g, '<span style="color:#4fc3f7">[INFO]</span>')
                                      .replace(/\\[فحص\\]/g, '<span style="color:#ffeb3b">[SCAN]</span>')
                                      .replace(/\\[أمان\\]/g, '<span style="color:#ff9800">[SECURITY]</span>')
                                      .replace(/\\[تنظيف\\]/g, '<span style="color:#9c27b0">[PURGE]</span>');
                        return \`<div>\${styled}</div>\`;
                    }).join('');
                    
                    if (term.innerHTML !== html) {
                        term.innerHTML = html;
                        term.scrollTop = term.scrollHeight;
                    }
                } catch(e) {}
            }

            async function logoutBot() {
                if(await showConfirmModal(dict.logout_confirm.replace(/<[^>]*>?/gm, ''))) {
                    renderDashboardStatus(dict.logging_out.replace(/<[^>]*>?/gm, '').trim(), 'terminating');
                    await fetch('/api/logout', { method: 'POST' });
                }
            }

            async function signOutSession() {
                if (firstLoginEnforced) return;
                if (!await showConfirmModal(dict.signout_confirm.replace(/<[^>]*>?/gm, ''))) return;
                try {
                    await fetch('/auth/logout', { method: 'POST' });
                } catch (e) {}
                window.location.href = '/login';
            }

            const pageTitles = {
                'page-status': '${t("حالة الاتصال", "Connection Status")}',
                'page-blacklist': '${t("إدارة الأرقام", "Manage Numbers")}',
                'page-general': '${t("الإعدادات العامة", "General Settings")}',
                'page-spam': '${t("مكافحة الإزعاج", "Anti-Spam")}',
                'page-media': '${t("فلتر الوسائط", "Media Filter")}',
                'page-ai': '${t("الذكاء الاصطناعي", "AI Moderator")}',
                'page-global-qa': '${t("الأسئلة العامة", "Global Q&A")}',
                'page-groups': '${t("المجموعات المخصصة", "Custom Groups")}',
                'page-import-export': '${t("استيراد/تصدير", "Import/Export")}',
                'page-users': '${t("إدارة المستخدمين", "User Management")}',
                'page-about': '${t("حول", "About")}'
            };
            function showPage(pageId, btn) {
                document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
                document.getElementById(pageId).classList.add('active');
                document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                if(btn) btn.classList.add('active');
                document.getElementById('topbarTitle').textContent = pageTitles[pageId] || '';
                closeSidebar();
                if (pageId === 'page-groups') {
                    document.getElementById('groupsListView').style.display = 'block';
                    document.getElementById('groupsDetailView').style.display = 'none';
                }
                if (pageId === 'page-users') {
                    umLoadData();
                }
            }
            function toggleSidebar() {
                document.getElementById('sidebar').classList.toggle('open');
                document.getElementById('sidebarOverlay').classList.toggle('open');
            }
            function closeSidebar() {
                document.getElementById('sidebar').classList.remove('open');
                document.getElementById('sidebarOverlay').classList.remove('open');
            }
            function showToast(msg) {
                const t = document.getElementById('saveMsgToast');
                if(msg) t.innerHTML = msg;
                t.classList.add('show');
                setTimeout(() => t.classList.remove('show'), 3000);
            }

            const umState = {
                users: [],
                permissionGroups: [],
                waGroups: [],
                selectedUserId: null,
                selectedUserAccess: null,
                loaded: false
            };
            const umNoUsersText = '${t('لا يوجد مستخدمون حالياً', 'No users yet')}';
            const umNoPermsText = '${t('لا توجد مجموعات صلاحيات', 'No permission groups')}';
            const umSelectText = '${t('اختيار', 'Select')}';
            const umDeleteText = '${t('حذف', 'Delete')}';
            const umCreatePermCatalog = [
                'dashboard:read',
                'groups:view',
                'config:write',
                'config:write-scoped',
                'security:manage',
                'media:manage',
                'import-export:manage',
                'bot:logout',
                'logs:view',
                'users:manage',
                '*'
            ];
            const umPermissionDescriptions = {
                'dashboard:read': {
                    ar: 'عرض لوحة التحكم والحالة العامة.',
                    en: 'View dashboard pages and overall status.'
                },
                'groups:view': {
                    ar: 'عرض المجموعات وبياناتها داخل النظام.',
                    en: 'View WhatsApp groups and related data.'
                },
                'config:write': {
                    ar: 'تعديل جميع الإعدادات العامة وإعدادات المجموعات.',
                    en: 'Edit all global and group configuration.'
                },
                'config:write-scoped': {
                    ar: 'تعديل الإعدادات فقط ضمن المجموعات المسموح بها للمستخدم.',
                    en: 'Edit settings only for groups assigned to this user.'
                },
                'security:manage': {
                    ar: 'إدارة القوائم السوداء/البيضاء وإجراءات الأمان.',
                    en: 'Manage blacklist/whitelist and security actions.'
                },
                'media:manage': {
                    ar: 'رفع/حذف وإدارة الوسائط الخاصة بالمجموعات.',
                    en: 'Upload/delete/manage group media files.'
                },
                'import-export:manage': {
                    ar: 'استخدام أدوات الاستيراد والتصدير للبيانات.',
                    en: 'Use data import and export tools.'
                },
                'bot:logout': {
                    ar: 'فصل جلسة واتساب (تسجيل خروج البوت).',
                    en: 'Disconnect WhatsApp session (bot logout).'
                },
                'logs:view': {
                    ar: 'عرض سجل الأحداث والعمليات.',
                    en: 'View event and activity logs.'
                },
                'users:manage': {
                    ar: 'إدارة المستخدمين والصلاحيات.',
                    en: 'Manage users and permissions.'
                },
                '*': {
                    ar: 'وصول كامل لكل الصلاحيات بدون قيود.',
                    en: 'Full unrestricted access to all permissions.'
                }
            };
            const umNoCreatePermsText = '${t('لم يتم اختيار أي صلاحيات', 'No permissions selected')}';
            let umCreatePermSet = new Set();
            let umEditingPermGroupId = null;

            async function umApi(url, options = {}) {
                const res = await fetch(url, options);
                const text = await res.text();
                const contentType = res.headers.get('content-type') || '';

                let data = null;
                if (text) {
                    if (contentType.includes('application/json')) {
                        try { data = JSON.parse(text); } catch (e) { data = null; }
                    } else {
                        try { data = JSON.parse(text); } catch (e) { data = { message: text }; }
                    }
                }

                if (!res.ok) {
                    throw new Error((data && (data.error || data.message)) || (currentLang === 'en' ? 'Request failed' : 'فشل الطلب'));
                }

                return data;
            }

            function umSetStatus(elId, msg, isErr = false) {
                const el = document.getElementById(elId);
                if (!el) return;
                el.textContent = msg || '';
                el.style.color = isErr ? 'var(--red)' : 'var(--text-muted)';
            }

            function umUpdateSummary() {
                const usersCountEl = document.getElementById('um_users_count');
                const superadminsCountEl = document.getElementById('um_superadmins_count');
                const permsCountEl = document.getElementById('um_perm_count');
                if (usersCountEl) usersCountEl.textContent = String((umState.users || []).length);
                if (superadminsCountEl) superadminsCountEl.textContent = String((umState.users || []).filter(u => u.is_superadmin).length);
                if (permsCountEl) permsCountEl.textContent = String((umState.permissionGroups || []).length);
            }

            function umEscapeHtml(value) {
                return String(value)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');
            }

            async function umLoadData(force = false) {
                if (umState.loaded && !force) return;
                try {
                    const [users, permissionGroups, waGroups] = await Promise.all([
                        umApi('/api/users'),
                        umApi('/api/access/permission-groups'),
                        umApi('/api/groups')
                    ]);
                    umState.users = users || [];
                    umState.permissionGroups = permissionGroups || [];
                    umState.waGroups = waGroups || [];
                    umState.loaded = true;
                    umUpdateSummary();
                    umRenderUsers();
                    umRenderPermissionGroups();
                    umRenderSelectedUserAccess();
                } catch (e) {
                    umSetStatus('um_create_status', e.message, true);
                }
            }

            function umRenderUsers() {
                const container = document.getElementById('um_users_list');
                if (!container) return;
                if (!umState.users.length) {
                    container.innerHTML = '<p style="color:var(--text-muted);">' + umNoUsersText + '</p>';
                    return;
                }

                container.innerHTML = umState.users.map(user => {
                    const activeTxt = user.is_active ? (currentLang === 'en' ? 'Active' : 'مفعل') : (currentLang === 'en' ? 'Disabled' : 'معطل');
                    const superTxt = user.is_superadmin ? '<span class="chip" style="margin-inline-start:6px;">' + (currentLang === 'en' ? 'Superadmin' : 'مدير عام') + '</span>' : '';
                    const activeClass = user.is_active ? 'green' : 'red';
                    const selectedClass = Number(umState.selectedUserId) === Number(user.id) ? ' um-selected-user' : '';
                    return '' +
                        '<div class="group-list-card' + selectedClass + '" style="padding:12px 14px;margin-bottom:10px;align-items:center;" onclick="umSelectUser(' + user.id + ')">' +
                            '<div class="glc-info">' +
                                '<div class="glc-name">' + umEscapeHtml(user.display_name) + ' <span class="mono">(' + umEscapeHtml(user.username) + ')</span></div>' +
                                '<div class="glc-chips" style="margin-top:6px;">' +
                                    '<span class="glc-chip ' + activeClass + '">' + activeTxt + '</span>' +
                                    superTxt +
                                '</div>' +
                            '</div>' +
                            '<button type="button" class="btn btn-sm btn-blue" onclick="event.stopPropagation();umSelectUser(' + user.id + ')"><i class="fas fa-hand-pointer"></i> ' + umSelectText + '</button>' +
                        '</div>';
                }).join('');
            }

            function umRenderPermissionGroups() {
                const container = document.getElementById('um_perm_groups_list');
                if (!container) return;
                if (!umState.permissionGroups.length) {
                    container.innerHTML = '<p style="color:var(--text-muted);">' + umNoPermsText + '</p>';
                    return;
                }

                container.innerHTML = umState.permissionGroups.map(group => {
                    const perms = Array.isArray(group.permissions) ? group.permissions : [];
                    const permsHtml = perms.map(p => '<span class="chip">' + umEscapeHtml(p) + '</span>').join('');
                    return '' +
                        '<div class="card" style="padding:12px;margin-bottom:10px;">' +
                            '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">' +
                                '<div>' +
                                    '<strong>' + umEscapeHtml(group.name) + '</strong>' +
                                    '<div style="color:var(--text-muted);font-size:12px;">' + umEscapeHtml(group.description || '') + '</div>' +
                                '</div>' +
                                '<div style="display:flex;gap:8px;">' +
                                    '<button type="button" class="btn btn-sm btn-blue" onclick="umEditPermissionGroup(' + group.id + ')"><i class="fas fa-pen"></i> ' + (currentLang === 'en' ? 'Edit' : 'تعديل') + '</button>' +
                                    '<button type="button" class="btn btn-sm btn-danger" onclick="umDeletePermissionGroup(' + group.id + ')"><i class="fas fa-trash"></i> ' + umDeleteText + '</button>' +
                                '</div>' +
                            '</div>' +
                            '<div class="chip-container" style="margin-top:8px;max-height:80px;">' + permsHtml + '</div>' +
                        '</div>';
                }).join('');
            }

            async function umSelectUser(userId) {
                umState.selectedUserId = userId;
                try {
                    umState.selectedUserAccess = await umApi('/api/users/' + userId + '/access');
                    umRenderSelectedUserAccess();
                } catch (e) {
                    umSetStatus('um_access_status', e.message, true);
                }
            }

            function umRenderSelectedUserAccess() {
                const meta = document.getElementById('um_selected_user');
                const permBox = document.getElementById('um_assign_perm_groups');
                const waBox = document.getElementById('um_assign_wa_groups');
                if (!meta || !permBox || !waBox) return;

                if (!umState.selectedUserId || !umState.selectedUserAccess) {
                    meta.textContent = currentLang === 'en' ? 'Select a user from the list' : 'اختر مستخدماً من القائمة';
                    permBox.innerHTML = '';
                    waBox.innerHTML = '';
                    return;
                }

                const user = umState.users.find(u => u.id === umState.selectedUserId);
                meta.innerHTML = user
                    ? (currentLang === 'en' ? 'Editing:' : 'تعديل:') + ' <strong>' + umEscapeHtml(user.display_name) + '</strong> <span class="mono">(' + umEscapeHtml(user.username) + ')</span>'
                    : (currentLang === 'en' ? 'User:' : 'المستخدم:') + ' #' + umState.selectedUserId;

                const selectedPermIds = new Set((umState.selectedUserAccess.permissionGroupIds || []).map(Number));
                permBox.innerHTML = umState.permissionGroups.map(group => {
                    const checked = selectedPermIds.has(Number(group.id)) ? 'checked' : '';
                    return '<label class="cb-label" style="display:flex;margin:0 0 8px 0;justify-content:flex-start;">' +
                        '<input type="checkbox" data-role="um-perm" value="' + group.id + '" ' + checked + '> ' + umEscapeHtml(group.name) +
                    '</label>';
                }).join('');

                const selectedWaIds = new Set(umState.selectedUserAccess.allowedGroupIds || []);
                waBox.innerHTML = umState.waGroups.map(group => {
                    const checked = selectedWaIds.has(group.id) ? 'checked' : '';
                    return '<label class="cb-label" style="display:flex;margin:0 0 8px 0;justify-content:flex-start;">' +
                        '<input type="checkbox" data-role="um-wa" value="' + group.id + '" ' + checked + '> ' + umEscapeHtml(group.name || group.id) +
                    '</label>';
                }).join('');
            }

            async function umCreateUser() {
                try {
                    const usernameRaw = document.getElementById('um_create_username').value;
                    const displayNameRaw = document.getElementById('um_create_display_name').value;
                    const passwordRaw = document.getElementById('um_create_password').value;
                    const role = document.getElementById('um_create_quick_role').value;
                    const scope = document.getElementById('um_create_group_scope').value;

                    const isAdminByRole = role === 'admin';
                    const isSuperadmin = document.getElementById('um_create_superadmin').checked || isAdminByRole;

                    await umApi('/api/users/create', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            username: usernameRaw,
                            displayName: displayNameRaw,
                            password: passwordRaw,
                            isSuperadmin
                        })
                    });

                    await umLoadData(true);

                    const usernameNorm = String(usernameRaw || '').trim().toLowerCase();
                    const createdUser = umState.users.find(u => String(u.username || '').toLowerCase() === usernameNorm);

                    if (createdUser && !isSuperadmin && role !== 'custom') {
                        const roleName = role === 'viewer' ? 'Viewer' : 'Operator';
                        const roleGroup = umState.permissionGroups.find(g => String(g.name || '').toLowerCase() === roleName.toLowerCase());
                        const permissionGroupIds = roleGroup ? [roleGroup.id] : [];
                        const allowedGroupIds = scope === 'all' ? umState.waGroups.map(g => g.id) : [];

                        await umApi('/api/users/' + createdUser.id + '/access', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ permissionGroupIds, allowedGroupIds, settings: {} })
                        });
                    }

                    umSetStatus('um_create_status', currentLang === 'en' ? 'User created and configured successfully' : 'تم إنشاء المستخدم وضبط الصلاحيات بنجاح');
                    document.getElementById('um_create_password').value = '';
                    await umLoadData(true);
                } catch (e) {
                    umSetStatus('um_create_status', e.message, true);
                }
            }

            async function umCreatePermissionGroup() {
                try {
                    const permissions = Array.from(umCreatePermSet);
                    if (!permissions.length) {
                        throw new Error(currentLang === 'en' ? 'Select at least one permission' : 'اختر صلاحية واحدة على الأقل');
                    }
                    const isEditMode = umEditingPermGroupId !== null;
                    await umApi(isEditMode ? '/api/access/permission-groups/update' : '/api/access/permission-groups/create', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id: isEditMode ? umEditingPermGroupId : undefined,
                            name: document.getElementById('um_perm_name').value,
                            description: document.getElementById('um_perm_desc').value,
                            permissions
                        })
                    });
                    umResetPermissionForm(false);
                    umSetStatus('um_perm_status', isEditMode
                        ? (currentLang === 'en' ? 'Permission group updated' : 'تم تحديث مجموعة الصلاحيات')
                        : (currentLang === 'en' ? 'Permission group created' : 'تم إنشاء مجموعة الصلاحيات'));
                    await umLoadData(true);
                } catch (e) {
                    umSetStatus('um_perm_status', e.message, true);
                }
            }

            async function umDeletePermissionGroup(id) {
                if (!await showConfirmModal(currentLang === 'en' ? 'Delete this permission group?' : 'هل تريد حذف مجموعة الصلاحيات؟')) return;
                try {
                    await umApi('/api/access/permission-groups/delete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id })
                    });
                    if (umEditingPermGroupId !== null && Number(umEditingPermGroupId) === Number(id)) {
                        umResetPermissionForm(false);
                    }
                    umSetStatus('um_perm_status', currentLang === 'en' ? 'Permission group deleted' : 'تم حذف مجموعة الصلاحيات');
                    await umLoadData(true);
                } catch (e) {
                    umSetStatus('um_perm_status', e.message, true);
                }
            }

            async function umSaveSelectedUserAccess() {
                if (!umState.selectedUserId) {
                    umSetStatus('um_access_status', currentLang === 'en' ? 'Select a user first' : 'اختر مستخدماً أولاً', true);
                    return;
                }
                try {
                    const permissionGroupIds = Array.from(document.querySelectorAll('input[data-role="um-perm"]:checked')).map(cb => Number(cb.value));
                    const allowedGroupIds = Array.from(document.querySelectorAll('input[data-role="um-wa"]:checked')).map(cb => cb.value);
                    await umApi('/api/users/' + umState.selectedUserId + '/access', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ permissionGroupIds, allowedGroupIds, settings: {} })
                    });
                    umSetStatus('um_access_status', currentLang === 'en' ? 'Access saved successfully' : 'تم حفظ الوصول بنجاح');
                    await umSelectUser(umState.selectedUserId);
                    await umLoadData(true);
                } catch (e) {
                    umSetStatus('um_access_status', e.message, true);
                }
            }

            async function umDeleteSelectedUser() {
                if (!umState.selectedUserId) {
                    umSetStatus('um_access_status', currentLang === 'en' ? 'Select a user first' : 'اختر مستخدماً أولاً', true);
                    return;
                }
                if (!await showConfirmModal(currentLang === 'en' ? 'Delete selected user?' : 'هل تريد حذف المستخدم المحدد؟')) return;
                try {
                    await umApi('/api/users/delete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: umState.selectedUserId })
                    });
                    umSetStatus('um_access_status', currentLang === 'en' ? 'User deleted' : 'تم حذف المستخدم');
                    umState.selectedUserId = null;
                    umState.selectedUserAccess = null;
                    await umLoadData(true);
                } catch (e) {
                    umSetStatus('um_access_status', e.message, true);
                }
            }

            function umUsePermPreset(preset) {
                const presets = {
                    viewer: ['dashboard:read', 'groups:view', 'logs:view'],
                    operator: ['dashboard:read', 'groups:view', 'config:write', 'security:manage', 'media:manage', 'import-export:manage', 'bot:logout', 'logs:view', 'users:manage'],
                    admin: ['*']
                };
                const lines = presets[preset] || [];
                umCreatePermSet = new Set(lines);
                umRenderCreatePermPicker();
                umRenderCreatePermSelection();
            }

            function umTogglePermissionGroupsDrawer(forceOpen = null) {
                const drawer = document.getElementById('um_perm_drawer');
                const icon = document.getElementById('um_perm_drawer_icon');
                if (!drawer || !icon) return;

                const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : !drawer.classList.contains('open');
                drawer.classList.toggle('open', shouldOpen);
                icon.className = shouldOpen ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
            }

            function umRenderCreatePermPicker() {
                const picker = document.getElementById('um_perm_picker');
                if (!picker) return;
                picker.innerHTML = '';
                umCreatePermCatalog.forEach(permission => {
                    const label = document.createElement('label');
                    label.className = 'cb-label';
                    label.style.margin = '0';

                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.checked = umCreatePermSet.has(permission);
                    checkbox.addEventListener('change', () => umToggleCreatePerm(permission, checkbox.checked));
                    label.appendChild(checkbox);

                    const text = document.createElement('span');
                    text.textContent = ' ' + permission;
                    label.appendChild(text);

                    picker.appendChild(label);
                });
            }

            function umRenderPermissionHelp() {
                const helpBox = document.getElementById('um_perm_help');
                if (!helpBox) return;
                helpBox.innerHTML = umCreatePermCatalog.map(permission => {
                    const desc = umPermissionDescriptions[permission] || {
                        ar: 'صلاحية مخصصة.',
                        en: 'Custom permission.'
                    };
                    const text = currentLang === 'en' ? desc.en : desc.ar;
                    return '<div class="um-perm-help-item">' +
                        '<div class="um-perm-help-key">' + umEscapeHtml(permission) + '</div>' +
                        '<div class="um-perm-help-desc">' + umEscapeHtml(text) + '</div>' +
                    '</div>';
                }).join('');
            }

            function umRenderCreatePermSelection() {
                const selected = document.getElementById('um_perm_selected');
                if (!selected) return;
                const permissions = Array.from(umCreatePermSet);
                if (!permissions.length) {
                    selected.innerHTML = '<span style="color:var(--text-muted);font-size:13px;">' + umNoCreatePermsText + '</span>';
                    return;
                }
                selected.innerHTML = '';
                permissions.forEach(permission => {
                    const chip = document.createElement('span');
                    chip.className = 'chip';
                    chip.textContent = permission;

                    const remove = document.createElement('span');
                    remove.className = 'chip-remove';
                    remove.innerHTML = '&times;';
                    remove.addEventListener('click', () => umRemoveCreatePerm(permission));
                    chip.appendChild(document.createTextNode(' '));
                    chip.appendChild(remove);

                    selected.appendChild(chip);
                });
            }

            function umResetPermissionForm(clearStatus = true) {
                umEditingPermGroupId = null;
                const nameEl = document.getElementById('um_perm_name');
                const descEl = document.getElementById('um_perm_desc');
                const customEl = document.getElementById('um_perm_custom');
                const submitBtn = document.getElementById('um_perm_submit_btn');
                const cancelBtn = document.getElementById('um_perm_cancel_btn');

                if (nameEl) nameEl.value = '';
                if (descEl) descEl.value = '';
                if (customEl) customEl.value = '';

                umCreatePermSet = new Set();
                umRenderCreatePermPicker();
                umRenderCreatePermSelection();

                if (submitBtn) {
                    submitBtn.innerHTML = '<i class="fas fa-plus"></i> ' + (currentLang === 'en' ? 'Create Group' : 'إضافة المجموعة');
                }
                if (cancelBtn) cancelBtn.style.display = 'none';
                if (clearStatus) umSetStatus('um_perm_status', '');
            }

            function umEditPermissionGroup(id) {
                const group = umState.permissionGroups.find(g => Number(g.id) === Number(id));
                if (!group) {
                    umSetStatus('um_perm_status', currentLang === 'en' ? 'Permission group not found' : 'لم يتم العثور على مجموعة الصلاحيات', true);
                    return;
                }

                umEditingPermGroupId = Number(group.id);

                const nameEl = document.getElementById('um_perm_name');
                const descEl = document.getElementById('um_perm_desc');
                const submitBtn = document.getElementById('um_perm_submit_btn');
                const cancelBtn = document.getElementById('um_perm_cancel_btn');

                if (nameEl) nameEl.value = group.name || '';
                if (descEl) descEl.value = group.description || '';
                umCreatePermSet = new Set(Array.isArray(group.permissions) ? group.permissions : []);

                umRenderCreatePermPicker();
                umRenderCreatePermSelection();

                if (submitBtn) {
                    submitBtn.innerHTML = '<i class="fas fa-save"></i> ' + (currentLang === 'en' ? 'Save Changes' : 'حفظ التعديلات');
                }
                if (cancelBtn) cancelBtn.style.display = 'inline-flex';

                umTogglePermissionGroupsDrawer(true);
                umSetStatus('um_perm_status', currentLang === 'en' ? 'Editing permission group' : 'جاري تعديل مجموعة الصلاحيات');
            }

            function umToggleCreatePerm(permission, checked) {
                if (checked) umCreatePermSet.add(permission);
                else umCreatePermSet.delete(permission);
                umRenderCreatePermSelection();
            }

            function umRemoveCreatePerm(permission) {
                umCreatePermSet.delete(permission);
                umRenderCreatePermPicker();
                umRenderCreatePermSelection();
            }

            function umAddCustomCreatePerm() {
                const input = document.getElementById('um_perm_custom');
                if (!input) return;
                const permission = String(input.value || '').trim();
                if (!permission) return;
                umCreatePermSet.add(permission);
                input.value = '';
                umRenderCreatePermPicker();
                umRenderCreatePermSelection();
            }

            function umSetAllCreatePerms(checked) {
                umCreatePermSet = checked ? new Set(umCreatePermCatalog) : new Set();
                umRenderCreatePermPicker();
                umRenderCreatePermSelection();
            }

            function umToggleAll(role, checked) {
                document.querySelectorAll('input[data-role="' + role + '"]').forEach(el => {
                    el.checked = checked;
                });
            }

            function umHandleQuickRoleChange() {
                const roleEl = document.getElementById('um_create_quick_role');
                const superEl = document.getElementById('um_create_superadmin');
                if (!roleEl || !superEl) return;
                if (roleEl.value === 'admin') superEl.checked = true;
                if (roleEl.value === 'viewer' || roleEl.value === 'operator') superEl.checked = false;
            }

            const umQuickRoleEl = document.getElementById('um_create_quick_role');
            if (umQuickRoleEl) umQuickRoleEl.addEventListener('change', umHandleQuickRoleChange);
            umRenderCreatePermPicker();
            umRenderPermissionHelp();
            umRenderCreatePermSelection();

            let defaultWordsArr = ${JSON.stringify(config.defaultWords)};
            let aiFilterTriggerWordsArr = ${JSON.stringify(config.aiFilterTriggerWords || ['نعم'])};
            let globalQAArr = ${JSON.stringify(config.globalQA || [])};
            let globalQAEditingIndex = null;
            let globalQAQuestionsDraft = [];
            let globalQAEventDatesDraft = [];
            let globalQALegacyEventDate = '';
            let globalQACurrentAnswer = '';
            let globalQAPendingMediaFile = '';
            let globalQALanguage = 'ar';
            let globalQAMediaLoaded = false;
            let blacklistArr = ${JSON.stringify(blacklistArr)}; 
            let blockedExtensionsArr = ${JSON.stringify(blockedExtensionsArr)}; 
            let whitelistArr = ${JSON.stringify(whitelistArr)}; 
            let groupsConfigObj = ${JSON.stringify(config.groupsConfig)};
            const metaTypes = ${JSON.stringify(mediaTypesMeta)};
            
            let groupsArr = Object.keys(groupsConfigObj).map(key => ({
                id: key,
                adminGroup: groupsConfigObj[key].adminGroup || '',
                adminLanguage: groupsConfigObj[key].adminLanguage || 'default',
                words: groupsConfigObj[key].words || [],
                aiFilterTriggerWords: groupsConfigObj[key].aiFilterTriggerWords || [],
                useDefaultWords: groupsConfigObj[key].useDefaultWords !== false,
                enableJoinProfileScreening: groupsConfigObj[key].enableJoinProfileScreening || false,
                enableWordFilter: groupsConfigObj[key].enableWordFilter !== false,
                enableAIFilter: groupsConfigObj[key].enableAIFilter || false,
                enableAIMedia: groupsConfigObj[key].enableAIMedia || false,
                autoAction: groupsConfigObj[key].autoAction || false,
                enableBlacklist: groupsConfigObj[key].enableBlacklist !== false,
                enableWhitelist: groupsConfigObj[key].enableWhitelist !== false,
                useGlobalBlacklist: groupsConfigObj[key].useGlobalBlacklist !== false,
                useGlobalWhitelist: groupsConfigObj[key].useGlobalWhitelist !== false,
                useGlobalQA: groupsConfigObj[key].useGlobalQA === true,
                customBlacklist: groupsConfigObj[key].customBlacklist || [],
                customWhitelist: groupsConfigObj[key].customWhitelist || [],
                enableAntiSpam: groupsConfigObj[key].enableAntiSpam || false,
                spamDuplicateLimit: groupsConfigObj[key].spamDuplicateLimit || 3,
                spamAction: groupsConfigObj[key].spamAction || 'poll',
                enableWelcomeMessage: groupsConfigObj[key].enableWelcomeMessage || false, 
                welcomeMessageText: groupsConfigObj[key].welcomeMessageText || '${t("مرحباً بك يا {user} في مجموعتنا!", "Welcome {user} to our group!")}',
                blockedTypes: groupsConfigObj[key].blockedTypes || [],
                blockedAction: groupsConfigObj[key].blockedAction || 'delete',
                spamTypes: groupsConfigObj[key].spamTypes || ['text', 'image', 'video', 'audio', 'document', 'sticker'],
                spamLimits: groupsConfigObj[key].spamLimits || {text:7, image:3, video:2, audio:3, document:3, sticker:3},
                enablePanicMode: groupsConfigObj[key].enablePanicMode || false,
                panicMessageLimit: groupsConfigObj[key].panicMessageLimit || 10,
                panicTimeWindow: groupsConfigObj[key].panicTimeWindow || 5,
                panicLockoutDuration: groupsConfigObj[key].panicLockoutDuration || 10,
                panicAlertTarget: groupsConfigObj[key].panicAlertTarget || 'both',
                panicAlertMessage: groupsConfigObj[key].panicAlertMessage || '${t("🚨 عذراً، تم رصد هجوم (Raid)! سيتم إغلاق المجموعة لمدة {time} دقائق.", "🚨 Raid detected! Group is locked for {time} minutes.")}',
                enableQAFeature: groupsConfigObj[key].enableQAFeature || false,
                qaList: groupsConfigObj[key].qaList || [],
                eventDate: groupsConfigObj[key].eventDate || '',
                eventDates: groupsConfigObj[key].eventDates || [],
                qaLanguage: groupsConfigObj[key].qaLanguage || 'ar',
                currentQAQuestions: [],
                currentQAAnswer: '',
                editingQAIndex: null
            }));

            let currentDetailIndex = null;

            function switchGroupTab(groupIndex, tabName, btn) {
                document.querySelectorAll('#gtabs_' + groupIndex + ' .group-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('[id^="gtab_' + groupIndex + '_"]').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                const panel = document.getElementById('gtab_' + groupIndex + '_' + tabName);
                if (panel) panel.classList.add('active');
            }

            function renderGroups() {
                const container = document.getElementById('groupsContainer');
                container.innerHTML = '';

                if (groupsArr.length === 0) {
                    container.innerHTML = \`<div style="text-align:center; padding:60px 20px; color:var(--text-muted);">
                        <i class="fas fa-users-cog" style="font-size:48px; margin-bottom:16px; display:block; opacity:0.3;"></i>
                        <div style="font-size:16px; font-weight:600;">\${currentLang === 'en' ? 'No custom groups yet' : 'لا توجد مجموعات مخصصة بعد'}</div>
                        <div style="font-size:13px; margin-top:6px;">\${currentLang === 'en' ? 'Click "Add Group" to get started' : 'اضغط على "إضافة مجموعة" للبدء'}</div>
                    </div>\`;
                    return;
                }

                groupsArr.forEach((group, groupIndex) => {
                    const knownGroup = fetchedGroups.find(g => g.id === group.id);
                    const groupName = knownGroup ? knownGroup.name : (group.id ? group.id.split('@')[0].slice(-10) + '...' : dict.no_id);
                    const initials = groupName.replace(/[^\u0600-\u06FFa-zA-Z]/g, '').slice(0, 2) || '؟';
                    const shortGroupId = group.id ? group.id.split('@')[0] : '';

                    let chips = '';
                    if (group.enablePanicMode) chips += \`<span class="glc-chip orange"><i class="fas fa-radiation"></i> \${currentLang==='en'?'Panic Mode':'طوارئ'}</span>\`;
                    if (group.enableAntiSpam)  chips += \`<span class="glc-chip orange"><i class="fas fa-shield-alt"></i> Anti-Spam</span>\`;
                    if (group.enableAIFilter)  chips += \`<span class="glc-chip blue"><i class="fas fa-brain"></i> AI</span>\`;
                    if (group.enableWordFilter) chips += \`<span class="glc-chip green"><i class="fas fa-filter"></i> \${currentLang==='en'?'Word Filter':'فلتر كلمات'}</span>\`;
                    if (group.enableWelcomeMessage) chips += \`<span class="glc-chip green"><i class="fas fa-door-open"></i> \${currentLang==='en'?'Welcome':'ترحيب'}</span>\`;
                    if (group.blockedTypes && group.blockedTypes.length > 0) chips += \`<span class="glc-chip red"><i class="fas fa-ban"></i> \${group.blockedTypes.length} \${currentLang==='en'?'blocked':'ممنوع'}</span>\`;

                    const enabledCount = [
                        group.enablePanicMode,
                        group.enableAntiSpam,
                        group.enableAIFilter,
                        group.enableWordFilter,
                        group.enableWelcomeMessage,
                        group.enableJoinProfileScreening,
                        group.enableWhitelist,
                        group.enableBlacklist
                    ].filter(Boolean).length;

                    const card = document.createElement('div');
                    card.className = 'group-list-card';
                    card.onclick = () => openGroupDetail(groupIndex);
                    card.innerHTML = \`
                        <div class="glc-avatar">\${initials}</div>
                        <div class="glc-info">
                            <div class="glc-name">\${groupName}</div>
                            \${group.id ? \`<span class="glc-id" title="\${umEscapeHtml(group.id)}">\${shortGroupId}</span>\` : \`<span style="color:var(--orange);font-size:12px;">\${dict.no_id}</span>\`}
                            \${chips ? \`<div class="glc-chips">\${chips}</div>\` : ''}
                        </div>
                        <div class="glc-side">
                            <div class="glc-stats">
                                <strong>\${enabledCount}</strong>
                                <span>\${currentLang === 'en' ? 'active' : 'مفعل'}</span>
                            </div>
                            <i class="fas fa-chevron-\${currentLang==='en'?'right':'left'} glc-arrow"></i>
                        </div>
                    \`;
                    container.appendChild(card);
                });
            }

            function openGroupDetail(groupIndex) {
                currentDetailIndex = groupIndex;
                const group = groupsArr[groupIndex];
                const knownGroup = fetchedGroups.find(g => g.id === group.id);
                const groupName = knownGroup ? knownGroup.name : (group.id || dict.no_id);
                const initials = groupName.replace(/[^\u0600-\u06FFa-zA-Z]/g, '').slice(0, 2) || '؟';

                const av = document.getElementById('detailGroupAvatar');
                av.textContent = initials;
                document.getElementById('detailGroupName').textContent = groupName;
                document.getElementById('detailGroupId').textContent = group.id || dict.no_id;

                document.getElementById('detailDeleteBtn').onclick = async () => {
                    if (await showConfirmModal(dict.delete_confirm.replace(/<[^>]*>?/gm, ''))) {
                        groupsArr.splice(groupIndex, 1);
                        closeGroupDetail();
                    }
                };

                renderGroupDetailBody(groupIndex);

                document.getElementById('groupsListView').style.display = 'none';
                document.getElementById('groupsDetailView').style.display = 'block';
            }

            function closeGroupDetail() {
                document.getElementById('groupsDetailView').style.display = 'none';
                document.getElementById('groupsListView').style.display = 'block';
                currentDetailIndex = null;
                renderGroups();
            }

            function renderGroupChips(groupIndex, type) {
                const group = groupsArr[groupIndex];
                let html = '';
                let containerId = '';
                if (type === 'words') {
                    html = group.words.map((word, wordIndex) => \`<div class="chip">\${word} <span class="chip-remove" onclick="removeGroupWord(\${groupIndex}, \${wordIndex})">&times;</span></div>\`).join('');
                    containerId = 'chip_container_words_' + groupIndex;
                } else if (type === 'blacklist') {
                    html = group.customBlacklist.map((num, idx) => \`<div class="chip red-chip">\${num} <span class="chip-remove" onclick="removeGroupBlacklist(\${groupIndex}, \${idx})">&times;</span></div>\`).join('');
                    containerId = 'chip_container_bl_' + groupIndex;
                } else if (type === 'whitelist') {
                    html = group.customWhitelist.map((num, idx) => \`<div class="chip">\${num} <span class="chip-remove" onclick="removeGroupWhitelist(\${groupIndex}, \${idx})">&times;</span></div>\`).join('');
                    containerId = 'chip_container_wl_' + groupIndex;
                }
                const container = document.getElementById(containerId);
                if (container) container.innerHTML = html;
            }

            function renderGroupDetailBody(groupIndex, activeTab = 'general') {
                const group = groupsArr[groupIndex];
                const container = document.getElementById('groupDetailBody');

                let wordsHtml = group.words.map((word, wordIndex) => 
                    \`<div class="chip">\${word} <span class="chip-remove" onclick="removeGroupWord(\${groupIndex}, \${wordIndex})">&times;</span></div>\`
                ).join('');

                let aiWordsHtml = (group.aiFilterTriggerWords || []).map((word, wordIndex) =>
                    \`<div class="chip">\${word} <span class="chip-remove" onclick="removeGroupAITriggerWord(\${groupIndex}, \${wordIndex})">&times;</span></div>\`
                ).join('');

                let blHtml = group.customBlacklist.map((num, idx) => 
                    \`<div class="chip red-chip">\${num} <span class="chip-remove" onclick="removeGroupBlacklist(\${groupIndex}, \${idx})">&times;</span></div>\`
                ).join('');

                let wlHtml = group.customWhitelist.map((num, idx) => 
                    \`<div class="chip">\${num} <span class="chip-remove" onclick="removeGroupWhitelist(\${groupIndex}, \${idx})">&times;</span></div>\`
                ).join('');

                const blockedChecks = metaTypes.map(t => 
                    \`<label class="cb-label"><input type="checkbox" value="\${t.id}" \${group.blockedTypes.includes(t.id)?'checked':''} onchange="updateGroupArray(\${groupIndex}, 'blockedTypes', '\${t.id}', this.checked)"> \${t.icon} \${t.name}</label>\`
                ).join('');

                const spamLimitGrid = metaTypes.map(t => {
                    const isChecked = group.spamTypes.includes(t.id) ? 'checked' : '';
                    const limitVal = group.spamLimits[t.id] || 5;
                    return \`<div class="limit-item">
                        <input type="checkbox" value="\${t.id}" \${isChecked} onchange="updateGroupArray(\${groupIndex}, 'spamTypes', '\${t.id}', this.checked)">
                        <span style="font-size:13px;width:70px;">\${t.icon} \${t.name}</span>
                        <input type="number" value="\${limitVal}" min="1" onchange="updateSpamLimit(\${groupIndex}, '\${t.id}', this.value)">
                    </div>\`;
                }).join('');

                const tabs = [
                    { id: 'general', icon: 'fa-cog',        label: currentLang==='en'?'General':'عام' },
                    { id: 'filters', icon: 'fa-filter',     label: currentLang==='en'?'Filters':'فلاتر' },
                    { id: 'qa',      icon: 'fa-question',   label: currentLang==='en'?'Q&A':'س و ج' },
                    { id: 'spam',    icon: 'fa-shield-alt', label: currentLang==='en'?'Anti-Spam':'سبام' },
                    { id: 'panic',   icon: 'fa-radiation',  label: currentLang==='en'?'Panic':'طوارئ' },
                    { id: 'lists',   icon: 'fa-list',       label: currentLang==='en'?'Lists':'القوائم' },
                ];
                const tabButtons = tabs.map((tab, i) =>
                    \`<button type="button" class="group-tab \${tab.id===activeTab?'active':''}" onclick="switchGroupTab(\${groupIndex},'\${tab.id}',this)\${tab.id==='qa'?';loadGroupMedia('+groupIndex+')':\'\'}"\><i class="fas \${tab.icon}"></i> \${tab.label}</button>\`
                ).join('');

                container.innerHTML = \`
                    <div class="field-row" style="margin-bottom:20px;">
                        <div class="field-group" style="margin-bottom:0;">
                            <label class="field-label">\${dict.target_group}</label>
                            \${createGroupSelectHTML(group.id, \`updateGroupData(\${groupIndex}, 'id', this.value)\`, false)}
                        </div>
                        <div class="field-group" style="margin-bottom:0;">
                            <label class="field-label">\${dict.admin_group}</label>
                            \${createGroupSelectHTML(group.adminGroup, \`updateGroupData(\${groupIndex}, 'adminGroup', this.value)\`, true)}
                        </div>
                        <div class="field-group" style="margin-bottom:0;">
                            <label class="field-label">\${dict.admin_msg_lang}</label>
                            <select onchange="updateGroupData(\${groupIndex}, 'adminLanguage', this.value)">
                                <option value="default" \${group.adminLanguage==='default'?'selected':''}>\${dict.use_default_lang}</option>
                                <option value="ar" \${group.adminLanguage==='ar'?'selected':''}>\${dict.lang_ar}</option>
                                <option value="en" \${group.adminLanguage==='en'?'selected':''}>\${dict.lang_en}</option>
                            </select>
                        </div>
                    </div>

                    <div class="group-tabs" id="gtabs_\${groupIndex}">\${tabButtons}</div>

                    <div class="group-tab-panel \${activeTab==='general'?'active':''}" id="gtab_\${groupIndex}_general">
                        <div class="sub-panel red" style="margin-bottom:16px;">
                            <h4 style="color:var(--red);">\${dict.blocked_types}</h4>
                            <div class="cb-group" style="margin-bottom:10px;">\${blockedChecks}</div>
                            <label class="field-label">\${dict.block_action}</label>
                            <select onchange="updateGroupData(\${groupIndex}, 'blockedAction', this.value)">
                                <option value="delete" \${group.blockedAction==='delete'?'selected':''}>\${dict.act_del}</option>
                                <option value="poll" \${group.blockedAction==='poll'?'selected':''}>\${dict.act_poll}</option>
                                <option value="auto" \${group.blockedAction==='auto'?'selected':''}>\${dict.act_auto}</option>
                            </select>
                        </div>
                        <div class="card success">
                            <div class="toggle-row green" style="margin-bottom:0;border-radius:10px;">
                                <div class="toggle-left">
                                    <label class="switch"><input type="checkbox" \${group.enableWelcomeMessage?'checked':''} onchange="toggleGroupPanel(\${groupIndex},'welcome',this.checked)"><span class="slider"></span></label>
                                    <div class="toggle-label green">\${dict.welcome_msg}<small>\${dict.welcome_desc}</small></div>
                                </div>
                            </div>
                            <div id="group_welcome_panel_\${groupIndex}" style="overflow:hidden;max-height:\${group.enableWelcomeMessage?'200px':'0px'};opacity:\${group.enableWelcomeMessage?'1':'0'};transition:max-height 0.45s ease,opacity 0.35s ease,margin-top 0.35s ease;margin-top:\${group.enableWelcomeMessage?'20px':'0px'};">
                                <label class="field-label">\${dict.msg_text}</label>
                                <textarea rows="2" onchange="updateGroupData(\${groupIndex}, 'welcomeMessageText', this.value)">\${group.welcomeMessageText}</textarea>
                            </div>
                        </div>
                        <div class="toggle-row pink" style="margin-bottom:0;">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" \${group.autoAction?'checked':''} onchange="updateGroupToggle(\${groupIndex},'autoAction',this.checked)"><span class="slider"></span></label>
                                <div class="toggle-label pink">\${dict.direct_del}</div>
                            </div>
                        </div>
                    </div>

                    <div class="group-tab-panel \${activeTab==='filters'?'active':''}" id="gtab_\${groupIndex}_filters">
                        <div class="card warning">
                            <div class="toggle-row warning" style="margin-bottom:0;border-radius:10px;">
                                <div class="toggle-left">
                                    <label class="switch"><input type="checkbox" \${group.enableWordFilter?'checked':''} onchange="toggleGroupPanel(\${groupIndex},'words',this.checked)"><span class="slider"></span></label>
                                    <div class="toggle-label warning">\${dict.word_filter}<small>\${dict.wf_desc}</small></div>
                                </div>
                            </div>
                            <div id="group_words_panel_\${groupIndex}" style="overflow:hidden;max-height:\${group.enableWordFilter?'600px':'0px'};opacity:\${group.enableWordFilter?'1':'0'};transition:max-height 0.45s ease,opacity 0.35s ease,margin-top 0.35s ease;margin-top:\${group.enableWordFilter?'20px':'0px'};">
                                <div class="toggle-row" style="margin-bottom:14px;background:rgba(255,255,255,0.04);border-color:rgba(255,171,64,0.25);">
                                    <div class="toggle-left">
                                        <label class="switch"><input type="checkbox" \${group.useDefaultWords?'checked':''} onchange="updateGroupToggle(\${groupIndex},'useDefaultWords',this.checked)"><span class="slider"></span></label>
                                        <div class="toggle-label">\${dict.use_global}<small>\${dict.ug_desc}</small></div>
                                    </div>
                                </div>
                                <label class="field-label">\${dict.custom_words}</label>
                                <div class="input-with-btn" style="margin-bottom:10px;">
                                    <input type="text" id="newGroupWord_\${groupIndex}" placeholder="..." onkeypress="if(event.key==='Enter'){event.preventDefault();addGroupWord(\${groupIndex});}">
                                    <button type="button" class="btn btn-primary btn-sm" onclick="addGroupWord(\${groupIndex})"><i class="fas fa-plus"></i> \${dict.add}</button>
                                </div>
                                <div class="chip-container" id="chip_container_words_\${groupIndex}">\${wordsHtml}</div>
                            </div>
                        </div>
                        <div class="toggle-row blue" style="margin-bottom:12px;">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" \${group.enableAIFilter?'checked':''} onchange="updateGroupToggle(\${groupIndex},'enableAIFilter',this.checked)"><span class="slider"></span></label>
                                <div class="toggle-label blue">\${dict.ai_text}</div>
                            </div>
                        </div>
                        <div style="margin-bottom:12px; padding:14px; background:var(--input-bg); border:1.5px dashed var(--card-border); border-radius:10px;">
                            <label class="field-label">\${dict.ai_trigger_words_group}</label>
                            <p style="font-size:12px; color:var(--text-muted); margin-bottom:10px;">\${dict.ai_trigger_words_desc_group}</p>
                            <div class="input-with-btn" style="margin-bottom:10px;">
                                <input type="text" id="newGroupAITriggerWord_\${groupIndex}" placeholder="..." onkeypress="if(event.key==='Enter'){event.preventDefault();addGroupAITriggerWord(\${groupIndex});}">
                                <button type="button" class="btn btn-primary btn-sm" onclick="addGroupAITriggerWord(\${groupIndex})"><i class="fas fa-plus"></i> \${dict.add}</button>
                            </div>
                            <div class="chip-container" id="chip_container_ai_words_\${groupIndex}">\${aiWordsHtml}</div>
                        </div>
                        <div class="toggle-row purple" style="margin-bottom:0;">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" \${group.enableAIMedia?'checked':''} onchange="updateGroupToggle(\${groupIndex},'enableAIMedia',this.checked)"><span class="slider"></span></label>
                                <div class="toggle-label purple">\${dict.ai_vision}</div>
                            </div>
                        </div>
                        <div class="toggle-row blue" style="margin-top:12px; margin-bottom:0;">
                            <div class="toggle-left">
                                <label class="switch"><input type="checkbox" \${group.enableJoinProfileScreening?'checked':''} onchange="updateGroupToggle(\${groupIndex},'enableJoinProfileScreening',this.checked)"><span class="slider"></span></label>
                                <div class="toggle-label blue">\${dict.join_profile_screening}<small>\${dict.join_profile_screening_desc}</small></div>
                            </div>
                        </div>
                    </div>

                    <div class="group-tab-panel \${activeTab==='qa'?'active':''}" id="gtab_\${groupIndex}_qa">
                        <div class="card info">
                            <div class="toggle-row blue" style="margin-bottom:0;border-radius:10px;">
                                <div class="toggle-left">
                                    <label class="switch"><input type="checkbox" \${group.enableQAFeature?'checked':''} onchange="toggleGroupPanel(\${groupIndex},'qa',this.checked)"><span class="slider"></span></label>
                                    <div class="toggle-label blue">\${currentLang==='en'?'Enable Q&A Feature':'تفعيل ميزة الأسئلة والأجوبة'}<small>\${currentLang==='en'?'Auto-respond to predefined questions with dynamic fields':'الإجابة التلقائية على الأسئلة المحددة مع حقول ديناميكية'}</small></div>
                                </div>
                            </div>
                            <div class="toggle-row" style="margin-top:12px; margin-bottom:0; border-color:rgba(64,196,255,0.25); background:rgba(64,196,255,0.05);">
                                <div class="toggle-left">
                                    <label class="switch"><input type="checkbox" \${group.useGlobalQA?'checked':''} onchange="updateGroupToggle(\${groupIndex},'useGlobalQA',this.checked)"><span class="slider"></span></label>
                                    <div class="toggle-label">\${currentLang==='en'?'Apply Global Q&A in this group':'تطبيق Q&A العام في هذه المجموعة'}<small>\${currentLang==='en'?'Uses entries from the Global Q&A page when no custom Q&A match is found':'يستخدم الأزواج الموجودة في صفحة Q&A العامة عند عدم تطابق س و ج المخصص'}</small></div>
                                </div>
                            </div>
                            <div id="group_qa_panel_\${groupIndex}" style="overflow-y:auto;max-height:\${group.enableQAFeature?'600px':'0px'};opacity:\${group.enableQAFeature?'1':'0'};transition:max-height 0.45s ease,opacity 0.35s ease,margin-top 0.35s ease;margin-top:\${group.enableQAFeature?'20px':'0px'};padding-right:8px;">
                                <div class="sub-panel blue" style="margin-bottom:16px;">
                                    <h4 style="color:var(--blue);">\${currentLang==='en'?'Dynamic Fields Reference':'مرجع الحقول الديناميكية'}</h4>
                                    <div style="font-size:13px;color:var(--text-muted);line-height:1.8;">
                                        <div><strong style="color:var(--blue);">{eventdate}</strong> - \${currentLang==='en'?'Primary event/deadline (first in list)':'الحدث الأساسي (الأول في القائمة)'}</div>
                                        <div><strong style="color:var(--blue);">{eventdate:Label}</strong> - \${currentLang==='en'?'Specific event by label':'حدث معين حسب العنوان'}</div>
                                        <div><strong style="color:var(--blue);">{user}</strong> - \${currentLang==='en'?'Sender username':'اسم المرسل'}</div>
                                    </div>
                                </div>
                                
                                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                                    <label class="field-label" style="margin-bottom:0;">\${currentLang==='en'?'Manage Events/Deadlines':'إدارة الأحداث والمواعيد'}</label>
                                    <button type="button" class="btn btn-primary btn-sm" onclick="addEventDate(\${groupIndex})"><i class="fas fa-plus"></i> \${currentLang==='en'?'Add Event':'إضافة حدث'}</button>
                                </div>
                                <div id="event_dates_container_\${groupIndex}" style="margin-bottom: 20px;">
                                    \${(group.currentQAEventDates || []).map((ed, edIdx) => {
                                        return \`<div class="field-row" style="margin-bottom:10px; background: rgba(255,255,255,0.02); padding: 12px; border-radius: 10px; border: 1px solid var(--card-border); align-items: flex-end; gap: 12px;">
                                            <div class="field-group" style="margin-bottom:0; flex: 1.5;">
                                                <label class="field-label" style="font-size:10px;">\${currentLang==='en'?'Label (e.g. Exam)':'العنوان (مثل: اختبار)'}</label>
                                                <input type="text" value="\${ed.label || ''}" placeholder="..." onchange="updateEventDate(\${groupIndex}, \${edIdx}, 'label', this.value)">
                                            </div>
                                            <div class="field-group" style="margin-bottom:0; flex: 1.5;">
                                                <label class="field-label" style="font-size:10px;">\${currentLang==='en'?'Date':'التاريخ'}</label>
                                                <input type="date" value="\${ed.date || ''}" onchange="updateEventDate(\${groupIndex}, \${edIdx}, 'date', this.value)" style="color-scheme: dark;">
                                            </div>
                                            <button type="button" class="icon-btn" onclick="removeEventDate(\${groupIndex}, \${edIdx})" style="border-color:rgba(255,82,82,0.3);color:var(--red);" title="\${currentLang==='en'?'Delete event':'حذف الحدث'}"><i class="fas fa-trash"></i></button>
                                        </div>\`;
                                    }).join('')}
                                    \${(!group.currentQAEventDates || group.currentQAEventDates.length === 0) ? \`<div style="font-size:12px; color:var(--text-muted); padding:10px; text-align:center; border: 1px dashed var(--card-border); border-radius: 8px;">\${currentLang==='en'?'No extra events added yet.':'لم يتم إضافة أحداث إضافية بعد.'}</div>\` : ''}
                                </div>

                                <div class="field-row" style="margin-bottom:16px;">
                                    <div class="field-group" style="margin-bottom:0;">
                                        <label class="field-label" style="margin-bottom:4px;">\${currentLang==='en'?'Legacy Event Date (for {eventdate})':'تاريخ الحدث القديم (لحقل {eventdate})'}</label>
                                        <input type="date" id="newQAEventDate_\${groupIndex}" value="\${group.currentQAEventDate || ''}" onchange="updateGroupData(\${groupIndex}, 'currentQAEventDate', this.value)" style="color-scheme: dark; font-family: var(--font);">
                                    </div>
                                    <div class="field-group" style="margin-bottom:0;">
                                        <label class="field-label" style="margin-bottom:4px;">\${currentLang==='en'?'Days-Left Language':'لغة عرض الأيام المتبقية'}</label>
                                        <select id="qaLang_\${groupIndex}" onchange="updateGroupData(\${groupIndex}, 'qaLanguage', this.value)">
                                            <option value="ar" \${(group.qaLanguage||'ar')==='ar'?'selected':''}>\${currentLang==='en'?'Arabic (عربي)':'العربية'}</option>
                                            <option value="en" \${(group.qaLanguage||'ar')==='en'?'selected':''}>English</option>
                                        </select>
                                    </div>
                                </div>

                                <label class="field-label">\${currentLang==='en'?'Add Questions for This Answer':'أضف أسئلة لهذه الإجابة'}</label>
                                <div class="field-group" style="margin-bottom:10px;">
                                    <input type="text" id="newQAQuestion_\${groupIndex}" placeholder="\${currentLang==='en'?'Enter a question variant (e.g., when is the test)...':'أدخل صيغة السؤال...'}" style="margin-bottom:10px;" onkeypress="if(event.key==='Enter'){event.preventDefault();addQuestionToQA(\${groupIndex});}">
                                    <button type="button" class="btn btn-full" onclick="addQuestionToQA(\${groupIndex})" style="margin-bottom:10px;background:var(--accent-dim);border-color:rgba(0,230,118,0.4);color:var(--accent);font-weight:700;"><i class="fas fa-plus"></i> \${currentLang==='en'?'Add Question Variant':'إضافة صيغة سؤال'}</button>
                                    <div class="chip-container" id="qa_questions_container_\${groupIndex}" style="min-height:40px;">\${(group.currentQAQuestions || []).map((q, qIdx) => \`<div class="chip"><span>\${q}</span><span class="chip-remove" onclick="removeQuestionFromQA(\${groupIndex}, \${qIdx})">×</span></div>\`).join('')}</div>
                                </div>
                                <label class="field-label">\${currentLang==='en'?'Answer (Use {date}, {eventdate}, {user} for dynamic values)':'الإجابة (استخدم {date}, {eventdate}, {user} للحقول الديناميكية)'}</label>
                                <div class="field-group" style="margin-bottom:10px;">
                                    <textarea id="newQAAnswer_\${groupIndex}" placeholder="\${currentLang==='en'?'Enter answer with optional dynamic fields...':'أدخل الإجابة مع الحقول الديناميكية الاختيارية...'}" rows="3" style="margin-bottom:10px;" oninput="updateGroupData(\${groupIndex}, 'currentQAAnswer', this.value)" onchange="updateGroupData(\${groupIndex}, 'currentQAAnswer', this.value)">\${group.currentQAAnswer || ''}</textarea>
                                    <button type="button" id="saveQABtn_\${groupIndex}" class="btn btn-full" onclick="addGroupQA(\${groupIndex})" style="background:var(--accent-dim);border-color:rgba(0,230,118,0.4);color:var(--accent);font-weight:700;"><i class="fas fa-save"></i> \${currentLang==='en'?'Save Q&A Pair':'حفظ زوج س و ج'}</button>
                                </div>

                                <div class="sub-panel" style="margin-bottom:16px;border-color:rgba(100,220,150,0.3);background:rgba(100,220,150,0.04);">
                                    <h4 style="color:#64dc96;margin-bottom:12px;"><i class="fas fa-paperclip"></i> \${currentLang==='en'?'Attach Media to This Answer':'إرفاق وسائط بهذه الإجابة'}</h4>
                                    <p style="font-size:12px;color:var(--text-muted);margin-bottom:14px;">\${currentLang==='en'?'Select a file to automatically attach it when saving the Q&A pair. The bot will send the file + answer caption.':'اختر ملفاً ليُرفق تلقائياً عند حفظ الزوج. سيرسل البوت الملف مع نص الإجابة كتعليق.'}</p>
                                    <div id="qa_media_selected_\${groupIndex}" style="display:none;align-items:center;gap:10px;background:rgba(100,220,150,0.1);border:1px solid rgba(100,220,150,0.3);border-radius:8px;padding:10px 14px;margin-bottom:12px;">
                                        <i class="fas fa-paperclip" style="color:#64dc96;"></i>
                                        <span id="qa_media_selected_name_\${groupIndex}" style="font-size:13px;color:#64dc96;flex:1;"></span>
                                        <button type="button" onclick="clearQAMedia(\${groupIndex})" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:16px;">×</button>
                                    </div>
                                    <div style="display:flex;gap:10px;margin-bottom:14px;">
                                        <label style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;background:var(--input-bg);border:1.5px dashed rgba(100,220,150,0.4);border-radius:10px;cursor:pointer;font-size:13px;color:var(--text-muted);transition:all 0.2s;" onmouseover="this.style.borderColor='#64dc96'" onmouseout="this.style.borderColor='rgba(100,220,150,0.4)'">
                                            <i class="fas fa-cloud-upload-alt" style="color:#64dc96;font-size:18px;"></i>
                                            <span>\${currentLang==='en'?'Click to upload a file':'انقر لرفع ملف'}</span>
                                            <input type="file" id="qa_file_input_\${groupIndex}" style="display:none;" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar" onchange="uploadGroupMedia(\${groupIndex}, this)">
                                        </label>
                                    </div>
                                    <div id="qa_upload_status_\${groupIndex}" style="display:none;font-size:12px;color:var(--text-muted);margin-bottom:10px;"></div>
                                    <div id="qa_media_grid_\${groupIndex}" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;"></div>
                                </div>

                                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;margin-bottom:8px;">
                                    <label class="field-label" style="margin:0;">\${currentLang==='en'?'Q&A Pairs':'أزواج الأسئلة والأجوبة'}</label>
                                    <button type="button" class="btn btn-sm" onclick="pasteQA(\${groupIndex})" style="background:var(--accent-dim);color:var(--accent);border-color:rgba(0,230,118,0.3);"><i class="fas fa-paste"></i> \${currentLang==='en'?'Paste Q&A':'لصق س و ج'}</button>
                                </div>
                                <div id="qa_container_\${groupIndex}">
                                    \${(group.qaList || []).map((qa, qaIdx) => \`
                                        <div class="group-card" style="margin-bottom:10px;">
                                            <div class="group-card-header" style="padding:12px;">
                                                <div class="group-card-title" style="font-size:14px;">
                                                    <i class="fas fa-question" style="color:var(--blue);"></i> \${currentLang==='en'?'Question Variations':'صيغ الأسئلة'} (\${(qa.questions || []).length})
                                                </div>
                                                <div style="display:flex;gap:8px;">
                                                    <button type="button" class="icon-btn" onclick="copyQA(\${groupIndex}, \${qaIdx})" style="background:rgba(255,160,0,0.1);color:#ffa000;border-color:rgba(255,160,0,0.3);" title="\${currentLang==='en'?'Copy':'نسخ'}">
                                                        <i class="fas fa-copy"></i>
                                                    </button>
                                                    <button type="button" class="icon-btn" onclick="editGroupQA(\${groupIndex}, \${qaIdx})" style="background:var(--blue-dim);color:var(--blue);border-color:rgba(64,196,255,0.3);" title="\${currentLang==='en'?'Edit':'تعديل'}">
                                                        <i class="fas fa-edit"></i>
                                                    </button>
                                                    <button type="button" class="icon-btn" onclick="removeGroupQA(\${groupIndex}, \${qaIdx})" style="background:var(--red-dim);color:var(--red);border-color:rgba(255,82,82,0.3);" title="\${currentLang==='en'?'Delete':'حذف'}">
                                                        <i class="fas fa-trash"></i>
                                                    </button>
                                                </div>
                                            </div>
                                            <div class="group-card-body" style="padding:12px;">
                                                <div style="margin-bottom:10px;">
                                                    <div class="chip-container" style="background:rgba(64,196,255,0.05);border-color:rgba(64,196,255,0.2);">\${(qa.questions || []).map((q) => \`<div class="chip" style="background:rgba(64,196,255,0.15);color:var(--blue);border-color:rgba(64,196,255,0.3);"><i class="fas fa-search"></i> \${q}</div>\`).join('')}</div>
                                                </div>
                                                <div style="color:var(--text-muted);font-size:13px;">
                                                    <strong>\${currentLang==='en'?'Answer':'الإجابة'}:</strong> \${qa.answer || '(empty)'}
                                                </div>
                                                \${qa.mediaFile ? \`<div style="margin-top:8px;display:flex;align-items:center;gap:6px;font-size:12px;color:#64dc96;"><i class="fas fa-paperclip"></i> \${qa.mediaFile}</div>\` : ''}
                                            </div>
                                        </div>
                                    \`).join('')}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="group-tab-panel" id="gtab_\${groupIndex}_spam">
                        <div class="card warning">
                            <div class="toggle-row warning" style="margin-bottom:0;border-radius:10px;">
                                <div class="toggle-left">
                                    <label class="switch"><input type="checkbox" \${group.enableAntiSpam?'checked':''} onchange="toggleGroupPanel(\${groupIndex},'spam',this.checked)"><span class="slider"></span></label>
                                    <div class="toggle-label warning">\${dict.anti_spam}<small>\${dict.spam_desc}</small></div>
                                </div>
                            </div>
                            <div id="group_spam_panel_\${groupIndex}" style="overflow:hidden;max-height:\${group.enableAntiSpam?'800px':'0px'};opacity:\${group.enableAntiSpam?'1':'0'};transition:max-height 0.45s ease,opacity 0.35s ease,margin-top 0.35s ease;margin-top:\${group.enableAntiSpam?'20px':'0px'};">
                                <div style="border-top:1px dashed rgba(255,171,64,0.3);padding-top:20px;">
                                    <div class="field-row" style="margin-bottom:20px;">
                                        <div class="field-group" style="margin-bottom:0;">
                                            <label class="field-label">\${dict.action}</label>
                                            <select onchange="updateGroupData(\${groupIndex}, 'spamAction', this.value)">
                                                <option value="poll" \${group.spamAction==='poll'?'selected':''}>\${dict.poll}</option>
                                                <option value="auto" \${group.spamAction==='auto'?'selected':''}>\${dict.auto_kick}</option>
                                            </select>
                                        </div>
                                        <div class="field-group" style="margin-bottom:0;">
                                            <label class="field-label">\${dict.text_dup}</label>
                                            <input type="number" value="\${group.spamDuplicateLimit}" min="2" max="15" onchange="updateGroupData(\${groupIndex},'spamDuplicateLimit',parseInt(this.value))">
                                        </div>
                                    </div>
                                    <label class="field-label" style="margin-bottom:12px;"><i class="fas fa-stopwatch"></i> \${dict.limits_15s}</label>
                                    <div class="limit-grid">\${spamLimitGrid}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="group-tab-panel" id="gtab_\${groupIndex}_panic">
                        <div class="card danger">
                            <div class="toggle-row danger" style="margin-bottom:0;border-radius:10px;">
                                <div class="toggle-left">
                                    <label class="switch"><input type="checkbox" \${group.enablePanicMode?'checked':''} onchange="toggleGroupPanel(\${groupIndex},'panic',this.checked)"><span class="slider"></span></label>
                                    <div class="toggle-label danger">\${dict.panic_mode}<small>\${dict.panic_desc}</small></div>
                                </div>
                            </div>
                            <div id="group_panic_panel_\${groupIndex}" style="overflow:hidden;max-height:\${group.enablePanicMode?'800px':'0px'};opacity:\${group.enablePanicMode?'1':'0'};transition:max-height 0.45s ease,opacity 0.35s ease,margin-top 0.35s ease;margin-top:\${group.enablePanicMode?'20px':'0px'};">
                                <div style="border-top:1px dashed rgba(255,82,82,0.3);padding-top:20px;">
                                    <div class="field-row" style="margin-bottom:12px;">
                                        <div class="field-group" style="margin-bottom:0;"><label class="field-label">\${dict.panic_msg_limit}</label><input type="number" value="\${group.panicMessageLimit}" min="2" onchange="updateGroupData(\${groupIndex},'panicMessageLimit',parseInt(this.value))"></div>
                                        <div class="field-group" style="margin-bottom:0;"><label class="field-label">\${dict.panic_time_window}</label><input type="number" value="\${group.panicTimeWindow}" min="1" onchange="updateGroupData(\${groupIndex},'panicTimeWindow',parseInt(this.value))"></div>
                                        <div class="field-group" style="margin-bottom:0;"><label class="field-label">\${dict.panic_lock_dur}</label><input type="number" value="\${group.panicLockoutDuration}" min="1" onchange="updateGroupData(\${groupIndex},'panicLockoutDuration',parseInt(this.value))"></div>
                                    </div>
                                    <div class="field-group">
                                        <label class="field-label">\${dict.panic_target}</label>
                                        <select onchange="updateGroupData(\${groupIndex},'panicAlertTarget',this.value)">
                                            <option value="both" \${group.panicAlertTarget==='both'?'selected':''}>\${dict.target_both}</option>
                                            <option value="group" \${group.panicAlertTarget==='group'?'selected':''}>\${dict.target_group_only}</option>
                                            <option value="admin" \${group.panicAlertTarget==='admin'?'selected':''}>\${dict.admin_group_only}</option>
                                        </select>
                                    </div>
                                    <div class="field-group" style="margin-bottom:0;">
                                        <label class="field-label">\${dict.panic_msg_text}</label>
                                        <textarea rows="2" onchange="updateGroupData(\${groupIndex},'panicAlertMessage',this.value)">\${group.panicAlertMessage}</textarea>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="group-tab-panel" id="gtab_\${groupIndex}_lists">
                        <div class="card danger">
                            <div class="toggle-row danger" style="margin-bottom:0;border-radius:10px;">
                                <div class="toggle-left">
                                    <label class="switch"><input type="checkbox" \${group.enableBlacklist?'checked':''} onchange="toggleGroupPanel(\${groupIndex},'blacklist',this.checked)"><span class="slider"></span></label>
                                    <div class="toggle-label danger">\${dict.enable_bl}<small>\${dict.bl_desc}</small></div>
                                </div>
                            </div>
                            <div id="group_blacklist_panel_\${groupIndex}" style="overflow:hidden;max-height:\${group.enableBlacklist?'600px':'0px'};opacity:\${group.enableBlacklist?'1':'0'};transition:max-height 0.45s ease,opacity 0.35s ease,margin-top 0.35s ease;margin-top:\${group.enableBlacklist?'20px':'0px'};">
                                <div class="toggle-row" style="margin-bottom:14px;background:rgba(255,255,255,0.04);border-color:rgba(255,82,82,0.25);">
                                    <div class="toggle-left">
                                        <label class="switch"><input type="checkbox" \${group.useGlobalBlacklist?'checked':''} onchange="updateGroupToggle(\${groupIndex},'useGlobalBlacklist',this.checked)"><span class="slider"></span></label>
                                        <div class="toggle-label">\${dict.use_global_bl}<small>\${dict.ug_bl_desc}</small></div>
                                    </div>
                                </div>
                                <label class="field-label">\${dict.custom_bl}</label>
                                <div class="input-with-btn" style="margin-bottom:10px;">
                                    <input type="text" id="newGroupBl_\${groupIndex}" placeholder="Ex: 966512345678" onkeypress="if(event.key==='Enter'){event.preventDefault();addGroupBlacklist(\${groupIndex});}">
                                    <button type="button" class="btn btn-danger btn-sm" onclick="addGroupBlacklist(\${groupIndex})"><i class="fas fa-plus"></i> \${dict.add}</button>
                                </div>
                                <div class="chip-container" id="chip_container_bl_\${groupIndex}">\${blHtml}</div>
                            </div>
                        </div>
                        <div class="card success">
                            <div class="toggle-row green" style="margin-bottom:0;border-radius:10px;">
                                <div class="toggle-left">
                                    <label class="switch"><input type="checkbox" \${group.enableWhitelist?'checked':''} onchange="toggleGroupPanel(\${groupIndex},'whitelist',this.checked)"><span class="slider"></span></label>
                                    <div class="toggle-label green">\${dict.enable_wl}<small>\${dict.wl_desc}</small></div>
                                </div>
                            </div>
                            <div id="group_whitelist_panel_\${groupIndex}" style="overflow:hidden;max-height:\${group.enableWhitelist?'600px':'0px'};opacity:\${group.enableWhitelist?'1':'0'};transition:max-height 0.45s ease,opacity 0.35s ease,margin-top 0.35s ease;margin-top:\${group.enableWhitelist?'20px':'0px'};">
                                <div class="toggle-row" style="margin-bottom:14px;background:rgba(255,255,255,0.04);border-color:rgba(0,230,118,0.25);">
                                    <div class="toggle-left">
                                        <label class="switch"><input type="checkbox" \${group.useGlobalWhitelist?'checked':''} onchange="updateGroupToggle(\${groupIndex},'useGlobalWhitelist',this.checked)"><span class="slider"></span></label>
                                        <div class="toggle-label">\${dict.use_global_wl}<small>\${dict.ug_wl_desc}</small></div>
                                    </div>
                                </div>
                                <label class="field-label">\${dict.custom_wl}</label>
                                <div class="input-with-btn" style="margin-bottom:10px;">
                                    <input type="text" id="newGroupWl_\${groupIndex}" placeholder="Ex: 966512345678" onkeypress="if(event.key==='Enter'){event.preventDefault();addGroupWhitelist(\${groupIndex});}">
                                    <button type="button" class="btn btn-primary btn-sm" onclick="addGroupWhitelist(\${groupIndex})"><i class="fas fa-plus"></i> \${dict.add}</button>
                                </div>
                                <div class="chip-container" id="chip_container_wl_\${groupIndex}">\${wlHtml}</div>
                            </div>
                        </div>
                    </div>
                \`;
            }

            function updateGroupArray(gIndex, arrName, val, isChecked) {
                let arr = groupsArr[gIndex][arrName];
                if (isChecked && !arr.includes(val)) arr.push(val);
                if (!isChecked) {
                    let idx = arr.indexOf(val);
                    if (idx > -1) arr.splice(idx, 1);
                }
            }

            function updateSpamLimit(gIndex, type, val) {
                if (!groupsArr[gIndex].spamLimits) groupsArr[gIndex].spamLimits = {};
                groupsArr[gIndex].spamLimits[type] = parseInt(val) || 5;
            }

            function getCheckedValues(containerId) {
                const checkboxes = document.querySelectorAll(\`#\${containerId} input[type="checkbox"]:checked\`);
                return Array.from(checkboxes).map(cb => cb.value);
            }

            function renderBlacklist() {
                const container = document.getElementById('blacklistContainer');
                container.innerHTML = '';
                blacklistArr.forEach((number, index) => {
                    container.innerHTML += \`<div class="chip red-chip">\${number} <span class="chip-remove" onclick="removeBlacklistNumber(\${index})">&times;</span></div>\`;
                });
                document.getElementById('blacklist-count').innerText = blacklistArr.length;
            }

            function renderWhitelist() {
                const container = document.getElementById('whitelistContainer');
                container.innerHTML = '';
                whitelistArr.forEach((number, index) => {
                    container.innerHTML += \`<div class="chip">\${number} <span class="chip-remove" onclick="removeWhitelistNumber(\${index})">&times;</span></div>\`;
                });
            }

            function renderBlockedExtensions() {
                const container = document.getElementById('blockedExtensionsContainer');
                if(!container) return;
                container.innerHTML = '';
                blockedExtensionsArr.forEach((ext, index) => {
                    container.innerHTML += \`<div class="chip red-chip">+\${ext} <span class="chip-remove" onclick="removeBlockedExtension(\${index})">&times;</span></div>\`;
                });
            }
            window.addEventListener('DOMContentLoaded', () => { renderBlockedExtensions(); });

            async function addBlacklistNumber() {
                const input = document.getElementById('newBlacklistNumber');
                let justNumbers = input.value.replace(/\\D/g, ''); 
                if (justNumbers) {
                    let finalId = justNumbers + '@c.us';
                    if (!blacklistArr.includes(finalId)) {
                        blacklistArr.push(finalId);
                        renderBlacklist(); 
                        try {
                            await fetch('/api/blacklist/add', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({number: finalId}) });
                        } catch(e) {}
                    }
                }
                input.value = '';
            }

            async function addBlockedExtension() {
                const input = document.getElementById('newBlockedExtension');
                let justNumbers = input.value.replace(/\\D/g, '');
                if (justNumbers) {
                    if (!blockedExtensionsArr.includes(justNumbers)) {
                        blockedExtensionsArr.push(justNumbers);
                        renderBlockedExtensions();
                        try {
                            await fetch('/api/extensions/add', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ext: justNumbers}) });
                        } catch(e) {}
                    }
                }
                input.value = '';
            }

            async function removeBlockedExtension(index) {
                const extToRemove = blockedExtensionsArr[index];
                blockedExtensionsArr.splice(index, 1);
                renderBlockedExtensions();
                try {
                    await fetch('/api/extensions/remove', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ext: extToRemove}) });
                } catch(e) {}
            }

            async function addWhitelistNumber() {
                const input = document.getElementById('newWhitelistNumber');
                let justNumbers = input.value.replace(/\\D/g, ''); 
                if (justNumbers) {
                    let finalId = justNumbers + '@c.us';
                    if (!whitelistArr.includes(finalId)) {
                        whitelistArr.push(finalId);
                        renderWhitelist(); 
                        try {
                            await fetch('/api/whitelist/add', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({number: finalId}) });
                        } catch(e) {}
                    }
                }
                input.value = '';
            }

            async function removeBlacklistNumber(index) {
                const numberToRemove = blacklistArr[index];
                blacklistArr.splice(index, 1);
                renderBlacklist();
                try {
                    await fetch('/api/blacklist/remove', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({number: numberToRemove}) });
                } catch(e) {}
            }

            async function removeWhitelistNumber(index) {
                const numberToRemove = whitelistArr[index];
                whitelistArr.splice(index, 1);
                renderWhitelist();
                try {
                    await fetch('/api/whitelist/remove', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({number: numberToRemove}) });
                } catch(e) {}
            }

            async function purgeBlacklisted() {
                if(!await showConfirmModal(dict.purge_warn.replace(/<[^>]*>?/gm, ''))) return;
                const btn = document.getElementById('purgeBtn');
                const originalHTML = btn.innerHTML;
                btn.innerHTML = dict.purging;
                btn.disabled = true;
                try {
                    const res = await fetch('/api/blacklist/purge', { method: 'POST' });
                    const data = await res.json();
                    if(data.error) showToast('Error: ' + data.error);
                    else showToast('Success: ' + data.message);
                } catch(e) {
                    showToast(dict.conn_err.replace(/<[^>]*>?/gm, ''));
                }
                btn.innerHTML = originalHTML;
                btn.disabled = false;
            }

            async function loadScheduleSettings() {
                try {
                    const res = await fetch('/api/schedules', { cache: 'no-store' });
                    if (!res.ok) return;
                    const data = await res.json();

                    const autoToggle = document.getElementById('autoPurgeScheduleEnabled');
                    const autoInterval = document.getElementById('autoPurgeIntervalMinutes');
                    const adminToggle = document.getElementById('adminWhitelistSyncEnabled');
                    const adminInterval = document.getElementById('adminWhitelistSyncIntervalMinutes');

                    if (autoToggle) autoToggle.checked = Boolean(data.autoPurgeScheduleEnabled);
                    if (autoInterval) autoInterval.value = Math.max(1, parseInt(data.autoPurgeIntervalMinutes, 10) || 60);
                    if (adminToggle) adminToggle.checked = Boolean(data.adminWhitelistSyncEnabled);
                    if (adminInterval) adminInterval.value = Math.max(1, parseInt(data.adminWhitelistSyncIntervalMinutes, 10) || 60);
                } catch (e) {
                    showToast(dict.schedule_load_fail);
                }
            }

            async function saveScheduleSettings() {
                const autoToggle = document.getElementById('autoPurgeScheduleEnabled');
                const autoInterval = document.getElementById('autoPurgeIntervalMinutes');
                const adminToggle = document.getElementById('adminWhitelistSyncEnabled');
                const adminInterval = document.getElementById('adminWhitelistSyncIntervalMinutes');

                const payload = {
                    autoPurgeScheduleEnabled: autoToggle ? autoToggle.checked : false,
                    autoPurgeIntervalMinutes: Math.max(1, parseInt(autoInterval ? autoInterval.value : '60', 10) || 60),
                    adminWhitelistSyncEnabled: adminToggle ? adminToggle.checked : false,
                    adminWhitelistSyncIntervalMinutes: Math.max(1, parseInt(adminInterval ? adminInterval.value : '60', 10) || 60)
                };

                const res = await fetch('/api/schedules', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(errData.error || dict.conn_err.replace(/<[^>]*>?/gm, ''));
                }

                await loadScheduleSettings();
            }

            async function saveAutoPurgeSchedule() {
                const btn = document.getElementById('saveAutoPurgeScheduleBtn');
                if (!btn) return;
                const original = btn.innerHTML;
                btn.innerHTML = dict.saving_schedule;
                btn.disabled = true;
                try {
                    await saveScheduleSettings();
                    showToast(dict.schedule_saved);
                } catch (e) {
                    showToast('❌ ' + (e.message || dict.conn_err.replace(/<[^>]*>?/gm, '')));
                }
                btn.innerHTML = original;
                btn.disabled = false;
            }

            async function saveAdminWhitelistSyncSchedule() {
                const btn = document.getElementById('saveAdminWhitelistSyncScheduleBtn');
                if (!btn) return;
                const original = btn.innerHTML;
                btn.innerHTML = dict.saving_schedule;
                btn.disabled = true;
                try {
                    await saveScheduleSettings();
                    showToast(dict.schedule_saved);
                } catch (e) {
                    showToast('❌ ' + (e.message || dict.conn_err.replace(/<[^>]*>?/gm, '')));
                }
                btn.innerHTML = original;
                btn.disabled = false;
            }

            async function runAutoPurgeNow() {
                const btn = document.getElementById('runAutoPurgeScheduleBtn');
                if (!btn) return;
                const original = btn.innerHTML;
                btn.innerHTML = dict.running_sync;
                btn.disabled = true;
                try {
                    const res = await fetch('/api/blacklist/purge', { method: 'POST' });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok || data.error) {
                        showToast('❌ ' + (data.error || dict.conn_err.replace(/<[^>]*>?/gm, '')));
                    } else {
                        showToast('✅ ' + (data.message || 'OK'));
                    }
                } catch (e) {
                    showToast(dict.conn_err.replace(/<[^>]*>?/gm, ''));
                }
                btn.innerHTML = original;
                btn.disabled = false;
            }

            async function runAdminWhitelistSyncNow() {
                const btn = document.getElementById('runAdminWhitelistSyncBtn');
                if (!btn) return;
                const original = btn.innerHTML;
                btn.innerHTML = dict.running_sync;
                btn.disabled = true;
                try {
                    const res = await fetch('/api/whitelist/sync-admins', { method: 'POST' });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok || data.error) {
                        showToast('❌ ' + (data.error || dict.conn_err.replace(/<[^>]*>?/gm, '')));
                    } else {
                        showToast(data.message || dict.sync_success);
                        if (Array.isArray(data.whitelist)) {
                            whitelistArr = data.whitelist;
                            renderWhitelist();
                        }
                    }
                } catch (e) {
                    showToast(dict.conn_err.replace(/<[^>]*>?/gm, ''));
                }
                btn.innerHTML = original;
                btn.disabled = false;
            }

            function renderDefaultWords() {
                const container = document.getElementById('defaultWordsContainer');
                container.innerHTML = '';
                defaultWordsArr.forEach((word, index) => {
                    container.innerHTML += \`<div class="chip">\${word} <span class="chip-remove" onclick="removeDefaultWord(\${index})">&times;</span></div>\`;
                });
            }
            function addDefaultWord() {
                const input = document.getElementById('newDefaultWord');
                const word = input.value.trim();
                if (word && !defaultWordsArr.includes(word)) {
                    defaultWordsArr.push(word);
                    input.value = '';
                    renderDefaultWords();
                }
            }
            function removeDefaultWord(index) {
                defaultWordsArr.splice(index, 1);
                renderDefaultWords();
            }

            function renderAITriggerWords() {
                const container = document.getElementById('aiTriggerWordsContainer');
                container.innerHTML = '';
                aiFilterTriggerWordsArr.forEach((word, index) => {
                    const chip = document.createElement('div');
                    chip.className = 'chip';
                    chip.textContent = word + ' ';
                    const removeBtn = document.createElement('span');
                    removeBtn.className = 'chip-remove';
                    removeBtn.textContent = '×';
                    removeBtn.onclick = () => removeAITriggerWord(index);
                    chip.appendChild(removeBtn);
                    container.appendChild(chip);
                });
            }

            function addAITriggerWord() {
                const input = document.getElementById('newAITriggerWord');
                const word = input.value.trim();
                if (word && !aiFilterTriggerWordsArr.includes(word)) {
                    aiFilterTriggerWordsArr.push(word);
                    input.value = '';
                    renderAITriggerWords();
                }
            }

            function removeAITriggerWord(index) {
                aiFilterTriggerWordsArr.splice(index, 1);
                renderAITriggerWords();
            }

            function renderGlobalQAQuestionsDraft() {
                const container = document.getElementById('globalQAQuestionsContainer');
                if (!container) return;
                if (!globalQAQuestionsDraft.length) {
                    container.innerHTML = '<div style="font-size:12px;color:var(--text-muted);">' +
                        (currentLang === 'en' ? 'No question variants added yet.' : 'لم يتم إضافة صيغ أسئلة بعد.') +
                        '</div>';
                    return;
                }
                container.innerHTML = globalQAQuestionsDraft.map((q, idx) =>
                    '<div class="chip">' + q + ' <span class="chip-remove" onclick="removeGlobalQAQuestion(' + idx + ')">&times;</span></div>'
                ).join('');
            }

            function addGlobalQAQuestion() {
                const input = document.getElementById('globalQAQuestionInput');
                if (!input) return;
                const q = String(input.value || '').trim().toLowerCase();
                if (!q) return;
                if (!globalQAQuestionsDraft.includes(q)) globalQAQuestionsDraft.push(q);
                input.value = '';
                renderGlobalQAQuestionsDraft();
            }

            function removeGlobalQAQuestion(index) {
                globalQAQuestionsDraft.splice(index, 1);
                renderGlobalQAQuestionsDraft();
            }

            function renderGlobalQAEventDatesForm() {
                const container = document.getElementById('globalQAEventDatesContainer');
                const legacyInput = document.getElementById('globalQAEventDateInput');
                const langInput = document.getElementById('globalQALanguageInput');
                if (!container) return;
                container.innerHTML = (globalQAEventDatesDraft || []).map(function(ed, edIdx) {
                    return '<div class="field-row" style="margin-bottom:10px; background: rgba(255,255,255,0.02); padding: 12px; border-radius: 10px; border: 1px solid var(--card-border); align-items: flex-end; gap: 12px;">' +
                        '<div class="field-group" style="margin-bottom:0; flex: 1.5;">' +
                            '<label class="field-label" style="font-size:10px;">' + (currentLang === 'en' ? 'Label (e.g. Exam)' : 'العنوان (مثل: اختبار)') + '</label>' +
                            '<input type="text" value="' + (ed.label || '') + '" placeholder="..." onchange="updateGlobalQAEventDate(' + edIdx + ', \'label\', this.value)">' +
                        '</div>' +
                        '<div class="field-group" style="margin-bottom:0; flex: 1.5;">' +
                            '<label class="field-label" style="font-size:10px;">' + (currentLang === 'en' ? 'Date' : 'التاريخ') + '</label>' +
                            '<input type="date" value="' + (ed.date || '') + '" onchange="updateGlobalQAEventDate(' + edIdx + ', \'date\', this.value)" style="color-scheme: dark;">' +
                        '</div>' +
                        '<button type="button" class="icon-btn" onclick="removeGlobalQAEventDate(' + edIdx + ')" style="border-color:rgba(255,82,82,0.3);color:var(--red);" title="' + (currentLang === 'en' ? 'Delete event' : 'حذف الحدث') + '"><i class="fas fa-trash"></i></button>' +
                    '</div>';
                }).join('');
                if (!globalQAEventDatesDraft.length) {
                    container.innerHTML += '<div style="font-size:12px; color:var(--text-muted); padding:10px; text-align:center; border: 1px dashed var(--card-border); border-radius: 8px;">' + (currentLang === 'en' ? 'No extra events added yet.' : 'لم يتم إضافة أحداث إضافية بعد.') + '</div>';
                }
                if (legacyInput) legacyInput.value = globalQALegacyEventDate || '';
                if (langInput) langInput.value = globalQALanguage || 'ar';
            }

            function addGlobalQAEventDate() {
                globalQAEventDatesDraft.push({ label: '', date: '' });
                renderGlobalQAEventDatesForm();
            }

            function removeGlobalQAEventDate(index) {
                globalQAEventDatesDraft.splice(index, 1);
                renderGlobalQAEventDatesForm();
            }

            function updateGlobalQAEventDate(index, field, value) {
                if (!globalQAEventDatesDraft[index]) return;
                globalQAEventDatesDraft[index][field] = value;
            }

            function updateGlobalQACurrentAnswer(value) {
                globalQACurrentAnswer = String(value || '');
            }

            function setGlobalQAMediaSelection(mediaFile) {
                globalQAPendingMediaFile = mediaFile || '';
                const indicator = document.getElementById('globalQA_media_selected');
                const nameEl = document.getElementById('globalQA_media_selected_name');
                if (!indicator || !nameEl) return;
                if (globalQAPendingMediaFile) {
                    indicator.style.display = 'flex';
                    nameEl.textContent = '📎 ' + globalQAPendingMediaFile;
                } else {
                    indicator.style.display = 'none';
                    nameEl.textContent = '';
                }
            }

            function loadGlobalQAMedia() {
                fetch('/api/media/list/global-qa')
                    .then(r => r.json())
                    .then(files => renderGlobalQAMediaGrid(files))
                    .catch(() => {});
            }

            function renderGlobalQAMediaGrid(files) {
                const grid = document.getElementById('globalQA_media_grid');
                if (!grid) return;
                if (!files || files.length === 0) {
                    grid.innerHTML = '<p style="font-size:12px;color:var(--text-muted);grid-column:1/-1;">' + (currentLang === 'en' ? 'No files uploaded yet.' : 'لا توجد ملفات محملة بعد.') + '</p>';
                    return;
                }
                const imgExts = ['jpg','jpeg','png','gif','webp','bmp','svg'];
                grid.innerHTML = files.map(function(f) {
                    const ext = f.name.split('.').pop().toLowerCase();
                    let preview;
                    if (imgExts.includes(ext)) {
                        preview = '<img src="/media/global-qa/' + encodeURIComponent(f.name) + '" style="width:100%;height:72px;object-fit:cover;border-radius:6px 6px 0 0;">';
                    } else {
                        const icons = { mp4:'fa-film', mov:'fa-film', webm:'fa-film', mkv:'fa-film', mp3:'fa-music', ogg:'fa-music', wav:'fa-music', pdf:'fa-file-pdf', doc:'fa-file-word', docx:'fa-file-word', zip:'fa-file-archive', rar:'fa-file-archive' };
                        const icon = icons[ext] || 'fa-file';
                        preview = '<div style="width:100%;height:72px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.05);border-radius:6px 6px 0 0;"><i class="fas ' + icon + '" style="font-size:28px;color:var(--text-muted);"></i></div>';
                    }
                    const kb = (f.size/1024).toFixed(1);
                    const isSelected = globalQAPendingMediaFile === f.name;
                    return '<div style="background:var(--card-bg);border:1.5px solid ' + (isSelected ? '#64dc96' : 'var(--card-border)') + ';border-radius:8px;overflow:hidden;">' +
                        preview +
                        '<div style="padding:6px 8px;">' +
                            '<div style="font-size:11px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + f.name + '">' + f.name + '</div>' +
                            '<div style="font-size:10px;color:var(--text-muted);margin-bottom:6px;">' + kb + ' KB</div>' +
                            '<div style="display:flex;gap:4px;">' +
                                '<button type="button" onclick="selectGlobalQAMedia(\'' + f.name + '\')" style="flex:1;font-size:11px;padding:4px;background:' + (isSelected ? 'rgba(100,220,150,0.15)' : 'var(--input-bg)') + ';color:' + (isSelected ? '#64dc96' : 'var(--text-muted)') + ';border:1px solid ' + (isSelected ? 'rgba(100,220,150,0.4)' : 'var(--card-border)') + ';border-radius:5px;cursor:pointer;">' +
                                    '<i class="fas ' + (isSelected ? 'fa-check' : 'fa-link') + '"></i> ' + (isSelected ? (currentLang === 'en' ? 'Selected' : 'محدد') : (currentLang === 'en' ? 'Select' : 'اختر')) +
                                '</button>' +
                                '<button type="button" onclick="deleteGlobalQAMedia(\'' + f.name + '\')" style="padding:4px 6px;background:var(--red-dim);color:var(--red);border:1px solid rgba(255,82,82,0.3);border-radius:5px;cursor:pointer;font-size:11px;">' +
                                    <i class="fas fa-trash"></i>
                                '</button>' +
                            '</div>' +
                        '</div>' +
                    '</div>';
                }).join('');
            }

            function uploadGlobalQAMedia(input) {
                const file = input.files[0];
                if (!file) return;
                const statusEl = document.getElementById('globalQA_upload_status');
                statusEl.style.display = 'block';
                statusEl.textContent = currentLang==='en' ? '⏳ Uploading...' : '⏳ جاري الرفع...';
                const fd = new FormData();
                fd.append('file', file);
                fetch('/api/media/upload/global-qa', { method:'POST', body:fd })
                    .then(r => r.json())
                    .then(data => {
                        statusEl.textContent = currentLang==='en' ? '✅ Uploaded: ' + data.filename : '✅ تم الرفع: ' + data.filename;
                        setTimeout(() => { statusEl.style.display='none'; }, 3000);
                        loadGlobalQAMedia();
                        input.value = '';
                    })
                    .catch(() => { statusEl.textContent = currentLang==='en' ? '❌ Upload failed' : '❌ فشل الرفع'; });
            }

            function selectGlobalQAMedia(filename) {
                const wasSelected = globalQAPendingMediaFile === filename;
                setGlobalQAMediaSelection(wasSelected ? '' : filename);
                loadGlobalQAMedia();
            }

            function clearGlobalQAMedia() {
                setGlobalQAMediaSelection('');
                loadGlobalQAMedia();
            }

            function deleteGlobalQAMedia(filename) {
                if (!window.confirm(currentLang === 'en' ? 'Delete ' + filename + '?' : 'حذف ' + filename + '؟')) return;
                fetch('/api/media/delete/global-qa/' + encodeURIComponent(filename), { method:'DELETE' })
                    .then(() => {
                        if (globalQAPendingMediaFile === filename) clearGlobalQAMedia();
                        loadGlobalQAMedia();
                    });
            }

            function renderGlobalQAList() {
                const list = document.getElementById('globalQAList');
                if (!list) return;
                if (!Array.isArray(globalQAArr) || globalQAArr.length === 0) {
                    list.innerHTML = '<div style="font-size:13px;color:var(--text-muted);padding:10px;border:1px dashed var(--card-border);border-radius:8px;">' +
                        (currentLang === 'en' ? 'No global Q&A entries yet.' : 'لا توجد أزواج Q&A عامة بعد.') +
                        '</div>';
                    return;
                }

                list.innerHTML = globalQAArr.map((qa, idx) => {
                    const questions = Array.isArray(qa.questions) ? qa.questions : (qa.question ? [qa.question] : []);
                    const answer = String(qa.answer || '');
                    const eventDates = Array.isArray(qa.eventDates) ? qa.eventDates : [];
                    return '<div class="group-card" style="margin-bottom:10px;">' +
                        '<div class="group-card-header" style="padding:12px;">' +
                        '<div class="group-card-title" style="font-size:13px;">' +
                        '<i class="fas fa-question-circle" style="color:var(--blue);"></i> ' +
                        (currentLang === 'en' ? 'Triggers' : 'المحفزات') + ' (' + questions.length + ')' +
                        '</div>' +
                        '<div style="display:flex;gap:8px;">' +
                        '<button type="button" class="icon-btn" onclick="copyGlobalQA(' + idx + ')" style="background:rgba(255,160,0,0.1);color:#ffa000;border-color:rgba(255,160,0,0.3);" title="' + (currentLang==='en'?'Copy':'نسخ') + '"><i class="fas fa-copy"></i></button>' +
                        '<button type="button" class="icon-btn" onclick="editGlobalQA(' + idx + ')" style="background:var(--blue-dim);color:var(--blue);border-color:rgba(64,196,255,0.3);" title="' + (currentLang==='en'?'Edit':'تعديل') + '"><i class="fas fa-pen"></i></button>' +
                        '<button type="button" class="icon-btn" onclick="removeGlobalQA(' + idx + ')" style="background:var(--red-dim);color:var(--red);border-color:rgba(255,82,82,0.3);" title="' + (currentLang==='en'?'Delete':'حذف') + '"><i class="fas fa-trash"></i></button>' +
                        '</div>' +
                        '</div>' +
                        '<div class="group-card-body" style="padding:12px;">' +
                        '<div class="chip-container" style="gap:4px;max-height:70px;overflow-y:auto;">' +
                        questions.map(q => '<div class="chip" style="font-size:11px;padding:2px 8px;">' + q + '</div>').join('') +
                        '</div>' +
                        (eventDates.length > 0 ? '<div style="margin-top:8px;display:flex;align-items:center;gap:6px;font-size:11px;color:var(--blue); background:rgba(64,196,255,0.05); padding:6px 10px; border-radius:6px; border:1px dashed rgba(64,196,255,0.3);"><i class="fas fa-calendar-alt"></i> ' + eventDates.length + ' ' + (currentLang==='en'?'Event(s)':'حدث/أحداث') + '</div>' : '') +
                        (qa.mediaFile ? '<div style="margin-top:8px;display:flex;align-items:center;gap:6px;font-size:11px;color:#64dc96; background:rgba(100,220,150,0.05); padding:6px 10px; border-radius:6px; border:1px dashed rgba(100,220,150,0.3);"><i class="fas fa-paperclip"></i> ' + qa.mediaFile + '</div>' : '') +
                        '<div style="margin-top:10px;color:var(--text-muted);font-size:13px;background:rgba(255,255,255,0.02);padding:10px;border-radius:8px;">' +
                        (answer || '<em style="opacity:.6;">(empty)</em>') +
                        '</div>' +
                        '</div>' +
                        '</div>';
                }).join('');
            }

            function resetGlobalQAForm() {
                globalQAEditingIndex = null;
                globalQAQuestionsDraft = [];
                globalQAEventDatesDraft = [];
                globalQALegacyEventDate = '';
                globalQACurrentAnswer = '';
                globalQAPendingMediaFile = '';
                globalQALanguage = 'ar';
                const answerEl = document.getElementById('globalQAAnswerInput');
                const saveBtn = document.getElementById('saveGlobalQABtn');
                const legacyInput = document.getElementById('globalQAEventDateInput');
                const langInput = document.getElementById('globalQALanguageInput');
                if (answerEl) answerEl.value = '';
                if (legacyInput) legacyInput.value = '';
                if (langInput) langInput.value = 'ar';
                if (saveBtn) {
                    saveBtn.innerHTML = '<i class="fas fa-save"></i> ' + (currentLang === 'en' ? 'Save Q&A Pair' : 'حفظ زوج س و ج');
                    saveBtn.style.background = 'var(--accent-dim)';
                    saveBtn.style.color = 'var(--accent)';
                }
                setGlobalQAMediaSelection('');
                renderGlobalQAQuestionsDraft();
                renderGlobalQAEventDatesForm();
            }

            function editGlobalQA(index) {
                const qa = globalQAArr[index];
                if (!qa) return;
                globalQAEditingIndex = index;
                globalQAQuestionsDraft = Array.isArray(qa.questions) ? [...qa.questions] : (qa.question ? [qa.question] : []);
                globalQAEventDatesDraft = JSON.parse(JSON.stringify(qa.eventDates || []));
                globalQALegacyEventDate = qa.eventDate || '';
                globalQACurrentAnswer = qa.answer || '';
                globalQAPendingMediaFile = qa.mediaFile || '';
                globalQALanguage = qa.qaLanguage || 'ar';
                const answerEl = document.getElementById('globalQAAnswerInput');
                const saveBtn = document.getElementById('saveGlobalQABtn');
                const legacyInput = document.getElementById('globalQAEventDateInput');
                const langInput = document.getElementById('globalQALanguageInput');
                if (answerEl) answerEl.value = qa.answer || '';
                if (legacyInput) legacyInput.value = globalQALegacyEventDate;
                if (langInput) langInput.value = globalQALanguage;
                if (saveBtn) {
                    saveBtn.innerHTML = '<i class="fas fa-check"></i> ' + (currentLang === 'en' ? 'Update Q&A Pair' : 'تحديث زوج س و ج');
                    saveBtn.style.background = 'var(--orange)';
                    saveBtn.style.color = '#000';
                }
                setGlobalQAMediaSelection(globalQAPendingMediaFile);
                renderGlobalQAQuestionsDraft();
                renderGlobalQAEventDatesForm();
                loadGlobalQAMedia();
            }

            function copyGlobalQA(index) {
                const qa = globalQAArr[index];
                if (!qa) return;
                localStorage.setItem('wa_bot_qa_clipboard', JSON.stringify({ qa: qa, sourceGroupId: 'global-qa' }));
                showToast(currentLang === 'en' ? 'Q&A copied!' : 'تم نسخ سؤال وجواب!');
            }

            async function pasteGlobalQA() {
                const clipDataStr = localStorage.getItem('wa_bot_qa_clipboard');
                if (!clipDataStr) {
                    showToast(currentLang === 'en' ? 'Nothing in clipboard.' : 'لا يوجد شيء في الحافظة.');
                    return;
                }
                const clipData = JSON.parse(clipDataStr);
                let qa = JSON.parse(JSON.stringify(clipData.qa));
                if (qa.mediaFile && clipData.sourceGroupId && clipData.sourceGroupId !== 'global-qa') {
                    try { await fetch('/api/media/copy/' + encodeURIComponent(clipData.sourceGroupId) + '/global-qa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: qa.mediaFile }) }); } catch(e){}
                }
                if (!Array.isArray(globalQAArr)) globalQAArr = [];
                globalQAArr.push(qa);
                renderGlobalQAList();
                loadGlobalQAMedia();
                showToast(currentLang === 'en' ? 'Q&A pasted!' : 'تم لصق سؤال وجواب!');
            }

            function removeGlobalQA(index) {
                if (!Array.isArray(globalQAArr)) return;
                globalQAArr.splice(index, 1);
                if (globalQAEditingIndex === index) resetGlobalQAForm();
                if (globalQAEditingIndex !== null && globalQAEditingIndex > index) globalQAEditingIndex -= 1;
                renderGlobalQAList();
            }

            function saveGlobalQA() {
                const answerEl = document.getElementById('globalQAAnswerInput');
                const legacyInput = document.getElementById('globalQAEventDateInput');
                const langInput = document.getElementById('globalQALanguageInput');
                const answer = String(answerEl ? answerEl.value : '').trim();
                globalQALegacyEventDate = legacyInput ? legacyInput.value : globalQALegacyEventDate;
                globalQALanguage = langInput ? (langInput.value === 'en' ? 'en' : 'ar') : 'ar';
                globalQACurrentAnswer = answer;

                if (!globalQAQuestionsDraft.length || (!answer && !globalQAPendingMediaFile)) {
                    showToast(currentLang === 'en' ? 'Please add question variants and answer first' : 'يرجى إضافة صيغ السؤال والإجابة أولاً');
                    return;
                }

                const entry = {
                    questions: [...globalQAQuestionsDraft],
                    answer: answer,
                    eventDates: JSON.parse(JSON.stringify(globalQAEventDatesDraft || [])),
                    eventDate: globalQALegacyEventDate,
                    qaLanguage: globalQALanguage
                };
                if (globalQAPendingMediaFile) entry.mediaFile = globalQAPendingMediaFile;

                if (globalQAEditingIndex !== null && globalQAEditingIndex >= 0 && globalQAEditingIndex < globalQAArr.length) {
                    globalQAArr[globalQAEditingIndex] = entry;
                } else {
                    globalQAArr.push(entry);
                }

                resetGlobalQAForm();
                renderGlobalQAList();
            }

            function toggleGroupPanel(groupIndex, type, enabled) {
                const panelMap = { spam: 'spam', welcome: 'welcome', words: 'words', qa: 'qa', panic: 'panic', blacklist: 'blacklist', whitelist: 'whitelist' };
                const fieldMap = { spam: 'enableAntiSpam', welcome: 'enableWelcomeMessage', words: 'enableWordFilter', qa: 'enableQAFeature', panic: 'enablePanicMode', blacklist: 'enableBlacklist', whitelist: 'enableWhitelist' };
                const maxHeightMap = { spam: '600px', welcome: '200px', words: '600px', qa: '600px', panic: '800px', blacklist: '600px', whitelist: '600px' };

                if (groupIndex !== 'global') {
                    groupsArr[groupIndex][fieldMap[type]] = enabled;
                }

                const panel = document.getElementById(\`group_\${panelMap[type]}_panel_\${groupIndex}\`);
                const toggle = panel ? panel.previousElementSibling : null;
                if (!panel) return;

                if (enabled) {
                    panel.style.maxHeight = maxHeightMap[type];
                    panel.style.opacity = '1';
                    panel.style.marginTop = '20px';
                    panel.style.overflowY = 'auto';
                    if (toggle) toggle.style.borderRadius = '10px 10px 0 0';
                } else {
                    panel.style.maxHeight = '0px';
                    panel.style.opacity = '0';
                    panel.style.marginTop = '0px';
                    panel.style.overflowY = 'hidden';
                    if (toggle) toggle.style.borderRadius = '10px';
                }
            }

            function addGroup() {
                groupsArr.push({ 
                    id: '', adminGroup: '', words: [], useDefaultWords: true, 
                    aiFilterTriggerWords: [],
                    enableJoinProfileScreening: false,
                    adminLanguage: 'default',
                    enableWordFilter: true, enableAIFilter: false, enableAIMedia: false, 
                    autoAction: false, enableBlacklist: true, enableWhitelist: true,
                    useGlobalBlacklist: true, useGlobalWhitelist: true,
                    customBlacklist: [], customWhitelist: [],
                    enableAntiSpam: false, spamDuplicateLimit: 3, spamAction: 'poll',
                    enableWelcomeMessage: false, welcomeMessageText: '${t("مرحباً بك يا {user} في مجموعتنا!", "Welcome {user} to our group!")}',
                    blockedTypes: [], blockedAction: 'delete', 
                    spamTypes: ['text', 'image', 'video', 'audio', 'document', 'sticker'],
                    spamLimits: {text:7, image:3, video:2, audio:3, document:3, sticker:3},
                    enablePanicMode: false, panicMessageLimit: 10, panicTimeWindow: 5, panicLockoutDuration: 10, panicAlertTarget: 'both', panicAlertMessage: '${t("🚨 عذراً، تم رصد هجوم (Raid)! سيتم إغلاق المجموعة لمدة {time} دقائق.", "🚨 Raid detected! Group is locked for {time} minutes.")}',
                    useGlobalQA: false,
                    enableQAFeature: false, qaList: [], eventDate: '', eventDates: [], qaLanguage: 'ar', currentQAQuestions: [], currentQAAnswer: '', editingQAIndex: null
                });
                openGroupDetail(groupsArr.length - 1);
            }

            async function removeGroup(index) {
                if(await showConfirmModal(dict.delete_confirm.replace(/<[^>]*>?/gm, ''))) {
                    groupsArr.splice(index, 1);
                    closeGroupDetail();
                }
            }

            function updateGroupData(index, field, value) {
                groupsArr[index][field] = value;
                if (field === 'id' && index === currentDetailIndex) {
                    const knownGroup = fetchedGroups.find(g => g.id === value);
                    const groupName = knownGroup ? knownGroup.name : (value || dict.no_id);
                    const initials = groupName.replace(/[^\u0600-\u06FFa-zA-Z]/g, '').slice(0, 2) || '؟';
                    document.getElementById('detailGroupName').textContent = groupName;
                    document.getElementById('detailGroupId').textContent = value || dict.no_id;
                    document.getElementById('detailGroupAvatar').textContent = initials;
                }
            }
            function updateGroupToggle(index, field, isChecked) { groupsArr[index][field] = isChecked; }

            function addGroupWord(groupIndex) {
                const input = document.getElementById(\`newGroupWord_\${groupIndex}\`);
                const word = input.value.trim();
                if (word && !groupsArr[groupIndex].words.includes(word)) {
                    groupsArr[groupIndex].words.push(word);
                    input.value = '';
                    renderGroupChips(groupIndex, 'words');
                }
            }
            function removeGroupWord(groupIndex, wordIndex) {
                groupsArr[groupIndex].words.splice(wordIndex, 1);
                renderGroupChips(groupIndex, 'words');
            }

            function addGroupAITriggerWord(groupIndex) {
                const input = document.getElementById(\`newGroupAITriggerWord_\${groupIndex}\`);
                const word = input.value.trim();
                if (!word) return;
                if (!Array.isArray(groupsArr[groupIndex].aiFilterTriggerWords)) groupsArr[groupIndex].aiFilterTriggerWords = [];
                if (!groupsArr[groupIndex].aiFilterTriggerWords.includes(word)) {
                    groupsArr[groupIndex].aiFilterTriggerWords.push(word);
                    input.value = '';
                    renderGroupAITriggerWords(groupIndex);
                }
            }

            function removeGroupAITriggerWord(groupIndex, wordIndex) {
                if (!Array.isArray(groupsArr[groupIndex].aiFilterTriggerWords)) return;
                groupsArr[groupIndex].aiFilterTriggerWords.splice(wordIndex, 1);
                renderGroupAITriggerWords(groupIndex);
            }

            function renderGroupAITriggerWords(groupIndex) {
                const container = document.getElementById(\`chip_container_ai_words_\${groupIndex}\`);
                if (!container) return;
                const words = Array.isArray(groupsArr[groupIndex].aiFilterTriggerWords) ? groupsArr[groupIndex].aiFilterTriggerWords : [];
                container.innerHTML = words.map((word, idx) =>
                    \`<div class="chip">\${word} <span class="chip-remove" onclick="removeGroupAITriggerWord(\${groupIndex}, \${idx})">&times;</span></div>\`
                ).join('');
            }

            function addQuestionToQA(groupIndex) {
                const input = document.getElementById(\`newQAQuestion_\${groupIndex}\`);
                const question = input.value.trim().toLowerCase();
                if (question) {
                    if (!groupsArr[groupIndex].currentQAQuestions) groupsArr[groupIndex].currentQAQuestions = [];
                    if (!groupsArr[groupIndex].currentQAQuestions.includes(question)) {
                        groupsArr[groupIndex].currentQAQuestions.push(question);
                        input.value = '';
                        renderQAQuestions(groupIndex);
                    } else {
                        showToast(currentLang === 'en' ? 'This question variant already exists' : 'صيغة السؤال هذه موجودة بالفعل');
                    }
                }
            }
            
            function removeQuestionFromQA(groupIndex, questionIndex) {
                if (groupsArr[groupIndex].currentQAQuestions) {
                    groupsArr[groupIndex].currentQAQuestions.splice(questionIndex, 1);
                    renderQAQuestions(groupIndex);
                }
            }

            function renderQAEventDatesForm(groupIndex) {
                const container = document.getElementById(\`event_dates_container_\${groupIndex}\`);
                const legacyInput = document.getElementById(\`newQAEventDate_\${groupIndex}\`);
                if (!container) return;
                const group = groupsArr[groupIndex];
                container.innerHTML = (group.currentQAEventDates || []).map((ed, edIdx) => {
                    return \`<div class="field-row" style="margin-bottom:10px; background: rgba(255,255,255,0.02); padding: 12px; border-radius: 10px; border: 1px solid var(--card-border); align-items: flex-end; gap: 12px;">
                        <div class="field-group" style="margin-bottom:0; flex: 1.5;">
                            <label class="field-label" style="font-size:10px;">\${currentLang==='en'?'Label (e.g. Exam)':'العنوان (مثل: اختبار)'}</label>
                            <input type="text" value="\${ed.label || ''}" placeholder="..." onchange="updateEventDate(\${groupIndex}, \${edIdx}, 'label', this.value)">
                        </div>
                        <div class="field-group" style="margin-bottom:0; flex: 1.5;">
                            <label class="field-label" style="font-size:10px;">\${currentLang==='en'?'Date':'التاريخ'}</label>
                            <input type="date" value="\${ed.date || ''}" onchange="updateEventDate(\${groupIndex}, \${edIdx}, 'date', this.value)" style="color-scheme: dark;">
                        </div>
                        <button type="button" class="icon-btn" onclick="removeEventDate(\${groupIndex}, \${edIdx})" style="border-color:rgba(255,82,82,0.3);color:var(--red);" title="\${currentLang==='en'?'Delete event':'حذف الحدث'}"><i class="fas fa-trash"></i></button>
                    </div>\`;
                }).join('');
                
                if (!group.currentQAEventDates || group.currentQAEventDates.length === 0) {
                    container.innerHTML += \`<div style="font-size:12px; color:var(--text-muted); padding:10px; text-align:center; border: 1px dashed var(--card-border); border-radius: 8px;">\${currentLang==='en'?'No extra events added yet.':'لم يتم إضافة أحداث إضافية بعد.'}</div>\`;
                }
                
                if (legacyInput) legacyInput.value = group.currentQAEventDate || '';
            }

            function addEventDate(groupIndex) {
                const answerEl = document.getElementById(\`newQAAnswer_\${groupIndex}\`);
                if (answerEl) groupsArr[groupIndex].currentQAAnswer = answerEl.value;
                if (!groupsArr[groupIndex].currentQAEventDates) groupsArr[groupIndex].currentQAEventDates = [];
                groupsArr[groupIndex].currentQAEventDates.push({ label: '', date: '' });
                renderGroupDetailBody(groupIndex, 'qa');
            }

            function removeEventDate(groupIndex, dateIndex) {
                const answerEl = document.getElementById(\`newQAAnswer_\${groupIndex}\`);
                if (answerEl) groupsArr[groupIndex].currentQAAnswer = answerEl.value;
                groupsArr[groupIndex].currentQAEventDates.splice(dateIndex, 1);
                renderGroupDetailBody(groupIndex, 'qa');
            }

            function updateEventDate(groupIndex, dateIndex, field, value) {
                if (!groupsArr[groupIndex].currentQAEventDates[dateIndex]) return;
                groupsArr[groupIndex].currentQAEventDates[dateIndex][field] = value;
            }
            
            function renderQAQuestions(groupIndex) {
                const container = document.getElementById(\`qa_questions_container_\${groupIndex}\`);
                if (!container) return;
                const questions = groupsArr[groupIndex].currentQAQuestions || [];
                container.innerHTML = questions.map((q, qIdx) => \`
                    <div class="chip">
                        <span>\${q}</span>
                        <span class="chip-remove" onclick="removeQuestionFromQA(\${groupIndex}, \${qIdx})">×</span>
                    </div>
                \`).join('');
            }

            function addGroupQA(groupIndex) {
                const answerInput = document.getElementById(\`newQAAnswer_\${groupIndex}\`);
                const answer = (answerInput ? answerInput.value : (groupsArr[groupIndex].currentQAAnswer || '')).trim();
                const questions = groupsArr[groupIndex].currentQAQuestions || [];
                const mediaFile = groupsArr[groupIndex].pendingMediaFile || '';
                const eventDates = groupsArr[groupIndex].currentQAEventDates || [];
                const eventDate = groupsArr[groupIndex].currentQAEventDate || '';
                const editingIndex = Number.isInteger(groupsArr[groupIndex].editingQAIndex)
                    ? groupsArr[groupIndex].editingQAIndex
                    : null;
                
                if (questions.length > 0 && (answer || mediaFile)) {
                    if (!groupsArr[groupIndex].qaList) groupsArr[groupIndex].qaList = [];
                    const newPair = { questions: questions, answer: answer, eventDates: JSON.parse(JSON.stringify(eventDates)), eventDate: eventDate };
                    if (mediaFile) newPair.mediaFile = mediaFile;
                    if (editingIndex !== null && editingIndex >= 0 && editingIndex < groupsArr[groupIndex].qaList.length) {
                        groupsArr[groupIndex].qaList[editingIndex] = newPair;
                    } else {
                        groupsArr[groupIndex].qaList.push(newPair);
                    }
                    if (answerInput) answerInput.value = '';
                    groupsArr[groupIndex].currentQAQuestions = [];
                    groupsArr[groupIndex].currentQAAnswer = '';
                    groupsArr[groupIndex].currentQAEventDates = [];
                    groupsArr[groupIndex].currentQAEventDate = '';
                    groupsArr[groupIndex].editingQAIndex = null;
                    // Clear media selection
                    groupsArr[groupIndex].pendingMediaFile = '';
                    const indicator = document.getElementById(\`qa_media_selected_\${groupIndex}\`);
                    if (indicator) indicator.style.display = 'none';
                    loadGroupMedia(groupIndex); // refresh grid (deselects all)
                    
                    // Render form and list again to clear event dates from UI
                    renderGroupDetailBody(groupIndex, 'qa');
                } else {
                    const msg = currentLang === 'en' ? 'Please add at least one question variant and an answer or attach a media file' : 'يرجى إضافة صيغة سؤال واحدة على الأقل وملء الإجابة أو إرفاق وسائط';
                    showToast(msg);
                }
            }

            
            function removeGroupQA(groupIndex, qaIndex) {
                if (groupsArr[groupIndex].qaList) {
                    groupsArr[groupIndex].qaList.splice(qaIndex, 1);
                    renderGroupQA(groupIndex);
                }
                const editingIndex = Number.isInteger(groupsArr[groupIndex].editingQAIndex)
                    ? groupsArr[groupIndex].editingQAIndex
                    : null;
                if (editingIndex !== null) {
                    if (editingIndex === qaIndex) groupsArr[groupIndex].editingQAIndex = null;
                    if (editingIndex > qaIndex) groupsArr[groupIndex].editingQAIndex = editingIndex - 1;
                }
            }
            
            function renderGroupQA(groupIndex) {
                const container = document.getElementById(\`qa_container_\${groupIndex}\`);
                if (!container) return;
                const qaList = groupsArr[groupIndex].qaList || [];
                container.innerHTML = qaList.map((qa, qaIdx) => \`
                                    <div class="group-card" style="margin-bottom:0; display:flex; flex-direction:column; border:1px solid rgba(255,255,255,0.05); background:var(--card-bg);">
                                        <div class="group-card-header" style="padding:14px; border-bottom:1px solid rgba(255,255,255,0.05);">
                                            <div class="group-card-title" style="font-size:13px; font-weight:bold; color:var(--text);">
                                                <i class="fas fa-bolt" style="color:var(--accent);"></i> \${qa.questions ? qa.questions.length : 0} \${currentLang==='en'?'Triggers':'محفزات'}
                                            </div>
                                            <div style="display:flex;gap:6px;">
                                                <button type="button" class="icon-btn" onclick="copyQA(\${groupIndex}, \${qaIdx})" style="background:rgba(255,160,0,0.1);color:#ffa000;border-color:rgba(255,160,0,0.3); width:28px; height:28px;" title="\${currentLang==='en'?'Copy':'نسخ'}">
                                                    <i class="fas fa-copy"></i>
                                                </button>
                                                <button type="button" class="icon-btn" onclick="editGroupQA(\${groupIndex}, \${qaIdx})" style="background:rgba(64,196,255,0.1);color:var(--blue);border-color:rgba(64,196,255,0.3); width:28px; height:28px;" title="\${currentLang==='en'?'Edit':'تعديل'}">
                                                    <i class="fas fa-pen"></i>
                                                </button>
                                                <button type="button" class="icon-btn" onclick="removeGroupQA(\${groupIndex}, \${qaIdx})" style="background:rgba(255,82,82,0.1);color:var(--red);border-color:rgba(255,82,82,0.3); width:28px; height:28px;" title="\${currentLang==='en'?'Delete':'حذف'}">
                                                    <i class="fas fa-trash"></i>
                                                </button>
                                            </div>
                                        </div>
                                        <div class="group-card-body" style="padding:14px; flex:1; display:flex; flex-direction:column;">
                                            <div style="margin-bottom:12px;">
                                                <div class="chip-container" style="gap:4px; max-height:60px; overflow-y:auto; padding-right:4px;">\${(qa.questions || []).map((q) => \`<div class="chip" style="background:var(--input-bg); color:var(--text); border:1px solid var(--card-border); font-size:11px; padding:2px 8px;"><i class="fas fa-search" style="color:var(--text-muted); font-size:10px;"></i> \${q}</div>\`).join('')}</div>
                                            </div>
                                            <div style="color:var(--text-muted); font-size:13px; line-height:1.5; flex:1; background:rgba(255,255,255,0.02); padding:10px; border-radius:8px; border-left:3px solid var(--card-border);">
                                                \${(qa.answer || '').substring(0, 150) + (qa.answer && qa.answer.length > 150 ? '...' : '') || '<em style="opacity:0.5;">(empty)</em>'}
                                            </div>
                                            \${qa.mediaFile ? \`<div style="margin-top:12px;display:flex;align-items:center;gap:6px;font-size:11px;color:#64dc96; background:rgba(100,220,150,0.05); padding:6px 10px; border-radius:6px; border:1px dashed rgba(100,220,150,0.3);"><i class="fas fa-paperclip"></i> \${qa.mediaFile}</div>\` : ''}
                                            \${qa.eventDates && qa.eventDates.length > 0 ? \`<div style="margin-top:8px;display:flex;align-items:center;gap:6px;font-size:11px;color:var(--blue); background:rgba(64,196,255,0.05); padding:6px 10px; border-radius:6px; border:1px dashed rgba(64,196,255,0.3);"><i class="fas fa-calendar-alt"></i> \${qa.eventDates.length} \${currentLang==='en'?'Event(s)':'حدث/أحداث'}</div>\` : ''}
                                        </div>
                                    </div>\`).join('');
            }

            // ── Media management for Q&A ──────────────────────────────────────
            function loadGroupMedia(groupIndex) {
                const group = groupsArr[groupIndex];
                const groupId = encodeURIComponent(group.id);
                fetch(\`/api/media/list/\${groupId}\`)
                    .then(r => r.json())
                    .then(files => renderMediaGrid(groupIndex, files))
                    .catch(() => {});
            }

            function renderMediaGrid(groupIndex, files) {
                const grid = document.getElementById(\`qa_media_grid_\${groupIndex}\`);
                if (!grid) return;
                if (files.length === 0) { grid.innerHTML = \`<p style="font-size:12px;color:var(--text-muted);grid-column:1/-1;">\${currentLang==='en'?'No files uploaded yet.':'لا توجد ملفات محملة بعد.'}</p>\`; return; }
                const imgExts = ['jpg','jpeg','png','gif','webp','bmp','svg'];
                const vidExts = ['mp4','mov','webm','mkv','avi'];
                const audExts = ['mp3','ogg','wav','m4a','aac'];
                grid.innerHTML = files.map(f => {
                    const ext = f.name.split('.').pop().toLowerCase();
                    const groupId = encodeURIComponent(groupsArr[groupIndex].id);
                    let preview;
                    if (imgExts.includes(ext)) {
                        preview = \`<img src="/media/\${groupId}/\${encodeURIComponent(f.name)}" style="width:100%;height:72px;object-fit:cover;border-radius:6px 6px 0 0;">\`;
                    } else {
                        const icons = { mp4:'fa-film', mov:'fa-film', webm:'fa-film', mkv:'fa-film', mp3:'fa-music', ogg:'fa-music', wav:'fa-music', pdf:'fa-file-pdf', doc:'fa-file-word', docx:'fa-file-word', zip:'fa-file-archive', rar:'fa-file-archive' };
                        const icon = icons[ext] || 'fa-file';
                        preview = \`<div style="width:100%;height:72px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.05);border-radius:6px 6px 0 0;"><i class="fas \${icon}" style="font-size:28px;color:var(--text-muted);"></i></div>\`;
                    }
                    const kb = (f.size/1024).toFixed(1);
                    const isSelected = groupsArr[groupIndex].pendingMediaFile === f.name;
                    return \`<div style="background:var(--card-bg);border:1.5px solid \${isSelected ? '#64dc96' : 'var(--card-border)'};border-radius:8px;overflow:hidden;">
                        \${preview}
                        <div style="padding:6px 8px;">
                            <div style="font-size:11px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="\${f.name}">\${f.name}</div>
                            <div style="font-size:10px;color:var(--text-muted);margin-bottom:6px;">\${kb} KB</div>
                            <div style="display:flex;gap:4px;">
                                <button type="button" onclick="selectQAMedia(\${groupIndex},'\${f.name}')" style="flex:1;font-size:11px;padding:4px;background:\${isSelected ? 'rgba(100,220,150,0.15)' : 'var(--input-bg)'};color:\${isSelected ? '#64dc96' : 'var(--text-muted)'};border:1px solid \${isSelected ? 'rgba(100,220,150,0.4)' : 'var(--card-border)'};border-radius:5px;cursor:pointer;">
                                    <i class="fas \${isSelected ? 'fa-check' : 'fa-link'}"></i> \${isSelected ? (currentLang==='en'?'Selected':'محدد') : (currentLang==='en'?'Select':'اختر')}
                                </button>
                                <button type="button" onclick="deleteGroupMedia(\${groupIndex},'\${f.name}')" style="padding:4px 6px;background:var(--red-dim);color:var(--red);border:1px solid rgba(255,82,82,0.3);border-radius:5px;cursor:pointer;font-size:11px;">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    </div>\`;
                }).join('');
            }

            function uploadGroupMedia(groupIndex, input) {
                const file = input.files[0];
                if (!file) return;
                const group = groupsArr[groupIndex];
                const groupId = encodeURIComponent(group.id);
                const statusEl = document.getElementById(\`qa_upload_status_\${groupIndex}\`);
                statusEl.style.display = 'block';
                statusEl.textContent = currentLang==='en' ? '⏳ Uploading...' : '⏳ جاري الرفع...';
                const fd = new FormData();
                fd.append('file', file);
                fetch(\`/api/media/upload/\${groupId}\`, { method:'POST', body:fd })
                    .then(r => r.json())
                    .then(data => {
                        statusEl.textContent = currentLang==='en' ? '✅ Uploaded: ' + data.filename : '✅ تم الرفع: ' + data.filename;
                        setTimeout(() => { statusEl.style.display='none'; }, 3000);
                        loadGroupMedia(groupIndex);
                        input.value = '';
                    })
                    .catch(() => { statusEl.textContent = currentLang==='en' ? '❌ Upload failed' : '❌ فشل الرفع'; });
            }

            function selectQAMedia(groupIndex, filename) {
                const wasSelected = groupsArr[groupIndex].pendingMediaFile === filename;
                groupsArr[groupIndex].pendingMediaFile = wasSelected ? '' : filename;
                // Update selected indicator
                const indicator = document.getElementById(\`qa_media_selected_\${groupIndex}\`);
                const nameEl = document.getElementById(\`qa_media_selected_name_\${groupIndex}\`);
                if (!wasSelected && filename) {
                    indicator.style.display = 'flex';
                    nameEl.textContent = '📎 ' + filename;
                } else {
                    indicator.style.display = 'none';
                }
                // Re-render grid to update button states
                fetch(\`/api/media/list/\${encodeURIComponent(groupsArr[groupIndex].id)}\`)
                    .then(r => r.json()).then(files => renderMediaGrid(groupIndex, files)).catch(()=>{});
            }

            function clearQAMedia(groupIndex) { selectQAMedia(groupIndex, ''); }

            async function deleteGroupMedia(groupIndex, filename) {
                if (!await showConfirmModal(currentLang==='en' ? \`Delete \${filename}?\` : \`حذف \${filename}؟\`)) return;
                const groupId = encodeURIComponent(groupsArr[groupIndex].id);
                fetch(\`/api/media/delete/\${groupId}/\${encodeURIComponent(filename)}\`, { method:'DELETE' })
                    .then(() => {
                        if (groupsArr[groupIndex].pendingMediaFile === filename) selectQAMedia(groupIndex, '');
                        loadGroupMedia(groupIndex);
                    });
            }

            function copyQA(groupIndex, qaIndex) {
                const qa = groupsArr[groupIndex].qaList[qaIndex];
                if (qa) {
                    const clipData = { qa: qa, sourceGroupId: groupsArr[groupIndex].id };
                    localStorage.setItem('wa_bot_qa_clipboard', JSON.stringify(clipData));
                    showToast(currentLang === 'en' ? 'Q&A copied!' : 'تم نسخ سؤال وجواب!');
                }
            }

            async function pasteQA(groupIndex) {
                const clipDataStr = localStorage.getItem('wa_bot_qa_clipboard');
                if (!clipDataStr) {
                    showToast(currentLang === 'en' ? 'Nothing in clipboard.' : 'لا يوجد شيء في الحافظة.');
                    return;
                }
                const clipData = JSON.parse(clipDataStr);
                const targetGroupId = groupsArr[groupIndex].id;
                let qa = JSON.parse(JSON.stringify(clipData.qa));
                
                if (qa.mediaFile && clipData.sourceGroupId && clipData.sourceGroupId !== targetGroupId) {
                    try { await fetch('/api/media/copy/' + encodeURIComponent(clipData.sourceGroupId) + '/' + encodeURIComponent(targetGroupId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: qa.mediaFile }) }); } catch(e){}
                }
                
                if (!groupsArr[groupIndex].qaList) groupsArr[groupIndex].qaList = [];
                groupsArr[groupIndex].qaList.push(qa);
                renderGroupDetailBody(groupIndex, 'qa');
                loadGroupMedia(groupIndex);
                showToast(currentLang === 'en' ? 'Q&A pasted!' : 'تم لصق سؤال وجواب!');
            }

            function editGroupQA(groupIndex, qaIndex) {
                const qa = groupsArr[groupIndex].qaList[qaIndex];
                if (!qa) return;
                // Pre-fill questions and event dates
                groupsArr[groupIndex].currentQAQuestions = [...(qa.questions || [])];
                groupsArr[groupIndex].currentQAEventDates = JSON.parse(JSON.stringify(qa.eventDates || []));
                groupsArr[groupIndex].currentQAEventDate = qa.eventDate || '';
                groupsArr[groupIndex].editingQAIndex = qaIndex;
                groupsArr[groupIndex].currentQAAnswer = qa.answer || '';
                groupsArr[groupIndex].pendingMediaFile = qa.mediaFile || '';
                
                renderGroupDetailBody(groupIndex, 'qa');

                // Update save button appearance to indicate edit mode
                const saveBtn = document.getElementById(\`saveQABtn_\${groupIndex}\`);
                if (saveBtn) {
                    saveBtn.innerHTML = '<i class="fas fa-check"></i> ' + (currentLang==='en' ? 'Update Q&A Pair' : 'تحديث زوج س و ج');
                    saveBtn.style.background = 'var(--orange)';
                    saveBtn.style.color = '#000';
                }
                // Scroll to form
                const questionInput = document.getElementById(\`newQAQuestion_\${groupIndex}\`);
                if (questionInput) questionInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            function addGroupBlacklist(gIndex) {
                const input = document.getElementById(\`newGroupBl_\${gIndex}\`);
                let justNumbers = input.value.replace(/\\D/g, ''); 
                if (justNumbers) {
                    let finalId = justNumbers + '@c.us';
                    if (!groupsArr[gIndex].customBlacklist.includes(finalId)) {
                        groupsArr[gIndex].customBlacklist.push(finalId);
                        input.value = '';
                        renderGroupChips(gIndex, 'blacklist');
                    }
                }
            }
            function removeGroupBlacklist(gIndex, idx) {
                groupsArr[gIndex].customBlacklist.splice(idx, 1);
                renderGroupChips(gIndex, 'blacklist');
            }

            function addGroupWhitelist(gIndex) {
                const input = document.getElementById(\`newGroupWl_\${gIndex}\`);
                let justNumbers = input.value.replace(/\\D/g, ''); 
                if (justNumbers) {
                    let finalId = justNumbers + '@c.us';
                    if (!groupsArr[gIndex].customWhitelist.includes(finalId)) {
                        groupsArr[gIndex].customWhitelist.push(finalId);
                        input.value = '';
                        renderGroupChips(gIndex, 'whitelist');
                    }
                }
            }
            function removeGroupWhitelist(gIndex, idx) {
                groupsArr[gIndex].customWhitelist.splice(idx, 1);
                renderGroupChips(gIndex, 'whitelist');
            }

            function getStatusIconClass(kind) {
                if (kind === 'connected') return 'fas fa-check';
                if (kind === 'waiting_qr') return 'fas fa-qrcode';
                if (kind === 'syncing' || kind === 'initializing' || kind === 'retrying' || kind === 'terminating') return 'fas fa-spinner fa-spin';
                if (kind === 'error') return 'fas fa-exclamation-triangle';
                if (kind === 'disconnected') return 'fas fa-sign-out-alt';
                return 'fas fa-info-circle';
            }

            function renderDashboardStatus(statusText, statusKind) {
                const iconEl = document.getElementById('status-text-icon');
                const labelEl = document.getElementById('status-text-label');
                const detailEl = document.getElementById('status-text-detail');
                const detailCheckEl = document.getElementById('status-text-detail-check');
                const dot = document.getElementById('statusDot');
                const logoutBtn = document.getElementById('logoutBtn');
                const text = String(statusText || '').trim();
                const kind = String(statusKind || 'unknown');

                if (iconEl) iconEl.className = getStatusIconClass(kind);
                if (labelEl) labelEl.textContent = text;
                if (detailEl) detailEl.textContent = text;
                if (detailCheckEl) detailCheckEl.style.display = kind === 'connected' ? 'inline-block' : 'none';

                if (dot) {
                    if (kind === 'connected') dot.className = 'status-dot online';
                    else if (kind === 'waiting_qr') dot.className = 'status-dot waiting';
                    else dot.className = 'status-dot';
                }

                if (logoutBtn) logoutBtn.style.display = kind === 'connected' ? 'block' : 'none';
            }

            async function pollDashboardStatus() {
                try {
                    let res = await fetch('/api/status?lang=' + currentLang, { cache: 'no-store' });
                    if (res.status === 401) {
                        window.location.replace('/login');
                        return;
                    }
                    if (!res.ok) return;
                    let data = await res.json();
                    renderDashboardStatus(data.statusText || '', data.statusKind || 'unknown');

                    const qrImg = document.getElementById('qr-image');
                    const qrPlaceholder = document.getElementById('qr-placeholder');
                    if(data.qr) {
                        qrImg.src = data.qr;
                        qrImg.style.display = 'block';
                        if(qrPlaceholder) qrPlaceholder.style.display = 'none';
                    } else {
                        qrImg.style.display = 'none';
                        if(qrPlaceholder) qrPlaceholder.style.display = 'block';
                    }
                } catch(e) {}
            }

            // Start status polling first so UI state keeps updating even if a later init call fails.
            pollDashboardStatus();
            setInterval(pollDashboardStatus, 2000);

            renderBlacklist();
            renderWhitelist();
            renderDefaultWords();
            renderAITriggerWords();
            renderGlobalQAQuestionsDraft();
            renderGlobalQAEventDatesForm();
            renderGlobalQAList();
            loadGlobalQAMedia();
            loadScheduleSettings();
            loadKnownGroups();
            enforceFirstLoginChange();

            async function exportData() {
                const selected = {
                    global_settings: document.getElementById('export_global_settings').checked,
                    llm_settings: document.getElementById('export_llm_settings').checked,
                    blacklist: document.getElementById('export_blacklist').checked,
                    whitelist: document.getElementById('export_whitelist').checked,
                    blocked_extensions: document.getElementById('export_blocked_extensions').checked,
                    whatsapp_groups: document.getElementById('export_whatsapp_groups').checked,
                    custom_groups: document.getElementById('export_custom_groups').checked,
                    media: document.getElementById('export_media') ? document.getElementById('export_media').checked : false
                };

                try {
                    const res = await fetch('/api/export', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ selected })
                    });

                    if (!res.ok) {
                        let reason = '';
                        try {
                            const errData = await res.json();
                            reason = errData && errData.error ? String(errData.error) : '';
                        } catch (_) {
                            try {
                                reason = (await res.text() || '').trim();
                            } catch (_) {}
                        }
                        const prefix = currentLang==='en' ? '❌ Export failed' : '❌ فشل التصدير';
                        showToast(reason ? (prefix + ': ' + reason) : prefix);
                        return;
                    }

                    const json = await res.text();
                    if (!json || !json.trim()) {
                        throw new Error(currentLang==='en' ? 'Empty export response' : 'استجابة تصدير فارغة');
                    }

                    const blob = new Blob([json], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = \`automod_backup_\${new Date().toISOString().split('T')[0]}.json\`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    showToast(currentLang==='en' ? '✅ Export successful!' : '✅ تم التصدير بنجاح!');
                } catch (error) {
                    console.error('Export error:', error);
                    showToast(currentLang==='en' ? '❌ Export error: ' + error.message : '❌ خطأ التصدير: ' + error.message);
                }
            }

            async function importData() {
                const fileInput = document.getElementById('importFile');
                if (!fileInput.files.length) {
                    showToast(currentLang==='en' ? '⚠️ Please select a file' : '⚠️ يرجى اختيار ملف');
                    return;
                }

                const file = fileInput.files[0];
                try {
                    const json = await file.text();
                    const importedData = JSON.parse(json);

                    if (!importedData.data) {
                        showToast(currentLang==='en' ? '❌ Invalid file format' : '❌ صيغة الملف غير صحيحة');
                        return;
                    }

                    const selected = {
                        global_settings: document.getElementById('import_global_settings').checked,
                        llm_settings: document.getElementById('import_llm_settings').checked,
                        blacklist: document.getElementById('import_blacklist').checked,
                        blacklist_clear: document.getElementById('import_blacklist_clear').checked,
                        whitelist: document.getElementById('import_whitelist').checked,
                        whitelist_clear: document.getElementById('import_whitelist_clear').checked,
                        blocked_extensions: document.getElementById('import_blocked_extensions').checked,
                        blocked_extensions_clear: document.getElementById('import_blocked_extensions_clear').checked,
                        whatsapp_groups: document.getElementById('import_whatsapp_groups').checked,
                        custom_groups: document.getElementById('import_custom_groups').checked,
                        custom_groups_clear: document.getElementById('import_custom_groups_clear').checked,
                        media: document.getElementById('import_media') ? document.getElementById('import_media').checked : false
                    };

                    if (!await showConfirmModal(currentLang==='en' ? 'Confirm import? This action may override existing data.' : 'هل تؤكد الاستيراد؟ قد يؤدي هذا إلى إلغاء البيانات الموجودة.')) {
                        return;
                    }

                    const res = await fetch('/api/import', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ dataset: importedData.data, selected })
                    });

                    if (!res.ok) {
                        const errorData = await res.json();
                        showToast(currentLang==='en' ? '❌ Import failed: ' + errorData.error : '❌ فشل الاستيراد: ' + errorData.error);
                        return;
                    }

                    showToast(currentLang==='en' ? '✅ Import successful! Reloading...' : '✅ تم الاستيراد بنجاح! جاري إعادة التحميل...');
                    fileInput.value = '';
                    setTimeout(() => window.location.reload(), 1500);
                } catch (error) {
                    console.error('Import error:', error);
                    showToast(currentLang==='en' ? '❌ Import error: ' + error.message : '❌ خطأ الاستيراد: ' + error.message);
                }
            }

            async function saveConfig() {
                let finalGroupsObj = {};
                groupsArr.forEach(g => { 
                    if(g.id) { finalGroupsObj[g.id] = g; } 
                });

                const gSpamTypes = [];
                const gSpamLimits = {};
                metaTypes.forEach(t => {
                    const cb = document.getElementById('global_spam_check_' + t.id);
                    if(cb && cb.checked) gSpamTypes.push(t.id);
                    const lim = document.getElementById('global_spam_limit_' + t.id);
                    gSpamLimits[t.id] = parseInt(lim ? lim.value : 5) || 5;
                });

                let defAdmin = '';
                const defAdminEl = document.getElementById('defaultAdminGroup');
                if (defAdminEl) defAdmin = defAdminEl.value;
                let defAdminLang = 'ar';
                const defAdminLangEl = document.getElementById('defaultAdminLanguage');
                if (defAdminLangEl) defAdminLang = defAdminLangEl.value === 'en' ? 'en' : 'ar';

                const newConfig = {
                    enableAntiSpam: document.getElementById('enableAntiSpam').checked,
                    safeMode: document.getElementById('safeMode').checked,
                    spamDuplicateLimit: parseInt(document.getElementById('spamDuplicateLimit').value) || 3,
                    spamAction: document.getElementById('spamAction').value,
                    spamTypes: gSpamTypes,
                    spamLimits: gSpamLimits,
                    blockedTypes: getCheckedValues('globalBlockedTypes'),
                    blockedAction: document.getElementById('globalBlockedAction').value,
                    enableBlacklist: document.getElementById('enableBlacklist').checked,
                    enableWhitelist: document.getElementById('enableWhitelist').checked,
                    autoPurgeScheduleEnabled: document.getElementById('autoPurgeScheduleEnabled') ? document.getElementById('autoPurgeScheduleEnabled').checked : false,
                    autoPurgeIntervalMinutes: document.getElementById('autoPurgeIntervalMinutes') ? (parseInt(document.getElementById('autoPurgeIntervalMinutes').value, 10) || 60) : 60,
                    adminWhitelistSyncEnabled: document.getElementById('adminWhitelistSyncEnabled') ? document.getElementById('adminWhitelistSyncEnabled').checked : false,
                    adminWhitelistSyncIntervalMinutes: document.getElementById('adminWhitelistSyncIntervalMinutes') ? (parseInt(document.getElementById('adminWhitelistSyncIntervalMinutes').value, 10) || 60) : 60,
                    enableJoinProfileScreening: document.getElementById('enableJoinProfileScreening').checked,
                    enableWordFilter: document.getElementById('enableWordFilter').checked,
                    enableAIFilter: document.getElementById('enableAIFilter').checked,
                    enableAIMedia: document.getElementById('enableAIMedia').checked,
                    autoAction: document.getElementById('autoAction').checked,
                    aiPrompt: document.getElementById('aiPromptText').value.trim(),
                    aiFilterTriggerWords: aiFilterTriggerWordsArr,
                    ollamaUrl: document.getElementById('ollamaUrl').value.trim(),
                    ollamaModel: document.getElementById('ollamaModel').value.trim(),
                    defaultAdminGroup: defAdmin,
                    defaultAdminLanguage: defAdminLang,
                    defaultWords: defaultWordsArr,
                    globalQAEnabled: document.getElementById('globalQAEnabled') ? document.getElementById('globalQAEnabled').checked : false,
                    globalQA: globalQAArr,
                    groupsConfig: finalGroupsObj
                };
                
                const res = await fetch('/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newConfig)
                });
                
                if(res.ok) {
                    showToast(dict.save_success);
                    setTimeout(() => window.location.reload(), 800);
                } else showToast(dict.save_fail);
            }

            document.getElementById('configForm').onsubmit = async (e) => {
                e.preventDefault();
                await saveConfig();
            }
            
        </script>
        <div class="modal" id="confirmModal">
            <div class="modal-content" style="max-width:460px;">
                <div class="modal-header" style="margin-bottom:14px;">
                    <h3 id="confirmModalTitle"><i class="fas fa-circle-question"></i> ${t('تأكيد الإجراء', 'Confirm Action')}</h3>
                    <button type="button" class="close-modal" id="confirmModalClose">&times;</button>
                </div>
                <div id="confirmModalMessage" style="color:var(--text-muted);line-height:1.8;margin-bottom:22px;"></div>
                <div style="display:flex;justify-content:flex-end;gap:10px;">
                    <button type="button" class="btn btn-ghost" id="confirmModalCancel">${t('إلغاء', 'Cancel')}</button>
                    <button type="button" class="btn btn-danger" id="confirmModalConfirm">${t('تأكيد', 'Confirm')}</button>
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
};