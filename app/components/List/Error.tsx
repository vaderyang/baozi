import { DisconnectedIcon, WarningIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import Empty from "~/components/Empty";
import useEventListener from "~/hooks/useEventListener";
import { OfflineError } from "~/utils/errors";
import ButtonLink from "../ButtonLink";
import Flex from "../Flex";

type Props = {
  error: Error;
  retry: () => void;
};

export default function LoadingError({ error, retry, ...rest }: Props) {
  const { t } = useTranslation();
  useEventListener("online", retry);

  const message =
    error instanceof OfflineError ? (
      <>
        <DisconnectedIcon color="currentColor" /> {t("You’re offline.")}
      </>
    ) : (
      <>
        <WarningIcon color="currentColor" /> {t("Sorry, an error occurred.")}
      </>
    );

  return (
    <Content {...rest}>
      <Flex align="center" gap={4}>
        {message}{" "}
        <ButtonLink onClick={() => retry()}>{t("Click to retry")}…</ButtonLink>
      </Flex>
    </Content>
  );
}

const Content = styled(Empty)`
  padding: 8px 0;
  white-space: nowrap;

  ${ButtonLink} {
    color: ${(props) => props.theme.textTertiary};

    &:hover {
      color: ${(props) => props.theme.textSecondary};
      text-decoration: underline;
    }
  }
`;
