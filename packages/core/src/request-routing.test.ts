import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeRequest,
  createIssueSlugFromRequest,
  createIssueTitleFromRequest,
  deriveIssueTypeForRequest,
  deriveWorkflowIdForRequest,
  shouldCreateIssueForRequest,
} from "./index.js";

function assertClarificationOptions(questions: readonly { readonly options: readonly { readonly pros: readonly string[]; readonly cons: readonly string[] }[] }[]): void {
  assert.ok(questions.length > 0);
  assert.ok(questions.every((question) => question.options.length >= 2));
  assert.ok(questions.every((question) => question.options.every((option) => option.pros.length > 0 && option.cons.length > 0)));
}

test("request analysis leaves casual questions without issues", () => {
  const analysis = analyzeRequest("지금 시간이 몇 시야?");

  assert.equal(analysis.category, "casual_or_question");
  assert.equal(analysis.intent, "answer");
  assert.equal(analysis.executionMode, "answer");
  assert.equal(analysis.issueCount, 0);
  assert.equal(analysis.safeToProceed, true);
  assert.equal(analysis.nextAction, "answer");
  assert.equal(analysis.requiresIssue, false);
  assert.equal(analysis.workflowId, undefined);
  assert.equal(analysis.issuePlan, undefined);
  assert.equal(shouldCreateIssueForRequest("지금 시간이 몇 시야?"), false);
  assert.match(analysis.reason, /casual message or question/i);
});

test("request analysis routes a feature request to one workflow-backed issue", () => {
  const analysis = analyzeRequest("로그인 기능을 만들어줘");
  const questionText = analysis.clarificationQuestions.map((question) => question.question).join("\n");

  assert.equal(analysis.category, "single_development_task");
  assert.equal(analysis.intent, "feature");
  assert.equal(analysis.executionMode, "create_issue");
  assert.equal(analysis.issueCount, 1);
  assert.equal(analysis.safeToProceed, true);
  assert.equal(analysis.nextAction, "create_issue");
  assert.equal(analysis.requiresIssue, true);
  assert.equal(analysis.workflowId, "feature-development");
  assert.equal(deriveWorkflowIdForRequest("로그인 기능을 만들어줘"), "feature-development");
  assert.equal(deriveIssueTypeForRequest("로그인 기능을 만들어줘"), "feature");
  assert.equal(analysis.issuePlan?.primaryIssue.workflowId, "feature-development");
  assert.equal(analysis.issuePlan?.childIssues.length, 0);
  assert.equal(createIssueTitleFromRequest("로그인 기능을 만들어줘"), analysis.suggestedTitle);
  assert.ok(analysis.clarificationQuestions.length >= 5);
  assert.match(questionText, /feature goal and user flow/i);
  assert.match(questionText, /target files, modules, API routes, or UI surfaces/i);
  assert.match(questionText, /API or UI behavior, data model impact, validation rules, error handling, and security concerns/i);
  assert.match(questionText, /test expectations and acceptance criteria/i);
  assert.match(questionText, /remain out of scope, deferred, or explicitly accepted as follow-up work/i);
  assertClarificationOptions(analysis.clarificationQuestions);
});

test("request analysis exposes routing decision fields for a feature request", () => {
  const analysis = analyzeRequest("로그인 기능 만들어줘");

  assert.equal(analysis.intent, "feature");
  assert.equal(analysis.executionMode, "create_issue");
  assert.equal(analysis.issueCount, 1);
  assert.equal(analysis.confidence >= 0.6, true);
  assert.equal(analysis.safeToProceed, true);
  assert.equal(analysis.nextAction, "create_issue");
  assert.equal(analysis.requiresClarification, true);
});

