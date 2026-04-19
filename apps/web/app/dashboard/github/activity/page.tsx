import type { Metadata } from "next";
import GithubActivityFeed from "@/components/github/GithubActivityFeed";

export const metadata: Metadata = {
  title: "GitHub Activity | Karakeep",
};

export default function GithubActivityPage() {
  return <GithubActivityFeed />;
}
