import fs from "node:fs/promises";
import { parse } from "csv-parse/sync";
function isLikelyHeaderCell(value) {
    const v = value.toLowerCase();
    return (v.includes("month") ||
        v.includes("year") ||
        v.includes("fee") ||
        v.includes("volume") ||
        v.includes("amount") ||
        v.includes("deposit") ||
        v.includes("transaction"));
}
function detectCsvLayout(raw) {
    const delimiters = [",", ";", "\t", "|"];
    let best = { delimiter: ",", headerRowIndex: 0, score: -1 };
    for (const delimiter of delimiters) {
        let matrix = [];
        try {
            matrix = parse(raw, {
                columns: false,
                skip_empty_lines: false,
                trim: true,
                relax_column_count: true,
                bom: true,
                delimiter,
            });
        }
        catch {
            continue;
        }
        for (let i = 0; i < Math.min(matrix.length, 50); i += 1) {
            const row = matrix[i] ?? [];
            const nonEmpty = row.filter((cell) => String(cell).trim().length > 0);
            const headerLike = nonEmpty.filter((cell) => isLikelyHeaderCell(String(cell))).length;
            const score = nonEmpty.length * 2 + headerLike * 6;
            // Allow narrow statements (2-3 columns) while still preferring header-like rows.
            if (score > best.score && nonEmpty.length >= 2 && (headerLike > 0 || i === 0)) {
                best = { delimiter, headerRowIndex: i, score };
            }
        }
    }
    return { delimiter: best.delimiter, headerRowIndex: best.headerRowIndex };
}
function safeNum(input) {
    if (typeof input === "number") {
        return Number.isFinite(input) ? input : null;
    }
    if (typeof input !== "string") {
        return null;
    }
    const normalized = input.replace(/^\((.*)\)$/, "-$1");
    const cleaned = normalized.replace(/[$,%\s,]/g, "").trim();
    if (!cleaned) {
        return null;
    }
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
}
function isRateLikeField(key, rawValue) {
    const k = key.toLowerCase();
    if (k.includes("rate") || k.includes("pct") || k.includes("percent") || k.includes("bps") || k.includes("basis")) {
        return true;
    }
    return rawValue.includes("%");
}
export async function parseCsv(filePath) {
    const raw = await fs.readFile(filePath, "utf8");
    const { delimiter, headerRowIndex } = detectCsvLayout(raw);
    const sliced = raw.split(/\r?\n/).slice(headerRowIndex).join("\n");
    const records = parse(sliced, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
        bom: true,
        delimiter,
    });
    const headers = Object.keys(records[0] ?? {}).filter((h) => h.trim().length > 0);
    const rows = records.slice(0, 5000).map((row) => {
        const normalized = {};
        for (const [key, value] of Object.entries(row)) {
            if (!key.trim())
                continue;
            if (typeof value === "string" && isRateLikeField(key, value)) {
                // Preserve rate semantics as text so analyzers do not confuse percentages with amount fields.
                normalized[key] = value.trim();
                continue;
            }
            const n = safeNum(value);
            normalized[key] = n ?? value;
        }
        return normalized;
    });
    return {
        sourceType: "csv",
        headers,
        rows,
        textPreview: JSON.stringify(rows.slice(0, 3)).slice(0, 1200),
        extraction: {
            mode: "structured",
            qualityScore: rows.length > 0 ? 1 : 0.6,
            reasons: rows.length > 0 ? [] : ["CSV parsed but no data rows were found after header detection."],
            lineCount: rows.length,
            amountTokenCount: JSON.stringify(rows).match(/\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g)?.length ?? 0,
            hasExtractableText: rows.length > 0,
        },
    };
}
export async function parsePdf(filePath) {
    const { default: pdfParse } = await import("pdf-parse");
    const buffer = await fs.readFile(filePath);
    const data = await pdfParse(buffer);
    const lines = data.text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 1200);
    const rows = lines.map((line) => ({
        content: line,
    }));
    const hasExtractableText = lines.length > 0;
    const text = lines.join(" ");
    const amountTokenCount = text.match(/\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g)?.length ?? 0;
    const feeSignals = (text.match(/fee|charge|discount|assessment|markup|interchange|statement/gi) ?? []).length;
    const mode = hasExtractableText ? "text_only" : "unusable";
    const reasons = [];
    if (!hasExtractableText) {
        reasons.push("No extractable text was found in this PDF (likely image-only/scanned).");
    }
    else {
        reasons.push("PDF was parsed as text lines only; structured table extraction is not available yet.");
        if (amountTokenCount < 10) {
            reasons.push("Very few numeric amount tokens were found in extracted text.");
        }
        if (feeSignals < 2) {
            reasons.push("Very few fee-related terms were found in extracted text.");
        }
    }
    const qualityScore = !hasExtractableText
        ? 0
        : Math.min(0.45, 0.15 + Math.min(0.2, amountTokenCount / 200) + Math.min(0.1, feeSignals / 40));
    return {
        sourceType: "pdf",
        headers: ["content"],
        rows,
        textPreview: text.slice(0, 1500),
        extraction: {
            mode,
            qualityScore,
            reasons,
            lineCount: lines.length,
            amountTokenCount,
            hasExtractableText,
        },
    };
}
