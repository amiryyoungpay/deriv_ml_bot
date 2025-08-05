const fs = require('fs');
const { 
    RSI, EMA, MACD, ATR, 
    BollingerBands, 
    StochasticRSI,
    ADX, // Average Directional Index
    ROC, // Rate of Change
    CCI, // Commodity Channel Index
    WilliamsR,
    OBV // On Balance Volume
} = require('technicalindicators');

class IndicatorCalculator {
    constructor(prices) {
        this.prices = prices;
        this.closePrices = prices.map(p => p.close);
        this.highPrices = prices.map(p => p.high);
        this.lowPrices = prices.map(p => p.low);
        this.volume = prices.map(p => p.volume || 1); // Default volume to 1 if not available
    }

    calculateAll() {
        return {
            // Trend Indicators
            ema: this.calculateEMA(),
            macd: this.calculateMACD(),
            adx: this.calculateADX(),
            
            // Momentum Indicators
            rsi: this.calculateRSI(),
            stochRSI: this.calculateStochRSI(),
            williamsR: this.calculateWilliamsR(),
            roc: this.calculateROC(),
            
            // Volatility Indicators
            atr: this.calculateATR(),
            bollinger: this.calculateBollinger(),
            
            // Volume Indicators
            obv: this.calculateOBV(),
            
            // Price Action
            cci: this.calculateCCI()
        };
    }

    calculateRSI() {
        return RSI.calculate({
            values: this.closePrices,
            period: 14
        });
    }

    calculateEMA() {
        return {
            short: EMA.calculate({ values: this.closePrices, period: 5 }),
            medium: EMA.calculate({ values: this.closePrices, period: 12 }),
            long: EMA.calculate({ values: this.closePrices, period: 26 })
        };
    }

    calculateMACD() {
        return MACD.calculate({
            values: this.closePrices,
            fastPeriod: 12,
            slowPeriod: 26,
            signalPeriod: 9,
            SimpleMAOscillator: false,
            SimpleMASignal: false
        });
    }

    calculateATR() {
        return ATR.calculate({
            high: this.highPrices,
            low: this.lowPrices,
            close: this.closePrices,
            period: 14
        });
    }

    calculateBollinger() {
        return BollingerBands.calculate({
            values: this.closePrices,
            period: 20,
            stdDev: 2
        });
    }

    calculateStochRSI() {
        return StochasticRSI.calculate({
            values: this.closePrices,
            rsiPeriod: 14,
            stochasticPeriod: 14,
            kPeriod: 3,
            dPeriod: 3
        });
    }

    calculateADX() {
        return ADX.calculate({
            high: this.highPrices,
            low: this.lowPrices,
            close: this.closePrices,
            period: 14
        });
    }

    calculateROC() {
        return ROC.calculate({
            values: this.closePrices,
            period: 12
        });
    }

    calculateCCI() {
        return CCI.calculate({
            high: this.highPrices,
            low: this.lowPrices,
            close: this.closePrices,
            period: 20
        });
    }

    calculateWilliamsR() {
        return WilliamsR.calculate({
            high: this.highPrices,
            low: this.lowPrices,
            close: this.closePrices,
            period: 14
        });
    }

    calculateOBV() {
        return OBV.calculate({
            close: this.closePrices,
            volume: this.volume
        });
    }
}

module.exports = IndicatorCalculator;
