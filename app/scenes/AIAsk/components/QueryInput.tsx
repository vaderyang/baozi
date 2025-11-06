import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { s } from "@shared/styles";
import { ArrowIcon, CloseIcon } from "outline-icons";
import Flex from "~/components/Flex";
import Text from "~/components/Text";

const MAX_CHARACTERS = 500;

type Props = {
  onSubmit: (question: string) => void;
  disabled?: boolean;
  placeholder?: string;
  defaultValue?: string;
  autoFocus?: boolean;
};

function QueryInput({
  onSubmit,
  disabled = false,
  placeholder,
  defaultValue = "",
  autoFocus = false,
}: Props) {
  const { t } = useTranslation();
  const [value, setValue] = React.useState(defaultValue);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const characterCount = value.length;
  const isOverLimit = characterCount > MAX_CHARACTERS;
  const canSubmit = value.trim().length > 0 && !isOverLimit && !disabled;

  React.useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  // Auto-resize textarea
  React.useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [value]);

  const handleSubmit = React.useCallback(() => {
    if (canSubmit) {
      onSubmit(value.trim());
      setValue("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  }, [canSubmit, onSubmit, value]);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleClear = React.useCallback(() => {
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = "auto";
    }
  }, []);

  return (
    <Container>
      <InputWrapper $hasError={isOverLimit}>
        <StyledTextarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || t("Ask a question...")}
          disabled={disabled}
          rows={1}
        />
        <ButtonGroup>
          {value.length > 0 && (
            <ClearButton
              type="button"
              onClick={handleClear}
              aria-label={t("Clear")}
              disabled={disabled}
            >
              <CloseIcon size={16} />
            </ClearButton>
          )}
          <SubmitButton
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            aria-label={t("Submit question")}
            $canSubmit={canSubmit}
          >
            <ArrowIcon size={18} />
          </SubmitButton>
        </ButtonGroup>
      </InputWrapper>
      <Footer>
        <Flex justify="space-between" align="center">
          <HintText type="tertiary" size="xsmall">
            {t("Press Enter to submit, Shift+Enter for new line")}
          </HintText>
          <CharacterCount
            type="tertiary"
            size="xsmall"
            $isOverLimit={isOverLimit}
          >
            {characterCount}/{MAX_CHARACTERS}
          </CharacterCount>
        </Flex>
      </Footer>
    </Container>
  );
}

const Container = styled.div`
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
  padding: 0 16px;
`;

const InputWrapper = styled.div<{ $hasError: boolean }>`
  position: relative;
  display: flex;
  align-items: flex-end;
  background: ${s("background")};
  border: 2px solid
    ${(props) => (props.$hasError ? props.theme.danger : s("inputBorder"))};
  border-radius: 12px;
  padding: 12px 16px;
  transition: border-color 100ms ease-in-out;

  &:focus-within {
    border-color: ${(props) =>
      props.$hasError ? props.theme.danger : s("primary")};
  }
`;

const StyledTextarea = styled.textarea`
  flex: 1;
  background: none;
  border: none;
  outline: none;
  font-size: 15px;
  line-height: 1.5;
  color: ${s("text")};
  resize: none;
  min-height: 24px;
  max-height: 200px;
  overflow-y: auto;
  font-family: inherit;

  &::placeholder {
    color: ${s("placeholder")};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
  flex-shrink: 0;
`;

const ClearButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  padding: 6px;
  cursor: pointer;
  color: ${s("textTertiary")};
  border-radius: 6px;
  transition: all 100ms ease-in-out;

  &:hover:not(:disabled) {
    background: ${s("listItemHoverBackground")};
    color: ${s("text")};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const SubmitButton = styled.button<{ $canSubmit: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${(props) =>
    props.$canSubmit ? s("primary") : s("inputBorder")};
  border: none;
  padding: 8px;
  cursor: ${(props) => (props.$canSubmit ? "pointer" : "not-allowed")};
  color: ${(props) =>
    props.$canSubmit ? props.theme.white : s("textTertiary")};
  border-radius: 8px;
  transition: all 100ms ease-in-out;

  &:hover:not(:disabled) {
    opacity: 0.9;
    transform: scale(1.05);
  }

  &:disabled {
    cursor: not-allowed;
  }
`;

const Footer = styled.div`
  margin-top: 8px;
  padding: 0 4px;
`;

const HintText = styled(Text)`
  opacity: 0.7;
`;

const CharacterCount = styled(Text)<{ $isOverLimit: boolean }>`
  color: ${(props) =>
    props.$isOverLimit ? props.theme.danger : s("textTertiary")};
  font-weight: ${(props) => (props.$isOverLimit ? "600" : "normal")};
`;

export default QueryInput;
