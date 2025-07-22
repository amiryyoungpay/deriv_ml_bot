const DerivAPIBasic = require('@deriv/deriv-api/dist/DerivAPIBasic');
const WebSocket = require('ws');
const fs = require('fs');
const { RSI, EMA, MACD, BollingerBands } = require('technicalindicators');

// Parameters
const symbol = 'R_100';
const granularity = 60; // 1-minute candles
const count = 1000; // Number of candles to fetch
const app_id = 85993;

async function fetchCandlesDerivAPI() {
    const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${app_id}`);
    const api = new DerivAPIBasic({ connection: ws });
    await new Promise(resolve => ws.on('open', resolve));
    try {
        const response = await api.ticksHistory({
            ticks_history: symbol,
            style: 'candles',
            granularity,
            count,
            end: 'latest',
        });
        if (response.candles) {
            return response.candles;
        } else {
            throw new Error('No candle data received');
        }
    } catch (err) {
        console.error('Error fetching candles:', err.message);
        return [];
    } finally {
        ws.close();
    }
}

(async () => {
    const candles = await fetchCandlesDerivAPI();
    if (!candles.length) {
        console.error('No candles fetched. Exiting.');
        return;
    }
    console.log(`Fetched ${candles.length} candles.`);

    // Extract close prices for indicator calculations
    const closes = candles.map(c => c.close);

    // Calculate indicators
    const rsi = RSI.calculate({ values: closes, period: 14 });
    const emaShort = EMA.calculate({ values: closes, period: 5 });
    const emaLong = EMA.calculate({ values: closes, period: 12 });
    const macd = MACD.calculate({
        values: closes,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false
    });
    const bb = BollingerBands.calculate({
        values: closes,
        period: 20,
        stdDev: 2
    });

    // Align all arrays (find the max lookback)
    const lookback = Math.max(14, 26, 20); // largest period used
    const rows = [];
    for (let i = lookback; i < candles.length; i++) {
        const c = candles[i];
        const macdIdx = i - (closes.length - macd.length);
        const bbIdx = i - (closes.length - bb.length);
        rows.push({
            timestamp: c.epoch,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            rsi: rsi[i - (closes.length - rsi.length)],
            ema_short: emaShort[i - (closes.length - emaShort.length)],
            ema_long: emaLong[i - (closes.length - emaLong.length)],
            macd: macd[macdIdx]?.MACD,
            macd_signal: macd[macdIdx]?.signal,
            macd_hist: macd[macdIdx]?.histogram,
            bb_upper: bb[bbIdx]?.upper,
            bb_middle: bb[bbIdx]?.middle,
            bb_lower: bb[bbIdx]?.lower
        });
    }

    // Write to CSV
    const header = 'timestamp,open,high,low,close,rsi,ema_short,ema_long,macd,macd_signal,macd_hist,bb_upper,bb_middle,bb_lower\n';
    const csv = rows.map(r =>
        [r.timestamp, r.open, r.high, r.low, r.close, r.rsi, r.ema_short, r.ema_long, r.macd, r.macd_signal, r.macd_hist, r.bb_upper, r.bb_middle, r.bb_lower].join(',')
    ).join('\n');
    fs.writeFileSync('training_data.csv', header + csv);
    console.log('Saved training_data.csv with indicator features.');
})(); 