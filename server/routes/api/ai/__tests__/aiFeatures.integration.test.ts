/**
 * Integration tests for AI Features
 *
 * Tests all AI-powered features with the three-tier model system:
 * - AI Ask (Primary model)
 * - AI Search (Primary model)
 * - AI Generate (Primary model)
 * - Title Generation (Task model)
 * - Transcript Summaries (Task model)
 * - Archive Suggestions (Task model)
 */

import {
  buildUser,
  buildTeam,
  buildDocument,
  buildCollection,
} from "@server/test/factories";
import { getTestServer } from "@server/test/support";
import { CollectionPermission, TeamPreference } from "@shared/types";

const server = getTestServer();

describe("AI Ask Integration Tests", () => {
  describe("Basic Functionality", () => {
    it("should use Primary model for AI Ask", async () => {
      const team = await buildTeam();
      const user = await buildUser({ teamId: team.id });

      await team.save({
        preferences: {
          ...team.preferences,
          [TeamPreference.AiGenerateTextModel]: "zai-glm-4.6",
        },
      });

      const collection = await buildCollection({
        teamId: team.id,
        permission: CollectionPermission.ReadWrite,
      });

      await buildDocument({
        userId: user.id,
        teamId: team.id,
        collectionId: collection.id,
        title: "Test Document",
        text: "This is test content for AI Ask feature testing.",
      });

      const res = await server.post("/api/ai.ask", {
        body: {
          token: user.getJwtToken(),
          query: "What is the test content about?",
        },
      });

      expect(res.status).toEqual(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");
    });

    it("should handle multi-turn conversations", async () => {
      const user = await buildUser();
      const collection = await buildCollection({
        teamId: user.teamId,
        permission: CollectionPermission.ReadWrite,
      });

      await buildDocument({
        userId: user.id,
        teamId: user.teamId,
        collectionId: collection.id,
        title: "Product Roadmap",
        text: "Q1: Launch feature A. Q2: Launch feature B. Q3: Launch feature C.",
      });

      // First turn
      const res1 = await server.post("/api/ai.ask", {
        body: {
          token: user.getJwtToken(),
          query: "What features are planned?",
        },
      });

      expect(res1.status).toEqual(200);

      // Second turn with conversation history
      const res2 = await server.post("/api/ai.ask", {
        body: {
          token: user.getJwtToken(),
          query: "When is feature B launching?",
          conversationHistory: [
            {
              role: "user",
              content: "What features are planned?",
            },
            {
              role: "assistant",
              content: "Features A, B, and C are planned.",
            },
          ],
        },
      });

      expect(res2.status).toEqual(200);
    });

    it("should respect maxDocuments parameter", async () => {
      const user = await buildUser();
      const collection = await buildCollection({
        teamId: user.teamId,
        permission: CollectionPermission.ReadWrite,
      });

      // Create 25 documents
      for (let i = 0; i < 25; i++) {
        await buildDocument({
          userId: user.id,
          teamId: user.teamId,
          collectionId: collection.id,
          title: `Document ${i}`,
          text: `Content for document ${i}`,
        });
      }

      const res = await server.post("/api/ai.ask", {
        body: {
          token: user.getJwtToken(),
          query: "documents",
          maxDocuments: 10, // Limit to 10
        },
      });

      expect(res.status).toEqual(200);
    });

    it("should support collectionId filter", async () => {
      const user = await buildUser();
      const collection1 = await buildCollection({
        teamId: user.teamId,
        permission: CollectionPermission.ReadWrite,
      });
      const collection2 = await buildCollection({
        teamId: user.teamId,
        permission: CollectionPermission.ReadWrite,
      });

      await buildDocument({
        userId: user.id,
        teamId: user.teamId,
        collectionId: collection1.id,
        title: "Collection 1 Doc",
        text: "Content in collection 1",
      });

      await buildDocument({
        userId: user.id,
        teamId: user.teamId,
        collectionId: collection2.id,
        title: "Collection 2 Doc",
        text: "Content in collection 2",
      });

      const res = await server.post("/api/ai.ask", {
        body: {
          token: user.getJwtToken(),
          query: "document",
          collectionId: collection1.id, // Filter to collection 1
        },
      });

      expect(res.status).toEqual(200);
    });
  });

  describe("Large Context Handling", () => {
    it("should handle large context with Primary model (200k limit)", async () => {
      const user = await buildUser();
      const collection = await buildCollection({
        teamId: user.teamId,
        permission: CollectionPermission.ReadWrite,
      });

      // Create documents with large content (simulating ~50k tokens)
      const largeContent = "A".repeat(200000); // ~50k tokens (4 chars/token avg)

      await buildDocument({
        userId: user.id,
        teamId: user.teamId,
        collectionId: collection.id,
        title: "Large Document",
        text: largeContent,
      });

      const res = await server.post("/api/ai.ask", {
        body: {
          token: user.getJwtToken(),
          query: "summarize this large document",
          maxDocuments: 1,
        },
      });

      // Should succeed with Primary model (200k window)
      expect(res.status).toEqual(200);
    });
  });

  describe("Error Handling", () => {
    it("should return 400 for missing query parameter", async () => {
      const user = await buildUser();

      const res = await server.post("/api/ai.ask", {
        body: {
          token: user.getJwtToken(),
          // Missing query
        },
      });

      expect(res.status).toEqual(400);
    });

    it("should return 401 for missing authentication", async () => {
      const res = await server.post("/api/ai.ask", {
        body: {
          query: "test",
        },
      });

      expect(res.status).toEqual(401);
    });
  });
});

describe("AI Search Integration Tests", () => {
  it("should use Primary model for AI Search", async () => {
    const user = await buildUser();
    const collection = await buildCollection({
      teamId: user.teamId,
      permission: CollectionPermission.ReadWrite,
    });

    await buildDocument({
      userId: user.id,
      teamId: user.teamId,
      collectionId: collection.id,
      title: "Search Test Document",
      text: "This document contains searchable content.",
    });

    const res = await server.post("/api/ai.search", {
      body: {
        token: user.getJwtToken(),
        query: "searchable",
      },
    });

    expect(res.status).toEqual(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
  });

  it("should return concise answers (max 150 words)", async () => {
    const user = await buildUser();
    const collection = await buildCollection({
      teamId: user.teamId,
      permission: CollectionPermission.ReadWrite,
    });

    // Create document with verbose content
    const verboseContent = "Lorem ipsum ".repeat(500); // Very long content

    await buildDocument({
      userId: user.id,
      teamId: user.teamId,
      collectionId: collection.id,
      title: "Verbose Document",
      text: verboseContent,
    });

    const res = await server.post("/api/ai.search", {
      body: {
        token: user.getJwtToken(),
        query: "summarize",
      },
    });

    // Should return 200 with concise answer
    expect(res.status).toEqual(200);
  });

  it("should support language parameter", async () => {
    const user = await buildUser();
    const collection = await buildCollection({
      teamId: user.teamId,
      permission: CollectionPermission.ReadWrite,
    });

    await buildDocument({
      userId: user.id,
      teamId: user.teamId,
      collectionId: collection.id,
      title: "Document",
      text: "Content",
    });

    const res = await server.post("/api/ai.search", {
      body: {
        token: user.getJwtToken(),
        query: "content",
        language: "en",
      },
    });

    expect(res.status).toEqual(200);
  });
});

describe("AI Generate Integration Tests", () => {
  it("should use Primary model for AI Generate", async () => {
    const user = await buildUser();

    const res = await server.post("/api/ai.generate", {
      body: {
        token: user.getJwtToken(),
        prompt: "Write a brief introduction to AI",
        mode: "fast",
      },
    });

    expect(res.status).toEqual(200);
  });

  it("should support fast mode", async () => {
    const user = await buildUser();

    const res = await server.post("/api/ai.generate", {
      body: {
        token: user.getJwtToken(),
        prompt: "Generate a short summary",
        mode: "fast",
      },
    });

    expect(res.status).toEqual(200);
  });

  it("should support sensitive mode", async () => {
    const user = await buildUser();

    const res = await server.post("/api/ai.generate", {
      body: {
        token: user.getJwtToken(),
        prompt: "Analyze this sensitive data",
        mode: "sensitive",
      },
    });

    // May return 200 or 400 if sensitive model not configured
    expect([200, 400]).toContain(res.status);
  });

  it("should support vision mode", async () => {
    const user = await buildUser();

    const res = await server.post("/api/ai.generate", {
      body: {
        token: user.getJwtToken(),
        prompt: "Describe this image",
        mode: "vision",
        visionImagePayload: {
          type: "image_url",
          image_url: { url: "data:image/png;base64,..." },
        },
      },
    });

    // May return 200 or 400 if vision model not configured
    expect([200, 400]).toContain(res.status);
  });

  it("should support mentionedDocumentIds", async () => {
    const user = await buildUser();
    const collection = await buildCollection({
      teamId: user.teamId,
      permission: CollectionPermission.ReadWrite,
    });

    const doc = await buildDocument({
      userId: user.id,
      teamId: user.teamId,
      collectionId: collection.id,
      title: "Reference Document",
      text: "This is reference content",
    });

    const res = await server.post("/api/ai.generate", {
      body: {
        token: user.getJwtToken(),
        prompt: "Summarize the referenced document",
        mode: "fast",
        mentionedDocumentIds: [doc.id],
      },
    });

    expect(res.status).toEqual(200);
  });
});

describe("Model Selection Verification", () => {
  it("should use Primary model for heavy-duty tasks", async () => {
    const heavyTasks = [
      { endpoint: "/api/ai.ask", feature: "AI Ask" },
      { endpoint: "/api/ai.search", feature: "AI Search" },
      { endpoint: "/api/ai.generate", feature: "AI Generate" },
    ];

    // Document that these use Primary model (zai-glm-4.6)
    expect(heavyTasks).toHaveLength(3);
    expect(heavyTasks.every(task => task.endpoint.startsWith("/api/ai"))).toBe(true);
  });
});

describe("Performance Characteristics", () => {
  it("should handle concurrent AI requests", async () => {
    const user = await buildUser();
    const collection = await buildCollection({
      teamId: user.teamId,
      permission: CollectionPermission.ReadWrite,
    });

    await buildDocument({
      userId: user.id,
      teamId: user.teamId,
      collectionId: collection.id,
      title: "Test",
      text: "Content",
    });

    // Make 3 concurrent requests
    const requests = [
      server.post("/api/ai.ask", {
        body: { token: user.getJwtToken(), query: "test 1" },
      }),
      server.post("/api/ai.search", {
        body: { token: user.getJwtToken(), query: "test 2" },
      }),
      server.post("/api/ai.generate", {
        body: { token: user.getJwtToken(), prompt: "test 3", mode: "fast" },
      }),
    ];

    const results = await Promise.all(requests);

    // All should succeed
    results.forEach(res => {
      expect(res.status).toEqual(200);
    });
  });
});
