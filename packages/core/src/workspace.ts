import { joinPaths, pathExists } from "./filesystem.js";

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
  readonly configDir: string;
  readonly projectProfilePath: string;
  readonly contextIndexPath: string;
  readonly commandsPath: string;
  readonly harnessManifestPath: string;
  readonly stateDir: string;
  readonly codexDir: string;
  readonly flownessDir: string;
  readonly configPath: string;
  readonly legacyAgentDir: string;
  readonly legacyCodexDir: string;
  readonly legacyConfigPath: string;
}

export function resolveWorkspacePaths(rootDir: string): FlownessWorkspacePaths {
  return {
    rootDir,
    agentDir: joinPaths(rootDir, ".flowness"),
    agentConfigDir: joinPaths(rootDir, ".flowness", "config"),
    agentIssuesDir: joinPaths(rootDir, ".flowness", "issues"),
    agentLogsDir: joinPaths(rootDir, ".flowness", "logs"),
    agentWorkflowsDir: joinPaths(rootDir, ".flowness", "workflows"),
    agentRulesDir: joinPaths(rootDir, ".flowness", "rules"),
    agentSkillsDir: joinPaths(rootDir, ".flowness", "skills"),
    agentScriptsDir: joinPaths(rootDir, ".flowness", "scripts"),
    agentTemplatesDir: joinPaths(rootDir, ".flowness", "templates"),
    agentPromptsDir: joinPaths(rootDir, ".flowness", "prompts"),
    agentSettingsDir: joinPaths(rootDir, ".flowness", "settings"),
    configDir: joinPaths(rootDir, ".flowness", "config"),
    projectProfilePath: joinPaths(rootDir, ".flowness", "project-profile.md"),
    contextIndexPath: joinPaths(rootDir, ".flowness", "context-index.json"),
    commandsPath: joinPaths(rootDir, ".flowness", "commands.json"),
    harnessManifestPath: joinPaths(rootDir, ".flowness", "harness-manifest.json"),
    stateDir: joinPaths(rootDir, ".flowness", "state"),
    codexDir: joinPaths(rootDir, ".codex"),
    flownessDir: joinPaths(rootDir, ".flowness"),
    configPath: joinPaths(rootDir, ".flowness", "config", "project.yaml"),
    legacyAgentDir: joinPaths(rootDir, ".agent"),
    legacyCodexDir: joinPaths(rootDir, ".codex"),
    legacyConfigPath: joinPaths(rootDir, ".agent", "config.yaml"),
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
    issueDir: joinPaths(rootDir, ".flowness", "issues", issueId),
    issueFile: joinPaths(rootDir, ".flowness", "issues", issueId, "issue.md"),
    issueJsonFile: joinPaths(rootDir, ".flowness", "issues", issueId, "issue.json"),
    decompositionFile: joinPaths(rootDir, ".flowness", "issues", issueId, "decomposition.json"),
    decisionsDir: joinPaths(rootDir, ".flowness", "issues", issueId, "decisions"),
    reviewsDir: joinPaths(rootDir, ".flowness", "issues", issueId, "reviews"),
    workflowStateFile: joinPaths(rootDir, ".flowness", "issues", issueId, "workflow-state.json"),
    logFile: joinPaths(rootDir, ".flowness", "logs", `${issueId}.md`),
  };
}

export function resolveLegacyIssuePaths(rootDir: string, issueId: string): {
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

export async function resolveExistingIssuePaths(rootDir: string, issueId: string): Promise<{
  readonly issueDir: string;
  readonly issueFile: string;
  readonly issueJsonFile: string;
  readonly decompositionFile: string;
  readonly decisionsDir: string;
  readonly reviewsDir: string;
  readonly workflowStateFile: string;
  readonly logFile: string;
  readonly isLegacy: boolean;
}> {
  const current = resolveIssuePaths(rootDir, issueId);
  if (
    await pathExists(current.issueJsonFile)
    || await pathExists(current.workflowStateFile)
    || await pathExists(current.logFile)
  ) {
    return {
      ...current,
      isLegacy: false,
    };
  }

  const legacy = resolveLegacyIssuePaths(rootDir, issueId);
  if (
    await pathExists(legacy.issueJsonFile)
    || await pathExists(legacy.workflowStateFile)
    || await pathExists(legacy.logFile)
  ) {
    return {
      ...legacy,
      isLegacy: true,
    };
  }

  return {
    ...current,
    isLegacy: false,
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
    workflowDir: joinPaths(rootDir, ".flowness", "workflows", workflowId),
    workflowFile: joinPaths(rootDir, ".flowness", "workflows", workflowId, "workflow.ts"),
    stepsDir: joinPaths(rootDir, ".flowness", "workflows", workflowId, "steps"),
    workflowReadme: joinPaths(rootDir, ".flowness", "workflows", workflowId, "README.md"),
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
    rulesDir: joinPaths(rootDir, ".flowness", "rules"),
    ruleFile: joinPaths(rootDir, ".flowness", "rules", `${ruleId}.md`),
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
    skillsDir: joinPaths(rootDir, ".flowness", "skills"),
    skillDir: joinPaths(rootDir, ".flowness", "skills", skillId),
    skillFile: joinPaths(rootDir, ".flowness", "skills", skillId, "SKILL.md"),
    readmeFile: joinPaths(rootDir, ".flowness", "skills", skillId, "README.md"),
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
    scriptsDir: joinPaths(rootDir, ".flowness", "scripts"),
    scriptFile: joinPaths(rootDir, ".flowness", "scripts", scriptFileName),
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
    promptsDir: joinPaths(rootDir, ".flowness", "prompts"),
    promptFile: joinPaths(rootDir, ".flowness", "prompts", `${promptId}.md`),
  };
}
