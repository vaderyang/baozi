import { observer } from "mobx-react";
import { CollectionIcon } from "outline-icons";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import styled from "styled-components";
import { s } from "@shared/styles";
import Button from "~/components/Button";
import CenteredContent from "~/components/CenteredContent";
import Flex from "~/components/Flex";
import Heading from "~/components/Heading";
import Input from "~/components/Input";
import { InputSelect } from "~/components/InputSelect";
import PlaceholderList from "~/components/List/Placeholder";
import PlaceholderText from "~/components/PlaceholderText";
import Scene from "~/components/Scene";
import type Document from "~/models/Document";
import useStores from "~/hooks/useStores";
import usePersistedState from "~/hooks/usePersistedState";
import AudioInboxDocumentCard from "./components/AudioInboxDocumentCard";
import AudioInboxEmpty from "./components/AudioInboxEmpty";

const AudioInboxScene = observer(function _AudioInboxScene() {
  const { t } = useTranslation();
  const { audioInbox, audioRecorder, documents } = useStores();
  const history = useHistory();
  const [isLoading, setIsLoading] = useState(true);
  const [inboxDocuments, setInboxDocuments] = useState<Document[]>([]);

  // Persist search and filter state
  const [searchQuery, setSearchQuery] = usePersistedState<string>(
    "audio-inbox-search",
    ""
  );
  const [statusFilter, setStatusFilter] = usePersistedState<
    "all" | "transcribing" | "ready"
  >("audio-inbox-status-filter", "all");
  const [sortOption, setSortOption] = usePersistedState<
    "newest" | "oldest" | "longest" | "shortest"
  >("audio-inbox-sort", "newest");

  useEffect(() => {
    async function loadInbox() {
      try {
        setIsLoading(true);
        await audioInbox.ensureInboxExists();
        const docs = await audioInbox.getInboxDocuments({
          search: searchQuery,
          status: statusFilter,
          sort: sortOption,
        });
        setInboxDocuments(docs);
      } catch {
        // Error loading inbox - silently fail for now
      } finally {
        setIsLoading(false);
      }
    }

    void loadInbox();
  }, [audioInbox, searchQuery, statusFilter, sortOption]);

  const handleNewRecording = async () => {
    try {
      // Create a new draft document for the recording
      const newDoc = await documents.create(
        {
          title: t("Untitled Recording"),
        },
        { publish: false }
      );

      // Start recording at the beginning of the document
      await audioRecorder.startRecording(newDoc.id, 0);

      // Navigate to the new document (Recording Studio will show)
      history.push(newDoc.path);
    } catch {
      // Error handling - could show a toast notification
    }
  };

  const statusOptions = [
    { type: "item" as const, label: t("All"), value: "all" },
    { type: "item" as const, label: t("Transcribing"), value: "transcribing" },
    { type: "item" as const, label: t("Ready to Archive"), value: "ready" },
  ];

  const sortOptions = [
    { type: "item" as const, label: t("Newest First"), value: "newest" },
    { type: "item" as const, label: t("Oldest First"), value: "oldest" },
    { type: "item" as const, label: t("Longest Duration"), value: "longest" },
    { type: "item" as const, label: t("Shortest Duration"), value: "shortest" },
  ];

  if (isLoading) {
    return (
      <Scene
        centered={false}
        textTitle={t("Audio Inbox")}
        title={
          <>
            <CollectionIcon />
            &nbsp;{t("Audio Inbox")}
          </>
        }
      >
        <CenteredContent>
          <Heading>
            <PlaceholderText height={35} />
          </Heading>
          <PlaceholderList count={5} />
        </CenteredContent>
      </Scene>
    );
  }

  const isEmpty = inboxDocuments.length === 0 && !searchQuery;

  return (
    <Scene
      centered={false}
      textTitle={t("Audio Inbox")}
      title={
        <>
          <CollectionIcon />
          &nbsp;{t("Audio Inbox")}
          {audioInbox.unarchivedCount > 0 && (
            <CountBadge>{audioInbox.unarchivedCount}</CountBadge>
          )}
        </>
      }
    >
      <CenteredContent>
        <InboxHeader>
          <InboxHeading>
            <CollectionIcon size={40} />
            {t("Audio Inbox")}
            {audioInbox.unarchivedCount > 0 && (
              <CountBadge>{audioInbox.unarchivedCount}</CountBadge>
            )}
          </InboxHeading>
          <Button onClick={handleNewRecording} icon={<span>🎙️</span>}>
            {t("New Recording")}
          </Button>
        </InboxHeader>

        {!isEmpty && (
          <FilterBar>
            <SearchInput
              type="search"
              placeholder={t("Search recordings...")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <FilterGroup>
              <InputSelect
                label={t("Status")}
                options={statusOptions}
                value={statusFilter}
                onChange={(value: string) =>
                  setStatusFilter(value as typeof statusFilter)
                }
              />
              <InputSelect
                label={t("Sort")}
                options={sortOptions}
                value={sortOption}
                onChange={(value: string) =>
                  setSortOption(value as typeof sortOption)
                }
              />
            </FilterGroup>
          </FilterBar>
        )}

        {isEmpty ? (
          <AudioInboxEmpty onNewRecording={handleNewRecording} />
        ) : inboxDocuments.length === 0 ? (
          <EmptySearchResults>
            <p>{t("No recordings match your search")}</p>
          </EmptySearchResults>
        ) : (
          <DocumentList>
            {inboxDocuments.map((doc) => (
              <AudioInboxDocumentCard key={doc.id} document={doc} />
            ))}
          </DocumentList>
        )}
      </CenteredContent>
    </Scene>
  );
});

const InboxHeader = styled(Flex)`
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding: 16px 0;
`;

const InboxHeading = styled(Heading)`
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
`;

const CountBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  padding: 0 8px;
  background: ${s("accent")};
  color: ${s("accentText")};
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
`;

const FilterBar = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 24px;
  padding: 16px;
  background: ${s("sidebarBackground")};
  border-radius: 8px;
`;

const SearchInput = styled(Input)`
  flex: 1;
`;

const FilterGroup = styled(Flex)`
  gap: 16px;
  align-items: center;
`;

const DocumentList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const EmptySearchResults = styled.div`
  text-align: center;
  padding: 64px 32px;
  color: ${s("textSecondary")};
`;

export default AudioInboxScene;
