// ─────────────────────────────────────────────────────────────
// Tech Spark Academy RAG — API Routes
// RESTful endpoints for query, upload, documents, and stats
// ─────────────────────────────────────────────────────────────

import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { ingestDocument, LANG_MAP } from './ingestion.js';
import { generateStreaming, buildPrompt, MODES } from './generator.js';

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

/**
 * Create the API router.
 * @param {object} deps - { retrievalEngine, config }
 */
function createRoutes(deps) {
    const router = Router();
    const { retrievalEngine, config } = deps;

    // Track ingested documents for listing
    const documents = new Map(); // docId → { filename, language, chunks, ingestedAt, charCount }

    // ── POST /api/query — RAG query with streaming SSE ────────
    router.post('/api/query', async (req, res) => {
        try {
            const { query, mode = 'answer', topK = 1 } = req.body;

            if (!query || typeof query !== 'string') {
                return res.status(400).json({ error: 'Missing or invalid query' });
            }

            // Set SSE headers
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no',
            });

            // 1. Retrieve relevant context
            const searchResult = await retrievalEngine.search(query, { topK });
            const context = retrievalEngine.assembleContext(searchResult.results);

            // Send retrieval metadata first
            const meta = {
                type: 'meta',
                vectorLatencyMs: searchResult.vectorLatencyMs,
                bm25LatencyMs: searchResult.bm25LatencyMs,
                totalLatencyMs: searchResult.totalLatencyMs,
                resultsCount: searchResult.results.length,
                sources: searchResult.results.map(r => ({
                    filename: r.metadata.filename,
                    language: r.metadata.language,
                    lines: `${r.metadata.startLine}-${r.metadata.endLine}`,
                    score: r.fusedScore,
                })),
            };
            res.write(`data: ${JSON.stringify(meta)}\n\n`);

            // 2. Generate AI response
            const messages = buildPrompt(query, context, mode);

            const genStart = performance.now();
            await generateStreaming(
                {
                    apiKey: config.openaiApiKey,
                    baseUrl: config.openaiBaseUrl,
                    model: config.openaiModel,
                    messages,
                },
                (chunk) => {
                    res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`);
                }
            );

            const genLatencyMs = +(performance.now() - genStart).toFixed(2);

            // Send done event
            res.write(`data: ${JSON.stringify({ type: 'done', generationLatencyMs: genLatencyMs })}\n\n`);
            res.end();
        } catch (err) {
            console.error('Query error:', err);
            // Try to send error via SSE if headers already sent
            if (res.headersSent) {
                res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
                res.end();
            } else {
                res.status(500).json({ error: err.message });
            }
        }
    });

    // ── POST /api/upload — Upload and ingest documents ────────
    router.post('/api/upload', upload.array('files', 20), async (req, res) => {
        try {
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({ error: 'No files uploaded' });
            }

            const results = [];

            for (const file of req.files) {
                const ext = path.extname(file.originalname).toLowerCase();
                if (!LANG_MAP[ext]) {
                    results.push({
                        filename: file.originalname,
                        status: 'skipped',
                        reason: `Unsupported file type: ${ext}`,
                    });
                    continue;
                }

                const content = file.buffer.toString('utf-8');
                const ingested = await ingestDocument(file.originalname, content, {
                    chunkSize: config.chunkSize,
                    chunkOverlap: config.chunkOverlap,
                });

                // Add to retrieval engine
                for (const chunk of ingested.chunks) {
                    retrievalEngine.addChunk(chunk.id, chunk.vector, chunk.metadata);
                }

                // Track document
                documents.set(ingested.docId, {
                    filename: file.originalname,
                    language: ingested.stats.language,
                    chunks: ingested.stats.totalChunks,
                    charCount: ingested.stats.totalChars,
                    ingestedAt: new Date().toISOString(),
                });

                results.push({
                    filename: file.originalname,
                    status: 'ingested',
                    docId: ingested.docId,
                    ...ingested.stats,
                });
            }

            // Persist vector store
            if (config.vectorStorePath) {
                await retrievalEngine.vectorStore.save(config.vectorStorePath);
            }

            res.json({ results, totalDocuments: documents.size });
        } catch (err) {
            console.error('Upload error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ── GET /api/documents — List ingested documents ──────────
    router.get('/api/documents', (req, res) => {
        const docs = [...documents.entries()].map(([id, doc]) => ({ id, ...doc }));
        res.json({ documents: docs, total: docs.length });
    });

    // ── DELETE /api/documents/:id — Remove a document ─────────
    router.delete('/api/documents/:id', async (req, res) => {
        const docId = req.params.id;
        if (!documents.has(docId)) {
            return res.status(404).json({ error: 'Document not found' });
        }

        const removed = retrievalEngine.removeDocument(docId);
        documents.delete(docId);

        // Persist
        if (config.vectorStorePath) {
            await retrievalEngine.vectorStore.save(config.vectorStorePath);
        }

        res.json({ removed, remainingDocuments: documents.size });
    });

    // ── GET /api/stats — System metrics ───────────────────────
    router.get('/api/stats', (req, res) => {
        const vs = retrievalEngine.vectorStore.stats();
        res.json({
            documents: documents.size,
            totalChunks: vs.totalVectors,
            dimensions: vs.dimensions,
            graphEdges: vs.totalEdges,
            avgNeighbors: vs.avgNeighbors,
            modes: Object.keys(MODES),
            supportedLanguages: Object.values(LANG_MAP).filter((v, i, a) => a.indexOf(v) === i),
        });
    });

    // ── GET /api/health — Health check ────────────────────────
    router.get('/api/health', (req, res) => {
        res.json({
            status: 'ok',
            uptime: process.uptime(),
            memory: process.memoryUsage(),
        });
    });

    // ── GET /api/modes — Available AI modes ───────────────────
    router.get('/api/modes', (req, res) => {
        res.json({
            modes: Object.entries(MODES).map(([key, val]) => ({
                key,
                label: val.label,
            })),
        });
    });

    return router;
}

export default createRoutes;
