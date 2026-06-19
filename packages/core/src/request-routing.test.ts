import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeRequest,
  createIssueTitleFromRequest,
  deriveIssueTypeForRequest,
  deriveWorkflowIdForRequest,
  shouldCreateIssueForRequest,
} from "./index.js";

test("request analysis leaves casual questions without issues", () => {
  const analysis = analyzeRequest("지금 시간이 몇 시야?");

  assert.equal(analysis.category, "casual_or_question");
  assert.equal(analysis.requiresIssue, false);
  assert.equal(analysis.workflowId, undefined);
  assert.equal(analysis.issuePlan, undefined);
  assert.equal(shouldCreateIssueForRequest("지금 시간이 몇 시야?"), false);
  assert.match(analysis.reason, /casual message or question/i);
});

test("request analysis routes a feature request to one workflow-backed issue", () => {
  const analysis = analyzeRequest("로그인 기능을 만들어줘");

  assert.equal(analysis.category, "single_development_task");
  assert.equal(analysis.requiresIssue, true);
  assert.equal(analysis.workflowId, "feature-development");
  assert.equal(deriveWorkflowIdForRequest("로그인 기능을 만들어줘"), "feature-development");
  assert.equal(deriveIssueTypeForRequest("로그인 기능을 만들어줘"), "feature");
  assert.equal(analysis.issuePlan?.primaryIssue.workflowId, "feature-development");
  assert.equal(analysis.issuePlan?.childIssues.length, 0);
  assert.equal(createIssueTitleFromRequest("로그인 기능을 만들어줘"), analysis.suggestedTitle);
  assert.ok(analysis.clarificationQuestions.length > 0);
});

test("request analysis routes MVP planning requests to the MVP workflow", () => {
  const analysis = analyzeRequest("온보딩 MVP를 기획해줘");

  assert.equal(analysis.category, "mvp_or_product_planning");
  assert.equal(analysis.requiresIssue, true);
  assert.equal(analysis.workflowId, "mvp-planning");
  assert.equal(analysis.issueType, "mvp");
  assert.equal(analysis.issuePlan?.primaryIssue.workflowId, "mvp-planning");
  assert.equal(analysis.issuePlan?.childIssues.length, 0);
  assert.match(analysis.reason, /MVP planning/i);
});

test("request analysis splits large requests into a planning issue and child issues", () => {
  const analysis = analyzeRequest("로그인 화면을 만들고; 비밀번호 재설정 페이지도 추가해줘; 알림 설정도 구현해줘");

  assert.equal(analysis.category, "multi_issue_project");
  assert.equal(analysis.requiresIssue, true);
  assert.equal(analysis.workflowId, "mvp-planning");
  assert.equal(analysis.issuePlan?.primaryIssue.workflowId, "mvp-planning");
  assert.equal(analysis.issuePlan?.primaryIssue.type, "planning");
  assert.equal(analysis.issuePlan?.childIssues.length, 3);
  assert.ok(analysis.issuePlan?.childIssues.every((child) => child.workflowId.length > 0));
  assert.ok(analysis.clarificationQuestions.length > 0);
});

test("request analysis routes review, bugfix, and refactor requests to matching workflows", () => {
  const reviewAnalysis = analyzeRequest("이 PR 리뷰해줘");
  const bugfixAnalysis = analyzeRequest("로그인 오류를 고쳐줘");
  const refactorAnalysis = analyzeRequest("이 코드를 리팩터링해줘");

  assert.equal(reviewAnalysis.category, "review_task");
  assert.equal(reviewAnalysis.workflowId, "code-review");
  assert.equal(reviewAnalysis.issueType, "feature");

  assert.equal(bugfixAnalysis.category, "bugfix_task");
  assert.equal(bugfixAnalysis.workflowId, "bug-fix");
  assert.equal(bugfixAnalysis.issueType, "bugfix");

  assert.equal(refactorAnalysis.category, "refactor_task");
  assert.equal(refactorAnalysis.workflowId, "refactoring");
  assert.equal(refactorAnalysis.issueType, "refactor");
});
