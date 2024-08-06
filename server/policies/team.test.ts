import { UserRole } from "@shared/types";
import { buildUser, buildTeam, buildAdmin } from "@server/test/factories";
import { setSelfHosted } from "@server/test/support";
import { serialize } from "./index";

describe("policies/team", () => {
  it("should allow reading only", async () => {
    setSelfHosted();

    const team = await buildTeam();
    const user = await buildUser({
      teamId: team.id,
    });
    const abilities = serialize(user, team);
    expect(abilities.read).toEqual(true);
    expect(abilities.createTeam).toEqual(false);
    expect(abilities.createAttachment).toEqual(true);
    expect(abilities.createCollection).toEqual(true);
    expect(abilities.createTemplate).toEqual(true);
    expect(abilities.createGroup).toEqual(false);
    expect(abilities.createIntegration).toEqual(false);
  });

  it("should allow admins to manage", async () => {
    setSelfHosted();

    const team = await buildTeam();
    const admin = await buildAdmin({
      teamId: team.id,
    });
    const abilities = serialize(admin, team);
    expect(abilities.read).toEqual(true);
    expect(abilities.createTeam).toEqual(false);
    expect(abilities.createAttachment).toEqual(true);
    expect(abilities.createCollection).toEqual(true);
    expect(abilities.createTemplate).toEqual(true);
    expect(abilities.createGroup).toEqual(true);
    expect(abilities.createIntegration).toEqual(true);
  });

  it("should allow creation on hosted envs", async () => {
    const team = await buildTeam();
    const admin = await buildAdmin({
      teamId: team.id,
    });
    const abilities = serialize(admin, team);
    expect(abilities.read).toEqual(true);
    expect(abilities.createTeam).toEqual(true);
    expect(abilities.createAttachment).toEqual(true);
    expect(abilities.createCollection).toEqual(true);
    expect(abilities.createTemplate).toEqual(true);
    expect(abilities.createGroup).toEqual(true);
    expect(abilities.createIntegration).toEqual(true);
  });

  describe("read template", () => {
    const permissions = new Map<UserRole, boolean>([
      [UserRole.Admin, true],
      [UserRole.Member, true],
      [UserRole.Viewer, false],
      [UserRole.Guest, true],
    ]);
    for (const [role, permission] of permissions.entries()) {
      it(`check permission for ${role}`, async () => {
        const team = await buildTeam();
        const user = await buildUser({
          teamId: team.id,
          role,
        });

        const abilities = serialize(user, team);
        expect(abilities.readTemplate).toEqual(permission);
      });
    }
  });

  describe("create template", () => {
    const permissions = new Map<UserRole, boolean>([
      [UserRole.Admin, true],
      [UserRole.Member, true],
      [UserRole.Viewer, false],
      [UserRole.Guest, false],
    ]);
    for (const [role, permission] of permissions.entries()) {
      it(`check permission for ${role}`, async () => {
        const team = await buildTeam();
        const user = await buildUser({
          teamId: team.id,
          role,
        });

        const abilities = serialize(user, team);
        expect(abilities.createTemplate).toEqual(permission);
      });
    }
  });

  describe("update template", () => {
    const permissions = new Map<UserRole, boolean>([
      [UserRole.Admin, true],
      [UserRole.Member, false],
      [UserRole.Viewer, false],
      [UserRole.Guest, false],
    ]);
    for (const [role, permission] of permissions.entries()) {
      it(`check permission for ${role}`, async () => {
        const team = await buildTeam();
        const user = await buildUser({
          teamId: team.id,
          role,
        });

        const abilities = serialize(user, team);
        expect(abilities.updateTemplate).toEqual(permission);
      });
    }
  });
});
