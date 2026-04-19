import type { Metadata } from "next";
import GithubRepoSearch from "@/components/github/GithubRepoSearch";

export const metadata: Metadata = {
  title: "GitHub Search | Karakeep",
};

export default function GithubSearchPage() {
  return <GithubRepoSearch />;
}
