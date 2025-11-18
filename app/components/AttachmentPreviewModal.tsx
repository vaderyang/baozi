import * as React from "react";
import { observer } from "mobx-react";
import styled from "styled-components";
import * as Dialog from "@radix-ui/react-dialog";
import { CloseIcon } from "outline-icons";
import Flex from "~/components/Flex";
import LoadingIndicator from "~/components/LoadingIndicator";
import Text from "~/components/Text";
import NudeButton from "~/components/NudeButton";
import Logger from "~/utils/Logger";
import { s } from "@shared/styles";
import { depths } from "@shared/styles";
import { fadeAndScaleIn, fadeIn } from "~/styles/animations";

type Props = {
  /** The attachment ID to preview */
  attachmentId: string;
  /** The attachment filename for display */
  attachmentName: string;
  /** Callback when the modal is closed */
  onClose: () => void;
};

/**
 * Helper function to get a cookie value by name
 */
function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return parts.pop()?.split(";").shift() || null;
  }
  return null;
}

/**
 * Modal component for previewing Office documents and PDFs
 * Uses LibreOffice on the backend to convert documents to PDF for display
 */
function AttachmentPreviewModal({
  attachmentId,
  attachmentName,
  onClose,
}: Props) {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;
    let objectUrl: string | null = null;

    const loadPreview = async () => {
      try {
        setLoading(true);
        setError(null);

        // Request the preview from the backend using fetch directly
        // to properly handle binary data
        // Get CSRF token from meta tag or cookie
        const csrfToken =
          document
            .querySelector('meta[name="csrf-token"]')
            ?.getAttribute("content") || getCookie("csrfToken");

        const response = await fetch("/api/attachments.preview", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken || "",
          },
          credentials: "include",
          body: JSON.stringify({
            id: attachmentId,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || `Server error: ${response.status}`);
        }

        if (!mounted) {
          return;
        }

        // Get the PDF data as a blob
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        setPdfUrl(objectUrl);
      } catch (err) {
        Logger.error("Failed to load attachment preview", err);
        if (mounted) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load preview. The file may not be supported or the server may not have LibreOffice installed."
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void loadPreview();

    return () => {
      mounted = false;
      // Clean up the blob URL when the component unmounts
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [attachmentId]);

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <StyledOverlay />
        <StyledContent>
          <FullScreenWrapper>
            <Header>
              <HeaderTitle>{`Preview: ${attachmentName}`}</HeaderTitle>
              <NudeButton onClick={onClose}>
                <CloseIcon />
              </NudeButton>
            </Header>
            <PreviewContainer>
              {loading && (
                <CenteredContent>
                  <LoadingIndicator />
                  <Text type="secondary" size="small">
                    Generating preview...
                  </Text>
                </CenteredContent>
              )}

              {error && (
                <CenteredContent>
                  <ErrorText type="danger">{error}</ErrorText>
                </CenteredContent>
              )}

              {pdfUrl && !loading && !error && (
                <PDFViewer>
                  <iframe
                    src={`${pdfUrl}#toolbar=1&navpanes=1&scrollbar=1`}
                    title={`Preview of ${attachmentName}`}
                    width="100%"
                    height="100%"
                  />
                </PDFViewer>
              )}
            </PreviewContainer>
          </FullScreenWrapper>
        </StyledContent>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const StyledOverlay = styled(Dialog.Overlay)`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: ${(props) => props.theme.modalBackdrop};
  z-index: ${depths.overlay};
  animation: ${fadeIn} 200ms ease;
`;

const StyledContent = styled(Dialog.Content)`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: ${depths.modal};
  display: flex;
  justify-content: center;
  align-items: center;
  outline: none;
`;

const FullScreenWrapper = styled.div`
  animation: ${fadeAndScaleIn} 250ms ease;
  width: 98vw;
  height: 98vh;
  background: ${s("modalBackground")};
  box-shadow: ${s("modalShadow")};
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid ${s("divider")};
  flex-shrink: 0;
`;

const HeaderTitle = styled.div`
  font-size: 16px;
  font-weight: 600;
  color: ${s("text")};
`;

const PreviewContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
`;

const CenteredContent = styled(Flex)`
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 16px;
`;

const ErrorText = styled(Text)`
  text-align: center;
  max-width: 600px;
  padding: 20px;
`;

const PDFViewer = styled.div`
  flex: 1;
  width: 100%;
  height: 100%;
  display: flex;
  overflow: hidden;
  background: ${s("background")};

  iframe {
    border: none;
    display: block;
    width: 100%;
    height: 100%;
  }
`;

export default observer(AttachmentPreviewModal);
