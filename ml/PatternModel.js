const tf = require('@tensorflow/tfjs-node');
const fs = require('fs');
const path = require('path');
const IndicatorCalculator = require('../utils/IndicatorCalculator');

class PatternModel {
    constructor() {
        this.model = null;
    }

    async loadModel() {
        try {
            this.model = await tf.loadLayersModel('file://./pattern_model/model.json');
            console.log('🧠 Pattern recognition model loaded successfully');
            return true;
        } catch (error) {
            console.error('❌ Error loading model:', error);
            return false;
        }
    }

    async train(trainingDataPath) {
        console.log('🔄 Loading training data...');
        
        // Read and parse the CSV
        const raw = fs.readFileSync(trainingDataPath, 'utf8').split('\n');
        const header = raw[0].split(',');
        const data = raw.slice(1).filter(Boolean).map(line => line.split(',').map(Number));
        
        console.log(`📊 Loaded ${data.length} training examples`);
        
        // Validate data shape
        if (data[0].length !== 18) { // 17 features + 1 target
            throw new Error(`Expected 18 columns (17 features + target) but got ${data[0].length}`);
        }
        
        // Split features and target
        const X = data.map(row => row.slice(0, -1)); // All but last column
        const y = data.map(row => row[row.length - 1]); // Last column
        
        console.log('Features:', header.slice(0, -1));
        console.log('Number of features:', X[0].length);
        
        // Convert to tensors
        const xs = tf.tensor2d(X);
        const ys = tf.tensor2d(y, [y.length, 1]);

        const NUM_FEATURES = 17; // Match the number of features we extract
        
        this.model = tf.sequential();
        
        // Input layer with batch normalization
        this.model.add(tf.layers.dense({ 
            units: 128, 
            activation: 'relu',
            inputShape: [NUM_FEATURES]
        }));
        this.model.add(tf.layers.batchNormalization());
        this.model.add(tf.layers.dropout(0.2));
        
        // Hidden layers
        this.model.add(tf.layers.dense({ units: 64, activation: 'relu' }));
        this.model.add(tf.layers.batchNormalization());
        this.model.add(tf.layers.dropout(0.2));
        
        this.model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
        this.model.add(tf.layers.batchNormalization());
        
        // Output layer
        this.model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));

        // Define custom metrics
        const precision = (yTrue, yPred) => {
            const truePositives = tf.sum(tf.mul(yTrue, tf.round(yPred)));
            const predictedPositives = tf.sum(tf.round(yPred));
            return tf.div(truePositives, tf.maximum(predictedPositives, 1e-7));
        };
        
        const recall = (yTrue, yPred) => {
            const truePositives = tf.sum(tf.mul(yTrue, tf.round(yPred)));
            const actualPositives = tf.sum(yTrue);
            return tf.div(truePositives, tf.maximum(actualPositives, 1e-7));
        };

        await this.model.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'binaryCrossentropy',
            metrics: [
                'accuracy',
                precision,
                recall
            ]
        });
        
        console.log('🎯 Training pattern recognition model...');
        
        // Define number of epochs
        const epochs = 100;
        
        await this.model.fit(xs, ys, {
            epochs: epochs,
            batchSize: 32,
            validationSplit: 0.2,
            shuffle: true,
            callbacks: [
                {
                    bestLoss: Infinity,
                    patience: 5,
                    counter: 0,
                    bestWeights: null,
                    
                    onEpochEnd: async (epoch, logs) => {
                        console.log(
                            `Epoch ${epoch + 1}: ` +
                            `loss = ${logs.loss.toFixed(4)}, ` +
                            `accuracy = ${logs.acc.toFixed(4)}, ` +
                            `precision = ${logs.precision.toFixed(4)}, ` +
                            `recall = ${logs.recall.toFixed(4)}, ` +
                            `val_loss = ${logs.val_loss.toFixed(4)}, ` +
                            `val_accuracy = ${logs.val_acc.toFixed(4)}`
                        );
                        
                        if (logs.val_loss < this.bestLoss) {
                            this.bestLoss = logs.val_loss;
                            this.counter = 0;
                            await this.model.save('file://./pattern_model');
                        } else {
                            this.counter++;
                            if (this.counter >= this.patience) {
                                this.model.stopTraining = true;
                                console.log('Early stopping triggered');
                            }
                        }
                    }
                }
            ]
        });

        await this.model.save('file://./pattern_model');
        console.log('✅ Model trained and saved to ./pattern_model');
    }

    prepareMarketData(prices) {
        if (!Array.isArray(prices) || prices.length === 0) {
            throw new Error("Invalid price data");
        }
        
        const formattedPrices = prices.map(p => ({
            close: p.close,
            high: p.high,
            low: p.low,
            open: p.open,
            volume: p.volume || 1
        }));
        
        const indicators = new IndicatorCalculator(formattedPrices).calculateAll();
        
        // Get the last value of each indicator (most recent)
        const features = [
            // Price data
            prices[prices.length - 1].close,
            
            // Trend Indicators
            indicators.ema.short.slice(-1)[0],
            indicators.ema.medium.slice(-1)[0],
            indicators.ema.long.slice(-1)[0],
            indicators.macd.slice(-1)[0].MACD,
            indicators.macd.slice(-1)[0].signal,
            indicators.adx.slice(-1)[0],
            
            // Momentum Indicators
            indicators.rsi.slice(-1)[0],
            indicators.stochRSI.slice(-1)[0].k,
            indicators.stochRSI.slice(-1)[0].d,
            indicators.williamsR.slice(-1)[0],
            indicators.roc.slice(-1)[0],
            
            // Volatility Indicators
            indicators.atr.slice(-1)[0],
            indicators.bollinger.slice(-1)[0].middle,
            indicators.bollinger.slice(-1)[0].upper - indicators.bollinger.slice(-1)[0].middle,
            
            // Volume and Price Action
            indicators.obv.slice(-1)[0],
            indicators.cci.slice(-1)[0]
        ];
        
        return features;
    }

    async predict(prices) {
        if (!this.model) {
            throw new Error("Model not loaded. Call loadModel() first.");
        }
        
        const features = this.prepareMarketData(prices);
        const inputTensor = tf.tensor2d([features]);
        const prediction = await this.model.predict(inputTensor);
        const result = await prediction.data();
        
        // Cleanup
        inputTensor.dispose();
        prediction.dispose();
        
        // Calculate trade signal and exit conditions
        const signal = result[0] > 0.6 ? 'CALL' : result[0] < 0.4 ? 'PUT' : 'HOLD';
        const confidence = Math.abs(result[0] - 0.5) * 2; // Scale to 0-1
        
        // Get current market conditions
        const lastPrice = prices[prices.length - 1];
        const indicators = new IndicatorCalculator(prices).calculateAll();
        
        // Define exit conditions based on indicators
        const exitConditions = {
            profitTarget: signal === 'CALL' ? lastPrice.close * 1.005 : lastPrice.close * 0.995,
            stopLoss: signal === 'CALL' ? lastPrice.close * 0.997 : lastPrice.close * 1.003,
            
            technicalExits: {
                rsi: indicators.rsi.slice(-1)[0],
                rsiThreshold: signal === 'CALL' ? 70 : 30,
                macd: indicators.macd.slice(-1)[0],
                bollinger: indicators.bollinger.slice(-1)[0],
                atr: indicators.atr.slice(-1)[0],
                atrThreshold: indicators.atr.slice(-5).reduce((a, b) => a + b, 0) / 5 * 1.5
            }
        };

        return {
            probability: result[0],
            signal,
            confidence,
            exitConditions,
            indicators: {
                rsi: indicators.rsi.slice(-1)[0],
                macd: indicators.macd.slice(-1)[0],
                bollinger: indicators.bollinger.slice(-1)[0],
                atr: indicators.atr.slice(-1)[0]
            }
        };
    }
}

// Export the class itself, not an instance
module.exports = PatternModel;
