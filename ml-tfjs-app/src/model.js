class MLModel {
    constructor(modelUrl) {
        this.modelUrl = modelUrl;
        this.model = null;
    }

    async loadModel() {
        this.model = await tf.loadLayersModel(this.modelUrl);
    }

    async predict(inputData) {
        if (!this.model) {
            throw new Error("Model is not loaded. Please load the model before making predictions.");
        }
        const inputTensor = tf.tensor(inputData);
        const prediction = this.model.predict(inputTensor);
        return prediction.array();
    }
}

export default MLModel;