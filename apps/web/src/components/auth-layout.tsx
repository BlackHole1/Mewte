import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Brand } from "./app-shell";
import { GitHubIcon, REPO_URL } from "./github-icon";
import { LanguageSelect } from "./preferences";

/** Centered card layout shared by the setup and sign-in pages. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-muted/40">
      <header className="flex items-center justify-between gap-4 p-4">
        <Brand />
        <div className="flex items-center gap-2">
          <Button
            aria-label="GitHub"
            render={<a href={REPO_URL} rel="noreferrer" target="_blank" />}
            size="icon"
            variant="ghost"
          >
            <GitHubIcon />
          </Button>
          <LanguageSelect className="w-36" />
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center p-4 sm:items-center sm:pb-24">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
