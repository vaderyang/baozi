import fractionalIndex from "fractional-index";
import { ValidationError } from "@server/errors";
import { Pin, Event } from "@server/models";
import { sequelize, Op } from "@server/sequelize";

const MAX_PINS = 8;

type Props = {
  /** The user creating the pin */
  user: any;
  /** The document to pin */
  documentId: string;
  /** The collection to pin the document in. If no collection is provided then it will be pinned to home */
  collectionId?: string | undefined;
  /** The index to pin the document at. If no index is provided then it will be pinned to the end of the collection */
  index?: string;
  /** The IP address of the user creating the pin */
  ip: string;
};

/**
 * This command creates a "pinned" document via the pin relation. A document can
 * be pinned to a collection or to the home screen.
 *
 * @param Props The properties of the pin to create
 * @returns Pin The pin that was created
 */
export default async function pinCreator({
  user,
  documentId,
  collectionId,
  ip,
  ...rest
}: Props): Promise<any> {
  let { index } = rest;
  const where = {
    teamId: user.teamId,
    ...(collectionId ? { collectionId } : { collectionId: { [Op.eq]: null } }),
  };

  const count = await Pin.count({ where });
  if (count >= MAX_PINS) {
    throw ValidationError(`You cannot pin more than ${MAX_PINS} documents`);
  }

  if (!index) {
    const pins = await Pin.findAll({
      where,
      attributes: ["id", "index", "updatedAt"],
      limit: 1,
      order: [
        // using LC_COLLATE:"C" because we need byte order to drive the sorting
        // find only the last pin so we can create an index after it
        sequelize.literal('"pins"."index" collate "C" DESC'),
        ["updatedAt", "ASC"],
      ],
    });

    // create a pin at the end of the list
    index = fractionalIndex(pins.length ? pins[0].index : null, null);
  }

  const transaction = await sequelize.transaction();
  let pin;

  try {
    pin = await Pin.create(
      {
        createdById: user.id,
        teamId: user.teamId,
        collectionId,
        documentId,
        index,
      },
      { transaction }
    );

    await Event.create(
      {
        name: "pins.create",
        modelId: pin.id,
        teamId: user.teamId,
        actorId: user.id,
        documentId,
        collectionId,
        ip,
      },
      { transaction }
    );
    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }

  return pin;
}
