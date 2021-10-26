// @flow
import invariant from "invariant";
import {
  DownloadIcon,
  DuplicateIcon,
  StarredIcon,
  PrintIcon,
  UnstarredIcon,
  DocumentIcon,
  NewDocumentIcon,
  ShapesIcon,
  ImportIcon,
} from "outline-icons";
import * as React from "react";
import DocumentTemplatize from "scenes/DocumentTemplatize";
import { createAction } from "actions";
import { DocumentSection } from "actions/sections";
import getDataTransferFiles from "utils/getDataTransferFiles";
import history from "utils/history";
import { newDocumentPath } from "utils/routeHelpers";

export const openDocument = createAction({
  name: ({ t }) => t("Open document"),
  section: DocumentSection,
  shortcut: ["o", "d"],
  keywords: "go to",
  icon: <DocumentIcon />,
  children: ({ stores }) => {
    const paths = stores.collections.pathsToDocuments;

    return paths
      .filter((path) => path.type === "document")
      .map((path) => ({
        // Note: using url which includes the slug rather than id here to bust
        // cache if the document is renamed
        id: path.url,
        name: path.title,
        icon: () =>
          stores.documents.get(path.id)?.isStarred ? (
            <StarredIcon />
          ) : undefined,
        section: DocumentSection,
        perform: () => history.push(path.url),
      }));
  },
});

export const createDocument = createAction({
  name: ({ t }) => t("New document"),
  section: DocumentSection,
  icon: <NewDocumentIcon />,
  keywords: "create",
  visible: ({ activeCollectionId, stores }) =>
    !!activeCollectionId &&
    stores.policies.abilities(activeCollectionId).update,
  perform: ({ activeCollectionId }) =>
    activeCollectionId && history.push(newDocumentPath(activeCollectionId)),
});

export const starDocument = createAction({
  name: ({ t }) => t("Star"),
  section: DocumentSection,
  icon: <StarredIcon />,
  keywords: "favorite bookmark",
  visible: ({ activeDocumentId, stores }) => {
    if (!activeDocumentId) return false;
    const document = stores.documents.get(activeDocumentId);

    return (
      !document?.isStarred && stores.policies.abilities(activeDocumentId).star
    );
  },
  perform: ({ activeDocumentId, stores }) => {
    if (!activeDocumentId) return false;

    const document = stores.documents.get(activeDocumentId);
    document?.star();
  },
});

export const unstarDocument = createAction({
  name: ({ t }) => t("Unstar"),
  section: DocumentSection,
  icon: <UnstarredIcon />,
  keywords: "unfavorite unbookmark",
  visible: ({ activeDocumentId, stores }) => {
    if (!activeDocumentId) return false;
    const document = stores.documents.get(activeDocumentId);

    return (
      !!document?.isStarred &&
      stores.policies.abilities(activeDocumentId).unstar
    );
  },
  perform: ({ activeDocumentId, stores }) => {
    if (!activeDocumentId) return false;

    const document = stores.documents.get(activeDocumentId);
    document?.unstar();
  },
});

export const downloadDocument = createAction({
  name: ({ t, isContextMenu }) =>
    isContextMenu ? t("Download") : t("Download document"),
  section: DocumentSection,
  icon: <DownloadIcon />,
  keywords: "export",
  visible: ({ activeDocumentId, stores }) =>
    !!activeDocumentId && stores.policies.abilities(activeDocumentId).download,
  perform: ({ activeDocumentId, stores }) => {
    if (!activeDocumentId) return false;

    const document = stores.documents.get(activeDocumentId);
    document?.download();
  },
});

export const duplicateDocument = createAction({
  name: ({ t, isContextMenu }) =>
    isContextMenu ? t("Duplicate") : t("Duplicate document"),
  section: DocumentSection,
  icon: <DuplicateIcon />,
  keywords: "copy",
  visible: ({ activeDocumentId, stores }) =>
    !!activeDocumentId && stores.policies.abilities(activeDocumentId).update,
  perform: async ({ activeDocumentId, t, stores }) => {
    if (!activeDocumentId) return false;

    const document = stores.documents.get(activeDocumentId);
    invariant(document, "Document must exist");

    const duped = await document.duplicate();

    // when duplicating, go straight to the duplicated document content
    history.push(duped.url);
    stores.toasts.showToast(t("Document duplicated"), { type: "success" });
  },
});

export const printDocument = createAction({
  name: ({ t, isContextMenu }) =>
    isContextMenu ? t("Print") : t("Print document"),
  section: DocumentSection,
  icon: <PrintIcon />,
  visible: ({ activeDocumentId }) => !!activeDocumentId,
  perform: async () => {
    window.print();
  },
});

export const importDocument = createAction({
  name: ({ t, activeDocumentId }) => t("Import document"),
  section: DocumentSection,
  icon: <ImportIcon />,
  keywords: "upload",
  visible: ({ activeCollectionId, activeDocumentId, stores }) => {
    if (activeDocumentId) {
      return !!stores.policies.abilities(activeDocumentId).createChildDocument;
    }
    if (activeCollectionId) {
      return !!stores.policies.abilities(activeCollectionId).update;
    }
    return false;
  },
  perform: ({ activeCollectionId, activeDocumentId, stores }) => {
    const { documents, toasts } = stores;

    const input = document.createElement("input");
    input.type = "file";
    input.accept = documents.importFileTypes.join(", ");
    input.onchange = async (ev: SyntheticEvent<>) => {
      const files = getDataTransferFiles(ev);

      try {
        const file = files[0];
        const document = await documents.import(
          file,
          activeDocumentId,
          activeCollectionId,
          {
            publish: true,
          }
        );
        history.push(document.url);
      } catch (err) {
        toasts.showToast(err.message, {
          type: "error",
        });

        throw err;
      }
    };
    input.click();
  },
});

export const createTemplate = createAction({
  name: ({ t }) => t("Templatize"),
  section: DocumentSection,
  icon: <ShapesIcon />,
  keywords: "new create template",
  visible: ({ activeCollectionId, activeDocumentId, stores }) => {
    if (!activeDocumentId) return false;

    const document = stores.documents.get(activeDocumentId);

    return (
      !!activeCollectionId &&
      stores.policies.abilities(activeCollectionId).update &&
      !document?.isTemplate
    );
  },
  perform: ({ activeDocumentId, stores, t, event }) => {
    event?.preventDefault();
    event?.stopPropagation();

    stores.dialogs.openModal({
      title: t("Create template"),
      content: (
        <DocumentTemplatize
          documentId={activeDocumentId}
          onSubmit={stores.dialogs.closeAllModals}
        />
      ),
    });
  },
});

export const rootDocumentActions = [
  openDocument,
  createDocument,
  createTemplate,
  importDocument,
  downloadDocument,
  starDocument,
  unstarDocument,
  duplicateDocument,
  printDocument,
];
