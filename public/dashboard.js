export function escapeHtml(input) {
  return String(input ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatMoney(value) {
  const number = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number);
}

export function formatPct(value) {
  return `${Number(value ?? 0).toFixed(2)}%`;
}

export function formatPeriodLabel(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  if (raw.toLowerCase().includes("not reliably extractable")) {
    return "Statement period still being confirmed";
  }

  const formatSinglePeriod = (input) => {
    const isoMonth = input.match(/^(\d{4})[-/](\d{2})$/);
    if (isoMonth) {
      const year = Number(isoMonth[1]);
      const month = Number(isoMonth[2]);
      if (Number.isFinite(year) && Number.isFinite(month) && month >= 1 && month <= 12) {
        return new Date(year, month - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
      }
    }

    const isoDate = input.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
    if (isoDate) {
      const year = Number(isoDate[1]);
      const month = Number(isoDate[2]);
      if (Number.isFinite(year) && Number.isFinite(month) && month >= 1 && month <= 12) {
        return new Date(year, month - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
      }
    }

    return input;
  };

  const range = raw.match(/^(\d{4}-\d{2})\s+to\s+(\d{4}-\d{2})$/i);
  if (range) {
    return `${formatSinglePeriod(range[1])} to ${formatSinglePeriod(range[2])}`;
  }

  return formatSinglePeriod(raw);
}

export function formatDeltaMoney(value) {
  const amount = Number(value ?? 0);
  const arrow = amount >= 0 ? "↑" : "↓";
  return `${arrow} ${formatMoney(Math.abs(amount))}`;
}

export function formatDeltaPct(value) {
  const amount = Number(value ?? 0);
  const arrow = amount >= 0 ? "↑" : "↓";
  return `${arrow} ${Math.abs(amount).toFixed(2)}%`;
}

export function verdictLabel(status) {
  if (status === "above") return "Above benchmark";
  if (status === "below") return "Below benchmark";
  return "Within benchmark";
}

export function verdictTone(status) {
  return status === "above" ? "warn" : "good";
}

export function progressMarkup(steps) {
  return steps
    .map(
      (step, index) => `
        <div class="progress-step ${escapeHtml(step.state || "")}">
          <span class="progress-step-dot">${step.state === "completed" ? "✓" : index + 1}</span>
          <span>${escapeHtml(step.label)}</span>
        </div>
      `,
    )
    .join("");
}

export function merchantBadgeMarkup(merchant) {
  return `
    <div class="merchant-badge">
      ${merchant?.devMode ? '<button type="button" class="dev-reset-link" data-dev-reset>[DEV] Reset account</button>' : ""}
      <div class="merchant-chip">
        <span class="merchant-name">${escapeHtml(merchant.firstName)}</span>
        <span class="avatar">${escapeHtml(merchant.initials)}</span>
      </div>
    </div>
  `;
}

export function attachDevResetHandler(root = document) {
  const trigger = root.querySelector?.("[data-dev-reset]");
  if (!trigger || trigger.dataset.bound === "true") return;

  trigger.dataset.bound = "true";
  trigger.addEventListener("click", async () => {
    trigger.disabled = true;
    try {
      clearPendingStatementJobId();
      await fetchJson("/dev/reset-account", { method: "POST" });
      window.location.replace("/");
    } catch (error) {
      trigger.disabled = false;
      window.alert(error instanceof Error ? error.message : "Unable to reset the account.");
    }
  });
}

export function getPendingStatementJobId() {
  try {
    return sessionStorage.getItem("feeclearPendingJobId") || "";
  } catch {
    return "";
  }
}

export function setPendingStatementJobId(jobId) {
  try {
    if (!jobId) return;
    sessionStorage.setItem("feeclearPendingJobId", jobId);
  } catch {}
}

export function clearPendingStatementJobId() {
  try {
    sessionStorage.removeItem("feeclearPendingJobId");
  } catch {}
}

export async function readJsonSafe(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
  });
  const payload = await readJsonSafe(response);

  if (response.status === 401) {
    window.location.href = "/signin";
    throw new Error("Authentication required.");
  }

  if (!response.ok) {
    throw new Error(payload?.error || `Request failed (${response.status})`);
  }

  return payload;
}

export async function postJson(url, body) {
  return fetchJson(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

export function monthRangeLabel(earlierMonth, laterMonth) {
  return `${formatPeriodLabel(earlierMonth)} – ${formatPeriodLabel(laterMonth)}`;
}

export function chartBarHeight(value, maxValue) {
  const max = Math.max(Number(maxValue || 0), 0.5);
  const pct = Math.max(10, Math.min(100, (Number(value || 0) / max) * 100));
  return `${pct}%`;
}

export function benchmarkReferenceOffset(ceiling, maxValue) {
  const max = Math.max(Number(maxValue || 0), 0.5);
  const ratio = Math.max(0, Math.min(1, Number(ceiling || 0) / max));
  return `${100 - ratio * 100}%`;
}
