/* eslint-disable flowtype/require-valid-file-annotation */
import { Document } from "../models";
import {
  buildDocument,
  buildCollection,
  buildTeam,
  buildUser,
} from "../test/factories";
import { flushdb, seed } from "../test/support";
import slugify from "../utils/slugify";

beforeEach(() => flushdb());
beforeEach(jest.resetAllMocks);

describe("#getSummary", () => {
  test("should strip markdown", async () => {
    const document = await buildDocument({
      version: 1,
      text: `*paragraph*

paragraph 2`,
    });

    expect(document.getSummary()).toBe("paragraph");
  });

  test("should strip title when no version", async () => {
    const document = await buildDocument({
      version: null,
      text: `# Heading
      
*paragraph*`,
    });

    expect(document.getSummary()).toBe("paragraph");
  });
});

describe("#migrateVersion", () => {
  test("should maintain empty paragraph under headings", async () => {
    const document = await buildDocument({
      version: 1,
      text: `# Heading

paragraph`,
    });
    await document.migrateVersion();
    expect(document.text).toBe(`# Heading

paragraph`);
  });

  test("should add breaks under headings with extra paragraphs", async () => {
    const document = await buildDocument({
      version: 1,
      text: `# Heading


paragraph`,
    });
    await document.migrateVersion();
    expect(document.text).toBe(`# Heading


\\
paragraph`);
  });

  test("should add breaks between paragraphs", async () => {
    const document = await buildDocument({
      version: 1,
      text: `paragraph

paragraph`,
    });
    await document.migrateVersion();
    expect(document.text).toBe(`paragraph

\\
paragraph`);
  });

  test("should add breaks for multiple empty paragraphs", async () => {
    const document = await buildDocument({
      version: 1,
      text: `paragraph


paragraph`,
    });
    await document.migrateVersion();
    expect(document.text).toBe(`paragraph

\\
\\
paragraph`);
  });

  test("should add breaks with non-latin characters", async () => {
    const document = await buildDocument({
      version: 1,
      text: `除。

通`,
    });
    await document.migrateVersion();
    expect(document.text).toBe(`除。

\\
通`);
  });

  test("should update task list formatting", async () => {
    const document = await buildDocument({
      version: 1,
      text: `[ ] list item
`,
    });
    await document.migrateVersion();
    expect(document.text).toBe(`- [ ] list item
`);
  });

  test("should update task list with multiple items", async () => {
    const document = await buildDocument({
      version: 1,
      text: `[ ] list item
[ ] list item 2
`,
    });
    await document.migrateVersion();
    expect(document.text).toBe(`- [ ] list item
- [ ] list item 2
`);
  });

  test("should update checked task list formatting", async () => {
    const document = await buildDocument({
      version: 1,
      text: `[x] list item
`,
    });
    await document.migrateVersion();
    expect(document.text).toBe(`- [x] list item
`);
  });

  test("should update nested task list formatting", async () => {
    const document = await buildDocument({
      version: 1,
      text: `[x] list item
  [ ] list item
  [x] list item
`,
    });
    await document.migrateVersion();
    expect(document.text).toBe(`- [x] list item
   - [ ] list item
   - [x] list item
`);
  });
});

