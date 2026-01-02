import { eq } from "drizzle-orm";
import { workerStatsCounter } from "metrics";
import { withWorkerTracing } from "workerTracing";

import type { ZMediaConversionRequest } from "@karakeep/shared-server";
import { db } from "@karakeep/db";
import { assets, bookmarkAssets, bookmarks } from "@karakeep/db/schema";
import {
  MediaConversionQueue,
  QuotaService,
  StorageQuotaError,
} from "@karakeep/shared-server";
import {
  deleteAsset,
  newAssetId,
  readAsset,
  saveAsset,
} from "@karakeep/shared/assetdb";
import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";
import { DequeuedJob, getQueueClient } from "@karakeep/shared/queueing";

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 600; // 20 minutes max

interface FfmpegConvertResponse {
  job_id: string;
  status: "queued";
}

interface FfmpegStatusResponse {
  job_id: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  error?: string;
}

async function uploadToFfmpegService(
  buffer: Buffer,
  targetFormat: string,
  fileName: string,
): Promise<FfmpegConvertResponse> {
  const formData = new FormData();
  // Convert Buffer to Uint8Array for Blob compatibility
  const uint8Array = new Uint8Array(buffer);
  formData.append("file", new Blob([uint8Array]), fileName);
  formData.append("target_format", targetFormat);

  const response = await fetch(
    `${serverConfig.mediaConversion.serviceUrl}/convert`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serverConfig.mediaConversion.apiToken}`,
      },
      body: formData,
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`FFmpeg service upload failed: ${response.status} ${text}`);
  }

  return response.json() as Promise<FfmpegConvertResponse>;
}

async function pollFfmpegStatus(
  jobId: string,
  onProgress: (progress: number) => Promise<void>,
): Promise<FfmpegStatusResponse> {
  let attempts = 0;

  while (attempts < MAX_POLL_ATTEMPTS) {
    const response = await fetch(
      `${serverConfig.mediaConversion.serviceUrl}/status/${jobId}`,
      {
        headers: {
          Authorization: `Bearer ${serverConfig.mediaConversion.apiToken}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`FFmpeg status check failed: ${response.status}`);
    }

    const status = (await response.json()) as FfmpegStatusResponse;

    // Update progress in database
    await onProgress(status.progress);

    if (status.status === "completed") {
      return status;
    }

    if (status.status === "failed") {
      throw new Error(`FFmpeg conversion failed: ${status.error}`);
    }

    attempts++;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error("FFmpeg conversion timed out");
}

