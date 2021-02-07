/* eslint-disable flowtype/require-valid-file-annotation */
import { Backlink } from "../models";
import { buildDocument } from "../test/factories";
import { flushdb } from "../test/support";
import BacklinksService from "./backlinks";

const Backlinks = new BacklinksService();

beforeEach(() => flushdb());
beforeEach(jest.resetAllMocks);

describe("documents.publish", () => {
  test("should create new backlink records", async () => {
    const otherDocument = await buildDocument();
    const document = await buildDocument({
      text: `[this is a link](${otherDocument.url})`,
    });

    await Backlinks.on({
      name: "documents.publish",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: document.createdById,
    });

    const backlinks = await Backlink.findAll({
      where: { reverseDocumentId: document.id },
    });

    expect(backlinks.length).toBe(1);
  });

  test("should not fail when linked document is destroyed", async () => {
    const otherDocument = await buildDocument();
    await otherDocument.destroy();

    const document = await buildDocument({
      version: null,
      text: `[ ] checklist item`,
    });

    document.text = `[this is a link](${otherDocument.url})`;
    await document.save();

    await Backlinks.on({
      name: "documents.publish",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: document.createdById,
    });

    const backlinks = await Backlink.findAll({
      where: { reverseDocumentId: document.id },
    });

    expect(backlinks.length).toBe(0);
  });
});

describe("documents.update", () => {
  test("should not fail on a document with no previous revisions", async () => {
    const otherDocument = await buildDocument();
    const document = await buildDocument({
      text: `[this is a link](${otherDocument.url})`,
    });

    await Backlinks.on({
      name: "documents.update",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: document.createdById,
    });

    const backlinks = await Backlink.findAll({
      where: { reverseDocumentId: document.id },
    });

    expect(backlinks.length).toBe(1);
  });

  test("should not fail when previous revision is different document version", async () => {
    const otherDocument = await buildDocument();
    const document = await buildDocument({
      version: null,
      text: `[ ] checklist item`,
    });

    document.text = `[this is a link](${otherDocument.url})`;
    await document.save();

    await Backlinks.on({
      name: "documents.update",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: document.createdById,
    });

    const backlinks = await Backlink.findAll({
      where: { reverseDocumentId: document.id },
    });

    expect(backlinks.length).toBe(1);
  });

  test("should create new backlink records", async () => {
    const otherDocument = await buildDocument();
    const document = await buildDocument();

    document.text = `[this is a link](${otherDocument.url})`;
    await document.save();

    await Backlinks.on({
      name: "documents.update",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: document.createdById,
    });

    const backlinks = await Backlink.findAll({
      where: { reverseDocumentId: document.id },
    });

    expect(backlinks.length).toBe(1);
  });

  test("should destroy removed backlink records", async () => {
    const otherDocument = await buildDocument();
    const yetAnotherDocument = await buildDocument();
    const document = await buildDocument({
      text: `[this is a link](${otherDocument.url})

[this is a another link](${yetAnotherDocument.url})`,
    });

    await Backlinks.on({
      name: "documents.publish",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: document.createdById,
    });

    document.text = `First link is gone
    
[this is a another link](${yetAnotherDocument.url})`;
    await document.save();

    await Backlinks.on({
      name: "documents.update",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: document.createdById,
    });

    const backlinks = await Backlink.findAll({
      where: { reverseDocumentId: document.id },
    });

    expect(backlinks.length).toBe(1);
    expect(backlinks[0].documentId).toBe(yetAnotherDocument.id);
  });
});

describe("documents.delete", () => {
  test("should destroy related backlinks", async () => {
    const otherDocument = await buildDocument();
    const document = await buildDocument();

    document.text = `[this is a link](${otherDocument.url})`;
    await document.save();

    await Backlinks.on({
      name: "documents.update",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: document.createdById,
    });

    await Backlinks.on({
      name: "documents.delete",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: document.createdById,
    });

    const backlinks = await Backlink.findAll({
      where: { reverseDocumentId: document.id },
    });

    expect(backlinks.length).toBe(0);
  });
});

describe("documents.title_change", () => {
  test("should update titles in backlinked documents", async () => {
    const newTitle = "test";
    const document = await buildDocument();
    const otherDocument = await buildDocument();
    const previousTitle = otherDocument.title;

    // create a doc with a link back
    document.text = `[${otherDocument.title}](${otherDocument.url})`;
    await document.save();

    // ensure the backlinks are created
    await Backlinks.on({
      name: "documents.update",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: document.createdById,
    });

    // change the title of the linked doc
    otherDocument.title = newTitle;
    await otherDocument.save();

    // does the text get updated with the new title
    await Backlinks.on({
      name: "documents.title_change",
      documentId: otherDocument.id,
      collectionId: otherDocument.collectionId,
      teamId: otherDocument.teamId,
      actorId: otherDocument.createdById,
      data: {
        previousTitle,
        title: newTitle,
      },
    });
    await document.reload();

    expect(document.text).toBe(`[${newTitle}](${otherDocument.url})`);
  });
});
