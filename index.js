const WebSocket = require('ws');
const mongoose = require('mongoose');
const tf = require('@tensorflow/tfjs-node');
const cron = require('node-cron');
const axios = require('axios');
const RSI = require('technicalindicators').RSI;
const EMA = require('technicalindicators').EMA;
const MACD = require('technicalindicators').MACD;
const ATR = require('technicalindicators').ATR;

const DERIV_TOKEN = 'yrrFd2hQpe8QD71';
const MONGO_URI = 'mongodb+srv://sirtheprogrammer:01319943591Bk.@cluster0.p2rjers.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const X_API_KEY = 'AAAAAAAAAAAAAAAAAAAAADN70wEAAAAAftssinLsML3w%2BUa6rhl%2FkWQ1xIo%3Dv7CaRILGhk2ExZZ3Lyf7H7eSmx2MfqiQeoVbax9qdoYMfYmDoA';

let ws;
let reconnectTimeout = 3000;
let prices = [];
let model;
let latestATR = null;

const rsiPeriod = 14;
const emaShortPeriod = 5;
const emaLongPeriod = 12;
const macdInput = {
    values: [],
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false
};

let lastTradeTime = null;
let currentContractId = null;
let accountBalance = 1000;

mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('🧠 MongoDB locked, ready to dominate')).catch(err => console.error('❌ MongoDB Error:', err));

const tradeSchema = new mongoose.Schema({
    time: Date,
    action: String,
    rsi: Number,
    confidence: Number,
    result: String,
    contract_id: String,
    profit: Number,
    extra_signals: Object,
    lot_size: Number
});

const Trade = mongoose.model('Trade', tradeSchema);

async function loadPretrainedModel() {
    try {
        model = await tf.loadLayersModel('file://./models/pretrained_lstm.json');
        console.log('🤖 Pre-trained LSTM loaded for R_100 chaos');
    } catch (err) {
        console.error('❌ Model Load Error:', err.message);
        process.exit(1);
    }
}

function initializeWebSocket() {
    ws = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=72026', {
        headers: { 'User-Agent': getRandomUserAgent() }
    });

    ws.on('open', () => {
        console.log('🔌 WebSocket connected, dark mode ON');
        ws.send(JSON.stringify({ authorize: DERIV_TOKEN }));
        setInterval(() => ws.send(JSON.stringify({ ping: 1 })), 30000 + Math.random() * 5000);
    });

    ws.on('message', async (data) => {
        const msg = JSON.parse(data);

        if (msg.msg_type === 'authorize') {
            console.log('✅ Authorized, let’s fuck up the market');
            ws.send(JSON.stringify({ ticks: 'R_100' }));
            ws.send(JSON.stringify({ balance: 1, subscribe: 1 }));
        }

        if (msg.msg_type === 'balance') {
            accountBalance = msg.balance.balance;
            console.log(`💰 Balance: ${accountBalance}`);
        }

        if (msg.msg_type === 'tick') {
            const tick = msg.tick;
            if (!tick || !tick.quote) return;

            prices.push(tick.quote);
            if (prices.length > 100) {
                prices = prices.slice(-100);

                // Prepare OHLC arrays for ATR
                const ohlc = prices.map((close, idx) => {
                    // For ATR, we need open, high, low, close. We'll approximate open as previous close.
                    const prevClose = idx > 0 ? prices[idx - 1] : close;
                    return {
                        open: prevClose,
                        high: Math.max(prevClose, close),
                        low: Math.min(prevClose, close),
                        close: close
                    };
                });
                const highs = ohlc.map(c => c.high);
                const lows = ohlc.map(c => c.low);
                const closes = ohlc.map(c => c.close);
                // Calculate ATR
                const atrArr = ATR.calculate({
                    high: highs,
                    low: lows,
                    close: closes,
                    period: 14
                });
                latestATR = atrArr[atrArr.length - 1];

                const input = tf.tensor2d(prices.map(p => [p]), [1, 100, 1]);
                const lstmPred = model.predict(input).dataSync()[0];
                const rsi = RSI.calculate({ values: prices.slice(-rsiPeriod), period: rsiPeriod });
                const emaShort = EMA.calculate({ values: prices.slice(-emaShortPeriod), period: emaShortPeriod });
                const emaLong = EMA.calculate({ values: prices.slice(-emaLongPeriod), period: emaLongPeriod });

                macdInput.values = prices;
                const macdResult = MACD.calculate(macdInput);

                const lastRSI = rsi[rsi.length - 1];
                const lastEMAShort = emaShort[emaShort.length - 1];
                const lastEMALong = emaLong[emaLong.length - 1];
                const lastMACD = macdResult[macdResult.length - 1];

                const trendBias = lastEMAShort > lastEMALong ? 'bullish' : 'bearish';
                const macdSignal = lastMACD && lastMACD.MACD > lastMACD.signal ? 'buy' : 'sell';

                const confidence = calculateConfidence(lastRSI, lstmPred);
                console.log(`📉 Price: ${tick.quote} | RSI: ${lastRSI.toFixed(2)} | LSTM: ${lstmPred.toFixed(2)} | Confidence: ${confidence}`);

                if (confidence >= 0.7) {
                    const now = Date.now();
                    adjustTradeInterval(Math.abs(lastRSI - 50) / 50); // Volatility based on RSI

                    if (!lastTradeTime || now - lastTradeTime >= tradeInterval) {
                        let action = lstmPred > 0.6 && lastRSI < 35 && trendBias === 'bullish' && macdSignal === 'buy' ? 'CALL' :
                            lstmPred < 0.4 && lastRSI > 65 && trendBias === 'bearish' && macdSignal === 'sell' ? 'PUT' : null;

                        if (action) {
                            lastTradeTime = now;
                            const lotSize = calculateLotSize(accountBalance, confidence);
                            executeTrade(action, lastRSI, confidence, { trendBias, macdSignal, lstmPred }, lotSize);
                        }
                    }
                }
                input.dispose();
            }
        }

        if (msg.msg_type === 'buy') {
            currentContractId = msg.buy.contract_id;
            console.log(`💸 Trade executed. ID: ${msg.buy.transaction_id} | Contract: ${currentContractId}`);
        }

        if (msg.msg_type === 'proposal_open_contract') {
            const result = msg.proposal_open_contract;
            if (result && result.is_expired && result.contract_id === currentContractId) {
                const outcome = result.profit >= 0 ? 'win' : 'loss';
                console.log(`🎯 Contract expired: ${outcome.toUpperCase()} | Profit: ${result.profit}`);
                logTradeResult(result.contract_id, outcome, result.profit);
                currentContractId = null;
            }
        }
    });

    ws.on('error', (err) => {
        console.error('❌ WebSocket Error:', err.message);
        reconnect();
    });

    ws.on('close', () => {
        console.warn('⚠️ WebSocket closed. Reconnecting...');
        reconnect();
    });
}

