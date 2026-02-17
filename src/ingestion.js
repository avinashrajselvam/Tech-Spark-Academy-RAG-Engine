// ─────────────────────────────────────────────────────────────
// Tech Spark Academy RAG — Multi-Document Ingestion Pipeline
// Smart chunking with language detection and metadata extraction
// ─────────────────────────────────────────────────────────────

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { embed, embedBatch } from './embeddings.js';

// ── Language Detection ───────────────────────────────────────

const LANG_MAP = {
    '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
    '.ts': 'typescript', '.tsx': 'typescript',
    '.jsx': 'javascript',
    '.py': 'python',
    '.java': 'java',
    '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.c': 'c', '.h': 'c',
    '.cs': 'csharp',
    '.go': 'go',
    '.rs': 'rust',
    '.rb': 'ruby',
    '.php': 'php',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.scala': 'scala',
    '.r': 'r',
    '.sql': 'sql',
    '.sh': 'bash', '.bash': 'bash',
    '.ps1': 'powershell',
    '.md': 'markdown',
    '.txt': 'text',
    '.json': 'json',
    '.yaml': 'yaml', '.yml': 'yaml',
    '.xml': 'xml',
    '.html': 'html', '.htm': 'html',
    '.css': 'css',
};

function detectLanguage(filename) {
    const ext = path.extname(filename).toLowerCase();
    return LANG_MAP[ext] || 'text';
}

function isCodeFile(language) {
    return !['markdown', 'text', 'json', 'yaml', 'xml'].includes(language);
}

// ── Chunking Strategies ─────────────────────────────────────

/**
 * Chunk code files by function/class boundaries.
 * Falls back to line-count chunking if no boundaries found.
 */
function chunkCode(content, chunkSize = 512, overlap = 64) {
    const lines = content.split('\n');
    const chunks = [];

    // Detect function/class boundaries
    const boundaries = [];
    const boundaryPatterns = [
        /^(export\s+)?(async\s+)?function\s+/,
        /^(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?\(/,
        /^(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?function/,
        /^(export\s+)?class\s+/,
        /^(export\s+)?def\s+/,               // Python
        /^(export\s+)?class\s+.*:/,           // Python
        /^(public|private|protected|static)\s+.*\(/,  // Java/C#
        /^func\s+/,                           // Go
        /^fn\s+/,                              // Rust
        /^(pub\s+)?fn\s+/,                    // Rust
    ];

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trimStart();
        for (const pat of boundaryPatterns) {
            if (pat.test(trimmed)) {
                boundaries.push(i);
                break;
            }
        }
    }

    if (boundaries.length > 1) {
        // Chunk by boundaries
        for (let b = 0; b < boundaries.length; b++) {
            const start = boundaries[b];
            const end = b + 1 < boundaries.length ? boundaries[b + 1] : lines.length;
            const chunkLines = lines.slice(start, end);
            const text = chunkLines.join('\n').trim();
            if (text.length > 0) {
                chunks.push({
                    text,
                    startLine: start + 1,
                    endLine: end,
                });
            }
        }

        // Add any preamble (imports, etc.) as a chunk
        if (boundaries[0] > 0) {
            const preamble = lines.slice(0, boundaries[0]).join('\n').trim();
            if (preamble.length > 20) {
                chunks.unshift({
                    text: preamble,
                    startLine: 1,
                    endLine: boundaries[0],
                });
            }
        }
    } else {
        // Fallback: fixed-size line chunking
        const linesPerChunk = Math.max(10, Math.floor(chunkSize / 40));
        const overlapLines = Math.max(2, Math.floor(overlap / 40));

        for (let i = 0; i < lines.length; i += linesPerChunk - overlapLines) {
            const chunkLines = lines.slice(i, i + linesPerChunk);
            const text = chunkLines.join('\n').trim();
            if (text.length > 0) {
                chunks.push({
                    text,
                    startLine: i + 1,
                    endLine: Math.min(i + linesPerChunk, lines.length),
                });
            }
        }
    }

    return chunks;
}

/**
 * Chunk text/markdown by sentence boundaries with overlap.
 */
function chunkText(content, chunkSize = 512, overlap = 64) {
    const chunks = [];

    // Split by paragraphs first
    const paragraphs = content.split(/\n\s*\n/);
    let currentChunk = '';
    let currentStart = 0;
    let charPos = 0;

    for (const para of paragraphs) {
        if ((currentChunk.length + para.length) > chunkSize && currentChunk.length > 0) {
            chunks.push({
                text: currentChunk.trim(),
                startLine: currentStart + 1,
                endLine: currentStart + currentChunk.split('\n').length,
            });

            // Overlap: keep last portion
            const words = currentChunk.split(/\s+/);
            const overlapWords = words.slice(-Math.floor(overlap / 5));
            currentChunk = overlapWords.join(' ') + '\n\n' + para;
            currentStart = charPos;
        } else {
            currentChunk += (currentChunk ? '\n\n' : '') + para;
        }
        charPos += para.length + 2;
    }

    if (currentChunk.trim().length > 0) {
        chunks.push({
            text: currentChunk.trim(),
            startLine: currentStart + 1,
            endLine: currentStart + currentChunk.split('\n').length,
        });
    }

    return chunks;
}

// ── Ingestion Pipeline ──────────────────────────────────────

/**
 * Ingest a document: detect language, chunk, embed, return items.
 * @param {string} filename - original filename
 * @param {string} content - file content
 * @param {object} opts - { chunkSize, chunkOverlap }
 * @returns {{ docId, chunks: Array<{id, vector, metadata}>, stats }}
 */
async function ingestDocument(filename, content, opts = {}) {
    const chunkSize = opts.chunkSize || 512;
    const chunkOverlap = opts.chunkOverlap || 64;
    const start = performance.now();

    const language = detectLanguage(filename);
    const docId = crypto.createHash('md5').update(filename + content.slice(0, 200)).digest('hex').slice(0, 12);

    // Chunk based on file type
    const rawChunks = isCodeFile(language)
        ? chunkCode(content, chunkSize, chunkOverlap)
        : chunkText(content, chunkSize, chunkOverlap);

    // Embed all chunks
    const texts = rawChunks.map(c => c.text);
    const vectors = await embedBatch(texts);

    const chunks = rawChunks.map((chunk, i) => ({
        id: `${docId}_chunk_${i}`,
        vector: vectors[i],
        metadata: {
            docId,
            filename,
            language,
            chunkIndex: i,
            totalChunks: rawChunks.length,
            startLine: chunk.startLine,
            endLine: chunk.endLine,
            text: chunk.text,
            charCount: chunk.text.length,
        },
    }));

    const elapsed = performance.now() - start;

    return {
        docId,
        chunks,
        stats: {
            filename,
            language,
            totalChunks: chunks.length,
            totalChars: content.length,
            embeddingTimeMs: +elapsed.toFixed(1),
        },
    };
}

/**
 * Ingest a file from disk.
 */
async function ingestFile(filePath, opts = {}) {
    const content = await fs.readFile(filePath, 'utf-8');
    const filename = path.basename(filePath);
    return ingestDocument(filename, content, opts);
}

export {
    ingestDocument,
    ingestFile,
    detectLanguage,
    isCodeFile,
    chunkCode,
    chunkText,
    LANG_MAP,
};
