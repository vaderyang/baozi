import { Selection, NodeSelection, TextSelection } from "prosemirror-state";
import * as React from "react";
import styled from "styled-components";
import { toast } from "sonner";
import { s } from "@shared/styles";
import filterExcessSeparators from "@shared/editor/lib/filterExcessSeparators";
import { getMarkRange } from "@shared/editor/queries/getMarkRange";
import { isInCode } from "@shared/editor/queries/isInCode";
import { isInNotice } from "@shared/editor/queries/isInNotice";
import { isNodeActive } from "@shared/editor/queries/isNodeActive";
import {
  getColumnIndex,
  getRowIndex,
  isTableSelected,
} from "@shared/editor/queries/table";
import { MenuItem } from "@shared/editor/types";
import normalizePastedMarkdown from "@shared/editor/lib/markdown/normalize";
import useBoolean from "~/hooks/useBoolean";
import useDictionary from "~/hooks/useDictionary";
import useEventListener from "~/hooks/useEventListener";
import useMobile from "~/hooks/useMobile";
import useStores from "~/hooks/useStores";
import getAttachmentMenuItems from "../menus/attachment";
import getCodeMenuItems from "../menus/code";
import getDividerMenuItems from "../menus/divider";
import getFormattingMenuItems from "../menus/formatting";
import getImageMenuItems from "../menus/image";
import getNoticeMenuItems from "../menus/notice";
import getReadOnlyMenuItems from "../menus/readOnly";
import getTableMenuItems from "../menus/table";
import getTableColMenuItems from "../menus/tableCol";
import getTableRowMenuItems from "../menus/tableRow";
import { useEditor } from "./EditorContext";
import { MediaLinkEditor } from "./MediaLinkEditor";
import FloatingToolbar from "./FloatingToolbar";
import LinkEditor from "./LinkEditor";
import ToolbarMenu from "./ToolbarMenu";
import Button from "~/components/Button";
import Input from "./Input";
import { client } from "~/utils/ApiClient";
import Logger from "~/utils/Logger";

type Props = {
  /** Whether the text direction is right-to-left */
  rtl: boolean;
  /** Whether the current document is a template */
  isTemplate: boolean;
  /** Whether the toolbar is currently active/visible */
  isActive: boolean;
  /** The current selection */
  selection?: Selection;
  /** Whether the editor is in read-only mode */
  readOnly?: boolean;
  /** Whether the user has permission to add comments */
  canComment?: boolean;
  /** Whether the user has permission to update the document */
  canUpdate?: boolean;
  /** Callback function when a link is clicked */
  onClickLink: (
    href: string,
    event: MouseEvent | React.MouseEvent<HTMLButtonElement>
  ) => void;
};

function useIsDragging() {
  const [isDragging, setDragging, setNotDragging] = useBoolean();
  useEventListener("dragstart", setDragging);
  useEventListener("dragend", setNotDragging);
  useEventListener("drop", setNotDragging);
  return isDragging;
}

