import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import {
  createInitialWorkflowState,
  createWorkflowStepContext,
  loadWorkflowDefinitionFromFile,
  loadWorkflowDefinitionFromWorkspace,
  runWorkflowStep,
} from "./index.js";

async function createIssueEvidenceFiles(
  rootDir: string,
  issueId: string,
  workflowState: { readonly currentStep: string },
): Promise<void> {
  const issueDir = join(rootDir, ".flowness", "issues", issueId);
  const decisionsDir = join(issueDir, "decisions");
  const reviewsDir = join(issueDir, "reviews");
  const logDir = join(rootDir, ".flowness", "logs");

  await mkdir(decisionsDir, { recursive: true });
  await mkdir(reviewsDir, { recursive: true });
  await mkdir(logDir, { recursive: true });

  await writeFile(join(issueDir, "issue.md"), "# Issue\n", "utf8");
  await writeFile(join(issueDir, "issue.json"), JSON.stringify({ issue: { id: issueId } }, null, 2), "utf8");
  await writeFile(join(issueDir, "workflow-state.json"), `${JSON.stringify(workflowState, null, 2)}\n`, "utf8");
  await writeFile(join(decisionsDir, "README.md"), "# Decisions\n", "utf8");
  await writeFile(join(reviewsDir, "README.md"), "# Reviews\n", "utf8");
  await writeFile(join(logDir, `${issueId}.md`), [
    `# ${issueId} Log`,
    "",
    "- Issue: Issue",
    `- Log File: ${issueId}.md`,
    "",
    "## 2026-06-19T00:00:00.000Z",
    "",
    "- Step: Issue Created",
    "- Actions:",
    "  - Seeded workflow evidence.",
    "- Evidence:",
    "  - None",
    "- Summary: Seeded workflow evidence.",
    `- Next Step: ${workflowState.currentStep}`,
    "",
  ].join("\n"), "utf8");
}

test("loadWorkflowDefinitionFromFile supports python workflow blueprints", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-python-workflow-"));
  const workflowDir = join(rootDir, ".agent", "workflows", "python-flow");
  await mkdir(workflowDir, { recursive: true });

  const workflowPath = join(workflowDir, "workflow.py");
  await writeFile(workflowPath, [
    "#!/usr/bin/env python3",
    "import json",
    "",
    "print(json.dumps({",
    "  \"id\": \"python-flow\",",
    "  \"name\": \"Python Flow\",",
    "  \"steps\": [",
    "    {",
    "      \"name\": \"Discover\",",
    "      \"humanGate\": \"never\"",
    "    },",
    "    {",
    "      \"name\": \"Build\",",
    "      \"humanGate\": \"never\"",
    "    }",
    "  ]",
    "}))",
    "",
  ].join("\n"), "utf8");

  const workflow = await loadWorkflowDefinitionFromFile(workflowPath);
  assert.equal(workflow.id, "python-flow");
  assert.equal(workflow.steps[0]?.name, "Discover");

  const issueId = "ISSUE-001-PYTHON";
  const initialState = createInitialWorkflowState(workflow, "2026-06-19T00:00:00.000Z");
  await createIssueEvidenceFiles(rootDir, issueId, initialState);
  const context = createWorkflowStepContext({
    issueId,
    issueType: "feature",
    workflowId: workflow.id,
    stepName: "Discover",
    rootDir,
    state: initialState,
  });

  const outcome = await runWorkflowStep({
    workflow,
    state: initialState,
    context,
    timestamp: "2026-06-19T00:01:00.000Z",
  });

  assert.equal(outcome.status, "completed");
  assert.equal(outcome.nextStep, "Build");
});

