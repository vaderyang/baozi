import { observer } from "mobx-react";
import { PlusIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, useHistory } from "react-router-dom";
import { toast } from "sonner";
import Collection from "~/models/Collection";
import { Action, Separator } from "~/components/Actions";
import Button from "~/components/Button";
import usePolicy from "~/hooks/usePolicy";
import CollectionMenu from "~/menus/CollectionMenu";
import { newDocumentPath } from "~/utils/routeHelpers";
import styled from "styled-components";
import { s } from "@shared/styles";
import MicrophoneIcon from "~/components/Icons/MicrophoneIcon";

type Props = {
  collection: Collection;
};

function Actions({ collection }: Props) {
  const { t } = useTranslation();
  const history = useHistory();
  const can = usePolicy(collection);
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isDropdownOpen]);

  const handleNewRecording = async () => {
    setIsDropdownOpen(false);

    // Check MediaRecorder support
    if (typeof MediaRecorder === "undefined") {
      toast.error("Audio recording is not supported in this browser");
      return;
    }

    try {
      // Create a new document with a timestamp title
      const now = new Date();
      const title = `Recording ${now.toLocaleString()}`;

      // Navigate to new document path and pass recording flag
      const path = newDocumentPath(collection?.id);
      history.push(path, {
        title,
        startRecording: true,
      });
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to create recording document"
      );
    }
  };

  return (
    <>
      {can.createDocument && (
        <>
          <Action>
            <DropdownContainer ref={dropdownRef}>
              <Button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                disabled={!collection}
                icon={<PlusIcon />}
              >
                {t("New doc")}
              </Button>
              {isDropdownOpen && (
                <DropdownMenu>
                  <DropdownItem
                    as={Link}
                    to={collection ? newDocumentPath(collection.id) : ""}
                    onClick={() => setIsDropdownOpen(false)}
                  >
                    <PlusIcon />
                    <span>{t("New document")}</span>
                    <Shortcut>N</Shortcut>
                  </DropdownItem>
                  <DropdownItem onClick={handleNewRecording}>
                    <MicrophoneIcon />
                    <span>{t("New recording")}</span>
                    <Shortcut>R</Shortcut>
                  </DropdownItem>
                </DropdownMenu>
              )}
            </DropdownContainer>
          </Action>
          <Separator />
        </>
      )}
      <Action>
        <CollectionMenu collection={collection} align="end" neutral />
      </Action>
    </>
  );
}

const DropdownContainer = styled.div`
  position: relative;
  display: inline-block;
`;

const DropdownMenu = styled.div`
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 200px;
  background: ${s("menuBackground")};
  border: 1px solid ${s("divider")};
  border-radius: 8px;
  box-shadow: ${s("menuShadow")};
  z-index: 1000;
  overflow: hidden;
`;

const DropdownItem = styled.a`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  color: ${s("text")};
  text-decoration: none;
  cursor: pointer;
  transition: background 100ms ease-in-out;

  &:hover {
    background: ${s("listItemHoverBackground")};
  }

  svg {
    width: 20px;
    height: 20px;
    color: ${s("textSecondary")};
  }

  span {
    flex: 1;
    font-size: 15px;
  }
`;

const Shortcut = styled.kbd`
  font-size: 11px;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 4px;
  background: ${s("sidebarBackground")};
  color: ${s("textSecondary")};
  border: 1px solid ${s("divider")};
  font-family: monospace;
  min-width: 20px;
  text-align: center;
`;

export default observer(Actions);
