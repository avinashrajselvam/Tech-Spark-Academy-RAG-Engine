# Antigravity RAG System — Architecture Guide

## Overview

The Antigravity RAG System is a high-performance Retrieval-Augmented Generation engine
designed for real-time, multi-language code intelligence with near-zero latency.

## Core Components

### Vector Store (HNSW)
The vector store uses a Hierarchical Navigable Small World (HNSW) graph structure
for approximate nearest neighbor search. This provides O(log n) search complexity
with high recall rates.

Key features:
- In-memory storage for maximum speed
- Cosine similarity scoring
- Bidirectional graph edges with automatic pruning
- Disk persistence via JSON serialization

### Embedding Pipeline
Uses the all-MiniLM-L6-v2 transformer model running locally via ONNX runtime.
This produces 384-dimensional embedding vectors that capture semantic meaning.

The pipeline supports:
- Single text embedding
- Batch embedding with micro-batches of 16
- Model warmup for consistent latency
- Automatic model caching

### Hybrid Retrieval
Combines two retrieval strategies using Reciprocal Rank Fusion (RRF):

1. **Vector Search**: Semantic similarity using cosine distance
2. **BM25 Search**: Keyword matching with TF-IDF scoring

The alpha parameter controls the balance (default 0.7 = 70% vector, 30% keyword).

### Document Ingestion
Multi-format ingestion with intelligent chunking:

- **Code files**: Function/class boundary-aware splitting
- **Text/Markdown**: Sentence-boundary chunking with overlap
- **30+ languages**: Automatic detection by file extension

### AI Generation
Five intelligence modes for different use cases:
- **Answer**: Direct Q&A with code examples
- **Explain**: Deep code explanation
- **Debug**: Bug detection and fixes
- **Optimize**: Performance improvement suggestions
- **Generate**: New code generation based on context

## Performance Targets
- Vector search: < 5ms for 10K vectors
- Embedding: < 50ms per chunk
- End-to-end query: < 500ms
