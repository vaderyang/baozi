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
import Attachment from "./Attachment";
import Document from "./Document";
import Team from "./Team";
import User from "./User";
import IdModel from "./base/IdModel";
import Fix from "./decorators/Fix";

export enum TranscriptionJobStatus {
  Queued = "queued",
  Processing = "processing",
  Completed = "completed",
  Failed = "failed",
  Cancelled = "cancelled",
}

export enum TranscriptionSourceType {
  Recording = "recording",
  Upload = "upload",
  Url = "url",
}

export type TranscriptionResult = {
  text: string;
  speakerSegments?: Array<{
    spk: number;
    text: string;
    start?: number;
    end?: number;
    timestamp?: number[][];
  }>;
};

export type TranscriptionMetadata = {
  duration?: number;
  language?: string;
  markers?: Array<{ timestamp: number; label?: string }>;
  originalFilename?: string;
  sourceUrl?: string;
  autoSummary?: boolean;
};

@Table({ tableName: "transcription_jobs", modelName: "transcription_job" })
@Fix
class TranscriptionJob extends IdModel<
  InferAttributes<TranscriptionJob>,
  Partial<InferCreationAttributes<TranscriptionJob>>
> {
  @IsIn([Object.values(TranscriptionJobStatus)])
  @Column(DataType.STRING(20))
  status: TranscriptionJobStatus;

  @IsIn([Object.values(TranscriptionSourceType)])
  @Column(DataType.STRING(20))
  sourceType: TranscriptionSourceType;

  @IsInt
  @Min(0)
  @Max(100)
  @Column(DataType.INTEGER)
  progress: number | null;

  @Column(DataType.TEXT)
  error: string | null;

  @Column(DataType.JSONB)
  result: TranscriptionResult | null;

  @Column(DataType.JSONB)
  metadata: TranscriptionMetadata | null;

  @Column(DataType.TEXT)
  lastProgressMessage: string | null;

  @Column(DataType.DATE)
  startedAt: Date | null;

  @Column(DataType.DATE)
  completedAt: Date | null;

  @Column(DataType.DATE)
  failedAt: Date | null;

  // methods

  /**
   * Update the status of the transcription job and emit a websocket event.
   *
   * @param status - The new status
   * @param progress - Optional progress percentage (0-100)
   * @param message - Optional progress message
   * @param error - Optional error message
   * @returns The updated job
   */
  async updateStatus(
    status: TranscriptionJobStatus,
    progress?: number,
    message?: string,
    error?: string
  ): Promise<TranscriptionJob> {
    this.status = status;

    if (progress !== undefined) {
      this.progress = progress;
    }

    if (message !== undefined) {
      this.lastProgressMessage = message;
    }

    if (error !== undefined) {
      this.error = error;
    }

    // Update timestamp fields based on status
    if (status === TranscriptionJobStatus.Processing && !this.startedAt) {
      this.startedAt = new Date();
    } else if (
      status === TranscriptionJobStatus.Completed &&
      !this.completedAt
    ) {
      this.completedAt = new Date();
    } else if (status === TranscriptionJobStatus.Failed && !this.failedAt) {
      this.failedAt = new Date();
    }

    await this.save();
    await this.emitWebsocketEvent();
    return this;
  }

  /**
   * Mark the job as completed with the transcription result.
   *
   * @param result - The transcription result
   * @returns The updated job
   */
  async complete(result: TranscriptionResult): Promise<TranscriptionJob> {
    this.status = TranscriptionJobStatus.Completed;
    this.progress = 100;
    this.result = result;
    this.error = null;
    this.completedAt = new Date();
    this.lastProgressMessage = "Transcription completed";
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
  async fail(error: string): Promise<TranscriptionJob> {
    this.status = TranscriptionJobStatus.Failed;
    this.error = error;
    this.failedAt = new Date();
    this.lastProgressMessage = "Transcription failed";
    await this.save();
    await this.emitWebsocketEvent();
    return this;
  }

  /**
   * Emit a websocket event for this job's status change.
   */
  private async emitWebsocketEvent(): Promise<void> {
    const event: Partial<Event> = {
      name: "transcription:status",
      teamId: this.teamId,
      userId: this.userId,
      documentId: this.documentId,
      modelId: this.id,
      data: {
        jobId: this.id,
        documentId: this.documentId,
        status: this.status,
        progress: this.progress,
        message: this.lastProgressMessage,
        error: this.error,
        result: this.result,
        startedAt: this.startedAt,
        completedAt: this.completedAt,
        failedAt: this.failedAt,
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

  @BelongsTo(() => Attachment, "attachmentId")
  attachment: Attachment;

  @ForeignKey(() => Attachment)
  @Column(DataType.UUID)
  attachmentId: string;

  /**
   * Find jobs by document ID.
   *
   * @param documentId - The document ID
   * @param where - Additional where conditions
   * @returns Array of transcription jobs
   */
  static async findByDocumentId(
    documentId: string,
    where: WhereOptions<TranscriptionJob> = {}
  ): Promise<TranscriptionJob[]> {
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
   * @returns Array of pending transcription jobs
   */
  static async findPending(
    where: WhereOptions<TranscriptionJob> = {}
  ): Promise<TranscriptionJob[]> {
    return this.findAll({
      where: {
        status: {
          [Op.in]: [
            TranscriptionJobStatus.Queued,
            TranscriptionJobStatus.Processing,
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
            TranscriptionJobStatus.Completed,
            TranscriptionJobStatus.Failed,
            TranscriptionJobStatus.Cancelled,
          ],
        },
      },
    });

    return result;
  }
}

export default TranscriptionJob;
