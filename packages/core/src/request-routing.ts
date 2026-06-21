import type { IssuePlan, IssueType } from "./types.js";
import { slugifyReadable } from "./filesystem.js";

export type RequestCategory =
  | "casual_or_question"
  | "single_development_task"
  | "mvp_or_product_planning"
  | "multi_issue_project"
  | "review_task"
  | "bugfix_task"
  | "refactor_task"
  | "performance_improvement_task"
  | "rule_change_candidate";

export type RequestExecutionMode =
  | "answer"
  | "create_issue"
  | "plan_mvp"
  | "decompose_project"
  | "update_rule"
  | "request_rule_approval"
  | "run_review"
  | "unknown";

export type RequestIntent =
  | "answer"
  | "feature"
  | "mvp_planning"
  | "project_decomposition"
  | "review"
  | "bugfix"
  | "refactor"
  | "performance_improvement"
  | "rule_update"
  | "unknown";

export type ReviewTargetKind =
  | "working_tree"
  | "staged_diff"
  | "last_commit"
  | "specific_files"
  | "active_issue"
  | "branch_or_pr";

export interface ReviewTargetSummary {
  readonly kind: ReviewTargetKind;
  readonly label: string;
  readonly slug: string;
  readonly files: readonly string[];
}

interface RuleChangeSuggestion {
  readonly ruleId: string;
  readonly existingRule: string;
  readonly proposedRule: string;
  readonly reason: string;
}

export interface RequestIssuePlanBundle {
  readonly primaryIssue: IssuePlan;
  readonly childIssues: readonly IssuePlan[];
}

export interface ClarificationQuestionOption {
  readonly label: string;
  readonly summary: string;
  readonly pros: readonly string[];
  readonly cons: readonly string[];
}

export interface ClarificationQuestion {
  readonly question: string;
  readonly options: readonly ClarificationQuestionOption[];
  readonly recommendedDefault: string;
  readonly whatINeedFromYou: string;
}

export interface RequestAnalysis {
  readonly request: string;
  readonly normalizedRequest: string;
  readonly category: RequestCategory;
  readonly intent: RequestIntent;
  readonly executionMode: RequestExecutionMode;
  readonly issueCount: number;
  readonly confidence: number;
  readonly safeToProceed: boolean;
  readonly nextAction: string;
  readonly requiresClarification: boolean;
  readonly requiresIssue: boolean;
  readonly issueType?: IssueType;
  readonly workflowId?: string;
  readonly suggestedTitle: string;
  readonly intentSlug: string;
  readonly reviewTarget?: ReviewTargetSummary;
  readonly reason: string;
  readonly needsClarification: boolean;
  readonly clarificationQuestions: readonly ClarificationQuestion[];
  readonly issuePlan?: RequestIssuePlanBundle;
  readonly ruleChangeCandidate: boolean;
  readonly ruleChangeRuleId?: string;
  readonly existingRule?: string;
  readonly proposedRule?: string;
  readonly requiresUserApproval: boolean;
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
  /\b(review|code review|pr|pull request|approve|inspect|diff|patch|changes?|working tree|staged|commit|branch)\b/i,
  /(리뷰|검토|봐줘|확인해줘|살펴봐줘|점검해줘|변경사항|변경분|차이|패치|브랜치|커밋)/i,
];

const reviewWorkingTreeMatchers: readonly RegExp[] = [
  /\b(git\s+diff|git\s+show\s+--stat)\b/i,
  /\b(current changes?|working tree|current diff|diff|patch|changes?)\b/i,
  /(현재\s*변경사항|현재\s*변경분|작업\s*트리|작업트리|변경사항|변경분|차이)/i,
];

const reviewStagedMatchers: readonly RegExp[] = [
  /\b(git\s+diff\s+--cached|git\s+diff\s+--staged|cached\s+diff|staged\s+diff)\b/i,
  /\b(staged|staging|index)\b/i,
  /(스테이징|스테이징된|staged\s*diff|스테이지)/i,
];

const reviewLastCommitMatchers: readonly RegExp[] = [
  /\b(last commit|latest commit|previous commit|head~1|head)\b/i,
  /(마지막\s*커밋|최근\s*커밋|직전\s*커밋|방금\s*커밋)/i,
];

const reviewActiveIssueMatchers: readonly RegExp[] = [
  /\b(active issue|current issue|issue changes?)\b/i,
  /(활성\s*이슈|현재\s*이슈|이슈\s*변경|이슈\s*변경분)/i,
];

const reviewBranchMatchers: readonly RegExp[] = [
  /\b(pull request|pr|branch)\b/i,
  /(풀\s*리퀘스트|풀리퀘스트|브랜치|브렌치|PR)/i,
];

const reviewClarificationMatcher = /(what should i review|review target|무엇을\s*리뷰|무엇을\s*검토|뭘\s*리뷰|뭘\s*검토|어떤\s*변경|무슨\s*변경)/i;

const bugfixMatchers: readonly RegExp[] = [
  /\b(fix|bug|broken|error|failure|fails?|crash|regression|broken)\b/i,
  /(버그|오류|에러|고쳐줘|수정해줘|깨져|안 돼|안되|실패|충돌|크래시|회귀)/i,
];

const explicitRefactorMatchers: readonly RegExp[] = [
  /\b(refactor|refactoring|cleanup|clean up|restructure|simplify|extract|split|migrate|rename)\b/i,
  /(리팩터링|리팩토링|코드 정리|구조 개선|구조 재정리|분리해줘|단순화해줘|재구성해줘|리네임해줘|이관해줘)/i,
];

const genericImprovementMatchers: readonly RegExp[] = [
  /\b(improve|improvement|enhance|polish|tighten|streamline)\b/i,
  /(개선해줘|개선|다듬어줘|향상해줘)/i,
];

const performanceImprovementMatchers: readonly RegExp[] = [
  /\b(performance|benchmark|latency|throughput|optimi[sz]e|speed|slow|faster|memory|cpu|profiling|bottleneck)\b/i,
  /(성능|벤치마크|지연|레이턴시|처리량|최적화|속도|느리|메모리|CPU|프로파일링|병목|전후 비교|기준선|베이스라인)/i,
];

