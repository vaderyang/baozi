// @flow
import { observer, inject } from "mobx-react";
import { DocumentIcon } from "outline-icons";
import * as React from "react";
import { withTranslation, type TFunction } from "react-i18next";
import styled from "styled-components";
import DocumentsStore from "stores/DocumentsStore";
import Document from "models/Document";
import Button from "components/Button";
import { DropdownMenu, DropdownMenuItem } from "components/DropdownMenu";

type Props = {
  document: Document,
  documents: DocumentsStore,
  t: TFunction,
};

@observer
class TemplatesMenu extends React.Component<Props> {
  render() {
    const { documents, document, t, ...rest } = this.props;
    const templates = documents.templatesInCollection(document.collectionId);

    if (!templates.length) {
      return null;
    }

    return (
      <DropdownMenu
        position="left"
        label={
          <Button disclosure neutral>
            {t("Templates")}
          </Button>
        }
        {...rest}
      >
        {templates.map((template) => (
          <DropdownMenuItem
            key={template.id}
            onClick={() => document.updateFromTemplate(template)}
          >
            <DocumentIcon />
            <div>
              <strong>{template.titleWithDefault}</strong>
              <br />
              <Author>
                {t("By {{ author }}", { author: template.createdBy.name })}
              </Author>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenu>
    );
  }
}

const Author = styled.div`
  font-size: 13px;
`;

export default withTranslation()<TemplatesMenu>(
  inject("documents")(TemplatesMenu)
);
