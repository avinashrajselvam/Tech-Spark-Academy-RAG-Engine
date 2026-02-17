# 🚀 Tech Spark Academy — RAG Intelligence Engine

## 📋 Project Overview

**Tech Spark Academy RAG** is a high-performance **Retrieval-Augmented Generation (RAG)** system designed for real-time, multi-language code intelligence. It allows users to upload source code files, build a searchable knowledge base, and query an AI assistant that provides context-aware answers, code explanations, debugging help, optimization suggestions, and code generation — all through a stunning, modern web dashboard.

The system combines **vector search**, **BM25 keyword search**, and **AI-powered generation** to deliver intelligent, context-rich responses with near-zero latency.

---

## 🏗️ Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    TECH SPARK ACADEMY                      │
│                   RAG Intelligence Engine                   │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌──────────┐   ┌──────────┐   ┌──────────────────────┐   │
│  │ Frontend │──▶│ Express  │──▶│  RAG Pipeline         │   │
│  │ (HTML/   │   │ Server   │   │                       │   │
│  │  CSS/JS) │◀──│ (API)    │◀──│  Embed → Retrieve →   │   │
│  └──────────┘   └──────────┘   │  Generate (Stream)    │   │
│                                └──────────────────────┘   │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Core Modules                            │  │
│  │  ┌────────────┐ ┌────────────┐ ┌─────────────────┐  │  │
│  │  │ Embeddings │ │  Vector    │ │   Retrieval     │  │  │
│  │  │ (MiniLM)   │ │  Store     │ │   (Hybrid)      │  │  │
│  │  │            │ │  (HNSW)    │ │   Vector + BM25 │  │  │
│  │  └────────────┘ └────────────┘ └─────────────────┘  │  │
│  │  ┌────────────┐ ┌────────────┐ ┌─────────────────┐  │  │
│  │  │ Ingestion  │ │ Generator  │ │   Routes        │  │  │
│  │  │ (Chunking) │ │ (LLM/SSE) │ │   (REST API)    │  │  │
│  │  └────────────┘ └────────────┘ └─────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

---

## 📂 Project Structure

```
d:\Anti Gravity\
│
├── server.js                  # 🟢 Main entry point — Express server
├── package.json               # 📦 Dependencies & scripts
├── .env                       # ⚙️ Environment configuration
├── .env.example               # 📄 Configuration template
│
├── src/                       # 🧠 Core Backend Modules
│   ├── embeddings.js          # 🔢 Local embedding pipeline (MiniLM-L6-v2)
│   ├── vectorStore.js         # 📊 HNSW vector store (in-memory + persistence)
│   ├── retrieval.js           # 🔍 Hybrid retrieval (Vector + BM25 + RRF)
│   ├── ingestion.js           # 📥 Document ingestion & smart chunking
│   ├── generator.js           # 🤖 AI generation layer (streaming SSE)
│   └── routes.js              # 🛣️ REST API endpoints
│
├── public/                    # 🎨 Frontend Dashboard
│   ├── index.html             # 🏠 Main HTML page
│   ├── styles.css             # 🎨 Premium dark theme CSS (23KB+)
│   └── app.js                 # ⚡ Frontend JavaScript (streaming UI)
│
└── data/                      # 💾 Data & Persistence
    ├── vector_store.json      # 🗄️ Persisted vector index
    ├── models/                # 🧮 Cached embedding models
    └── samples/               # 📚 Sample files for demo
        ├── architecture.md    # System architecture documentation
        ├── avl_tree.py        # Python AVL tree implementation
        ├── event_emitter.js   # JavaScript EventEmitter utility
        └── priority_queue.ts  # TypeScript PriorityQueue + Dijkstra
```

---

## 🧠 Core Modules (Detailed)

### 1. `server.js` — Application Entry Point
- Loads environment variables from `.env`
- Initializes the embedding model, vector store, and retrieval engine
- Sets up Express with static file serving and CORS
- Auto-ingests sample files on startup
- Starts the HTTP server on configurable port (default: 3000)

### 2. `src/embeddings.js` — Local Embedding Engine
- Uses **`@xenova/transformers`** library for client-side ML
- Model: **`all-MiniLM-L6-v2`** (384-dimensional embeddings)
- Produces semantic vector representations of text
- Supports single and batch embedding operations
- Runs entirely locally — no external API calls needed

### 3. `src/vectorStore.js` — HNSW Vector Index
- Custom **Hierarchical Navigable Small World (HNSW)** graph implementation
- Supports high-speed approximate nearest neighbor search
- **Cosine similarity** scoring for semantic matching
- Persistence to disk via JSON serialization
- Add, search, and remove operations with metadata support

### 4. `src/retrieval.js` — Hybrid Retrieval Engine
- **Dual-index search**: Vector search + BM25 keyword search
- **Reciprocal Rank Fusion (RRF)** to merge results from both methods
- Configurable `alpha` weight (default: 0.7 vector, 0.3 BM25)
- Context assembly with token budgeting for LLM prompts
- Sub-millisecond search performance on typical datasets

### 5. `src/ingestion.js` — Document Processing Pipeline
- Supports **30+ programming languages** and file types
- Smart chunking strategies:
  - **Code files**: Splits on function/class boundaries
  - **Text/markdown**: Splits on sentence boundaries
- Language detection from file extensions
- Configurable chunk size (512 tokens) and overlap (64 tokens)
- Generates embeddings for each chunk and indexes them