const ruleChangeContextMatchers: readonly RegExp[] = [
  /\b(always|never|must|should|prefer|default|policy|rule|guideline|standard|convention|style|pattern|keep|use|avoid|from now on|going forward|do not|don't)\b/i,
  /(앞으로|항상|절대|반드시|정책|규칙|가이드|관례|표준|기본적으로|선호|유지|피하고|하지 마|해야|하자|하도록)/i,
  /\b(feature[-\s]?based|feature[-\s]?slice|feature[-\s]?first|feature[-\s]?driven|component[-\s]?based|app router|server component|server action|strict typing|type safety|baseline|before\s*\/\s*after|before and after|compare(?:ison)?|measurement?|measure(?:ment)?|test first|security first)\b/i,
];

interface RuleChangePatternSpec extends RuleChangeSuggestion {
  readonly patterns: readonly RegExp[];
}

const ruleChangePatternSpecs: readonly RuleChangePatternSpec[] = [
  {
    ruleId: "performance-improvement",
    existingRule: "Performance improvements should capture a baseline, a follow-up measurement, and the comparison between them.",
    proposedRule: "When a task asks for a performance improvement, record the baseline first, measure the change after the fix, compare before and after, and note any measurement limitations.",
    reason: "The request changes the durable performance workflow instead of asking for one isolated optimization.",
    patterns: [
      /\b(performance|benchmark|latency|throughput|optimi[sz]e|speed|slow|faster|memory|cpu|profiling|bottleneck)\b/i,
      /(성능|벤치마크|지연|레이턴시|처리량|최적화|속도|느리|메모리|CPU|프로파일링|병목|전후 비교|기준선|베이스라인)/i,
      /(baseline|before\s*\/\s*after|before and after|measure(?:ment)?|comparison|compare)/i,
    ],
  },
  {
    ruleId: "evidence-policy",
    existingRule: "Evidence rules should keep proof concrete and append-only.",
    proposedRule: "When the request changes how work is proven, capture the exact commands or artifacts, keep the evidence concise, and record limitations clearly.",
    reason: "The request is about verification discipline rather than a one-off task.",
    patterns: [
      /\b(evidence|proof|verify|verification|test result|baseline|comparison|before\s*\/\s*after)\b/i,
      /(증거|검증|결과|기준선|전후 비교|비교 결과)/i,
    ],
  },
  {
    ruleId: "clarification-policy",
    existingRule: "Clarification rules define when to ask for missing details before starting work.",
    proposedRule: "Ask only for the missing information that blocks progress, and keep clarification questions focused on the decision points.",
    reason: "The request changes when the agent should ask questions before moving forward.",
    patterns: [
      /\b(clarify|clarification|question|questions|ask|missing details|more detail)\b/i,
      /(질문|확인|명확|명확화|물어봐|추가 정보)/i,
    ],
  },
  {
    ruleId: "request-analysis",
    existingRule: "Request analysis should classify the request before it turns into work.",
    proposedRule: "Classify requests before creating issues, and only create or update durable rules when the request clearly changes future behavior.",
    reason: "The request changes request-routing behavior rather than one piece of work.",
    patterns: [
      /\b(request analysis|issue routing|workflow routing|classify|classification|request create|issue create)\b/i,
      /(요청\s*분석|이슈\s*생성|워크플로우\s*분류|분류|라우팅)/i,
    ],
  },
  {
    ruleId: "commit-policy",
    existingRule: "Commit policy should keep commits explicit, approved, and evidence-backed.",
    proposedRule: "Stage only the intended files, require approval before commit, and keep the commit gate tied to the evidence review.",
    reason: "The request changes a durable commit rule rather than the current task.",
    patterns: [
      /\b(commit|git add|stage|push|rebase|merge|worktree)\b/i,
      /(커밋|스테이징|푸시|리베이스|머지|워크트리)/i,
    ],
  },
  {
    ruleId: "tech/react",
    existingRule: "React guidance keeps components small, feature-focused, and easy to test.",
    proposedRule: "Keep React work feature-based, localize state, and prefer small components and hooks that follow the project slice.",
    reason: "The request changes a durable React convention.",
    patterns: [
      /\b(react|feature-based|feature slice|component-based|hooks?)\b/i,
      /(React|feature-based|feature slice|컴포넌트|훅)/i,
    ],
  },
  {
    ruleId: "tech/nextjs",
    existingRule: "Next.js guidance prefers the App Router, server components, and explicit client boundaries.",
    proposedRule: "Keep Next.js work aligned to the App Router and use server components or client boundaries intentionally.",
    reason: "The request changes a durable Next.js convention.",
    patterns: [
      /\b(next\.?js|app router|server component|server action)\b/i,
      /(Next\.?js|앱\s*라우터|서버\s*컴포넌트|서버\s*액션)/i,
    ],
  },
  {
    ruleId: "tech/typescript",
    existingRule: "TypeScript guidance treats types as boundary protection, not as decoration.",
    proposedRule: "Use TypeScript types to clarify boundaries and keep the project strict enough to catch regressions early.",
    reason: "The request changes a durable TypeScript convention.",
    patterns: [
      /\b(typescript|strict typing|type safety|satisfies)\b/i,
      /(타입스크립트|엄격한\s*타이핑|타입\s*안전)/i,
    ],
  },
  {
    ruleId: "project-overrides",
    existingRule: "Project overrides capture durable exceptions that are stronger than the defaults.",
    proposedRule: "If the project needs a future-facing exception, record it in project-overrides instead of a one-off note.",
    reason: "The request sets a project-wide exception or convention.",
    patterns: [
      /(always|never|from now on|going forward|앞으로|항상|매번|절대|기본적으로|규칙|policy|rule)/i,
    ],
  },
];

const codeTargetMatchers: readonly RegExp[] = [
  /\b(service|controller|module|component|class|code|structure|api|route|page|screen|hook|function|method|model|view)\b/i,
  /(서비스|컨트롤러|모듈|컴포넌트|클래스|코드|구조|API|라우트|엔드포인트|페이지|화면|훅|함수|메서드|모델|뷰)/i,
];

const productPlanningMatchers: readonly RegExp[] = [
  /\b(mvp|minimum viable product|product|roadmap|launch|prototype|discovery|strategy|go to market|gtm)\b/i,
  /(MVP|제품|프로덕트|로드맵|출시|런칭|기획|전략|프로토타입|검증)/i,
];

const singleTaskMatchers: readonly RegExp[] = [
  /\b(implement|build|add|create|make|ship|wire up|integrate|extend|update|modify|change|introduce|document|write|design|research|investigate|analyze|analyse)\b/i,
  /(만들어줘|구현해줘|추가해줘|작성해줘|적용해줘|연동해줘|통합해줘|변경해줘|수정해줘|반영해줘|문서화해줘|설계해줘|조사해줘|분석해줘)/i,
];

const broadProductMatchers: readonly RegExp[] = [
  /(전체\s*)?(쇼핑몰|커뮤니티|예약\s*서비스|관리자\s*백오피스|SNS\s*앱|앱|사이트|서비스|플랫폼|시스템|포털|이커머스|커머스|마켓플레이스)/i,
  /(전체\s*|end[-\s]?to[-\s]?end|from scratch|처음부터|통째로|전부|완전한|풀스택|full[-\s]?stack)/i,
];

const broadProductScopeMatchers: readonly RegExp[] = [
  /(전체|모든|end[-\s]?to[-\s]?end|from scratch|처음부터|통째로|전부|완전한|full[-\s]?stack|all[-\s]?in[-\s]?one)/i,
];

const broadProductDomainMatchers: readonly RegExp[] = [
  /\b(쇼핑몰|커뮤니티|예약\s*서비스|관리자\s*백오피스|SNS\s*앱|이커머스|커머스|마켓플레이스|포털)\b/i,
  /(쇼핑몰|커뮤니티|예약\s*서비스|관리자\s*백오피스|SNS\s*앱|이커머스|커머스|마켓플레이스|포털)/i,
];

const broadProductActionMatchers: readonly RegExp[] = [
  /\b(build|create|make|add|implement|ship|wire up|integrate|extend|launch|release|develop|plan)\b/i,
  /(만들어줘|구현해줘|추가해줘|개발해줘|기획해줘|설계해줘|구축해줘)/i,
];

const featureTargetMatchers: readonly RegExp[] = [
  /\b(feature|feature request|functionality|page|screen|view|flow|ui|ux|api|endpoint|route|module|component|service|controller|class|hook|function|method|model|query|table|form|button|modal|search|profile|notification|payment|checkout|cart|login|signin|signup|comment|post|reservation|booking|dashboard|admin|document|docs?|readme|guide|spec|test|verification)\b/i,
  /(기능|페이지|화면|뷰|플로우|UI|UX|API|엔드포인트|라우트|모듈|컴포넌트|서비스|컨트롤러|클래스|훅|함수|메서드|모델|쿼리|테이블|폼|버튼|모달|검색|프로필|알림|결제|체크아웃|장바구니|로그인|회원가입|댓글|게시글|예약|대시보드|관리자|문서|가이드|명세|테스트|검증)/i,
];

const multiIssueHints: readonly RegExp[] = [
  /(\n\s*[-*+]\s+)/,
  /(\n\s*\d+[.)]\s+)/,
  /;+/,
  /,.*,/,
  /\b(and|plus|then|also|along with|separately|multiple|several|split)\b/i,
  /(그리고|및|추가로|또는|별도로|여러|복수)/i,
];

interface IntentSlugRule {
  readonly slug: string;
  readonly patterns: readonly RegExp[];
}

const intentSlugRules: readonly IntentSlugRule[] = [
  {
    slug: "community",
    patterns: [
      /커뮤니티/i,
      /\bcommunity\b/i,
    ],
  },
  {
    slug: "signup",
    patterns: [
      /회원가입/i,
      /\bsign(?:[-\s]?up)?\b/i,
      /\bregister(?:ation)?\b/i,
    ],
  },
  {
    slug: "login",
    patterns: [
      /로그인/i,
      /\blog(?:[-\s]?in)?\b/i,
      /\bsign(?:[-\s]?in)\b/i,
      /\bauth(?:entication)?\b/i,
    ],
  },
  {
    slug: "board",
    patterns: [
      /게시판/i,
      /\bboard\b/i,
      /\bforum\b/i,
    ],
  },
  {
    slug: "crud",
    patterns: [
      /\bcrud\b/i,
    ],
  },
  {
    slug: "mvp",
    patterns: [
      /\bmvp\b/i,
      /minimum viable product/i,
    ],
  },
  {
    slug: "plan",
    patterns: [
      /기획/i,
      /\bplan(?:ning)?\b/i,
      /\broadmap\b/i,
      /\bstrategy\b/i,
    ],
  },
  {
    slug: "onboarding",
    patterns: [
      /온보딩/i,
      /\bonboarding\b/i,
    ],
  },
  {
    slug: "search",
    patterns: [
      /검색/i,
      /\bsearch\b/i,
    ],
  },
  {
    slug: "profile",
    patterns: [
      /프로필/i,
      /\bprofile\b/i,
    ],
  },
  {
    slug: "payment",
    patterns: [
      /결제/i,
      /\bpayment\b/i,
      /\bcheckout\b/i,
    ],
  },
  {
    slug: "notification",
    patterns: [
      /알림/i,
      /\bnotification\b/i,
    ],
  },
  {
    slug: "password-reset",
    patterns: [
      /비밀번호\s*재설정/i,
      /\bpassword reset\b/i,
      /\breset password\b/i,
    ],
  },
  {
    slug: "dashboard",
    patterns: [
      /대시보드/i,
      /\bdashboard\b/i,
    ],
  },
  {
    slug: "api",
    patterns: [
      /\bapi\b/i,
    ],
  },
  {
    slug: "ui",
    patterns: [
      /\bui\b/i,
      /\bux\b/i,
    ],
  },
];

