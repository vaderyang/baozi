/* eslint-disable no-restricted-imports */
import fetchWithProxy from "fetch-with-proxy";
import nodeFetch, { RequestInit, Response } from "node-fetch";
import { useAgent } from "request-filtering-agent";
import env from "@server/env";
import Logger from "@server/logging/Logger";

/**
 * Wrapper around fetch that uses the request-filtering-agent in cloud hosted
 * environments to filter malicious requests, and the fetch-with-proxy library
 * in self-hosted environments to allow for request from behind a proxy.
 *
 * @param url The url to fetch
 * @param init The fetch init object
 * @returns The response
 */
export default async function fetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  // In self-hosted, webhooks support proxying and are also allowed to connect
  // to internal services, so use fetchWithProxy without the filtering agent.
  const fetchMethod = env.isCloudHosted ? nodeFetch : fetchWithProxy;

  Logger.silly("http", `Network request to ${url}`, init);

  const response = await fetchMethod(url, {
    ...init,
    agent: env.isCloudHosted ? useAgent(url) : undefined,
  });

  if (!response.ok) {
    const clone = response.clone();
    const body = await clone.text();

    Logger.silly("http", `Network request failed`, {
      url,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers.raw(),
      body,
    });
  }

  return response;
}