### 6. `src/generator.js` — AI Generation Layer
- Connects to **OpenAI-compatible APIs** (Ollama, OpenAI, etc.)
- **5 Intelligence Modes**:
  - 💡 **Answer** — Direct Q&A with code examples
  - 📖 **Explain** — Step-by-step code explanations
  - 🔍 **Debug** — Bug detection and fixes
  - ⚡ **Optimize** — Performance improvements
  - 🛠️ **Generate** — Full code generation
- **Streaming SSE** for real-time token delivery
- Enforces **perfect indentation** and **Sample Output** sections
- Fallback template generator when no API key is configured
- Configured for `deepseek-coder:1.3b` via Ollama

### 7. `src/routes.js` — REST API
| Endpoint | Method | Description |
|---|---|---|
| `/api/query` | POST | RAG query with streaming SSE response |
| `/api/upload` | POST | Upload and ingest files |
| `/api/documents` | GET | List all ingested documents |
| `/api/documents/:id` | DELETE | Remove a document |
| `/api/stats` | GET | System statistics |

---

## 🎨 Frontend Dashboard

### Design Features
- **Premium dark theme** with glassmorphism effects
- **Ambient background** with floating gradient orbs
- **Vibrant accent colors**: Electric violet (#7C5CFC) + Cyan (#00E5FF)
- **Google Fonts**: Inter (UI) + JetBrains Mono (code)
- **Smooth animations**: Fade-up, float, pulse effects
- **Responsive layout**: Works on desktop and tablet screens
- **Custom scrollbars**: Themed to match the dark aesthetic

### Interactive Elements
- **Real-time streaming**: Tokens appear as they are generated
- **Mode selector**: Switch between 5 AI modes instantly
- **Drag & drop upload**: Drop files directly onto the sidebar
- **Latency chips**: Live display of search and generation times
- **Document manager**: View, refresh, and delete ingested files
- **Syntax highlighting**: Powered by Prism.js for 15+ languages
- **Markdown rendering**: Full GFM support via marked.js

---

## ⚙️ Configuration (`.env`)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `EMBEDDING_MODEL` | `Xenova/all-MiniLM-L6-v2` | Local embedding model |
| `CHUNK_SIZE` | `512` | Token size per chunk |
| `CHUNK_OVERLAP` | `64` | Overlap between chunks |
| `OPENAI_API_KEY` | `ollama` | API key (use "ollama" for local) |
| `OPENAI_BASE_URL` | `http://localhost:11434/v1` | LLM API endpoint |
| `OPENAI_MODEL` | `deepseek-coder:1.3b` | AI model name |
| `VECTOR_STORE_PATH` | `./data/vector_store.json` | Persistence file path |

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Runtime** | Node.js (ES Modules) | Server-side JavaScript |
| **Web Framework** | Express.js 4.21 | HTTP server & routing |
| **Embeddings** | @xenova/transformers 2.17 | Local ML inference |
| **LLM Backend** | Ollama + DeepSeek Coder 1.3B | AI code generation |
| **File Upload** | Multer 1.4 | Multipart form handling |
| **Frontend** | Vanilla HTML/CSS/JS | Zero-framework UI |
| **Syntax Highlighting** | Prism.js 1.29 | Code coloring |
| **Markdown** | marked.js 12.0 | Response rendering |
| **Styling** | Custom CSS (23KB) | Premium dark theme |

---

## 🚀 How to Run

### Prerequisites
1. **Node.js** v18+ installed
2. **Ollama** installed and running (`ollama serve`)
3. **DeepSeek Coder** model pulled (`ollama pull deepseek-coder:1.3b`)

### Steps
```bash
# 1. Navigate to project directory
cd "d:\Anti Gravity"

# 2. Install dependencies
npm install

# 3. Start the server
npm start

# 4. Open in browser
# Visit http://localhost:3000
```

---

## 📊 Performance Specifications

| Metric | Value |
|---|---|
| **Embedding Dimensions** | 384 |
| **Search Latency** | < 20ms |
| **Supported Languages** | 30+ |
| **Max Output Tokens** | 4096 |
| **Vector Index Type** | HNSW (Approximate NN) |
| **Retrieval Method** | Hybrid (Vector + BM25 + RRF) |
| **Streaming** | Server-Sent Events (SSE) |
| **Context Window** | 2500 tokens |
| **TopK Results** | 1 (speed-optimized) |

---

## 📚 Supported File Types

**Programming Languages:** JavaScript, TypeScript, Python, Java, C, C++, C#, Go, Rust, Ruby, PHP, Swift, Kotlin, Scala, R, SQL, Shell/Bash, PowerShell

**Markup & Data:** Markdown, HTML, CSS, JSON, YAML, XML, TXT

**Extensions:** `.js`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.jsx`, `.py`, `.java`, `.cpp`, `.cc`, `.cxx`, `.c`, `.h`, `.cs`, `.go`, `.rs`, `.rb`, `.php`, `.swift`, `.kt`, `.scala`, `.r`, `.sql`, `.sh`, `.bash`, `.ps1`, `.md`, `.txt`, `.json`, `.yaml`, `.yml`, `.xml`, `.html`, `.htm`, `.css`

---

## 🔐 Security & Privacy

- **Local-first architecture**: Embeddings are computed entirely on your machine
- **No data leaves your network** unless you configure an external LLM API
- **Ollama integration**: AI generation runs locally via Ollama
- **No authentication required** for local development use
- **CORS enabled** for flexible frontend integration

---

## 👨‍💻 Developer

**Project:** Tech Spark Academy RAG Intelligence Engine  
**Version:** 1.0.0  
**License:** MIT  
**Original Codebase:** Antigravity RAG System (rebranded)

---

> *"Intelligence at the speed of thought"* — Tech Spark Academy
