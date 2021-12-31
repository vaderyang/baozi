import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  useParams,
  Redirect,
  Switch,
  Route,
  useHistory,
  useRouteMatch,
} from "react-router-dom";
import Collection from "~/models/Collection";
import Search from "~/scenes/Search";
import Badge from "~/components/Badge";
import CenteredContent from "~/components/CenteredContent";
import CollectionDescription from "~/components/CollectionDescription";
import CollectionIcon from "~/components/CollectionIcon";
import Heading from "~/components/Heading";
import PlaceholderList from "~/components/List/Placeholder";
import PaginatedDocumentList from "~/components/PaginatedDocumentList";
import PinnedDocuments from "~/components/PinnedDocuments";
import PlaceholderText from "~/components/PlaceholderText";
import Scene from "~/components/Scene";
import Tab from "~/components/Tab";
import Tabs from "~/components/Tabs";
import Tooltip from "~/components/Tooltip";
import { editCollection } from "~/actions/definitions/collections";
import useCommandBarActions from "~/hooks/useCommandBarActions";
import useStores from "~/hooks/useStores";
import { collectionUrl, updateCollectionUrl } from "~/utils/routeHelpers";
import Actions from "./Collection/Actions";
import DropToImport from "./Collection/DropToImport";
import Empty from "./Collection/Empty";

function CollectionScene() {
  const params = useParams<{ id?: string }>();
  const history = useHistory();
  const match = useRouteMatch();
  const { t } = useTranslation();
  const { documents, pins, policies, collections, ui } = useStores();
  const [isFetching, setFetching] = React.useState(false);
  const [error, setError] = React.useState<Error | undefined>();

  const id = params.id || "";
  const collection: Collection | null | undefined =
    collections.getByUrl(id) || collections.get(id);
  const can = policies.abilities(collection?.id || "");

  React.useEffect(() => {
    if (collection) {
      const canonicalUrl = updateCollectionUrl(match.url, collection);

      if (match.url !== canonicalUrl) {
        history.replace(canonicalUrl);
      }
    }
  }, [collection, history, id, match.url]);

  React.useEffect(() => {
    if (collection) {
      ui.setActiveCollection(collection);
    }
  }, [ui, collection]);

  React.useEffect(() => {
    setError(undefined);

    if (collection) {
      pins.fetchPage({
        collectionId: collection.id,
      });
    }
  }, [pins, collection]);

  React.useEffect(() => {
    async function load() {
      if ((!can || !collection) && !error && !isFetching) {
        try {
          setError(undefined);
          setFetching(true);
          await collections.fetch(id);
        } catch (err) {
          setError(err);
        } finally {
          setFetching(false);
        }
      }
    }

    load();
  }, [collections, isFetching, collection, error, id, can]);

  useCommandBarActions([editCollection]);

  if (!collection && error) {
    return <Search notFound />;
  }

  return collection ? (
    <Scene
      centered={false}
      textTitle={collection.name}
      title={
        <>
          <CollectionIcon collection={collection} expanded />
          &nbsp;
          {collection.name}
        </>
      }
      actions={<Actions collection={collection} />}
    >
      <DropToImport
        accept={documents.importFileTypes.join(", ")}
        disabled={!can.update}
        collectionId={collection.id}
      >
        <CenteredContent withStickyHeader>
          {collection.isEmpty ? (
            <Empty collection={collection} />
          ) : (
            <>
              <Heading>
                <CollectionIcon collection={collection} size={40} expanded />{" "}
                {collection.name}{" "}
                {!collection.permission && (
                  <Tooltip
                    tooltip={t(
                      "This collection is only visible to those given access"
                    )}
                    placement="bottom"
                  >
                    <Badge>{t("Private")}</Badge>
                  </Tooltip>
                )}
              </Heading>
              <CollectionDescription collection={collection} />

              <PinnedDocuments
                pins={pins.inCollection(collection.id)}
                canUpdate={can.update}
              />

              <Tabs>
                <Tab to={collectionUrl(collection.url)} exact>
                  {t("Documents")}
                </Tab>
                <Tab to={collectionUrl(collection.url, "updated")} exact>
                  {t("Recently updated")}
                </Tab>
                <Tab to={collectionUrl(collection.url, "published")} exact>
                  {t("Recently published")}
                </Tab>
                <Tab to={collectionUrl(collection.url, "old")} exact>
                  {t("Least recently updated")}
                </Tab>
                <Tab to={collectionUrl(collection.url, "alphabetical")} exact>
                  {t("A–Z")}
                </Tab>
              </Tabs>
              <Switch>
                <Route path={collectionUrl(collection.url, "alphabetical")}>
                  <PaginatedDocumentList
                    key="alphabetical"
                    documents={documents.alphabeticalInCollection(
                      collection.id
                    )}
                    fetch={documents.fetchAlphabetical}
                    options={{
                      collectionId: collection.id,
                    }}
                  />
                </Route>
                <Route path={collectionUrl(collection.url, "old")}>
                  <PaginatedDocumentList
                    key="old"
                    documents={documents.leastRecentlyUpdatedInCollection(
                      collection.id
                    )}
                    fetch={documents.fetchLeastRecentlyUpdated}
                    options={{
                      collectionId: collection.id,
                    }}
                  />
                </Route>
                <Route path={collectionUrl(collection.url, "recent")}>
                  <Redirect to={collectionUrl(collection.url, "published")} />
                </Route>
                <Route path={collectionUrl(collection.url, "published")}>
                  <PaginatedDocumentList
                    key="published"
                    documents={documents.recentlyPublishedInCollection(
                      collection.id
                    )}
                    fetch={documents.fetchRecentlyPublished}
                    options={{
                      collectionId: collection.id,
                    }}
                    showPublished
                  />
                </Route>
                <Route path={collectionUrl(collection.url, "updated")}>
                  <PaginatedDocumentList
                    key="updated"
                    documents={documents.recentlyUpdatedInCollection(
                      collection.id
                    )}
                    fetch={documents.fetchRecentlyUpdated}
                    options={{
                      collectionId: collection.id,
                    }}
                  />
                </Route>
                <Route path={collectionUrl(collection.url)} exact>
                  <PaginatedDocumentList
                    documents={documents.rootInCollection(collection.id)}
                    fetch={documents.fetchPage}
                    options={{
                      collectionId: collection.id,
                      parentDocumentId: null,
                      sort: collection.sort.field,
                      direction: "ASC",
                    }}
                    showParentDocuments
                  />
                </Route>
              </Switch>
            </>
          )}
        </CenteredContent>
      </DropToImport>
    </Scene>
  ) : (
    <CenteredContent>
      <Heading>
        <PlaceholderText height={35} />
      </Heading>
      <PlaceholderList count={5} />
    </CenteredContent>
  );
}

export default observer(CollectionScene);
