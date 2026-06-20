import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { EvidenceRecord } from "@flowness-labs/core";
import {
  createInitialWorkflowState,
  createWorkflowStepContext,
  defineWorkflow,
  recoverWorkflowStep,
  runWorkflowStep,
} from "./index.js";

test("runWorkflowStep handles human gates, transitions, and failure recovery", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-runtime-"));
  const clarifyEvidencePath = join(rootDir, "clarify-evidence.md");
  await writeFile(clarifyEvidencePath, "# Clarify evidence\n", "utf8");

  const workflow = defineWorkflow({
    id: "demo-workflow",
    name: "Demo Workflow",
    steps: [
      {
        name: "Clarify",
        preconditions: [],
        successConditions: ["Request is clarified."],
        humanGate: "always",
        next: "Implement",
        execute: async () => ({
          summary: "Clarified the request.",
          evidence: [
            {
              kind: "file",
              title: "clarify-evidence.md",
              location: clarifyEvidencePath,
              detail: "Clarified the request.",
            } satisfies EvidenceRecord,
          ],
          nextStep: "Implement",
        }),
      },
      {
        name: "Implement",
        preconditions: ['"Clarify" has completed.'],
        successConditions: ["Implementation is complete."],
        execute: async () => {
          throw new Error("implementation failed");
        },
      },
    ],
  });

  const startedAt = "2026-06-19T00:00:00.000Z";
  const initialState = createInitialWorkflowState(workflow, startedAt);
  const clarifyContext = createWorkflowStepContext({
    issueId: "ISSUE-001-DEMO",
    issueType: "feature",
    workflowId: workflow.id,
    stepName: "Clarify",
    rootDir,
    state: initialState,
  });

  const waiting = await runWorkflowStep({
    workflow,
    state: initialState,
    context: clarifyContext,
    timestamp: "2026-06-19T00:01:00.000Z",
  });
  assert.equal(waiting.status, "waiting_approval");
  assert.equal(waiting.state.currentStep, "Clarify");
  assert.equal(waiting.state.blocked, true);

  const completed = await runWorkflowStep({
    workflow,
    state: waiting.state,
    context: clarifyContext,
    timestamp: "2026-06-19T00:02:00.000Z",
    approved: true,
  });
  assert.equal(completed.status, "completed");
  assert.equal(completed.nextStep, "Implement");
  assert.equal(completed.state.currentStep, "Implement");
  assert.equal(completed.state.blocked, false);
  assert.match(completed.logEntry.actions[0] ?? "", /Human gate "always" approved explicitly\./);
  assert.equal(completed.logEntry.evidence[0]?.title, "Human approval for Clarify");

  const implementContext = createWorkflowStepContext({
    issueId: "ISSUE-001-DEMO",
    issueType: "feature",
    workflowId: workflow.id,
    stepName: "Implement",
    rootDir,
    state: completed.state,
  });

  const blocked = await runWorkflowStep({
    workflow,
    state: completed.state,
    context: implementContext,
    timestamp: "2026-06-19T00:03:00.000Z",
  });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.state.blocked, true);
  assert.equal(blocked.state.currentStep, "Implement");

  const recovered = await recoverWorkflowStep({
    workflow,
    state: blocked.state,
    context: implementContext,
    timestamp: "2026-06-19T00:04:00.000Z",
    rootCause: "implementation failed",
  });
  assert.equal(recovered.status, "blocked");
  assert.equal(recovered.state.blocked, true);
  assert.equal(recovered.state.currentStep, "Implement");
});

test("runWorkflowStep blocks close steps that do not provide evidence", async () => {
  const workflow = defineWorkflow({
    id: "close-evidence",
    name: "Close Evidence",
    steps: [
      {
        name: "Close",
        preconditions: [],
        successConditions: ["Evidence is recorded."],
        next: null,
        execute: async () => ({
          summary: "Attempted to close without evidence.",
          evidence: [],
          nextStep: null,
        }),
      },
    ],
  });

  const rootDir = await mkdtemp(join(tmpdir(), "flowness-close-evidence-"));
  const initialState = createInitialWorkflowState(workflow, "2026-06-19T00:00:00.000Z");
  const context = createWorkflowStepContext({
    issueId: "ISSUE-001-CLOSE",
    issueType: "feature",
    workflowId: workflow.id,
    stepName: "Close",
    rootDir,
    state: initialState,
  });

  const outcome = await runWorkflowStep({
    workflow,
    state: initialState,
    context,
    timestamp: "2026-06-19T00:01:00.000Z",
  });

  assert.equal(outcome.status, "blocked");
  assert.equal(outcome.state.blocked, true);
  assert.equal(outcome.state.currentStep, "Close");
});

test("runWorkflowStep rejects skipped workflow states", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-skip-"));
  const oneEvidencePath = join(rootDir, "one-evidence.md");
  const twoEvidencePath = join(rootDir, "two-evidence.md");
  await writeFile(oneEvidencePath, "# One evidence\n", "utf8");
  await writeFile(twoEvidencePath, "# Two evidence\n", "utf8");

  const workflow = defineWorkflow({
    id: "skip-protection",
    name: "Skip Protection",
    steps: [
      {
        name: "One",
        preconditions: [],
        successConditions: [],
        execute: async () => ({
          summary: "Step one.",
          evidence: [
            {
              kind: "file",
              title: "one-evidence.md",
              location: oneEvidencePath,
              detail: "Step one.",
            } satisfies EvidenceRecord,
          ],
          nextStep: "Two",
        }),
      },
      {
        name: "Two",
        preconditions: ['"One" has completed.'],
        successConditions: [],
        execute: async () => ({
          summary: "Step two.",
          evidence: [
            {
              kind: "file",
              title: "two-evidence.md",
              location: twoEvidencePath,
              detail: "Step two.",
            } satisfies EvidenceRecord,
          ],
          nextStep: null,
        }),
      },
    ],
  });

  const tamperedState = {
    ...createInitialWorkflowState(workflow, "2026-06-19T00:00:00.000Z"),
    currentStep: "Two",
  };
  const context = createWorkflowStepContext({
    issueId: "ISSUE-002-SKIP",
    issueType: "feature",
    workflowId: workflow.id,
    stepName: "Two",
    rootDir,
    state: tamperedState,
  });

  await assert.rejects(
    runWorkflowStep({
      workflow,
      state: tamperedState,
      context,
      timestamp: "2026-06-19T00:01:00.000Z",
    }),
    /skipped or out-of-order completed steps|not on the expected step/i,
  );
});
