import { useTranslation } from "react-i18next";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface Option<T extends string = string> {
  value: T;
  label: string;
}

interface SimpleSelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: readonly Option<T>[];
  ariaLabel?: string;
  className?: string;
  size?: "sm" | "default" | "lg";
  disabled?: boolean;
  id?: string;
}

/** A single-choice select over a fixed list of labelled string values. */
export function SimpleSelect<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
  size,
  disabled,
  id,
}: SimpleSelectProps<T>) {
  return (
    <Select
      disabled={disabled}
      items={options as Option<T>[]}
      onValueChange={(next) => {
        if (next !== null) onChange(next as T);
      }}
      value={value}
    >
      <SelectTrigger aria-label={ariaLabel} className={className} id={id} size={size}>
        <SelectValue />
      </SelectTrigger>
      <SelectPopup>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}

interface MultiSelectProps {
  values: string[];
  onChange: (values: string[]) => void;
  options: readonly Option[];
  ariaLabel?: string;
  className?: string;
  invalid?: boolean;
}

/** A multiple-choice select that summarises the selection in its trigger. */
export function MultiSelect({
  values,
  onChange,
  options,
  ariaLabel,
  className,
  invalid,
}: MultiSelectProps) {
  const { t } = useTranslation();
  const labels = new Map(options.map((option) => [option.value, option.label]));

  return (
    <Select
      items={options as Option[]}
      multiple
      onValueChange={(next) => onChange(next as string[])}
      value={values}
    >
      <SelectTrigger
        aria-invalid={invalid || undefined}
        aria-label={ariaLabel}
        className={className}
      >
        <SelectValue>
          {(selected: string[]) => {
            if (selected.length === 0) {
              return (
                <span className="text-muted-foreground">{t("conditions.selectPlaceholder")}</span>
              );
            }
            if (selected.length <= 2) return selected.map((v) => labels.get(v) ?? v).join(", ");
            return t("conditions.selectedCount", { count: selected.length });
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectPopup>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}
