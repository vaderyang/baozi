import {
  InferAttributes,
  InferCreationAttributes,
  Op,
  WhereOptions,
} from "sequelize";
import {
  ForeignKey,
  BelongsTo,
  Column,
  Table,
  DataType,
  IsIn,
  IsInt,
  Min,
  Max,
} from "sequelize-typescript";
import { Event } from "@server/types";
import Document from "./Document";
import Team from "./Team";
import User from "./User";
import IdModel from "./base/IdModel";
import Fix from "./decorators/Fix";

export enum AISummaryJobStatus {
  Queued = "queued",
  Processing = "processing",
  Completed = "completed",
  Failed = "failed",
  Cancelled = "cancelled",
}

export type AISummaryJobMetadata = {
  language?: string;
  meetingType?: string;
  insertPosition?: string;
  customPrompt?: string;
};

@Table({ tableName: "ai_summary_jobs", modelName: "ai_summary_job" })
@Fix
class AISummaryJob extends IdModel<
  InferAttributes<AISummaryJob>,
  Partial<InferCreationAttributes<AISummaryJob>>
> {
  @IsIn([Object.values(AISummaryJobStatus)])
  @Column(DataType.STRING(20))
  status: AISummaryJobStatus;

  @IsInt
  @Min(0)
  @Max(100)
  @Column(DataType.INTEGER)
  progress: number | null;

  @Column(DataType.TEXT)
  error: string | null;

  @Column(DataType.TEXT)
  result: string | null;

  @Column(DataType.TEXT)
  prompt: string;

  @Column(DataType.TEXT)
  context: string;

  @Column(DataType.JSONB)
  metadata: AISummaryJobMetadata | null;

  // methods

  /**
   * Update the status of the AI summary job and emit a websocket event.
   *
   * @param status - The new status
   * @param progress - Optional progress percentage (0-100)
   * @param error - Optional error message
   * @returns The updated job
   */
  async updateStatus(
    status: AISummaryJobStatus,
    progress?: number,
    error?: string
  ): Promise<AISummaryJob> {
    this.status = status;
    if (progress !== undefined) {
      this.progress = progress;
    }
    if (error !== undefined) {
      this.error = error;
    }
    await this.save();
    await this.emitWebsocketEvent();
    return this;
  }

  /**
   * Mark the job as completed with the summary result.
   *
   * @param result - The generated summary text
   * @returns The updated job
   */
  async complete(result: string): Promise<AISummaryJob> {
    this.status = AISummaryJobStatus.Completed;
    this.progress = 100;
    this.result = result;
    this.error = null;
    await this.save();
    await this.emitWebsocketEvent();
    return this;
  }

  /**
   * Mark the job as failed with an error message.
   *
   * @param error - The error message
   * @returns The updated job
   */
  async fail(error: string): Promise<AISummaryJob> {
    this.status = AISummaryJobStatus.Failed;
    this.error = error;
    await this.save();
    await this.emitWebsocketEvent();
    return this;
  }

  /**
   * Emit a websocket event for this job's status change.
   */
  private async emitWebsocketEvent(): Promise<void> {
    const event: Partial<Event> = {
      name: "ai-summary:status",
      teamId: this.teamId,
      userId: this.userId,
      documentId: this.documentId,
      modelId: this.id,
      data: {
        jobId: this.id,
        documentId: this.documentId,
        status: this.status,
        progress: this.progress,
        error: this.error,
        result: this.result,
        metadata: this.metadata,
      },
    };

    // Schedule the event without persisting to database
    const models = this.sequelize!.models;
    // @ts-expect-error Event.schedule exists
    await models.event.schedule(event);
  }

  // associations

  @BelongsTo(() => Team, "teamId")
  team: Team;

  @ForeignKey(() => Team)
  @Column(DataType.UUID)
  teamId: string;

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

  /**
   * Find jobs by document ID.
   *
   * @param documentId - The document ID
   * @param where - Additional where conditions
   * @returns Array of AI summary jobs
   */
  static async findByDocumentId(
    documentId: string,
    where: WhereOptions<AISummaryJob> = {}
  ): Promise<AISummaryJob[]> {
    return this.findAll({
      where: {
        documentId,
        ...where,
      },
      order: [["createdAt", "DESC"]],
    });
  }

  /**
   * Find pending jobs (queued or processing).
   *
   * @param where - Additional where conditions
   * @returns Array of pending AI summary jobs
   */
  static async findPending(
    where: WhereOptions<AISummaryJob> = {}
  ): Promise<AISummaryJob[]> {
    return this.findAll({
      where: {
        status: {
          [Op.in]: [
            AISummaryJobStatus.Queued,
            AISummaryJobStatus.Processing,
          ],
        },
        ...where,
      },
      order: [["createdAt", "ASC"]],
    });
  }

  /**
   * Delete jobs older than the specified number of days.
   *
   * @param days - Number of days
   * @returns Number of deleted jobs
   */
  static async deleteOlderThan(days: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await this.destroy({
      where: {
        createdAt: {
          [Op.lt]: cutoffDate,
        },
        status: {
          [Op.in]: [
            AISummaryJobStatus.Completed,
            AISummaryJobStatus.Failed,
            AISummaryJobStatus.Cancelled,
          ],
        },
      },
    });

    return result;
  }
}

export default AISummaryJob;
