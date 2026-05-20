// Plugin-Based Capability Engine
// Add new capabilities by simply appending to this array!

const registry = [
    {
        id: 'days_reminder',
        title: 'Days Reminder',
        icon: 'fa-clock',
        color: 'var(--purple)',
        target: 'campaign', // Only really makes sense for scheduled campaigns
        fields: [
            { name: 'dateCol', label: 'Date Column', type: 'excel_column' },
            { name: 'direction', label: 'Direction', type: 'select', options: [{val: 'before', text: 'Before'}, {val: 'after', text: 'After'}] },
            { name: 'days', label: 'Days', type: 'number', placeholder: 'e.g. 3' }
        ],
        execute: (row, config, dynamicVars) => {
            const daysDiff = getDaysDiff(row[config.dateCol]);
            if (daysDiff === null) return false;
            
            const targetDays = parseInt(config.days, 10);
            const expectedDiff = config.direction === 'before' ? targetDays : -targetDays;
            
            return daysDiff === expectedDiff;
        },
        hashGen: (config, row) => {
            const daysDiff = getDaysDiff(row[config.dateCol]);
            return '|reminder_' + config.dateCol + '_' + daysDiff;
        }
    },
    {
        id: 'days_left_var',
        title: 'Days Left Variable',
        icon: 'fa-calendar-day',
        color: 'var(--orange)',
        target: 'both', // Works in both campaigns and quick replies
        fields: [
            { name: 'dateCol', label: 'Date Column', type: 'excel_column' },
            { name: 'varSection', label: 'Template Section', type: 'select', options: [{val:'body', text:'Body'}, {val:'header', text:'Header'}] },
            { name: 'varNum', label: 'Variable #', type: 'number', placeholder: 'e.g. 2' }
        ],
        execute: (row, config, dynamicVars) => {
            const daysDiff = getDaysDiff(row[config.dateCol]);
            dynamicVars[`${config.varSection}_${config.varNum}`] = daysDiff !== null ? Math.max(0, daysDiff).toString() : '0';
            return true;
        },
        hashGen: (config, row) => {
            const daysDiff = getDaysDiff(row[config.dateCol]);
            return '|dl_' + daysDiff;
        }
    },
    {
        id: 'auto_scan',
        title: 'Auto-Scan Excel',
        icon: 'fa-sync',
        color: 'var(--blue)',
        target: 'campaign', // Only applies to campaigns
        fields: [
            { name: 'interval', label: 'Interval', type: 'select', options: [
                {val: 'daily', text: 'Daily'}, 
                {val: '2days', text: 'Every 2 Days'},
                {val: 'weekly', text: 'Weekly'},
                {val: 'monthly', text: 'Monthly'}
            ]}
        ],
        execute: () => true, // Doesn't affect row-level sending logic
        hashGen: () => ''
    }
];

// Helper shared across capabilities
function getDaysDiff(targetDateRaw) {
    if (!targetDateRaw) return null;
    let targetDate;
    if (typeof targetDateRaw === 'number') {
        targetDate = new Date(Math.round((targetDateRaw - 25569) * 86400 * 1000));
    } else {
        targetDate = new Date(targetDateRaw);
    }
    if (isNaN(targetDate.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    targetDate.setHours(0, 0, 0, 0);
    return Math.round((targetDate.getTime() - today.getTime()) / 86400000);
}

module.exports = {
    registry,
    getDaysDiff,
    getCapability: (id) => registry.find(c => c.id === id),
    // Send safe version to frontend (without functions)
    getFrontendRegistry: () => registry.map(c => ({
        id: c.id, title: c.title, icon: c.icon, color: c.color, target: c.target, fields: c.fields
    }))
};
