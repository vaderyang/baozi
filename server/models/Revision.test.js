/* eslint-disable flowtype/require-valid-file-annotation */
import { Revision } from "../models";
import { buildDocument } from "../test/factories";
import { flushdb } from "../test/support";

beforeEach(() => flushdb());
beforeEach(jest.resetAllMocks);

describe("#findLatest", () => {
  test("should return latest revision", async () => {
    const document = await buildDocument({
      title: "Title",
      text: "Content",
    });

    document.title = "Changed 1";
    await document.save();

    document.title = "Changed 2";
    await document.save();

    const revision = await Revision.findLatest(document.id);

    expect(revision.title).toBe("Changed 2");
    expect(revision.text).toBe("Content");
  });
});
