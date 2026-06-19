import type { EvidenceKind, EvidenceRecord } from "@flowness-labs/core";
import { evidenceKindValues, slugify } from "@flowness-labs/core";

export function normalizeEvidenceKind(value: string): EvidenceKind {
  const normalized = slugify(value).replace(/-/g, "_");
  if ((evidenceKindValues as readonly string[]).includes(normalized)) {
    return normalized as EvidenceKind;
  }

  throw new Error(`Unsupported evidence kind: ${value}`);
}

export function createEvidenceRecord(input: EvidenceRecord): EvidenceRecord {
  if (input.title.trim().length === 0) {
    throw new Error("Evidence title must not be empty.");
  }

  if (!evidenceKindValues.includes(input.kind)) {
    throw new Error(`Unsupported evidence kind: ${input.kind}`);
  }

  return {
    kind: input.kind,
    title: input.title,
    ...(input.detail === undefined ? {} : { detail: input.detail }),
    ...(input.location === undefined ? {} : { location: input.location }),
  };
}

export function hasEvidenceKind(
  evidence: readonly EvidenceRecord[],
  kind: EvidenceKind,
): boolean {
  return evidence.some((item) => item.kind === kind);
}

export function validateEvidenceRecords(
  evidence: readonly EvidenceRecord[],
  requiredKinds: readonly EvidenceKind[] = [],
): readonly string[] {
  const errors: string[] = [];
  if (evidence.length === 0) {
    errors.push("Evidence is required.");
  }

  const kinds = new Set<EvidenceKind>();
  for (const item of evidence) {
    if (!evidenceKindValues.includes(item.kind)) {
      errors.push(`Unsupported evidence kind: ${item.kind}`);
    }

    if (item.title.trim().length === 0) {
      errors.push(`Evidence item with kind "${item.kind}" has an empty title.`);
    }

    kinds.add(item.kind);
  }

  for (const requiredKind of requiredKinds) {
    if (!kinds.has(requiredKind)) {
      errors.push(`Missing required evidence kind: ${requiredKind}`);
    }
  }

  return errors;
}

export function summarizeEvidence(
  evidence: readonly EvidenceRecord[],
): string {
  if (evidence.length === 0) {
    return "No evidence recorded.";
  }

  const kinds = new Set(evidence.map((item) => item.kind));
  return `${evidence.length} evidence item(s): ${Array.from(kinds).join(", ")}`;
}
