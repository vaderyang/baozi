import { Token } from "markdown-it";
import { DownloadIcon } from "outline-icons";
import { NodeSpec, NodeType, Node as ProsemirrorNode } from "prosemirror-model";
import { Command, NodeSelection } from "prosemirror-state";
import * as React from "react";
import { Trans } from "react-i18next";
import { Primitive } from "utility-types";
import { bytesToHumanReadable, getEventFiles } from "../../utils/files";
import { sanitizeUrl } from "../../utils/urls";
import insertFiles from "../commands/insertFiles";
import toggleWrap from "../commands/toggleWrap";
import AudioPlayer from "../components/AudioPlayer";
import FileExtension from "../components/FileExtension";
import Widget from "../components/Widget";
import FileHelper from "../lib/FileHelper";
import { MarkdownSerializerState } from "../lib/markdown/serializer";
import attachmentsRule from "../rules/links";
import { ComponentProps } from "../types";
import Node from "./Node";

export default class Attachment extends Node {
  get name() {
    return "attachment";
  }

  get rulePlugins() {
    return [attachmentsRule];
  }

  get schema(): NodeSpec {
    return {
      attrs: {
        id: {
          default: null,
        },
        href: {
          default: null,
        },
        title: {},
        size: {
          default: 0,
        },
        contentType: {
          default: null,
        },
      },
      group: "block",
      defining: true,
      atom: true,
      parseDOM: [
        {
          priority: 100,
          tag: "a.attachment",
          getAttrs: (dom: HTMLAnchorElement) => ({
            id: dom.id,
            title: dom.innerText,
            href: dom.getAttribute("href"),
            size: parseInt(dom.dataset.size || "0", 10),
            contentType: dom.dataset.contentType || null,
          }),
        },
      ],
      toDOM: (node) => [
        "a",
        {
          class: `attachment`,
          id: node.attrs.id,
          href: sanitizeUrl(node.attrs.href),
          download: node.attrs.title,
          "data-size": node.attrs.size,
          "data-content-type": node.attrs.contentType,
        },
        String(node.attrs.title),
      ],
      leafText: (node) => node.attrs.title,
    };
  }

  handleSelect =
    ({ getPos }: ComponentProps) =>
    () => {
      const { view } = this.editor;
      const $pos = view.state.doc.resolve(getPos());
      const transaction = view.state.tr.setSelection(new NodeSelection($pos));
      view.dispatch(transaction);
    };