function extractReviewFilePaths(request: string): readonly string[] {
  const candidates = request.match(/(?:[\w.-]+\/)*[\w.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|rb|go|java|kt|sh|sql|json|yaml|yml|md)/gi) ?? [];
  return Array.from(new Set(candidates.map((candidate) => candidate.replace(/[),.;:!?]+$/g, ""))));
}

function detectReviewTarget(request: string): ReviewTargetSummary | null {
  const normalized = normalizeRequest(request);
  const filePaths = extractReviewFilePaths(normalized);

  if (matchesAny(normalized, reviewStagedMatchers)) {
    return {
      kind: "staged_diff",
      label: "Staged Diff",
      slug: "staged-diff",
      files: filePaths,
    };
  }

  if (matchesAny(normalized, reviewActiveIssueMatchers)) {
    return {
      kind: "active_issue",
      label: "Active Issue Changes",
      slug: "active-issue",
      files: filePaths,
    };
  }

  if (matchesAny(normalized, reviewWorkingTreeMatchers)) {
    return {
      kind: "working_tree",
      label: "Current Working Tree",
      slug: "current-working-tree",
      files: filePaths,
    };
  }

  if (matchesAny(normalized, reviewLastCommitMatchers)) {
    return {
      kind: "last_commit",
      label: "Last Commit",
      slug: "last-commit",
      files: filePaths,
    };
  }

  if (filePaths.length > 0) {
    return {
      kind: "specific_files",
      label: filePaths.length === 1 ? filePaths[0]! : "Specific Files",
      slug: "specific-files",
      files: filePaths,
    };
  }

  if (matchesAny(normalized, reviewBranchMatchers)) {
    return {
      kind: "branch_or_pr",
      label: "PR or Branch",
      slug: "pr-branch",
      files: filePaths,
    };
  }

  return null;
}

function detectRuleChangeSuggestion(request: string): RuleChangeSuggestion | null {
  const normalized = normalizeRequest(request);
  if (normalized.length === 0) {
    return null;
  }

  if (!matchesAny(normalized, ruleChangeContextMatchers)) {
    return null;
  }

  const candidates = ruleChangePatternSpecs
    .map((spec, order) => ({
      spec,
      order,
      score: spec.patterns.reduce((accumulator, pattern) => accumulator + (pattern.test(normalized) ? 1 : 0), 0),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }

      return left.order - right.order;
    });

  const best = candidates[0];
  if (best === undefined) {
    return null;
  }

  return {
    ruleId: best.spec.ruleId,
    existingRule: best.spec.existingRule,
    proposedRule: best.spec.proposedRule,
    reason: best.spec.reason,
  };
}

function isPerformanceImprovementTask(request: string): boolean {
  return matchesAny(request, performanceImprovementMatchers);
}

function buildReviewTargetClarificationQuestions(request: string): readonly ClarificationQuestion[] {
  const summary = toIssueSummary(request);
  return [
    makeClarificationQuestion({
      question: `What should I review for ${summary}?`,
      options: [
        makeClarificationOption(
          "Option A",
          "The current working tree or uncommitted changes.",
          [
            "Best for reviewing the latest local edits.",
            "Matches the user's current workspace state.",
          ],
          [
            "Needs a local git checkout to be useful.",
            "Can include unrelated changes if the tree is noisy.",
          ],
        ),
        makeClarificationOption(
          "Option B",
          "The staged diff ready for commit.",
          [
            "Best when the exact commit set matters.",
            "Keeps the review surface small.",
          ],
          [
            "Misses unstaged work.",
            "Needs the right files to be staged first.",
          ],
        ),
        makeClarificationOption(
          "Option C",
          "The last commit or a specific branch / PR.",
          [
            "Useful when the review should match a known reference point.",
            "Works well for shareable review targets.",
          ],
          [
            "Can be ambiguous without a branch or commit id.",
            "May need extra clarification if the target is remote.",
          ],
        ),
      ],
      recommendedDefault: "Option A",
      whatINeedFromYou: "Tell me whether I should review the current working tree, the staged diff, a last commit, specific files, the active issue changes, or a PR/branch.",
    }),
  ];
}

function buildReviewIssueTitle(target: ReviewTargetSummary | null, request: string): string {
  if (target !== null) {
    return `Review ${target.label}`;
  }

  const normalized = normalizeRequest(request);
  const cleaned = stripTrailingNoise(stripIntentNoise(normalized));
  return `Review ${cleaned.length === 0 ? "Request" : toTitleCase(cleaned)}`;
}

function buildReviewIntentSlug(target: ReviewTargetSummary | null): string {
  if (target !== null) {
    return `review-${target.slug}`;
  }

  return "review-request";
}

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
  if (reviewClarificationMatcher.test(request)) {
    return false;
  }

  return matchesAny(request, casualMatchers) || matchesAny(request, questionMatchers);
}

function isReviewTask(request: string): boolean {
  return matchesAny(request, reviewMatchers);
}

function isBugfixTask(request: string): boolean {
  return matchesAny(request, bugfixMatchers);
}

function hasCodeTarget(request: string): boolean {
  return matchesAny(request, codeTargetMatchers);
}

function hasFeatureTarget(request: string): boolean {
  return matchesAny(request, featureTargetMatchers);
}

function isRefactorTask(request: string): boolean {
  if (matchesAny(request, explicitRefactorMatchers)) {
    return true;
  }

  return matchesAny(request, genericImprovementMatchers) && hasCodeTarget(request);
}

function isProductPlanningTask(request: string): boolean {
  return matchesAny(request, productPlanningMatchers);
}

function isBroadProductRequest(request: string): boolean {
  if (!matchesAny(request, broadProductDomainMatchers)) {
    return false;
  }

  return matchesAny(request, broadProductActionMatchers) || matchesAny(request, broadProductScopeMatchers);
}

