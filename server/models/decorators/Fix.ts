/**
 * A decorator that must be applied to every model definition to workaround
 * babel <> typescript incompatibility. See the following issue:
 * https://github.com/RobinBuschmann/sequelize-typescript/issues/612#issuecomment-491890977
 *
 * @param target model class
 */

type SequelizeLikeInstance = {
  getDataValue?(key: string): unknown;
  setDataValue?(key: string, value: unknown): void;
  dataValues?: Record<string, unknown>;
};

export default function Fix<T extends new (...args: unknown[]) => SequelizeLikeInstance>(
  target: T
): T {
  return class extends target {
    constructor(...args: ConstructorParameters<T>) {
      // suppresses warning from here which is not applicable in our typescript
      // environment: https://github.com/sequelize/sequelize/blob/00ced18c2cb2a8b99ae0ebf5669c124abb4c673d/src/model.js#L99
      (target as typeof target & { _overwrittenAttributesChecked?: boolean })._overwrittenAttributesChecked =
        true;

      super(...args);

      const rawAttributes = Object.keys(new.target.rawAttributes);
      const associations = Object.keys(new.target.associations);

      rawAttributes.forEach((propertyKey) => {
        // check if we already defined getter/setter – if so, do not override
        const desc = Object.getOwnPropertyDescriptor(
          target.prototype,
          propertyKey
        );
        if (desc) {
          return;
        }

        Object.defineProperty(this, propertyKey, {
          get(this: SequelizeLikeInstance) {
            // Safety check for Jest serialization - getDataValue may not be available
            // during serialization for inter-process communication
            if (typeof this.getDataValue === "function") {
              return this.getDataValue(propertyKey);
            }
            // Fallback to direct dataValues access
            return this.dataValues?.[propertyKey];
          },
          set(this: SequelizeLikeInstance, value: unknown) {
            // Safety check for Jest serialization - setDataValue may not be available
            // during serialization for inter-process communication
            if (typeof this.setDataValue === "function") {
              this.setDataValue(propertyKey, value);
            } else if (this.dataValues) {
              // Fallback to direct dataValues assignment
              this.dataValues[propertyKey] = value;
            }
          },
        });
      });

      associations.forEach((propertyKey) => {
        Object.defineProperty(this, propertyKey, {
          get(this: SequelizeLikeInstance) {
            return this.dataValues?.[propertyKey];
          },
          set(this: SequelizeLikeInstance, value: unknown) {
            // sets without changing the "changed" flag for associations
            if (this.dataValues) {
              this.dataValues[propertyKey] = value;
            }
          },
        });
      });
    }
  } as T;
}
