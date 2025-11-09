import env from "@server/env";
import Logger from "@server/logging/Logger";
import { setResource, addTags } from "@server/logging/tracer";
import { traceFunction } from "@server/logging/tracing";
import HealthMonitor from "@server/queues/HealthMonitor";
import { Event } from "@server/types";
import { initI18n } from "@server/utils/i18n";
import {
  globalEventQueue,
  processorEventQueue,
  websocketQueue,
  taskQueue,
} from "../queues";
import processors from "../queues/processors";
import tasks from "../queues/tasks";
import { TranscriptionJob } from "@server/models";
import { TranscriptionJobStatus } from "@server/models/TranscriptionJob";
import TranscriptionTask from "@server/queues/tasks/TranscriptionTask";

const LOG_PREVIEW_BYTES = 100;

const truncateToBytes = (value: string, maxBytes: number): string => {
  const buffer = Buffer.from(value);
  if (buffer.byteLength <= maxBytes) {
    return value;
  }
  return buffer.subarray(0, maxBytes).toString();
};

const sanitizeEventForLogging = (event: Event): Event => {
  if (event.name !== "transcription:status" || !event.data) {
    return event;
  }

  if (typeof event.data !== "object") {
    return event;
  }

  const data = event.data as Record<string, unknown>;
  const result = data.result as
    | {
        text?: string;
        speakerSegments?: unknown[];
      }
    | undefined;

  const sanitizedResult =
    result && typeof result === "object"
      ? {
          textPreview:
            typeof result.text === "string"
              ? truncateToBytes(result.text, LOG_PREVIEW_BYTES)
              : undefined,
          textLength:
            typeof result.text === "string" ? result.text.length : undefined,
          speakerSegmentCount: Array.isArray(result.speakerSegments)
            ? result.speakerSegments.length
            : undefined,
        }
      : undefined;

  return {
    ...event,
    data: {
      ...data,
      ...(sanitizedResult ? { result: sanitizedResult } : {}),
    },
  };
};

/**
 * Resume incomplete transcription jobs that were interrupted by server restart.
 * Finds jobs in 'processing' state, updates them to 'queued', and re-schedules them.
 */
async function resumeIncompleteTranscriptionJobs() {
  try {
    // Find all jobs that were in processing state
    const processingJobs = await TranscriptionJob.findAll({
      where: {
        status: TranscriptionJobStatus.Processing,
      },
    });

    if (processingJobs.length === 0) {
      Logger.info("worker", "No incomplete transcription jobs to resume");
      return;
    }

    Logger.info(
      "worker",
      `Found ${processingJobs.length} incomplete transcription job(s) to resume`
    );

    // Re-schedule each job
    for (const job of processingJobs) {
      try {
        // Update status from 'processing' to 'queued'
        await job.updateStatus(TranscriptionJobStatus.Queued);

        // Re-schedule the task
        const task = new TranscriptionTask();
        await task.schedule({
          jobId: job.id,
          attachmentId: job.attachmentId,
          userId: job.userId,
          documentId: job.documentId,
        });

        Logger.info("worker", "Resumed transcription job", {
          jobId: job.id,
          documentId: job.documentId,
        });
      } catch (error) {
        Logger.error("Failed to resume transcription job", error as Error, {
          jobId: job.id,
          documentId: job.documentId,
        });
      }
    }
  } catch (error) {
    Logger.error(
      "Error resuming incomplete transcription jobs",
      error as Error
    );
  }
}

