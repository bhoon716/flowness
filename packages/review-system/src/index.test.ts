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
    id: "feature",
    name: "Feature Workflow",
    steps: [
      {
        name: "Clarify",
        preconditions: [],
        successConditions: [],
        execute: async () => ({
          summary: "Clarified.",
          evidence: [],
          nextStep: "Design",
        }),
      },
    ],
  });
  const state = createInitialWorkflowState(workflow, "2026-06-19T00:00:00.000Z");
  const evidence = [
    createEvidenceRecord({
      kind: "file",
      title: "issue.md",
      location: "/tmp/issue.md",
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
    issueType: "feature",
    workflowId: workflow.id,
    workflowState: state,
    evidence,
  });
  const coordinator = createReviewCoordinatorResult(results);

  assert.equal(listReviewRoles().length, 6);
  assert.equal(results.length, 6);
  assert.equal(coordinator.passed, true);
  assert.deepEqual(coordinator.blockingRoles, []);

  const rootDir = await mkdtemp(join(tmpdir(), "flowness-review-"));
  const report = await writeReviewReportToIssue({
    rootDir,
    issueId: "ISSUE-001-SIGN-IN",
    issueTitle: "Sign in",
    issueType: "feature",
    workflowId: workflow.id,
    workflowState: state,
    evidence,
  }, results);

  const contents = await readFile(report.filePath, "utf8");
  assert.match(contents, /## Summary/);
  assert.match(contents, /Testing Reviewer/);
  assert.match(contents, /Passed: yes/);
});
