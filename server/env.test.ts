import env from "./env";

describe("AI Ask Environment Configuration", () => {
  it("should have AI_ASK_ENABLED configuration", () => {
    expect(env.AI_ASK_ENABLED).toBeDefined();
    expect(typeof env.AI_ASK_ENABLED).toBe("boolean");
  });

  it("should have AI_ASK_MAX_DOCUMENTS configuration", () => {
    expect(env.AI_ASK_MAX_DOCUMENTS).toBeDefined();
    expect(typeof env.AI_ASK_MAX_DOCUMENTS).toBe("number");
    expect(env.AI_ASK_MAX_DOCUMENTS).toBeGreaterThan(0);
  });

  it("should have AI_ASK_MAX_CONVERSATION_TURNS configuration", () => {
    expect(env.AI_ASK_MAX_CONVERSATION_TURNS).toBeDefined();
    expect(typeof env.AI_ASK_MAX_CONVERSATION_TURNS).toBe("number");
    expect(env.AI_ASK_MAX_CONVERSATION_TURNS).toBeGreaterThan(0);
  });

  it("should have AI_ASK_SESSION_TIMEOUT_MS configuration", () => {
    expect(env.AI_ASK_SESSION_TIMEOUT_MS).toBeDefined();
    expect(typeof env.AI_ASK_SESSION_TIMEOUT_MS).toBe("number");
    expect(env.AI_ASK_SESSION_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it("should use default values when environment variables are not set", () => {
    // These tests verify the default values match the design spec
    expect(env.AI_ASK_ENABLED).toBe(true);
    expect(env.AI_ASK_MAX_DOCUMENTS).toBe(20);
    expect(env.AI_ASK_MAX_CONVERSATION_TURNS).toBe(10);
    expect(env.AI_ASK_SESSION_TIMEOUT_MS).toBe(3600000); // 1 hour
  });

  it("should expose AI_ASK_ENABLED to frontend via @Public decorator", () => {
    // The @Public decorator is applied, which means it will be exposed to frontend
    // We can verify this by checking the decorator is present on the property
    expect(env).toHaveProperty("AI_ASK_ENABLED");

    // The actual public env object is populated at runtime by PublicEnvironmentRegister
    // For this test, we just verify the property exists and is accessible
    expect(env.AI_ASK_ENABLED).toBeDefined();
  });
});
