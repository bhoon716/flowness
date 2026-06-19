import type { IssuePlan, IssueType } from "./types.js";
import { toUpperSnake } from "./filesystem.js";

export type RequestCategory =
  | "casual_or_question"
  | "single_development_task"
  | "mvp_or_product_planning"
  | "multi_issue_project"
  | "review_task"
  | "bugfix_task"
  | "refactor_task";

export interface RequestIssuePlanBundle {
  readonly primaryIssue: IssuePlan;
  readonly childIssues: readonly IssuePlan[];
}

export interface RequestAnalysis {
  readonly request: string;
  readonly normalizedRequest: string;
  readonly category: RequestCategory;
  readonly requiresIssue: boolean;
  readonly issueType?: IssueType;
  readonly workflowId?: string;
  readonly suggestedTitle: string;
  readonly reason: string;
  readonly needsClarification: boolean;
  readonly clarificationQuestions: readonly string[];
  readonly issuePlan?: RequestIssuePlanBundle;
}

const casualMatchers: readonly RegExp[] = [
  /^(hi|hello|hey|thanks|thank you|thx|good morning|good afternoon|good evening)\b/i,
  /^(casual conversation|small talk)\b/i,
  /^(안녕|안녕하세요|안녕하십니까|고마워|감사합니다|감사해요|수고|수고하세요|반가워|반갑습니다)(?:\s|$|[!?.？])/i,
];

const questionMatchers: readonly RegExp[] = [
  /^(what is|what's|what are|how do|how does|how can|why is|why does|explain|tell me about|can you explain)\b/i,
  /^(무엇|뭐|어떻게|왜|어째서|설명해줘|알려줘|말해줘|보여줘|가능해|될까|되나요|해줄래)(?:\s|$|[!?.？])/i,
  /\?$/,
  /[?？]$/,
];

const reviewMatchers: readonly RegExp[] = [
  /\b(review|code review|pr|pull request|approve|inspect)\b/i,
  /(리뷰|검토|봐줘|확인해줘|살펴봐줘|점검해줘)/i,
];

const bugfixMatchers: readonly RegExp[] = [
  /\b(fix|bug|broken|error|failure|fails?|crash|regression|broken)\b/i,
  /(버그|오류|에러|고쳐줘|수정해줘|깨져|안 돼|안되|실패|충돌|크래시|회귀)/i,
];

const refactorMatchers: readonly RegExp[] = [
  /\b(refactor|cleanup|clean up|restructure|simplify|extract|split|migrate|rename)\b/i,
  /(리팩터링|정리해줘|구조 개선|분리해줘|단순화해줘|재구성해줘|리네임해줘|이관해줘)/i,
];

const productPlanningMatchers: readonly RegExp[] = [
  /\b(mvp|minimum viable product|product|roadmap|launch|prototype|discovery|strategy|go to market|gtm)\b/i,
  /(MVP|제품|프로덕트|로드맵|출시|런칭|기획|전략|프로토타입|검증)/i,
];

const singleTaskMatchers: readonly RegExp[] = [
  /\b(implement|build|add|create|make|ship|wire up|integrate|extend|update|modify|change|introduce|document|write|design|research|investigate|analyze|analyse)\b/i,
  /(만들어줘|구현해줘|추가해줘|작성해줘|적용해줘|연동해줘|통합해줘|개선해줘|변경해줘|수정해줘|반영해줘|문서화해줘|설계해줘|조사해줘|분석해줘)/i,
];

const multiIssueHints: readonly RegExp[] = [
  /(\n\s*[-*+]\s+)/,
  /(\n\s*\d+[.)]\s+)/,
  /;+/,
  /,.*,/,
  /\b(and|plus|then|also|along with|separately|multiple|several|split)\b/i,
  /(그리고|및|추가로|또는|별도로|여러|복수)/i,
];

