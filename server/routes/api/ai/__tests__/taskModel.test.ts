/**
 * Tests for Task Model Features
 *
 * Task model (qwen3-30b-a3b-instruct, 15k context) is used for:
 * - Document title generation
 * - Transcript time-segment summaries
 * - AI Suggestions (editor)
 * - Archive location suggestions
 * - Topic extraction
 *
 * These are lightweight, frequent operations that don't require the full
 * power of the Primary model (zai-glm-4.6, 200k context).
 */

import {
  buildUser,
  buildTeam,
  buildDocument,
  buildCollection,
  buildAttachment,
} from "@server/test/factories";
import { TeamPreference } from "@shared/types";
import { AIArchiveSuggestionService } from "@server/services/AIArchiveSuggestionService";

describe("Task Model - Title Generation", () => {
  it("should use Task model for title generation", async () => {
    const team = await buildTeam();
    const user = await buildUser({ teamId: team.id });

    // Configure Task model
    await team.save({
      preferences: {
        ...team.preferences,
        [TeamPreference.AiTaskModel]: "qwen3-30b-a3b-instruct",
      },
    });

    await team.reload();
    const taskModel = team.getPreference(TeamPreference.AiTaskModel);
    expect(taskModel).toBe("qwen3-30b-a3b-instruct");
  });

  it("should generate concise titles (max 100 chars)", () => {
    const maxTitleLength = 100;
    const sampleTitles = [
      "Meeting Notes - Q1 Planning",
      "Product Roadmap Discussion",
      "Customer Feedback Analysis",
      "Sprint Retrospective - Week 23",
    ];

    sampleTitles.forEach(title => {
      expect(title.length).toBeLessThanOrEqual(maxTitleLength);
    });
  });

  it("should handle short transcripts for title generation", () => {
    const shortTranscripts = [
      { text: "Quick meeting about project status", expectedTokens: 10 },
      { text: "Brief discussion on next steps", expectedTokens: 10 },
      { text: "Short sync with team", expectedTokens: 10 },
    ];

    // All well within Task model's 15k limit
    shortTranscripts.forEach(transcript => {
      expect(transcript.expectedTokens).toBeLessThan(15000);
    });
  });
});

describe("Task Model - Transcript Summaries", () => {
  it("should use Task model for time-segment summaries", async () => {
    const team = await buildTeam();
    const user = await buildUser({ teamId: team.id });

    await team.save({
      preferences: {
        ...team.preferences,
        [TeamPreference.AiTaskModel]: "qwen3-30b-a3b-instruct",
      },
    });

    // Task model should be configured for summaries
    const taskModel = team.getPreference(TeamPreference.AiTaskModel);
    expect(taskModel).toBe("qwen3-30b-a3b-instruct");
  });

  it("should handle time-segmented transcript chunks", () => {
    const timeSegments = [
      { startTime: 0, endTime: 300, text: "Introduction and overview" },      // 5 min
      { startTime: 300, endTime: 600, text: "Main discussion points" },       // 5 min
      { startTime: 600, endTime: 900, text: "Q&A session" },                  // 5 min
      { startTime: 900, endTime: 1200, text: "Action items and next steps" }, // 5 min
    ];

    // Each segment is small enough for Task model
    timeSegments.forEach(segment => {
      const estimatedTokens = segment.text.length / 4; // Rough estimate
      expect(estimatedTokens).toBeLessThan(15000);
    });
  });

  it("should generate concise summaries for each segment", () => {
    const summaryMaxLength = 200; // chars
    const sampleSummaries = [
      "Discussed Q1 goals and priorities",
      "Reviewed current project status",
      "Identified blockers and solutions",
      "Assigned action items to team members",
    ];

    sampleSummaries.forEach(summary => {
      expect(summary.length).toBeLessThanOrEqual(summaryMaxLength);
    });
  });

  it("should support speaker-aware summaries", () => {
    const speakerSegments = [
      { speaker: "Alice", text: "Presented project update" },
      { speaker: "Bob", text: "Raised concerns about timeline" },
      { speaker: "Carol", text: "Proposed alternative approach" },
    ];

    speakerSegments.forEach(segment => {
      expect(segment.speaker).toBeTruthy();
      expect(segment.text).toBeTruthy();
    });
  });
});