test("loadWorkflowDefinitionFromFile supports shell workflow blueprints", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-shell-workflow-"));
  const workflowDir = join(rootDir, ".agent", "workflows", "shell-flow");
  await mkdir(workflowDir, { recursive: true });

  const workflowPath = join(workflowDir, "workflow.sh");
  await writeFile(workflowPath, [
    "#!/bin/sh",
    "cat <<'JSON'",
    "{\"id\":\"shell-flow\",\"name\":\"Shell Flow\",\"steps\":[{\"name\":\"Intake\",\"humanGate\":\"never\"},{\"name\":\"Ship\",\"humanGate\":\"never\"}]}",
    "JSON",
    "",
  ].join("\n"), "utf8");

  const workflow = await loadWorkflowDefinitionFromFile(workflowPath);
  assert.equal(workflow.id, "shell-flow");
  assert.equal(workflow.steps[1]?.name, "Ship");

  const issueId = "ISSUE-001-SHELL";
  const initialState = createInitialWorkflowState(workflow, "2026-06-19T00:00:00.000Z");
  await createIssueEvidenceFiles(rootDir, issueId, initialState);
  const context = createWorkflowStepContext({
    issueId,
    issueType: "feature",
    workflowId: workflow.id,
    stepName: "Intake",
    rootDir,
    state: initialState,
  });

  const outcome = await runWorkflowStep({
    workflow,
    state: initialState,
    context,
    timestamp: "2026-06-19T00:01:00.000Z",
  });

  assert.equal(outcome.status, "completed");
  assert.equal(outcome.nextStep, "Ship");
});

test("loadWorkflowDefinitionFromWorkspace supports markdown workflow folders", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-markdown-workflow-"));
  const workflowDir = join(rootDir, ".agent", "workflows", "feature-development");
  await mkdir(workflowDir, { recursive: true });

  await writeFile(join(workflowDir, "README.md"), [
    "# Feature Development",
    "",
    "Generated workflow.",
    "",
  ].join("\n"), "utf8");
  await writeFile(join(workflowDir, "01-intake.md"), [
    "---",
    "workflow: feature-development",
    "name: Intake",
    "human_gate: always",
    "next: Analysis",
    "---",
    "",
    "# Intake",
    "",
    "## Required Inputs",
    "- The current request or issue summary.",
    "",
    "## Evidence Required",
    "- The step note itself.",
    "",
    "## Exit Criteria",
    "- The intake outcome is documented.",
    "",
  ].join("\n"), "utf8");
  await writeFile(join(workflowDir, "02-analysis.md"), [
    "---",
    "workflow: feature-development",
    "name: Analysis",
    "human_gate: never",
    "next: Close",
    "---",
    "",
    "# Analysis",
    "",
    "## Required Inputs",
    "- The project profile.",
    "",
  ].join("\n"), "utf8");

  const workflow = await loadWorkflowDefinitionFromWorkspace(rootDir, "feature-development");
  assert.ok(workflow);
  assert.equal(workflow.id, "feature-development");
  assert.equal(workflow.name, "Feature Development");
  assert.equal(workflow.steps[0]?.name, "Intake");
  assert.equal(workflow.steps[0]?.humanGate, "always");
  assert.equal(workflow.steps[1]?.name, "Analysis");

  const issueId = "ISSUE-001-MARKDOWN";
  const initialState = createInitialWorkflowState(workflow, "2026-06-19T00:00:00.000Z");
  await createIssueEvidenceFiles(rootDir, issueId, initialState);
  const context = createWorkflowStepContext({
    issueId,
    issueType: "feature",
    workflowId: workflow.id,
    stepName: "Intake",
    rootDir,
    state: initialState,
  });

  const waiting = await runWorkflowStep({
    workflow,
    state: initialState,
    context,
    timestamp: "2026-06-19T00:01:00.000Z",
  });

  assert.equal(waiting.status, "waiting_approval");
  assert.equal(waiting.state.currentStep, "Intake");

  const completed = await runWorkflowStep({
    workflow,
    state: waiting.state,
    context,
    timestamp: "2026-06-19T00:02:00.000Z",
    approved: true,
  });

  assert.equal(completed.status, "completed");
  assert.equal(completed.nextStep, "Analysis");
});
