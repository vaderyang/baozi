import { observer } from "mobx-react";
import * as React from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { MAX_TITLE_LENGTH } from "@shared/constants";
import Fade from "~/components/Fade";
import useBoolean from "~/hooks/useBoolean";
import useStores from "~/hooks/useStores";
import DocumentMenu from "~/menus/DocumentMenu";
import Disclosure from "./Disclosure";
import EditableTitle from "./EditableTitle";
import SidebarLink from "./SidebarLink";

type Props = {
  depth: number;
  title: string;
  to: string;
  documentId: string;
  collectionId: string;
};

function StarredLink({ depth, title, to, documentId, collectionId }: Props) {
  const { t } = useTranslation();
  const { collections, documents, policies } = useStores();
  const collection = collections.get(collectionId);
  const document = documents.get(documentId);
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, handleMenuOpen, handleMenuClose] = useBoolean();
  const canUpdate = policies.abilities(documentId).update;
  const childDocuments = collection
    ? collection.getDocumentChildren(documentId)
    : [];
  const hasChildDocuments = childDocuments.length > 0;
  const [isEditing, setIsEditing] = React.useState(false);

  useEffect(() => {
    async function load() {
      if (!document) {
        await documents.fetch(documentId);
      }
    }

    load();
  }, [collection, collectionId, collections, document, documentId, documents]);

  const handleDisclosureClick = React.useCallback(
    (ev: React.MouseEvent<SVGElement>) => {
      ev.preventDefault();
      ev.stopPropagation();
      setExpanded((prevExpanded) => !prevExpanded);
    },
    []
  );

  const handleTitleChange = React.useCallback(
    async (title: string) => {
      if (!document) return;
      await documents.update(
        {
          id: document.id,
          text: document.text,
          title,
        },
        {
          lastRevision: document.revision,
        }
      );
    },
    [documents, document]
  );

  const handleTitleEditing = React.useCallback((isEditing: boolean) => {
    setIsEditing(isEditing);
  }, []);

  return (
    <>
      <Relative>
        <SidebarLink
          depth={depth}
          to={`${to}?starred`}
          isActive={(match, location) =>
            !!match && location.search === "?starred"
          }
          label={
            <>
              {hasChildDocuments && (
                <Disclosure
                  expanded={expanded}
                  onClick={handleDisclosureClick}
                />
              )}
              <EditableTitle
                title={title || t("Untitled")}
                onSubmit={handleTitleChange}
                onEditing={handleTitleEditing}
                canUpdate={canUpdate}
                maxLength={MAX_TITLE_LENGTH}
              />
            </>
          }
          exact={false}
          showActions={menuOpen}
          menu={
            document && !isEditing ? (
              <Fade>
                <DocumentMenu
                  document={document}
                  onOpen={handleMenuOpen}
                  onClose={handleMenuClose}
                />
              </Fade>
            ) : undefined
          }
        />
      </Relative>
      {expanded &&
        childDocuments.map((childDocument) => (
          <ObserveredStarredLink
            key={childDocument.id}
            depth={depth + 1}
            title={childDocument.title}
            to={childDocument.url}
            documentId={childDocument.id}
            collectionId={collectionId}
          />
        ))}
    </>
  );
}

const Relative = styled.div`
  position: relative;
`;

const ObserveredStarredLink = observer(StarredLink);

export default ObserveredStarredLink;
