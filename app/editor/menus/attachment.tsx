import {
  TrashIcon,
  DownloadIcon,
  ReplaceIcon,
  DocumentIcon,
  SparklesIcon,
  EyeIcon,
} from "outline-icons";
import { EditorState, NodeSelection } from "prosemirror-state";
import { MenuItem } from "@shared/editor/types";
import FileHelper from "@shared/editor/lib/FileHelper";
import { Dictionary } from "~/hooks/useDictionary";
import env from "~/env";

/**
 * Check if a file is supported for preview
 */
function isSupportedForPreview(
  filename: string,
  contentType?: string
): boolean {
  const supportedExtensions = [
    ".docx",
    ".doc",
    ".pptx",
    ".ppt",
    ".xlsx",
    ".xls",
    ".pdf",
  ];

  const supportedMimeTypes = [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/pdf",
  ];

  const ext = filename.toLowerCase().split(".").pop();
  const hasValidExtension =
    ext && supportedExtensions.some((e) => e === `.${ext}`);
  const hasValidMimeType = contentType
    ? supportedMimeTypes.includes(contentType)
    : false;

  return !!(hasValidExtension || hasValidMimeType);
}

export default function attachmentMenuItems(
  state: EditorState,
  readOnly: boolean,
  dictionary: Dictionary
): MenuItem[] {
  if (readOnly) {
    return [];
  }

  // Check if the selected node is an audio or video attachment
  // Videos can be transcribed by extracting their audio track
  let isAudioOrVideoAttachment = false;
  let isPreviewSupported = false;

  if (state.selection instanceof NodeSelection) {
    const { node } = state.selection;
    if (node.type.name === "attachment") {
      // Check by contentType if available
      if (node.attrs.contentType) {
        isAudioOrVideoAttachment =
          FileHelper.isAudio(node.attrs.contentType) ||
          FileHelper.isVideo(node.attrs.contentType);
      } else if (node.attrs.title) {
        // Fallback: Check by file extension for old attachments without contentType
        const fileName = node.attrs.title.toLowerCase();
        const audioVideoExtensions = [
          // Audio formats
          ".mp3",
          ".wav",
          ".m4a",
          ".ogg",
          ".opus",
          ".flac",
          ".aac",
          ".wma",
          ".webm",
          // Video formats
          ".mp4",
          ".mov",
          ".avi",
          ".mkv",
          ".wmv",
          ".flv",
          ".m4v",
        ];
        isAudioOrVideoAttachment = audioVideoExtensions.some((ext) =>
          fileName.endsWith(ext)
        );
      }

      // Check if preview is supported for this file
      if (env.FILE_PREVIEW_ENABLED && node.attrs.title) {
        isPreviewSupported = isSupportedForPreview(
          node.attrs.title,
          node.attrs.contentType
        );
      }
    }
  }

  const items: MenuItem[] = [];

  // Add preview button first if supported
  if (isPreviewSupported) {
    items.push({
      name: "previewAttachment",
      tooltip: "Preview document",
      label: "Preview",
      icon: <EyeIcon />,
    });
  }

  items.push(
    {
      name: "replaceAttachment",
      tooltip: dictionary.replaceAttachment,
      icon: <ReplaceIcon />,
    },
    {
      name: "deleteAttachment",
      tooltip: dictionary.deleteAttachment,
      icon: <TrashIcon />,
    }
  );

  // Add transcript buttons for audio and video files
  if (isAudioOrVideoAttachment) {
    items.push(
      {
        name: "transcriptAttachment",
        tooltip: "Transcribe only, no AI summary",
        icon: <DocumentIcon />,
      },
      {
        name: "transcriptAndSummaryAttachment",
        label: "AI Notes",
        tooltip: "Transcribe and Auto Summary",
        icon: <SparklesIcon />,
      }
    );
  }

  items.push(
    {
      name: "separator",
    },
    {
      name: "downloadAttachment",
      label: dictionary.download,
      icon: <DownloadIcon />,
      visible: !!fetch,
    }
  );

  return items;
}
