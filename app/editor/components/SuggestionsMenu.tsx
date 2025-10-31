import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import commandScore from "command-score";
import capitalize from "lodash/capitalize";
import orderBy from "lodash/orderBy";
import * as React from "react";
import { Trans, useTranslation } from "react-i18next";
import { toast } from "sonner";
import styled from "styled-components";
import insertFiles from "@shared/editor/commands/insertFiles";
import { EmbedDescriptor } from "@shared/editor/embeds";
import filterExcessSeparators from "@shared/editor/lib/filterExcessSeparators";
import normalizePastedMarkdown from "@shared/editor/lib/markdown/normalize";
import { findParentNode } from "@shared/editor/queries/findParentNode";
import { MenuItem } from "@shared/editor/types";
import { depths, s } from "@shared/styles";
import { getEventFiles } from "@shared/utils/files";
import { AttachmentValidation } from "@shared/validations";
import Button from "~/components/Button";
import { TextSelection } from "prosemirror-state";
import { Portal } from "~/components/Portal";
import Scrollable from "~/components/Scrollable";
import useDictionary from "~/hooks/useDictionary";
import { client } from "~/utils/ApiClient";
import Logger from "~/utils/Logger";
import { useEditor } from "./EditorContext";
import Input from "./Input";
import { MenuHeader } from "~/components/primitives/components/Menu";

type TopAnchor = {
  top: number;
  bottom: undefined;
};

type BottomAnchor = {
  top: undefined;
  bottom: number;
};

type LeftAnchor = {
  left: number;
  right: undefined;
};

type RightAnchor = {
  left: undefined;
  right: number;
};

type Position = ((TopAnchor | BottomAnchor) & (LeftAnchor | RightAnchor)) & {
  isAbove: boolean;
};

const defaultPosition: Position = {
  top: 0,
  bottom: undefined,
  left: -10000,
  right: undefined,
  isAbove: false,
};

export type Props<T extends MenuItem = MenuItem> = {
  rtl: boolean;
  isActive: boolean;
  search: string;
  trigger: string;
  uploadFile?: (file: File) => Promise<string>;
  onFileUploadStart?: () => void;
  onFileUploadStop?: () => void;
  /** Callback when the menu is closed */
  onClose: (insertNewLine?: boolean) => void;
  /** Optional callback when a suggestion is selected */
  onSelect?: (item: MenuItem) => void;
  embeds?: EmbedDescriptor[];
  renderMenuItem: (
    item: T,
    index: number,
    options: {
      selected: boolean;
      onClick: (event: React.SyntheticEvent) => void;
    }
  ) => React.ReactNode;
  filterable?: boolean;
  items: T[];
};

