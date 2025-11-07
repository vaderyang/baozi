import { observer } from "mobx-react";
import { ImportIcon, LinkIcon, CollectionIcon, ClockIcon } from "outline-icons";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import styled from "styled-components";
import { s } from "@shared/styles";
import Button from "~/components/Button";
import CenteredContent from "~/components/CenteredContent";
import Flex from "~/components/Flex";
import Heading from "~/components/Heading";
import MicrophoneIcon from "~/components/Icons/MicrophoneIcon";
import Scene from "~/components/Scene";
import Subheading from "~/components/Subheading";
import type Document from "~/models/Document";
import useStores from "~/hooks/useStores";
import { client } from "~/utils/ApiClient";
import Logger from "~/utils/Logger";

const AudioHub = observer(function _AudioHub() {
  const { t } = useTranslation();
  const history = useHistory();
  const { audioInbox, audioRecorder, transcriptionJobs, documents } =
    useStores();
  const [recentDocuments, setRecentDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        await audioInbox.ensureInboxExists();
        const docs = await audioInbox.getInboxDocuments();
        // Get only the first 5 documents
        setRecentDocuments(docs.slice(0, 5));
      } catch (error) {
        Logger.error(
          "Failed to load Audio Hub data",
          error instanceof Error ? error : new Error(String(error))
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadData();
  }, [audioInbox]);

  const handleRecordAudio = async () => {
    // eslint-disable-next-line no-console
    console.log("[AudioHub] handleRecordAudio: Starting...");
    try {
      // Call API to create document and start recording session
      // eslint-disable-next-line no-console
      console.log("[AudioHub] Calling API to create document...");
      const response = await client.post<{
        data: { documentId: string; sessionId: string };
      }>("/audio.start-recording", {});

      const { documentId } = response.data;
      // eslint-disable-next-line no-console
      console.log("[AudioHub] Document created via API:", documentId);

      // Fetch the document from server
      // eslint-disable-next-line no-console
      console.log("[AudioHub] Fetching document from server...");
      await documents.fetch(documentId);

      const document = documents.get(documentId);
      if (!document) {
        throw new Error("Failed to fetch document");
      }

      // eslint-disable-next-line no-console
      console.log("[AudioHub] Document fetched:", {
        id: document.id,
        path: document.path,
        audioMetadata: document.audioMetadata,
      });

      // Start recording BEFORE navigation
      // eslint-disable-next-line no-console
      console.log("[AudioHub] Starting recording...");
      await audioRecorder.startRecording(documentId, 0);
      // eslint-disable-next-line no-console
      console.log(
        "[AudioHub] Recording started, isActive:",
        audioRecorder.isActive
      );

      // Navigate to the document which will show the Recording Studio
      // eslint-disable-next-line no-console
      console.log("[AudioHub] Navigating to document:", document.path);
      history.push(document.path);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[AudioHub] Failed to start recording:", error);
      Logger.error(
        "Failed to start recording",
        error instanceof Error ? error : new Error(String(error))
      );
      // TODO: Show error toast
    }
  };

  const handleUploadFiles = () => {
    // Create a file input element
    const input = document.createElement("input");
    input.type = "file";
    input.accept =
      "audio/*,video/*,.mp3,.wav,.m4a,.webm,.ogg,.flac,.mp4,.mov,.avi,.mkv";
    input.multiple = true;

    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) {
        return;
      }

      // TODO: Implement upload queue
      // This will be fully implemented in task 7
      // Files selected for upload
    };

    input.click();
  };

  const handleImportFromURL = () => {
    // TODO: Open URL import dialog
    // This will be implemented in task 8
  };

  const handleViewInbox = () => {
    history.push("/audio-inbox");
  };

  const activeJobs = transcriptionJobs.activeJobs;

  return (
    <Scene icon={<MicrophoneIcon />} title={t("Audio Hub")} centered={false}>
      <CenteredContent>
        <HeroSection>
          <HeroHeading>{t("Capture Audio, Create Knowledge")}</HeroHeading>
          <HeroSubtext>
            {t(
              "Record, upload, or import audio to automatically transcribe and organize your content"
            )}
          </HeroSubtext>
        </HeroSection>

        <ActionCardsGrid>
          <ActionCard onClick={handleRecordAudio}>
            <ActionCardIcon>
              <MicrophoneIcon size={48} />
            </ActionCardIcon>
            <ActionCardTitle>{t("Record Audio")}</ActionCardTitle>
            <ActionCardDescription>
              {t("Start recording now")}
            </ActionCardDescription>
          </ActionCard>

          <ActionCard onClick={handleUploadFiles}>
            <ActionCardIcon>
              <ImportIcon size={48} />
            </ActionCardIcon>
            <ActionCardTitle>{t("Upload Files")}</ActionCardTitle>
            <ActionCardDescription>
              {t("Upload audio or video files")}
            </ActionCardDescription>
          </ActionCard>

          <ActionCard onClick={handleImportFromURL}>
            <ActionCardIcon>
              <LinkIcon size={48} />
            </ActionCardIcon>
            <ActionCardTitle>{t("Import from URL")}</ActionCardTitle>
            <ActionCardDescription>
              {t("YouTube, podcasts, or any video URL")}
            </ActionCardDescription>
          </ActionCard>
        </ActionCardsGrid>

        {activeJobs.length > 0 && (
          <Section>
            <SectionHeader>
              <Subheading>
                <ClockIcon />
                &nbsp;{t("Processing")} ({activeJobs.length})
              </Subheading>
            </SectionHeader>
            <ProcessingList>
              {activeJobs.map((job) => (
                <ProcessingItem key={job.id}>
                  <ProcessingInfo>
                    <ProcessingTitle>{t("Recording")}</ProcessingTitle>
                    <ProcessingStatus>
                      {job.status === "processing"
                        ? t("Transcribing...")
                        : t("Queued")}
                      {job.progress !== null &&
                        job.progress > 0 &&
                        ` (${job.progress}%)`}
                    </ProcessingStatus>
                  </ProcessingInfo>
                  {job.progress !== null && job.progress > 0 && (
                    <ProgressBar>
                      <ProgressFill progress={job.progress} />
                    </ProgressBar>
                  )}
                </ProcessingItem>
              ))}
            </ProcessingList>
          </Section>
        )}

        {recentDocuments.length > 0 && (
          <Section>
            <SectionHeader>
              <Subheading>
                <CollectionIcon />
                &nbsp;{t("Recent Recordings")}
              </Subheading>
              <Button onClick={handleViewInbox} neutral>
                {t("View All")}
              </Button>
            </SectionHeader>
            <RecentList>
              {recentDocuments.map((doc) => (
                <RecentItem key={doc.id} onClick={() => history.push(doc.path)}>
                  <RecentTitle>{doc.title}</RecentTitle>
                  <RecentMeta>
                    {doc.createdAt && (
                      <span>
                        {new Date(doc.createdAt).toLocaleDateString()}
                      </span>
                    )}
                  </RecentMeta>
                </RecentItem>
              ))}
            </RecentList>
          </Section>
        )}

        {!isLoading &&
          recentDocuments.length === 0 &&
          activeJobs.length === 0 && (
            <EmptyState>
              <EmptyStateIcon>
                <MicrophoneIcon size={64} />
              </EmptyStateIcon>
              <EmptyStateText>
                {t("Get started by recording, uploading, or importing audio")}
              </EmptyStateText>
            </EmptyState>
          )}
      </CenteredContent>
    </Scene>
  );
});

