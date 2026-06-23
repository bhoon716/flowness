import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createIssueId,
  createIssueIdFromSlug,
  allocateIssueIdentity,
  createIssueWorkspace,
  findNextIssueSequenceFromNames,
} from "./index.js";
import type { WorkflowDefinition } from "@flowness-labs/core";

test("createIssueId reflects the actual issue title and stable numbering", () => {
  assert.equal(createIssueId(1, "Sign in"), "ISSUE-001-SIGN-IN");
  assert.equal(createIssueId(2, "Community MVP plan"), "ISSUE-002-COMMUNITY-MVP-PLAN");
  assert.equal(createIssueId(3, "Board CRUD"), "ISSUE-003-BOARD-CRUD");
  assert.equal(createIssueId(4, "고객 지원"), "ISSUE-004-고객-지원");
});

test("createIssueIdFromSlug keeps precomputed slugs stable", () => {
  assert.equal(createIssueIdFromSlug(1, "signup-login"), "ISSUE-001-SIGNUP-LOGIN");
  assert.equal(createIssueIdFromSlug(2, "community-mvp-plan"), "ISSUE-002-COMMUNITY-MVP-PLAN");
  assert.equal(createIssueIdFromSlug(3, "board-crud"), "ISSUE-003-BOARD-CRUD");
});

test("findNextIssueSequenceFromNames keeps the numeric prefix stable", () => {
  assert.equal(findNextIssueSequenceFromNames([
    "ISSUE-001-SIGNUP-LOGIN",
    "ISSUE-003-BOARD-CRUD",
    "ISSUE-007-COMMUNITY-MVP-PLAN",
  ]), 8);
});

test("allocateIssueIdentity picks the next available number and skips existing issue directories", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-issue-allocator-"));
  await mkdir(join(rootDir, ".flowness", "issues", "ISSUE-001-EXISTING"), { recursive: true });
  await mkdir(join(rootDir, ".flowness", "issues", "ISSUE-002-OTHER"), { recursive: true });

  const allocation = await allocateIssueIdentity(rootDir, "Sign in");

  assert.equal(allocation.issueId, "ISSUE-003-SIGN-IN");
  assert.equal(allocation.sequence, 3);
  assert.equal(allocation.folderName, "ISSUE-003-SIGN-IN");
  assert.equal(allocation.slug, "sign-in");
  assert.equal(allocation.safeToCreate, true);
});

test("allocateIssueIdentity derives slug from the actual title and does not leak the parent slug", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-issue-allocator-slug-"));

  const parent = await allocateIssueIdentity(rootDir, "Performance work");
  const child = await allocateIssueIdentity(rootDir, "Benchmark follow-up", [parent.issueId]);

  assert.equal(parent.issueId, "ISSUE-001-PERFORMANCE-WORK");
  assert.equal(child.issueId, "ISSUE-002-BENCHMARK-FOLLOW-UP");
  assert.match(child.issueId, /BENCHMARK-FOLLOW-UP$/);
  assert.doesNotMatch(child.issueId, /PERFORMANCE-WORK/);
});

test("createIssueWorkspace is idempotent for an unchanged workspace", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-issue-idempotent-"));
  const workflow: WorkflowDefinition = {
    id: "feature-development",
    name: "Feature Development",
    steps: [
      {
        name: "Intake",
        preconditions: [],
        successConditions: [],
        execute: () => ({ summary: "ok", evidence: [] }),
      },
    ],
  };

  const first = await createIssueWorkspace({
    rootDir,
    title: "Sign in",
    type: "feature",
    workflow,
    description: "Sign in request",
  });

  const second = await createIssueWorkspace({
    rootDir,
    title: "Sign in",
    type: "feature",
    workflow,
    description: "Sign in request",
  });

  assert.equal(first.issue.id, "ISSUE-001-SIGN-IN");
  assert.equal(second.issue.id, first.issue.id);
  assert.equal(second.reusedExisting, true);
  assert.equal(second.createdFiles.length, 0);
});
