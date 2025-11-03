import { observer } from "mobx-react";
import { useState, useRef, useCallback, useEffect } from "react";
import styled from "styled-components";
import { DocumentIcon } from "outline-icons";
import { MentionType } from "@shared/types";
import { s } from "@shared/styles";
import Icon from "@shared/components/Icon";
import Button from "~/components/Button";
import { Portal } from "~/components/Portal";
import useDictionary from "~/hooks/useDictionary";
import useStores from "~/hooks/useStores";
import { client } from "~/utils/ApiClient";
import Input from "./Input";

type MentionData = {
  id: string;
  type: MentionType;
  modelId: string;
  label: string;
};

type Props = {
  onSubmit: (prompt: string, mentionedDocumentIds: string[]) => void;
  disabled?: boolean;
  autoFocus?: boolean;
};

function AiPromptInput({ onSubmit, disabled, autoFocus }: Props) {
  const dictionary = useDictionary();
  const { documents } = useStores();
  const [inputValue, setInputValue] = useState("");
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);
  const [mentions, setMentions] = useState<MentionData[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dropdownPosition, setDropdownPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Fetch documents when mention search changes
  useEffect(() => {
    if (showMentionMenu) {
      client
        .post("/suggestions.mention", {
          query: mentionSearch,
          limit: 10,
        })
        .then((res) => {
          documents.addPolicies(res.policies);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          res.data.documents.forEach((doc: any) => documents.add(doc));
        })
        .catch(() => {
          // Silently fail
        });
    }
  }, [mentionSearch, documents, showMentionMenu]);

  // Update dropdown position when menu is shown
  useEffect(() => {
    if (showMentionMenu && wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }
  }, [showMentionMenu]);

  const filteredDocuments = documents
    .findByQuery(mentionSearch, { maxResults: 10 })
    .filter((doc) => !mentions.some((m) => m.modelId === doc.id));

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart ?? 0;

    setInputValue(value);
    setCursorPosition(cursorPos);

    // Check if @ was just typed
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
      // Check if there's no space after @ (still in mention mode)
      if (!textAfterAt.includes(" ")) {
        setMentionSearch(textAfterAt);
        setShowMentionMenu(true);
        setSelectedIndex(0);
        return;
      }
    }

    setShowMentionMenu(false);
  };

  const handleMentionSelect = useCallback(
    (doc: unknown) => {
      const document = doc as { id: string; title: string };
      const textBeforeCursor = inputValue.substring(0, cursorPosition);
      const lastAtIndex = textBeforeCursor.lastIndexOf("@");

      if (lastAtIndex === -1) {
        setShowMentionMenu(false);
        return;
      }

      // Replace @search with the mention
      const beforeMention = inputValue.substring(0, lastAtIndex);
      const afterCursor = inputValue.substring(cursorPosition);
      const mentionText = `@${document.title}`;
      const newValue = beforeMention + mentionText + " " + afterCursor;

      setInputValue(newValue);
      setShowMentionMenu(false);
      setMentionSearch("");

      // Store the mention data
      setMentions((prev) => [
        ...prev,
        {
          id: document.id,
          type: MentionType.Document,
          modelId: document.id,
          label: document.title,
        },
      ]);

      // Focus back on input
      setTimeout(() => {
        if (inputRef.current) {
          const newCursorPos = lastAtIndex + mentionText.length + 1;
          inputRef.current.focus();
          inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
    },
    [inputValue, cursorPosition]
  );

  const handleSubmit = () => {
    const trimmedPrompt = inputValue.trim();
    if (!trimmedPrompt || disabled) {
      return;
    }

    // Extract document IDs from mentions
    const documentIds = mentions
      .filter((m) => m.type === MentionType.Document)
      .map((m) => m.modelId);

    onSubmit(trimmedPrompt, documentIds);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showMentionMenu) {
      if (e.key === "Escape") {
        e.preventDefault();
        setShowMentionMenu(false);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          Math.min(prev + 1, filteredDocuments.length - 1)
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filteredDocuments[selectedIndex]) {
          handleMentionSelect(filteredDocuments[selectedIndex]);
        }
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowMentionMenu(false);
      }
    };

    if (showMentionMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [showMentionMenu]);

  return (
    <>
      <Wrapper ref={wrapperRef}>
        <InputWrapper>
          <StyledInput
            ref={inputRef}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={dictionary.aiPromptPlaceholder}
            disabled={disabled}
            autoFocus={autoFocus}
          />
          <SubmitButton
            type="button"
            onClick={handleSubmit}
            disabled={disabled}
          >
            {disabled ? dictionary.aiGenerating : dictionary.aiGenerateButton}
          </SubmitButton>
        </InputWrapper>
      </Wrapper>
      {showMentionMenu && (
        <Portal>
          <MentionDropdown
            ref={menuRef}
            style={{
              top: `${dropdownPosition.top}px`,
              left: `${dropdownPosition.left}px`,
              width: `${dropdownPosition.width}px`,
            }}
            onMouseDown={(e) => {
              // Prevent the parent SuggestionsMenu from closing when clicking the dropdown
              e.stopPropagation();
            }}
          >
            {filteredDocuments.length > 0 ? (
              filteredDocuments.map((doc, index) => (
                <MenuItem
                  key={doc.id}
                  selected={index === selectedIndex}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMentionSelect(doc);
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <MenuItemIcon>
                    {doc.icon ? (
                      <Icon value={doc.icon} color={doc.color ?? undefined} />
                    ) : (
                      <DocumentIcon />
                    )}
                  </MenuItemIcon>
                  <MenuItemTitle>{doc.title}</MenuItemTitle>
                </MenuItem>
              ))
            ) : (
              <MenuItem>No documents found</MenuItem>
            )}
          </MentionDropdown>
        </Portal>
      )}
    </>
  );
}

const Wrapper = styled.div`
  margin: 8px;
`;

const InputWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const StyledInput = styled(Input)`
  flex: 1;
  height: 36px;
  font-size: 15px;
  padding: 0 14px;
`;

const SubmitButton = styled(Button)`
  height: 36px;
  padding: 0 14px;
  white-space: nowrap;
`;

const MentionDropdown = styled.div`
  position: fixed;
  background: ${s("menuBackground")};
  border-radius: 6px;
  box-shadow:
    rgba(0, 0, 0, 0.05) 0px 0px 0px 1px,
    rgba(0, 0, 0, 0.08) 0px 4px 8px,
    rgba(0, 0, 0, 0.08) 0px 2px 4px;
  max-height: 300px;
  overflow-y: auto;
  z-index: 10000;
  padding: 6px;
`;

const MenuItem = styled.div<{ selected?: boolean }>`
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  color: ${s("text")};
  background: ${(props) =>
    props.selected ? s("listItemHoverBackground") : "transparent"};

  &:hover {
    background: ${s("listItemHoverBackground")};
  }
`;

const MenuItemIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin-right: 8px;
  flex-shrink: 0;
`;

const MenuItemTitle = styled.div`
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export default observer(AiPromptInput);