const HeroSection = styled.div`
  text-align: center;
  padding: 48px 0;
  margin-bottom: 32px;
`;

const HeroHeading = styled(Heading)`
  font-size: 36px;
  margin-bottom: 16px;
`;

const HeroSubtext = styled.p`
  font-size: 16px;
  color: ${s("textSecondary")};
  max-width: 600px;
  margin: 0 auto;
`;

const ActionCardsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 24px;
  margin-bottom: 48px;
`;

const ActionCard = styled.button`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 24px;
  background: ${s("sidebarBackground")};
  border: 2px solid ${s("divider")};
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: center;

  &:hover {
    border-color: ${s("accent")};
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  &:active {
    transform: translateY(0);
  }
`;

const ActionCardIcon = styled.div`
  color: ${s("accent")};
  margin-bottom: 16px;
`;

const ActionCardTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 8px 0;
  color: ${s("text")};
`;

const ActionCardDescription = styled.p`
  font-size: 14px;
  color: ${s("textSecondary")};
  margin: 0;
`;

const Section = styled.div`
  margin-bottom: 48px;
`;

const SectionHeader = styled(Flex)`
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
`;

const ProcessingList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const ProcessingItem = styled.div`
  padding: 16px;
  background: ${s("sidebarBackground")};
  border-radius: 8px;
  border: 1px solid ${s("divider")};
`;

const ProcessingInfo = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
`;

const ProcessingTitle = styled.span`
  font-weight: 500;
  color: ${s("text")};
`;

const ProcessingStatus = styled.span`
  font-size: 14px;
  color: ${s("textSecondary")};
`;

const ProgressBar = styled.div`
  width: 100%;
  height: 4px;
  background: ${s("divider")};
  border-radius: 2px;
  overflow: hidden;
`;

const ProgressFill = styled.div<{ progress: number }>`
  height: 100%;
  width: ${(props) => props.progress}%;
  background: ${s("accent")};
  transition: width 0.3s ease;
`;

const RecentList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const RecentItem = styled.button`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: ${s("sidebarBackground")};
  border: 1px solid ${s("divider")};
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;

  &:hover {
    border-color: ${s("accent")};
    background: ${s("background")};
  }
`;

const RecentTitle = styled.span`
  font-weight: 500;
  color: ${s("text")};
`;

const RecentMeta = styled.div`
  font-size: 14px;
  color: ${s("textSecondary")};
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 64px 32px;
`;

const EmptyStateIcon = styled.div`
  color: ${s("textSecondary")};
  margin-bottom: 16px;
  opacity: 0.5;
`;

const EmptyStateText = styled.p`
  font-size: 16px;
  color: ${s("textSecondary")};
`;

export default AudioHub;
