import * as React from "react";
import { useTranslation } from "react-i18next";
import styled, { keyframes } from "styled-components";
import { s } from "@shared/styles";
import { CheckmarkIcon, SearchIcon } from "outline-icons";
import breakpoint from "styled-components-breakpoint";
import { AIAskSearchStrategy, AIAskSearchProgress } from "@shared/types";
import Text from "~/components/Text";

type Props = {
  searchStrategy: AIAskSearchStrategy | null;
  searchProgress: Map<string, AIAskSearchProgress>;
  isComplete: boolean;
  totalDocuments?: number;
};

function SearchProgress({
  searchStrategy,
  searchProgress,
  isComplete,
  totalDocuments,
}: Props) {
  const { t } = useTranslation();

  if (!searchStrategy) {
    return null;
  }

  const { keywords } = searchStrategy;

  // Calculate total results across all keywords
  const totalResults = React.useMemo(
    () =>
      Array.from(searchProgress.values()).reduce(
        (sum, progress) => sum + progress.resultCount,
        0
      ),
    [searchProgress]
  );

  return (
    <Container>
      {/* Search Strategy Section */}
      <Section>
        <SectionTitle type="secondary" size="small">
          {t("Search Strategy")}
        </SectionTitle>
        <KeywordChips>
          {keywords.map((keyword, index) => {
            const progress = searchProgress.get(keyword);
            const resultCount = progress?.resultCount ?? 0;
            const status = progress?.status ?? "searching";

            return (
              <KeywordChip key={keyword} $delay={index * 0.05}>
                <KeywordText>{keyword}</KeywordText>
                {progress && (
                  <ResultBadge $status={status}>{resultCount}</ResultBadge>
                )}
              </KeywordChip>
            );
          })}
        </KeywordChips>
      </Section>

      {/* Progress List Section */}
      {searchProgress.size > 0 && (
        <Section>
          <SectionTitle type="secondary" size="small">
            {t("Search Progress")}
          </SectionTitle>
          <ProgressList>
            {keywords.map((keyword) => {
              const progress = searchProgress.get(keyword);
              if (!progress) {
                return null;
              }

              const isSearching = progress.status === "searching";
              const isCompleted = progress.status === "complete";

              return (
                <ProgressItem key={keyword}>
                  <ProgressIcon $status={progress.status}>
                    {isSearching && <SpinningSearchIcon size={16} />}
                    {isCompleted && <CheckmarkIcon size={16} />}
                  </ProgressIcon>
                  <ProgressText>
                    <KeywordName>{keyword}</KeywordName>
                    <ProgressStatus type="tertiary" size="xsmall">
                      {isSearching && t("Searching...")}
                      {isCompleted &&
                        t("Found {{count}} result", {
                          count: progress.resultCount,
                        })}
                    </ProgressStatus>
                  </ProgressText>
                </ProgressItem>
              );
            })}
          </ProgressList>
        </Section>
      )}

      {/* Completion Message */}
      {isComplete && (
        <CompletionMessage>
          <CompletionIcon>
            <CheckmarkIcon size={18} />
          </CompletionIcon>
          <CompletionText>
            {t(
              "Search complete! Found {{total}} results across {{unique}} documents",
              {
                total: totalResults,
                unique: totalDocuments ?? totalResults,
              }
            )}
          </CompletionText>
        </CompletionMessage>
      )}
    </Container>
  );
}

// Animations
const fadeIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const spin = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`;

const pulse = keyframes`
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
`;

// Styled Components
const Container = styled.div`
  background: ${s("background")};
  border: 1px solid ${s("divider")};
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 16px;
  animation: ${fadeIn} 0.3s ease-out;
`;

const Section = styled.div`
  padding: 16px;

  &:not(:last-child) {
    border-bottom: 1px solid ${s("divider")};
  }
`;

const SectionTitle = styled(Text)`
  font-weight: 500;
  margin-bottom: 12px;
  display: block;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const KeywordChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const KeywordChip = styled.div<{ $delay: number }>`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: ${s("backgroundTertiary")};
  border: 1px solid ${s("divider")};
  border-radius: 20px;
  padding: 6px 12px;
  animation: ${fadeIn} 0.3s ease-out forwards;
  animation-delay: ${(props) => props.$delay}s;
  opacity: 0;
  transition: all 150ms ease-in-out;

  &:hover {
    background: ${s("listItemHoverBackground")};
    border-color: ${s("inputBorder")};
  }

  ${breakpoint("mobile")`
    font-size: 13px;
    padding: 5px 10px;
  `}
`;

const KeywordText = styled.span`
  font-size: 14px;
  color: ${s("text")};
  font-weight: 500;

  ${breakpoint("mobile")`
    font-size: 13px;
  `}
`;

const ResultBadge = styled.span<{ $status: "searching" | "complete" }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  background: ${(props) =>
    props.$status === "complete" ? s("accent") : s("textTertiary")};
  color: ${s("white")};
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  animation: ${(props) => (props.$status === "searching" ? pulse : "none")} 1.5s
    ease-in-out infinite;

  ${breakpoint("mobile")`
    min-width: 18px;
    height: 18px;
    font-size: 10px;
  `}
`;

const ProgressList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const ProgressItem = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  animation: ${fadeIn} 0.3s ease-out;
`;

const ProgressIcon = styled.div<{ $status: "searching" | "complete" }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  flex-shrink: 0;
  background: ${(props) =>
    props.$status === "complete"
      ? s("backgroundTertiary")
      : s("backgroundTertiary")};
  color: ${(props) =>
    props.$status === "complete" ? s("accent") : s("textSecondary")};

  ${breakpoint("mobile")`
    width: 20px;
    height: 20px;
  `}
`;

const SpinningSearchIcon = styled(SearchIcon)`
  animation: ${spin} 1.5s linear infinite;
`;

const ProgressText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
`;

const KeywordName = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${s("text")};

  ${breakpoint("mobile")`
    font-size: 13px;
  `}
`;

const ProgressStatus = styled(Text)`
  line-height: 1.4;
`;

const CompletionMessage = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: ${s("backgroundTertiary")};
  border-top: 1px solid ${s("divider")};
  animation: ${fadeIn} 0.4s ease-out;
`;

const CompletionIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: ${s("accent")};
  color: ${s("white")};
  flex-shrink: 0;

  ${breakpoint("mobile")`
    width: 28px;
    height: 28px;
  `}
`;

const CompletionText = styled.span`
  font-size: 14px;
  color: ${s("text")};
  font-weight: 500;
  line-height: 1.5;

  ${breakpoint("mobile")`
    font-size: 13px;
  `}
`;

export default SearchProgress;
