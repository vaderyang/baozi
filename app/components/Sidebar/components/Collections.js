// @flow
import fractionalIndex from "fractional-index";
import { observer } from "mobx-react";
import { PlusIcon } from "outline-icons";
import * as React from "react";
import { useDrop } from "react-dnd";
import { useTranslation } from "react-i18next";
import Fade from "components/Fade";
import Flex from "components/Flex";
import useStores from "../../../hooks/useStores";
import CollectionLink from "./CollectionLink";
import DropCursor from "./DropCursor";
import Header from "./Header";
import PlaceholderCollections from "./PlaceholderCollections";
import SidebarLink from "./SidebarLink";
import useCurrentTeam from "hooks/useCurrentTeam";
import useToasts from "hooks/useToasts";

type Props = {
  onCreateCollection: () => void,
};

function Collections({ onCreateCollection }: Props) {
  const [isFetching, setFetching] = React.useState(false);
  const [fetchError, setFetchError] = React.useState();
  const { ui, policies, documents, collections } = useStores();
  const { showToast } = useToasts();
  const isPreloaded: boolean = !!collections.orderedData.length;
  const { t } = useTranslation();
  const team = useCurrentTeam();
  const orderedCollections = collections.orderedData;
  const can = policies.abilities(team.id);
  const [isDraggingAnyCollection, setIsDraggingAnyCollection] = React.useState(
    false
  );

  React.useEffect(() => {
    async function load() {
      if (!collections.isLoaded && !isFetching && !fetchError) {
        try {
          setFetching(true);
          await collections.fetchPage({ limit: 100 });
        } catch (error) {
          showToast(
            t("Collections could not be loaded, please reload the app"),
            {
              type: "error",
            }
          );
          setFetchError(error);
        } finally {
          setFetching(false);
        }
      }
    }
    load();
  }, [collections, isFetching, showToast, fetchError, t]);

  const [{ isCollectionDropping }, dropToReorderCollection] = useDrop({
    accept: "collection",
    drop: async (item, monitor) => {
      collections.move(
        item.id,
        fractionalIndex(null, orderedCollections[0].index)
      );
    },
    canDrop: (item, monitor) => {
      return item.id !== orderedCollections[0].id;
    },
    collect: (monitor) => ({
      isCollectionDropping: monitor.isOver(),
    }),
  });

  const content = (
    <>
      <DropCursor
        isActiveDrop={isCollectionDropping}
        innerRef={dropToReorderCollection}
        from="collections"
      />
      {orderedCollections.map((collection, index) => (
        <CollectionLink
          key={collection.id}
          collection={collection}
          activeDocument={documents.active}
          prefetchDocument={documents.prefetchDocument}
          canUpdate={policies.abilities(collection.id).update}
          ui={ui}
          isDraggingAnyCollection={isDraggingAnyCollection}
          onChangeDragging={setIsDraggingAnyCollection}
          belowCollection={orderedCollections[index + 1]}
        />
      ))}
      {can.createCollection && (
        <SidebarLink
          to="/collections"
          onClick={onCreateCollection}
          icon={<PlusIcon color="currentColor" />}
          label={`${t("New collection")}…`}
          exact
        />
      )}
    </>
  );

  if (!collections.isLoaded || fetchError) {
    return (
      <Flex column>
        <Header>{t("Collections")}</Header>
        <PlaceholderCollections />
      </Flex>
    );
  }

  return (
    <Flex column>
      <Header>{t("Collections")}</Header>
      {isPreloaded ? content : <Fade>{content}</Fade>}
    </Flex>
  );
}

export default observer(Collections);
