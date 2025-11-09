import { InferAttributes, InferCreationAttributes } from "sequelize";
import {
  Column,
  DataType,
  BelongsTo,
  ForeignKey,
  Table,
  IsIn,
  AllowNull,
  Length,
} from "sequelize-typescript";
import Team from "./Team";
import User from "./User";
import IdModel from "./base/IdModel";
import Fix from "./decorators/Fix";

export type ServiceType = "llm" | "transcription";

@Table({ tableName: "failed_requests", modelName: "failed_request" })
@Fix
class FailedRequest extends IdModel<
  InferAttributes<FailedRequest>,
  Partial<InferCreationAttributes<FailedRequest>>
> {
  @Column(DataType.DATE)
  timestamp: Date;

  @IsIn([["llm", "transcription"]])
  @Column(DataType.STRING)
  serviceType: ServiceType;

  @AllowNull
  @Length({ max: 255, msg: "modelName must be 255 characters or less" })
  @Column(DataType.STRING)
  modelName: string | null;

  @Length({ max: 255, msg: "username must be 255 characters or less" })
  @Column(DataType.STRING)
  username: string;

  @Column(DataType.TEXT)
  errorMessage: string;

  @AllowNull
  @Length({ max: 100, msg: "errorCode must be 100 characters or less" })
  @Column(DataType.STRING)
  errorCode: string | null;

  @AllowNull
  @Column(DataType.JSONB)
  requestParameters: Record<string, any> | null;

  // associations

  @BelongsTo(() => User, "userId")
  user: User;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  userId: string;

  @BelongsTo(() => Team, "teamId")
  team: Team;

  @ForeignKey(() => Team)
  @Column(DataType.UUID)
  teamId: string;
}

export default FailedRequest;
