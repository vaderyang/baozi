import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import breakpoint from "styled-components-breakpoint";
import { SparklesIcon } from "outline-icons";
import { s } from "@shared/styles";
import Flex from "~/components/Flex";
import Scene from "~/components/Scene";
import Text from "~/components/Text";
import useStores from "~/hooks/useStores";
import QueryInput from "./components/QueryInput";
import Conversation from "./components/Conversation";
import DocumentSidebar from "./components/DocumentSidebar";

function AIAsk() {
  const { t } = useTranslation();
  const { aiAsk } = useStores();
  const [showResults, setShowResults] = React.useState(false);

  const handleSubmit = React.useCallback(
    async (question: string) => {
      if (!question || !question.trim()) {
        return;
      }

      try {
        // Navigate to results page immediately
        setShowResults(true);
        // Scroll to top of page
        window.scrollTo({ top: 0, behavior: "smooth" });
        await aiAsk.submitQuestion(question);
      } catch (_error) {
        // Error is already handled by the store
      }
    },
    [aiAsk]
  );

  const handleClear = React.useCallback(() => {
    aiAsk.clearConversation();
    setShowResults(false);
  }, [aiAsk]);

  const handleCloseSidebar = React.useCallback(() => {
    aiAsk.setActiveDocument(null);
  }, [aiAsk]);

  // Get all sources from conversation
  const allSources = React.useMemo(() => {
    const sourcesMap = new Map();
    aiAsk.conversation.forEach((turn) => {
      turn.sources.forEach((source) => {
        if (!sourcesMap.has(source.id)) {
          sourcesMap.set(source.id, source);
        }
      });
    });
    // Also include streaming sources
    aiAsk.currentStreamingSources.forEach((source) => {
      if (!sourcesMap.has(source.id)) {
        sourcesMap.set(source.id, source);
      }
    });
    return Array.from(sourcesMap.values());
  }, [aiAsk.conversation, aiAsk.currentStreamingSources]);

  const isSidebarOpen =
    aiAsk.activeDocumentId !== null && allSources.length > 0;

  React.useEffect(
    () => () => {
      // Clear conversation when navigating away
      aiAsk.clearConversation();
      setShowResults(false);
    },
    [aiAsk]
  );

  return (
    <Scene textTitle={t("AI Ask")}>
      <MainContent $hasSidebar={isSidebarOpen}>
        {showResults ? (
          <ConversationView>
            <Header>
              <HeaderContent>
                <Flex align="center" gap={8}>
                  <AIIcon>
                    <SparklesIcon size={20} />
                  </AIIcon>
                  <Text size="large" weight="bold">
                    {t("AI Ask")}
                  </Text>
                </Flex>
                <ClearButton onClick={handleClear}>
                  {t("New conversation")}
                </ClearButton>
              </HeaderContent>
            </Header>
            <Conversation />
            <InputContainer>
              <QueryInput
                onSubmit={handleSubmit}
                disabled={aiAsk.isStreaming}
                placeholder={t("Ask a follow-up question...")}
              />
            </InputContainer>
          </ConversationView>
        ) : (
          <LandingPage>
            <LandingContent column align="center" justify="center">
              <AIIconLarge>
                <SparklesIcon size={48} />
              </AIIconLarge>
              <Title>{t("Ask me anything")}</Title>
              <Subtitle type="secondary">
                {t(
                  "I'll search your documents and provide comprehensive answers with sources"
                )}
              </Subtitle>
              <QueryInputWrapper>
                <QueryInput
                  onSubmit={handleSubmit}
                  placeholder={t("What would you like to know?")}
                  autoFocus
                />
              </QueryInputWrapper>
              <ExampleQuestions>
                <ExampleTitle type="tertiary" size="small">
                  {t("Try asking:")}
                </ExampleTitle>
                <ExampleList>
                  <ExampleItem
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void handleSubmit(t("What are our company values?"));
                    }}
                  >
                    {t("What are our company values?")}
                  </ExampleItem>
                  <ExampleItem
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void handleSubmit(t("What about DNS protocol?"));
                    }}
                  >
                    {t("What about DNS protocol?")}
                  </ExampleItem>
                  <ExampleItem
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void handleSubmit(t("What's tcp handshake?"));
                    }}
                  >
                    {t("What's tcp handshake?")}
                  </ExampleItem>
                </ExampleList>
              </ExampleQuestions>
            </LandingContent>
          </LandingPage>
        )}
      </MainContent>

      {isSidebarOpen && (
        <DocumentSidebar
          sources={allSources}
          activeSourceId={aiAsk.activeDocumentId}
          onClose={handleCloseSidebar}
        />
      )}
    </Scene>
  );
}

