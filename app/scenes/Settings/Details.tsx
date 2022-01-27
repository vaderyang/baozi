import { observer } from "mobx-react";
import { TeamIcon } from "outline-icons";
import { useRef, useState } from "react";
import * as React from "react";
import { useTranslation, Trans } from "react-i18next";
import Button from "~/components/Button";
import Heading from "~/components/Heading";
import HelpText from "~/components/HelpText";
import Input from "~/components/Input";
import Scene from "~/components/Scene";
import env from "~/env";
import useCurrentTeam from "~/hooks/useCurrentTeam";
import useStores from "~/hooks/useStores";
import useToasts from "~/hooks/useToasts";
import ImageInput from "./components/ImageInput";

function Details() {
  const { auth } = useStores();
  const { showToast } = useToasts();
  const { t } = useTranslation();
  const team = useCurrentTeam();
  const form = useRef<HTMLFormElement>(null);
  const [name, setName] = useState(team.name);
  const [subdomain, setSubdomain] = useState(team.subdomain);
  const [avatarUrl, setAvatarUrl] = useState<string>(team.avatarUrl);

  const handleSubmit = React.useCallback(
    async (event?: React.SyntheticEvent) => {
      if (event) {
        event.preventDefault();
      }

      try {
        await auth.updateTeam({
          name,
          avatarUrl,
          subdomain,
        });
        showToast(t("Settings saved"), {
          type: "success",
        });
      } catch (err) {
        showToast(err.message, {
          type: "error",
        });
      }
    },
    [auth, showToast, name, avatarUrl, subdomain, t]
  );

  const handleNameChange = React.useCallback(
    (ev: React.ChangeEvent<HTMLInputElement>) => {
      setName(ev.target.value);
    },
    []
  );

  const handleSubdomainChange = React.useCallback(
    (ev: React.ChangeEvent<HTMLInputElement>) => {
      setSubdomain(ev.target.value.toLowerCase());
    },
    []
  );

  const handleAvatarUpload = async (avatarUrl: string) => {
    setAvatarUrl(avatarUrl);
    await auth.updateTeam({
      avatarUrl,
    });
    showToast(t("Logo updated"), {
      type: "success",
    });
  };

  const handleAvatarError = React.useCallback(
    (error: string | null | undefined) => {
      showToast(error || t("Unable to upload new logo"));
    },
    [showToast, t]
  );

  const isValid = form.current && form.current.checkValidity();
  return (
    <Scene title={t("Details")} icon={<TeamIcon color="currentColor" />}>
      <Heading>{t("Details")}</Heading>
      <HelpText>
        <Trans>
          These details affect the way that your Outline appears to everyone on
          the team.
        </Trans>
      </HelpText>

      <ImageInput
        label={t("Logo")}
        onSuccess={handleAvatarUpload}
        onError={handleAvatarError}
        src={avatarUrl}
        borderRadius={0}
      />

      <form onSubmit={handleSubmit} ref={form}>
        <Input
          label={t("Name")}
          name="name"
          autoComplete="organization"
          value={name}
          onChange={handleNameChange}
          required
          short
        />
        {env.SUBDOMAINS_ENABLED && (
          <>
            <Input
              label={t("Subdomain")}
              name="subdomain"
              value={subdomain || ""}
              onChange={handleSubdomainChange}
              autoComplete="off"
              minLength={4}
              maxLength={32}
              short
            />
            {subdomain && (
              <HelpText small>
                <Trans>Your knowledge base will be accessible at</Trans>{" "}
                <strong>{subdomain}.getoutline.com</strong>
              </HelpText>
            )}
          </>
        )}
        <Button type="submit" disabled={auth.isSaving || !isValid}>
          {auth.isSaving ? `${t("Saving")}…` : t("Save")}
        </Button>
      </form>
    </Scene>
  );
}

export default observer(Details);
