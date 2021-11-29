import fractionalIndex from "fractional-index";
import naturalSort from "@shared/utils/naturalSort";
import { Collection } from "@server/models";

export default async function collectionIndexing(teamId: string) {
  const collections = await Collection.findAll({
    where: {
      teamId,
      deletedAt: null,
    },
    //no point in maintaining index of deleted collections.
    attributes: ["id", "index", "name"],
  });
  // @ts-expect-error ts-migrate(7006) FIXME: Parameter 'collection' implicitly has an 'any' typ... Remove this comment to see the full error message
  let sortableCollections = collections.map((collection) => {
    return [collection, collection.index];
  });
  sortableCollections = naturalSort(
    sortableCollections,
    // @ts-expect-error ts-migrate(2345) FIXME: Argument of type '(collection: any) => any' is not... Remove this comment to see the full error message
    (collection) => collection[0].name
  );
  //for each collection with null index, use previous collection index to create new index
  let previousCollectionIndex = null;

  for (const collection of sortableCollections) {
    if (collection[1] === null) {
      const index = fractionalIndex(previousCollectionIndex, collection[1]);
      collection[0].index = index;
      await collection[0].save();
    }

    previousCollectionIndex = collection[0].index;
  }

  const indexedCollections = {};
  // @ts-expect-error ts-migrate(7006) FIXME: Parameter 'collection' implicitly has an 'any' typ... Remove this comment to see the full error message
  sortableCollections.forEach((collection) => {
    indexedCollections[collection[0].id] = collection[0].index;
  });
  return indexedCollections;
}