function SuggestionsMenu<T extends MenuItem>(props: Props<T>) {
  const editor = useEditor();
  const { view, commands, props: editorProps } = editor;
  const dictionary = useDictionary();
  const { t } = useTranslation();
  const hasActivated = React.useRef(false);
  const pointerRef = React.useRef<{ clientX: number; clientY: number }>({
    clientX: 0,
    clientY: 0,
  });
  const menuRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [position, setPosition] = React.useState<Position>(defaultPosition);
  const [insertItem, setInsertItem] = React.useState<
    MenuItem | EmbedDescriptor
  >();
  const [insertMode, setInsertMode] = React.useState<"none" | "embed" | "ai">(
    "none"
  );
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const promptInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (props.isActive) {
      hasActivated.current = true;
    }
  }, [props.isActive]);

  React.useEffect(() => {
    if (insertMode === "ai") {
      promptInputRef.current?.focus();
    }
  }, [insertMode]);

  const calculatePosition = React.useCallback(() => {
    if (!props.isActive) {
      return defaultPosition;
    }

    const caretPosition = () => {
      const { selection } = view.state;
      let fromPos;
      let toPos;
      try {
        fromPos = view.coordsAtPos(selection.from);
        toPos = view.coordsAtPos(selection.to, -1);
      } catch (err) {
        Logger.warn("Unable to calculate caret position", err);
        return defaultPosition;
      }

      // ensure that start < end for the menu to be positioned correctly
      return {
        top: Math.min(fromPos.top, toPos.top),
        bottom: Math.max(fromPos.bottom, toPos.bottom),
        left: Math.min(fromPos.left, toPos.left),
        right: Math.max(fromPos.right, toPos.right),
      };
    };

    const ref = menuRef.current;
    const offsetWidth = ref ? ref.offsetWidth : 0;
    const offsetHeight = ref ? ref.offsetHeight : 0;
    const { top, bottom, right, left } = caretPosition();
    const margin = 12;

    const offsetParent = ref?.offsetParent
      ? ref.offsetParent.getBoundingClientRect()
      : ({
          width: 0,
          height: 0,
          top: 0,
          left: 0,
        } as DOMRect);

    let leftPos = Math.min(
      left - offsetParent.left,
      window.innerWidth - offsetParent.left - offsetWidth - margin
    );
    if (props.rtl) {
      leftPos = right - offsetWidth;
    }

    if (top - offsetHeight > margin) {
      return {
        left: leftPos,
        top: undefined,
        bottom: offsetParent.bottom - top,
        right: undefined,
        isAbove: false,
      };
    } else {
      return {
        left: leftPos,
        top: bottom - offsetParent.top,
        bottom: undefined,
        right: undefined,
        isAbove: true,
      };
    }
  }, [props.isActive, props.rtl, view]);

  const handleClearSearch = React.useCallback(() => {
    const { state, dispatch } = view;
    const poss = state.doc.cut(
      state.selection.from - (props.search ?? "").length - props.trigger.length,
      state.selection.from
    );
    const trimTrigger = poss.textContent.startsWith(props.trigger);

    if (!props.search && !trimTrigger) {
      return;
    }

    // clear search input
    dispatch(
      state.tr.insertText(
        "",
        Math.max(
          0,
          state.selection.from -
            (props.search ?? "").length -
            (trimTrigger ? props.trigger.length : 0)
        ),
        state.selection.to
      )
    );
  }, [props.search, props.trigger, view]);

  React.useEffect(() => {
    if (!props.isActive) {
      return;
    }

    // reset scroll position to top when opening menu as the contents are
    // hidden, not unrendered
    if (menuRef.current) {
      menuRef.current.scroll({ top: 0 });
    }

    setPosition(calculatePosition());
    setSelectedIndex(0);
    setInsertItem(undefined);
    setInsertMode("none");
    setIsGenerating(false);
  }, [calculatePosition, props.isActive]);

  React.useEffect(() => {
    setSelectedIndex(0);
  }, [props.search]);

  const close = React.useCallback(() => {
    setInsertItem(undefined);
    setInsertMode("none");
    setIsGenerating(false);
    props.onClose();
    view.focus();
  }, [props, view]);

  const insertNode = React.useCallback(
    (item: MenuItem | EmbedDescriptor) => {
      handleClearSearch();

      const command = item.name ? commands[item.name] : undefined;
      const attrs =
        typeof item.attrs === "function" ? item.attrs(view.state) : item.attrs;

      if (item.name === "noop") {
        // Do nothing
      } else if (command) {
        command(attrs);
      } else {
        commands[`create${capitalize(item.name)}`](attrs);
      }
      if ("appendSpace" in item) {
        const { dispatch } = view;
        dispatch(view.state.tr.insertText(" "));
      }

      close();
    },
    [close, commands, handleClearSearch, view]
  );

  const triggerAiPrompt = React.useCallback(() => {
    handleClearSearch();
    setInsertItem({
      name: "ai_generate_text",
      title: dictionary.generateText,
    });
    setInsertMode("ai");
    setIsGenerating(false);
  }, [dictionary.generateText, handleClearSearch]);

  const generateAiText = React.useCallback(
    async ({
      prompt,
      context,
      requirePrompt = true,
      placeholderRange,
      skipClearSearch = false,
    }: {
      prompt: string;
      context?: string;
      requirePrompt?: boolean;
      placeholderRange?: { from: number; to: number };
      skipClearSearch?: boolean;
    }) => {
      const trimmedPrompt = prompt.trim();

      const cleanupPlaceholder = () => {
        if (!placeholderRange) {
          return;
        }

        try {
          const cleanupState = view.state;
          const clampedTo = Math.min(
            placeholderRange.to,
            cleanupState.doc.content.size
          );

          if (
            placeholderRange.from <= clampedTo &&
            placeholderRange.from >= 0
          ) {
            view.dispatch(
              cleanupState.tr.deleteRange(placeholderRange.from, clampedTo)
            );
          }
        } catch (cleanupError) {
          Logger.warn(
            "Failed cleaning up AI placeholder after error",
            cleanupError
          );
        }
      };

      if (requirePrompt && !trimmedPrompt) {
        toast.error(dictionary.aiPromptRequired);
        return;
      }

      if (!skipClearSearch) {
        handleClearSearch();
      }

      setIsGenerating(true);

      try {
        const result = await client.post<{ data: { text?: string } }>(
          "/ai.generate",
          { prompt: trimmedPrompt, context },
          { retry: false }
        );

        const normalized = (result?.data?.text ?? "").replace(/\r/g, "").trim();

        if (!normalized) {
          cleanupPlaceholder();
          toast.error(dictionary.aiGenerationFailed);
          return;
        }

        const stateForInsert = view.state;
        const { dispatch } = view;
        const markdownContent = editor.pasteParser.parse(
          normalizePastedMarkdown(normalized)
        );

        if (markdownContent) {
          const slice = markdownContent.slice(0);
          let tr = stateForInsert.tr;

          if (placeholderRange) {
            tr = tr.replaceRange(
              placeholderRange.from,
              placeholderRange.to,
              slice
            );
            const insertionEnd = Math.min(
              tr.doc.content.size,
              placeholderRange.from + slice.content.size
            );
            tr = tr.setSelection(
              TextSelection.near(tr.doc.resolve(insertionEnd), -1)
            );
          } else {
            tr = tr.replaceSelection(slice);
          }

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

          if (placeholderRange) {
            dispatch(
              stateForInsert.tr.insertText(
                insertTextValue,
                placeholderRange.from,
                placeholderRange.to
              )
            );
          } else {
            dispatch(
              stateForInsert.tr.insertText(
                insertTextValue,
                stateForInsert.selection.from,
                stateForInsert.selection.to
              )
            );
          }
        }

        close();
      } catch (error) {
        cleanupPlaceholder();

        const wrappedError =
          error instanceof Error ? error : new Error(String(error));
        Logger.error("AI text generation failed", wrappedError);
        const message = wrappedError.message || dictionary.aiGenerationFailed;
        toast.error(message);
      } finally {
        setIsGenerating(false);
      }
    },
    [
      close,
      dictionary.aiGenerationFailed,
      dictionary.aiPromptRequired,
      editor,
      handleClearSearch,
      view,
    ]
  );

  const handleContinueWriting = React.useCallback(async () => {
    if (isGenerating) {
      return;
    }

    const initialState = view.state;
    const { selection } = initialState;
    const textBeforeCursor = initialState.doc.textBetween(
      0,
      selection.from,
      "\n\n"
    );
    const triggerSuffix = `${props.trigger}${props.search ?? ""}`;
    const sanitizedContext = triggerSuffix
      ? textBeforeCursor.endsWith(triggerSuffix)
        ? textBeforeCursor.slice(
            0,
            Math.max(0, textBeforeCursor.length - triggerSuffix.length)
          )
        : textBeforeCursor
      : textBeforeCursor;
    const context = sanitizedContext.slice(
      Math.max(0, sanitizedContext.length - 2000)
    );
    const prompt = [
      "Continue writing the document in Markdown so it flows naturally from the provided context.",
      "Finish any partial sentence first, then extend the idea in the same tone. Don't repeat the last line in context.",
      "Mirror the existing structure—use headings, lists, code, mermaid, table, or checkboxes when they fit, and avoid restating instructions.",
      "Return Markdown only with no surrounding commentary.",
    ]
      .join("\n")
      .trim();

    handleClearSearch();

    const placeholderLabel =
      dictionary.continueWritingPlaceholder ?? dictionary.aiGenerating;
    const placeholderState = view.state;
    const { from } = placeholderState.selection;
    const placeholderTransaction = placeholderState.tr.insertText(
      placeholderLabel,
      from,
      from
    );
    view.dispatch(placeholderTransaction);

    const placeholderRange = {
      from,
      to: from + placeholderLabel.length,
    };

    await generateAiText({
      prompt,
      context,
      requirePrompt: false,
      placeholderRange,
      skipClearSearch: true,
    });
  }, [
    dictionary.aiGenerating,
    dictionary.continueWritingPlaceholder,
    generateAiText,
    handleClearSearch,
    isGenerating,
    props.search,
    props.trigger,
    view,
  ]);

  const handleClickItem = React.useCallback(
    (item) => {
      props.onSelect?.(item);

      switch (item.name) {
        case "link":
          insertNode({
            ...item,
            name: "mention",
          });
          void editorProps.onCreateLink?.({
            title: item.attrs.label,
            id: item.attrs.modelId,
          });
          return;
        case "image":
          return triggerFilePick(
            AttachmentValidation.imageContentTypes.join(", ")
          );
        case "video":
          return triggerFilePick("video/*");
        case "attachment":
          return triggerFilePick("*");
        case "embed":
          return triggerLinkInput(item);
        case "ai_generate_text":
          return triggerAiPrompt();
        case "ai_continue_writing":
          void handleContinueWriting();
          return;
        default:
          insertNode(item);
      }
    },
    [editorProps, handleContinueWriting, insertNode, props, triggerAiPrompt]
  );

  const handleLinkInputKeydown = (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (!props.isActive) {
      return;
    }
    if (!insertItem) {
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();

      const href = event.currentTarget.value;
      const matches = "matcher" in insertItem && insertItem.matcher(href);

      if (!matches) {
        toast.error(dictionary.embedInvalidLink);
        return;
      }

      insertNode({
        name: "embed",
        attrs: {
          href,
        },
      });
    }

    if (event.key === "Escape") {
      close();
    }
  };

  const handleLinkInputPaste = (
    event: React.ClipboardEvent<HTMLInputElement>
  ) => {
    if (!props.isActive) {
      return;
    }
    if (!insertItem) {
      return;
    }

    const href = event.clipboardData.getData("text/plain");
    const matches = "matcher" in insertItem && insertItem.matcher(href);

    if (matches) {
      event.preventDefault();
      event.stopPropagation();

      insertNode({
        name: "embed",
        attrs: {
          href,
        },
      });
    }
  };

  const triggerFilePick = (accept: string) => {
    if (inputRef.current) {
      if (accept) {
        inputRef.current.accept = accept;
      }
      inputRef.current.click();
    }
  };

  const triggerLinkInput = (item: MenuItem) => {
    setInsertItem(item);
    setInsertMode("embed");
  };

  const handlePromptSubmit = React.useCallback(
    async (promptValue: string) => {
      const trimmedPrompt = promptValue.trim();

      if (!trimmedPrompt) {
        toast.error(dictionary.aiPromptRequired);
        return;
      }

      const initialState = view.state;
      const docText = initialState.doc.textBetween(
        0,
        initialState.doc.content.size,
        "\n\n"
      );
      const triggerSuffix = `${props.trigger}${props.search ?? ""}`;
      const sanitizedDocText = triggerSuffix
        ? docText.endsWith(triggerSuffix)
          ? docText.slice(0, docText.length - triggerSuffix.length)
          : docText
        : docText;
      const context = sanitizedDocText.slice(
        Math.max(0, sanitizedDocText.length - 2000)
      );

      await generateAiText({
        prompt: trimmedPrompt,
        context,
        requirePrompt: false,
      });
    },
    [
      dictionary.aiPromptRequired,
      generateAiText,
      props.search,
      props.trigger,
      view,
    ]
  );

  const handlePromptFormSubmit = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (isGenerating) {
        return;
      }

      if (promptInputRef.current) {
        void handlePromptSubmit(promptInputRef.current.value);
      }
    },
    [handlePromptSubmit, isGenerating]
  );

  const handlePromptKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (!props.isActive) {
      return;
    }

    if (event.key === "Enter") {
      event.stopPropagation();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  const handleFilesPicked = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    // Re-focus the editor as it loses focus when file picker is opened on iOS
    view.focus();

    const { uploadFile, onFileUploadStart, onFileUploadStop } = props;
    const files = getEventFiles(event);
    const parent = findParentNode((node) => !!node)(view.state.selection);

    handleClearSearch();

    if (!uploadFile) {
      throw new Error("uploadFile prop is required to replace files");
    }

    if (parent) {
      await insertFiles(view, event, parent.pos, files, {
        uploadFile,
        onFileUploadStart,
        onFileUploadStop,
        dictionary,
        isAttachment: inputRef.current?.accept === "*",
      });
    }

    if (inputRef.current) {
      inputRef.current.value = "";
    }

    props.onClose();
  };

  const filtered = React.useMemo(() => {
    const { embeds = [], search = "", uploadFile, filterable = true } = props;
    let items: (EmbedDescriptor | MenuItem)[] = [...props.items];
    const embedItems: EmbedDescriptor[] = [];

    for (const embed of embeds) {
      if (embed.title && embed.visible !== false) {
        embedItems.push(
          new EmbedDescriptor({
            ...embed,
            name: "embed",
          })
        );
      }
    }

    if (embedItems.length) {
      items = items.concat(
        {
          name: "separator",
        },
        embedItems
      );
    }

    const searchInput = search.toLowerCase();
    const filtered = items.filter((item) => {
      if (item.name === "separator") {
        return true;
      }

      if (item.visible === false) {
        return false;
      }

      // Some extensions may be disabled, remove corresponding menu items
      const commandName = item.name;
      const skipCommandValidation =
        "skipCommandCheck" in item && !!item.skipCommandCheck;

      if (
        commandName &&
        commandName !== "noop" &&
        !skipCommandValidation &&
        !commands[commandName] &&
        !commands[`create${capitalize(commandName)}`]
      ) {
        return false;
      }

      // If no image upload callback has been passed, filter the image block out
      if (!uploadFile && item.name === "image") {
        return false;
      }

      // some items (defaultHidden) are not visible until a search query exists
      if (!search) {
        return !item.defaultHidden;
      }

      if (!filterable) {
        return item;
      }

      return (
        (item.name || "").toLocaleLowerCase().includes(searchInput) ||
        (item.title || "").toLocaleLowerCase().includes(searchInput) ||
        (item.keywords || "").toLocaleLowerCase().includes(searchInput)
      );
    });

    return filterExcessSeparators(
      orderBy(
        filtered.map((item) => ({
          item,
          section:
            "section" in item && item.section && "priority" in item.section
              ? ((item.section.priority as number) ?? 0)
              : 0,
          priority: "priority" in item ? item.priority : 0,
          score:
            searchInput && item.title
              ? commandScore(item.title, searchInput)
              : 0,
        })),
        ["section", "priority", "score"],
        ["desc", "desc", "desc"]
      ).map(({ item }) => item)
    );
  }, [commands, props]);

  React.useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (
        !menuRef.current ||
        menuRef.current.contains(event.target as Element)
      ) {
        return;
      }

      close();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) {
        return;
      }
      if (!props.isActive) {
        return;
      }

      if (insertMode !== "none") {
        if (event.key === "Escape") {
          event.preventDefault();
          close();
        }
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();

        const item = filtered[selectedIndex];

        if (item) {
          handleClickItem(item);
        } else {
          props.onClose(true);
        }
      }

      if (
        event.key === "ArrowUp" ||
        (event.key === "Tab" && event.shiftKey) ||
        (event.ctrlKey && event.key === "p")
      ) {
        event.preventDefault();
        event.stopPropagation();

        if (filtered.length) {
          const prevIndex = selectedIndex - 1;
          const prev = filtered[prevIndex];

          setSelectedIndex(
            Math.max(0, prev?.name === "separator" ? prevIndex - 1 : prevIndex)
          );
        } else {
          close();
        }
      }

      if (
        event.key === "ArrowDown" ||
        (event.key === "Tab" && !event.shiftKey) ||
        (event.ctrlKey && event.key === "n")
      ) {
        event.preventDefault();
        event.stopPropagation();

        if (filtered.length) {
          const total = filtered.length - 1;
          const nextIndex = selectedIndex + 1;
          const next = filtered[nextIndex];

          setSelectedIndex(
            Math.min(
              next?.name === "separator" ? nextIndex + 1 : nextIndex,
              total
            )
          );
        } else {
          close();
        }
      }

      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };

    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("keydown", handleKeyDown, {
      capture: true,
    });

    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("keydown", handleKeyDown, {
        capture: true,
      });
    };
  }, [close, filtered, handleClickItem, insertMode, props, selectedIndex]);

  const { isActive, uploadFile } = props;
  const items = filtered;
  let previousHeading: string | undefined;

  return (
    <Portal>
      <Wrapper active={isActive} ref={menuRef} hiddenScrollbars {...position}>
        {(isActive || hasActivated.current) && (
          <>
            {insertMode === "embed" && insertItem ? (
              <LinkInputWrapper>
                <LinkInput
                  type="text"
                  placeholder={
                    "placeholder" in insertItem && !!insertItem.placeholder
                      ? insertItem.placeholder
                      : insertItem.title
                        ? dictionary.pasteLinkWithTitle(insertItem.title)
                        : dictionary.pasteLink
                  }
                  onKeyDown={handleLinkInputKeydown}
                  onPaste={handleLinkInputPaste}
                  autoFocus
                />
              </LinkInputWrapper>
            ) : insertMode === "ai" && insertItem ? (
              <PromptWrapper>
                <PromptForm onSubmit={handlePromptFormSubmit}>
                  <PromptInput
                    ref={promptInputRef}
                    placeholder={dictionary.aiPromptPlaceholder}
                    onKeyDown={handlePromptKeyDown}
                    disabled={isGenerating}
                    autoFocus
                  />
                  <PromptButton type="submit" disabled={isGenerating}>
                    {isGenerating
                      ? dictionary.aiGenerating
                      : dictionary.aiGenerateButton}
                  </PromptButton>
                </PromptForm>
              </PromptWrapper>
            ) : (
              <List>
                {items.map((item, index) => {
                  if (item.name === "separator") {
                    return (
                      <ListItem key={index}>
                        <hr />
                      </ListItem>
                    );
                  }

                  if (!item.title) {
                    return null;
                  }

                  const handlePointerMove = (ev: React.PointerEvent) => {
                    if (
                      selectedIndex !== index &&
                      // Safari triggers pointermove with identical coordinates when the pointer has not moved.
                      // This causes the menu selection to flicker when the pointer is over the menu but not moving.
                      (pointerRef.current.clientX !== ev.clientX ||
                        pointerRef.current.clientY !== ev.clientY)
                    ) {
                      setSelectedIndex(index);
                    }
                    pointerRef.current = {
                      clientX: ev.clientX,
                      clientY: ev.clientY,
                    };
                  };

                  const handlePointerDown = () => {
                    if (selectedIndex !== index) {
                      setSelectedIndex(index);
                    }
                  };

                  const handleOnClick = () => {
                    handleClickItem(item);
                  };

                  const currentHeading =
                    "section" in item ? item.section?.({ t }) : undefined;

                  const response = (
                    <React.Fragment key={`${index}-${item.name}`}>
                      {currentHeading !== previousHeading && (
                        <MenuHeader key={currentHeading}>
                          {currentHeading}
                        </MenuHeader>
                      )}
                      <ListItem
                        onPointerMove={handlePointerMove}
                        onPointerDown={handlePointerDown}
                      >
                        {props.renderMenuItem(item as MenuItem, index, {
                          selected: index === selectedIndex,
                          onClick: handleOnClick,
                        })}
                      </ListItem>
                    </React.Fragment>
                  );

                  previousHeading = currentHeading;
                  return response;
                })}
                {items.length === 0 && (
                  <ListItem>
                    <Empty>{dictionary.noResults}</Empty>
                  </ListItem>
                )}
              </List>
            )}
            {uploadFile && (
              <VisuallyHidden.Root>
                <label>
                  <Trans>Import document</Trans>
                  <input
                    type="file"
                    ref={inputRef}
                    onChange={handleFilesPicked}
                    multiple
                  />
                </label>
              </VisuallyHidden.Root>
            )}
          </>
        )}
      </Wrapper>
    </Portal>
  );
}

