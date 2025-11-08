import size from "lodash/size";
import { Node } from "prosemirror-model";
import { addAttributeOptions } from "sequelize-typescript";
import { ProsemirrorData } from "@shared/types";
import { ProsemirrorHelper } from "@shared/utils/ProsemirrorHelper";
import { schema } from "@server/editor";

/**
 * A decorator that validates the size of the text within a prosemirror data
 * object, taking into account unicode characters of variable lengths.
 */
export default function TextLength({
  msg,
  min = 0,
  max,
}: {
  msg?: string;
  min?: number;
  max: number;
}): (target: Record<string, unknown>, propertyName: string) => void {
  return (target: Record<string, unknown>, propertyName: string) =>
    addAttributeOptions(target as object, propertyName, {
      validate: {
        validLength(value: ProsemirrorData) {
          let text;

          try {
            text = ProsemirrorHelper.toPlainText(Node.fromJSON(schema, value));
          } catch (_err) {
            throw new Error("Invalid data");
          }

          if (size(text) > max || size(text) < min) {
            throw new Error(msg);
          }
        },
      },
    });
}
