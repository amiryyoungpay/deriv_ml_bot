const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

class DataCollector {
    constructor(config) {
        this.config = config;
        this.ws = null;
        this.data = [];
        this.isCollecting = false;
    }

    async start() {
        console.log('🔄 Starting data collection...');
        this.isCollecting = true;
        await this.connectWebSocket();
    }

    async connectWebSocket() {
        return new Promise((resolve) => {
            const endpoint = 'wss://ws.binaryws.com/websockets/v3?app_id=1089';
            this.ws = new WebSocket(endpoint);

            this.ws.on('open', () => {
                console.log('📡 WebSocket connected for data collection');
                this.ws.send(JSON.stringify({ authorize: this.config.DERIV_TOKEN }));
            });

            this.ws.on('message', async (data) => {
                const msg = JSON.parse(data);

                if (msg.msg_type === 'authorize') {
                    console.log('✅ Authorized for data collection');
                    // Request historical data and start ticks subscription
                    this.requestHistoricalData();
                    resolve();
                }

                if (msg.msg_type === 'history') {
                    this.processHistoricalData(msg.history);
                }

                if (msg.msg_type === 'candles') {
                    this.processCandles(msg.candles);
                }
            });
        });
    }

    requestHistoricalData() {
        // Request last 1000 candles
        const request = {
            ticks_history: this.config.SYMBOL,
            adjust_start_time: 1,
            count: 1000,
            end: 'latest',
            granularity: 60,
            start: 1,
            style: 'candles'
        };
        this.ws.send(JSON.stringify(request));
    }

    processHistoricalData(history) {
        if (!history || !history.prices) return;
        
        const formattedData = history.prices.map(candle => ({
            timestamp: candle.epoch,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close
        }));

        this.data = [...this.data, ...formattedData];
        this.saveData();
    }

    processCandles(candles) {
        if (!candles || !Array.isArray(candles)) return;
        
        const newData = candles.map(candle => ({
            timestamp: candle.epoch,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close
        }));

        this.data = [...this.data, ...newData];
        this.saveData();
    }

    saveData() {
        // Remove duplicates based on timestamp
        this.data = Array.from(new Map(this.data.map(item => [item.timestamp, item])).values());
        // Sort by timestamp
        this.data.sort((a, b) => a.timestamp - b.timestamp);
        
        const csv = this.convertToCSV(this.data);
        fs.writeFileSync('training_data.csv', csv);
        console.log(`📊 Saved ${this.data.length} candles to training_data.csv`);
    }

    convertToCSV(data) {
        const header = 'timestamp,open,high,low,close\n';
        const rows = data.map(candle => 
            `${candle.timestamp},${candle.open},${candle.high},${candle.low},${candle.close}`
        );
        return header + rows.join('\n');
    }

    stop() {
        if (this.ws) {
            this.ws.close();
            this.isCollecting = false;
        }
    }
}

module.exports = DataCollector;
