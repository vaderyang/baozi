import { NodeSpec, NodeType, Node as ProsemirrorNode } from "prosemirror-model";
import { Command, NodeSelection } from "prosemirror-state";
import * as React from "react";
import { Trans, useTranslation } from "react-i18next";
import styled from "styled-components";
import { Primitive } from "utility-types";
import { bytesToHumanReadable } from "../../utils/files";
import { MarkdownSerializerState } from "../lib/markdown/serializer";
import { ComponentProps } from "../types";
import Node from "./Node";
import { s } from "../../styles";

export default class TranscriptionStatusCard extends Node {
    get name() {
        return "transcription_status_card";
    }

    get schema(): NodeSpec {
        return {
            attrs: {
                jobId: {
                    default: null,
                },
                fileName: {
                    default: "",
                },
                fileSize: {
                    default: 0,
                },
                status: {
                    default: "queued",
                },
                progress: {
                    default: 0,
                },
                error: {
                    default: null,
                },
            },
            group: "block",
            atom: true,
            selectable: true,
            draggable: false,
            parseDOM: [
                {
                    tag: "div.transcription-status-card",
                    getAttrs: (dom: HTMLDivElement) => ({
                        jobId: dom.dataset.jobId,
                        fileName: dom.dataset.fileName,
                        fileSize: parseInt(dom.dataset.fileSize || "0", 10),
                        status: dom.dataset.status,
                        progress: parseInt(dom.dataset.progress || "0", 10),
                        error: dom.dataset.error,
                    }),
                },
            ],
            toDOM: (node) => [
                "div",
                {
                    class: "transcription-status-card",
                    "data-job-id": node.attrs.jobId,
                    "data-file-name": node.attrs.fileName,
                    "data-file-size": node.attrs.fileSize,
                    "data-status": node.attrs.status,
                    "data-progress": node.attrs.progress,
                    "data-error": node.attrs.error,
                },
                0,
            ],
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
        const { isSelected, node } = props;
        const { jobId, fileName, fileSize, status, progress, error } = node.attrs;

        const handleRetry = () => {
            this.editor.commands.retryTranscription({ jobId });
        };

        const handleCancel = () => {
            this.editor.commands.cancelTranscription({ jobId });
        };

        return (
            <CardWrapper
                className={isSelected ? "ProseMirror-selectednode" : ""}
                onMouseDown={this.handleSelect(props)}
            >
                <CardContent>
                    <FileInfo>
                        <FileName>{fileName}</FileName>
                        <FileSize>{bytesToHumanReadable(fileSize)}</FileSize>
                    </FileInfo>

                    <StatusSection>
                        {status === "queued" && (
                            <>
                                <Spinner />
                                <StatusText>
                                    <Trans>Queued</Trans>
                                </StatusText>
                            </>
                        )}

                        {status === "processing" && (
                            <>
                                <Spinner />
                                <StatusText>
                                    <Trans>Transcribing</Trans>…
                                </StatusText>
                                {progress > 0 && (
                                    <ProgressBarContainer>
                                        <ProgressBar progress={progress} />
                                    </ProgressBarContainer>
                                )}
                            </>
                        )}

                        {status === "failed" && (
                            <>
                                <ErrorText>
                                    <Trans>Transcription failed</Trans>
                                    {error && `: ${error}`}
                                </ErrorText>
                                <RetryButton onClick={handleRetry}>
                                    <Trans>Retry</Trans>
                                </RetryButton>
                            </>
                        )}
                    </StatusSection>

                    {(status === "queued" || status === "processing") && (
                        <CancelButton onClick={handleCancel}>
                            <Trans>Cancel</Trans>
                        </CancelButton>
                    )}
                </CardContent>
            </CardWrapper>
        );
    };

    commands({ type }: { type: NodeType }) {
        return {
            insertTranscriptionStatusCard: (attrs?: Record<string, Primitive>): Command =>
                (state, dispatch) => {
                    const { tr } = state;
                    const node = type.create(attrs);

                    if (dispatch) {
                        tr.replaceSelectionWith(node);
                        dispatch(tr);
                    }

                    return true;
                },

            updateTranscriptionStatus: (attrs?: { jobId: string; updates: Record<string, Primitive> }): Command =>
                (state, dispatch) => {
                    if (!attrs) {
                        return false;
                    }

                    const { tr, doc } = state;
                    let updated = false;

                    doc.descendants((node, pos) => {
                        if (node.type === type && node.attrs.jobId === attrs.jobId) {
                            const newAttrs = { ...node.attrs, ...attrs.updates };
                            tr.setNodeMarkup(pos, undefined, newAttrs);
                            updated = true;
                            return false;
                        }
                        return true;
                    });

                    if (dispatch && updated) {
                        dispatch(tr);
                    }

                    return updated;
                },

            removeTranscriptionStatusCard: (attrs?: { jobId: string }): Command =>
                (state, dispatch) => {
                    if (!attrs) {
                        return false;
                    }

                    const { tr, doc } = state;
                    let removed = false;

                    doc.descendants((node, pos) => {
                        if (node.type === type && node.attrs.jobId === attrs.jobId) {
                            tr.delete(pos, pos + node.nodeSize);
                            removed = true;
                            return false;
                        }
                        return true;
                    });

                    if (dispatch && removed) {
                        dispatch(tr);
                    }

                    return removed;
                },

            retryTranscription: (_attrs?: { jobId: string }): Command =>
                () => true,

            cancelTranscription: (_attrs?: { jobId: string }): Command =>
                () => true,
        };
    }

    toMarkdown(state: MarkdownSerializerState, node: ProsemirrorNode) {
        // Status cards should not be serialized to markdown
        // They are temporary UI elements
        state.ensureNewLine();
        state.write(`[Transcription: ${node.attrs.fileName}]\n\n`);
        state.ensureNewLine();
    }

    parseMarkdown() {
        // Status cards are not parsed from markdown
        return undefined;
    }
}

// Styled Components

const CardWrapper = styled.div`
  display: flex;
  background: ${s("background")};
  border: 1px solid ${s("divider")};
  border-radius: 8px;
  padding: 12px 16px;
  margin: 8px 0;
  max-width: 600px;
  user-select: none;

  &.ProseMirror-selectednode {
    border-color: ${s("accent")};
    box-shadow: 0 0 0 2px ${(props) => props.theme.accent}33;
  }
`;

const CardContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
`;

const FileInfo = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const FileName = styled.div`
  font-weight: 500;
  font-size: 14px;
  color: ${s("text")};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const FileSize = styled.div`
  font-size: 13px;
  color: ${s("textTertiary")};
  margin-left: 8px;
  flex-shrink: 0;
`;

const StatusSection = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

const StatusText = styled.div`
  font-size: 14px;
  color: ${s("textSecondary")};
`;

const ErrorText = styled.div`
  font-size: 14px;
  color: ${s("danger")};
  flex: 1;
`;

const Spinner = styled.div`
  width: 16px;
  height: 16px;
  border: 2px solid ${s("divider")};
  border-top-color: ${s("accent")};
  border-radius: 50%;
  animation: spin 0.8s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

const ProgressBarContainer = styled.div`
  width: 100%;
  height: 4px;
  background: ${s("divider")};
  border-radius: 2px;
  overflow: hidden;
`;

const ProgressBar = styled.div<{ progress: number }>`
  height: 100%;
  width: ${(props) => props.progress}%;
  background: ${s("accent")};
  transition: width 0.3s ease;
`;

const Button = styled.button`
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.15s ease;

  &:hover {
    opacity: 0.9;
  }

  &:active {
    transform: scale(0.98);
  }
`;

const RetryButton = styled(Button)`
  background: ${s("accent")};
  color: ${s("accentText")};
`;

const CancelButton = styled(Button)`
  background: ${s("backgroundSecondary")};
  color: ${s("textSecondary")};
  align-self: flex-start;

  &:hover {
    background: ${s("divider")};
  }
`;
