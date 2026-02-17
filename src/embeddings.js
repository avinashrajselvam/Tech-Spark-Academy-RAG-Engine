// ─────────────────────────────────────────────────────────────
// Tech Spark Academy RAG — Embedding Engine
// Local transformer-based embeddings via @xenova/transformers
// ─────────────────────────────────────────────────────────────

import { pipeline, env } from '@xenova/transformers';

// Disable local model check to always pull from hub on first run
env.allowLocalModels = true;
env.cacheDir = './data/models';

let extractor = null;
let modelName = '';
let warmupDone = false;

/**
 * Initialize the embedding model.
 * Caches the pipeline so subsequent calls are instant.
 */
async function initEmbeddings(model = 'Xenova/all-MiniLM-L6-v2') {
    if (extractor && modelName === model) return;

    console.log(`⚡ Loading embedding model: ${model}`);
    const start = performance.now();

    extractor = await pipeline('feature-extraction', model, {
        quantized: true,
    });
    modelName = model;

    // Warm up with a dummy embedding
    if (!warmupDone) {
        await extractor('warmup', { pooling: 'mean', normalize: true });
        warmupDone = true;
    }

    const elapsed = (performance.now() - start).toFixed(0);
    console.log(`✅ Embedding model loaded in ${elapsed}ms (dim=${await getDimensions()})`);
}

/**
 * Embed a single text string.
 * @param {string} text
 * @returns {Promise<number[]>} Normalized embedding vector
 */
async function embed(text) {
    if (!extractor) throw new Error('Embedding model not initialized. Call initEmbeddings() first.');

    const output = await extractor(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
}

/**
 * Embed a batch of text strings.
 * @param {string[]} texts
 * @returns {Promise<number[][]>} Array of normalized embedding vectors
 */
async function embedBatch(texts) {
    if (!extractor) throw new Error('Embedding model not initialized. Call initEmbeddings() first.');

    const results = [];
    // Process in micro-batches to avoid memory spikes
    const batchSize = 16;
    for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const embeddings = await Promise.all(
            batch.map(async (text) => {
                const output = await extractor(text, { pooling: 'mean', normalize: true });
                return Array.from(output.data);
            })
        );
        results.push(...embeddings);
    }
    return results;
}

/**
 * Get the dimensionality of the loaded model.
 */
async function getDimensions() {
    if (!extractor) return 0;
    const output = await extractor('test', { pooling: 'mean', normalize: true });
    return output.data.length;
}

/**
 * Check if the embedding model is ready.
 */
function isReady() {
    return extractor !== null;
}

export { initEmbeddings, embed, embedBatch, getDimensions, isReady };
