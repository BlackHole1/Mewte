import { XIcon } from "lucide-react";
import { type KeyboardEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface TagInputProps {
  values: string[];
  onChange: (values: string[]) => void;
  ariaLabel: string;
  placeholder?: string;
  invalid?: boolean;
}

/** Free-form list entry: type a value, press Enter or comma, and it becomes a chip. */
export function TagInput({ values, onChange, ariaLabel, placeholder, invalid }: TagInputProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");

  function commit(text: string) {
    const additions = text
      .split(/[,\n]/)
      .map((part) => part.trim())
      .filter((part) => part && !values.includes(part));
    if (additions.length > 0) onChange([...values, ...additions]);
    setDraft("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commit(draft);
    } else if (event.key === "Backspace" && draft === "" && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  }

  return (
    <div
      className={cn(
        "flex min-h-9 w-full flex-wrap items-center gap-1 rounded-lg border border-input bg-background px-2 py-1 text-sm shadow-xs/5 transition-shadow focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/24 sm:min-h-8",
        invalid &&
          "border-destructive/36 focus-within:border-destructive/64 focus-within:ring-destructive/16",
      )}
    >
      {values.map((value) => (
        <Badge className="gap-1 pe-0.5" key={value} variant="secondary">
          <span className="max-w-48 truncate font-mono text-xs">{value}</span>
          <button
            aria-label={t("conditions.removeValue", { value })}
            className="flex size-4 cursor-pointer items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onChange(values.filter((v) => v !== value))}
            type="button"
          >
            <XIcon aria-hidden="true" className="size-3" />
          </button>
        </Badge>
      ))}
      <input
        aria-invalid={invalid || undefined}
        aria-label={ariaLabel}
        autoCapitalize="none"
        autoComplete="off"
        className="min-w-24 flex-1 bg-transparent py-0.5 outline-none placeholder:text-muted-foreground/72"
        onBlur={() => commit(draft)}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onPaste={(event) => {
          const text = event.clipboardData.getData("text");
          if (/[,\n]/.test(text)) {
            event.preventDefault();
            commit(draft + text);
          }
        }}
        placeholder={values.length === 0 ? placeholder : undefined}
        spellCheck={false}
        type="text"
        value={draft}
      />
    </div>
  );
}
