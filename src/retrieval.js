// ─────────────────────────────────────────────────────────────
// Tech Spark Academy RAG — Hybrid Retrieval Engine
// Vector + BM25 fusion with Reciprocal Rank Fusion
// ─────────────────────────────────────────────────────────────

import VectorStore from './vectorStore.js';
import { embed } from './embeddings.js';

// ── BM25 Scoring ────────────────────────────────────────────

/**
 * Simple BM25 implementation for keyword-based retrieval.
 */
class BM25Index {
    constructor() {
        this.docs = new Map();     // id → { tokens, length }
        this.df = new Map();       // term → document frequency
        this.avgDl = 0;
        this.k1 = 1.5;
        this.b = 0.75;
    }

    /** Tokenize and normalize text */
    _tokenize(text) {
        return text
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length > 1);
    }

    /** Add a document to the BM25 index */
    add(id, text) {
        const tokens = this._tokenize(text);
        const termFreqs = new Map();
        for (const t of tokens) {
            termFreqs.set(t, (termFreqs.get(t) || 0) + 1);
        }
        this.docs.set(id, { tokens: termFreqs, length: tokens.length });

        // Update DF
        for (const term of termFreqs.keys()) {
            this.df.set(term, (this.df.get(term) || 0) + 1);
        }

        // Update average document length
        let totalLen = 0;
        for (const d of this.docs.values()) totalLen += d.length;
        this.avgDl = totalLen / this.docs.size;
    }

    /** Remove a document */
    remove(id) {
        const doc = this.docs.get(id);
        if (!doc) return;
        for (const term of doc.tokens.keys()) {
            const newDf = (this.df.get(term) || 1) - 1;
            if (newDf <= 0) this.df.delete(term);
            else this.df.set(term, newDf);
        }
        this.docs.delete(id);
        let totalLen = 0;
        for (const d of this.docs.values()) totalLen += d.length;
        this.avgDl = this.docs.size > 0 ? totalLen / this.docs.size : 0;
    }

    /** Search the BM25 index */
    search(query, topK = 10) {
        const queryTokens = this._tokenize(query);
        const n = this.docs.size;
        if (n === 0) return [];

        const scores = [];
        for (const [id, doc] of this.docs) {
            let score = 0;
            for (const qt of queryTokens) {
                const tf = doc.tokens.get(qt) || 0;
                if (tf === 0) continue;
                const docFreq = this.df.get(qt) || 0;
                const idf = Math.log((n - docFreq + 0.5) / (docFreq + 0.5) + 1);
                const tfNorm = (tf * (this.k1 + 1)) / (tf + this.k1 * (1 - this.b + this.b * doc.length / this.avgDl));
                score += idf * tfNorm;
            }
            if (score > 0) scores.push({ id, score });
        }

        scores.sort((a, b) => b.score - a.score);
        return scores.slice(0, topK);
    }
}

// ── Hybrid Retrieval Engine ─────────────────────────────────

class RetrievalEngine {
    constructor(vectorStore) {
        this.vectorStore = vectorStore;
        this.bm25 = new BM25Index();
        this.alpha = 0.7;  // Weight for vector search (0.0–1.0)
    }

    /**
     * Add a chunk to both vector and BM25 indices.
     */
    addChunk(id, vector, metadata) {
        this.vectorStore.add(id, vector, metadata);
        this.bm25.add(id, metadata.text || '');
    }

    /**
     * Remove a chunk from both indices.
     */
    removeChunk(id) {
        this.vectorStore.remove(id);
        this.bm25.remove(id);
    }

    /**
     * Remove all chunks for a document.
     */
    removeDocument(docId) {
        const removed = this.vectorStore.removeByMetadata(m => m.docId === docId);
        // Also remove from BM25 (we need to find matching keys)
        for (const [id] of [...this.bm25.docs]) {
            // Chunk IDs start with docId
            if (id.startsWith(docId)) {
                this.bm25.remove(id);
            }
        }
        return removed;
    }

    /**
     * Hybrid search: vector + BM25 with Reciprocal Rank Fusion.
     * @param {string} query - the user query text
     * @param {object} opts - { topK, alpha }
     * @returns {{ results, vectorLatencyMs, bm25LatencyMs, totalLatencyMs }}
     */
    async search(query, opts = {}) {
        const topK = opts.topK || 5;
        const alpha = opts.alpha ?? this.alpha;
        const totalStart = performance.now();

        // 1. Vector search
        const queryVector = await embed(query);
        const vectorResult = this.vectorStore.search(queryVector, topK * 2);
        const vectorLatencyMs = vectorResult.latencyMs;

        // 2. BM25 search
        const bm25Start = performance.now();
        const bm25Results = this.bm25.search(query, topK * 2);
        const bm25LatencyMs = +(performance.now() - bm25Start).toFixed(2);

        // 3. Reciprocal Rank Fusion
        const rrf = new Map();
        const k = 60; // RRF constant

        for (let i = 0; i < vectorResult.results.length; i++) {
            const { id, metadata } = vectorResult.results[i];
            const rrfScore = alpha / (k + i + 1);
            rrf.set(id, (rrf.get(id) || 0) + rrfScore);
        }

        for (let i = 0; i < bm25Results.length; i++) {
            const { id } = bm25Results[i];
            const rrfScore = (1 - alpha) / (k + i + 1);
            rrf.set(id, (rrf.get(id) || 0) + rrfScore);
        }

        // Sort by fused score and get top K
        const fused = [...rrf.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, topK)
            .map(([id, score]) => {
                const entry = this.vectorStore.vectors.get(id);
                return {
                    id,
                    fusedScore: +score.toFixed(6),
                    metadata: entry?.metadata || {},
                };
            })
            .filter(r => r.metadata.text); // only return results with actual content

        const totalLatencyMs = +(performance.now() - totalStart).toFixed(2);

        return {
            results: fused,
            vectorLatencyMs,
            bm25LatencyMs,
            totalLatencyMs,
            vectorCandidates: vectorResult.results.length,
            bm25Candidates: bm25Results.length,
        };
    }

    /**
     * Assemble context from search results for the LLM prompt.
     */
    assembleContext(results, maxTokens = 300) {
        let context = '';
        let charBudget = maxTokens * 4; // rough char estimate

        for (const r of results) {
            const meta = r.metadata;
            const header = `--- [${meta.filename}] (${meta.language}) lines ${meta.startLine}-${meta.endLine} ---`;
            const block = `${header}\n${meta.text}\n\n`;

            if (context.length + block.length > charBudget) break;
            context += block;
        }

        return context.trim();
    }
}

export default RetrievalEngine;
export { BM25Index };
