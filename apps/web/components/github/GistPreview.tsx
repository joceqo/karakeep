"use client";

import React from "react";
import Link from "next/link";
import { api } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, ExternalLink, Github } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { dracula } from "react-syntax-highlighter/dist/cjs/styles/prism";

import { parseGistUrl } from "./gistUrl";

interface GistPreviewProps {
  url: string;
  className?: string;
}

export function isGistUrl(url: string): boolean {
  return parseGistUrl(url) !== null;
}

const LANGUAGE_MAP: Record<string, string> = {
  JavaScript: "javascript",
  TypeScript: "typescript",
  Python: "python",
  Ruby: "ruby",
  Go: "go",
  Rust: "rust",
  Java: "java",
  Kotlin: "kotlin",
  Swift: "swift",
  Shell: "bash",
  Bash: "bash",
  HTML: "html",
  CSS: "css",
  SCSS: "scss",
  JSON: "json",
  YAML: "yaml",
  Markdown: "markdown",
  SQL: "sql",
  C: "c",
  "C++": "cpp",
  "C#": "csharp",
  PHP: "php",
  Dockerfile: "docker",
};

function mapLanguage(ghLanguage: string | null): string {
  if (!ghLanguage) return "text";
  return LANGUAGE_MAP[ghLanguage] ?? ghLanguage.toLowerCase();
}

export default function GistPreview({ url, className }: GistPreviewProps) {
  const parsed = parseGistUrl(url);
  const gistIdOrUrl = parsed?.gistId ?? url;
  const { data, isLoading, error } = api.github.fetchGist.useQuery(
    { gistIdOrUrl },
    { enabled: !!parsed, retry: false },
  );

  const [openFiles, setOpenFiles] = React.useState<Record<string, boolean>>({});

  if (!parsed) return null;

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-md border bg-card p-4",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Github className="size-4" />
          <span className="font-medium">Gist</span>
          {data?.ownerLogin && (
            <span className="text-sm text-muted-foreground">
              by {data.ownerLogin}
            </span>
          )}
        </div>
        <Link
          href={url}
          target="_blank"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
        >
          View on GitHub
          <ExternalLink className="size-3" />
        </Link>
      </div>

      {data?.description && (
        <p className="text-sm text-muted-foreground">{data.description}</p>
      )}

      {isLoading && (
        <div className="text-sm text-muted-foreground">Loading gist...</div>
      )}
      {error && (
        <div className="text-sm text-red-500">
          Failed to load gist: {error.message}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {data?.files.map((file, idx) => {
          const isOpen = openFiles[file.filename] ?? idx === 0;
          return (
            <div
              key={file.filename}
              className="overflow-hidden rounded-md border"
            >
              <button
                type="button"
                onClick={() =>
                  setOpenFiles((s) => ({
                    ...s,
                    [file.filename]: !isOpen,
                  }))
                }
                className="flex w-full items-center justify-between gap-2 bg-muted/50 px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <div className="flex items-center gap-2">
                  {isOpen ? (
                    <ChevronDown className="size-4" />
                  ) : (
                    <ChevronRight className="size-4" />
                  )}
                  <span className="font-mono">{file.filename}</span>
                  {file.language && (
                    <span className="text-xs text-muted-foreground">
                      {file.language}
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {file.size} bytes
                  {file.truncated && " (truncated)"}
                </span>
              </button>
              {isOpen && (
                <SyntaxHighlighter
                  language={mapLanguage(file.language)}
                  style={dracula}
                  customStyle={{
                    margin: 0,
                    fontSize: "0.85rem",
                    maxHeight: "400px",
                  }}
                  showLineNumbers
                >
                  {file.content}
                </SyntaxHighlighter>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
