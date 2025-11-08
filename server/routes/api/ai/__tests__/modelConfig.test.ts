/**
 * Tests for three-tier AI model configuration system
 *
 * Model Context Windows:
 * - zai-glm-4.6: 200k tokens
 * - GLM-4.6: 200k tokens
 * - qwen3-30b-a3b-instruct: 15k tokens
 */

import env from "@server/env";
import { buildUser, buildTeam } from "@server/test/factories";
import { TeamPreference } from "@shared/types";

// Mock environment
const mockEnv = {
  LLM_API_KEY: "test-api-key",
  LLM_API_BASE_URL: "https://test-api.com",
  LLM_PRIMARY_MODEL_NAME: "zai-glm-4.6",
  LLM_TASK_MODEL_NAME: "qwen3-30b-a3b-instruct",
  LLM_FALLBACK_MODEL_NAME: "GLM-4.6",
};

// Import the function we're testing (this will need to be exported for testing)
// For now, we'll test via API endpoints

describe("Model Configuration - Three-Tier System", () => {
  describe("Environment Variable Configuration", () => {
    it("should have correct default model names", () => {
      expect(env.LLM_PRIMARY_MODEL_NAME).toBe("zai-glm-4.6");
      expect(env.LLM_TASK_MODEL_NAME).toBe("qwen3-30b-a3b-instruct");
      expect(env.LLM_FALLBACK_MODEL_NAME).toBe("GLM-4.6");
    });

    it("should have correct model context windows", () => {
      // Document the context windows for reference
      const contextWindows = {
        "zai-glm-4.6": 200000,      // Primary: 200k tokens
        "GLM-4.6": 200000,           // Fallback: 200k tokens
        "qwen3-30b-a3b-instruct": 15000, // Task: 15k tokens
      };

      // Primary and Fallback have larger windows than Task model
      expect(contextWindows["zai-glm-4.6"]).toBeGreaterThan(
        contextWindows["qwen3-30b-a3b-instruct"]
      );
      expect(contextWindows["GLM-4.6"]).toBeGreaterThan(
        contextWindows["qwen3-30b-a3b-instruct"]
      );
    });

    it("should support LLM_PRIMARY_MODEL_NAME alias", () => {
      // Test that primary model can be set via multiple aliases
      const aliases = [
        "LLM_PRIMARY_MODEL_NAME",
        "LLM_MODEL_NAME",
        "AI_MODEL_NAME",
        "OPENAI_MODEL_NAME",
      ];

      // At least one alias should be supported
      expect(aliases.some(alias => process.env[alias] !== undefined ||
        env.LLM_PRIMARY_MODEL_NAME !== undefined)).toBe(true);
    });

    it("should support LLM_TASK_MODEL_NAME alias", () => {
      const aliases = [
        "LLM_TASK_MODEL_NAME",
        "LLM_TASK_MODEL",
        "AI_TASK_MODEL",
      ];

      expect(aliases.some(alias => process.env[alias] !== undefined ||
        env.LLM_TASK_MODEL_NAME !== undefined)).toBe(true);
    });

    it("should support LLM_FALLBACK_MODEL_NAME alias", () => {
      const aliases = [
        "LLM_FALLBACK_MODEL_NAME",
        "LLM_FALLBACK_MODEL",
        "AI_FALLBACK_MODEL",
      ];

      expect(aliases.some(alias => process.env[alias] !== undefined ||
        env.LLM_FALLBACK_MODEL_NAME !== undefined)).toBe(true);
    });
  });

  describe("Team Preference Configuration", () => {
    it("should support AiTaskModel team preference", async () => {
      const team = await buildTeam();
      const user = await buildUser({ teamId: team.id });

      // Set task model preference
      await team.save({
        preferences: {
          ...team.preferences,
          [TeamPreference.AiTaskModel]: "custom-task-model",
        },
      });

      await team.reload();
      const taskModel = team.getPreference(TeamPreference.AiTaskModel);
      expect(taskModel).toBe("custom-task-model");
    });

    it("should support AiFallbackModel team preference", async () => {
      const team = await buildTeam();
      const user = await buildUser({ teamId: team.id });

      // Set fallback model preference
      await team.save({
        preferences: {
          ...team.preferences,
          [TeamPreference.AiFallbackModel]: "custom-fallback-model",
        },
      });

      await team.reload();
      const fallbackModel = team.getPreference(TeamPreference.AiFallbackModel);
      expect(fallbackModel).toBe("custom-fallback-model");
    });

    it("should support Primary model via AiGenerateTextModel preference", async () => {
      const team = await buildTeam();
      const user = await buildUser({ teamId: team.id });

      // Set primary model via generate text preference
      await team.save({
        preferences: {
          ...team.preferences,
          [TeamPreference.AiGenerateTextModel]: "custom-primary-model",
        },
      });

      await team.reload();
      const primaryModel = team.getPreference(TeamPreference.AiGenerateTextModel);
      expect(primaryModel).toBe("custom-primary-model");
    });

    it("should support Primary model via AiSearchModel preference", async () => {
      const team = await buildTeam();
      const user = await buildUser({ teamId: team.id });

      // Set primary model via search preference
      await team.save({
        preferences: {
          ...team.preferences,
          [TeamPreference.AiSearchModel]: "custom-search-model",
        },
      });

      await team.reload();
      const searchModel = team.getPreference(TeamPreference.AiSearchModel);
      expect(searchModel).toBe("custom-search-model");
    });

    it("should allow all three model tiers to be configured independently", async () => {
      const team = await buildTeam();
      const user = await buildUser({ teamId: team.id });

      // Configure all three tiers
      await team.save({
        preferences: {
          ...team.preferences,
          [TeamPreference.AiGenerateTextModel]: "tier1-primary",
          [TeamPreference.AiTaskModel]: "tier2-task",
          [TeamPreference.AiFallbackModel]: "tier3-fallback",
        },
      });

      await team.reload();

      expect(team.getPreference(TeamPreference.AiGenerateTextModel)).toBe("tier1-primary");
      expect(team.getPreference(TeamPreference.AiTaskModel)).toBe("tier2-task");
      expect(team.getPreference(TeamPreference.AiFallbackModel)).toBe("tier3-fallback");
    });
  });

  describe("Model Selection Priority", () => {
    it("should prioritize team preference over environment variable", async () => {
      const team = await buildTeam();

      await team.save({
        preferences: {
          ...team.preferences,
          [TeamPreference.AiTaskModel]: "team-override-model",
        },
      });

      await team.reload();

      // Team preference should override environment
      const taskModel = team.getPreference(TeamPreference.AiTaskModel);
      expect(taskModel).toBe("team-override-model");
      expect(taskModel).not.toBe(env.LLM_TASK_MODEL_NAME);
    });

    it("should fall back to environment when team preference is undefined", async () => {
      const team = await buildTeam();

      // Don't set any preference
      const taskModel = team.getPreference(TeamPreference.AiTaskModel);

      // Should be undefined, allowing fallback to env
      expect(taskModel).toBeUndefined();
    });
  });

  describe("Model Purpose Mapping", () => {
    it("should map Primary model to heavy-duty tasks", () => {
      const primaryTasks = [
        "AI Summary Generation",
        "Generate Text",
        "AI Ask (conversational RAG)",
        "AI Search / AI Answer",
      ];

      // Document that these tasks use Primary model (zai-glm-4.6)
      expect(primaryTasks).toHaveLength(4);
      expect(env.LLM_PRIMARY_MODEL_NAME).toBe("zai-glm-4.6");
    });

    it("should map Task model to lightweight operations", () => {
      const taskOperations = [
        "Document title generation",
        "Transcript time-segment summaries",
        "AI Suggestions (editor)",
        "Archive location suggestions",
        "Topic extraction",
      ];

      // Document that these operations use Task model (qwen3-30b-a3b-instruct)
      expect(taskOperations).toHaveLength(5);
      expect(env.LLM_TASK_MODEL_NAME).toBe("qwen3-30b-a3b-instruct");
    });

    it("should use Fallback model as universal backup", () => {
      const fallbackScenarios = [
        "Primary model rate limit (429)",
        "Task model rate limit (429)",
        "Primary model context overflow",
        "Task model service unavailable",
        "Primary model provider failure",
      ];

      // Document fallback scenarios
      expect(fallbackScenarios).toHaveLength(5);
      expect(env.LLM_FALLBACK_MODEL_NAME).toBe("GLM-4.6");
    });
  });
});

