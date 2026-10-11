import { useTranslation } from "react-i18next";
import { OTPField, OTPFieldInput, OTPFieldSeparator } from "@/components/ui/otp-field";

/** Six-digit entry for authenticator codes. */
export function CodeInput({
  value,
  onChange,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const label = (index: number) => t("login.digit", { index });
  return (
    <OTPField aria-label={t("login.code")} length={6} onValueChange={onChange} value={value}>
      {/* Base UI labels the first input from the field itself. */}
      <OTPFieldInput autoFocus={autoFocus} />
      <OTPFieldInput aria-label={label(2)} />
      <OTPFieldInput aria-label={label(3)} />
      <OTPFieldSeparator />
      <OTPFieldInput aria-label={label(4)} />
      <OTPFieldInput aria-label={label(5)} />
      <OTPFieldInput aria-label={label(6)} />
    </OTPField>
  );
}