function normalizeRequest(request: string): string {
  return request
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[`"'\-–—]+|[`"'\-–—]+$/g, "");
}

function matchesAny(value: string, matchers: readonly RegExp[]): boolean {
  return matchers.some((matcher) => matcher.test(value));
}

function isCasualOrQuestion(request: string): boolean {
  return matchesAny(request, casualMatchers) || matchesAny(request, questionMatchers);
}

function isReviewTask(request: string): boolean {
  return matchesAny(request, reviewMatchers);
}

function isBugfixTask(request: string): boolean {
  return matchesAny(request, bugfixMatchers);
}

function isRefactorTask(request: string): boolean {
  return matchesAny(request, refactorMatchers);
}

function isProductPlanningTask(request: string): boolean {
  return matchesAny(request, productPlanningMatchers);
}

function splitRequestSegments(request: string): readonly string[] {
  const segments = request
    .split(/(?:\n+|;|,|\bthen\b|\band then\b|\band\b|\bplus\b|\balong with\b|\bwith\b|\b및\b|\b그리고\b|\b추가로\b|\b별도로\b)/i)
    .map((segment) => segment.trim())
    .map((segment) => segment.replace(/^[\-*+\d.)\s]+/, ""))
    .map((segment) => segment.replace(/[.?!]+$/, ""))
    .filter((segment) => segment.length > 0);

  return Array.from(new Set(segments));
}

function isMultiIssueProject(request: string): boolean {
  if (matchesAny(request, multiIssueHints)) {
    return true;
  }

  const segments = splitRequestSegments(request);
  return segments.length >= 2;
}

function stripLeadingActionWords(value: string): string {
  return value
    .replace(/^(please\s+)?(can you\s+|could you\s+|would you\s+|will you\s+|do you mind\s+)?/i, "")
    .replace(/^(build|create|make|add|implement|ship|wire up|integrate|extend|update|modify|change|introduce|document|write|design|research|investigate|analyze|analyse|fix|refactor|split|decompose|plan|prepare|review|support|launch|release|set up|setup)\s+/i, "")
    .replace(/^(the|a|an)\s+/i, "");
}

function stripTrailingNoise(value: string): string {
  return value.replace(/\b(feature|task|project|work item|initiative|request)\b$/i, "").trim();
}

