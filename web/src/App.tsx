import {
  ArrowRight,
  BriefcaseBusiness,
  Check,
  CircleDot,
  Fuel,
  HeartPulse,
  Hotel,
  Leaf,
  Loader2,
  Scissors,
  ShoppingBag,
  ShoppingCart,
  Store,
  Upload,
  Utensils,
  Wine,
  Wrench,
  X,
} from "lucide-react";
import { type ChangeEvent, type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { ResultsScreen } from "./ResultsScreen";
import type { BusinessTypeId, JobResponse, JobStatus } from "./reportAdapter";

type BusinessOption = {
  id: string;
  label: string;
  description: string;
  apiBusinessType: BusinessTypeId;
  benchmarkLabel: string;
  icon: typeof Utensils;
};

const businessOptions: BusinessOption[] = [
  {
    id: "restaurant",
    label: "Restaurant / F&B",
    description: "Dining, cafes, bars, quick service",
    apiBusinessType: "restaurant_food_beverage",
    benchmarkLabel: "Restaurant",
    icon: Utensils,
  },
  {
    id: "retail",
    label: "Retail",
    description: "Shops, apparel, specialty stores",
    apiBusinessType: "retail",
    benchmarkLabel: "Retail",
    icon: ShoppingBag,
  },
  {
    id: "salon",
    label: "Salon / Personal",
    description: "Beauty, wellness, appointment services",
    apiBusinessType: "professional_services",
    benchmarkLabel: "Professional services",
    icon: Scissors,
  },
  {
    id: "professional",
    label: "Prof. Services",
    description: "Consulting, legal, accounting",
    apiBusinessType: "professional_services",
    benchmarkLabel: "Professional services",
    icon: BriefcaseBusiness,
  },
  {
    id: "hospitality",
    label: "Hospitality",
    description: "Hotels, lodging, travel stays",
    apiBusinessType: "hospitality",
    benchmarkLabel: "Hospitality",
    icon: Hotel,
  },
  {
    id: "healthcare",
    label: "Healthcare",
    description: "Clinics, dental, medical services",
    apiBusinessType: "healthcare",
    benchmarkLabel: "Healthcare",
    icon: HeartPulse,
  },
  {
    id: "ecommerce",
    label: "E-commerce",
    description: "Online stores and card-not-present",
    apiBusinessType: "ecommerce",
    benchmarkLabel: "E-commerce",
    icon: ShoppingCart,
  },
  {
    id: "gas",
    label: "Gas Station",
    description: "Fuel and convenience retail",
    apiBusinessType: "retail",
    benchmarkLabel: "Retail",
    icon: Fuel,
  },
  {
    id: "auto",
    label: "Auto Repair",
    description: "Repairs, parts, local service",
    apiBusinessType: "professional_services",
    benchmarkLabel: "Professional services",
    icon: Wrench,
  },
  {
    id: "smoke",
    label: "Smoke / Vape / CBD",
    description: "High-risk or regulated retail",
    apiBusinessType: "high_risk",
    benchmarkLabel: "High-risk retail",
    icon: Leaf,
  },
  {
    id: "grocery",
    label: "Grocery",
    description: "Markets, delis, food retail",
    apiBusinessType: "retail",
    benchmarkLabel: "Retail",
    icon: Store,
  },
  {
    id: "liquor",
    label: "Liquor Store",
    description: "Wine, spirits, packaged beverages",
    apiBusinessType: "retail",
    benchmarkLabel: "Retail",
    icon: Wine,
  },
];

const statusCopy: Record<JobStatus, string> = {
  idle: "Ready",
  uploading: "Uploading your statement",
  queued: "Waiting to start",
  verifying_statement: "Reading your PDF",
  identifying_processor: "Identifying your processor",
  extracting_fee_line_items: "Finding fee line items",
  calculating_effective_rate: "Calculating fees as a percentage of sales",
  comparing_to_benchmark: "Comparing against benchmarks",
  completed: "Analysis complete",
  failed: "Analysis failed",
};

export function App() {
  const analysisRef = useRef<HTMLElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [job, setJob] = useState<JobResponse | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus>("idle");
  const [jobProgress, setJobProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const selectedBusiness = useMemo(
    () => businessOptions.find((option) => option.id === selectedBusinessId) ?? null,
    [selectedBusinessId],
  );

  const hasStarted = jobStatus !== "idle";
  const canAnalyze = Boolean(file && selectedBusiness && !hasStarted);
  const showResults = jobStatus === "completed" && Boolean(job?.summary && job.customerReport);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
    };
  }, []);

  function scrollToAnalyzer() {
    analysisRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function selectBusiness(option: BusinessOption) {
    setSelectedBusinessId(option.id);
    setError(null);
    window.setTimeout(() => {
      document.getElementById("upload-panel")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  }

  function resetAnalysis() {
    if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
    pollTimerRef.current = null;
    setFile(null);
    setJob(null);
    setJobStatus("idle");
    setJobProgress(0);
    setError(null);
    setIsDragging(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFile(candidate: File | undefined) {
    if (!candidate) return;
    if (candidate.type !== "application/pdf" && !candidate.name.toLowerCase().endsWith(".pdf")) {
      setError("Upload a PDF file.");
      setFile(null);
      return;
    }
    setError(null);
    setFile(candidate);
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    handleFile(event.target.files?.[0]);
  }

  function onDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setIsDragging(false);
    handleFile(event.dataTransfer.files?.[0]);
  }

  async function startAnalysis() {
    if (!file || !selectedBusiness || !canAnalyze) return;

    setError(null);
    setJob(null);
    setJobProgress(8);
    setJobStatus("uploading");

    const form = new FormData();
    form.append("businessType", selectedBusiness.apiBusinessType);
    form.append("file", file);

    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json()) as { jobId?: string; error?: string };

      if (!response.ok || !payload.jobId) {
        throw new Error(payload.error ?? "We couldn't start the analysis. Try again.");
      }

      setJobStatus("queued");
      setJobProgress(14);
      pollJob(payload.jobId);
    } catch (caught) {
      setJobStatus("failed");
      setJobProgress(100);
      setError(caught instanceof Error ? caught.message : "We couldn't start the analysis. Try again.");
    }
  }

  async function pollJob(jobId: string) {
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`);
      const payload = (await response.json()) as JobResponse | { error?: string };

      if (!response.ok || !("status" in payload)) {
        throw new Error("error" in payload && payload.error ? payload.error : "We couldn't check analysis progress.");
      }

      setJob(payload);
      setJobStatus(payload.status);
      setJobProgress(Math.max(payload.progress, payload.status === "completed" ? 100 : 14));

      if (payload.status === "failed") {
        setError(payload.error ?? "We couldn't read this statement. Make sure it's a full processor statement, not a summary or receipt, and try again.");
        return;
      }

      if (payload.status !== "completed") {
        pollTimerRef.current = window.setTimeout(() => pollJob(jobId), 1200);
      }
    } catch (caught) {
      setJobStatus("failed");
      setJobProgress(100);
      setError(caught instanceof Error ? caught.message : "We couldn't check analysis progress.");
    }
  }

  return (
    <main className="page-shell">
      <nav className="topbar" aria-label="Primary">
        <a className="brand" href="/" aria-label="RateReveal home">
          <span className="brand-mark">R</span>
          <span>RateReveal</span>
        </a>
        {showResults ? (
          <button className="signin-link nav-button" type="button" onClick={resetAnalysis}>
            Start over
          </button>
        ) : (
          <a className="signin-link" href="/signin">
            Sign in
          </a>
        )}
      </nav>

      {showResults && job ? (
        <ResultsScreen job={job} selectedBusinessLabel={selectedBusiness?.benchmarkLabel ?? null} onStartOver={resetAnalysis} />
      ) : (
        <>
          <section className="hero-section" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">Merchant statement analysis</p>
          <h1 id="hero-title">
            See whether your processing costs are above market.
          </h1>
          <p className="hero-subtext">
            Upload your merchant statement and see the percentage of sales you paid in fees, which fees are worth
            challenging, and what to ask your processor.
          </p>
          <div className="hero-actions">
            <button className="primary-button large" type="button" onClick={scrollToAnalyzer}>
              Check my fees <ArrowRight size={20} aria-hidden="true" />
            </button>
            <span>No account needed</span>
          </div>
          <ul className="trust-list" aria-label="Trust signals">
            <li>First statement free</li>
            <li>Secure encrypted upload</li>
            <li>Plain English, no jargon</li>
          </ul>
        </div>

        <aside className="finding-card" aria-label="Sample anonymized finding">
          <p className="card-kicker">Real finding · anonymized</p>
          <h2>$2,460 a year in fees worth challenging</h2>
          <p>
            Madison Coffee Roasters paid 44 bps above benchmark on Amex, plus a $19.95 monthly fee for a service the
            account did not use.
          </p>
          <div className="metric-row">
            <div>
              <span>Fees as percentage of sales</span>
              <strong>2.94%</strong>
              <small>+44 bps over benchmark</small>
            </div>
            <div>
              <span>Items flagged</span>
              <strong>4</strong>
              <small>of 11 line items</small>
            </div>
          </div>
        </aside>
          </section>

          <section className="analysis-section" ref={analysisRef} aria-labelledby="business-title">
        <div className="section-heading">
          <p className="eyebrow teal">Start here</p>
          <h2 id="business-title">What kind of business do you run?</h2>
          <p>This helps RateReveal compare your fees against the right benchmark for your industry.</p>
        </div>

        <div className="business-grid" role="list">
          {businessOptions.map((option) => {
            const Icon = option.icon;
            const isSelected = selectedBusinessId === option.id;
            return (
              <button
                className={`business-card${isSelected ? " selected" : ""}`}
                key={option.id}
                type="button"
                onClick={() => selectBusiness(option)}
                aria-pressed={isSelected}
              >
                <Icon size={24} strokeWidth={1.8} aria-hidden="true" />
                <span>{option.label}</span>
                <small>{option.description}</small>
              </button>
            );
          })}
        </div>

        <div className={`upload-panel${selectedBusiness ? " visible" : ""}`} id="upload-panel">
          <div className="upload-copy">
            <p className="panel-label">Statement upload</p>
            <h3>Upload last month&apos;s PDF</h3>
            <p>
              {selectedBusiness
                ? `We will compare it against ${selectedBusiness.benchmarkLabel.toLowerCase()} benchmarks.`
                : "Choose a business type first so the benchmark is accurate."}
            </p>
          </div>

          {!hasStarted ? (
            <>
              <button
                className={`dropzone${isDragging ? " dragging" : ""}${file ? " has-file" : ""}`}
                type="button"
                disabled={!selectedBusiness}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
              >
                <input
                  ref={fileInputRef}
                  className="file-input"
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={onInputChange}
                />
                <span className="drop-icon">
                  <Upload size={28} aria-hidden="true" />
                </span>
                <span className="drop-title">{file ? file.name : "Drop your statement"}</span>
                <span className="drop-subtitle">{file ? formatFileSize(file.size) : "PDF · or click to browse"}</span>
              </button>

              {error ? <p className="inline-error">{error}</p> : null}

              <div className="upload-actions">
                <button className="secondary-button" type="button" disabled={!file} onClick={resetAnalysis}>
                  Remove
                </button>
                <button className="primary-button" type="button" disabled={!canAnalyze} onClick={startAnalysis}>
                  Analyze <ArrowRight size={18} aria-hidden="true" />
                </button>
              </div>
            </>
          ) : (
            <ProcessingPanel
              businessLabel={selectedBusiness?.benchmarkLabel ?? "your business"}
              error={error}
              fileName={file?.name ?? job?.fileName ?? "Uploaded statement"}
              progress={jobProgress}
              status={jobStatus}
              onReset={resetAnalysis}
            />
          )}

          <ul className="upload-trust" aria-label="Upload trust signals">
            <li>No card required</li>
            <li>Secure encrypted upload</li>
          </ul>
        </div>
          </section>
        </>
      )}
    </main>
  );
}

function ProcessingPanel(props: {
  businessLabel: string;
  error: string | null;
  fileName: string;
  progress: number;
  status: JobStatus;
  onReset: () => void;
}) {
  const steps = [
    { label: "Uploading statement", minProgress: 8, activeStatuses: ["uploading", "queued"] },
    { label: "Reading your PDF", minProgress: 10, activeStatuses: ["verifying_statement", "identifying_processor"] },
    {
      label: "Calculating fees as a percentage of sales",
      minProgress: 72,
      activeStatuses: ["extracting_fee_line_items", "calculating_effective_rate"],
    },
    {
      label: `Comparing against ${props.businessLabel} benchmarks`,
      minProgress: 90,
      activeStatuses: ["comparing_to_benchmark"],
    },
    { label: "Finding avoidable fees", minProgress: 94, activeStatuses: ["comparing_to_benchmark"] },
    { label: "Preparing your report", minProgress: 100, activeStatuses: ["completed"] },
  ];

  const failed = props.status === "failed";
  const completed = props.status === "completed";

  return (
    <div className={`processing-card${failed ? " failed" : ""}${completed ? " complete" : ""}`}>
      <div className="processing-topline">
        <span>{props.fileName}</span>
        <strong>{failed ? "Needs another file" : completed ? "Ready" : statusCopy[props.status]}</strong>
      </div>

      <div className="progress-track" aria-label={`Analysis progress ${props.progress}%`}>
        <span style={{ width: `${Math.min(100, Math.max(0, props.progress))}%` }} />
      </div>

      {failed ? (
        <div className="failure-box">
          <X size={22} aria-hidden="true" />
          <p>
            {props.error ??
              "We couldn't read this statement. Make sure it's a full processor statement, not a summary or receipt, and try again."}
          </p>
        </div>
      ) : (
        <ol className="progress-steps">
          {steps.map((step) => {
            const done = completed || props.progress >= step.minProgress;
            const active =
              !done && step.activeStatuses.includes(props.status) && props.status !== "queued" && props.status !== "uploading";
            return (
              <li className={done ? "done" : active ? "active" : ""} key={step.label}>
                {done ? (
                  <Check size={18} aria-hidden="true" />
                ) : active ? (
                  <Loader2 className="spin" size={18} aria-hidden="true" />
                ) : (
                  <CircleDot size={18} aria-hidden="true" />
                )}
                <span>{step.label}</span>
              </li>
            );
          })}
        </ol>
      )}

      {completed ? (
        <div className="complete-box">
          <Check size={22} aria-hidden="true" />
          <div>
            <strong>Analysis complete</strong>
            <p>Your report is ready.</p>
          </div>
        </div>
      ) : null}

      {failed ? (
        <button className="secondary-button retry" type="button" onClick={props.onReset}>
          Try another PDF
        </button>
      ) : null}
    </div>
  );
}

function formatFileSize(bytes: number) {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
