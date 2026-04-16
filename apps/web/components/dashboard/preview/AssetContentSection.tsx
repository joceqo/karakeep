import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "@/lib/i18n/client";

import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";
import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";

// 20 MB
const BIG_FILE_SIZE = 20 * 1024 * 1024;

function PDFContentSection({ bookmark }: { bookmark: ZBookmark }) {
  if (bookmark.content.type != BookmarkTypes.ASSET) {
    throw new Error("Invalid content type");
  }
  const { t } = useTranslation();

  const initialSection = useMemo(() => {
    if (bookmark.content.type != BookmarkTypes.ASSET) {
      throw new Error("Invalid content type");
    }

    const screenshot = bookmark.assets.find(
      (item) => item.assetType === "assetScreenshot",
    );
    const bigSize =
      bookmark.content.size && bookmark.content.size > BIG_FILE_SIZE;
    if (bigSize && screenshot) {
      return "screenshot";
    }
    return "pdf";
  }, [bookmark]);
  const [section, setSection] = useState(initialSection);

  const screenshot = bookmark.assets.find(
    (r) => r.assetType === "assetScreenshot",
  )?.id;

  const content =
    section === "screenshot" && screenshot ? (
      <div className="relative h-full min-w-full">
        <Image
          alt="screenshot"
          src={getAssetUrl(screenshot)}
          fill={true}
          className="object-contain"
        />
      </div>
    ) : (
      <iframe
        title={bookmark.content.assetId}
        className="h-full w-full"
        src={getAssetUrl(bookmark.content.assetId)}
      />
    );

  return (
    <div className="flex h-full flex-col items-center gap-2">
      <div className="flex w-full items-center justify-center gap-4">
        <Select onValueChange={setSection} value={section}>
          <SelectTrigger className="w-fit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="screenshot" disabled={!screenshot}>
                {t("common.screenshot")}
              </SelectItem>
              <SelectItem value="pdf">PDF</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      {content}
    </div>
  );
}

function ImageContentSection({ bookmark }: { bookmark: ZBookmark }) {
  if (bookmark.content.type != BookmarkTypes.ASSET) {
    throw new Error("Invalid content type");
  }
  return (
    <div className="relative h-full min-w-full">
      <Link href={getAssetUrl(bookmark.content.assetId)} target="_blank">
        <Image
          alt="asset"
          fill={true}
          className="object-contain"
          src={getAssetUrl(bookmark.content.assetId)}
        />
      </Link>
    </div>
  );
}

function VideoContentSection({ bookmark }: { bookmark: ZBookmark }) {
  if (bookmark.content.type != BookmarkTypes.ASSET) {
    throw new Error("Invalid content type");
  }
  return (
    <div className="flex h-full w-full items-center justify-center">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- User-uploaded videos don't have caption tracks */}
      <video
        controls
        className="max-h-full max-w-full"
        src={getAssetUrl(bookmark.content.assetId)}
      >
        Your browser does not support the video element.
      </video>
    </div>
  );
}

function AudioContentSection({ bookmark }: { bookmark: ZBookmark }) {
  if (bookmark.content.type != BookmarkTypes.ASSET) {
    throw new Error("Invalid content type");
  }
  return (
    <div className="flex h-full w-full items-center justify-center">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- User-uploaded audio don't have caption tracks */}
      <audio
        controls
        className="w-full max-w-md"
        src={getAssetUrl(bookmark.content.assetId)}
      >
        Your browser does not support the audio element.
      </audio>
    </div>
  );
}

export function AssetContentSection({ bookmark }: { bookmark: ZBookmark }) {
  if (bookmark.content.type != BookmarkTypes.ASSET) {
    throw new Error("Invalid content type");
  }
  switch (bookmark.content.assetType) {
    case "image":
      return <ImageContentSection bookmark={bookmark} />;
    case "pdf":
      return <PDFContentSection bookmark={bookmark} />;
    case "video":
      return <VideoContentSection bookmark={bookmark} />;
    case "audio":
      return <AudioContentSection bookmark={bookmark} />;
    default: {
      const _exhaustiveCheck: never = bookmark.content.assetType;
      return <div>Unsupported asset type</div>;
    }
  }
}
