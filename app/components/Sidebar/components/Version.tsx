import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import Badge from "~/components/Badge";
import { client } from "~/utils/ApiClient";
import Logger from "~/utils/Logger";
import { version as currentVersion } from "../../../../package.json";
import env from "~/env";
import SidebarLink from "./SidebarLink";

export default function Version() {
  const [versionsBehind, setVersionsBehind] = useState(-1);
  const { t } = useTranslation();

  const buildTime = env.BUILD_TIME as string | undefined;

  const formattedBuildTime = useMemo(() => {
    if (!buildTime) {return undefined;}
    // Expect format YYYYMMDDHHMM, insert separators for readability
    // YYYY-MM-DD HH:MM
    const match = buildTime.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/);
    if (!match) {return buildTime;}
    const [, y, mo, d, h, mi] = match;
    return `${y}-${mo}-${d} ${h}:${mi}`;
  }, [buildTime]);

  useEffect(() => {
    async function loadVersionInfo() {
      try {
        // Fetch version info from the server-side proxy
        const res = await client.post("/installation.info");
        if (res.data && res.data.versionsBehind >= 0) {
          setVersionsBehind(res.data.versionsBehind);
        }
      } catch (error) {
        Logger.error("Failed to load version info", error);
      }
    }

    void loadVersionInfo();
  }, []);

  return (
    <SidebarLink
      target="_blank"
      href="https://github.com/outline/outline/releases"
      label={
        <>
          v{currentVersion}
          {versionsBehind >= 0 && (
            <>
              <br />
              <LilBadge>
                {versionsBehind === 0
                  ? t("Up to date")
                  : t(`{{ releasesBehind }} versions behind`, {
                      releasesBehind: versionsBehind,
                      count: versionsBehind,
                    })}
              </LilBadge>
            </>
          )}
          {formattedBuildTime && (
            <>
              <br />
              <BuildText>
                {t("Build")}: {formattedBuildTime}
              </BuildText>
            </>
          )}
        </>
      }
    />
  );
}

const LilBadge = styled(Badge)`
  margin-left: 0;
`;

const BuildText = styled.span`
  display: inline-block;
  font-size: 12px;
  color: ${(props) => props.theme.textTertiary};
`;
