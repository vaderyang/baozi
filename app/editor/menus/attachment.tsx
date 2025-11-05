import {
  TrashIcon,
  DownloadIcon,
  ReplaceIcon,
  DocumentIcon,
  SparklesIcon,
} from "outline-icons";
import { EditorState, NodeSelection } from "prosemirror-state";
import { MenuItem } from "@shared/editor/types";
import FileHelper from "@shared/editor/lib/FileHelper";
import { Dictionary } from "~/hooks/useDictionary";

export default function attachmentMenuItems(
  state: EditorState,
  readOnly: boolean,
  dictionary: Dictionary
): MenuItem[] {
  if (readOnly) {
    return [];
  }

  // Check if the selected node is an audio attachment
  let isAudioAttachment = false;
  if (state.selection instanceof NodeSelection) {
    const { node } = state.selection;
    if (node.type.name === "attachment") {
      // Check by contentType if available
      if (node.attrs.contentType) {
        isAudioAttachment = FileHelper.isAudio(node.attrs.contentType);
      } else if (node.attrs.title) {
        // Fallback: Check by file extension for old attachments without contentType
        const fileName = node.attrs.title.toLowerCase();
        const audioExtensions = [
          ".mp3",
          ".wav",
          ".m4a",
          ".ogg",
          ".opus",
          ".flac",
          ".aac",
          ".wma",
          ".webm",
        ];
        isAudioAttachment = audioExtensions.some((ext) =>
          fileName.endsWith(ext)
        );
      }
    }
  }

  const items: MenuItem[] = [
    {
      name: "replaceAttachment",
      tooltip: dictionary.replaceAttachment,
      icon: <ReplaceIcon />,
    },
    {
      name: "deleteAttachment",
      tooltip: dictionary.deleteAttachment,
      icon: <TrashIcon />,
    },
  ];

  // Add transcript buttons only for audio files
  if (isAudioAttachment) {
    items.push(
      {
        name: "transcriptAttachment",
        label: "Transcribe",
        tooltip: "Transcribe audio",
        icon: <DocumentIcon />,
      },
      {
        name: "transcriptAndSummaryAttachment",
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