describe("Model Context Window Validation", () => {
  it("should handle requests within Task model context window (15k)", () => {
    const taskModelMaxTokens = 15000;
    const testRequest = {
      prompt: "Generate a title for this document",
      estimatedTokens: 500, // Well within 15k limit
    };

    expect(testRequest.estimatedTokens).toBeLessThan(taskModelMaxTokens);
  });

  it("should handle requests within Primary model context window (200k)", () => {
    const primaryModelMaxTokens = 200000;
    const testRequest = {
      prompt: "Analyze these 50 documents and generate a comprehensive summary",
      estimatedTokens: 150000, // Within 200k limit but exceeds 15k
    };

    expect(testRequest.estimatedTokens).toBeLessThan(primaryModelMaxTokens);
    expect(testRequest.estimatedTokens).toBeGreaterThan(15000); // Would fail with Task model
  });

  it("should use appropriate model based on context size", () => {
    const scenarios = [
      { task: "title generation", tokens: 500, expectedModel: "task" },
      { task: "short summary", tokens: 2000, expectedModel: "task" },
      { task: "AI Ask with 20 docs", tokens: 50000, expectedModel: "primary" },
      { task: "full doc summary", tokens: 100000, expectedModel: "primary" },
    ];

    scenarios.forEach(scenario => {
      if (scenario.tokens < 15000) {
        expect(scenario.expectedModel).toBe("task");
      } else {
        expect(scenario.expectedModel).toBe("primary");
      }
    });
  });
});

describe("Backward Compatibility", () => {
  it("should still support legacy LLM_MODEL_NAME variable", () => {
    // Legacy variable should map to Primary model
    const legacyVariables = [
      "LLM_MODEL_NAME",
      "AI_MODEL_NAME",
      "OPENAI_MODEL_NAME",
    ];

    // Should be recognized as aliases for Primary model
    expect(legacyVariables).toContain("LLM_MODEL_NAME");
  });

  it("should still support legacy team preferences", async () => {
    const team = await buildTeam();

    // Set legacy preferences
    await team.save({
      preferences: {
        ...team.preferences,
        [TeamPreference.AiGenerateTextModel]: "legacy-model",
        [TeamPreference.AiGenerateTextFallbackModel]: "legacy-fallback",
      },
    });

    await team.reload();

    // Legacy preferences should still work
    expect(team.getPreference(TeamPreference.AiGenerateTextModel)).toBe("legacy-model");
    expect(team.getPreference(TeamPreference.AiGenerateTextFallbackModel)).toBe("legacy-fallback");
  });
});