export function SelectionToolbar(props: Props) {
  const { readOnly = false } = props;
  const editor = useEditor();
  const { view, commands } = editor;
  const editorProps = editor.props;
  const dictionary = useDictionary();
  const { comments } = useStores();
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const isMobile = useMobile();
  const isActive = props.isActive || isMobile;
  const isDragging = useIsDragging();
  const [isEditingImgUrl, setIsEditingImgUrl] = React.useState(false);
  const [isAiEditing, setIsAiEditing] = React.useState(false);
  const [isAiGenerating, setIsAiGenerating] = React.useState(false);
  const aiPromptRef = React.useRef<HTMLInputElement>(null);

  const recordAiPromptComment = React.useCallback(
    async (promptValue: string) => {
      const documentId = editorProps.id;
      const trimmedPrompt = promptValue.trim();

      if (
        !comments ||
        !documentId ||
        !trimmedPrompt ||
        editorProps.readOnly ||
        editorProps.canComment === false
      ) {
        return;
      }

      try {
        await comments.create({
          documentId,
          text: `${dictionary.aiEdit}: ${trimmedPrompt}`,
        });
      } catch (error) {
        Logger.warn("Failed to record AI edit comment", error);
      }
    },
    [
      comments,
      dictionary.aiEdit,
      editorProps.canComment,
      editorProps.id,
      editorProps.readOnly,
    ]
  );

  React.useEffect(() => {
    setIsEditingImgUrl(false);
  }, [isActive]);

  React.useEffect(() => {
    if (isAiEditing) {
      aiPromptRef.current?.focus();
      aiPromptRef.current?.select();
    }
  }, [isAiEditing]);

  React.useEffect(() => {
    const handleClickOutside = (ev: MouseEvent): void => {
      if (
        ev.target instanceof HTMLElement &&
        menuRef.current &&
        menuRef.current.contains(ev.target)
      ) {
        return;
      }
      if (view.dom.contains(ev.target as HTMLElement)) {
        return;
      }

      if (!isActive || document.activeElement?.tagName === "INPUT") {
        return;
      }

      if (!window.getSelection()?.isCollapsed) {
        return;
      }

      setIsEditingImgUrl(false);
      setIsAiEditing(false);

      const { dispatch } = view;
      dispatch(
        view.state.tr.setSelection(new TextSelection(view.state.doc.resolve(0)))
      );
    };

    window.addEventListener("mouseup", handleClickOutside);

    return () => {
      window.removeEventListener("mouseup", handleClickOutside);
    };
  }, [isActive, readOnly, view]);

  const handleOnSelectLink = ({
    href,
    from,
    to,
  }: {
    href: string;
    from: number;
    to: number;
  }): void => {
    const { state, dispatch } = view;

    const markType = state.schema.marks.link;

    dispatch(
      state.tr
        .removeMark(from, to, markType)
        .addMark(from, to, markType.create({ href }))
    );
  };

  const handleAiEditClick = React.useCallback(() => {
    if (view.state.selection.empty) {
      return;
    }

    setIsAiEditing(true);
  }, [view]);

  const handleAiEditCancel = React.useCallback(() => {
    setIsAiEditing(false);
    setIsAiGenerating(false);
  }, []);

  const handleAiEditSubmit = React.useCallback(
    async (instructions: string) => {
      const trimmedInstructions = instructions.trim();

      if (!trimmedInstructions) {
        toast.error(dictionary.aiPromptRequired);
        return;
      }

      const initialState = view.state;

      if (initialState.selection.empty) {
        toast.error(dictionary.aiPromptRequired);
        return;
      }

      const { from, to } = initialState.selection;
      const bookmark = initialState.selection.getBookmark();

      let selectedMarkdown = initialState.doc.textBetween(from, to, "\n\n");

      try {
        const cutNode = initialState.doc.cut(from, to);
        selectedMarkdown = editor.serializer.serialize(cutNode).trim();
      } catch (error) {
        Logger.warn("Failed serializing selection for AI edit", error);
      }

      setIsAiGenerating(true);

      try {
        const prompt = [
          "You are editing a Markdown document. Apply the requested changes to the provided selection only while preserving existing structure unless told otherwise.",
          `Editing instructions:\n${trimmedInstructions}`,
          "",
          "Respond with the revised Markdown selection and nothing else—do not repeat the original text, reuse the word 'Context', or add commentary.",
        ]
          .join("\n")
          .trim();

        const result = await client.post<{ data: { text?: string } }>(
          "/ai.generate",
          {
            prompt,
            context: selectedMarkdown,
          },
          {
            retry: false,
          }
        );

        const normalized = (result?.data?.text ?? "").replace(/\r/g, "").trim();

        if (!normalized) {
          toast.error(dictionary.aiGenerationFailed);
          return;
        }

        const currentState = view.state;
        const { dispatch } = view;

        const resolvedSelection =
          bookmark && typeof (bookmark as any).resolve === "function"
            ? (bookmark as any).resolve(currentState.doc)
            : currentState.selection;
        const targetFrom = resolvedSelection.from;
        const targetTo = resolvedSelection.to;

        const markdownContent = editor.pasteParser.parse(
          normalizePastedMarkdown(normalized)
        );

        if (markdownContent) {
          const slice = markdownContent.slice(0);
          let tr = currentState.tr.replaceRange(targetFrom, targetTo, slice);
          const insertionEnd = Math.min(
            tr.doc.content.size,
            targetFrom + slice.content.size
          );
          tr = tr.setSelection(
            TextSelection.near(tr.doc.resolve(insertionEnd), -1)
          );
          dispatch(
            tr
              .scrollIntoView()
              .setMeta("paste", true)
              .setMeta("uiEvent", "paste")
          );
        } else {
          const insertTextValue = normalized.endsWith("\n")
            ? normalized
            : `${normalized}\n`;

          dispatch(
            currentState.tr
              .insertText(insertTextValue, targetFrom, targetTo)
              .scrollIntoView()
              .setMeta("paste", true)
              .setMeta("uiEvent", "paste")
          );
        }

        if (aiPromptRef.current) {
          aiPromptRef.current.value = "";
        }

        void recordAiPromptComment(trimmedInstructions);

        setIsAiEditing(false);
        view.focus();
      } catch (error) {
        const wrappedError =
          error instanceof Error ? error : new Error(String(error));
        Logger.error("AI edit failed", wrappedError);
        const message = wrappedError.message || dictionary.aiGenerationFailed;
        toast.error(message);
      } finally {
        setIsAiGenerating(false);
      }
    },
    [
      dictionary.aiGenerationFailed,
      dictionary.aiPromptRequired,
      editor.pasteParser,
      editor.serializer,
      recordAiPromptComment,
      view,
    ]
  );

  const handleAiEditFormSubmit = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (isAiGenerating) {
        return;
      }

      if (aiPromptRef.current) {
        void handleAiEditSubmit(aiPromptRef.current.value);
      }
    },
    [handleAiEditSubmit, isAiGenerating]
  );

  const handleAiPromptKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.key === "Enter") {
      event.stopPropagation();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      handleAiEditCancel();
    }
  };

  if (isDragging) {
    return null;
  }

  const { isTemplate, rtl, canComment, canUpdate, ...rest } = props;
  const { state } = view;
  const { selection } = state;

  React.useEffect(() => {
    if (!isAiEditing) {
      return;
    }

    if (!isActive || readOnly || selection.empty) {
      setIsAiEditing(false);
      setIsAiGenerating(false);
    }
  }, [
    isActive,
    isAiEditing,
    readOnly,
    selection.empty,
    selection.from,
    selection.to,
  ]);

  const isDividerSelection = isNodeActive(state.schema.nodes.hr)(state);
  const colIndex = getColumnIndex(state);
  const rowIndex = getRowIndex(state);
  const link = getMarkRange(selection.$from, state.schema.marks.link);
  const isImageSelection =
    selection instanceof NodeSelection && selection.node.type.name === "image";
  const isAttachmentSelection =
    selection instanceof NodeSelection &&
    selection.node.type.name === "attachment";
  const isEmbedSelection =
    selection instanceof NodeSelection && selection.node.type.name === "embed";
  const isCodeSelection = isInCode(state, { onlyBlock: true });
  const isNoticeSelection = isInNotice(state);

  let items: MenuItem[] = [];
  let align: "center" | "start" | "end" = "center";

  if (isCodeSelection && selection.empty) {
    items = getCodeMenuItems(state, readOnly, dictionary);
    align = "end";
  } else if (isTableSelected(state)) {
    items = getTableMenuItems(state, readOnly, dictionary);
  } else if (colIndex !== undefined) {
    items = getTableColMenuItems(state, readOnly, dictionary, {
      index: colIndex,
      rtl,
    });
  } else if (rowIndex !== undefined) {
    items = getTableRowMenuItems(state, readOnly, dictionary, {
      index: rowIndex,
    });
  } else if (isImageSelection) {
    items = getImageMenuItems(state, readOnly, dictionary);
  } else if (isAttachmentSelection) {
    items = getAttachmentMenuItems(state, readOnly, dictionary);
  } else if (isDividerSelection) {
    items = getDividerMenuItems(state, readOnly, dictionary);
  } else if (readOnly) {
    items = getReadOnlyMenuItems(state, !!canUpdate, dictionary);
  } else if (isNoticeSelection && selection.empty) {
    items = getNoticeMenuItems(state, readOnly, dictionary);
    align = "end";
  } else {
    items = getFormattingMenuItems(state, isTemplate, dictionary);
  }

  // Some extensions may be disabled, remove corresponding items
  items = items.filter((item) => {
    if (item.name === "separator") {
      return true;
    }
    if (item.name === "dimensions") {
      return item.visible ?? false;
    }
    if (item.name && !commands[item.name]) {
      const skipCommandValidation =
        "skipCommandCheck" in item && !!item.skipCommandCheck;
      if (!skipCommandValidation) {
        return false;
      }
    }
    if (item.visible === false) {
      return false;
    }
    return true;
  });

  items = filterExcessSeparators(items);
  if (!items.length) {
    return null;
  }

  const showLinkToolbar =
    link && link.from === selection.from && link.to === selection.to;

  const isEditingMedia =
    isEmbedSelection || (isImageSelection && isEditingImgUrl);

  return (
    <FloatingToolbar
      align={align}
      active={isActive}
      ref={menuRef}
      width={showLinkToolbar || isEmbedSelection ? 336 : undefined}
    >
      {showLinkToolbar ? (
        <LinkEditor
          key={`${link.from}-${link.to}`}
          dictionary={dictionary}
          view={view}
          mark={link.mark}
          from={link.from}
          to={link.to}
          onClickLink={props.onClickLink}
          onSelectLink={handleOnSelectLink}
        />
      ) : isEditingMedia ? (
        <MediaLinkEditor
          key={`embed-${selection.from}`}
          node={selection.node}
          view={view}
          dictionary={dictionary}
        />
      ) : isAiEditing ? (
        <AiPromptWrapper>
          <AiPromptForm onSubmit={handleAiEditFormSubmit}>
            <AiPromptInput
              ref={aiPromptRef}
              placeholder={dictionary.aiEditPlaceholder}
              onKeyDown={handleAiPromptKeyDown}
              disabled={isAiGenerating}
            />
            <AiPromptActions>
              <Button
                type="button"
                neutral
                onClick={handleAiEditCancel}
                disabled={isAiGenerating}
              >
                {dictionary.cancel}
              </Button>
              <Button type="submit" disabled={isAiGenerating}>
                {isAiGenerating
                  ? dictionary.aiGenerating
                  : dictionary.aiEditApply}
              </Button>
            </AiPromptActions>
          </AiPromptForm>
        </AiPromptWrapper>
      ) : (
        <ToolbarMenu
          items={items}
          {...rest}
          handlers={{
            editImageUrl: () => setIsEditingImgUrl(true),
            ai_edit_text: handleAiEditClick,
          }}
        />
      )}
    </FloatingToolbar>
  );
}

const AiPromptWrapper = styled.div`
  padding: 12px;
  width: 320px;
  max-width: 360px;
  background: ${s("menuBackground")};
  border-radius: 6px;
  box-shadow: ${s("menuShadow")};
`;

const AiPromptForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const AiPromptInput = styled(Input)`
  height: 36px;
  font-size: 15px;
  padding: 0 12px;
  background: transparent;
  color: ${s("text")};
  border: 1px solid ${s("inputBorder")};

  &:focus-visible {
    border-color: ${s("inputBorderFocused")};
  }

  &:disabled {
    opacity: 0.7;
  }
`;

const AiPromptActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
`;
