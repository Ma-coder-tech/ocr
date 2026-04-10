import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const schemaPath = path.join(root, "data/merchant-statement-foundation/analysis-schema.json");
const checklistPath = path.join(root, "data/merchant-statement-foundation/master-checklist.json");

const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
const checklist = JSON.parse(fs.readFileSync(checklistPath, "utf8"));

const errors = [];

const requiredTop = ["meta", "elements", "coverage_report", "dedup_notes"];
for (const key of requiredTop) {
  if (!(key in checklist)) {
    errors.push(`Missing top-level key: ${key}`);
  }
}

const requiredElementKeys = [
  "id",
  "name",
  "category",
  "description",
  "required_inputs",
  "rule_or_threshold",
  "calculation",
  "trigger_condition",
  "recommended_action",
  "source_type",
  "source_trace",
];

const categoryEnum = schema.$defs.analysisElement.properties.category.enum;
const sourceTypeEnum = schema.$defs.analysisElement.properties.source_type.enum;

if (!Array.isArray(checklist.elements) || checklist.elements.length === 0) {
  errors.push("elements[] must be a non-empty array");
}

const ids = new Set();
for (const [index, element] of checklist.elements.entries()) {
  for (const key of requiredElementKeys) {
    if (!(key in element)) {
      errors.push(`elements[${index}] missing key: ${key}`);
    }
  }

  if (ids.has(element.id)) {
    errors.push(`Duplicate element id: ${element.id}`);
  }
  ids.add(element.id);

  if (!categoryEnum.includes(element.category)) {
    errors.push(`Invalid category for ${element.id}: ${element.category}`);
  }
  if (!sourceTypeEnum.includes(element.source_type)) {
    errors.push(`Invalid source_type for ${element.id}: ${element.source_type}`);
  }

  if (!Array.isArray(element.required_inputs)) {
    errors.push(`required_inputs must be array for ${element.id}`);
  }
  if (!Array.isArray(element.recommended_action) || element.recommended_action.length === 0) {
    errors.push(`recommended_action must be non-empty array for ${element.id}`);
  }
  if (!Array.isArray(element.source_trace) || element.source_trace.length === 0) {
    errors.push(`source_trace must be non-empty array for ${element.id}`);
  }
}

if (!checklist.coverage_report || !Array.isArray(checklist.coverage_report.source_sections)) {
  errors.push("coverage_report.source_sections must be an array");
} else {
  for (const section of checklist.coverage_report.source_sections) {
    if (!section.section_id || !section.section_title) {
      errors.push("Each source section must include section_id and section_title");
      continue;
    }
    if (!Array.isArray(section.mapped_element_ids) || section.mapped_element_ids.length === 0) {
      errors.push(`Section ${section.section_id} has no mapped elements`);
      continue;
    }
    for (const id of section.mapped_element_ids) {
      if (!ids.has(id)) {
        errors.push(`Section ${section.section_id} references unknown element id: ${id}`);
      }
    }
  }
}

if (!Array.isArray(checklist.coverage_report?.coverage_checks)) {
  errors.push("coverage_report.coverage_checks must be an array");
}

if (!Array.isArray(checklist.dedup_notes)) {
  errors.push("dedup_notes must be an array");
} else {
  for (const note of checklist.dedup_notes) {
    if (!ids.has(note.normalized_into)) {
      errors.push(`dedup note normalized_into unknown id: ${note.normalized_into}`);
    }
  }
}

const hasBothSourceTypes = new Set(checklist.elements.map((e) => e.source_type));
if (!hasBothSourceTypes.has("explicit") || !hasBothSourceTypes.has("inferred")) {
  errors.push("Checklist must include both explicit and inferred elements");
}

if (errors.length > 0) {
  console.error("merchant-foundation validation FAILED");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("merchant-foundation validation PASSED");
console.log(`elements=${checklist.elements.length}`);
console.log(`sections=${checklist.coverage_report.source_sections.length}`);
console.log(`dedup_notes=${checklist.dedup_notes.length}`);
