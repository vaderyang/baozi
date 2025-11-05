import { NodeSpec, NodeType, Node as ProsemirrorNode } from "prosemirror-model";
import { Command } from "prosemirror-state";
import * as React from "react";
import { Primitive } from "utility-types";
import { MarkdownSerializerState } from "../lib/markdown/serializer";
import { ComponentProps } from "../types";
import Node from "./Node";

/**
 * RecordingPlaceholder is a custom ProseMirror node that represents an active
 * audio recording session in the document. It displays the RecordingPlaceholderCard
 * component and persists across document navigation.
 */
export default class RecordingPlaceholder extends Node {
  get name() {
    return "recording_placeholder";
  }

  get schema(): NodeSpec {
    return {
      attrs: {
        nodeId: {
          default: "",
        },
        status: {
          default: "recording",
        },
        startTime: {
          default: null,
        },
      },
      group: "block",
      atom: true,
      selectable: true,
      draggable: false,
      parseDOM: [
        {
          tag: "div.recording-placeholder",
          getAttrs: (dom: HTMLDivElement) => ({
            nodeId: dom.dataset.nodeId || "",
            status: dom.dataset.status || "recording",
            startTime: dom.dataset.startTime
              ? parseInt(dom.dataset.startTime, 10)
              : null,
          }),
        },
      ],
      toDOM: (node) => [
        "div",
        {
          class: "recording-placeholder",
          "data-node-id": node.attrs.nodeId,
          "data-status": node.attrs.status,
          "data-start-time": node.attrs.startTime,
        },
        0,
      ],
    };
  }

  component = (props: ComponentProps) => {
    const { node } = props;
    const { nodeId, status, startTime } = node.attrs;

    // Lazy load the RecordingPlaceholderCard component
    const RecordingPlaceholderCard = React.lazy(() =>
      import("~/components/RecordingPlaceholderCard").catch(() => ({
        default: () => (
          <div style={{ padding: "16px", background: "red", color: "white" }}>
            Failed to load recording card component
          </div>
        ),
      }))
    );

    return (
      <React.Suspense
        fallback={
          <div
            style={{
              padding: "16px",
              background: "yellow",
              border: "2px solid red",
            }}
          >
            Loading recording card...
          </div>
        }
      >
        <RecordingPlaceholderCard
          nodeId={nodeId}
          initialStatus={status}
          initialStartTime={startTime}
        />
      </React.Suspense>
    );
  };

  commands({ type }: { type: NodeType }) {
    return {
      /**
       * Insert a recording placeholder node at the current cursor position
       */
      insertRecordingPlaceholder:
        (attrs?: Record<string, Primitive>): Command =>
        (state, dispatch) => {
          const { tr } = state;
          const node = type.create(attrs);

          if (dispatch) {
            tr.replaceSelectionWith(node);
            dispatch(tr);
          }

          return true;
        },

      /**
       * Update the status of a recording placeholder node
       */
      updateRecordingPlaceholder:
        (attrs?: {
          nodeId: string;
          updates: Record<string, Primitive>;
        }): Command =>
        (state, dispatch) => {
          if (!attrs) {
            return false;
          }

          const { tr, doc } = state;
          let updated = false;

          doc.descendants((node, pos) => {
            if (node.type === type && node.attrs.nodeId === attrs.nodeId) {
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

      /**
       * Remove a recording placeholder node from the document
       */
      removeRecordingPlaceholder:
        (attrs?: { nodeId: string }): Command =>
        (state, dispatch) => {
          if (!attrs) {
            return false;
          }

          const { tr, doc } = state;
          let removed = false;

          doc.descendants((node, pos) => {
            if (node.type === type && node.attrs.nodeId === attrs.nodeId) {
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

      /**
       * Replace a recording placeholder with transcribed text
       */
      replaceRecordingPlaceholderWithText:
        (attrs?: {
          nodeId: string;
          text: string;
          attachment?: {
            id: string;
            name: string;
            size: number;
          };
        }): Command =>
        (state, dispatch) => {
          if (!attrs) {
            return false;
          }

          const { tr, doc, schema } = state;
          let replaced = false;

          doc.descendants((node, pos) => {
            if (node.type === type && node.attrs.nodeId === attrs.nodeId) {
              const nodesToInsert: ProsemirrorNode[] = [];

              if (attrs.attachment && schema.nodes.attachment) {
                const { id, name, size } = attrs.attachment;
                const href = `/api/attachments.redirect?id=${id}`;
                const attachmentNode = schema.nodes.attachment.create({
                  id,
                  title: name,
                  size,
                  href,
                });
                nodesToInsert.push(attachmentNode);
              }

              // Create heading and code block nodes for the transcribed text
              const heading = schema.nodes.heading.create(
                { level: 2 },
                schema.text("Transcript")
              );
              const codeBlock = schema.nodes.code_fence.create(
                {},
                schema.text(attrs.text)
              );
              nodesToInsert.push(heading, codeBlock);

              // Replace the placeholder with the new nodes
              tr.replaceWith(pos, pos + node.nodeSize, nodesToInsert);
              replaced = true;
              return false;
            }
            return true;
          });

          if (dispatch && replaced) {
            dispatch(tr);
          }

          return replaced;
        },
    };
  }

  toMarkdown(_state: MarkdownSerializerState, _node: ProsemirrorNode) {
    // Recording placeholders should not be serialized to markdown
    // They are temporary UI elements that should not persist
    // Return empty to avoid persisting them
  }

  parseMarkdown() {
    // Recording placeholders are not parsed from markdown
    // They are only created programmatically during recording
    return undefined;
  }
}
