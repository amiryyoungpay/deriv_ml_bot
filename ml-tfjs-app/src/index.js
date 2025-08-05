import * as tf from '@tensorflow/tfjs';
import { MLModel } from './model';

const model = new MLModel();
const inputElement = document.getElementById('input');
const predictButton = document.getElementById('predict');
const outputElement = document.getElementById('output');

async function loadModel() {
    await model.load();
    console.log('Model loaded');
}

async function makePrediction() {
    const inputData = parseInput(inputElement.value);
    const prediction = await model.predict(inputData);
    outputElement.innerText = `Prediction: ${prediction}`;
}

function parseInput(input) {
    // Convert input string to an array of numbers
    return input.split(',').map(Number);
}

predictButton.addEventListener('click', makePrediction);
loadModel();