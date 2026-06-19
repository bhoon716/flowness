import assert from "node:assert/strict";
import test from "node:test";
import {
  createGenericWorkflowDefinition,
  getBuiltinWorkflowDefinition,
  renderWorkflowScaffoldSource,
  validateBuiltinWorkflowDefinitions,
} from "./builtins.js";

test("built-in workflows validate", () => {
  const errors = validateBuiltinWorkflowDefinitions();
  assert.deepEqual(errors, []);
});

test("workflow scaffolds render executable TypeScript", () => {
  const workflow = getBuiltinWorkflowDefinition("feature") ?? createGenericWorkflowDefinition("feature", "Feature Workflow");
  const source = renderWorkflowScaffoldSource(workflow);

  assert.match(source, /defineWorkflow/);
  assert.match(source, /Feature Workflow/);
  assert.match(source, /Clarification/);
  assert.match(source, /Commit/);
  assert.match(source, /runCommitWorkflowStep/);
});