test("request analysis routes performance improvement requests to the refactoring workflow", () => {
  const analysis = analyzeRequest("로그인 속도를 최적화해줘");

  assert.equal(analysis.category, "performance_improvement_task");
  assert.equal(analysis.intent, "performance_improvement");
  assert.equal(analysis.executionMode, "create_issue");
  assert.equal(analysis.workflowId, "refactoring");
  assert.equal(analysis.issueType, "refactor");
  assert.equal(analysis.safeToProceed, true);
  assert.equal(analysis.nextAction, "create_issue");
  assert.equal(analysis.requiresIssue, true);
  assert.equal(analysis.ruleChangeCandidate, false);
  assert.equal(analysis.requiresUserApproval, false);
  assert.equal(analysis.clarificationQuestions.length > 0, true);
  assert.match(analysis.reason, /performance improvement/i);
});

test("request analysis identifies rule change candidates and requires approval", () => {
  const analysis = analyzeRequest("React는 feature-based로 작성해");

  assert.equal(analysis.category, "rule_change_candidate");
  assert.equal(analysis.intent, "rule_update");
  assert.equal(analysis.executionMode, "request_rule_approval");
  assert.equal(analysis.issueCount, 0);
  assert.equal(analysis.safeToProceed, false);
  assert.equal(analysis.requiresIssue, false);
  assert.equal(analysis.nextAction, "request_rule_approval");
  assert.equal(analysis.ruleChangeCandidate, true);
  assert.equal(analysis.ruleChangeRuleId, "tech/react");
  assert.equal(analysis.requiresUserApproval, true);
  assert.equal(analysis.clarificationQuestions.length, 0);
  assert.match(analysis.existingRule ?? "", /feature/i);
  assert.match(analysis.proposedRule ?? "", /feature-based/i);
  assert.match(analysis.reason, /durable React convention/i);
});

test("request analysis derives readable issue slugs from request intent", () => {
  assert.equal(createIssueSlugFromRequest("회원가입 로그인 기능 만들어줘"), "signup-login");
  assert.equal(createIssueSlugFromRequest("커뮤니티 MVP 기획해줘"), "community-mvp-plan");
  assert.equal(createIssueSlugFromRequest("게시판 CRUD 만들어줘"), "board-crud");
  assert.equal(createIssueSlugFromRequest("이 PR 리뷰해줘"), "review-pr-branch");
  assert.equal(createIssueSlugFromRequest("고객 지원"), "고객-지원");
});

test("request analysis routes MVP planning requests to the MVP workflow", () => {
  const analysis = analyzeRequest("온보딩 MVP를 기획해줘");
  const questionText = analysis.clarificationQuestions.map((question) => question.question).join("\n");

  assert.equal(analysis.category, "mvp_or_product_planning");
  assert.equal(analysis.intent, "mvp_planning");
  assert.equal(analysis.executionMode, "plan_mvp");
  assert.equal(analysis.safeToProceed, false);
  assert.equal(analysis.requiresIssue, true);
  assert.equal(analysis.workflowId, "mvp-planning");
  assert.equal(analysis.issueType, "mvp");
  assert.equal(analysis.issuePlan?.primaryIssue.workflowId, "mvp-planning");
  assert.equal(analysis.issuePlan?.childIssues.length, 0);
  assert.match(analysis.reason, /MVP planning/i);
  assert.ok(analysis.clarificationQuestions.length >= 4);
  assert.match(questionText, /product topic, target users, and main problem/i);
  assert.match(questionText, /core features belong in v1, what user flow should they support, and what are the non-goals/i);
  assert.match(questionText, /language, framework, package manager, runtime\/version, database or storage, auth requirement, expected scale, and deployment target/i);
  assert.match(questionText, /What test strategy should prove the MVP is ready/i);
  assertClarificationOptions(analysis.clarificationQuestions);
});

