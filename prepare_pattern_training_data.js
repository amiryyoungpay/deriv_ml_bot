const fs = require('fs');
const WINDOW_SIZE = 10;
const PROFIT_HORIZON = 5;
const PROFIT_THRESHOLD = 0.002; // 0.2%

// Read CSV
const raw = fs.readFileSync('training_data.csv', 'utf8').split('\n');
const header = raw[0].split(',');
const data = raw.slice(1).filter(Boolean).map(line => line.split(',').map(Number));

const feature_names = header.slice(1); // exclude timestamp
const features_per_candle = feature_names.length;

const rows = [];
for (let i = 0; i < data.length - WINDOW_SIZE - PROFIT_HORIZON; i++) {
    // Build window
    let window = [];
    for (let j = 0; j < WINDOW_SIZE; j++) {
        window = window.concat(data[i + j].slice(1)); // exclude timestamp
    }
    // Label: compare close at end of window vs. close PROFIT_HORIZON ahead
    const close_now = data[i + WINDOW_SIZE - 1][header.indexOf('close')];
    const close_future = data[i + WINDOW_SIZE - 1 + PROFIT_HORIZON][header.indexOf('close')];
    const label = (close_future >= close_now * (1 + PROFIT_THRESHOLD)) ? 1 : 0;
    rows.push([...window, label]);
}

// Write header
const window_header = [];
for (let i = 0; i < WINDOW_SIZE; i++) {
    for (const f of feature_names) {
        window_header.push(`${f}_${i+1}`);
    }
}
window_header.push('label');

const csv = [window_header.join(',')].concat(rows.map(r => r.join(','))).join('\n');
fs.writeFileSync('pattern_training_data.csv', csv);
console.log('Saved pattern_training_data.csv for ML pattern recognition.'); 