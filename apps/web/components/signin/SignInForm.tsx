import { authOptions } from "@/server/auth";

import serverConfig from "@karakeep/shared/config";

import CredentialsForm from "./CredentialsForm";
import SignInProviderButton from "./SignInProviderButton";

export default async function SignInForm() {
  const providers = authOptions.providers;
  const oauthProviders = Object.values(providers).filter(
    (p) => p.id !== "credentials",
  );
  const showCredentials = !serverConfig.auth.disablePasswordAuth;

  return (
    <div className="w-full space-y-4">
      {oauthProviders.length > 0 && (
        <div className="space-y-3">
          {oauthProviders.map((provider) => (
            <SignInProviderButton
              key={provider.id}
              provider={{ id: provider.id, name: provider.name }}
            />
          ))}
        </div>
      )}

      {showCredentials && oauthProviders.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-stone-200" />
          <span className="text-xs text-stone-400">or</span>
          <div className="h-px flex-1 bg-stone-200" />
        </div>
      )}

      {showCredentials && <CredentialsForm />}
    </div>
  );
}
