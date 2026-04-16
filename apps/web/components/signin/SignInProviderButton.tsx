"use client";

import { Github } from "lucide-react";
import { signIn } from "next-auth/react";

const PROVIDER_ICONS: Record<string, React.ReactNode> = {
  GitHub: <Github className="h-5 w-5" />,
};

export default function SignInProviderButton({
  provider,
}: {
  provider: {
    id: string;
    name: string;
  };
}) {
  return (
    <button
      onClick={() =>
        signIn(provider.id, {
          callbackUrl: "/",
        })
      }
      className="flex w-full items-center justify-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground shadow-sm transition-all hover:bg-accent hover:shadow active:scale-[0.98]"
    >
      {PROVIDER_ICONS[provider.name] ?? null}
      Continue with {provider.name}
    </button>
  );
}