const LinkInputWrapper = styled.div`
  margin: 8px;
`;

const LinkInput = styled(Input)`
  height: 32px;
  width: 100%;
  color: ${s("textSecondary")};
`;

const PromptWrapper = styled.div`
  margin: 8px;
`;

const PromptForm = styled.form`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const PromptInput = styled(Input)`
  flex: 1;
  height: 36px;
  font-size: 15px;
  padding: 0 14px;
`;

const PromptButton = styled(Button)`
  height: 36px;
  padding: 0 14px;
  white-space: nowrap;
`;

const List = styled.ol`
  list-style: none;
  text-align: left;
  height: 100%;
  padding: 6px;
  margin: 0;
`;

const ListItem = styled.li`
  padding: 0;
  margin: 0;
`;

const Empty = styled.div`
  display: flex;
  align-items: center;
  color: ${s("textSecondary")};
  font-weight: 500;
  font-size: 14px;
  height: 32px;
  padding: 0 16px;
`;

export const Wrapper = styled(Scrollable)<{
  active: boolean;
  top?: number;
  bottom?: number;
  left?: number;
  isAbove: boolean;
}>`
  color: ${s("textSecondary")};
  font-family: ${s("fontFamily")};
  position: absolute;
  z-index: ${depths.editorToolbar};
  ${(props) => props.top !== undefined && `top: ${props.top}px`};
  ${(props) => props.bottom !== undefined && `bottom: ${props.bottom}px`};
  left: ${(props) => props.left}px;
  background: ${s("menuBackground")};
  border-radius: 6px;
  box-shadow:
    rgba(0, 0, 0, 0.05) 0px 0px 0px 1px,
    rgba(0, 0, 0, 0.08) 0px 4px 8px,
    rgba(0, 0, 0, 0.08) 0px 2px 4px;
  opacity: 0;
  transform: scale(0.95);
  transition:
    opacity 150ms cubic-bezier(0.175, 0.885, 0.32, 1.275),
    transform 150ms cubic-bezier(0.175, 0.885, 0.32, 1.275);
  transition-delay: 150ms;
  line-height: 0;
  box-sizing: border-box;
  pointer-events: none;
  white-space: nowrap;
  width: 460px;
  height: auto;
  max-height: 324px;

  * {
    box-sizing: border-box;
  }

  hr {
    border: 0;
    height: 0;
    border-top: 1px solid ${s("divider")};
  }

  ${({ active, isAbove }) =>
    active &&
    `
    transform: translateY(${isAbove ? "6px" : "-6px"}) scale(1);
    pointer-events: all;
    opacity: 1;
  `};

  @media print {
    display: none;
  }
`;

export default SuggestionsMenu;