async function downloadFromFfmpegService(jobId: string): Promise<Buffer> {
  const response = await fetch(
    `${serverConfig.mediaConversion.serviceUrl}/download/${jobId}`,
    {
      headers: {
        Authorization: `Bearer ${serverConfig.mediaConversion.apiToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`FFmpeg download failed: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function getContentTypeForFormat(format: string): string {
  switch (format) {
    case "mp3":
      return "audio/mpeg";
    case "mp4":
      return "video/mp4";
    case "webm":
      return "video/webm";
    default:
      return "application/octet-stream";
  }
}

function getAssetTypeForFormat(format: string): "audio" | "video" {
  return format === "mp3" ? "audio" : "video";
}

// No-op runner for when service is disabled
const noOpRunner = {
  run: () => Promise.resolve(),
  stop: () => {
    // No-op: service is disabled, nothing to stop
  },
};

export class MediaConversionWorker {
  static async build() {
    if (!serverConfig.mediaConversion.enabled) {
      logger.info(
        "Media conversion worker disabled - FFMPEG_SERVICE_URL or FFMPEG_API_TOKEN not configured",
      );
      return noOpRunner;
    }

    logger.info("Starting media conversion worker ...");
    const worker =
      (await getQueueClient())!.createRunner<ZMediaConversionRequest>(
        MediaConversionQueue,
        {
          run: withWorkerTracing("mediaConversionWorker.run", run),
          onComplete: async (job) => {
            workerStatsCounter.labels("mediaConversion", "completed").inc();
            const jobId = job.id;
            logger.info(`[mediaConversion][${jobId}] Completed successfully`);
            return Promise.resolve();
          },
          onError: async (job) => {
            workerStatsCounter.labels("mediaConversion", "failed").inc();
            const jobId = job.id;
            logger.error(
              `[mediaConversion][${jobId}] Conversion failed: ${job.error}\n${job.error.stack}`,
            );

            // Mark conversion as failed in database
            if (job.numRetriesLeft === 0 && job.data) {
              workerStatsCounter
                .labels("mediaConversion", "failed_permanent")
                .inc();
              try {
                await db
                  .update(assets)
                  .set({
                    conversionStatus: "failure",
                  })
                  .where(eq(assets.id, job.data.assetId));
              } catch (e) {
                logger.error(
                  `[mediaConversion][${jobId}] Failed to update asset status to failure: ${e}`,
                );
              }
            }
            return Promise.resolve();
          },
        },
        {
          concurrency: serverConfig.mediaConversion.numWorkers,
          pollIntervalMs: 1000,
          timeoutSecs: serverConfig.mediaConversion.jobTimeoutSec,
        },
      );

    return worker;
  }
}

async function run(req: DequeuedJob<ZMediaConversionRequest>) {
  const jobId = req.id;
  const { assetId, bookmarkId, targetFormat } = req.data;

  logger.info(
    `[mediaConversion][${jobId}] Starting conversion for asset ${assetId} to ${targetFormat}`,
  );

  // Get the bookmark and asset info
  const bookmark = await db.query.bookmarks.findFirst({
    where: eq(bookmarks.id, bookmarkId),
    with: {
      asset: true,
    },
  });

  if (!bookmark) {
    throw new Error(`[mediaConversion][${jobId}] Bookmark not found`);
  }

  if (!bookmark.asset) {
    throw new Error(
      `[mediaConversion][${jobId}] Bookmark has no associated asset`,
    );
  }

  // Get the original asset from the assets table
  const originalAsset = await db.query.assets.findFirst({
    where: eq(assets.id, assetId),
  });

  if (!originalAsset) {
    throw new Error(`[mediaConversion][${jobId}] Asset ${assetId} not found`);
  }

  // Read the original asset file
  const { asset: assetBuffer } = await readAsset({
    userId: bookmark.userId,
    assetId: bookmark.asset.assetId,
  });

  if (!assetBuffer) {
    throw new Error(
      `[mediaConversion][${jobId}] Could not read asset file for ${assetId}`,
    );
  }

  // Update status to converting
  await db
    .update(assets)
    .set({
      conversionStatus: "converting",
      conversionProgress: 0,
    })
    .where(eq(assets.id, assetId));

  // Upload to ffmpeg service
  logger.info(`[mediaConversion][${jobId}] Uploading to ffmpeg service...`);
  const ffmpegJob = await uploadToFfmpegService(
    assetBuffer,
    targetFormat,
    originalAsset.fileName ?? "media",
  );

  // Save the ffmpeg job id
  await db
    .update(assets)
    .set({
      conversionJobId: ffmpegJob.job_id,
    })
    .where(eq(assets.id, assetId));

  logger.info(
    `[mediaConversion][${jobId}] FFmpeg job started: ${ffmpegJob.job_id}`,
  );

  // Poll for completion
  const onProgress = async (progress: number) => {
    await db
      .update(assets)
      .set({
        conversionProgress: Math.round(progress),
      })
      .where(eq(assets.id, assetId));
  };

  await pollFfmpegStatus(ffmpegJob.job_id, onProgress);

  logger.info(
    `[mediaConversion][${jobId}] Conversion completed, downloading...`,
  );

  // Download the converted file
  const convertedBuffer = await downloadFromFfmpegService(ffmpegJob.job_id);

  logger.info(
    `[mediaConversion][${jobId}] Downloaded ${convertedBuffer.length} bytes`,
  );

  // Check storage quota for new file
  let quotaApproved;
  try {
    quotaApproved = await QuotaService.checkStorageQuota(
      db,
      bookmark.userId,
      convertedBuffer.byteLength,
    );
  } catch (e) {
    if (e instanceof StorageQuotaError) {
      logger.warn(
        `[mediaConversion][${jobId}] Quota exceeded, cannot save converted file`,
      );
      await db
        .update(assets)
        .set({
          conversionStatus: "failure",
        })
        .where(eq(assets.id, assetId));
      throw e;
    }
    throw e;
  }

  // Create new asset for converted file
  const newAssetIdValue = newAssetId();
  const newContentType = getContentTypeForFormat(targetFormat);
  const newAssetType = getAssetTypeForFormat(targetFormat);
  const newFileName = `${(originalAsset.fileName ?? "media").replace(/\.[^.]+$/, "")}.${targetFormat}`;

  // Save the converted file to storage
  await saveAsset({
    userId: bookmark.userId,
    assetId: newAssetIdValue,
    asset: convertedBuffer,
    metadata: {
      contentType: newContentType,
      fileName: newFileName,
    },
    quotaApproved,
  });

  logger.info(
    `[mediaConversion][${jobId}] Saved converted asset ${newAssetIdValue}`,
  );

  // Insert new record in assets table for the converted file
  await db.insert(assets).values({
    id: newAssetIdValue,
    bookmarkId: bookmarkId,
    userId: bookmark.userId,
    assetType: originalAsset.assetType,
    contentType: newContentType,
    size: convertedBuffer.byteLength,
    fileName: newFileName,
    conversionStatus: "success",
    conversionProgress: 100,
  });

  // Update the bookmark asset to point to the new converted file
  await db
    .update(bookmarkAssets)
    .set({
      assetId: newAssetIdValue,
      assetType: newAssetType,
      fileName: newFileName,
    })
    .where(eq(bookmarkAssets.id, bookmarkId));

  // Delete the old assets table record
  await db.delete(assets).where(eq(assets.id, assetId));

  // Delete the original unconverted asset file
  try {
    await deleteAsset({
      userId: bookmark.userId,
      assetId: bookmark.asset.assetId,
    });
    logger.info(
      `[mediaConversion][${jobId}] Deleted original asset file ${bookmark.asset.assetId}`,
    );
  } catch (e) {
    logger.warn(
      `[mediaConversion][${jobId}] Failed to delete original asset: ${e}`,
    );
    // Don't fail the job if deletion fails
  }

  logger.info(
    `[mediaConversion][${jobId}] Conversion complete for bookmark ${bookmarkId}`,
  );
}
