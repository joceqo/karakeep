import { redirect } from "next/dist/client/components/navigation";
import KarakeepLogo from "@/components/KarakeepIcon";
import SignInForm from "@/components/signin/SignInForm";
import { getServerAuthSession } from "@/server/auth";

export default async function SignInPage() {
  const session = await getServerAuthSession();
  if (session) {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-3">
          <KarakeepLogo height={48} />
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Karakeep
          </h1>
          <p className="text-center text-sm text-muted-foreground">
            The Bookmark Everything app.
          </p>
        </div>
        <SignInForm />
        <p className="text-center text-xs text-muted-foreground/60">
          By signing in, you agree to our terms of service.
        </p>
      </div>
    </div>
  );
}
