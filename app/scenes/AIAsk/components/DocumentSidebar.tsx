import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import breakpoint from "styled-components-breakpoint";
import { CloseIcon, DocumentIcon, CollectionIcon } from "outline-icons";
import { s } from "@shared/styles";
import Flex from "~/components/Flex";
import Text from "~/components/Text";

type DocumentReference = {
  id: string;
  title: string;
  url: string;
  collectionId: string | null;
  collectionName?: string | null;
  excerpt?: string;
  relevanceScore?: number;
};

type Props = {
  sources: DocumentReference[];
  activeSourceId: string | null;
  onClose: () => void;
};

function DocumentSidebar({ sources, activeSourceId, onClose }: Props) {
  const { t } = useTranslation();
  const sidebarRef = React.useRef<HTMLDivElement>(null);
  const activeItemRef = React.useRef<HTMLDivElement>(null);

  // Scroll to active document when it changes
  React.useEffect(() => {
    if (activeSourceId && activeItemRef.current) {
      activeItemRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [activeSourceId]);

  // Handle Escape key to close sidebar
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  if (sources.length === 0) {
    return null;
  }

  return (
    <Container ref={sidebarRef}>
      <Header>
        <HeaderContent>
          <Flex align="center" gap={8}>
            <DocumentIcon size={18} />
            <HeaderTitle weight="bold">
              {t("Sources")} ({sources.length})
            </HeaderTitle>
          </Flex>
          <CloseButton onClick={onClose} aria-label={t("Close sidebar")}>
            <CloseIcon size={20} />
          </CloseButton>
        </HeaderContent>
      </Header>

      <SourcesList>
        {sources.map((source, index) => {
          const isActive = source.id === activeSourceId;
          return (
            <SourceItem
              key={source.id}
              ref={isActive ? activeItemRef : null}
              $isActive={isActive}
            >
              <SourceNumber $isActive={isActive}>{index + 1}</SourceNumber>
              <SourceContent>
                <SourceHeader>
                  <SourceTitle
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    $isActive={isActive}
                  >
                    {source.title}
                  </SourceTitle>
                </SourceHeader>

                {source.collectionName && (
                  <CollectionInfo>
                    <CollectionIcon size={12} />
                    <CollectionName type="tertiary" size="xsmall">
                      {source.collectionName}
                    </CollectionName>
                  </CollectionInfo>
                )}

                {source.excerpt && (
                  <Excerpt type="secondary" size="small">
                    {source.excerpt}
                  </Excerpt>
                )}

                <ViewDocumentLink
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("Open document")} →
                </ViewDocumentLink>
              </SourceContent>
            </SourceItem>
          );
        })}
      </SourcesList>
    </Container>
  );
}

const Container = styled.div`
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 400px;
  background: ${s("background")};
  border-left: 1px solid ${s("divider")};
  display: flex;
  flex-direction: column;
  z-index: 100;
  box-shadow: -2px 0 8px rgba(0, 0, 0, 0.1);
  animation: slideIn 200ms ease-out;

  @keyframes slideIn {
    from {
      transform: translateX(100%);
    }
    to {
      transform: translateX(0);
    }
  }

  ${breakpoint("mobile", "tablet")`
    width: 100%;
    max-width: 100vw;
  `};
`;

const Header = styled.div`
  position: sticky;
  top: 0;
  background: ${s("sidebarBackground")};
  border-bottom: 1px solid ${s("divider")};
  padding: 16px;
  z-index: 1;
`;

const HeaderContent = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const HeaderTitle = styled(Text)`
  font-size: 16px;
`;

const CloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  padding: 8px;
  cursor: pointer;
  color: ${s("textSecondary")};
  border-radius: 6px;
  transition: all 100ms ease-in-out;

  &:hover {
    background: ${s("listItemHoverBackground")};
    color: ${s("text")};
  }
`;

const SourcesList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const SourceItem = styled.div<{ $isActive: boolean }>`
  display: flex;
  gap: 12px;
  padding: 16px;
  background: ${(props) =>
    props.$isActive ? s("listItemHoverBackground") : s("sidebarBackground")};
  border: 1px solid ${(props) => (props.$isActive ? s("accent") : s("divider"))};
  border-radius: 8px;
  transition: all 150ms ease-in-out;

  &:hover {
    background: ${s("listItemHoverBackground")};
    border-color: ${(props) =>
      props.$isActive ? s("accent") : s("inputBorder")};
  }
`;

const SourceNumber = styled.div<{ $isActive: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  background: ${(props) => (props.$isActive ? s("accent") : s("divider"))};
  color: ${(props) =>
    props.$isActive ? props.theme.white : s("textSecondary")};
  border-radius: 50%;
  font-size: 13px;
  font-weight: 600;
  flex-shrink: 0;
`;

const SourceContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
`;

const SourceHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
`;

const SourceTitle = styled.a<{ $isActive: boolean }>`
  font-size: 14px;
  font-weight: 500;
  color: ${(props) => (props.$isActive ? s("accent") : s("text"))};
  text-decoration: none;
  line-height: 1.4;
  word-break: break-word;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: color 100ms ease-in-out;

  &:hover {
    color: ${s("accent")};
    text-decoration: underline;
  }
`;

const CollectionInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  color: ${s("textTertiary")};
`;

const CollectionName = styled(Text)`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Excerpt = styled(Text)`
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ViewDocumentLink = styled.a`
  font-size: 13px;
  color: ${s("link")};
  text-decoration: none;
  font-weight: 500;
  margin-top: 4px;
  transition: color 100ms ease-in-out;

  &:hover {
    color: ${s("accent")};
    text-decoration: underline;
  }
`;

export default observer(DocumentSidebar);