describe("#searchForTeam", () => {
  test("should return search results from public collections", async () => {
    const team = await buildTeam();
    const collection = await buildCollection({ teamId: team.id });
    const document = await buildDocument({
      teamId: team.id,
      collectionId: collection.id,
      title: "test",
    });

    const { results } = await Document.searchForTeam(team, "test");
    expect(results.length).toBe(1);
    expect(results[0].document.id).toBe(document.id);
  });

  test("should not return search results from private collections", async () => {
    const team = await buildTeam();
    const collection = await buildCollection({
      permission: null,
      teamId: team.id,
    });
    await buildDocument({
      teamId: team.id,
      collectionId: collection.id,
      title: "test",
    });

    const { results } = await Document.searchForTeam(team, "test");
    expect(results.length).toBe(0);
  });

  test("should handle no collections", async () => {
    const team = await buildTeam();
    const { results } = await Document.searchForTeam(team, "test");
    expect(results.length).toBe(0);
  });

  test("should handle backslashes in search term", async () => {
    const team = await buildTeam();
    const { results } = await Document.searchForTeam(team, "\\\\");
    expect(results.length).toBe(0);
  });

  test("should return the total count of search results", async () => {
    const team = await buildTeam();
    const collection = await buildCollection({ teamId: team.id });
    await buildDocument({
      teamId: team.id,
      collectionId: collection.id,
      title: "test number 1",
    });
    await buildDocument({
      teamId: team.id,
      collectionId: collection.id,
      title: "test number 2",
    });

    const { totalCount } = await Document.searchForTeam(team, "test");
    expect(totalCount).toBe("2");
  });

  test("should return the document when searched with their previous titles", async () => {
    const team = await buildTeam();
    const collection = await buildCollection({ teamId: team.id });
    const document = await buildDocument({
      teamId: team.id,
      collectionId: collection.id,
      title: "test number 1",
    });

    document.title = "change";
    await document.save();

    const { totalCount } = await Document.searchForTeam(team, "test number");
    expect(totalCount).toBe("1");
  });

  test("should not return the document when searched with neither the titles nor the previous titles", async () => {
    const team = await buildTeam();
    const collection = await buildCollection({ teamId: team.id });
    const document = await buildDocument({
      teamId: team.id,
      collectionId: collection.id,
      title: "test number 1",
    });

    document.title = "change";
    await document.save();

    const { totalCount } = await Document.searchForTeam(
      team,
      "title doesn't exist"
    );
    expect(totalCount).toBe("0");
  });
});

describe("#searchForUser", () => {
  test("should return search results from collections", async () => {
    const team = await buildTeam();
    const user = await buildUser({ teamId: team.id });
    const collection = await buildCollection({
      userId: user.id,
      teamId: team.id,
    });
    const document = await buildDocument({
      userId: user.id,
      teamId: team.id,
      collectionId: collection.id,
      title: "test",
    });

    const { results } = await Document.searchForUser(user, "test");
    expect(results.length).toBe(1);
    expect(results[0].document.id).toBe(document.id);
  });

  test("should handle no collections", async () => {
    const team = await buildTeam();
    const user = await buildUser({ teamId: team.id });
    const { results } = await Document.searchForUser(user, "test");
    expect(results.length).toBe(0);
  });

  test("should return the total count of search results", async () => {
    const team = await buildTeam();
    const user = await buildUser({ teamId: team.id });
    const collection = await buildCollection({
      userId: user.id,
      teamId: team.id,
    });
    await buildDocument({
      userId: user.id,
      teamId: team.id,
      collectionId: collection.id,
      title: "test number 1",
    });
    await buildDocument({
      userId: user.id,
      teamId: team.id,
      collectionId: collection.id,
      title: "test number 2",
    });

    const { totalCount } = await Document.searchForUser(user, "test");
    expect(totalCount).toBe("2");
  });

  test("should return the document when searched with their previous titles", async () => {
    const team = await buildTeam();
    const user = await buildUser({ teamId: team.id });
    const collection = await buildCollection({
      teamId: team.id,
      userId: user.id,
    });
    const document = await buildDocument({
      teamId: team.id,
      userId: user.id,
      collectionId: collection.id,
      title: "test number 1",
    });

    document.title = "change";
    await document.save();

    const { totalCount } = await Document.searchForUser(user, "test number");
    expect(totalCount).toBe("1");
  });

  test("should not return the document when searched with neither the titles nor the previous titles", async () => {
    const team = await buildTeam();
    const user = await buildUser({ teamId: team.id });
    const collection = await buildCollection({
      teamId: team.id,
      userId: user.id,
    });
    const document = await buildDocument({
      teamId: team.id,
      userId: user.id,
      collectionId: collection.id,
      title: "test number 1",
    });

    document.title = "change";
    await document.save();

    const { totalCount } = await Document.searchForUser(
      user,
      "title doesn't exist"
    );
    expect(totalCount).toBe("0");
  });
});

