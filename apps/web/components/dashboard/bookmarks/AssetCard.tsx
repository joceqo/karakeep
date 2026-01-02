"use client";

import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { FileAudio, FileText, FileVideo, Loader2 } from "lucide-react";

import type { ZBookmarkTypeAsset } from "@karakeep/shared/types/bookmarks";
import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";
import { getSourceUrl } from "@karakeep/shared/utils/bookmarkUtils";

import { BookmarkLayoutAdaptingCard } from "./BookmarkLayoutAdaptingCard";
import FooterLinkURL from "./FooterLinkURL";

function AssetImage({
  bookmark,
  className,
}: {
  bookmark: ZBookmarkTypeAsset;
  className?: string;
}) {
  const bookmarkedAsset = bookmark.content;
  switch (bookmarkedAsset.assetType) {
    case "image": {
      return (
        <Link href={`/dashboard/preview/${bookmark.id}`}>
          <Image
            alt="asset"
            src={getAssetUrl(bookmarkedAsset.assetId)}
            fill={true}
            className={className}
          />
        </Link>
      );
    }
    case "pdf": {
      const screenshotAssetId = bookmark.assets.find(
        (r) => r.assetType === "assetScreenshot",
      )?.id;
      if (!screenshotAssetId) {
        return (
          <div
            className={cn(className, "flex items-center justify-center")}
            title="PDF screenshot not available. Run asset preprocessing job to generate one screenshot"
          >
            <FileText size={80} />
          </div>
        );
      }
      return (
        <Link href={`/dashboard/preview/${bookmark.id}`}>
          <Image
            alt="asset"
            src={getAssetUrl(screenshotAssetId)}
            fill={true}
            className={className}
          />
        </Link>
      );
    }
    case "video": {
      const { conversionStatus, conversionProgress } = bookmarkedAsset;
      if (conversionStatus === "pending" || conversionStatus === "converting") {
        return (
          <div
            className={cn(
              className,
              "flex flex-col items-center justify-center gap-2",
            )}
          >
            <Loader2 className="animate-spin" size={40} />
            <span className="text-sm text-muted-foreground">
              Converting... {conversionProgress ?? 0}%
            </span>
          </div>
        );
      }
      if (conversionStatus === "failure") {
        return (
          <div
            className={cn(
              className,
              "flex flex-col items-center justify-center gap-2",
            )}
          >
            <FileVideo size={80} className="text-destructive" />
            <span className="text-sm text-destructive">Conversion failed</span>
          </div>
        );
      }
      return (
        <Link href={`/dashboard/preview/${bookmark.id}`}>
          <div className={cn(className, "flex items-center justify-center")}>
            <FileVideo size={80} />
          </div>
        </Link>
      );
    }
    case "audio": {
      const { conversionStatus, conversionProgress } = bookmarkedAsset;
      if (conversionStatus === "pending" || conversionStatus === "converting") {
        return (
          <div
            className={cn(
              className,
              "flex flex-col items-center justify-center gap-2",
            )}
          >
            <Loader2 className="animate-spin" size={40} />
            <span className="text-sm text-muted-foreground">
              Converting... {conversionProgress ?? 0}%
            </span>
          </div>
        );
      }
      if (conversionStatus === "failure") {
        return (
          <div
            className={cn(
              className,
              "flex flex-col items-center justify-center gap-2",
            )}
          >
            <FileAudio size={80} className="text-destructive" />
            <span className="text-sm text-destructive">Conversion failed</span>
          </div>
        );
      }
      return (
        <Link href={`/dashboard/preview/${bookmark.id}`}>
          <div className={cn(className, "flex items-center justify-center")}>
            <FileAudio size={80} />
          </div>
        </Link>
      );
    }
    default: {
      const _exhaustiveCheck: never = bookmarkedAsset.assetType;
      return <span />;
    }
  }
}

export default function AssetCard({
  bookmark: bookmarkedAsset,
  className,
}: {
  bookmark: ZBookmarkTypeAsset;
  className?: string;
}) {
  return (
    <BookmarkLayoutAdaptingCard
      title={bookmarkedAsset.title ?? bookmarkedAsset.content.fileName}
      footer={
        getSourceUrl(bookmarkedAsset) && (
          <FooterLinkURL url={getSourceUrl(bookmarkedAsset)} />
        )
      }
      bookmark={bookmarkedAsset}
      className={className}
      wrapTags={true}
      image={(_layout, className) => (
        <div className="relative size-full flex-1">
          <AssetImage bookmark={bookmarkedAsset} className={className} />
        </div>
      )}
    />
  );
}
