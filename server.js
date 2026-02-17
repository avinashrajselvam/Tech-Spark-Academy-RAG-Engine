// ─────────────────────────────────────────────────────────────
// Tech Spark Academy RAG — Server Entry Point
// Express server with static frontend serving
// ─────────────────────────────────────────────────────────────

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import VectorStore from './src/vectorStore.js';
import RetrievalEngine from './src/retrieval.js';
import { initEmbeddings } from './src/embeddings.js';
import createRoutes from './src/routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Configuration ───────────────────────────────────────────

const config = {
    port: parseInt(process.env.PORT || '3000', 10),
    embeddingModel: process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2',
    chunkSize: parseInt(process.env.CHUNK_SIZE || '512', 10),
    chunkOverlap: parseInt(process.env.CHUNK_OVERLAP || '64', 10),
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    openaiModel: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
    vectorStorePath: process.env.VECTOR_STORE_PATH || './data/vector_store.json',
};

// ── Initialize ──────────────────────────────────────────────

async function main() {
    console.log('\n');
    console.log('  ╔══════════════════════════════════════════════╗');
    console.log('  ║     🚀 TECH SPARK ACADEMY RAG SYSTEM        ║');
    console.log('  ║     High-Performance Intelligence Engine     ║');
    console.log('  ╚══════════════════════════════════════════════╝');
    console.log('\n');

    // 1. Initialize embedding model
    console.log('🔧 Initializing embedding pipeline...');
    await initEmbeddings(config.embeddingModel);

    // 2. Initialize vector store
    console.log('🔧 Initializing vector store...');
    const vectorStore = new VectorStore({
        persistPath: config.vectorStorePath,
    });

    // Try to load existing index
    const loaded = await vectorStore.load();
    if (loaded) {
        console.log(`  ↳ Loaded ${vectorStore.size} vectors from disk`);
    } else {
        console.log('  ↳ Starting with empty vector store');
    }

    // 3. Initialize retrieval engine
    const retrievalEngine = new RetrievalEngine(vectorStore);

    // If we loaded vectors, rebuild BM25 index
    if (loaded && vectorStore.size > 0) {
        console.log('🔧 Rebuilding BM25 index...');
        for (const [id, { metadata }] of vectorStore.vectors) {
            if (metadata?.text) {
                retrievalEngine.bm25.add(id, metadata.text);
            }
        }
        console.log(`  ↳ BM25 index rebuilt with ${retrievalEngine.bm25.docs.size} documents`);
    }

    // 4. Create Express app
    const app = express();
    app.use(cors());
    app.use(express.json({ limit: '10mb' }));

    // Serve static frontend
    app.use(express.static(path.join(__dirname, 'public')));

    // Mount API routes
    const routes = createRoutes({ retrievalEngine, config });
    app.use(routes);

    // Fallback to index.html for SPA routing
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    // 5. Start server
    app.listen(config.port, () => {
        console.log('\n');
        console.log(`  ✅ Server running at http://localhost:${config.port}`);
        console.log(`  📊 API docs: http://localhost:${config.port}/api/health`);
        console.log(`  🧠 Embedding model: ${config.embeddingModel}`);
        console.log(`  💾 Vector store: ${config.vectorStorePath}`);
        console.log(`  🤖 LLM backend: ${config.openaiApiKey ? config.openaiModel : 'Local fallback (no API key)'}`);
        console.log('\n');
    });
}

main().catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});
