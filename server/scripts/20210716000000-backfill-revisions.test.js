// @flow
import { Revision, Event } from "../models";
import { buildDocument } from "../test/factories";
import { flushdb } from "../test/support";
import script from "./20210716000000-backfill-revisions";

beforeEach(() => flushdb());

describe("#work", () => {
  it("should create events for revisions", async () => {
    const document = await buildDocument();
    const revision = await Revision.createFromDocument(document);

    await script();

    const event = await Event.findOne();

    expect(event.name).toEqual("revisions.create");
    expect(event.modelId).toEqual(revision.id);
    expect(event.documentId).toEqual(document.id);
    expect(event.teamId).toEqual(document.teamId);
    expect(event.createdAt).toEqual(revision.createdAt);
  });

  it("should create events for revisions of deleted documents", async () => {
    const document = await buildDocument();
    const revision = await Revision.createFromDocument(document);

    await document.destroy();

    await script();

    const event = await Event.findOne();

    expect(event.name).toEqual("revisions.create");
    expect(event.modelId).toEqual(revision.id);
    expect(event.documentId).toEqual(document.id);
    expect(event.teamId).toEqual(document.teamId);
    expect(event.createdAt).toEqual(revision.createdAt);
  });

  it("should be idempotent", async () => {
    const document = await buildDocument();
    await Revision.createFromDocument(document);

    await script();
    await script();

    const count = await Event.count();
    expect(count).toEqual(1);
  });
});