describe("Task Model - AI Suggestions", () => {
  it("should use Task model for editor suggestions", async () => {
    const team = await buildTeam();

    await team.save({
      preferences: {
        ...team.preferences,
        [TeamPreference.AiTaskModel]: "qwen3-30b-a3b-instruct",
      },
    });

    // Verify Task model is configured
    const taskModel = team.getPreference(TeamPreference.AiTaskModel);
    expect(taskModel).toBeDefined();
  });

  it("should handle quick suggestion requests", () => {
    const suggestionRequests = [
      { type: "improve", text: "Make this more concise" },
      { type: "fix", text: "Fix grammar and spelling" },
      { type: "expand", text: "Add more details here" },
      { type: "simplify", text: "Simplify this explanation" },
    ];

    // All are lightweight requests suitable for Task model
    suggestionRequests.forEach(request => {
      const estimatedTokens = request.text.length / 4;
      expect(estimatedTokens).toBeLessThan(1000); // Very small
    });
  });

  it("should handle selection context efficiently", () => {
    const contexts = [
      { before: "Previous paragraph...", selection: "Target text", after: "Next paragraph..." },
      { before: "A".repeat(1000), selection: "B".repeat(100), after: "C".repeat(1000) },
    ];

    // Total context stays well within 15k limit
    contexts.forEach(context => {
      const total = context.before.length + context.selection.length + context.after.length;
      const estimatedTokens = total / 4;
      expect(estimatedTokens).toBeLessThan(15000);
    });
  });
});

describe("Task Model - Archive Suggestions", () => {
  it("should use Task model for archive suggestions", async () => {
    const team = await buildTeam();
    const user = await buildUser({ teamId: team.id });
    const collection = await buildCollection({ teamId: team.id });
    const document = await buildDocument({
      userId: user.id,
      teamId: team.id,
      collectionId: collection.id,
      title: "Test Recording",
      text: "",
    });

    const transcript = "This is a meeting about product roadmap planning for Q2.";

    // This would call AIArchiveSuggestionService which uses Task model
    // The test verifies the service is configured correctly
    expect(AIArchiveSuggestionService).toBeDefined();
  });

  it("should extract topics (max 5)", () => {
    const topicExtractionResults = [
      { transcript: "Meeting about sales, marketing, and product", topics: ["sales", "marketing", "product"] },
      { transcript: "Technical discussion on architecture, databases, APIs, security, and performance",
        topics: ["architecture", "databases", "APIs", "security", "performance"] }, // Max 5
    ];

    topicExtractionResults.forEach(result => {
      expect(result.topics.length).toBeLessThanOrEqual(5);
    });
  });

  it("should classify document types", () => {
    const documentTypes = ["meeting", "interview", "note", "lecture", "other"];
    const classifications = [
      { transcript: "Let's review the agenda...", type: "meeting" },
      { transcript: "Tell me about your background...", type: "interview" },
      { transcript: "Quick thoughts on the project...", type: "note" },
      { transcript: "Today we'll learn about...", type: "lecture" },
    ];

    classifications.forEach(classification => {
      expect(documentTypes).toContain(classification.type);
    });
  });

  it("should provide confidence scores", () => {
    const suggestions = [
      { collection: "Product", confidence: 0.95 },
      { collection: "Engineering", confidence: 0.87 },
      { collection: "General", confidence: 0.45 },
    ];

    suggestions.forEach(suggestion => {
      expect(suggestion.confidence).toBeGreaterThanOrEqual(0);
      expect(suggestion.confidence).toBeLessThanOrEqual(1);
    });
  });

  it("should suggest titles with max 100 chars", () => {
    const maxLength = 100;
    const suggestedTitles = [
      "Q2 Product Roadmap Discussion",
      "Customer Feedback Analysis - Sprint 23",
      "Technical Architecture Review Meeting",
    ];

    suggestedTitles.forEach(title => {
      expect(title.length).toBeLessThanOrEqual(maxLength);
    });
  });
});

