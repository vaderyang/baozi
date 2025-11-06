import { observer } from "mobx-react";
import * as React from "react";
import styled from "styled-components";
import breakpoint from "styled-components-breakpoint";
import { s } from "@shared/styles";
import Text from "~/components/Text";
import useStores from "~/hooks/useStores";
import Answer from "./Answer";
import ErrorState from "./ErrorState";
import LoadingState from "./LoadingState";
import SearchProgress from "./SearchProgress";

function Conversation() {
  const { aiAsk } = useStores();
  const conversationEndRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll to latest answer
  React.useEffect(() => {
    if (conversationEndRef.current) {
      conversationEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [aiAsk.conversation.length, aiAsk.isStreaming]);

  if (aiAsk.conversation.length === 0 && !aiAsk.isStreaming) {
    return null;
  }

  return (
    <Container>
      <ConversationList>
        {aiAsk.conversation.map((turn) => (
          <TurnContainer key={turn.id}>
            <QuestionSection>
              <QuestionBubble>
                <QuestionText>{turn.question}</QuestionText>
              </QuestionBubble>
              <Timestamp type="tertiary" size="xsmall">
                {new Date(turn.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Timestamp>
            </QuestionSection>

            <AnswerSection>
              {turn.answer && (
                <Answer
                  answer={turn.answer}
                  sources={turn.sources}
                  followups={turn.followups}
                  isStreaming={false}
                  onCitationClick={(sourceId: string) =>
                    aiAsk.setActiveDocument(sourceId)
                  }
                  onFollowupClick={(question: string) =>
                    aiAsk.submitFollowup(question)
                  }
                />
              )}
            </AnswerSection>
          </TurnContainer>
        ))}

        {/* Show streaming state for current question */}
        {aiAsk.isStreaming && (
          <TurnContainer>
            {aiAsk.currentStreamingQuestion && (
              <QuestionSection>
                <QuestionBubble>
                  <QuestionText>{aiAsk.currentStreamingQuestion}</QuestionText>
                </QuestionBubble>
                <Timestamp type="tertiary" size="xsmall">
                  {new Date().toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Timestamp>
              </QuestionSection>
            )}
            <AnswerSection>
              {/* Show search progress during search phase */}
              {aiAsk.searchStrategy && !aiAsk.currentStreamingAnswer && (
                <SearchProgress
                  searchStrategy={aiAsk.searchStrategy}
                  searchProgress={aiAsk.searchProgress}
                  isComplete={aiAsk.isSearchComplete}
                  totalDocuments={
                    aiAsk.isSearchComplete
                      ? Array.from(aiAsk.searchProgress.values()).reduce(
                          (sum, p) => sum + p.resultCount,
                          0
                        )
                      : undefined
                  }
                />
              )}
              {aiAsk.currentStreamingAnswer ? (
                <>
                  {/* Debug: Show that we have streaming content */}
                  {process.env.NODE_ENV === "development" && (
                    <div
                      style={{
                        fontSize: "10px",
                        color: "#999",
                        marginBottom: "8px",
                      }}
                    >
                      Streaming: {aiAsk.currentStreamingAnswer.length} chars
                    </div>
                  )}
                  <Answer
                    answer={aiAsk.currentStreamingAnswer}
                    sources={aiAsk.currentStreamingSources}
                    followups={[]}
                    isStreaming={true}
                    onCitationClick={(sourceId: string) =>
                      aiAsk.setActiveDocument(sourceId)
                    }
                  />
                </>
              ) : (
                <LoadingState
                  phase={aiAsk.isLoadingPhase}
                  elapsedTime={aiAsk.elapsedTime}
                  showEstimatedTime={aiAsk.showEstimatedTime}
                  onCancel={() => aiAsk.cancelStreaming()}
                />
              )}
            </AnswerSection>
          </TurnContainer>
        )}

        {/* Show error state */}
        {aiAsk.error && (
          <TurnContainer>
            <AnswerSection>
              <ErrorState
                error={aiAsk.error}
                onRetry={
                  aiAsk.error.retryable && aiAsk.conversation.length > 0
                    ? () => {
                        const lastTurn =
                          aiAsk.conversation[aiAsk.conversation.length - 1];
                        aiAsk.clearError();
                        aiAsk.submitQuestion(lastTurn.question);
                      }
                    : undefined
                }
                onDismiss={() => aiAsk.clearError()}
              />
            </AnswerSection>
          </TurnContainer>
        )}

        <div ref={conversationEndRef} />
      </ConversationList>
    </Container>
  );
}

const Container = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 0 16px 24px;

  ${breakpoint("tablet")`
    padding: 0 24px 24px;
  `};
`;

const ConversationList = styled.div`
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 32px;
`;

const TurnContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const QuestionSection = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
`;

const QuestionBubble = styled.div`
  background: ${s("accent")};
  color: ${(props) => props.theme.white};
  border-radius: 16px;
  padding: 12px 16px;
  max-width: 80%;
  word-wrap: break-word;

  ${breakpoint("tablet")`
    max-width: 70%;
  `};
`;

const QuestionText = styled.p`
  margin: 0;
  font-size: 15px;
  line-height: 1.5;
  white-space: pre-wrap;
`;

const Timestamp = styled(Text)`
  padding: 0 8px;
`;

const AnswerSection = styled.div`
  display: flex;
  flex-direction: column;
`;

export default observer(Conversation);