function toTitleCase(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toSuggestedTitle(request: string): string {
  const normalized = normalizeRequest(request);
  if (normalized.length === 0) {
    return "Request";
  }

  const [firstSegment = normalized] = splitRequestSegments(normalized);
  const cleaned = stripTrailingNoise(stripLeadingActionWords(firstSegment)).trim();
  if (cleaned.length === 0) {
    return "Request";
  }

  return toTitleCase(cleaned);
}

function toIssueSummary(request: string): string {
  const normalized = normalizeRequest(request);
  if (normalized.length === 0) {
    return "the request";
  }

  const segments = splitRequestSegments(normalized);
  if (segments.length <= 1) {
    return `the request "${normalized}"`;
  }

  return `the request "${segments.join(" / ")}"`;
}

function categoryToIssueType(category: RequestCategory, request: string): IssueType {
  switch (category) {
    case "casual_or_question":
      return "feature";
    case "review_task":
      return "feature";
    case "bugfix_task":
      return "bugfix";
    case "refactor_task":
      return "refactor";
    case "mvp_or_product_planning":
      return "mvp";
    case "multi_issue_project":
      return "planning";
    case "single_development_task":
      if (/\b(document|docs?|readme|documentation)\b/i.test(request) || /(문서|README|가이드|설명서)/i.test(request)) {
        return "documentation";
      }

      if (/\b(research|investigate|analysis|diagnose|compare|benchmark)\b/i.test(request) || /(조사|분석|진단|비교|벤치마크)/i.test(request)) {
        return /(?:investigate|diagnose|root cause|진단|원인)/i.test(request) ? "investigation" : "research";
      }

      return "feature";
  }
}

function categoryToWorkflowId(category: RequestCategory): string | undefined {
  switch (category) {
    case "casual_or_question":
      return undefined;
    case "single_development_task":
      return "feature-development";
    case "mvp_or_product_planning":
      return "mvp-planning";
    case "multi_issue_project":
      return "mvp-planning";
    case "review_task":
      return "code-review";
    case "bugfix_task":
      return "bug-fix";
    case "refactor_task":
      return "refactoring";
  }
}

function buildClarificationQuestions(category: RequestCategory, request: string): readonly string[] {
  switch (category) {
    case "casual_or_question":
      return [];
    case "single_development_task":
      return [
        "Who is the primary user or stakeholder?",
        "What should count as done?",
        "What constraints or deadlines matter?",
      ];
    case "mvp_or_product_planning":
      return [
        "Who are the target users?",
        "What problem are we solving?",
        "What is explicitly out of scope for the MVP?",
        "What risks, constraints, or deadlines should shape the plan?",
      ];
    case "multi_issue_project":
      return [
        "What are the separate deliverables we need to split out?",
        "Which item is highest priority?",
        "What dependencies or sequencing constraints matter?",
      ];
    case "review_task":
      return [
        "What change set or scope should be reviewed?",
        "What are the blocking versus non-blocking criteria?",
        "What evidence should the review focus on?",
      ];
    case "bugfix_task":
      return [
        "What is the expected behavior?",
        "How can the bug be reproduced?",
        "What environment or data makes the failure visible?",
      ];
    case "refactor_task":
      return [
        "Which code path or module should be refactored?",
        "What behavior must remain unchanged?",
        "What is the acceptable risk level for the refactor?",
      ];
  }
}

function buildEvidenceRequirements(category: RequestCategory): readonly string[] {
  switch (category) {
    case "casual_or_question":
      return [];
    case "mvp_or_product_planning":
      return [
        "Reviewed plan document",
        "Issue breakdown record",
      ];
    case "multi_issue_project":
      return [
        "Parent planning issue",
        "Child issue records",
        "Verification command output",
      ];
    case "review_task":
      return [
        "Review findings",
        "Annotated diff or issue log",
      ];
    case "bugfix_task":
      return [
        "Reproduction steps",
        "Fix validation output",
      ];
    case "refactor_task":
      return [
        "Before/after diff",
        "Validation output",
      ];
    case "single_development_task":
      return [
        "Implementation diff",
        "Verification output",
      ];
  }
}

function buildAcceptanceCriteria(category: RequestCategory, request: string, title: string): readonly string[] {
  switch (category) {
    case "casual_or_question":
      return [];
    case "mvp_or_product_planning":
      return [
        "Users, problem, goals, constraints, risks, MVP scope, non-goals, missing questions, and acceptance criteria are captured.",
        "The plan is reviewed before any development issues are generated.",
      ];
    case "multi_issue_project":
      return [
        "The request is decomposed into 1..N child issues.",
        "Each child issue has a title, type, workflow, goal, acceptance criteria, dependencies, and evidence requirements.",
      ];
    case "review_task":
      return [
        "The review scope is clearly defined.",
        "Blocking findings are recorded with evidence.",
      ];
    case "bugfix_task":
      return [
        "The bug is reproduced and explained.",
        "The fix is validated with evidence.",
      ];
    case "refactor_task":
      return [
        "The targeted code path is simplified.",
        "Behavior remains stable after the refactor.",
      ];
    case "single_development_task":
      return [
        `The requested change for "${title}" is implemented.`,
        "Verification evidence is recorded.",
      ];
  }
}

function buildIssueGoal(category: RequestCategory, request: string, title: string): string {
  const summary = toIssueSummary(request);

  switch (category) {
    case "casual_or_question":
      return "";
    case "mvp_or_product_planning":
      return `Create a reviewed MVP plan for ${summary}.`;
    case "multi_issue_project":
      return `Clarify and break down ${summary} into executable child issues.`;
    case "review_task":
      return `Review ${summary} and record the findings.`;
    case "bugfix_task":
      return `Fix ${summary} and verify the regression is closed.`;
    case "refactor_task":
      return `Refactor ${summary} without changing behavior.`;
    case "single_development_task":
      return `Deliver ${summary} as a single workflow-backed task.`;
  }
}

function inferRequestSegmentIssueType(segment: string): IssueType {
  if (/\b(review|code review|pr|pull request)\b/i.test(segment) || /(리뷰|검토|점검)/i.test(segment)) {
    return "feature";
  }

  if (/\b(fix|bug|broken|error|failure|crash|regression)\b/i.test(segment) || /(버그|오류|에러|고쳐|수정|깨져|회귀)/i.test(segment)) {
    return "bugfix";
  }

  if (/\b(refactor|cleanup|restructure|simplify|extract|split|migrate|rename)\b/i.test(segment) || /(리팩터링|정리|분리|단순화|재구성|이관)/i.test(segment)) {
    return "refactor";
  }

  if (/\b(document|docs?|readme|documentation)\b/i.test(segment) || /(문서|README|가이드|설명서)/i.test(segment)) {
    return "documentation";
  }

  if (/\b(research|investigate|analysis|benchmark|compare|diagnose|trace|root cause)\b/i.test(segment) || /(조사|분석|비교|진단|원인)/i.test(segment)) {
    return /(?:investigate|diagnose|root cause|원인|진단)/i.test(segment) ? "investigation" : "research";
  }

  return "feature";
}

function buildIssuePlan(
  category: RequestCategory,
  request: string,
  title: string,
): RequestIssuePlanBundle | undefined {
  if (category === "casual_or_question") {
    return undefined;
  }

  const evidenceRequired = buildEvidenceRequirements(category);
  const acceptanceCriteria = buildAcceptanceCriteria(category, request, title);
  const goal = buildIssueGoal(category, request, title);

  const primaryIssueType = categoryToIssueType(category, request);
  const primaryWorkflowId = categoryToWorkflowId(category);
  if (primaryWorkflowId === undefined) {
    return undefined;
  }

  const primaryIssue: IssuePlan = {
    title,
    type: primaryIssueType,
    workflowId: primaryWorkflowId,
    goal,
    acceptanceCriteria,
    dependencies: [],
    evidenceRequired,
  };

  if (category !== "multi_issue_project" && category !== "mvp_or_product_planning") {
    return {
      primaryIssue,
      childIssues: [],
    };
  }

  if (category === "mvp_or_product_planning") {
    return {
      primaryIssue,
      childIssues: [],
    };
  }

  const childSegments = splitRequestSegments(request);
  const childIssues = childSegments.length > 1
    ? childSegments.map((segment, index) => {
      const childTitle = toSuggestedTitle(segment);
      const childType = inferRequestSegmentIssueType(segment);
      return {
        title: childTitle,
        type: childType,
        workflowId: categoryToWorkflowId(
          childType === "bugfix"
            ? "bugfix_task"
            : childType === "refactor"
              ? "refactor_task"
              : "single_development_task",
        ) ?? "feature-development",
        goal: childType === "bugfix"
          ? `Fix ${toIssueSummary(segment)}.`
          : childType === "refactor"
            ? `Refactor ${toIssueSummary(segment)}.`
            : childType === "documentation"
              ? `Document ${toIssueSummary(segment)}.`
              : childType === "research" || childType === "investigation"
                ? `Research ${toIssueSummary(segment)}.`
                : `Deliver ${toIssueSummary(segment)}.`,
        acceptanceCriteria: [
          `${childTitle} is clearly scoped.`,
          "The work is backed by evidence.",
        ],
        dependencies: index === 0 ? [] : [toSuggestedTitle(childSegments[index - 1] ?? title)],
        evidenceRequired: [
          "Implementation evidence",
          "Verification output",
        ],
      } satisfies IssuePlan;
    })
    : [];

  const planningIssue: IssuePlan = {
    ...primaryIssue,
    title: `Project Plan: ${title}`,
    type: "planning",
    workflowId: "mvp-planning",
    goal: `Clarify and split ${toIssueSummary(request)} into child issues.`,
    acceptanceCriteria: [
      "The request is broken into ordered child issues.",
      "Each child issue includes goal, acceptance criteria, dependencies, and evidence requirements.",
    ],
    dependencies: [],
    evidenceRequired,
  };

  return {
    primaryIssue: planningIssue,
    childIssues,
  };
}

export function analyzeRequest(request: string): RequestAnalysis {
  const normalizedRequest = normalizeRequest(request);
  const suggestedTitle = toSuggestedTitle(normalizedRequest);

  if (normalizedRequest.length === 0 || isCasualOrQuestion(normalizedRequest)) {
    return {
      request: normalizedRequest,
      normalizedRequest,
      category: "casual_or_question",
      requiresIssue: false,
      suggestedTitle,
      reason: "This is a casual message or question that does not need an issue.",
      needsClarification: false,
      clarificationQuestions: [],
    };
  }

  let category: RequestCategory = "single_development_task";
  if (isReviewTask(normalizedRequest)) {
    category = "review_task";
  } else if (isBugfixTask(normalizedRequest)) {
    category = "bugfix_task";
  } else if (isRefactorTask(normalizedRequest)) {
    category = "refactor_task";
  } else if (isProductPlanningTask(normalizedRequest)) {
    category = "mvp_or_product_planning";
  } else if (isMultiIssueProject(normalizedRequest)) {
    category = "multi_issue_project";
  }

  const issueType = categoryToIssueType(category, normalizedRequest);
  const workflowId = categoryToWorkflowId(category);
  const issuePlan = buildIssuePlan(category, normalizedRequest, suggestedTitle);

  const reasonByCategory: Record<Exclude<RequestCategory, "casual_or_question">, string> = {
    single_development_task: "This is a single development task that should be routed to one workflow.",
    mvp_or_product_planning: "This request is product/MVP planning and should use the MVP planning workflow.",
    multi_issue_project: "This request spans multiple deliverables and should be split into child issues.",
    review_task: "This is a review request and should be routed through the review workflow.",
    bugfix_task: "This is a bug fix request and should be routed through the bug fix workflow.",
    refactor_task: "This is a refactor request and should be routed through the refactoring workflow.",
  };

  const actionableCategory = category as Exclude<RequestCategory, "casual_or_question">;

  return {
    request: normalizedRequest,
    normalizedRequest,
    category,
    requiresIssue: true,
    issueType,
    ...(workflowId === undefined ? {} : { workflowId }),
    suggestedTitle,
    reason: reasonByCategory[actionableCategory],
    needsClarification: true,
    clarificationQuestions: buildClarificationQuestions(category, normalizedRequest),
    ...(issuePlan === undefined ? {} : { issuePlan }),
  };
}

export function classifyRequest(request: string): RequestAnalysis {
  return analyzeRequest(request);
}

export function isLikelyNaturalLanguageRequest(request: string): boolean {
  const normalized = normalizeRequest(request);
  if (normalized.length === 0) {
    return false;
  }

  return isCasualOrQuestion(normalized)
    || isReviewTask(normalized)
    || isBugfixTask(normalized)
    || isRefactorTask(normalized)
    || isProductPlanningTask(normalized)
    || isMultiIssueProject(normalized)
    || matchesAny(normalized, singleTaskMatchers)
    || normalized.includes(" ");
}

export function shouldCreateIssueForRequest(request: string): boolean {
  return classifyRequest(request).requiresIssue;
}

export function deriveIssueTypeForRequest(request: string): IssueType | undefined {
  const analysis = classifyRequest(request);
  return analysis.requiresIssue ? analysis.issueType : undefined;
}

export function deriveWorkflowIdForRequest(request: string): string | undefined {
  const analysis = classifyRequest(request);
  return analysis.requiresIssue ? analysis.workflowId : undefined;
}

export function createIssueSlugFromRequest(request: string): string {
  return toUpperSnake(createIssueTitleFromRequest(request));
}

export function createIssueTitleFromRequest(request: string): string {
  return analyzeRequest(request).suggestedTitle;
}
