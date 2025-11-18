import * as React from "react";

type PreviewState = {
  attachmentId: string;
  attachmentName: string;
} | null;

/**
 * Hook to handle attachment preview modal state
 * Listens for custom "attachment-preview" events from the editor
 */
export default function useAttachmentPreview() {
  const [previewState, setPreviewState] = React.useState<PreviewState>(null);

  React.useEffect(() => {
    const handlePreviewRequest = (event: Event) => {
      const customEvent = event as CustomEvent<{
        attachmentId: string;
        attachmentName: string;
      }>;

      setPreviewState({
        attachmentId: customEvent.detail.attachmentId,
        attachmentName: customEvent.detail.attachmentName,
      });
    };

    document.addEventListener("attachment-preview", handlePreviewRequest);

    return () => {
      document.removeEventListener("attachment-preview", handlePreviewRequest);
    };
  }, []);

  const closePreview = React.useCallback(() => {
    setPreviewState(null);
  }, []);

  return {
    previewState,
    closePreview,
  };
}