function isGenericImprovementWithoutCodeTarget(request: string): boolean {
  return matchesAny(request, genericImprovementMatchers) && !hasCodeTarget(request);
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

interface DecompositionTemplateChild {
  readonly title: string;
  readonly goal: string;
  readonly acceptanceCriteria: readonly string[];
  readonly evidenceRequired?: readonly string[];
}

interface DecompositionTemplate {
  readonly name: string;
  readonly patterns: readonly RegExp[];
  readonly childIssues: readonly DecompositionTemplateChild[];
}

const broadProductDecompositionTemplates: readonly DecompositionTemplate[] = [
  {
    name: "shopping-mall",
    patterns: [
      /쇼핑몰/i,
      /이커머스/i,
      /커머스/i,
      /마켓플레이스/i,
    ],
    childIssues: [
      {
        title: "Catalog and discovery",
        goal: "Design and implement the product catalog, browsing, and search slice.",
        acceptanceCriteria: [
          "Product browsing and discovery are scoped.",
          "The slice has clear entry points and evidence requirements.",
        ],
      },
      {
        title: "Cart and checkout",
        goal: "Design and implement the cart, checkout, and payment flow slice.",
        acceptanceCriteria: [
          "Cart and checkout boundaries are explicit.",
          "The flow has validation and verification steps.",
        ],
      },
      {
        title: "Orders and account",
        goal: "Design and implement order history, account, and customer management.",
        acceptanceCriteria: [
          "Order and account behavior is scoped.",
          "The slice has a clear data and state model.",
        ],
      },
      {
        title: "Admin operations",
        goal: "Design and implement admin backoffice and operational controls.",
        acceptanceCriteria: [
          "Admin workflows are separated from customer flows.",
          "Operational tasks have explicit evidence requirements.",
        ],
      },
    ],
  },
  {
    name: "community-site",
    patterns: [
      /커뮤니티/i,
      /forum/i,
      /게시판/i,
    ],
    childIssues: [
      {
        title: "Accounts and access",
        goal: "Design and implement membership, authentication, and access control.",
        acceptanceCriteria: [
          "Identity and access boundaries are explicit.",
          "The flow has clear sign-in and authorization requirements.",
        ],
      },
      {
        title: "Posts and comments",
        goal: "Design and implement posting, reading, and commenting flows.",
        acceptanceCriteria: [
          "The posting slice is clearly scoped.",
          "Comment behavior and evidence are documented.",
        ],
      },
      {
        title: "Moderation and notifications",
        goal: "Design and implement moderation, reporting, and notification flows.",
        acceptanceCriteria: [
          "Moderation responsibilities are separated from content creation.",
          "Notification and reporting requirements are captured.",
        ],
      },
      {
        title: "Admin operations",
        goal: "Design and implement community administration and policy controls.",
        acceptanceCriteria: [
          "Admin controls do not blur with member flows.",
          "Operational evidence is recorded.",
        ],
      },
    ],
  },
  {
    name: "reservation-service",
    patterns: [
      /예약\s*서비스/i,
      /reservation/i,
      /booking/i,
    ],
    childIssues: [
      {
        title: "Availability and schedule",
        goal: "Design and implement availability, schedule, and slot management.",
        acceptanceCriteria: [
          "Availability rules are explicit.",
          "Scheduling constraints are documented and testable.",
        ],
      },
      {
        title: "Booking flow",
        goal: "Design and implement the booking and confirmation flow.",
        acceptanceCriteria: [
          "The booking path is clearly scoped.",
          "Confirmation and validation requirements are captured.",
        ],
      },
      {
        title: "Customer notifications",
        goal: "Design and implement reservation notifications and reminders.",
        acceptanceCriteria: [
          "Notification triggers are scoped.",
          "Reminder behavior has evidence requirements.",
        ],
      },
      {
        title: "Admin operations",
        goal: "Design and implement admin scheduling and operational controls.",
        acceptanceCriteria: [
          "Admin actions remain separate from customer booking flows.",
          "Operational evidence is recorded.",
        ],
      },
    ],
  },
  {
    name: "admin-backoffice",
    patterns: [
      /관리자\s*백오피스/i,
      /backoffice/i,
      /admin/i,
    ],
    childIssues: [
      {
        title: "Access and roles",
        goal: "Design and implement admin authentication, roles, and access control.",
        acceptanceCriteria: [
          "Role boundaries are explicit.",
          "Admin access requirements are documented.",
        ],
      },
      {
        title: "Core admin dashboards",
        goal: "Design and implement the main admin dashboards and overview screens.",
        acceptanceCriteria: [
          "The dashboard slice is scoped.",
          "Key metrics and entry points are defined.",
        ],
      },
      {
        title: "CRUD management",
        goal: "Design and implement the core content and entity management screens.",
        acceptanceCriteria: [
          "CRUD boundaries are explicit.",
          "Validation and evidence requirements are recorded.",
        ],
      },
      {
        title: "Audit and exports",
        goal: "Design and implement audit logs, export flows, and operational tracking.",
        acceptanceCriteria: [
          "Audit and export needs are separated from CRUD work.",
          "Operational evidence is recorded.",
        ],
      },
    ],
  },
  {
    name: "sns-app",
    patterns: [
      /SNS\s*앱/i,
      /social/i,
      /feed/i,
    ],
    childIssues: [
      {
        title: "Profiles and follow graph",
        goal: "Design and implement user profiles, follow relationships, and identity flows.",
        acceptanceCriteria: [
          "Profile and follow responsibilities are separated.",
          "Identity and relationship constraints are explicit.",
        ],
      },
      {
        title: "Feed and posting",
        goal: "Design and implement posting, feeds, and timeline behavior.",
        acceptanceCriteria: [
          "The posting slice is clearly scoped.",
          "Feed ranking or ordering expectations are captured.",
        ],
      },
      {
        title: "Comments and reactions",
        goal: "Design and implement comments, reactions, and lightweight interaction flows.",
        acceptanceCriteria: [
          "Interaction boundaries are explicit.",
          "Evidence for each interaction is recorded.",
        ],
      },
      {
        title: "Notifications and moderation",
        goal: "Design and implement notifications, reporting, and moderation controls.",
        acceptanceCriteria: [
          "Notifications and moderation are separated from posting.",
          "Operational evidence is recorded.",
        ],
      },
    ],
  },
];

function findBroadProductTemplate(request: string): DecompositionTemplate | null {
  for (const template of broadProductDecompositionTemplates) {
    if (matchesAny(request, template.patterns)) {
      return template;
    }
  }

  return null;
}

function createGenericDecompositionChildren(summary: string): readonly DecompositionTemplateChild[] {
  return [
    {
      title: "Scope and requirements",
      goal: `Define the scope, users, and non-goals for ${summary}.`,
      acceptanceCriteria: [
        "The slice has a clear boundary.",
        "Non-goals are recorded.",
      ],
    },
    {
      title: "Core user flow",
      goal: `Implement the primary user flow for ${summary}.`,
      acceptanceCriteria: [
        "The main flow is scoped and executable.",
        "The slice has explicit verification steps.",
      ],
    },
    {
      title: "Supporting integration",
      goal: `Implement the supporting integration points for ${summary}.`,
      acceptanceCriteria: [
        "Integration boundaries are explicit.",
        "Dependencies and evidence requirements are recorded.",
      ],
    },
    {
      title: "Verification and launch",
      goal: `Validate and prepare the release slice for ${summary}.`,
      acceptanceCriteria: [
        "The verification path is explicit.",
        "The slice has launch-ready evidence requirements.",
      ],
    },
  ];
}

function buildDecompositionChildren(request: string, title: string): readonly IssuePlan[] {
  const summary = toIssueSummary(request);
  const template = findBroadProductTemplate(request);
  const sourceChildren = template?.childIssues ?? createGenericDecompositionChildren(summary);
  const childIssues = sourceChildren.map((child, index) => ({
    title: child.title,
    type: "feature",
    workflowId: "feature-development",
    goal: child.goal,
    acceptanceCriteria: child.acceptanceCriteria,
    dependencies: index === 0 ? [] : [sourceChildren[index - 1]?.title ?? title],
    evidenceRequired: child.evidenceRequired ?? [
      "Implementation evidence",
      "Verification output",
    ],
  } satisfies IssuePlan));

  return childIssues;
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

function stripIntentNoise(value: string): string {
  return value
    .replace(/^(please\s+)?(can you\s+|could you\s+|would you\s+|will you\s+|do you mind\s+)?/i, "")
    .replace(/^(build|create|make|add|implement|ship|wire up|integrate|extend|update|modify|change|introduce|document|write|design|research|investigate|analyze|analyse|fix|refactor|split|decompose|plan|prepare|review|support|launch|release|set up|setup|도와줘|해줘|만들어줘|추가해줘|구현해줘|수정해줘|고쳐줘|리팩터링해줘|기획해줘|작성해줘|설계해줘)\s+/i, "")
    .replace(/^(the|a|an|이|그|저)\s+/i, "")
    .replace(/\b(feature|features|task|tasks|project|projects|request|requests|기능|작업|프로젝트|요청)\b$/i, "")
    .trim();
}

function findRuleMatchIndex(request: string, patterns: readonly RegExp[]): number | null {
  let bestIndex: number | null = null;
  for (const pattern of patterns) {
    const match = request.match(pattern);
    if (match === null || match.index === undefined) {
      continue;
    }

    if (bestIndex === null || match.index < bestIndex) {
      bestIndex = match.index;
    }
  }

  return bestIndex;
}

function deriveIntentSlug(request: string, suggestedTitle: string, category: RequestCategory): string {
  const normalized = normalizeRequest(request);
  if (category === "review_task") {
    return buildReviewIntentSlug(detectReviewTarget(normalized));
  }

  const ruleMatches = intentSlugRules
    .map((rule, order) => ({
      slug: rule.slug,
      order,
      index: findRuleMatchIndex(normalized, rule.patterns),
    }))
    .filter((match): match is { readonly slug: string; readonly order: number; readonly index: number } => match.index !== null)
    .sort((left, right) => {
      if (left.index !== right.index) {
        return left.index - right.index;
      }
      return left.order - right.order;
    })
    .map((match) => match.slug);

  const uniqueRules = Array.from(new Set(ruleMatches));
  const categoryTokens: string[] = [];
  if ((category === "mvp_or_product_planning" || category === "multi_issue_project") && !uniqueRules.includes("plan")) {
    categoryTokens.push("plan");
  }

  const tokens = Array.from(new Set([...uniqueRules, ...categoryTokens]));
  if (tokens.length > 0) {
    return tokens.join("-");
  }

  const cleanedTitle = stripIntentNoise(suggestedTitle.length > 0 ? suggestedTitle : normalized);
  const readable = slugifyReadable(cleanedTitle);
  if (readable !== "unnamed") {
    return readable;
  }

  return slugifyReadable(normalized);
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
  const cleaned = stripTrailingNoise(stripIntentNoise(stripLeadingActionWords(firstSegment))).trim();
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
      return "review";
    case "bugfix_task":
      return "bugfix";
    case "refactor_task":
      return "refactor";
    case "mvp_or_product_planning":
      return "mvp";
    case "multi_issue_project":
      return "planning";
    case "performance_improvement_task":
      return "refactor";
    case "rule_change_candidate":
      return "decision";
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
    case "performance_improvement_task":
      return "refactoring";
    case "rule_change_candidate":
      return undefined;
  }
}

function makeClarificationOption(
  label: string,
  summary: string,
  pros: readonly string[],
  cons: readonly string[],
): ClarificationQuestionOption {
  return {
    label,
    summary,
    pros,
    cons,
  };
}

function makeClarificationQuestion(question: ClarificationQuestion): ClarificationQuestion {
  return question;
}

function buildMvpClarificationQuestions(request: string): readonly ClarificationQuestion[] {
  const summary = toIssueSummary(request);

  return [
    makeClarificationQuestion({
      question: `What product topic, target users, and main problem are we solving in ${summary}?`,
      options: [
        makeClarificationOption(
          "Option A",
          "One primary product topic, one primary user group, and one main problem.",
          [
            "Keeps the first pass focused and easy to validate.",
            "Reduces the chance of scope drift.",
          ],
          [
            "May leave adjacent user groups out of the first pass.",
            "Can be too narrow if the request expects a broader rollout.",
          ],
        ),
        makeClarificationOption(
          "Option B",
          "A broader product topic with primary and secondary user groups.",
          [
            "Covers more real-world usage from the start.",
            "Helps when the same MVP must work for multiple audiences.",
          ],
          [
            "Adds more decisions and possible tradeoffs.",
            "Makes the plan slower to converge.",
          ],
        ),
      ],
      recommendedDefault: "Option A",
      whatINeedFromYou: "Name the product topic, the primary users, and the single biggest problem the MVP must solve.",
    }),
    makeClarificationQuestion({
      question: "What core features belong in v1, what user flow should they support, and what are the non-goals?",
      options: [
        makeClarificationOption(
          "Option A",
          "Minimal core features with explicit non-goals and a single user flow.",
          [
            "Easiest to scope, build, and review.",
            "Keeps acceptance criteria sharp.",
          ],
          [
            "Leaves obvious follow-up work for later.",
            "Can feel incomplete if the request expects a wider first release.",
          ],
        ),
        makeClarificationOption(
          "Option B",
          "A phased MVP with a first slice and a follow-up slice.",
          [
            "Makes the roadmap and sequencing explicit.",
            "Good when the product needs a staged rollout.",
          ],
          [
            "Requires more planning and dependency management.",
            "Adds more room for ambiguity than a strict MVP.",
          ],
        ),
      ],
      recommendedDefault: "Option A",
      whatINeedFromYou: "List the must-have features, the first user flow, and the non-goals that should stay out of the first version.",
    }),
    makeClarificationQuestion({
      question: "What language, framework, package manager, runtime/version, database or storage, auth requirement, expected scale, and deployment target should we plan for?",
      options: [
        makeClarificationOption(
          "Option A",
          "Keep the current stack and deployment model.",
          [
            "Lowest migration risk.",
            "Keeps implementation aligned with the existing project shape.",
          ],
          [
            "May limit the quality of the final design if the current stack is already constrained.",
            "Can preserve awkward legacy choices.",
          ],
        ),
        makeClarificationOption(
          "Option B",
          "Allow a controlled stack change if it lowers risk or improves fit.",
          [
            "Useful when the current stack cannot support the product cleanly.",
            "Allows a deliberate choice about runtime and deployment.",
          ],
          [
            "Adds migration and compatibility work.",
            "Needs more explicit approval and validation.",
          ],
        ),
        makeClarificationOption(
          "Option C",
          "Treat the stack as undecided and let the plan recommend one.",
          [
            "Good when the project is still exploratory.",
            "Lets the architecture proposal own the recommendation.",
          ],
          [
            "Needs more investigation before implementation can start.",
            "Can slow the planning loop if the stack is actually already fixed.",
          ],
        ),
      ],
      recommendedDefault: "Option A",
      whatINeedFromYou: "Confirm the implementation stack, storage, auth, scale, and deployment expectations so the MVP plan does not guess.",
    }),
    makeClarificationQuestion({
      question: "What test strategy should prove the MVP is ready?",
      options: [
        makeClarificationOption(
          "Option A",
          "Automated tests are the primary bar.",
          [
            "Repeatable and easy to rerun.",
            "Best when regression risk matters.",
          ],
          [
            "Can take longer to implement.",
            "May miss some product nuance without a manual check.",
          ],
        ),
        makeClarificationOption(
          "Option B",
          "Manual verification is enough for the first pass.",
          [
            "Fastest path to a confidence check.",
            "Works when the change is very small or exploratory.",
          ],
          [
            "Weaker evidence than repeatable tests.",
            "Harder to reuse later.",
          ],
        ),
        makeClarificationOption(
          "Option C",
          "Use both automated and manual evidence.",
          [
            "Strongest confidence in the result.",
            "Useful when the MVP is user-facing or high risk.",
          ],
          [
            "Higher verification cost.",
            "Can slow down delivery.",
          ],
        ),
      ],
      recommendedDefault: "Option C",
      whatINeedFromYou: "Tell me which checks are mandatory so I can line up the right tests, commands, or manual proof.",
    }),
  ];
}

function buildFeatureClarificationQuestions(request: string): readonly ClarificationQuestion[] {
  const summary = toIssueSummary(request);

  return [
    makeClarificationQuestion({
      question: `What is the feature goal and user flow for ${summary}?`,
      options: [
        makeClarificationOption(
          "Option A",
          "One goal, one primary user flow, one success path.",
          [
            "Keeps the request small and shippable.",
            "Easier to validate against a single outcome.",
          ],
          [
            "May leave secondary flows for later.",
            "Can be too narrow if the feature has multiple entry points.",
          ],
        ),
        makeClarificationOption(
          "Option B",
          "Primary flow plus important alternate flows.",
          [
            "Catches obvious branching behavior early.",
            "Useful when the feature has several user paths.",
          ],
          [
            "Adds scope and more implementation details.",
            "Can slow down the first pass.",
          ],
        ),
      ],
      recommendedDefault: "Option A",
      whatINeedFromYou: "State the feature goal, the primary user flow, and the outcome that should be obvious when the feature is done.",
    }),
    makeClarificationQuestion({
      question: "Which target files, modules, API routes, or UI surfaces are in scope if you already know them?",
      options: [
        makeClarificationOption(
          "Option A",
          "Narrow the change to the smallest known surface area.",
          [
            "Keeps the implementation blast radius small.",
            "Makes review and rollback easier.",
          ],
          [
            "Can miss a hidden dependency if the surface is actually wider.",
            "May require follow-up work later.",
          ],
        ),
        makeClarificationOption(
          "Option B",
          "Include adjacent modules and integration points.",
          [
            "Better when the feature crosses several boundaries.",
            "Reduces the chance of missing a needed companion change.",
          ],
          [
            "Broadens scope and can hide the true minimum change.",
            "Needs more coordination and evidence.",
          ],
        ),
      ],
      recommendedDefault: "Option A",
      whatINeedFromYou: "Call out the modules, files, routes, or screens that should be touched if the scope is already known.",
    }),
    makeClarificationQuestion({
      question: "What API or UI behavior, data model impact, validation rules, error handling, and security concerns matter here?",
      options: [
        makeClarificationOption(
          "Option A",
          "Preserve the existing contract and avoid schema churn.",
          [
            "Lower risk for existing users and consumers.",
            "Usually the fastest implementation path.",
          ],
          [
            "May force workarounds if the current contract is weak.",
            "Can leave the underlying model imperfect.",
          ],
        ),
        makeClarificationOption(
          "Option B",
          "Change the contract if it produces a clearer design.",
          [
            "Better long-term maintainability.",
            "Useful when the current model is already confusing.",
          ],
          [
            "Adds migration, compatibility, and coordination work.",
            "Increases the chance of breaking change.",
          ],
        ),
      ],
      recommendedDefault: "Option A",
      whatINeedFromYou: "Tell me whether this feature changes API behavior, UI behavior, validation, persistence, auth, or other security-sensitive surfaces.",
    }),
    makeClarificationQuestion({
      question: "What test expectations and acceptance criteria should prove the feature works?",
      options: [
        makeClarificationOption(
          "Option A",
          "Automated tests are required and manual checks are optional.",
          [
            "Repeatable evidence that can catch regressions later.",
            "Works well when the feature is stable and codified.",
          ],
          [
            "Takes more time up front.",
            "May still need manual checks for user-visible behavior.",
          ],
        ),
        makeClarificationOption(
          "Option B",
          "Manual verification is enough for the first iteration.",
          [
            "Fastest way to confirm a small or exploratory change.",
            "Useful when the implementation is still uncertain.",
          ],
          [
            "Weaker evidence and less reusable.",
            "Harder to automate later if the feature grows.",
          ],
        ),
        makeClarificationOption(
          "Option C",
          "Use both automated tests and manual proof.",
          [
            "Strongest evidence for user-facing work.",
            "Good when regressions or UX issues would be expensive.",
          ],
          [
            "Highest verification cost.",
            "Can slow the delivery loop.",
          ],
        ),
      ],
      recommendedDefault: "Option C",
      whatINeedFromYou: "Tell me what success looks like and which checks are mandatory so the implementation can be verified against it.",
    }),
    makeClarificationQuestion({
      question: "What should remain out of scope, deferred, or explicitly accepted as follow-up work?",
      options: [
        makeClarificationOption(
          "Option A",
          "A tight first slice with explicit non-goals.",
          [
            "Keeps the task small and bounded.",
            "Makes it easier to finish and review.",
          ],
          [
            "Leaves follow-up work for later.",
            "Can feel incomplete if the request expects a broader outcome.",
          ],
        ),
        makeClarificationOption(
          "Option B",
          "A broader implementation with deferred cleanup later.",
          [
            "Covers more of the problem in one pass.",
            "Good when the feature must land as a larger cohesive unit.",
          ],
          [
            "More risk and more implementation surface.",
            "Harder to review and verify quickly.",
          ],
        ),
      ],
      recommendedDefault: "Option A",
      whatINeedFromYou: "List the explicit non-goals and any follow-up work that should not block the first feature delivery.",
    }),
  ];
}

function buildPerformanceClarificationQuestions(request: string): readonly ClarificationQuestion[] {
  const summary = toIssueSummary(request);

  return [
    makeClarificationQuestion({
      question: `What performance problem or bottleneck should we improve in ${summary}?`,
      options: [
        makeClarificationOption(
          "Option A",
          "One known bottleneck with a clear user-facing impact.",
          [
            "Keeps measurement and implementation focused.",
            "Makes the before/after comparison easier.",
          ],
          [
            "May miss adjacent bottlenecks.",
            "Can be too narrow if the request is really a broader optimization pass.",
          ],
        ),
        makeClarificationOption(
          "Option B",
          "A broader performance pass covering the main hot path and nearby costs.",
          [
            "Covers more of the bottleneck surface area.",
            "Helpful when the slowdown spans multiple layers.",
          ],
          [
            "Needs more measurement and more evidence.",
            "Adds more optimization decisions.",
          ],
        ),
      ],
      recommendedDefault: "Option A",
      whatINeedFromYou: "Tell me which user flow, endpoint, job, or screen feels slow and what outcome should improve.",
    }),
    makeClarificationQuestion({
      question: "What baseline, after-change result, and metric should we use to prove the improvement?",
      options: [
        makeClarificationOption(
          "Option A",
          "A single metric with a baseline and a follow-up measurement.",
          [
            "Keeps the measurement simple and repeatable.",
            "Easy to compare before and after.",
          ],
          [
            "Can miss secondary effects.",
            "May be too coarse if the bottleneck is complex.",
          ],
        ),
        makeClarificationOption(
          "Option B",
          "Multiple metrics, such as latency, throughput, and memory.",
          [
            "Catches trade-offs that one metric might hide.",
            "Useful for more complex performance work.",
          ],
          [
            "Takes more time to measure.",
            "Adds more room for ambiguity.",
          ],
        ),
      ],
      recommendedDefault: "Option A",
      whatINeedFromYou: "Name the metric that matters most and tell me what baseline we should capture before changes begin.",
    }),
    makeClarificationQuestion({
      question: "What compact performance evidence summary should we record so the review can judge the result without opening the raw artifact first?",
      options: [
        makeClarificationOption(
          "Option A",
          "A compact summary with the scenario, baseline, after/result, workload, key metric, raw report path, limitations, and follow-up issue if any.",
          [
            "Makes the review quick to judge.",
            "Keeps the raw artifact linked but not required for first-pass evaluation.",
          ],
          [
            "Takes a little more time to write up.",
            "Needs discipline to keep the summary compact.",
          ],
        ),
        makeClarificationOption(
          "Option B",
          "Raw benchmark or profiling output without a compact summary.",
          [
            "Fastest way to attach evidence.",
            "Useful for rough exploration before the result is stable.",
          ],
          [
            "Harder to review.",
            "Makes it easier for large raw output to crowd out the actual conclusion.",
          ],
        ),
      ],
      recommendedDefault: "Option A",
      whatINeedFromYou: "Give me the scenario, baseline, after/result, workload or iterations, key metric, raw report path, limitations, and any follow-up issue so the review can judge the change quickly.",
    }),
    makeClarificationQuestion({
      question: "What measurement constraints, environment differences, or limitations should I record if perfect benchmarking is not feasible?",
      options: [
        makeClarificationOption(
          "Option A",
          "Use the current environment and note the limitation clearly.",
          [
            "Fastest way to get a useful baseline.",
            "Good when a dedicated benchmark environment is not available.",
          ],
          [
            "Less precise than a controlled benchmark.",
            "May not be directly comparable across machines.",
          ],
        ),
        makeClarificationOption(
          "Option B",
          "Wait for a stable benchmark setup before making changes.",
          [
            "Best when the measurement needs to be rigorous.",
            "Reduces the chance of misleading results.",
          ],
          [
            "Slows the work down.",
            "May not be practical for a small optimization.",
          ],
        ),
      ],
      recommendedDefault: "Option A",
      whatINeedFromYou: "Tell me whether we need a strict benchmark environment or whether a documented limitation is acceptable.",
    }),
  ];
}

function buildGenericClarificationQuestions(category: RequestCategory, request: string): readonly ClarificationQuestion[] {
  const summary = toIssueSummary(request);

  const makeQuestion = (input: ClarificationQuestion): ClarificationQuestion => input;

  switch (category) {
    case "review_task":
      return buildReviewTargetClarificationQuestions(request);
    case "performance_improvement_task":
      return buildPerformanceClarificationQuestions(request);
    case "rule_change_candidate":
      return [];
    case "bugfix_task":
      return [
        makeQuestion({
          question: `What is the observed failure, expected behavior, and reproduction path for ${summary}?`,
          options: [
            makeClarificationOption(
              "Option A",
              "One clear failure mode with a minimal reproduction.",
              [
                "Fastest path to a fix.",
                "Keeps the investigation focused.",
              ],
              [
                "Can miss related edge cases.",
                "May be too narrow if the bug has several symptoms.",
              ],
            ),
            makeClarificationOption(
              "Option B",
              "Multiple symptoms, a broader reproduction path, and a wider search.",
              [
                "Useful when the bug only appears in several scenarios.",
                "Better for intermittent or environment-specific problems.",
              ],
              [
                "Takes longer to isolate.",
                "Can slow the first diagnosis pass.",
              ],
            ),
          ],
          recommendedDefault: "Option A",
          whatINeedFromYou: "Describe the failing behavior, what should happen instead, and how to reproduce it reliably.",
        }),
        makeQuestion({
          question: "Which files, modules, environments, or dependencies look involved?",
          options: [
            makeClarificationOption(
              "Option A",
              "Narrow the search to the most likely module or path.",
              [
                "Speeds up the diagnosis.",
                "Less noise while debugging.",
              ],
              [
                "Can miss a hidden upstream cause.",
                "May need a second pass if the guess is wrong.",
              ],
            ),
            makeClarificationOption(
              "Option B",
              "Include adjacent modules and environment-specific dependencies.",
              [
                "Better when the bug spans more than one layer.",
                "Helps with configuration or integration issues.",
              ],
              [
                "Adds more investigation cost.",
                "Can slow down the first fix proposal.",
              ],
            ),
          ],
          recommendedDefault: "Option A",
          whatINeedFromYou: "Call out any suspect files, modules, runtime environment, or external dependency that could affect the bug.",
        }),
        makeQuestion({
          question: "What verification should prove the bug is actually fixed?",
          options: [
            makeClarificationOption(
              "Option A",
              "A regression test plus the reproduction case.",
              [
                "Strong, repeatable evidence.",
                "Best for bugs that should not return.",
              ],
              [
                "Takes longer to build.",
                "May require fixtures or test harness work.",
              ],
            ),
            makeClarificationOption(
              "Option B",
              "Manual verification only for now.",
              [
                "Fastest way to confirm the issue is gone.",
                "Works when the bug is still being explored.",
              ],
              [
                "Weaker evidence than an automated test.",
                "Harder to reuse later.",
              ],
            ),
          ],
          recommendedDefault: "Option A",
          whatINeedFromYou: "Tell me how we should prove the bug is closed and what evidence is mandatory.",
        }),
      ];
    case "refactor_task":
      return [
        makeQuestion({
          question: `What structural outcome should the refactor achieve in ${summary}?`,
          options: [
            makeClarificationOption(
              "Option A",
              "Simplify one narrow area without changing the public contract.",
              [
                "Lowest-risk refactor shape.",
                "Easy to verify against the existing behavior.",
              ],
              [
                "May not solve deeper structural issues.",
                "Could leave the broader design unchanged.",
              ],
            ),
            makeClarificationOption(
              "Option B",
              "Rework the boundaries or layering more aggressively.",
              [
                "Better when the current structure is the actual problem.",
                "Can create a cleaner long-term shape.",
              ],
              [
                "More risk and more coordination.",
                "Usually needs more validation.",
              ],
            ),
          ],
          recommendedDefault: "Option A",
          whatINeedFromYou: "Tell me what the refactor should improve and what behavior must stay exactly the same.",
        }),
        makeQuestion({
          question: "Which modules, dependencies, or files are the main target of the refactor?",
          options: [
            makeClarificationOption(
              "Option A",
              "A narrow set of files and collaborators.",
              [
                "Keeps the change tractable.",
                "Best when the refactor can be isolated.",
              ],
              [
                "May not clean up all related duplication.",
                "Could leave adjacent coupling in place.",
              ],
            ),
            makeClarificationOption(
              "Option B",
              "A broader slice of the system including adjacent dependencies.",
              [
                "Useful when the coupling crosses modules.",
                "Can resolve the root structure more completely.",
              ],
              [
                "Larger surface area and more review work.",
                "Needs stronger validation.",
              ],
            ),
          ],
          recommendedDefault: "Option A",
          whatINeedFromYou: "Name the files or modules that should change if you already know the target area.",
        }),
        makeQuestion({
          question: "What level of compatibility and verification should the refactor preserve?",
          options: [
            makeClarificationOption(
              "Option A",
              "Preserve behavior exactly and verify with focused tests.",
              [
                "Safe for production-facing refactors.",
                "Clear success criteria.",
              ],
              [
                "May constrain structural improvements.",
                "Can require more tests to prove parity.",
              ],
            ),
            makeClarificationOption(
              "Option B",
              "Allow small contract changes if they clean up the design.",
              [
                "Better when the old contract is already awkward.",
                "Can reduce long-term maintenance cost.",
              ],
              [
                "Needs more coordination and communication.",
                "Raises the risk of accidental breakage.",
              ],
            ),
          ],
          recommendedDefault: "Option A",
          whatINeedFromYou: "Tell me how much compatibility the refactor must preserve and what evidence is required to prove it.",
        }),
      ];
    default:
      return [
        makeQuestion({
          question: `What outcome should we optimize for in ${summary}?`,
          options: [
            makeClarificationOption(
              "Option A",
              "Ship the smallest useful version first.",
              [
                "Fastest path to something concrete.",
                "Keeps the first pass focused and easier to review.",
              ],
              [
                "May leave follow-up work for later.",
                "Can feel incomplete if the end state matters more than speed.",
              ],
            ),
            makeClarificationOption(
              "Option B",
              "Balance completeness and speed.",
              [
                "Better first-pass coverage of the requested outcome.",
                "Reduces obvious follow-up gaps.",
              ],
              [
                "Broadens the scope compared with a strict MVP.",
                "May take longer to finish and verify.",
              ],
            ),
          ],
          recommendedDefault: "Option A",
          whatINeedFromYou: "Pick the delivery style that matters most, or describe a hybrid if the tradeoff is different.",
        }),
      ];
  }
}

function buildClarificationQuestions(category: RequestCategory, request: string): readonly ClarificationQuestion[] {
  if (category === "casual_or_question") {
    return [];
  }

  if (category === "mvp_or_product_planning" || category === "multi_issue_project") {
    return buildMvpClarificationQuestions(request);
  }

  if (category === "single_development_task") {
    return buildFeatureClarificationQuestions(request);
  }

  return buildGenericClarificationQuestions(category, request);
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
    case "performance_improvement_task":
      return [
        "Compact performance summary",
        "Baseline measurement",
        "After-change measurement",
        "Raw benchmark or profiling artifact",
        "Before/after comparison",
        "Limitations and follow-up issue if any",
      ];
    case "rule_change_candidate":
      return [];
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
    case "performance_improvement_task":
      return [
        "A compact summary captures the scenario, baseline, after/result, workload, key metric, raw report path, limitations, and any follow-up issue.",
        "The improvement is measured again after the change.",
        "The before/after comparison is clear enough to judge without opening the raw artifact first.",
        "Large raw evidence does not block the review by itself when the compact summary exists.",
      ];
    case "rule_change_candidate":
      return [
        "A durable rule change is proposed instead of a one-off task.",
        "User approval is recorded before any rule file changes are written.",
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
    case "performance_improvement_task":
      return `Improve the performance of ${summary} with measurable before/after evidence.`;
    case "rule_change_candidate":
      return `Confirm the durable rule change requested in ${summary}.`;
    case "single_development_task":
      return `Deliver ${summary} as a single workflow-backed task.`;
  }
}

function inferRequestSegmentIssueType(segment: string): IssueType {
  if (/\b(review|code review|pr|pull request)\b/i.test(segment) || /(리뷰|검토|점검)/i.test(segment)) {
    return "review";
  }

  if (/\b(fix|bug|broken|error|failure|crash|regression)\b/i.test(segment) || /(버그|오류|에러|고쳐|수정|깨져|회귀)/i.test(segment)) {
    return "bugfix";
  }

  if (matchesAny(segment, explicitRefactorMatchers) || (matchesAny(segment, genericImprovementMatchers) && hasCodeTarget(segment))) {
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
  if (category === "casual_or_question" || category === "rule_change_candidate") {
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
    : buildDecompositionChildren(request, title);

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

function roundConfidence(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}

function calculateRequestConfidence(category: RequestCategory, request: string, issuePlan: RequestIssuePlanBundle | undefined): number {
  if (category === "casual_or_question") {
    return 0.99;
  }

  if (category === "review_task") {
    return detectReviewTarget(request) === null ? 0.55 : 0.92;
  }

  if (category === "bugfix_task") {
    return 0.9;
  }

  if (category === "refactor_task") {
    const base = matchesAny(request, explicitRefactorMatchers) ? 0.94 : 0.84;
    return roundConfidence(hasCodeTarget(request) ? base : base - 0.08);
  }

  if (category === "performance_improvement_task") {
    return roundConfidence(isPerformanceImprovementTask(request) ? 0.9 : 0.74);
  }

  if (category === "rule_change_candidate") {
    return roundConfidence(0.88);
  }

  if (category === "mvp_or_product_planning") {
    return roundConfidence(0.84 + (issuePlan === undefined ? -0.04 : 0));
  }

  if (category === "multi_issue_project") {
    if (findBroadProductTemplate(request) !== null) {
      return 0.84;
    }

    return splitRequestSegments(request).length > 1 ? 0.8 : 0.73;
  }

  if (category === "single_development_task") {
    let confidence = 0.56;
    if (matchesAny(request, singleTaskMatchers)) {
      confidence += 0.14;
    }
    if (hasFeatureTarget(request)) {
      confidence += 0.18;
    }
    if (hasCodeTarget(request)) {
      confidence += 0.1;
    }
    if (!hasFeatureTarget(request) && !hasCodeTarget(request) && !isBroadProductRequest(request)) {
      confidence -= 0.18;
    }
    if (isGenericImprovementWithoutCodeTarget(request)) {
      confidence -= 0.28;
    }
    if (request.length <= 6) {
      confidence -= 0.08;
    }
    return roundConfidence(confidence);
  }

  return 0.5;
}

function determineExecutionMode(category: RequestCategory, request: string, confidence: number): RequestExecutionMode {
  if (category === "casual_or_question") {
    return "answer";
  }

  if (category === "rule_change_candidate") {
    return "request_rule_approval";
  }

  if (category === "review_task") {
    return "run_review";
  }

  if (confidence < 0.6) {
    return "unknown";
  }

  switch (category) {
    case "single_development_task":
      return "create_issue";
    case "mvp_or_product_planning":
      return "plan_mvp";
    case "multi_issue_project":
      return "decompose_project";
    case "bugfix_task":
    case "refactor_task":
    case "performance_improvement_task":
      return "create_issue";
  }
}

function determineIntent(category: RequestCategory, executionMode: RequestExecutionMode): RequestIntent {
  switch (executionMode) {
    case "answer":
      return "answer";
    case "create_issue":
      switch (category) {
        case "bugfix_task":
          return "bugfix";
        case "refactor_task":
          return "refactor";
        case "performance_improvement_task":
          return "performance_improvement";
        case "review_task":
          return "review";
        default:
          return "feature";
      }
    case "plan_mvp":
      return "mvp_planning";
    case "decompose_project":
      return "project_decomposition";
    case "run_review":
      return "review";
    case "update_rule":
      return "rule_update";
    case "request_rule_approval":
      return "rule_update";
    case "unknown":
      return "unknown";
  }
}

function determineIssueCount(
  executionMode: RequestExecutionMode,
  issuePlan: RequestIssuePlanBundle | undefined,
): number {
  switch (executionMode) {
    case "answer":
    case "unknown":
    case "update_rule":
    case "request_rule_approval":
      return 0;
    case "decompose_project":
      return 1 + (issuePlan?.childIssues.length ?? 0);
    case "plan_mvp":
    case "create_issue":
    case "run_review":
      return 1;
  }
}

function determineSafeToProceed(executionMode: RequestExecutionMode, confidence: number): boolean {
  if (confidence < 0.6) {
    return false;
  }

  return executionMode === "answer"
    || executionMode === "create_issue"
    || executionMode === "run_review"
    || executionMode === "update_rule";
}

function determineNextAction(executionMode: RequestExecutionMode): string {
  switch (executionMode) {
    case "answer":
      return "answer";
    case "create_issue":
      return "create_issue";
    case "plan_mvp":
      return "clarify_and_plan";
    case "decompose_project":
      return "clarify_and_decompose";
    case "update_rule":
      return "update_rule";
    case "request_rule_approval":
      return "request_rule_approval";
    case "run_review":
      return "run_review";
    case "unknown":
      return "clarify";
  }
}

function buildUnknownClarificationQuestions(request: string): readonly ClarificationQuestion[] {
  const summary = toIssueSummary(request);

  return [
    makeClarificationQuestion({
      question: `What specific outcome should we aim for in ${summary}?`,
      options: [
        makeClarificationOption(
          "Option A",
          "Clarify the exact feature, bug, refactor, or plan before continuing.",
          [
            "Prevents the request from being misrouted.",
            "Makes the next workflow decision explicit.",
          ],
          [
            "Needs one more clarification round.",
            "Delays execution until the request is specific enough.",
          ],
        ),
        makeClarificationOption(
          "Option B",
          "Turn the request into a short planning pass first.",
          [
            "Useful when the request is broad but not yet decomposed.",
            "Keeps the next step bounded.",
          ],
          [
            "Adds a planning layer before implementation.",
            "Can still require follow-up clarification.",
          ],
        ),
      ],
      recommendedDefault: "Option A",
      whatINeedFromYou: "Tell me whether this should become a feature, bug fix, refactor, review, or planning request.",
    }),
    makeClarificationQuestion({
      question: "What code area, product slice, or document should change if you already know it?",
      options: [
        makeClarificationOption(
          "Option A",
          "A narrow code or product target.",
          [
            "Lets the route decision stay conservative and accurate.",
            "Reduces the chance of creating the wrong issue type.",
          ],
          [
            "May still need a follow-up question if the target is too broad.",
          ],
        ),
        makeClarificationOption(
          "Option B",
          "A broader area that still needs decomposition.",
          [
            "Useful when the change spans several files or flows.",
            "Makes it easier to plan next steps.",
          ],
          [
            "Needs decomposition before implementation.",
          ],
        ),
      ],
      recommendedDefault: "Option A",
      whatINeedFromYou: "Name the target area or tell me to plan the request first.",
    }),
  ];
}

export function analyzeRequest(request: string): RequestAnalysis {
  const normalizedRequest = normalizeRequest(request);
  const ruleChangeSuggestion = detectRuleChangeSuggestion(normalizedRequest);

  if (normalizedRequest.length === 0) {
    return {
      request: normalizedRequest,
      normalizedRequest,
      category: "casual_or_question",
      intent: "answer",
      executionMode: "answer",
      issueCount: 0,
      confidence: 0.99,
      safeToProceed: true,
      nextAction: "answer",
      requiresClarification: false,
      requiresIssue: false,
      suggestedTitle: toSuggestedTitle(normalizedRequest),
      intentSlug: "request",
      reason: "This is a casual message or question that does not need an issue.",
      needsClarification: false,
      clarificationQuestions: [],
      ruleChangeCandidate: false,
      requiresUserApproval: false,
    };
  }

  if (ruleChangeSuggestion !== null) {
    return {
      request: normalizedRequest,
      normalizedRequest,
      category: "rule_change_candidate",
      intent: "rule_update",
      executionMode: "request_rule_approval",
      issueCount: 0,
      confidence: calculateRequestConfidence("rule_change_candidate", normalizedRequest, undefined),
      safeToProceed: false,
      nextAction: determineNextAction("request_rule_approval"),
      requiresClarification: false,
      requiresIssue: false,
      suggestedTitle: toSuggestedTitle(normalizedRequest),
      intentSlug: `rule-update-${slugifyReadable(ruleChangeSuggestion.ruleId)}`,
      reason: ruleChangeSuggestion.reason,
      needsClarification: false,
      clarificationQuestions: [],
      ruleChangeCandidate: true,
      ruleChangeRuleId: ruleChangeSuggestion.ruleId,
      existingRule: ruleChangeSuggestion.existingRule,
      proposedRule: ruleChangeSuggestion.proposedRule,
      requiresUserApproval: true,
    };
  }

  let category: RequestCategory = "single_development_task";
  if (isReviewTask(normalizedRequest)) {
    category = "review_task";
  } else if (isCasualOrQuestion(normalizedRequest)) {
    return {
      request: normalizedRequest,
      normalizedRequest,
      category: "casual_or_question",
      intent: "answer",
      executionMode: "answer",
      issueCount: 0,
      confidence: 0.99,
      safeToProceed: true,
      nextAction: "answer",
      requiresClarification: false,
      requiresIssue: false,
      suggestedTitle: toSuggestedTitle(normalizedRequest),
      intentSlug: "request",
      reason: "This is a casual message or question that does not need an issue.",
      needsClarification: false,
      clarificationQuestions: [],
      ruleChangeCandidate: false,
      requiresUserApproval: false,
    };
  } else if (isBugfixTask(normalizedRequest)) {
    category = "bugfix_task";
  } else if (isPerformanceImprovementTask(normalizedRequest)) {
    category = "performance_improvement_task";
  } else if (isRefactorTask(normalizedRequest)) {
    category = "refactor_task";
  } else if (isProductPlanningTask(normalizedRequest)) {
    category = "mvp_or_product_planning";
  } else if (isBroadProductRequest(normalizedRequest)) {
    category = "multi_issue_project";
  } else if (isMultiIssueProject(normalizedRequest)) {
    category = "multi_issue_project";
  }

  const reviewTarget = category === "review_task" ? detectReviewTarget(normalizedRequest) : null;
  const suggestedTitle = category === "review_task"
    ? buildReviewIssueTitle(reviewTarget, normalizedRequest)
    : toSuggestedTitle(normalizedRequest);
  const confidence = calculateRequestConfidence(category, normalizedRequest, undefined);
  const executionMode = determineExecutionMode(category, normalizedRequest, confidence);
  const issuePlan = executionMode === "unknown"
    ? undefined
    : buildIssuePlan(category, normalizedRequest, suggestedTitle);
  const issueCount = determineIssueCount(executionMode, issuePlan);
  const requiresIssue = issueCount > 0;
  const safeToProceed = determineSafeToProceed(executionMode, confidence);
  const intent = determineIntent(category, executionMode);
  const nextAction = category === "review_task" && reviewTarget === null
    ? "clarify"
    : determineNextAction(executionMode);
  const clarificationQuestions = category === "review_task"
    ? (reviewTarget === null ? buildReviewTargetClarificationQuestions(normalizedRequest) : [])
    : executionMode === "unknown"
      ? buildUnknownClarificationQuestions(normalizedRequest)
      : buildClarificationQuestions(category, normalizedRequest);
  const requestIntentSlug = deriveIntentSlug(normalizedRequest, suggestedTitle, category);
  const issueType = requiresIssue ? categoryToIssueType(category, normalizedRequest) : undefined;
  const workflowId = requiresIssue ? categoryToWorkflowId(category) : undefined;

  const reasonByCategory: Record<Exclude<RequestCategory, "casual_or_question">, string> = {
    single_development_task: "This is a single development task that should be routed to one workflow.",
    mvp_or_product_planning: "This request is product/MVP planning and should use the MVP planning workflow.",
    multi_issue_project: "This request spans multiple deliverables and should be split into child issues.",
    review_task: reviewTarget === null
      ? "This is a review request and should be routed through the review workflow, but the target still needs clarification."
      : `This is a review request for ${reviewTarget.label} and should be routed through the review workflow.`,
    bugfix_task: "This is a bug fix request and should be routed through the bug fix workflow.",
    refactor_task: "This is a refactor request and should be routed through the refactoring workflow.",
    performance_improvement_task: "This is a performance improvement request and should be routed through the refactoring workflow with measurement evidence.",
    rule_change_candidate: "This request changes a durable rule or project convention and requires explicit approval before any file update.",
  };

  const reason = executionMode === "unknown"
    ? "This request is too broad or underspecified to route safely, so it needs clarification first."
    : reasonByCategory[category as Exclude<RequestCategory, "casual_or_question">];

  return {
    request: normalizedRequest,
    normalizedRequest,
    category,
    intent,
    executionMode,
    issueCount,
    confidence,
    safeToProceed,
    nextAction,
    requiresClarification: clarificationQuestions.length > 0,
    requiresIssue,
    ...(issueType === undefined ? {} : { issueType }),
    ...(workflowId === undefined ? {} : { workflowId }),
    suggestedTitle,
    intentSlug: requestIntentSlug,
    ...(reviewTarget === null ? {} : { reviewTarget }),
    reason,
    needsClarification: clarificationQuestions.length > 0,
    clarificationQuestions,
    ...(issuePlan === undefined ? {} : { issuePlan }),
    ruleChangeCandidate: false,
    requiresUserApproval: false,
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
  return analyzeRequest(request).intentSlug;
}

export function createIssueTitleFromRequest(request: string): string {
  return analyzeRequest(request).suggestedTitle;
}