export default async function init() {
  await initI18n();

  // Resume incomplete transcription jobs on worker startup
  await resumeIncompleteTranscriptionJobs();

  // This queue processes the global event bus
  globalEventQueue
    .process(
      env.WORKER_CONCURRENCY_EVENTS,
      traceFunction({
        serviceName: "worker",
        spanName: "process",
        isRoot: true,
      })(async function (job) {
        const event = job.data as Event;
        let err;

        setResource(`Event.${event.name}`);

        const logEvent = sanitizeEventForLogging(event);

        Logger.info("worker", `Processing ${event.name}`, {
          event: logEvent,
          attempt: job.attemptsMade,
        });

        // For each registered processor we check to see if it wants to handle the
        // event (applicableEvents), and if so add a new queued job specifically
        // for that processor.
        for (const name in processors) {
          const ProcessorClass = processors[name];

          if (!ProcessorClass) {
            throw new Error(
              `Received event "${event.name}" for processor (${name}) that isn't registered. Check the file name matches the class name.`
            );
          }

          try {
            if (name === "WebsocketsProcessor") {
              // websockets are a special case on their own queue because they must
              // only be consumed by the websockets service rather than workers.
              await websocketQueue.add(job.data);
            } else if (
              ProcessorClass.applicableEvents.includes(event.name) ||
              ProcessorClass.applicableEvents.includes("*")
            ) {
              await processorEventQueue.add({ event, name });
            }
          } catch (error) {
            Logger.error(
              `Error adding ${event.name} to ${name} queue`,
              error,
              logEvent
            );
            err = error;
          }
        }

        if (err) {
          throw err;
        }
      })
    )
    .catch((err) => {
      Logger.fatal("Error starting globalEventQueue", err);
    });

  // Jobs for individual processors are processed here. Only applicable events
  // as unapplicable events were filtered in the global event queue above.
  processorEventQueue
    .process(
      env.WORKER_CONCURRENCY_EVENTS,
      traceFunction({
        serviceName: "worker",
        spanName: "process",
        isRoot: true,
      })(async function (job) {
        const { event, name } = job.data;
        const ProcessorClass = processors[name];

        setResource(`Processor.${name}`);
        addTags({ event });

        if (!ProcessorClass) {
          throw new Error(
            `Received event "${event.name}" for processor (${name}) that isn't registered. Check the file name matches the class name.`
          );
        }

        // @ts-expect-error We will not instantiate an abstract class
        const processor = new ProcessorClass();

        const logEvent = sanitizeEventForLogging(event);

        if (processor.perform) {
          Logger.info("worker", `${name} running ${event.name}`, {
            event: logEvent,
          });

          try {
            await processor.perform(event);
          } catch (err) {
            // last attempt has failed.
            if (job.attemptsMade + 1 >= (job.opts.attempts || 1)) {
              await processor.onFailed(event).catch(); // suppress exception from 'onFailed'.
            }

            Logger.error(
              `Error processing ${event.name} in ${name}`,
              err,
              logEvent
            );
            throw err;
          }
        }
      })
    )
    .catch((err) => {
      Logger.fatal("Error starting processorEventQueue", err);
    });

  // Jobs for async tasks are processed here.
  taskQueue
    .process(
      env.WORKER_CONCURRENCY_TASKS,
      traceFunction({
        serviceName: "worker",
        spanName: "process",
        isRoot: true,
      })(async function (job) {
        const { name, props } = job.data;
        const TaskClass = tasks[name];

        setResource(`Task.${name}`);
        addTags({ props });

        if (!TaskClass) {
          throw new Error(
            `Task "${name}" is not registered. Check the file name matches the class name.`
          );
        }

        Logger.info("worker", `${name} running`, props);

        // @ts-expect-error We will not instantiate an abstract class
        const task = new TaskClass();

        try {
          return await task.perform(props);
        } catch (err) {
          // last attempt has failed.
          if (job.attemptsMade + 1 >= (job.opts.attempts || 1)) {
            await task.onFailed(props).catch(); // suppress exception from 'onFailed'.
          }

          Logger.error(`Error processing task in ${name}`, err, props);
          throw err;
        }
      })
    )
    .catch((err) => {
      Logger.fatal("Error starting taskQueue", err);
    });

  HealthMonitor.start(globalEventQueue);
  HealthMonitor.start(processorEventQueue);
  HealthMonitor.start(taskQueue);
}
