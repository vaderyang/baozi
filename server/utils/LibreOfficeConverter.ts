import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";
import { createWriteStream } from "fs";
import Logger from "@server/logging/Logger";
import { pipeline } from "stream/promises";
import env from "@server/env";

const execAsync = promisify(exec);

export type SupportedPreviewFormat =
  | "docx"
  | "doc"
  | "pptx"
  | "ppt"
  | "xlsx"
  | "xls"
  | "pdf";

export default class LibreOfficeConverter {
  /**
   * Get the LibreOffice command based on the platform
   */
  private static getLibreOfficeCommand(): string {
    // On macOS, LibreOffice is installed as soffice
    if (process.platform === "darwin") {
      return "/Applications/LibreOffice.app/Contents/MacOS/soffice";
    }
    // On Linux and other platforms, try libreoffice first
    return "libreoffice";
  }

  /**
   * Check if LibreOffice is installed and available
   */
  static async isAvailable(): Promise<boolean> {
    try {
      const command = this.getLibreOfficeCommand();
      const { stdout } = await execAsync(`"${command}" --version`);
      return stdout.includes("LibreOffice");
    } catch (error) {
      // Try fallback command
      try {
        const { stdout } = await execAsync("soffice --version");
        return stdout.includes("LibreOffice");
      } catch (_fallbackError) {
        Logger.warn("LibreOffice is not available", error);
        return false;
      }
    }
  }

  /**
   * Check if a file type is supported for preview
   */
  static isSupportedFormat(filename: string, contentType?: string): boolean {
    const supportedExtensions = [
      ".docx",
      ".doc",
      ".pptx",
      ".ppt",
      ".xlsx",
      ".xls",
      ".pdf",
    ];

    const supportedMimeTypes = [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
      "application/msword", // doc
      "application/vnd.openxmlformats-officedocument.presentationml.presentation", // pptx
      "application/vnd.ms-powerpoint", // ppt
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
      "application/vnd.ms-excel", // xls
      "application/pdf", // pdf
    ];

    const ext = path.extname(filename).toLowerCase();
    const hasValidExtension = supportedExtensions.includes(ext);
    const hasValidMimeType = contentType
      ? supportedMimeTypes.includes(contentType)
      : false;

    return hasValidExtension || hasValidMimeType;
  }

  /**
   * Convert a document to PDF using LibreOffice
   * @param inputPath Path to the input file
   * @param outputDir Directory where the PDF will be saved
   * @returns Path to the generated PDF file
   */
  static async convertToPDF(
    inputPath: string,
    outputDir: string
  ): Promise<string> {
    try {
      // Ensure output directory exists
      await fs.mkdir(outputDir, { recursive: true });

      // If input is already PDF, just copy it
      const ext = path.extname(inputPath).toLowerCase();
      if (ext === ".pdf") {
        const outputPath = path.join(
          outputDir,
          path.basename(inputPath, ext) + ".pdf"
        );
        await fs.copyFile(inputPath, outputPath);
        return outputPath;
      }

      // Convert to PDF using LibreOffice
      // --headless: run without GUI
      // --convert-to pdf: convert to PDF format
      // --outdir: output directory
      const libreOfficeCmd = this.getLibreOfficeCommand();
      const command = `"${libreOfficeCmd}" --headless --convert-to pdf --outdir "${outputDir}" "${inputPath}"`;

      Logger.debug(`Converting document to PDF: ${command}`);
      const { stdout, stderr } = await execAsync(command, {
        timeout: env.LIBREOFFICE_CONVERSION_TIMEOUT_MS || 30000,
      });

      if (stderr) {
        Logger.warn(`LibreOffice conversion stderr: ${stderr}`);
      }

      Logger.debug(`LibreOffice conversion stdout: ${stdout}`);

      // LibreOffice creates the PDF with the same name as the input file
      const inputFilename = path.basename(inputPath);
      const pdfFilename = inputFilename.replace(/\.[^.]+$/, ".pdf");
      const outputPath = path.join(outputDir, pdfFilename);

      // Verify the file was created
      try {
        await fs.access(outputPath);
      } catch (_error) {
        throw new Error(
          `PDF conversion failed: output file not created at ${outputPath}`
        );
      }

      return outputPath;
    } catch (error) {
      Logger.error("LibreOffice conversion failed", error);
      throw error;
    }
  }

  /**
   * Download a file from a URL to a temporary location
   * @param url URL to download from
   * @param outputPath Path where the file should be saved
   */
  static async downloadFile(url: string, outputPath: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }

    const fileStream = createWriteStream(outputPath);
    if (response.body) {
      // @ts-expect-error - Node.js stream types
      await pipeline(response.body, fileStream);
    } else {
      throw new Error("Response body is null");
    }
  }

  /**
   * Get a unique temporary filename
   */
  static getTempFilename(prefix: string, extension: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return `${prefix}_${timestamp}_${random}${extension}`;
  }

  /**
   * Clean up temporary files
   */
  static async cleanup(...paths: string[]): Promise<void> {
    for (const filePath of paths) {
      try {
        await fs.unlink(filePath);
        Logger.debug(`Cleaned up temporary file: ${filePath}`);
      } catch (error) {
        Logger.warn(`Failed to cleanup file ${filePath}`, error);
      }
    }
  }
}
