// @flow
import { debounce } from "lodash";
import { observer } from "mobx-react";
import { EmailIcon } from "outline-icons";
import * as React from "react";
import { useTranslation, Trans } from "react-i18next";
import styled from "styled-components";
import Heading from "components/Heading";
import HelpText from "components/HelpText";
import Input from "components/Input";
import Notice from "components/Notice";
import Scene from "components/Scene";
import Subheading from "components/Subheading";
import NotificationListItem from "./components/NotificationListItem";
import env from "env";
import useCurrentUser from "hooks/useCurrentUser";
import useStores from "hooks/useStores";
import useToasts from "hooks/useToasts";

function Notifications() {
  const { notificationSettings } = useStores();
  const { showToast } = useToasts();
  const user = useCurrentUser();
  const { t } = useTranslation();

  const options = [
    {
      event: "documents.publish",
      title: t("Document published"),
      description: t(
        "Receive a notification whenever a new document is published"
      ),
    },
    {
      event: "documents.update",
      title: t("Document updated"),
      description: t(
        "Receive a notification when a document you created is edited"
      ),
    },
    {
      event: "collections.create",
      title: t("Collection created"),
      description: t(
        "Receive a notification whenever a new collection is created"
      ),
    },
    {
      separator: true,
    },
    {
      event: "emails.onboarding",
      title: t("Getting started"),
      description: t(
        "Tips on getting started with Outline`s features and functionality"
      ),
    },
    {
      event: "emails.features",
      title: t("New features"),
      description: t("Receive an email when new features of note are added"),
    },
  ];

  React.useEffect(() => {
    notificationSettings.fetchPage();
  }, [notificationSettings]);

  const showSuccessMessage = debounce(() => {
    showToast(t("Notifications saved"), { type: "success" });
  }, 500);

  const handleChange = React.useCallback(
    async (ev: SyntheticInputEvent<>) => {
      const setting = notificationSettings.getByEvent(ev.target.name);

      if (ev.target.checked) {
        await notificationSettings.save({
          event: ev.target.name,
        });
      } else if (setting) {
        await notificationSettings.delete(setting);
      }

      showSuccessMessage();
    },
    [notificationSettings, showSuccessMessage]
  );

  const showSuccessNotice = window.location.search === "?success";

  return (
    <Scene title={t("Notifications")} icon={<EmailIcon color="currentColor" />}>
      <Heading>{t("Notifications")}</Heading>

      {showSuccessNotice && (
        <Notice>
          <Trans>
            Unsubscription successful. Your notification settings were updated
          </Trans>
        </Notice>
      )}
      <HelpText>
        <Trans>
          Manage when and where you receive email notifications from Outline.
          Your email address can be updated in your SSO provider.
        </Trans>
      </HelpText>

      {env.EMAIL_ENABLED ? (
        <>
          <Input
            type="email"
            value={user.email}
            label={t("Email address")}
            readOnly
            short
          />

          <Subheading>{t("Notifications")}</Subheading>

          {options.map((option, index) => {
            if (option.separator) {
              return <Separator key={`separator-${index}`} />;
            }

            const setting = notificationSettings.getByEvent(option.event);

            return (
              <NotificationListItem
                key={option.event}
                onChange={handleChange}
                setting={setting}
                disabled={
                  (setting && setting.isSaving) ||
                  notificationSettings.isFetching
                }
                {...option}
              />
            );
          })}
        </>
      ) : (
        <Notice>
          <Trans>
            The email integration is currently disabled. Please set the
            associated environment variables and restart the server to enable
            notifications.
          </Trans>
        </Notice>
      )}
    </Scene>
  );
}

const Separator = styled.hr`
  padding-bottom: 12px;
`;

export default observer(Notifications);
