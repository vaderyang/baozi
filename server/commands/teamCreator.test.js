// @flow
import { buildTeam } from "../test/factories";
import { flushdb } from "../test/support";
import teamCreator from "./teamCreator";

jest.mock("aws-sdk", () => {
  const mS3 = { putObject: jest.fn().mockReturnThis(), promise: jest.fn() };
  return {
    S3: jest.fn(() => mS3),
    Endpoint: jest.fn(),
  };
});

beforeEach(() => flushdb());

describe("teamCreator", () => {
  it("should create team and authentication provider", async () => {
    const result = await teamCreator({
      name: "Test team",
      subdomain: "example",
      avatarUrl: "http://example.com/logo.png",
      authenticationProvider: {
        name: "google",
        providerId: "example.com",
      },
    });

    const { team, authenticationProvider, isNewTeam } = result;

    expect(authenticationProvider.name).toEqual("google");
    expect(authenticationProvider.providerId).toEqual("example.com");
    expect(team.name).toEqual("Test team");
    expect(team.subdomain).toEqual("example");
    expect(isNewTeam).toEqual(true);
  });

  it("should return exising team", async () => {
    const authenticationProvider = {
      name: "google",
      providerId: "example.com",
    };

    const existing = await buildTeam({
      subdomain: "example",
      authenticationProviders: [authenticationProvider],
    });

    const result = await teamCreator({
      name: "Updated name",
      subdomain: "example",
      authenticationProvider,
    });

    const { team, isNewTeam } = result;

    expect(team.id).toEqual(existing.id);
    expect(team.name).toEqual(existing.name);
    expect(team.subdomain).toEqual("example");
    expect(isNewTeam).toEqual(false);
  });
});
