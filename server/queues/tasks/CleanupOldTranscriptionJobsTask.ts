import env from "@server/env";
import Logger from "@server/logging/Logger";
import { TranscriptionJob } from "@server/models";
import BaseTask, { TaskPriority, TaskSchedule } from "./BaseTask";

type Props = Record<string, never>;

/**
 * A task that deletes old completed, failed, and cancelled transcription jobs.
 * Runs daily to clean up jobs older than TRANSCRIPTION_CLEANUP_DAYS.
 */
export default class CleanupOldTranscriptionJobsTask extends BaseTask<Props> {
    static cron = TaskSchedule.Day;

    public async perform() {
        const retentionDays = env.TRANSCRIPTION_CLEANUP_DAYS;

        Logger.info("task", "Starting cleanup of old transcription jobs", {
            retentionDays,
        });

        try {
            const deletedCount = await TranscriptionJob.deleteOlderThan(retentionDays);

            if (deletedCount > 0) {
                Logger.info("task", "Deleted old transcription jobs", {
                    deletedCount,
                    retentionDays,
                });
            }
        } catch (error) {
            Logger.error(
                "Failed to cleanup old transcription jobs",
                error as Error,
                {
                    retentionDays,
                }
            );
            throw error;
        }
    }

    public get options() {
        return {
            attempts: 1,
            priority: TaskPriority.Background,
        };
    }
}
