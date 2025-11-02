import Router from "koa-router";
import { Client, UserRole } from "@shared/types";
import slugify from "@shared/utils/slugify";
import teamCreator from "@server/commands/teamCreator";
import { ValidationError } from "@server/errors";
import auth from "@server/middlewares/authentication";
import { transaction } from "@server/middlewares/transaction";
import validate from "@server/middlewares/validate";
import { Team, User } from "@server/models";
import { APIContext } from "@server/types";
import { signIn } from "@server/utils/authentication";
import { getVersion, getVersionInfo } from "@server/utils/getInstallationInfo";
import * as T from "./schema";

// Note: This entire router is only mounted in self-hosted installations.
const router = new Router();

router.post(
  "installation.create",
  validate(T.InstallationCreateSchema),
  transaction(),
  async (ctx: APIContext<T.InstallationCreateSchemaReq>) => {
    const { teamName, userName, userEmail } = ctx.input.body;
    const { transaction } = ctx.state;

    // Check that this can only be called when there are no existing teams
    const existingTeamCount = await Team.count({ transaction });
    if (existingTeamCount > 0) {
      throw ValidationError("Installation already has existing teams");
    }

    const team = await teamCreator(ctx, {
      name: teamName,
      subdomain: slugify(teamName),
      authenticationProviders: [],
    });

    const user = await User.createWithCtx(ctx, {
      name: userName,
      email: userEmail,
      teamId: team.id,
      role: UserRole.Admin,
    });

    await signIn(ctx, "email", {
      user,
      team,
      isNewTeam: true,
      isNewUser: true,
      client: Client.Web,
    });
  }
);

router.post("installation.info", auth(), async (ctx: APIContext) => {
  const currentVersion = getVersion();

  // 尝试获取版本信息，如果禁用或失败则返回当前版本
  let latestVersion = currentVersion;
  let versionsBehind = -1;

  // 检查是否启用了更新检查（复用 ENABLE_UPDATES 环境变量）
  const checkEnabled = process.env.ENABLE_UPDATES !== "false";

  if (checkEnabled) {
    try {
      const versionInfo = await getVersionInfo(currentVersion);
      latestVersion = versionInfo.latestVersion;
      versionsBehind = versionInfo.versionsBehind;
    } catch (_error) {
      // 忽略错误，使用默认值
    }
  }

  ctx.body = {
    data: {
      version: currentVersion,
      latestVersion,
      versionsBehind,
    },
    policies: [],
  };
});

export default router;
