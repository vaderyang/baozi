import invariant from "invariant";
import { observer } from "mobx-react";
import * as React from "react";
import Dropzone from "react-dropzone";
import { useTranslation } from "react-i18next";
import styled, { css } from "styled-components";
import LoadingIndicator from "~/components/LoadingIndicator";
import useImportDocument from "~/hooks/useImportDocument";
import usePolicy from "~/hooks/usePolicy";
import useStores from "~/hooks/useStores";
import useToasts from "~/hooks/useToasts";

type Props = {
  children: JSX.Element;
  collectionId?: string;
  documentId?: string;
  disabled?: boolean;
  activeClassName?: string;
};

function DropToImport({ disabled, children, collectionId, documentId }: Props) {
  const { t } = useTranslation();
  const { documents } = useStores();
  const { showToast } = useToasts();
  const { handleFiles, isImporting } = useImportDocument(
    collectionId,
    documentId
  );
  invariant(
    collectionId || documentId,
    "Must provide either collectionId or documentId"
  );

  const canCollection = usePolicy(collectionId);
  const canDocument = usePolicy(documentId);

  const handleRejection = React.useCallback(() => {
    showToast(
      t("Document not supported – try Markdown, Plain text, HTML, or Word"),
      {
        type: "error",
      }
    );
  }, [t, showToast]);

  if (
    disabled ||
    (collectionId && !canCollection.createDocument) ||
    (documentId && !canDocument.createChildDocument)
  ) {
    return children;
  }

  return (
    <Dropzone
      accept={documents.importFileTypes.join(", ")}
      onDropAccepted={handleFiles}
      onDropRejected={handleRejection}
      noClick
      multiple
    >
      {({ getRootProps, getInputProps, isDragActive }) => (
        <DropzoneContainer
          {...getRootProps()}
          $isDragActive={isDragActive}
          tabIndex={-1}
        >
          <input {...getInputProps()} />
          {isImporting && <LoadingIndicator />}
          {children}
        </DropzoneContainer>
      )}
    </Dropzone>
  );
}

const DropzoneContainer = styled.div<{ $isDragActive: boolean }>`
  border-radius: 4px;

  ${({ $isDragActive, theme }) =>
    $isDragActive &&
    css`
      background: ${theme.slateDark};
      a {
        color: ${theme.white} !important;
      }
      svg {
        fill: ${theme.white};
      }
    `}
`;

export default observer(DropToImport);
