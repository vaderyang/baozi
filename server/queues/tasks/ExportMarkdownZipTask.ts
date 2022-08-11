import fs from "fs";
import { truncate } from "lodash";
import ExportFailureEmail from "@server/emails/templates/ExportFailureEmail";
import ExportSuccessEmail from "@server/emails/templates/ExportSuccessEmail";
import Logger from "@server/logging/Logger";
import { Collection, Event, FileOperation, Team, User } from "@server/models";
import { FileOperationState } from "@server/models/FileOperation";
import fileOperationPresenter from "@server/presenters/fileOperation";
import { uploadToS3FromBuffer } from "@server/utils/s3";
import { archiveCollections } from "@server/utils/zip";
import BaseTask, { TaskPriority } from "./BaseTask";

type Props = {
  fileOperationId: string;
};

export default class ExportMarkdownZipTask extends BaseTask<Props> {
  /**
   * Runs the export task.
   *
   * @param props The props
   */
  public async perform({ fileOperationId }: Props) {
    const fileOperation = await FileOperation.findByPk(fileOperationId, {
      rejectOnEmpty: true,
    });

    const [team, user] = await Promise.all([
      Team.findByPk(fileOperation.teamId, { rejectOnEmpty: true }),
      User.findByPk(fileOperation.userId, { rejectOnEmpty: true }),
    ]);

    const collectionIds = fileOperation.collectionId
      ? [fileOperation.collectionId]
      : await user.collectionIds();

    const collections = await Collection.findAll({
      where: {
        id: collectionIds,
      },
    });

    try {
      Logger.info("task", `ExportTask processing data for ${fileOperationId}`);

      await this.updateFileOperation(fileOperation, {
        state: FileOperationState.Creating,
      });

      const filePath = await archiveCollections(collections);

      Logger.info("task", `ExportTask uploading data for ${fileOperationId}`);

      await this.updateFileOperation(fileOperation, {
        state: FileOperationState.Uploading,
      });

      const fileBuffer = await fs.promises.readFile(filePath);
      const stat = await fs.promises.stat(filePath);
      const url = await uploadToS3FromBuffer(
        fileBuffer,
        "application/zip",
        fileOperation.key,
        "private"
      );

      await this.updateFileOperation(fileOperation, {
        size: stat.size,
        state: FileOperationState.Complete,
        url,
      });

      await ExportSuccessEmail.schedule({
        to: user.email,
        userId: user.id,
        id: fileOperation.id,
        teamUrl: team.url,
        teamId: team.id,
      });
    } catch (error) {
      await this.updateFileOperation(fileOperation, {
        state: FileOperationState.Error,
        error,
      });
      await ExportFailureEmail.schedule({
        to: user.email,
        userId: user.id,
        teamUrl: team.url,
        teamId: team.id,
      });
      throw error;
    }
  }

  /**
   * Update the state of the underlying FileOperation in the database and send
   * an event to the client.
   *
   * @param fileOperation The FileOperation to update
   */
  private async updateFileOperation(
    fileOperation: FileOperation,
    options: Partial<FileOperation> & { error?: Error }
  ) {
    await fileOperation.update({
      ...options,
      error: options.error
        ? truncate(options.error.message, { length: 255 })
        : undefined,
    });

    await Event.schedule({
      name: "fileOperations.update",
      modelId: fileOperation.id,
      teamId: fileOperation.teamId,
      actorId: fileOperation.userId,
      data: fileOperationPresenter(fileOperation),
    });
  }

  /**
   * Job options such as priority and retry strategy, as defined by Bull.
   */
  public get options() {
    return {
      priority: TaskPriority.Background,
      attempts: 1,
    };
  }
}
