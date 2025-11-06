import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { CloseIcon, SearchIcon, WarningIcon } from "outline-icons";
import { s } from "@shared/styles";
import Button from "~/components/Button";
import Flex from "~/components/Flex";
import Text from "~/components/Text";
import { ErrorState as ErrorStateType } from "~/stores/AIAskStore";

type Props = {
  error: ErrorStateType;
  onRetry?: () => void;
  onDismiss?: () => void;
};

function ErrorState({ error, onRetry, onDismiss }: Props) {
  const { t } = useTranslation();

  const getIcon = () => {
    switch (error.type) {
      case "no_results":
        return <SearchIcon size={24} />;
      case "network":
      case "timeout":
      case "llm":
      case "permission":
      default:
        return <WarningIcon size={24} />;
    }
  };

  const getTitle = () => {
    switch (error.type) {
      case "no_results":
        return t("No results found");
      case "network":
        return t("Connection error");
      case "timeout":
        return t("Request timed out");
      case "permission":
        return t("Access denied");
      case "llm":
        return t("AI service error");
      default:
        return t("Something went wrong");
    }
  };

  return (
    <Container>
      <ErrorCard>
        {onDismiss && (
          <DismissButton onClick={onDismiss} aria-label={t("Dismiss error")}>
            <CloseIcon size={16} />
          </DismissButton>
        )}

        <IconContainer $type={error.type}>{getIcon()}</IconContainer>

        <ErrorTitle>{getTitle()}</ErrorTitle>

        <ErrorMessage type="secondary">{error.message}</ErrorMessage>

        {error.suggestions && error.suggestions.length > 0 && (
          <SuggestionsContainer>
            <SuggestionsTitle type="tertiary" size="small">
              {t("Suggestions")}:
            </SuggestionsTitle>
            <SuggestionsList>
              {error.suggestions.map((suggestion, index) => (
                <SuggestionItem key={index}>
                  <BulletPoint>•</BulletPoint>
                  <Text size="small">{suggestion}</Text>
                </SuggestionItem>
              ))}
            </SuggestionsList>
          </SuggestionsContainer>
        )}

        {error.retryable && onRetry && (
          <ActionButtons>
            <Button onClick={onRetry}>{t("Try again")}</Button>
          </ActionButtons>
        )}
      </ErrorCard>
    </Container>
  );
}

const Container = styled.div`
  display: flex;
  justify-content: center;
  padding: 16px 0;
`;

const ErrorCard = styled.div`
  position: relative;
  background: ${s("background")};
  border: 1px solid ${(props) => props.theme.danger};
  border-radius: 12px;
  padding: 24px;
  max-width: 600px;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
`;

const DismissButton = styled.button`
  position: absolute;
  top: 12px;
  right: 12px;
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  color: ${s("textTertiary")};
  border-radius: 4px;
  transition: all 100ms ease-in-out;

  &:hover {
    background: ${s("listItemHoverBackground")};
    color: ${s("text")};
  }
`;

const IconContainer = styled.div<{ $type: string }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: ${(props) => {
    switch (props.$type) {
      case "no_results":
        return s("backgroundTertiary");
      case "permission":
        return `${props.theme.danger}20`;
      default:
        return `${props.theme.warning}20`;
    }
  }};
  color: ${(props) => {
    switch (props.$type) {
      case "no_results":
        return s("textSecondary");
      case "permission":
        return props.theme.danger;
      default:
        return props.theme.warning;
    }
  }};
`;

const ErrorTitle = styled.h3`
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: ${s("text")};
  text-align: center;
`;

const ErrorMessage = styled(Text)`
  text-align: center;
  max-width: 500px;
`;

const SuggestionsContainer = styled.div`
  width: 100%;
  background: ${s("sidebarBackground")};
  border-radius: 8px;
  padding: 16px;
  margin-top: 8px;
`;

const SuggestionsTitle = styled(Text)`
  font-weight: 500;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const SuggestionsList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const SuggestionItem = styled.li`
  display: flex;
  align-items: flex-start;
  gap: 8px;
`;

const BulletPoint = styled.span`
  color: ${s("textTertiary")};
  font-weight: bold;
  flex-shrink: 0;
`;

const ActionButtons = styled(Flex)`
  margin-top: 8px;
  gap: 8px;
`;

export default ErrorState;