  component = (props: ComponentProps) => {
    const { isSelected, isEditable, theme, node } = props;

    // Check if the file is an audio file
    let isAudio = false;
    if (node.attrs.contentType) {
      isAudio = FileHelper.isAudio(node.attrs.contentType);
    }

    // Fallback: Check by file extension if contentType doesn't indicate audio
    if (!isAudio && node.attrs.title) {
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
      isAudio = audioExtensions.some((ext) => fileName.endsWith(ext));
    }

    const widgetContent = (
      <Widget
        icon={
          isAudio && node.attrs.href ? (
            <AudioPlayer src={node.attrs.href} isEditable={isEditable}>
              <FileExtension title={node.attrs.title} />
            </AudioPlayer>
          ) : (
            <FileExtension title={node.attrs.title} />
          )
        }
        href={node.attrs.href}
        title={node.attrs.title}
        onMouseDown={this.handleSelect(props)}
        onDoubleClick={() => {
          this.editor.commands.downloadAttachment();
        }}
        onClick={(event) => {
          if (isEditable) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        context={
          node.attrs.href ? (
            bytesToHumanReadable(node.attrs.size || "0")
          ) : (
            <>
              <Trans>Uploading</Trans>…
            </>
          )
        }
        isSelected={isSelected}
        theme={theme}
      >
        {node.attrs.href && !isEditable && <DownloadIcon size={20} />}
      </Widget>
    );

    return isAudio && node.attrs.href ? (
      <div style={{ position: "relative" }}>{widgetContent}</div>
    ) : (
      widgetContent
    );
  };

  commands({ type }: { type: NodeType }) {
    return {
      createAttachment: (attrs: Record<string, Primitive>) =>
        toggleWrap(type, attrs),
      deleteAttachment: (): Command => (state, dispatch) => {
        dispatch?.(state.tr.deleteSelection());
        return true;
      },
      replaceAttachment: (): Command => (state) => {
        if (!(state.selection instanceof NodeSelection)) {
          return false;
        }
        const { view } = this.editor;
        const { node } = state.selection;
        const { uploadFile, onFileUploadStart, onFileUploadStop } =
          this.editor.props;

        if (!uploadFile) {
          throw new Error("uploadFile prop is required to replace attachments");
        }

        if (node.type.name !== "attachment") {
          return false;
        }

        // create an input element and click to trigger picker
        const inputElement = document.createElement("input");
        inputElement.type = "file";
        inputElement.onchange = (event) => {
          const files = getEventFiles(event);
          void insertFiles(view, event, state.selection.from, files, {
            uploadFile,
            onFileUploadStart,
            onFileUploadStop,
            dictionary: this.options.dictionary,
            replaceExisting: true,
          });
        };
        inputElement.click();
        return true;
      },
      downloadAttachment: (): Command => (state) => {
        if (!(state.selection instanceof NodeSelection)) {
          return false;
        }
        const { node } = state.selection;

        // create a temporary link node and click it
        const link = document.createElement("a");
        link.href = node.attrs.href;
        link.target = "_blank";
        document.body.appendChild(link);
        link.click();

        // cleanup
        document.body.removeChild(link);
        return true;
      },
      transcriptAttachment: (): Command => async (state) => {
        if (!(state.selection instanceof NodeSelection)) {
          return false;
        }
        const { node } = state.selection;
        const { id: editorId } = this.editor.props;

        if (node.type.name !== "attachment") {
          return false;
        }

        // Extract attachment ID from href
        // Format: /api/attachments.redirect?id=<uuid>
        let attachmentId = node.attrs.id;

        if (!attachmentId && node.attrs.href) {
          const url = new URL(node.attrs.href, window.location.origin);
          attachmentId = url.searchParams.get("id");
        }

        if (!attachmentId) {
          throw new Error("Cannot transcribe: attachment ID not found");
        }

        // Dynamically import dependencies to avoid circular dependencies
        const [{ client }, { toast }] = await Promise.all([
          import("~/utils/ApiClient"),
          import("sonner"),
        ]);

        try {
          // Call transcription API
          const response = await client.post<{
            data: { jobId: string; status: string };
          }>("/transcriptions.create", {
            attachmentId,
            documentId: editorId,
          });

          const { jobId } = response.data;

          if (!jobId) {
            throw new Error("No job ID received from transcription API");
          }

          // Insert TranscriptionStatusCard node after the attachment
          const { view } = this.editor;
          const pos = state.selection.from;
          const statusCardNode =
            state.schema.nodes.transcription_status_card.create({
              jobId,
              fileName: node.attrs.title,
              fileSize: node.attrs.size,
              status: "queued",
              progress: 0,
              error: null,
              skipAttachmentLink: true,
            });

          const tr = state.tr.insert(pos + 1, statusCardNode);
          view.dispatch(tr.scrollIntoView());

          toast.success("Transcription started");
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to start transcription";
          toast.error(errorMessage);
          throw error;
        }

        return true;
      },
    };
  }

  toMarkdown(state: MarkdownSerializerState, node: ProsemirrorNode) {
    state.ensureNewLine();
    state.write(
      `[${node.attrs.title} ${node.attrs.size}](${node.attrs.href})\n\n`
    );
    state.ensureNewLine();
  }

  parseMarkdown() {
    return {
      node: "attachment",
      getAttrs: (tok: Token) => ({
        href: tok.attrGet("href"),
        title: tok.attrGet("title"),
        size: tok.attrGet("size"),
      }),
    };
  }
}
