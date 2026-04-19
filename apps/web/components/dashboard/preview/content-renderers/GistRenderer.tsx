import { Github } from "lucide-react";

import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";

import GistPreview from "../../../github/GistPreview";
import { parseGistUrl } from "../../../github/gistUrl";
import { ContentRenderer } from "./types";

function canRenderGist(bookmark: ZBookmark): boolean {
  if (bookmark.content.type !== BookmarkTypes.LINK) {
    return false;
  }
  return parseGistUrl(bookmark.content.url) !== null;
}

function GistRendererComponent({ bookmark }: { bookmark: ZBookmark }) {
  if (bookmark.content.type !== BookmarkTypes.LINK) {
    return null;
  }
  return (
    <div className="relative h-full w-full overflow-auto p-4">
      <GistPreview url={bookmark.content.url} />
    </div>
  );
}

export const gistRenderer: ContentRenderer = {
  id: "gist",
  name: "GitHub Gist",
  icon: Github,
  canRender: canRenderGist,
  component: GistRendererComponent,
  priority: 15,
};
