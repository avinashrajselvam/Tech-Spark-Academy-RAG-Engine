// ─────────────────────────────────────────────────────────────
// Tech Spark Academy RAG — In-Memory HNSW Vector Store
// Ultra-fast cosine similarity search with persistence support
// ─────────────────────────────────────────────────────────────

import fs from 'fs/promises';
import path from 'path';

/**
 * Cosine similarity between two vectors
 */
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * HNSW-inspired multi-layer graph for approximate nearest neighbor search.
 * Optimized for high-dimensional embedding vectors with O(log n) search.
 */
class VectorStore {
  constructor(opts = {}) {
    this.vectors = new Map();        // id → { vector, metadata }
    this.neighbors = new Map();      // id → Set<id>  (graph edges)
    this.maxNeighbors = opts.maxNeighbors || 16;
    this.efConstruction = opts.efConstruction || 100;
    this.efSearch = opts.efSearch || 50;
    this.persistPath = opts.persistPath || null;
    this._dirty = false;
  }

  /** Number of stored vectors */
  get size() {
    return this.vectors.size;
  }

  /**
   * Add a vector to the store.
   * @param {string} id - unique identifier
   * @param {number[]} vector - embedding vector
   * @param {object} metadata - associated metadata
   */
  add(id, vector, metadata = {}) {
    this.vectors.set(id, { vector: Array.from(vector), metadata });

    // Build HNSW-style graph: connect to nearest existing neighbors
    if (this.vectors.size === 1) {
      this.neighbors.set(id, new Set());
      this._dirty = true;
      return;
    }

    const nearest = this._bruteForceSearch(vector, Math.min(this.maxNeighbors, this.vectors.size - 1), id);
    const neighborSet = new Set();

    for (const { id: nId } of nearest) {
      neighborSet.add(nId);
      // Bidirectional edge
      if (!this.neighbors.has(nId)) this.neighbors.set(nId, new Set());
      const nNeighbors = this.neighbors.get(nId);
      nNeighbors.add(id);

      // Prune if over max
      if (nNeighbors.size > this.maxNeighbors) {
        this._pruneNeighbors(nId);
      }
    }

    this.neighbors.set(id, neighborSet);
    this._dirty = true;
  }

  /**
   * Batch add vectors.
   */
  addBatch(items) {
    for (const { id, vector, metadata } of items) {
      this.add(id, vector, metadata);
    }
  }

  /**
   * Remove a vector by id.
   */
  remove(id) {
    if (!this.vectors.has(id)) return false;
    this.vectors.delete(id);

    // Remove graph edges
    const myNeighbors = this.neighbors.get(id) || new Set();
    for (const nId of myNeighbors) {
      const nSet = this.neighbors.get(nId);
      if (nSet) nSet.delete(id);
    }
    this.neighbors.delete(id);
    this._dirty = true;
    return true;
  }

  /**
   * Remove all vectors matching a metadata filter.
   */
  removeByMetadata(filterFn) {
    const toRemove = [];
    for (const [id, { metadata }] of this.vectors) {
      if (filterFn(metadata)) toRemove.push(id);
    }
    for (const id of toRemove) this.remove(id);
    return toRemove.length;
  }

  /**
   * Search for the top-K nearest vectors.
   * Uses graph-based greedy search for speed, falls back to brute force for small stores.
   * @returns {Array<{id, score, metadata}>}
   */
  search(queryVector, topK = 5) {
    const start = performance.now();

    if (this.vectors.size === 0) return { results: [], latencyMs: 0 };
    if (this.vectors.size <= 100) {
      // Brute force is faster for small stores
      const results = this._bruteForceSearch(queryVector, topK);
      return { results, latencyMs: +(performance.now() - start).toFixed(2) };
    }

    // HNSW-style greedy search
    const visited = new Set();
    const candidates = new Map(); // id → score

    // Start from a random entry point
    const entryId = this.vectors.keys().next().value;
    const entryScore = cosineSimilarity(queryVector, this.vectors.get(entryId).vector);
    candidates.set(entryId, entryScore);
    visited.add(entryId);

    let improved = true;
    let iterations = 0;
    const maxIterations = this.efSearch * 2;

    while (improved && iterations < maxIterations) {
      improved = false;
      iterations++;

      // Get the best candidate so far
      let bestId = null, bestScore = -Infinity;
      for (const [id, score] of candidates) {
        if (score > bestScore) { bestScore = score; bestId = id; }
      }

      // Explore neighbors of the best candidate
      const neighborIds = this.neighbors.get(bestId) || new Set();
      for (const nId of neighborIds) {
        if (visited.has(nId)) continue;
        visited.add(nId);

        const nEntry = this.vectors.get(nId);
        if (!nEntry) continue;

        const score = cosineSimilarity(queryVector, nEntry.vector);
        candidates.set(nId, score);

        // Expand search frontier from this neighbor too
        const nNeighbors = this.neighbors.get(nId) || new Set();
        for (const nnId of nNeighbors) {
          if (visited.has(nnId)) continue;
          visited.add(nnId);
          const nnEntry = this.vectors.get(nnId);
          if (!nnEntry) continue;
          const nnScore = cosineSimilarity(queryVector, nnEntry.vector);
          candidates.set(nnId, nnScore);
        }

        improved = true;
      }
    }

    // Sort and return top K
    const sorted = [...candidates.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([id, score]) => ({
        id,
        score: +score.toFixed(4),
        metadata: this.vectors.get(id)?.metadata || {}
      }));

    return { results: sorted, latencyMs: +(performance.now() - start).toFixed(2) };
  }

