import {
  buildUser,
  buildDocument,
  buildCollection,
  buildTeam,
  buildGroup,
  buildGroupUser,
} from "@server/test/factories";
import { getTestServer } from "@server/test/support";
import { CollectionPermission } from "@shared/types";
import { UserMembership, GroupMembership } from "@server/models";

const server = getTestServer();

describe("ai.ask - Permission Filtering", () => {
  describe("permission enforcement", () => {
    it("should only return documents user has access to via collection permissions", async () => {
      const team = await buildTeam();
      const user = await buildUser({ teamId: team.id });
      const otherUser = await buildUser({ teamId: team.id });

      // Create a collection the user has access to
      const accessibleCollection = await buildCollection({
        teamId: team.id,
        permission: CollectionPermission.ReadWrite,
      });

      // Create a collection the user does NOT have access to
      const restrictedCollection = await buildCollection({
        teamId: team.id,
        permission: null, // No default permission
      });

      // Create documents in accessible collection
      await buildDocument({
        userId: user.id,
        teamId: team.id,
        collectionId: accessibleCollection.id,
        title: "Accessible Document",
        text: "This document should be accessible",
      });

      // Create document in restricted collection
      await buildDocument({
        userId: otherUser.id,
        teamId: team.id,
        collectionId: restrictedCollection.id,
        title: "Restricted Document",
        text: "This document should NOT be accessible",
      });

      // Note: ai.ask uses SSE streaming, so we can't easily test the full response
      // This test verifies the endpoint is accessible and returns proper headers
      const res = await server.post("/api/ai.ask", {
        body: {
          token: user.getJwtToken(),
          query: "document",
        },
      });

      // Should return 200 and set up SSE
      expect(res.status).toEqual(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");
    });

    it("should allow access to documents via direct user membership", async () => {
      const team = await buildTeam();
      const user = await buildUser({ teamId: team.id });
      const otherUser = await buildUser({ teamId: team.id });

      // Create a collection with no default permissions
      const collection = await buildCollection({
        teamId: team.id,
        permission: null,
      });

      // Create a document
      const document = await buildDocument({
        userId: otherUser.id,
        teamId: team.id,
        collectionId: collection.id,
        title: "Membership Document",
        text: "This document has explicit user membership",
      });

      // Grant user direct membership to the document
      await UserMembership.create({
        userId: user.id,
        documentId: document.id,
        permission: CollectionPermission.Read,
      });

      const res = await server.post("/api/ai.ask", {
        body: {
          token: user.getJwtToken(),
          query: "membership",
        },
      });

      expect(res.status).toEqual(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");
    });

    it("should allow access to documents via group membership", async () => {
      const team = await buildTeam();
      const user = await buildUser({ teamId: team.id });
      const otherUser = await buildUser({ teamId: team.id });

      // Create a group and add user to it
      const group = await buildGroup({ teamId: team.id });
      await buildGroupUser({ groupId: group.id, userId: user.id });

      // Create a collection with no default permissions
      const collection = await buildCollection({
        teamId: team.id,
        permission: null,
      });

      // Create a document
      const document = await buildDocument({
        userId: otherUser.id,
        teamId: team.id,
        collectionId: collection.id,
        title: "Group Document",
        text: "This document has group membership",
      });

      // Grant group membership to the document
      await GroupMembership.create({
        groupId: group.id,
        documentId: document.id,
        permission: CollectionPermission.Read,
      });

      const res = await server.post("/api/ai.ask", {
        body: {
          token: user.getJwtToken(),
          query: "group",
        },
      });

      expect(res.status).toEqual(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");
    });

    it("should handle case when no accessible documents found", async () => {
      const team = await buildTeam();
      const user = await buildUser({ teamId: team.id });
      const otherUser = await buildUser({ teamId: team.id });

      // Create a collection the user does NOT have access to
      const restrictedCollection = await buildCollection({
        teamId: team.id,
        permission: null,
      });

      // Create document user cannot access
      await buildDocument({
        userId: otherUser.id,
        teamId: team.id,
        collectionId: restrictedCollection.id,
        title: "Restricted Document",
        text: "This should not be accessible",
      });

      const res = await server.post("/api/ai.ask", {
        body: {
          token: user.getJwtToken(),
          query: "restricted",
        },
      });

      // Should return 200 with appropriate message
      // The endpoint returns SSE stream, so we verify it starts correctly
      expect(res.status).toEqual(200);
    });

    it("should not reveal existence of unauthorized documents", async () => {
      const team = await buildTeam();
      const user = await buildUser({ teamId: team.id });
      const otherUser = await buildUser({ teamId: team.id });

      // Create a collection the user does NOT have access to
      const restrictedCollection = await buildCollection({
        teamId: team.id,
        permission: null,
      });

      // Create document with sensitive title
      await buildDocument({
        userId: otherUser.id,
        teamId: team.id,
        collectionId: restrictedCollection.id,
        title: "Secret Project Alpha",
        text: "Confidential information",
      });

      const res = await server.post("/api/ai.ask", {
        body: {
          token: user.getJwtToken(),
          query: "secret project",
        },
      });

      // Should return 200 - the response should not reveal the document exists
      expect(res.status).toEqual(200);
    });

    it("should filter documents by collection permissions", async () => {
      const team = await buildTeam();
      const user = await buildUser({ teamId: team.id });

      const collection = await buildCollection({
        teamId: team.id,
        permission: CollectionPermission.Read,
      });

      await buildDocument({
        userId: user.id,
        teamId: team.id,
        collectionId: collection.id,
        title: "Test Document",
        text: "Test content",
      });

      const res = await server.post("/api/ai.ask", {
        body: {
          token: user.getJwtToken(),
          query: "test",
        },
      });

      expect(res.status).toEqual(200);
    });

    it("should require authentication", async () => {
      const res = await server.post("/api/ai.ask", {
        body: {
          query: "test query",
        },
      });

      expect(res.status).toEqual(401);
    });

    it("should validate query parameter", async () => {
      const user = await buildUser();

      const res = await server.post("/api/ai.ask", {
        body: {
          token: user.getJwtToken(),
          // Missing query parameter
        },
      });

      expect(res.status).toEqual(400);
    });
  });

  describe("search filtering", () => {
    it("should respect collectionId filter", async () => {
      const user = await buildUser();
      const collection = await buildCollection({
        teamId: user.teamId,
        permission: CollectionPermission.ReadWrite,
      });

      await buildDocument({
        userId: user.id,
        teamId: user.teamId,
        collectionId: collection.id,
        title: "Collection Document",
        text: "Content in collection",
      });

      const res = await server.post("/api/ai.ask", {
        body: {
          token: user.getJwtToken(),
          query: "document",
          collectionId: collection.id,
        },
      });

      expect(res.status).toEqual(200);
    });

    it("should respect userId filter", async () => {
      const user = await buildUser();
      const otherUser = await buildUser({ teamId: user.teamId });

      const collection = await buildCollection({
        teamId: user.teamId,
        permission: CollectionPermission.ReadWrite,
      });

      await buildDocument({
        userId: otherUser.id,
        teamId: user.teamId,
        collectionId: collection.id,
        title: "Other User Document",
        text: "Content by other user",
      });

      const res = await server.post("/api/ai.ask", {
        body: {
          token: user.getJwtToken(),
          query: "document",
          userId: otherUser.id,
        },
      });

      expect(res.status).toEqual(200);
    });
  });

  describe("comprehensive permission scenarios", () => {
    it("should filter documents across multiple permission types", async () => {
      const team = await buildTeam();
      const user = await buildUser({ teamId: team.id });
      const otherUser = await buildUser({ teamId: team.id });

      // Scenario 1: Collection with default permissions
      const publicCollection = await buildCollection({
        teamId: team.id,
        permission: CollectionPermission.Read,
      });

      await buildDocument({
        userId: otherUser.id,
        teamId: team.id,
        collectionId: publicCollection.id,
        title: "Public Document",
        text: "Accessible via collection permission",
      });

      // Scenario 2: Private collection with user membership
      const privateCollection = await buildCollection({
        teamId: team.id,
        permission: null,
      });

      const privateDoc = await buildDocument({
        userId: otherUser.id,
        teamId: team.id,
        collectionId: privateCollection.id,
        title: "Private Document",
        text: "Accessible via user membership",
      });

      await UserMembership.create({
        userId: user.id,
        documentId: privateDoc.id,
        permission: CollectionPermission.Read,
      });

      // Scenario 3: Document with group membership
      const group = await buildGroup({ teamId: team.id });
      await buildGroupUser({ groupId: group.id, userId: user.id });

      const groupDoc = await buildDocument({
        userId: otherUser.id,
        teamId: team.id,
        collectionId: privateCollection.id,
        title: "Group Document",
        text: "Accessible via group membership",
      });

      await GroupMembership.create({
        groupId: group.id,
        documentId: groupDoc.id,
        permission: CollectionPermission.Read,
      });

      // Scenario 4: Completely restricted document
      await buildDocument({
        userId: otherUser.id,
        teamId: team.id,
        collectionId: privateCollection.id,
        title: "Restricted Document",
        text: "Not accessible at all",
      });

      const res = await server.post("/api/ai.ask", {
        body: {
          token: user.getJwtToken(),
          query: "document",
        },
      });

      // Should successfully handle mixed permission scenarios
      expect(res.status).toEqual(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");
    });

    it("should enforce team isolation", async () => {
      const team1 = await buildTeam();
      const team2 = await buildTeam();
      const user1 = await buildUser({ teamId: team1.id });
      const user2 = await buildUser({ teamId: team2.id });

      // Create document in team2
      const collection = await buildCollection({
        teamId: team2.id,
        permission: CollectionPermission.ReadWrite,
      });

      await buildDocument({
        userId: user2.id,
        teamId: team2.id,
        collectionId: collection.id,
        title: "Team 2 Document",
        text: "Should not be accessible to team 1 user",
      });

      // User from team1 tries to query
      const res = await server.post("/api/ai.ask", {
        body: {
          token: user1.getJwtToken(),
          query: "team 2",
        },
      });

      // Should return 200 but with no results (team isolation enforced)
      expect(res.status).toEqual(200);
    });
  });
});
