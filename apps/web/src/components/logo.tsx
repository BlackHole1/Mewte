import { cn } from "@/lib/utils";

/**
 * The Mewte mark: a cat sitting quietly, its tail curled into a check mark, beside the
 * notification dot it is about to clear. The artwork lives in `public/logo.png`; the
 * favicon is cut from the same image.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <img
      alt=""
      // The dark tile would melt into a dark sidebar without an edge of its own.
      className={cn("size-8 shrink-0 rounded-[22%] dark:ring-1 dark:ring-border", className)}
      height={32}
      src="/logo.png"
      width={32}
    />
  );
}
