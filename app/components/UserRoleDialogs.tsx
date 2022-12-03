import * as React from "react";
import { useTranslation } from "react-i18next";
import User from "~/models/User";
import ConfirmationDialog from "~/components/ConfirmationDialog";
import useStores from "~/hooks/useStores";

type Props = {
  user: User;
  onSubmit: () => void;
};

export function UserChangeToViewerDialog({ user, onSubmit }: Props) {
  const { t } = useTranslation();
  const { users } = useStores();

  const handleSubmit = async () => {
    await users.demote(user, "viewer");
    onSubmit();
  };

  return (
    <ConfirmationDialog
      onSubmit={handleSubmit}
      submitText={t("Confirm")}
      savingText={`${t("Saving")}…`}
    >
      {t(
        "Are you sure you want to make {{ userName }} a read-only viewer? They will not be able to edit any content",
        {
          userName: user.name,
        }
      )}
      .
    </ConfirmationDialog>
  );
}

export function UserChangeToMemberDialog({ user, onSubmit }: Props) {
  const { t } = useTranslation();
  const { users } = useStores();

  const handleSubmit = async () => {
    await users.demote(user, "member");
    onSubmit();
  };

  return (
    <ConfirmationDialog
      onSubmit={handleSubmit}
      submitText={t("Confirm")}
      savingText={`${t("Saving")}…`}
    >
      {t("Are you sure you want to make {{ userName }} a member?", {
        userName: user.name,
      })}
    </ConfirmationDialog>
  );
}

export function UserChangeToAdminDialog({ user, onSubmit }: Props) {
  const { t } = useTranslation();
  const { users } = useStores();

  const handleSubmit = async () => {
    await users.promote(user);
    onSubmit();
  };

  return (
    <ConfirmationDialog
      onSubmit={handleSubmit}
      submitText={t("Confirm")}
      savingText={`${t("Saving")}…`}
    >
      {t(
        "Are you sure you want to make {{ userName }} an admin? Admins can modify team and billing information.",
        {
          userName: user.name,
        }
      )}
    </ConfirmationDialog>
  );
}

export function UserSuspendDialog({ user, onSubmit }: Props) {
  const { t } = useTranslation();
  const { users } = useStores();

  const handleSubmit = async () => {
    await users.suspend(user);
    onSubmit();
  };

  return (
    <ConfirmationDialog
      onSubmit={handleSubmit}
      submitText={t("Confirm")}
      savingText={`${t("Saving")}…`}
    >
      {t(
        "Are you sure you want to suspend {{ userName }}? Suspended users will be prevented from logging in.",
        {
          userName: user.name,
        }
      )}
    </ConfirmationDialog>
  );
}
