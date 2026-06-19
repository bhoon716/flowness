import assert from "node:assert/strict";
import test from "node:test";
import {
  applyHumanGateInstruction,
  createDefaultProjectConfig,
  parseProjectConfigYaml,
  renderProjectConfigYaml,
} from "./config.js";

test("project config round-trips through yaml", () => {
  const original = createDefaultProjectConfig("flowness-demo");
  const yaml = renderProjectConfigYaml(original);
  const parsed = parseProjectConfigYaml(yaml, "fallback-name");

  assert.equal(parsed.projectName, "flowness-demo");
  assert.equal(parsed.humanGate.clarification, "always");
  assert.equal(parsed.defaultWorkflows.feature, "feature");
  assert.equal(parsed.documentationRules.appendOnly, true);
  assert.equal(parsed.documentationRules.preservePromptText, true);
});

test("human gate instructions can be applied from natural language", () => {
  const original = createDefaultProjectConfig("flowness-demo");
  const updated = applyHumanGateInstruction(original, "설계는 항상 물어봐");

  assert.equal(updated.humanGate.design, "always");
  assert.equal(updated.humanGate.clarification, "always");
});