test("request analysis decomposes broad product requests before implementation", () => {
  const analysis = analyzeRequest("전체 쇼핑몰 만들어줘");
  const questionText = analysis.clarificationQuestions.map((question) => question.question).join("\n");

  assert.equal(analysis.category, "multi_issue_project");
  assert.equal(analysis.intent, "project_decomposition");
  assert.equal(analysis.executionMode, "decompose_project");
  assert.equal(analysis.issueCount > 1, true);
  assert.equal(analysis.safeToProceed, false);
  assert.equal(analysis.requiresIssue, true);
  assert.equal(analysis.workflowId, "mvp-planning");
  assert.equal(analysis.issuePlan?.primaryIssue.workflowId, "mvp-planning");
  assert.equal(analysis.issuePlan?.primaryIssue.type, "planning");
  assert.ok((analysis.issuePlan?.childIssues.length ?? 0) > 0);
  assert.ok(analysis.issuePlan?.childIssues.every((child) => child.workflowId.length > 0));
  assert.ok(analysis.clarificationQuestions.length > 0);
  assert.ok(analysis.clarificationQuestions.some((question) => question.whatINeedFromYou.length > 0));
  assert.match(analysis.reason, /split into child issues|decompos/i);
  assert.match(questionText, /product topic, target users, and main problem/i);
});

test("request analysis routes review, bugfix, and refactor requests to matching workflows", () => {
  const reviewAnalysis = analyzeRequest("이 PR 리뷰해줘");
  const bugfixAnalysis = analyzeRequest("로그인 오류를 고쳐줘");
  const refactorAnalysis = analyzeRequest("UserService 리팩토링해줘");
  const refactorAnalysisVariant = analyzeRequest("이 코드를 리팩터링해줘");

  assert.equal(reviewAnalysis.category, "review_task");
  assert.equal(reviewAnalysis.executionMode, "run_review");
  assert.equal(reviewAnalysis.workflowId, "code-review");
  assert.equal(reviewAnalysis.issueType, "review");
  assert.equal(reviewAnalysis.safeToProceed, true);
  assert.equal(reviewAnalysis.nextAction, "run_review");
  assert.equal(reviewAnalysis.requiresClarification, false);
  assert.equal(reviewAnalysis.reviewTarget?.kind, "branch_or_pr");
  assert.match(reviewAnalysis.suggestedTitle, /^Review /);
  assert.equal(reviewAnalysis.intentSlug, "review-pr-branch");
  assert.equal(reviewAnalysis.clarificationQuestions.length, 0);

  assert.equal(bugfixAnalysis.category, "bugfix_task");
  assert.equal(bugfixAnalysis.executionMode, "create_issue");
  assert.equal(bugfixAnalysis.workflowId, "bug-fix");
  assert.equal(bugfixAnalysis.issueType, "bugfix");
  assert.ok(bugfixAnalysis.clarificationQuestions.length > 0);

  assert.equal(refactorAnalysis.category, "refactor_task");
  assert.equal(refactorAnalysis.intent, "refactor");
  assert.equal(refactorAnalysis.executionMode, "create_issue");
  assert.equal(refactorAnalysis.workflowId, "refactoring");
  assert.equal(refactorAnalysis.issueType, "refactor");
  assert.equal(refactorAnalysisVariant.category, "refactor_task");
  assert.equal(refactorAnalysisVariant.executionMode, "create_issue");
  assert.equal(refactorAnalysisVariant.workflowId, "refactoring");
  assert.equal(refactorAnalysisVariant.issueType, "refactor");
  assert.ok(refactorAnalysis.clarificationQuestions.length > 0);
  assert.ok(refactorAnalysisVariant.clarificationQuestions.length > 0);

  assertClarificationOptions(bugfixAnalysis.clarificationQuestions);
  assertClarificationOptions(refactorAnalysis.clarificationQuestions);
  assertClarificationOptions(refactorAnalysisVariant.clarificationQuestions);
});

