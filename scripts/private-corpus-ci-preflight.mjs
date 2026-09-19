import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SHA256 = /^[a-f0-9]{64}$/;
const CASES = ["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8"];
const FIXED_FILES = ["gold-private-manifest.json", "private-fiserv-restaurant-count-001.json", "product-source-provenance.json"];
const MAX_PACKAGE_BYTES = 512 * 1024 * 1024;
const MAX_FILE_BYTES = 128 * 1024 * 1024;
const MAX_FILES = 11;
const CORPUS_BASENAME = "ratereveal-private-corpus";
const ARCHIVE_BASENAME = "ratereveal-private-corpus.tar";

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function reject(code) {
  throw new Error(code);
}

export function validatePins(pins) {
  if (!pins || pins.schemaVersion !== "ratereveal_private_ci_pins_v1") reject("pins_invalid");
  if (!pins.package || !/^[-a-zA-Z0-9_.]+$/.test(pins.package.version ?? "")) reject("package_identity_unconfigured");
  if (!SHA256.test(pins.package.sha256 ?? "")) reject("package_digest_unconfigured");
  if (!/^approved\/[a-zA-Z0-9_./-]+\.tar$/.test(pins.package.gcpObject ?? "") ||
      (pins.package.gcpObject ?? "").includes("..")) reject("package_object_unconfigured");
  if (!/^[0-9]+$/.test(pins.package.gcpGeneration ?? "")) reject("package_generation_unconfigured");
  for (const field of ["goldManifestSha256", "canonicalManifestSha256", "productProvenanceSha256"]) {
    if (!SHA256.test(pins[field] ?? "")) reject("source_pin_missing");
  }
  if (Object.keys(pins.approvedDocuments ?? {}).sort().join(",") !== CASES.join(",")) reject("case_pins_incomplete");
  for (const hash of Object.values(pins.approvedDocuments)) if (!SHA256.test(hash)) reject("document_pin_missing");
  if (pins.canonicalGoldCaseId !== "G4" || pins.canonicalPrivateCaseId !== "private-fiserv-restaurant-count-001") {
    reject("canonical_binding_pin_invalid");
  }
  return pins;
}

function tarString(bytes) {
  const end = bytes.indexOf(0);
  return new TextDecoder("utf-8", { fatal: true }).decode(end < 0 ? bytes : bytes.subarray(0, end));
}

function tarOctal(bytes) {
  const raw = tarString(bytes).trim();
  if (!/^[0-7]+$/.test(raw)) reject("archive_header_invalid");
  return Number.parseInt(raw, 8);
}

function validArchivePath(name) {
  return name && !name.startsWith("/") && !name.startsWith(".") && !name.includes("\\") &&
    !name.split("/").some((piece) => !piece || piece === "." || piece === "..") &&
    !/[\x00-\x1f\x7f]/.test(name) && path.posix.normalize(name) === name;
}

export function readRestrictedTar(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 1536 || bytes.length > MAX_PACKAGE_BYTES || bytes.length % 512 !== 0) {
    reject("archive_size_invalid");
  }
  const entries = new Map();
  let position = 0;
  let ended = false;
  while (position < bytes.length) {
    const header = bytes.subarray(position, position + 512);
    if (header.every((value) => value === 0)) {
      if (bytes.length - position < 1024 || !bytes.subarray(position).every((value) => value === 0)) reject("archive_terminator_invalid");
      ended = true;
      break;
    }
    if (entries.size >= MAX_FILES) reject("archive_file_count_invalid");
    const expectedChecksum = tarOctal(header.subarray(148, 156));
    let checksum = 0;
    for (let i = 0; i < 512; i++) checksum += i >= 148 && i < 156 ? 32 : header[i];
    if (checksum !== expectedChecksum || tarString(header.subarray(257, 263)) !== "ustar" ||
        tarString(header.subarray(263, 265)) !== "00") reject("archive_header_invalid");
    const name = tarString(header.subarray(0, 100));
    const prefix = tarString(header.subarray(345, 500));
    const fullName = prefix ? `${prefix}/${name}` : name;
    const type = header[156];
    if (!validArchivePath(fullName) || (type !== 0 && type !== 48) || tarString(header.subarray(157, 257))) {
      reject("archive_entry_unsafe");
    }
    if (entries.has(fullName)) reject("archive_duplicate_entry");
    const size = tarOctal(header.subarray(124, 136));
    const mode = tarOctal(header.subarray(100, 108));
    if (!Number.isSafeInteger(size) || size < 1 || size > MAX_FILE_BYTES || (mode & 0o7000) !== 0) reject("archive_entry_unsafe");
    const start = position + 512;
    const end = start + size;
    if (end > bytes.length || !bytes.subarray(end, start + Math.ceil(size / 512) * 512).every((value) => value === 0)) {
      reject("archive_entry_unsafe");
    }
    entries.set(fullName, bytes.subarray(start, end));
    position = start + Math.ceil(size / 512) * 512;
  }
  if (!ended) reject("archive_terminator_missing");
  return entries;
}

function jsonEntry(entries, name, digest) {
  const value = entries.get(name);
  if (!value || sha256(value) !== digest) reject("source_digest_mismatch");
  try { return JSON.parse(value.toString("utf8")); } catch { reject("source_manifest_invalid"); }
}