const MainContent = styled.div<{ $hasSidebar: boolean }>`
  display: flex;
  flex-direction: column;
  height: 100%;
  transition: margin-right 200ms ease-out;
  margin-right: ${(props) => (props.$hasSidebar ? "400px" : "0")};

  ${breakpoint("mobile", "tablet")`
    margin-right: 0;
  `};
`;

const ConversationView = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  max-width: 100%;
`;

const Header = styled.div`
  position: sticky;
  top: 0;
  z-index: 10;
  background: ${s("background")};
  border-bottom: 1px solid ${s("divider")};
  padding: 16px 0;
  margin-bottom: 24px;
`;

const HeaderContent = styled.div`
  max-width: 800px;
  margin: 0 auto;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;

  ${breakpoint("tablet")`
    padding: 0 24px;
  `};
`;

const AIIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: ${s("accent")};
`;

const ClearButton = styled.button`
  background: none;
  border: 1px solid ${s("divider")};
  border-radius: 6px;
  padding: 8px 16px;
  font-size: 14px;
  color: ${s("text")};
  cursor: pointer;
  transition: all 100ms ease-in-out;

  &:hover {
    background: ${s("listItemHoverBackground")};
    border-color: ${s("inputBorder")};
  }
`;

const InputContainer = styled.div`
  position: sticky;
  bottom: 0;
  background: ${s("background")};
  border-top: 1px solid ${s("divider")};
  padding: 16px 0;
  margin-top: auto;
`;

const LandingPage = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  padding: 40px 16px;

  ${breakpoint("tablet")`
    padding: 60px 24px;
  `};
`;

const LandingContent = styled(Flex)`
  max-width: 680px;
  width: 100%;
  gap: 24px;
`;

const AIIconLarge = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: ${s("backgroundTertiary")};
  color: ${s("accent")};
  margin-bottom: 8px;
`;

const Title = styled.h1`
  font-size: 32px;
  font-weight: 600;
  margin: 0;
  color: ${s("text")};

  ${breakpoint("tablet")`
    font-size: 40px;
  `};
`;

const Subtitle = styled(Text)`
  font-size: 16px;
  text-align: center;
  max-width: 500px;

  ${breakpoint("tablet")`
    font-size: 18px;
  `};
`;

const QueryInputWrapper = styled.div`
  width: 100%;
  margin-top: 16px;
`;

const ExampleQuestions = styled.div`
  margin-top: 32px;
  width: 100%;
`;

const ExampleTitle = styled(Text)`
  text-align: center;
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const ExampleList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
`;

const ExampleItem = styled.button`
  background: none;
  border: 1px solid ${s("divider")};
  border-radius: 8px;
  padding: 12px 20px;
  font-size: 14px;
  color: ${s("textSecondary")};
  cursor: pointer;
  transition: all 100ms ease-in-out;
  text-align: left;
  width: 100%;
  max-width: 400px;
  position: relative;
  z-index: 1;

  &:hover {
    background: ${s("listItemHoverBackground")};
    border-color: ${s("inputBorder")};
    color: ${s("text")};
  }

  &:active {
    transform: translateY(1px);
  }

  ${breakpoint("tablet")`
    font-size: 15px;
  `};
`;

export default observer(AIAsk);
