const { RSI } = require('technicalindicators');

function calculateRSI(closes, period = 14) {
    return RSI.calculate({ values: closes, period });
}

module.exports = { calculateRSI };
