import { joinPaths } from "./filesystem.js";

export interface FlownessWorkspacePaths {
  readonly rootDir: string;
  readonly agentDir: string;
  readonly agentConfigDir: string;
  readonly agentIssuesDir: string;
  readonly agentLogsDir: string;
  readonly agentWorkflowsDir: string;
  readonly agentRulesDir: string;
  readonly agentSkillsDir: string;
  readonly agentScriptsDir: string;
  readonly agentTemplatesDir: string;
  readonly agentPromptsDir: string;
  readonly agentSettingsDir: string;
  readonly codexDir: string;
  readonly flownessDir: string;
  readonly configPath: string;
}

export function resolveWorkspacePaths(rootDir: string): FlownessWorkspacePaths {
  return {
    rootDir,
    agentDir: joinPaths(rootDir, ".agent"),
    agentConfigDir: joinPaths(rootDir, ".agent", "config"),
    agentIssuesDir: joinPaths(rootDir, ".agent", "issues"),
    agentLogsDir: joinPaths(rootDir, ".agent", "logs"),
    agentWorkflowsDir: joinPaths(rootDir, ".agent", "workflows"),
    agentRulesDir: joinPaths(rootDir, ".agent", "rules"),
    agentSkillsDir: joinPaths(rootDir, ".agent", "skills"),
    agentScriptsDir: joinPaths(rootDir, ".agent", "scripts"),
    agentTemplatesDir: joinPaths(rootDir, ".agent", "templates"),
    agentPromptsDir: joinPaths(rootDir, ".agent", "prompts"),
    agentSettingsDir: joinPaths(rootDir, ".agent", "settings"),
    codexDir: joinPaths(rootDir, ".codex"),
    flownessDir: joinPaths(rootDir, ".flowness"),
    configPath: joinPaths(rootDir, ".flowness", "config.yaml"),
  };
}

export function resolveIssuePaths(rootDir: string, issueId: string): {
  readonly issueDir: string;
  readonly issueFile: string;
  readonly issueJsonFile: string;
  readonly decompositionFile: string;
  readonly decisionsDir: string;
  readonly reviewsDir: string;
  readonly workflowStateFile: string;
  readonly logFile: string;
} {
  return {
    issueDir: joinPaths(rootDir, ".agent", "issues", issueId),
    issueFile: joinPaths(rootDir, ".agent", "issues", issueId, "issue.md"),
    issueJsonFile: joinPaths(rootDir, ".agent", "issues", issueId, "issue.json"),
    decompositionFile: joinPaths(rootDir, ".agent", "issues", issueId, "decomposition.json"),
    decisionsDir: joinPaths(rootDir, ".agent", "issues", issueId, "decisions"),
    reviewsDir: joinPaths(rootDir, ".agent", "issues", issueId, "reviews"),
    workflowStateFile: joinPaths(rootDir, ".agent", "issues", issueId, "workflow-state.json"),
    logFile: joinPaths(rootDir, ".agent", "logs", `${issueId}.md`),
  };
}

export function resolveWorkflowScaffoldPaths(
  rootDir: string,
  workflowId: string,
): {
  readonly workflowDir: string;
  readonly workflowFile: string;
  readonly stepsDir: string;
  readonly workflowReadme: string;
} {
  return {
    workflowDir: joinPaths(rootDir, ".agent", "workflows", workflowId),
    workflowFile: joinPaths(rootDir, ".agent", "workflows", workflowId, "workflow.ts"),
    stepsDir: joinPaths(rootDir, ".agent", "workflows", workflowId, "steps"),
    workflowReadme: joinPaths(rootDir, ".agent", "workflows", workflowId, "README.md"),
  };
}

export function resolveRuleScaffoldPaths(
  rootDir: string,
  ruleId: string,
): {
  readonly rulesDir: string;
  readonly ruleFile: string;
} {
  return {
    rulesDir: joinPaths(rootDir, ".agent", "rules"),
    ruleFile: joinPaths(rootDir, ".agent", "rules", `${ruleId}.md`),
  };
}

export function resolveSkillScaffoldPaths(
  rootDir: string,
  skillId: string,
): {
  readonly skillsDir: string;
  readonly skillDir: string;
  readonly skillFile: string;
  readonly readmeFile: string;
} {
  return {
    skillsDir: joinPaths(rootDir, ".agent", "skills"),
    skillDir: joinPaths(rootDir, ".agent", "skills", skillId),
    skillFile: joinPaths(rootDir, ".agent", "skills", skillId, "SKILL.md"),
    readmeFile: joinPaths(rootDir, ".agent", "skills", skillId, "README.md"),
  };
}

export function resolveScriptScaffoldPaths(
  rootDir: string,
  scriptFileName: string,
): {
  readonly scriptsDir: string;
  readonly scriptFile: string;
} {
  return {
    scriptsDir: joinPaths(rootDir, ".agent", "scripts"),
    scriptFile: joinPaths(rootDir, ".agent", "scripts", scriptFileName),
  };
}

export function resolvePromptScaffoldPaths(
  rootDir: string,
  promptId: string,
): {
  readonly promptsDir: string;
  readonly promptFile: string;
} {
  return {
    promptsDir: joinPaths(rootDir, ".agent", "prompts"),
    promptFile: joinPaths(rootDir, ".agent", "prompts", `${promptId}.md`),
  };
}
