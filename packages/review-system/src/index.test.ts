import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { createEvidenceRecord } from "@flowness-labs/evidence-system";
import { createInitialWorkflowState, defineWorkflow } from "@flowness-labs/workflow-engine";
import {
  createReviewCoordinatorResult,
  listReviewRoles,
  runStandardReviews,
  writeReviewReportToIssue,
} from "./index.js";

test("review coordinator aggregates independent reviewers", async () => {
  const workflow = defineWorkflow({
    id: "code-review",
    name: "Code Review Workflow",
    steps: [
      {
        name: "Clarify",
        preconditions: [],
        successConditions: [],
        execute: async () => ({
          summary: "Clarified.",
          evidence: [],
          nextStep: "Scope",
        }),
      },
    ],
  });
  const state = createInitialWorkflowState(workflow, "2026-06-19T00:00:00.000Z");
  const reviewState = {
    ...state,
    completedSteps: ["Clarify"],
    failedSteps: ["Clarify", "Scope"],
  } as typeof state;
  const evidence = [
    createEvidenceRecord({
      kind: "file",
      title: "sign-in.ts",
      location: "/tmp/sign-in.ts",
    }),
    createEvidenceRecord({
      kind: "test",
      title: "npm test",
      detail: "passed",
    }),
  ];

  const results = runStandardReviews({
    rootDir: "/tmp/flowness-review",
    issueId: "ISSUE-001-SIGN-IN",
    issueTitle: "Sign in",
    issueType: "review",
    workflowId: workflow.id,
    workflowState: reviewState,
    evidence,
  });
  const coordinator = createReviewCoordinatorResult(results);

  assert.equal(listReviewRoles().length, 7);
  assert.equal(results.length, 7);
  assert.equal(coordinator.passed, true);
  assert.deepEqual(coordinator.blockingRoles, []);
  assert.ok(coordinator.concernRoles.includes("Maintainability Reviewer"));

  const rootDir = await mkdtemp(join(tmpdir(), "flowness-review-"));
  const report = await writeReviewReportToIssue({
    rootDir,
    issueId: "ISSUE-001-SIGN-IN",
    issueTitle: "Sign in",
    issueType: "review",
    workflowId: workflow.id,
    workflowState: reviewState,
    evidence,
  }, results);

  const contents = await readFile(report.filePath, "utf8");
  assert.ok(contents.split("\n").length < 120);
  assert.match(contents, /## Target/);
  assert.match(contents, /## Diff Summary/);
  assert.match(contents, /## Perspective Results/);
  assert.match(contents, /## Findings/);
  assert.match(contents, /- Other files: 1 \(\/tmp\/sign-in\.ts\)/);
  [
    "Architecture Reviewer",
    "Correctness Reviewer",
    "Security Reviewer",
    "Test Coverage Reviewer",
    "Maintainability Reviewer",
  ].forEach((role) => {
    assert.match(contents, new RegExp(role.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
  assert.match(contents, /- Severity: LOW/);
  assert.match(contents, /- Requires follow-up issue: no/);
  assert.match(contents, /## Summary/);
  assert.match(contents, /Passed: yes/);
});

test("review reports order changed files by review priority", async () => {
  const workflow = defineWorkflow({
    id: "code-review",
    name: "Code Review Workflow",
    steps: [
      {
        name: "Clarify",
        preconditions: [],
        successConditions: [],
        execute: async () => ({
          summary: "Clarified.",
          evidence: [],
          nextStep: "Scope",
        }),
      },
    ],
  });
  const state = createInitialWorkflowState(workflow, "2026-06-19T00:00:00.000Z");
  const reviewState = {
    ...state,
    completedSteps: ["Clarify"],
    failedSteps: ["Clarify", "Scope"],
  } as typeof state;
  const evidence = [
    createEvidenceRecord({
      kind: "file",
      title: "config/settings.json",
      location: "/tmp/config/settings.json",
    }),
    createEvidenceRecord({
      kind: "file",
      title: "src/app.test.ts",
      location: "/tmp/src/app.test.ts",
    }),
    createEvidenceRecord({
      kind: "file",
      title: "src/app.ts",
      location: "/tmp/src/app.ts",
    }),
    createEvidenceRecord({
      kind: "file",
      title: "docs/guide.md",
      location: "/tmp/docs/guide.md",
    }),
    createEvidenceRecord({
      kind: "test",
      title: "npm test",
      detail: "passed",
    }),
  ];

  const results = runStandardReviews({
    rootDir: "/tmp/flowness-review",
    issueId: "ISSUE-002-ORDERING",
    issueTitle: "Ordering",
    issueType: "review",
    workflowId: workflow.id,
    workflowState: reviewState,
    evidence,
  });
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-review-order-"));
  const report = await writeReviewReportToIssue({
    rootDir,
    issueId: "ISSUE-002-ORDERING",
    issueTitle: "Ordering",
    issueType: "review",
    workflowId: workflow.id,
    workflowState: reviewState,
    evidence,
  }, results);

  assert.deepEqual(report.changedFiles, [
    "/tmp/src/app.ts",
    "/tmp/src/app.test.ts",
    "/tmp/config/settings.json",
    "/tmp/docs/guide.md",
  ]);
});
