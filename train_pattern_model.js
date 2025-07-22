const tf = require('@tensorflow/tfjs-node');
const fs = require('fs');

// Load and parse CSV
const raw = fs.readFileSync('pattern_training_data.csv', 'utf8').split('\n');
const data = raw.slice(1).filter(Boolean).map(line => line.split(',').map(Number));
const X = data.map(row => row.slice(0, -1));
const y = data.map(row => row[row.length - 1]);

// Convert to tensors
const xs = tf.tensor2d(X);
const ys = tf.tensor2d(y, [y.length, 1]);

// Define a simple neural network model
const model = tf.sequential();
model.add(tf.layers.dense({ units: 64, activation: 'relu', inputShape: [X[0].length] }));
model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));

model.compile({ optimizer: 'adam', loss: 'binaryCrossentropy', metrics: ['accuracy'] });

(async () => {
  console.log('Training model...');
  await model.fit(xs, ys, { epochs: 20, batchSize: 32, validationSplit: 0.2 });
  await model.save('file://./pattern_model');
  console.log('Model trained and saved to ./pattern_model');
})(); 