import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { createEvidenceRecord } from "@flowness-labs/evidence-system";
import type { ReviewFinding, ReviewResult } from "@flowness-labs/core";
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
  assert.ok(contents.split("\n").length < 180);
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
  assert.match(contents, /- Blocking: yes/);
  assert.match(contents, /- Deferrable: yes/);
  assert.match(contents, /- Status: open/);
  assert.match(contents, /- Blocker kind: /);
  assert.match(contents, /- Requires follow-up issue: yes/);
  assert.match(contents, /- Follow-up issue: required/);
  assert.match(contents, /- User approval: not required/);
  assert.match(contents, /## Summary/);
  assert.match(contents, /Passed: yes/);
});

test("review reports render finding lifecycle statuses and blocker kinds", async () => {
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
    completedSteps: ["Clarify", "Scope"],
    failedSteps: ["Clarify"],
  } as typeof state;
  const findings: ReviewFinding[] = [
    {
      id: "PERF-001",
      perspective: "Performance Reviewer",
      severity: "low",
      status: "open",
      blockerKind: "deferrable",
      filePath: "/tmp/perf-open.md",
      evidence: [],
      problem: "Open performance concern.",
      recommendation: "Refine the benchmark before merge.",
      requiresFollowUpIssue: true,
      rationale: "Open concern remains unresolved.",
    },
    {
      id: "PERF-002",
      perspective: "Performance Reviewer",
      severity: "low",
      status: "deferred",
      blockerKind: "deferrable",
      filePath: "/tmp/perf-deferred.md",
      evidence: [],
      problem: "Deferred performance concern.",
      recommendation: "Track the follow-up issue.",
      requiresFollowUpIssue: true,
      rationale: "Deferred for follow-up.",
    },
    {
      id: "PERF-003",
      perspective: "Performance Reviewer",
      severity: "low",
      status: "accepted-risk",
      blockerKind: "deferrable",
      filePath: "/tmp/perf-accepted-risk.md",
      evidence: [],
      problem: "Accepted risk performance concern.",
      recommendation: "Document the risk acceptance.",
      requiresFollowUpIssue: true,
      rationale: "User accepted the risk.",
    },
    {
      id: "CORR-001",
      perspective: "Correctness Reviewer",
      severity: "critical",
      status: "addressed",
      blockerKind: "hard",
      filePath: "/tmp/correctness-addressed.md",
      evidence: [],
      problem: "Addressed correctness issue.",
      recommendation: "None.",
      requiresFollowUpIssue: false,
      rationale: "Addressed in a follow-up change.",
    },
    {
      id: "TEST-001",
      perspective: "Test Coverage Reviewer",
      severity: "high",
      status: "closed",
      blockerKind: "hard",
      filePath: "/tmp/tests-closed.md",
      evidence: [],
      problem: "Closed test coverage gap.",
      recommendation: "None.",
      requiresFollowUpIssue: false,
      rationale: "Closed after verification.",
    },
  ];
  const results: ReviewResult[] = [
    {
      role: "Performance Reviewer",
      status: "concern",
      summary: "Lifecycle states rendered.",
      findings,
    },
  ];

  const rootDir = await mkdtemp(join(tmpdir(), "flowness-review-lifecycle-"));
  const report = await writeReviewReportToIssue({
    rootDir,
    issueId: "ISSUE-002-LIFECYCLE",
    issueTitle: "Lifecycle states",
    issueType: "review",
    workflowId: workflow.id,
    workflowState: reviewState,
    evidence: [],
  }, results);

  const contents = await readFile(report.filePath, "utf8");
  assert.match(contents, /- Status: open/);
  assert.match(contents, /- Status: addressed/);
  assert.match(contents, /- Status: closed/);
  assert.match(contents, /- Status: deferred/);
  assert.match(contents, /- Status: accepted-risk/);
  assert.match(contents, /- Blocking: no/);
  assert.match(contents, /- Blocker kind: hard/);
  assert.match(contents, /- Blocker kind: deferrable/);
  assert.match(contents, /- Requires follow-up issue: yes/);
  assert.match(contents, /- User approval: required before commit/);
  assert.match(contents, /## Findings/);
  assert.match(contents, /## Recommended Next Actions/);
});

test("performance reviewer accepts compact summaries for large raw evidence", async () => {
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
    completedSteps: ["Clarify", "Scope"],
    failedSteps: ["Clarify"],
    updatedAt: "2026-06-19T00:00:00.000Z",
  } as typeof state;
  const evidence = [
    createEvidenceRecord({
      kind: "command_output",
      title: "benchmark summary",
      detail: [
        "scenario: login validation benchmark",
        "before: 120ms median",
        "after/result: 82ms median",
        "workload: 100 iterations",
        "key metric: median duration",
        "raw report path: docs/troubleshooting/perf-raw.json",
        "limitations: synthetic data only",
        "follow-up issue: none",
      ].join(" | "),
    }),
    ...Array.from({ length: 26 }, (_, index) => createEvidenceRecord({
      kind: "file",
      title: `docs/raw/perf-${String(index + 1).padStart(2, "0")}.txt`,
      location: `/tmp/docs/raw/perf-${String(index + 1).padStart(2, "0")}.txt`,
    })),
  ];

  const results = runStandardReviews({
    rootDir: "/tmp/flowness-review",
    issueId: "ISSUE-003-PERF-SUMMARY",
    issueTitle: "Benchmark summary",
    issueType: "documentation",
    workflowId: workflow.id,
    workflowState: reviewState,
    evidence,
  });
  const coordinator = createReviewCoordinatorResult(results);
  const performanceReviewer = results.find((result) => result.role === "Performance Reviewer");

  assert.equal(coordinator.passed, true);
  assert.deepEqual(coordinator.blockingRoles, []);
  assert.deepEqual(coordinator.concernRoles, []);
  assert.equal(performanceReviewer?.status, "pass");

  const rootDir = await mkdtemp(join(tmpdir(), "flowness-review-performance-"));
  const report = await writeReviewReportToIssue({
    rootDir,
    issueId: "ISSUE-003-PERF-SUMMARY",
    issueTitle: "Benchmark summary",
    issueType: "documentation",
    workflowId: workflow.id,
    workflowState: reviewState,
    evidence,
  }, results);

  const contents = await readFile(report.filePath, "utf8");
  assert.match(contents, /Passed: yes/);
  assert.match(contents, /Performance Reviewer/);
  assert.match(contents, /Hard blockers: 0/);
  assert.match(contents, /Deferrable blockers: 0/);
  assert.doesNotMatch(contents, /Evidence volume is large, but no compact performance summary was attached\./);
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