test("request analysis detects concrete review targets for diff, staged, commit, file, issue, and branch targets", () => {
  const workingTreeAnalysis = analyzeRequest("현재 변경사항 리뷰해줘");
  const gitDiffAnalysis = analyzeRequest("git diff 리뷰해줘");
  const stagedAnalysis = analyzeRequest("staged diff 리뷰해줘");
  const gitCachedDiffAnalysis = analyzeRequest("git diff --cached 리뷰해줘");
  const lastCommitAnalysis = analyzeRequest("마지막 커밋 리뷰해줘");
  const specificFilesAnalysis = analyzeRequest("src/request-routing.ts 리뷰해줘");
  const activeIssueAnalysis = analyzeRequest("현재 이슈 변경사항 리뷰해줘");
  const branchAnalysis = analyzeRequest("이 브랜치 리뷰해줘");

  assert.equal(workingTreeAnalysis.reviewTarget?.kind, "working_tree");
  assert.equal(workingTreeAnalysis.safeToProceed, true);
  assert.equal(gitDiffAnalysis.reviewTarget?.kind, "working_tree");
  assert.equal(gitDiffAnalysis.safeToProceed, true);
  assert.equal(stagedAnalysis.reviewTarget?.kind, "staged_diff");
  assert.equal(stagedAnalysis.safeToProceed, true);
  assert.equal(gitCachedDiffAnalysis.reviewTarget?.kind, "staged_diff");
  assert.equal(gitCachedDiffAnalysis.safeToProceed, true);
  assert.equal(lastCommitAnalysis.reviewTarget?.kind, "last_commit");
  assert.equal(lastCommitAnalysis.safeToProceed, true);
  assert.equal(specificFilesAnalysis.reviewTarget?.kind, "specific_files");
  assert.deepEqual(specificFilesAnalysis.reviewTarget?.files, ["src/request-routing.ts"]);
  assert.equal(activeIssueAnalysis.reviewTarget?.kind, "active_issue");
  assert.equal(branchAnalysis.reviewTarget?.kind, "branch_or_pr");
  assert.equal(branchAnalysis.safeToProceed, true);
});

test("request analysis asks for clarification when the review target is missing", () => {
  const analysis = analyzeRequest("코드 리뷰해줘");
  const englishQuestionAnalysis = analyzeRequest("What should I review?");
  const clarificationText = analysis.clarificationQuestions
    .map((question) => [question.question, question.whatINeedFromYou].join("\n"))
    .join("\n");

  assert.equal(analysis.category, "review_task");
  assert.equal(analysis.executionMode, "run_review");
  assert.equal(analysis.workflowId, "code-review");
  assert.equal(analysis.issueType, "review");
  assert.equal(analysis.safeToProceed, false);
  assert.equal(analysis.nextAction, "clarify");
  assert.equal(analysis.requiresClarification, true);
  assert.equal(analysis.reviewTarget, undefined);
  assert.equal(createIssueSlugFromRequest("코드 리뷰해줘"), "review-request");
  assert.match(analysis.suggestedTitle, /^Review /);
  assert.match(clarificationText, /What should I review/i);
  assert.match(clarificationText, /current working tree/i);
  assert.match(clarificationText, /staged diff/i);
  assert.match(clarificationText, /last commit/i);
  assert.match(clarificationText, /PR\/branch/i);
  assertClarificationOptions(analysis.clarificationQuestions);

  assert.equal(englishQuestionAnalysis.category, "review_task");
  assert.equal(englishQuestionAnalysis.executionMode, "run_review");
  assert.equal(englishQuestionAnalysis.nextAction, "clarify");
  assert.equal(englishQuestionAnalysis.safeToProceed, false);
});

test("request analysis does not misroute generic improvement requests without a code target", () => {
  const analysis = analyzeRequest("개선해줘");

  assert.equal(analysis.executionMode, "unknown");
  assert.equal(analysis.intent, "unknown");
  assert.equal(analysis.issueCount, 0);
  assert.equal(analysis.requiresIssue, false);
  assert.equal(analysis.safeToProceed, false);
  assert.equal(analysis.nextAction, "clarify");
  assert.ok(analysis.confidence < 0.6);
});