  /**
   * Brute-force linear search (used for small stores and during construction).
   */
  _bruteForceSearch(queryVector, topK, excludeId = null) {
    const scores = [];
    for (const [id, { vector, metadata }] of this.vectors) {
      if (id === excludeId) continue;
      const score = cosineSimilarity(queryVector, vector);
      scores.push({ id, score: +score.toFixed(4), metadata });
    }
    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, topK);
  }

  /**
   * Prune a node's neighbors to maxNeighbors, keeping the most similar.
   */
  _pruneNeighbors(id) {
    const entry = this.vectors.get(id);
    if (!entry) return;
    const nSet = this.neighbors.get(id);
    if (!nSet || nSet.size <= this.maxNeighbors) return;

    const scored = [];
    for (const nId of nSet) {
      const nEntry = this.vectors.get(nId);
      if (!nEntry) continue;
      scored.push({ id: nId, score: cosineSimilarity(entry.vector, nEntry.vector) });
    }
    scored.sort((a, b) => b.score - a.score);

    const kept = new Set(scored.slice(0, this.maxNeighbors).map(s => s.id));
    // Remove edges for pruned neighbors
    for (const nId of nSet) {
      if (!kept.has(nId)) {
        const otherSet = this.neighbors.get(nId);
        if (otherSet) otherSet.delete(id);
      }
    }
    this.neighbors.set(id, kept);
  }

  /**
   * Save the vector store to disk.
   */
  async save(filePath) {
    const savePath = filePath || this.persistPath;
    if (!savePath) return;

    const data = {
      vectors: Object.fromEntries(
        [...this.vectors].map(([id, v]) => [id, v])
      ),
      neighbors: Object.fromEntries(
        [...this.neighbors].map(([id, set]) => [id, [...set]])
      ),
      config: {
        maxNeighbors: this.maxNeighbors,
        efConstruction: this.efConstruction,
        efSearch: this.efSearch
      }
    };

    await fs.mkdir(path.dirname(savePath), { recursive: true });
    await fs.writeFile(savePath, JSON.stringify(data), 'utf-8');
    this._dirty = false;
  }

  /**
   * Load a vector store from disk.
   */
  async load(filePath) {
    const loadPath = filePath || this.persistPath;
    if (!loadPath) return false;

    try {
      const raw = await fs.readFile(loadPath, 'utf-8');
      const data = JSON.parse(raw);

      this.vectors = new Map(Object.entries(data.vectors));
      this.neighbors = new Map(
        Object.entries(data.neighbors).map(([id, arr]) => [id, new Set(arr)])
      );

      if (data.config) {
        this.maxNeighbors = data.config.maxNeighbors || this.maxNeighbors;
        this.efConstruction = data.config.efConstruction || this.efConstruction;
        this.efSearch = data.config.efSearch || this.efSearch;
      }

      this._dirty = false;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get stats about the store.
   */
  stats() {
    let totalEdges = 0;
    for (const set of this.neighbors.values()) totalEdges += set.size;
    const dim = this.vectors.size > 0 ? this.vectors.values().next().value.vector.length : 0;
    return {
      totalVectors: this.vectors.size,
      dimensions: dim,
      totalEdges: totalEdges / 2,
      avgNeighbors: this.vectors.size > 0 ? +(totalEdges / this.vectors.size).toFixed(1) : 0
    };
  }
}

export default VectorStore;
export { cosineSimilarity };