export function verifyPackage(bytes, pinsInput) {
  const pins = validatePins(pinsInput);
  if (sha256(bytes) !== pins.package.sha256) reject("package_digest_mismatch");
  const entries = readRestrictedTar(bytes);
  const gold = jsonEntry(entries, FIXED_FILES[0], pins.goldManifestSha256);
  const canonical = jsonEntry(entries, FIXED_FILES[1], pins.canonicalManifestSha256);
  const provenance = jsonEntry(entries, FIXED_FILES[2], pins.productProvenanceSha256);
  if (gold.schema_version !== "ratereveal_gold_private_manifest_v1" || !Array.isArray(gold.cases) || gold.cases.length !== 8) {
    reject("gold_case_coverage_invalid");
  }
  const expectedFiles = new Set(FIXED_FILES);
  const seen = new Set();
  let g4Path;
  for (const item of gold.cases) {
    const caseId = item?.case_id;
    const name = item?.document_file;
    if (!CASES.includes(caseId) || seen.has(caseId) || !/^documents\/[^/]+\.pdf$/.test(name ?? "")) {
      reject("gold_case_coverage_invalid");
    }
    seen.add(caseId);
    expectedFiles.add(name);
    const source = entries.get(name);
    if (!source || source.subarray(0, 5).toString() !== "%PDF-" || item.sha256 !== pins.approvedDocuments[caseId] ||
        sha256(source) !== pins.approvedDocuments[caseId]) reject("document_identity_mismatch");
    if (caseId === "G4") g4Path = name;
  }
  if (seen.size !== 8 || expectedFiles.size !== 11 || entries.size !== 11 ||
      [...entries.keys()].some((name) => !expectedFiles.has(name))) reject("archive_file_set_invalid");
  if (canonical.schemaVersion !== "private_corpus_manifest_v1" ||
      canonical.privateCorpusCaseId !== pins.canonicalPrivateCaseId || canonical.documentFile !== g4Path) {
    reject("canonical_binding_invalid");
  }
  if (!Array.isArray(provenance.goldBindings) || provenance.goldBindings.length !== 8 ||
      provenance.goldBindings.some((item) => !seen.has(item?.caseId) || item.sha256 !== pins.approvedDocuments[item.caseId]) ||
      provenance.canonicalPrivateCase?.privateCorpusCaseId !== pins.canonicalPrivateCaseId ||
      provenance.canonicalPrivateCase?.sha256 !== pins.approvedDocuments.G4 ||
      provenance.historicalG9?.sourceStatus !== "source_unavailable" ||
      provenance.historicalG9?.executionStatus !== "non_source_executable") {
    reject("product_provenance_invalid");
  }
  return { entries, verifiedCaseCount: 8, packageVersion: pins.package.version };
}

export function runnerPaths(runnerTemp) {
  if (!path.isAbsolute(runnerTemp ?? "") || runnerTemp === path.parse(runnerTemp).root) reject("runner_temp_invalid");
  return {
    archive: path.join(runnerTemp, ARCHIVE_BASENAME),
    corpus: path.join(runnerTemp, CORPUS_BASENAME),
    database: path.join(runnerTemp, "ratereveal-secure-validation.sqlite"),
  };
}

export async function stagePackage({ runnerTemp, pinsPath }) {
  const paths = runnerPaths(runnerTemp);
  const pins = JSON.parse(await fs.readFile(pinsPath, "utf8"));
  const stat = await fs.lstat(paths.archive);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_PACKAGE_BYTES) reject("archive_size_invalid");
  const verified = verifyPackage(await fs.readFile(paths.archive), pins);
  try {
    await fs.mkdir(paths.corpus, { mode: 0o700 });
    await fs.chmod(paths.corpus, 0o700);
    for (const [name, bytes] of verified.entries) {
      const filePath = path.join(paths.corpus, ...name.split("/"));
      await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
      await fs.writeFile(filePath, bytes, { flag: "wx", mode: 0o600 });
    }
  } catch (error) {
    await cleanupPackage(runnerTemp);
    throw error;
  }
  return { status: "verified", verifiedCaseCount: verified.verifiedCaseCount };
}

export async function cleanupPackage(runnerTemp) {
  const paths = runnerPaths(runnerTemp);
  await fs.rm(paths.corpus, { recursive: true, force: true });
  await fs.rm(paths.archive, { force: true });
  for (const suffix of ["", "-wal", "-shm"]) await fs.rm(`${paths.database}${suffix}`, { force: true });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  try {
    if (command === "verify") {
      const result = await stagePackage({ runnerTemp: process.env.RUNNER_TEMP, pinsPath: process.argv[3] });
      console.log(JSON.stringify(result));
    } else if (command === "cleanup") {
      await cleanupPackage(process.env.RUNNER_TEMP);
      console.log(JSON.stringify({ status: "cleaned" }));
    } else reject("command_invalid");
  } catch (error) {
    console.error(JSON.stringify({ status: "failed", code: error instanceof Error ? error.message : "unknown_failure" }));
    process.exitCode = 1;
  }
}