function reconnect() {
    setTimeout(() => {
        console.log('♻️ Reconnecting, staying stealth');
        initializeWebSocket();
    }, reconnectTimeout + Math.random() * 1000);
}

function calculateConfidence(rsi, lstmPred) {
    const rsiScore = rsi < 35 ? 0.25 : rsi > 65 ? -0.25 : 0;
    const lstmScore = (lstmPred - 0.5) * 0.5;
    return Math.min(1, Math.max(0, 0.6 + rsiScore + lstmScore)).toFixed(2);
}

function calculateLotSize(balance, confidence) {
    const kellyFraction = 0.15; // More Aggressive
    const risk = balance * kellyFraction * Math.pow(confidence, 1.5); // Increase Lot Size Exponentially with Confidence
    return Math.max(0.01, Math.min(0.15, (risk / 10).toFixed(2))); // Cap Lot Size
}

async function executeTrade(action, rsi, confidence, signals, lotSize) {
    const tradeDetails = {
        buy: 1,
        price: 10,
        parameters: {
            amount: lotSize * 100,
            basis: 'stake',
            contract_type: action,
            currency: 'USD',
            duration: 1,
            duration_unit: 'm',
            symbol: 'R_100'
        }
    };

    console.log(`🚀 ${action} TRADE | RSI: ${rsi.toFixed(2)} | Confidence: ${confidence} | Lot: ${lotSize}`);
    ws.send(JSON.stringify(tradeDetails));

    const trade = new Trade({
        time: new Date(),
        action,
        rsi,
        confidence,
        result: 'pending',
        contract_id: null,
        profit: 0,
        extra_signals: signals,
        lot_size: lotSize
    });

    await trade.save();
}

async function logTradeResult(contract_id, outcome, profit) {
    await Trade.findOneAndUpdate(
        { result: 'pending' },
        { result: outcome, contract_id, profit },
        { sort: { time: -1 } }
    );

    console.log(`📝 Trade ${contract_id} logged: ${outcome.toUpperCase()} | Profit: ${profit}`);
    analyzePerformance();
}

async function analyzePerformance() {
    const trades = await Trade.find().sort({ time: -1 }).limit(100);
    const wins = trades.filter(t => t.result === 'win').length;
    const totalProfit = trades.reduce((sum, t) => sum + t.profit, 0);
    const winRate = (wins / trades.length * 100).toFixed(2);
    console.log(`📊 Win Rate: ${winRate}% | Total Profit: ${totalProfit}`);
}

function getRandomUserAgent() {
    const userAgents = [
        `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/${Math.random() * 1000}`,
        `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_${Math.floor(Math.random() * 15) + 7}) AppleWebKit/${Math.random() * 1000}`,
        `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/${Math.random() * 1000}`
    ];
    return userAgents[Math.floor(Math.random() * userAgents.length)];
}

function adjustTradeInterval(volatility) {
    const baseInterval = 15000; // milliseconds
    const adjustedInterval = baseInterval * (1 - volatility); // Reduce interval with higher volatility
    tradeInterval = Math.max(5000, adjustedInterval); // Minimum 5 seconds
    console.log(`⚙️ Trade interval adjusted to: ${tradeInterval.toFixed(0)}ms`);
}

(async () => {
    await loadPretrainedModel();
    initializeWebSocket();
})();
