import { Readable } from "stream";
import { PresignedPost } from "aws-sdk/clients/s3";
import env from "@server/env";
import Logger from "@server/logging/Logger";
import fetch from "@server/utils/fetch";

export default abstract class BaseStorage {
  /**
   * Returns a presigned post for uploading files to the storage provider.
   *
   * @param key The path to store the file at
   * @param acl The ACL to use
   * @param maxUploadSize The maximum upload size in bytes
   * @param contentType The content type of the file
   * @returns The presigned post object to use on the client (TODO: Abstract away from S3)
   */
  public abstract getPresignedPost(
    key: string,
    acl: string,
    maxUploadSize: number,
    contentType: string
  ): Promise<PresignedPost>;

  /**
   * Returns a stream for reading a file from the storage provider.
   *
   * @param key The path to the file
   */
  public abstract getFileStream(key: string): NodeJS.ReadableStream | null;

  /**
   * Returns a buffer of a file from the storage provider.
   *
   * @param key The path to the file
   */
  public abstract getFileBuffer(key: string): Promise<Blob>;

  /**
   * Returns the public endpoint for the storage provider.
   *
   * @param isServerUpload Whether the upload is happening on the server or not
   * @returns The public endpoint as a string
   */
  public abstract getPublicEndpoint(isServerUpload?: boolean): string;

  /**
   * Returns a signed URL for a file from the storage provider.
   *
   * @param key The path to the file
   * @param expiresIn An optional number of seconds until the URL expires
   */
  public abstract getSignedUrl(
    key: string,
    expiresIn?: number
  ): Promise<string>;

  /**
   * Upload a file to the storage provider.
   *
   * @param body The file body
   * @param contentLength The content length of the file
   * @param contentType The content type of the file
   * @param key The path to store the file at
   * @param acl The ACL to use
   * @returns The URL of the file
   */
  public abstract upload({
    body,
    contentLength,
    contentType,
    key,
    acl,
  }: {
    body: Buffer | Uint8Array | Blob | string | Readable;
    contentLength: number;
    contentType: string;
    key: string;
    acl: string;
  }): Promise<string | undefined>;

  /**
   * Upload a file to the storage provider directly from a remote or base64 encoded URL.
   *
   * @param url The URL to upload from
   * @param key The path to store the file at
   * @param acl The ACL to use
   * @returns A promise that resolves when the file is uploaded
   */
  public async uploadFromUrl(
    url: string,
    key: string,
    acl: string
  ): Promise<
    | {
        url: string;
        contentType: string;
        contentLength: number;
      }
    | undefined
  > {
    const endpoint = this.getPublicEndpoint(true);
    if (url.startsWith("/api") || url.startsWith(endpoint)) {
      return;
    }

    let buffer, contentLength, contentType;
    const match = url.match(/data:(.*);base64,(.*)/);

    if (match) {
      contentType = match[1];
      buffer = Buffer.from(match[2], "base64");
      contentLength = buffer.byteLength;
    } else {
      try {
        const res = await fetch(url, {
          follow: 3,
          redirect: "follow",
          size: env.AWS_S3_UPLOAD_MAX_SIZE,
          timeout: 10000,
        });

        if (!res.ok) {
          throw new Error(`Error fetching URL to upload: ${res.status}`);
        }

        buffer = await res.buffer();

        contentType =
          res.headers.get("content-type") ?? "application/octet-stream";
        contentLength = parseInt(res.headers.get("content-length") ?? "0", 10);
      } catch (err) {
        Logger.error("Error fetching URL to upload", err, {
          url,
          key,
          acl,
        });
        return;
      }
    }

    if (contentLength === 0) {
      return;
    }

    try {
      const result = await this.upload({
        body: buffer,
        contentLength,
        contentType,
        key,
        acl,
      });

      return result
        ? {
            url: result,
            contentType,
            contentLength,
          }
        : undefined;
    } catch (err) {
      Logger.error("Error uploading to file storage from URL", err, {
        url,
        key,
        acl,
      });
      return;
    }
  }

  /**
   * Delete a file from the storage provider.
   *
   * @param key The path to the file
   * @returns A promise that resolves when the file is deleted
   */
  public abstract deleteFile(key: string): Promise<void>;
}
