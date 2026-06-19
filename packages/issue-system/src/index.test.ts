import assert from "node:assert/strict";
import test from "node:test";
import {
  createIssueId,
  findNextIssueSequenceFromNames,
} from "./index.js";

test("createIssueId reflects analyzed request intent and stable numbering", () => {
  assert.equal(createIssueId(1, "회원가입 로그인 기능 만들어줘"), "ISSUE-001-SIGNUP-LOGIN");
  assert.equal(createIssueId(2, "커뮤니티 MVP 기획해줘"), "ISSUE-002-COMMUNITY-MVP-PLAN");
  assert.equal(createIssueId(3, "게시판 CRUD 만들어줘"), "ISSUE-003-BOARD-CRUD");
  assert.equal(createIssueId(4, "고객 지원"), "ISSUE-004-고객-지원");
});

test("findNextIssueSequenceFromNames keeps the numeric prefix stable", () => {
  assert.equal(findNextIssueSequenceFromNames([
    "ISSUE-001-SIGNUP-LOGIN",
    "ISSUE-003-BOARD-CRUD",
    "ISSUE-007-COMMUNITY-MVP-PLAN",
  ]), 8);
});