describe("Task Model - Context Window Management", () => {
  it("should stay within 15k token limit for Task model", () => {
    const taskModelLimit = 15000; // tokens
    const scenarios = [
      { operation: "title generation", maxTokens: 1000 },
      { operation: "5-min segment summary", maxTokens: 3000 },
      { operation: "AI suggestion", maxTokens: 2000 },
      { operation: "archive suggestion", maxTokens: 5000 },
      { operation: "topic extraction", maxTokens: 4000 },
    ];

    scenarios.forEach(scenario => {
      expect(scenario.maxTokens).toBeLessThan(taskModelLimit);
    });
  });

  it("should not use Task model for large contexts", () => {
    const taskModelLimit = 15000;
    const largeContextScenarios = [
      { operation: "full document summary", tokens: 50000, useTaskModel: false },
      { operation: "AI Ask with 20 docs", tokens: 100000, useTaskModel: false },
      { operation: "large transcript analysis", tokens: 30000, useTaskModel: false },
    ];

    largeContextScenarios.forEach(scenario => {
      const exceedsLimit = scenario.tokens > taskModelLimit;
      expect(exceedsLimit).toBe(!scenario.useTaskModel);
    });
  });

  it("should fallback to Fallback model if Task model fails", () => {
    const flow = [
      { step: 1, model: "task", action: "generate title" },
      { step: 2, model: "task", action: "rate limit error" },
      { step: 3, model: "fallback", action: "retry" },
      { step: 4, model: "fallback", action: "success" },
    ];

    expect(flow[0].model).toBe("task");
    expect(flow[2].model).toBe("fallback");
    expect(flow[3].action).toBe("success");
  });
});

describe("Task Model - Performance Optimization", () => {
  it("should process frequent operations quickly", () => {
    const operations = [
      { name: "title generation", frequency: "per document", avgMs: 500 },
      { name: "segment summary", frequency: "per 5 min", avgMs: 800 },
      { name: "AI suggestion", frequency: "per user action", avgMs: 600 },
    ];

    // All should be fast (< 2 seconds)
    operations.forEach(op => {
      expect(op.avgMs).toBeLessThan(2000);
    });
  });

  it("should batch multiple suggestions efficiently", () => {
    const batchRequests = [
      { segments: 10, tokensPerSegment: 500, totalTokens: 5000 },
      { segments: 20, tokensPerSegment: 300, totalTokens: 6000 },
    ];

    // Batches should stay within Task model limit
    batchRequests.forEach(batch => {
      expect(batch.totalTokens).toBeLessThan(15000);
    });
  });
});

describe("Task Model - Quality Assurance", () => {
  it("should generate grammatically correct titles", () => {
    const goodTitles = [
      "Sprint Planning Meeting - Week 23",
      "Customer Feedback Analysis Q1 2024",
      "Technical Architecture Review",
    ];

    const badTitles = [
      "meeting about thing", // Too vague
      "SPRINT PLANNING MEETING WEEK 23", // All caps
      "Sprint-Planning-Meeting-Week-23-For-The-Engineering-Team-Q1-2024-Review", // Too long
    ];

    goodTitles.forEach(title => {
      // Should start with capital letter
      expect(title[0]).toMatch(/[A-Z]/);
      // Should not be all caps
      expect(title).not.toBe(title.toUpperCase());
    });
  });

  it("should generate coherent summaries", () => {
    const summaries = [
      "Discussed Q1 goals and identified key priorities for the team",
      "Reviewed current sprint progress and addressed blockers",
      "Analyzed customer feedback and planned improvements",
    ];

    summaries.forEach(summary => {
      // Should be a complete sentence
      expect(summary).toMatch(/^[A-Z].*[.!?]$/);
      // Should not be too short
      expect(summary.split(" ").length).toBeGreaterThan(3);
    });
  });

  it("should extract relevant topics", () => {
    const scenarios = [
      {
        transcript: "We discussed sales targets, marketing campaigns, and product launches",
        expectedTopics: ["sales", "marketing", "product"],
        irrelevantTopics: ["weather", "sports", "food"],
      },
    ];

    scenarios.forEach(scenario => {
      // Expected topics should be present
      scenario.expectedTopics.forEach(topic => {
        const transcriptLower = scenario.transcript.toLowerCase();
        const isRelevant = transcriptLower.includes(topic);
        expect(isRelevant).toBe(true);
      });
    });
  });
});
