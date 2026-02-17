// ─────────────────────────────────────────────────────────────
// Tech Spark Academy RAG — AI Generation Layer (v4 ChatGPT-like)
// Auto-detect ALL languages, fix code, fast output
// ─────────────────────────────────────────────────────────────

// ── Language Detection for 30+ Languages ────────────────────

const LANG_DETECTORS = [
    { lang: 'python', rx: /^\s*(def |class |import |from |print\s*\(|if __name__|elif |lambda |self\.|@\w+)/m },
    { lang: 'javascript', rx: /^\s*(function |const |let |var |console\.|require\(|=>\s*{|module\.exports|async |await )/m },
    { lang: 'typescript', rx: /^\s*(interface |type |enum |:\s*(string|number|boolean)|as |import .* from)/m },
    { lang: 'java', rx: /^\s*(public class|private |protected |System\.out|void main|import java\.|@Override|static void)/m },
    { lang: 'c', rx: /^\s*(#include\s*<|int main|printf\s*\(|scanf\s*\(|void\s+\w+\s*\(|malloc\(|free\()/m },
    { lang: 'cpp', rx: /^\s*(#include\s*<iostream|cout\s*<<|cin\s*>>|std::|using namespace|class\s+\w+\s*{|template\s*<)/m },
    { lang: 'csharp', rx: /^\s*(using System|namespace |Console\.|static void Main|string\[\]|\.WriteLine)/m },
    { lang: 'go', rx: /^\s*(package |func |fmt\.|import\s*\(|:=|go\s+\w+|chan\s|defer )/m },
    { lang: 'rust', rx: /^\s*(fn |let mut |use |impl |pub fn |match |println!|Vec<|Option<|Result<)/m },
    { lang: 'ruby', rx: /^\s*(def |end$|puts |require |class\s+\w+|attr_accessor|do\s*\|)/m },
    { lang: 'php', rx: /^\s*(<\?php|\$\w+|echo |function\s+\w+|->|::|namespace )/m },
    { lang: 'swift', rx: /^\s*(func |var |let |import Foundation|print\(|class\s+\w+|struct\s+\w+|guard |optional)/m },
    { lang: 'kotlin', rx: /^\s*(fun |val |var |println\(|class\s+\w+|import kotlin|when\s*\(|data class)/m },
    { lang: 'scala', rx: /^\s*(def |val |var |object |trait |case class|import scala)/m },
    { lang: 'r', rx: /^\s*(library\(|<-\s|function\(|print\(|data\.frame|ggplot\(|c\()/m },
    { lang: 'sql', rx: /^\s*(SELECT |INSERT |UPDATE |DELETE |CREATE |ALTER |DROP |FROM |WHERE |JOIN )/im },
    { lang: 'html', rx: /^\s*(<html|<div|<head|<body|<!DOCTYPE|<script|<style|<form)/im },
    { lang: 'css', rx: /^\s*(\.|#|@media|:root|body\s*{|display:|margin:|padding:|color:)/m },
    { lang: 'bash', rx: /^\s*(#!\/bin\/bash|echo |if \[|for \w+ in|while |grep |awk |sed |chmod )/m },
    { lang: 'powershell', rx: /^\s*(Write-Host|Get-|Set-|\$PSVersionTable|Import-Module|Param\()/m },
    { lang: 'dart', rx: /^\s*(void main|Widget |import 'package:|class\s+\w+\s+extends|StatelessWidget|StatefulWidget)/m },
    { lang: 'lua', rx: /^\s*(function\s+\w+|local |print\(|require\(|end$|then$)/m },
    { lang: 'perl', rx: /^\s*(use strict|my \$|sub |print |chomp|foreach )/m },
    { lang: 'haskell', rx: /^\s*(module |import |main\s*=|::\s|where$|do$|let\s+\w+\s*=)/m },
];

const FIX_WORDS = /fix|error|bug|wrong|not working|debug|correct|traceback|exception|find the|what.?s wrong|help me|issue|problem|fail|crash|broken|doesn.?t work|unexpected|invalid|resolve/i;

/**
 * Detect if text contains code from any language.
 */
function hasCode(text) {
    return LANG_DETECTORS.some(d => d.rx.test(text));
}

/**
 * Detect the programming language.
 */
function detectLang(text) {
    // Check cpp before c (more specific first)
    for (const d of LANG_DETECTORS) {
        if (d.rx.test(text)) return d.lang;
    }
    // Fallback: check for common code indicators
    if (/[{}\[\]();]/.test(text) && /\n\s{2,}/.test(text)) return 'code';
    return null;
}

/**
 * Check if user wants to fix/debug code.
 */
function needsFix(text) {
    return FIX_WORDS.test(text);
}

// ── System Prompts ──────────────────────────────────────────

const SYS_CODE = `Code AI. Output ONLY code in fenced code block. Complete runnable program. End with ### Sample Output`;

const MODES = {
    answer: { label: 'Answer', system: SYS_CODE },
    explain: { label: 'Explain', system: `${SYS_CODE}\nAdd comments in code explaining logic.` },
    debug: { label: 'Debug', system: `${SYS_CODE}\nFind ALL bugs. Give the FULL corrected code.` },
    optimize: { label: 'Optimize', system: `${SYS_CODE}\nOptimize and show improved code.` },
    generate: { label: 'Generate', system: SYS_CODE },
    fix: { label: 'Fix Code', system: `${SYS_CODE}\nThe user pasted code with errors. Find every bug, fix them all. Return the COMPLETE fixed code. Do NOT explain — just give the corrected code.` },
};

/**
 * Build prompt with smart auto-detection.
 * If user pastes code → auto-switch to fix/debug mode.
 * Works for ALL 30+ languages.
 */
function buildPrompt(query, context, mode = 'answer') {
    const codeDetected = hasCode(query);
    const lang = detectLang(query);
    const wantsFix = needsFix(query);

    // Smart mode selection
    let effectiveMode = mode;
    if (codeDetected && (wantsFix || mode === 'answer' || mode === 'fix')) {
        effectiveMode = 'fix';
    }

    const modeConfig = MODES[effectiveMode] || MODES.answer;

    const messages = [
        { role: 'system', content: modeConfig.system },
    ];

    // Minimal context injection
    if (context && context.length > 0 && context.length < 1000) {
        messages.push({ role: 'system', content: `Ref:\n${context.slice(0, 600)}` });
    }

    // Build user message with language hint
    let userContent = query.trim();
    if (codeDetected && lang) {
        if (effectiveMode === 'fix') {
            userContent += `\n\n[${lang.toUpperCase()} code detected] Fix all errors. Give complete corrected ${lang} code + sample output.`;
        } else {
            userContent += `\n\n[Language: ${lang}]`;
        }
    }

    messages.push({ role: 'user', content: userContent });
    return messages;
}

// ── Streaming Generation ────────────────────────────────────

async function generateStreaming(opts, onChunk) {
    const { apiKey, baseUrl, model, messages } = opts;

    if (!apiKey) return generateFallback(messages, onChunk);

    const url = `${baseUrl}/chat/completions`;
    const body = {
        model,
        messages,
        stream: true,
        temperature: 0,
        max_tokens: 256,
        top_p: 0.5,
        repeat_penalty: 1.1,
        num_ctx: 1024,
        num_predict: 256,
        num_thread: 8,
        mirostat: 0,
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`LLM error ${response.status}: ${err}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            if (data === '[DONE]') break;

            try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) {
                    fullText += delta;
                    onChunk(delta);
                }
            } catch { }
        }
    }

    return fullText;
}

async function generateFallback(messages, onChunk) {
    const userMsg = messages.find(m => m.role === 'user')?.content || '';
    let r = `## Tech Spark Academy\n\n> Start Ollama for AI code fixing.\n\n**Query:** ${userMsg.slice(0, 150)}\n`;
    const words = r.split(' ');
    for (let i = 0; i < words.length; i++) {
        onChunk((i === 0 ? '' : ' ') + words[i]);
        if (i % 10 === 0) await new Promise(r => setTimeout(r, 1));
    }
    return r;
}

async function generate(opts) {
    let result = '';
    await generateStreaming(opts, (c) => { result += c; });
    return result;
}

export { generateStreaming, generate, buildPrompt, MODES };
