import type { Metadata } from "next";
import GithubSettings from "@/components/settings/GithubSettings";

export const metadata: Metadata = {
  title: "GitHub | Karakeep",
};

export default function GithubSettingsPage() {
  return <GithubSettings />;
}
