import {
  Column,
  DataType,
  BelongsTo,
  ForeignKey,
  Table,
} from "sequelize-typescript";
import Document from "./Document";
import User from "./User";
import BaseModel from "./base/BaseModel";
import Fix from "./decorators/Fix";

@Table({ tableName: "stars", modelName: "star" })
@Fix
class Star extends BaseModel {
  @BelongsTo(() => User, "userId")
  user: User;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  userId: string;

  @BelongsTo(() => Document, "documentId")
  document: Document;

  @ForeignKey(() => Document)
  @Column(DataType.UUID)
  documentId: string;
}

export default Star;
