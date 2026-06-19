import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { createEvidenceRecord } from "@flowness/evidence-system";
import {
  createDecisionDocument,
  formatDecisionFileName,
  renderDecisionMarkdown,
  writeDecisionDocumentToIssue,
} from "./index.js";

test("decision documents validate and persist to issue directories", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-decision-"));
  const evidence = [
    createEvidenceRecord({
      kind: "file",
      title: "issue.md",
      location: "/tmp/issue.md",
    }),
  ];

  const document = createDecisionDocument({
    id: "ISSUE-001-SIGN-IN:auth-strategy",
    issueId: "ISSUE-001-SIGN-IN",
    title: "Auth strategy",
    context: "Choose the session strategy.",
    decision: "Use server sessions.",
    alternatives: ["JWT", "session"],
    consequences: ["stateful auth", "csrf mitigation"],
    evidence,
    sequence: 1,
  });

  assert.equal(document.fileName, formatDecisionFileName(1, "ISSUE-001-SIGN-IN", "Auth strategy"));
  assert.match(renderDecisionMarkdown(document), /## Evidence/);

  const persisted = await writeDecisionDocumentToIssue(rootDir, {
    id: document.id,
    issueId: document.issueId,
    title: document.title,
    context: document.context,
    decision: document.decision,
    alternatives: document.alternatives,
    consequences: document.consequences,
    evidence: document.evidence,
    sequence: 1,
  }, true);

  assert.equal(persisted.fileName, document.fileName);
  const contents = await readFile(persisted.filePath, "utf8");
  assert.match(contents, /## Decision/);
  assert.match(contents, /Use server sessions/);
});

test("decision documents reject missing mandatory sections", () => {
  assert.throws(() => createDecisionDocument({
    id: "ISSUE-001-SIGN-IN:invalid",
    issueId: "ISSUE-001-SIGN-IN",
    title: "Invalid",
    context: "",
    decision: "Use server sessions.",
    alternatives: ["JWT"],
    consequences: ["stateful auth"],
    evidence: [
      createEvidenceRecord({
        kind: "file",
        title: "issue.md",
      }),
    ],
    sequence: 1,
  }), /Decision context must not be empty/);
});
