import * as React from "react";
import { useTranslation } from "react-i18next";
import styled, { keyframes } from "styled-components";
import { s } from "@shared/styles";
import Text from "~/components/Text";

type Props = {
  followups: string[];
  onFollowupClick: (question: string) => void;
};

function Followups({ followups, onFollowupClick }: Props) {
  const { t } = useTranslation();

  if (!followups || followups.length === 0) {
    return null;
  }

  return (
    <Container>
      <Title type="secondary" size="small">
        {t("Suggested follow-up questions")}:
      </Title>
      <ChipContainer>
        {followups.map((followup, index) => (
          <Chip
            key={index}
            onClick={() => onFollowupClick(followup)}
            $delay={index * 0.1}
          >
            {followup}
          </Chip>
        ))}
      </ChipContainer>
    </Container>
  );
}

const fadeIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const Container = styled.div`
  padding: 16px;
  border-top: 1px solid ${s("divider")};
  background: ${s("sidebarBackground")};
`;

const Title = styled(Text)`
  font-weight: 500;
  margin-bottom: 12px;
  display: block;
`;

const ChipContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;

  /* Hide scrollbar but keep functionality */
  scrollbar-width: thin;
  scrollbar-color: ${s("divider")} transparent;

  &::-webkit-scrollbar {
    height: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: ${s("divider")};
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: ${s("textTertiary")};
  }
`;

const Chip = styled.button<{ $delay: number }>`
  background: ${s("background")};
  border: 1px solid ${s("divider")};
  border-radius: 20px;
  padding: 8px 16px;
  font-size: 14px;
  color: ${s("text")};
  cursor: pointer;
  transition: all 150ms ease-in-out;
  white-space: nowrap;
  flex-shrink: 0;
  animation: ${fadeIn} 0.3s ease-out forwards;
  animation-delay: ${(props) => props.$delay}s;
  opacity: 0;

  &:hover {
    background: ${s("listItemHoverBackground")};
    border-color: ${s("accent")};
    color: ${s("accent")};
    transform: translateY(-2px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  &:active {
    transform: translateY(0);
  }
`;

export default Followups;