describe("#delete", () => {
  test("should soft delete and set last modified", async () => {
    let document = await buildDocument();
    let user = await buildUser();

    await document.delete(user.id);

    document = await Document.findByPk(document.id, { paranoid: false });
    expect(document.lastModifiedById).toBe(user.id);
    expect(document.deletedAt).toBeTruthy();
  });

  test("should soft delete templates", async () => {
    let document = await buildDocument({ template: true });
    let user = await buildUser();

    await document.delete(user.id);

    document = await Document.findByPk(document.id, { paranoid: false });
    expect(document.lastModifiedById).toBe(user.id);
    expect(document.deletedAt).toBeTruthy();
  });
  test("should soft delete archived", async () => {
    let document = await buildDocument({ archivedAt: new Date() });
    let user = await buildUser();

    await document.delete(user.id);

    document = await Document.findByPk(document.id, { paranoid: false });
    expect(document.lastModifiedById).toBe(user.id);
    expect(document.deletedAt).toBeTruthy();
  });
});

describe("#save", () => {
  test("should have empty previousTitles by default", async () => {
    const document = await buildDocument();
    expect(document.previousTitles).toBe(null);
  });

  test("should include previousTitles on save", async () => {
    const document = await buildDocument();

    document.title = "test";
    await document.save();

    expect(document.previousTitles.length).toBe(1);
  });

  test("should not duplicate previousTitles", async () => {
    const document = await buildDocument();

    document.title = "test";
    await document.save();

    document.title = "example";
    await document.save();

    document.title = "test";
    await document.save();

    expect(document.previousTitles.length).toBe(3);
  });
});

describe("#findByPk", () => {
  test("should return document when urlId is correct", async () => {
    const { document } = await seed();
    const id = `${slugify(document.title)}-${document.urlId}`;

    const response = await Document.findByPk(id);

    expect(response.id).toBe(document.id);
  });
});

describe("tasks", () => {
  test("should consider all the possible checkTtems", async () => {
    const document = await buildDocument({
      text: `- [x] test
      - [X] test
      - [ ] test
      - [-] test
      - [_] test`,
    });

    const tasks = document.tasks;

    expect(tasks.completed).toBe(4);
    expect(tasks.total).toBe(5);
  });

  test("should return tasks keys set to 0 if checkItems isn't present", async () => {
    const document = await buildDocument({
      text: `text`,
    });

    const tasks = document.tasks;

    expect(tasks.completed).toBe(0);
    expect(tasks.total).toBe(0);
  });

  test("should return tasks keys set to 0 if the text contains broken checkItems", async () => {
    const document = await buildDocument({
      text: `- [x ] test
      - [ x ] test
      - [  ] test`,
    });

    const tasks = document.tasks;

    expect(tasks.completed).toBe(0);
    expect(tasks.total).toBe(0);
  });

  test("should return tasks", async () => {
    const document = await buildDocument({
      text: `- [x] list item
      - [ ] list item`,
    });

    const tasks = document.tasks;

    expect(tasks.completed).toBe(1);
    expect(tasks.total).toBe(2);
  });

  test("should update tasks on save", async () => {
    const document = await buildDocument({
      text: `- [x] list item
      - [ ] list item`,
    });

    const tasks = document.tasks;

    expect(tasks.completed).toBe(1);
    expect(tasks.total).toBe(2);

    document.text = `- [x] list item
    - [ ] list item
    - [ ] list item`;

    await document.save();

    const newTasks = document.tasks;

    expect(newTasks.completed).toBe(1);
    expect(newTasks.total).toBe(3);
  });
});
