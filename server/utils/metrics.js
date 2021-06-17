// @flow
import metrics from "datadog-metrics";

if (process.env.DD_API_KEY) {
  metrics.init({
    apiKey: process.env.DD_API_KEY,
    prefix: "outline.",
    defaultTags: [`env:${process.env.DD_ENV || process.env.NODE_ENV}`],
  });
}

export function gauge(key: string, value: number, tags?: string[]): void {
  if (!process.env.DD_API_KEY) {
    return;
  }

  return metrics.gauge(key, value, tags);
}

export function gaugePerInstance(
  key: string,
  value: number,
  tags?: string[] = []
): void {
  if (!process.env.DD_API_KEY) {
    return;
  }

  const instanceId = process.env.INSTANCE_ID || process.env.HEROKU_DYNO_ID;
  if (!instanceId) {
    throw new Error(
      "INSTANCE_ID or HEROKU_DYNO_ID must be set when using Datadog"
    );
  }

  return metrics.gauge(key, value, [...tags, `instance:${instanceId}`]);
}

export function increment(key: string, tags?: { [string]: string }): void {
  if (!process.env.DD_API_KEY) {
    return;
  }

  return metrics.increment(key, tags);
}
