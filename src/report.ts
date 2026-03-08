import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import { AnalysisSummary } from "./types.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 44;
const MARGIN_TOP = 44;
const MARGIN_BOTTOM = 44;

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }

  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

export async function buildReportPdf(outputDir: string, jobId: string, summary: AnalysisSummary): Promise<string> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN_TOP;

  const ensureSpace = (requiredHeight: number): void => {
    if (y - requiredHeight > MARGIN_BOTTOM) return;
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN_TOP;
  };

  const drawHeader = (): void => {
    page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 108, width: PAGE_WIDTH, height: 108, color: rgb(0.07, 0.2, 0.45) });
    page.drawText("Merchant Fee Intelligence Report", {
      x: MARGIN_X,
      y: PAGE_HEIGHT - 62,
      size: 23,
      font: bold,
      color: rgb(1, 1, 1),
    });
    page.drawText(`Processor: ${summary.processorName}  |  Source: ${summary.sourceType.toUpperCase()}  |  Confidence: ${summary.confidence.toUpperCase()}`, {
      x: MARGIN_X,
      y: PAGE_HEIGHT - 84,
      size: 10,
      font,
      color: rgb(0.87, 0.93, 1),
    });
    y = PAGE_HEIGHT - 128;
  };

  const sectionTitle = (title: string): void => {
    ensureSpace(28);
    page.drawText(title, {
      x: MARGIN_X,
      y,
      size: 14,
      font: bold,
      color: rgb(0.08, 0.19, 0.38),
    });
    y -= 18;
  };

  const paragraph = (text: string, size = 10.5): void => {
    const maxWidth = PAGE_WIDTH - MARGIN_X * 2;
    const lines = wrapText(text, font, size, maxWidth);
    ensureSpace(lines.length * 14 + 4);
    for (const line of lines) {
      page.drawText(line, { x: MARGIN_X, y, size, font, color: rgb(0.12, 0.14, 0.2) });
      y -= 13;
    }
    y -= 4;
  };

  const bullet = (text: string, size = 10): void => {
    const maxWidth = PAGE_WIDTH - MARGIN_X * 2 - 12;
    const lines = wrapText(text, font, size, maxWidth);
    ensureSpace(lines.length * 13 + 2);

    page.drawText("•", { x: MARGIN_X, y, size: 11, font: bold, color: rgb(0.08, 0.19, 0.38) });
    let lineY = y;
    for (const line of lines) {
      page.drawText(line, { x: MARGIN_X + 12, y: lineY, size, font, color: rgb(0.12, 0.14, 0.2) });
      lineY -= 12;
    }
    y = lineY - 2;
  };

  const kv = (label: string, value: string): void => {
    ensureSpace(14);
    page.drawText(label, { x: MARGIN_X, y, size: 10, font: bold, color: rgb(0.18, 0.24, 0.36) });
    page.drawText(value, { x: MARGIN_X + 220, y, size: 10, font, color: rgb(0.12, 0.14, 0.2) });
    y -= 13;
  };

  drawHeader();

  sectionTitle("Executive Summary");
  paragraph(summary.executiveSummary);
  kv("Statement Period", summary.statementPeriod);
  kv("Total Volume", `$${summary.totalVolume.toFixed(2)}`);
  kv("Total Fees", `$${summary.totalFees.toFixed(2)}`);
  kv("Effective Rate", `${summary.effectiveRate.toFixed(2)}%`);
  kv("Estimated Monthly Fees", `$${summary.estimatedMonthlyFees.toFixed(2)}`);
  kv("Modeled Annual Savings", `$${summary.estimatedAnnualSavings.toFixed(2)}`);
  y -= 8;

  sectionTitle("KPI Scorecard");
  for (const metric of summary.kpis) {
    bullet(`${metric.label}: ${metric.value}. ${metric.note}`);
  }

  sectionTitle("Benchmark Positioning");
  paragraph(
    `Benchmark segment: ${summary.benchmark.segment}. Typical effective-rate range: ${summary.benchmark.lowerRate.toFixed(2)}% to ${summary.benchmark.upperRate.toFixed(2)}%. Your position: ${summary.benchmark.status.toUpperCase()}.`,
  );
  if (summary.benchmark.status === "above") {
    bullet(
      `You are ${Math.abs(summary.benchmark.deltaFromUpperRate).toFixed(2)} percentage points above the benchmark ceiling. Prioritize repricing and fee cleanup immediately.`,
    );
  }

  sectionTitle("Top Insights");
  for (const insight of summary.insights.slice(0, 14)) {
    bullet(`${insight.title}: ${insight.detail} Potential impact: $${insight.impactUsd.toFixed(2)}.`);
  }

  sectionTitle("Fee Breakdown");
  for (const row of summary.feeBreakdown.slice(0, 15)) {
    bullet(`${row.label}: $${row.amount.toFixed(2)} (${row.sharePct.toFixed(2)}% of total fees)`);
  }

  sectionTitle("Suspicious Or Negotiable Charges");
  if (summary.suspiciousFees.length === 0) {
    bullet("No obvious suspicious line-items were detected, but review monthly/ancillary fees manually before renewal.");
  } else {
    for (const row of summary.suspiciousFees) {
      bullet(`${row.label}: $${row.amount.toFixed(2)} | Severity: ${row.severity.toUpperCase()} | ${row.reason}`);
    }
  }

  sectionTitle("Savings Opportunities");
  if (summary.savingsOpportunities.length === 0) {
    bullet("No high-confidence savings model was generated. Improve CSV quality and include 3-6 months for better optimization recommendations.");
  } else {
    for (const opp of summary.savingsOpportunities) {
      bullet(
        `${opp.title}: ${opp.detail} Estimated savings: $${opp.monthlySavingsUsd.toFixed(2)}/month ($${opp.annualSavingsUsd.toFixed(2)}/year). Effort: ${opp.effort.toUpperCase()}.`,
      );
    }
  }

  sectionTitle("Negotiation Checklist");
  for (const item of summary.negotiationChecklist) {
    bullet(item);
  }

  sectionTitle("30-Day Action Plan");
  for (const item of summary.actionPlan) {
    bullet(item);
  }

  if (summary.trend.length > 0) {
    sectionTitle("Monthly Trend Snapshot");
    for (const point of summary.trend) {
      bullet(
        `${point.period}: volume $${point.volume.toFixed(2)}, fees $${point.fees.toFixed(2)}, effective rate ${point.effectiveRate.toFixed(2)}%`,
      );
    }
  }

  if (summary.dynamicFields.length > 0) {
    sectionTitle("Detected Dynamic Fields");
    for (const field of summary.dynamicFields.slice(0, 12)) {
      bullet(`${field.label}: avg ${field.value.toFixed(2)} (confidence ${(field.confidence * 100).toFixed(0)}%)`);
    }
  }

  sectionTitle("Data Quality Notes");
  for (const signal of summary.dataQuality) {
    bullet(`[${signal.level.toUpperCase()}] ${signal.message}`);
  }

  const bytes = await pdf.save();
  await fs.mkdir(outputDir, { recursive: true });
  const reportPath = path.join(outputDir, `${jobId}.pdf`);
  await fs.writeFile(reportPath, bytes);
  return reportPath;
}
