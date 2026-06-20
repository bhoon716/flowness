import assert from "node:assert/strict";
import test from "node:test";
import {
  createLogEntry,
  renderLogEntryMarkdown,
} from "./index.js";

test("renderLogEntryMarkdown compacts long evidence details", () => {
  const entry = createLogEntry({
    timestamp: "2026-06-20T00:00:00.000Z",
    step: "Evidence Review",
    actions: [
      "Collected the failing command output.",
    ],
    evidence: [
      {
        kind: "command_output",
        title: "Long test output",
        detail: [
          "alpha",
          "beta",
          "gamma",
          "delta",
          "epsilon",
          "zeta",
        ].join("\n"),
      },
    ],
    summary: "Reviewed the output.",
    nextStep: "Commit",
  });

  const markdown = renderLogEntryMarkdown(entry);
  assert.match(markdown, /alpha \| beta \| gamma/);
  assert.match(markdown, /6 lines, trimmed/);
  assert.doesNotMatch(markdown, /zeta/);
});
