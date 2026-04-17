"use client";

import { FullPageSpinner } from "@/components/ui/full-page-spinner";
import { api } from "@/lib/trpc";
import MarkdownPreview from "@uiw/react-markdown-preview";
import { useTheme } from "next-themes";

export default function GithubReadmeView({
  bookmarkId,
  className,
}: {
  bookmarkId: string;
  className?: string;
}) {
  const { resolvedTheme } = useTheme();
  const { data, isPending } = api.github.getRepoReadmeMarkdown.useQuery({
    bookmarkId,
  });

  if (isPending) return <FullPageSpinner />;
  if (!data?.markdown) {
    return <div className="p-4 text-muted-foreground">No README found.</div>;
  }
  const rewriteUrl = (u: string) => {
    if (!data.owner || !data.repo) return u;
    if (/^(https?:|data:|mailto:|#)/i.test(u)) return u;
    const clean = u.replace(/^\.?\/?/, "");
    return `https://raw.githubusercontent.com/${data.owner}/${data.repo}/HEAD/${clean}`;
  };
  return (
    <div className={className} style={{ width: "100%", minWidth: 0 }}>
      <MarkdownPreview
        source={data.markdown}
        wrapperElement={{
          "data-color-mode": resolvedTheme === "dark" ? "dark" : "light",
        }}
        style={{
          background: "transparent",
          padding: "1rem",
          width: "100%",
          maxWidth: "100%",
          boxSizing: "border-box",
          overflowWrap: "anywhere",
        }}
        components={{
          img: ({
            node: _node,
            style,
            width: _w,
            height: _h,
            src,
            alt,
            ...props
          }) => (
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
            <img
              {...props}
              alt={alt ?? ""}
              src={typeof src === "string" ? rewriteUrl(src) : undefined}
              style={{
                ...style,
                maxWidth: "100%",
                height: "auto",
                width: "auto",
                display: "block",
              }}
            />
          ),
          a: ({ node: _node, href, children, ...props }) => (
            // eslint-disable-next-line @next/next/no-html-link-for-pages
            <a
              {...props}
              href={href ? rewriteUrl(href) : href}
              target="_blank"
              rel="noreferrer"
            >
              {children}
            </a>
          ),
        }}
      />
    </div>
  );
}
