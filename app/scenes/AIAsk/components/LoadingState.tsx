import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { s } from "@shared/styles";
import Flex from "~/components/Flex";
import LoadingIndicator from "~/components/LoadingIndicator";
import Text from "~/components/Text";
import Button from "~/components/Button";
import { CloseIcon } from "outline-icons";

type Props = {
  phase: "searching" | "generating" | null;
  elapsedTime: number;
  showEstimatedTime: boolean;
  onCancel?: () => void;
};

function LoadingState({
  phase,
  elapsedTime,
  showEstimatedTime,
  onCancel,
}: Props) {
  const { t } = useTranslation();

  const getMessage = () => {
    if (phase === "searching") {
      return t("Searching documents...");
    } else if (phase === "generating") {
      return t("Generating answer...");
    }
    return t("Processing your question...");
  };

  const getEstimatedTime = () => {
    const remainingSeconds = Math.max(0, 30 - Math.floor(elapsedTime / 1000));
    if (remainingSeconds > 0) {
      return t("Estimated time remaining: {{seconds}}s", {
        seconds: remainingSeconds,
      });
    }
    return t("Almost done...");
  };

  return (
    <Container>
      <LoadingCard>
        <LoadingIndicator />
        <MessageContainer column align="center" gap={8}>
          <Text size="small" weight="bold">
            {getMessage()}
          </Text>
          {showEstimatedTime && (
            <EstimatedTime type="tertiary" size="xsmall">
              {getEstimatedTime()}
            </EstimatedTime>
          )}
        </MessageContainer>
        {onCancel && (
          <CancelButton onClick={onCancel} icon={<CloseIcon />}>
            {t("Cancel")}
          </CancelButton>
        )}
      </LoadingCard>
    </Container>
  );
}

const Container = styled.div`
  display: flex;
  justify-content: center;
  padding: 16px 0;
`;

const LoadingCard = styled.div`
  background: ${s("sidebarBackground")};
  border: 1px solid ${s("divider")};
  border-radius: 12px;
  padding: 24px;
  max-width: 400px;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
`;

const MessageContainer = styled(Flex)`
  text-align: center;
`;

const EstimatedTime = styled(Text)`
  font-style: italic;
`;

const CancelButton = styled(Button)`
  margin-top: 8px;
`;

export default LoadingState;
