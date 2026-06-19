import assert from "node:assert/strict";
import test from "node:test";
import {
  createEvidenceRecord,
  hasEvidenceKind,
  normalizeEvidenceKind,
  summarizeEvidence,
  validateEvidenceRecords,
} from "./index.js";

test("evidence helpers validate and summarize records", () => {
  const record = createEvidenceRecord({
    kind: "file",
    title: "issue.md",
    location: "/tmp/issue.md",
  });

  assert.deepEqual(record, {
    kind: "file",
    title: "issue.md",
    location: "/tmp/issue.md",
  });
  assert.equal(normalizeEvidenceKind("command output"), "command_output");
  assert.equal(hasEvidenceKind([record], "file"), true);
  assert.match(summarizeEvidence([record]), /1 evidence item/);
  assert.deepEqual(validateEvidenceRecords([record], ["file"]), []);
  assert.deepEqual(validateEvidenceRecords([], ["file"]), [
    "Evidence is required.",
    "Missing required evidence kind: file",
  ]);
});
