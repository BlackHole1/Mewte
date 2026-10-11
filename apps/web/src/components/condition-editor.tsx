import {
  CONDITION_FIELDS,
  type Condition,
  type ConditionField,
  type ConditionGroup,
  type ConditionLeaf,
  FIELD_OPERATORS,
  KNOWN_REASONS,
  KNOWN_SUBJECT_TYPES,
  MAX_CONDITION_DEPTH,
  SUBJECT_STATES,
  conditionLeafSchema,
  defaultLeaf,
} from "@mewte/shared";
import { FolderPlusIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Fragment, type ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { MultiSelect, type Option, SimpleSelect } from "./simple-select";
import { TagInput } from "./tag-input";

const HINTED_FIELDS = new Set<ConditionField>([
  "repo",
  "owner",
  "actor",
  "reviewer",
  "commenter",
  "state",
]);
const PATTERN_FIELDS = new Set<ConditionField>([
  "repo",
  "owner",
  "actor",
  "author",
  "reviewer",
  "assignee",
  "commenter",
  "label",
]);

export function isLeafValid(leaf: ConditionLeaf): boolean {
  return conditionLeafSchema.safeParse(leaf).success;
}

/**
 * How a group reads to a person. The two negated modes are shown in their De Morgan form,
 * "not A and not B" rather than "not (A or B)", so every row carries its own connector.
 */
type GroupMode = "all" | "any" | "none" | "notAll";
type Joiner = "and" | "or";

const GROUP_MODES: readonly GroupMode[] = ["all", "any", "none", "notAll"];

const MODE_GROUP: Record<GroupMode, Pick<ConditionGroup, "op" | "negate">> = {
  all: { op: "and" },
  any: { op: "or" },
  none: { op: "or", negate: true },
  notAll: { op: "and", negate: true },
};

const MODE_JOINER: Record<GroupMode, Joiner> = { all: "and", any: "or", none: "and", notAll: "or" };

const JOINER_RAIL: Record<Joiner, string> = { and: "border-info/60", or: "border-warning/70" };
const JOINER_TEXT: Record<Joiner, string> = {
  and: "text-info-foreground",
  or: "text-warning-foreground",
};

function groupMode(group: ConditionGroup): GroupMode {
  if (group.negate) return group.op === "or" ? "none" : "notAll";
  return group.op === "and" ? "all" : "any";
}

const isNegated = (mode: GroupMode) => mode === "none" || mode === "notAll";

/** The word in front of a row: nothing, "not", "and", "or not", ... */
function connectorKey(mode: GroupMode, index: number) {
  const joiner = MODE_JOINER[mode];
  if (index === 0) return isNegated(mode) ? ("not" as const) : null;
  return isNegated(mode) ? (`${joiner}Not` as const) : joiner;
}

function Connector({ mode, index }: { mode: GroupMode; index: number }) {
  const { t } = useTranslation();
  const key = connectorKey(mode, index);
  // Beside the row on wide screens; on narrow ones it sits above the row to save width.
  if (!key) return <span className="max-sm:hidden" />;
  return (
    <span className="flex items-center sm:h-8 sm:justify-end">
      <Badge variant={key === "not" ? "error" : MODE_JOINER[mode] === "and" ? "info" : "warning"}>
        {t(`conditions.connectors.${key}`)}
      </Badge>
    </span>
  );
}

interface LeafText {
  field: string;
  operator: string;
  value: string;
  negated?: boolean;
}

/** Turns one condition into the phrases a sentence needs. */
function useLeafText(): (leaf: ConditionLeaf) => LeafText {
  const { t } = useTranslation();
  return (leaf) => {
    let value: string;
    switch (leaf.field) {
      case "reason":
        value = leaf.value.map((v) => t(`reasons.${v}`, { defaultValue: v })).join(", ");
        break;
      case "subject_type":
        value = leaf.value.map((v) => t(`subjectTypes.${v}`, { defaultValue: v })).join(", ");
        break;
      case "state":
        value = leaf.value.map((v) => t(`states.${v}`)).join(", ");
        break;
      case "title":
        value = leaf.value;
        break;
      case "actor_is_bot":
      case "author_is_bot":
        // "Author is a bot" already is a sentence; "is yes" would only add noise.
        return {
          field: t(`conditions.fields.${leaf.field}`),
          operator: "",
          value: "",
          negated: !leaf.value,
        };
      default:
        value = leaf.value.join(", ");
    }
    return {
      field: t(`conditions.fields.${leaf.field}`),
      operator: t(`conditions.operators.${leaf.operator}`),
      value,
    };
  };
}

function SummaryGroup({ group, nested }: { group: ConditionGroup; nested: boolean }) {
  const { t } = useTranslation();
  const leafText = useLeafText();
  const mode = groupMode(group);
  const joiner = MODE_JOINER[mode];
  const wrap = nested && (group.children.length > 1 || isNegated(mode));

  const parts: ReactNode[] = group.children.map((child, index) => {
    const key = connectorKey(mode, index);
    const text = child.type === "leaf" ? leafText(child) : null;
    return (
      // oxlint-disable-next-line react/no-array-index-key -- conditions have no identity of their own
      <Fragment key={index}>
        {key ? (
          <span
            className={cn(
              "font-medium",
              key === "not" ? "text-destructive-foreground" : JOINER_TEXT[joiner],
            )}
          >
            {t(`conditions.connectors.${key}`)}
          </span>
        ) : null}
        {text ? (
          <span>
            {text.negated ? (
              <span className="font-medium text-destructive-foreground">
                {t("conditions.connectors.not")}{" "}
              </span>
            ) : null}
            {text.field}
            {text.operator ? (
              <>
                {" "}
                <span className="text-muted-foreground">{text.operator}</span>{" "}
                <span className="font-medium">{text.value || "…"}</span>
              </>
            ) : null}
          </span>
        ) : (
          <SummaryGroup group={child as ConditionGroup} nested />
        )}
      </Fragment>
    );
  });

  if (!wrap) return <>{parts}</>;
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
      <span className="text-muted-foreground">(</span>
      {parts}
      <span className="text-muted-foreground">)</span>
    </span>
  );
}

/** The whole tree as one sentence, so nested logic can be checked at a glance. */
function ConditionSummary({ group }: { group: ConditionGroup }) {
  const { t } = useTranslation();
  if (group.children.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-muted/60 px-3 py-2">
      <span className="text-muted-foreground text-xs">{t("conditions.summary")}</span>
      <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-sm leading-relaxed">
        <SummaryGroup group={group} nested={false} />
      </p>
    </div>
  );
}

function LeafValue({
  leaf,
  onChange,
  invalid,
}: {
  leaf: ConditionLeaf;
  onChange: (leaf: ConditionLeaf) => void;
  invalid: boolean;
}) {
  const { t } = useTranslation();
  const caseId = useId();
  const label = t("conditions.value");

  switch (leaf.field) {
    case "reason":
    case "subject_type": {
      const group = leaf.field === "reason" ? "reasons" : "subjectTypes";
      const known: readonly string[] =
        leaf.field === "reason" ? KNOWN_REASONS : KNOWN_SUBJECT_TYPES;
      // Values saved through the API that this list does not know stay selectable.
      const options: Option[] = [...new Set([...known, ...leaf.value])].map((value) => ({
        value,
        label: t(`${group}.${value}`, { defaultValue: value }),
      }));
      return (
        <MultiSelect
          ariaLabel={label}
          invalid={invalid}
          onChange={(value) => onChange({ ...leaf, value })}
          options={options}
          values={leaf.value}
        />
      );
    }
    case "state":
      return (
        <MultiSelect
          ariaLabel={label}
          invalid={invalid}
          onChange={(value) => onChange({ ...leaf, value: value as typeof leaf.value })}
          options={SUBJECT_STATES.map((value) => ({ value, label: t(`states.${value}`) }))}
          values={leaf.value}
        />
      );
    case "title":
      return (
        <div className="flex flex-col gap-2">
          <Input
            aria-invalid={invalid || undefined}
            aria-label={label}
            className={leaf.operator.endsWith("regex") ? "font-mono" : undefined}
            onChange={(event) => onChange({ ...leaf, value: event.target.value })}
            spellCheck={false}
            type="text"
            value={leaf.value}
          />
          <div className="flex items-center gap-2">
            <Checkbox
              checked={leaf.caseSensitive ?? false}
              id={caseId}
              onCheckedChange={(checked) => onChange({ ...leaf, caseSensitive: checked === true })}
            />
            <Label className="font-normal text-muted-foreground" htmlFor={caseId}>
              {t("conditions.caseSensitive")}
            </Label>
          </div>
          {invalid && leaf.value && leaf.operator.endsWith("regex") ? (
            <p className="text-destructive-foreground text-xs">{t("conditions.invalidRegex")}</p>
          ) : null}
        </div>
      );
    case "actor_is_bot":
    case "author_is_bot":
      return (
        <SimpleSelect
          ariaLabel={label}
          onChange={(value) => onChange({ ...leaf, value: value === "true" })}
          options={[
            { value: "true", label: t("conditions.boolean.true") },
            { value: "false", label: t("conditions.boolean.false") },
          ]}
          value={leaf.value ? "true" : "false"}
        />
      );
    default:
      return (
        <TagInput
          ariaLabel={label}
          invalid={invalid}
          onChange={(value) => onChange({ ...leaf, value })}
          placeholder={t("conditions.valuesPlaceholder")}
          values={leaf.value}
        />
      );
  }
}

function LeafEditor({
  leaf,
  onChange,
  onRemove,
  showErrors,
}: {
  leaf: ConditionLeaf;
  onChange: (leaf: ConditionLeaf) => void;
  onRemove: () => void;
  showErrors: boolean;
}) {
  const { t } = useTranslation();
  const operators: readonly string[] = FIELD_OPERATORS[leaf.field];
  const invalid = showErrors && !isLeafValid(leaf);
  const hints = [
    HINTED_FIELDS.has(leaf.field) ? t(`conditions.fieldHints.${leaf.field}`) : null,
    PATTERN_FIELDS.has(leaf.field) ? t("conditions.patternHint") : null,
  ].filter(Boolean);

  return (
    <div className="flex min-w-0 flex-col gap-2 max-sm:rounded-lg max-sm:border max-sm:bg-background max-sm:p-2">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,11rem)_minmax(0,11rem)_minmax(0,1fr)_auto] sm:items-start">
        <SimpleSelect<ConditionField>
          ariaLabel={t("conditions.field")}
          onChange={(field) => onChange(defaultLeaf(field))}
          options={CONDITION_FIELDS.map((field) => ({
            value: field,
            label: t(`conditions.fields.${field}`),
          }))}
          value={leaf.field}
        />
        {operators.length > 1 ? (
          <SimpleSelect
            ariaLabel={t("conditions.operator")}
            onChange={(operator) => onChange({ ...leaf, operator } as ConditionLeaf)}
            options={operators.map((operator) => ({
              value: operator,
              label: t(`conditions.operators.${operator}`),
            }))}
            value={leaf.operator}
          />
        ) : (
          <span className="flex h-9 items-center px-1 text-muted-foreground text-sm sm:h-8">
            {t(`conditions.operators.${leaf.operator}`)}
          </span>
        )}
        <LeafValue invalid={invalid} leaf={leaf} onChange={onChange} />
        <Button
          aria-label={t("conditions.removeCondition")}
          onClick={onRemove}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Trash2Icon aria-hidden="true" />
        </Button>
      </div>
      {hints.length > 0 ? <p className="text-muted-foreground text-xs">{hints.join(" ")}</p> : null}
    </div>
  );
}

interface GroupEditorProps {
  group: ConditionGroup;
  onChange: (group: ConditionGroup) => void;
  onRemove?: () => void;
  depth: number;
  showErrors: boolean;
}

function GroupEditor({ group, onChange, onRemove, depth, showErrors }: GroupEditorProps) {
  const { t } = useTranslation();
  const mode = groupMode(group);
  const isRoot = depth === 1;

  const setChild = (index: number, child: Condition) =>
    onChange({ ...group, children: group.children.map((c, i) => (i === index ? child : c)) });
  const removeChild = (index: number) =>
    onChange({ ...group, children: group.children.filter((_, i) => i !== index) });
  const addChild = (child: Condition) =>
    onChange({ ...group, children: [...group.children, child] });

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-3",
        // The root sits directly on the card; only nested groups get a box of their own.
        !isRoot && "rounded-xl border p-2 sm:p-3",
        !isRoot && (depth % 2 === 0 ? "bg-muted/50" : "bg-background"),
        showErrors && group.children.length === 0 && "border-destructive/36",
      )}
    >
      <div className="flex items-center gap-2">
        <SimpleSelect<GroupMode>
          ariaLabel={t("conditions.groupOperator")}
          className="w-auto min-w-0 max-w-full"
          onChange={(next) => {
            const { op, negate } = MODE_GROUP[next];
            onChange({ ...group, op, negate });
          }}
          options={GROUP_MODES.map((value) => ({ value, label: t(`conditions.modes.${value}`) }))}
          size="sm"
          value={mode}
        />
        {onRemove ? (
          <Button
            aria-label={t("conditions.removeGroup")}
            className="ms-auto"
            onClick={onRemove}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <Trash2Icon aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      {/* The rail ties the rows to this group; its colour follows the word that joins them. */}
      <div
        className={cn(
          "grid grid-cols-1 items-start gap-2 border-s-2 ps-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:ps-3",
          JOINER_RAIL[MODE_JOINER[mode]],
        )}
      >
        {group.children.length === 0 ? (
          <p className="text-muted-foreground text-sm sm:col-span-2">
            {t("conditions.emptyGroup")}
          </p>
        ) : (
          group.children.map((child, index) => (
            // oxlint-disable-next-line react/no-array-index-key -- conditions have no identity of their own
            <Fragment key={index}>
              <Connector index={index} mode={mode} />
              {child.type === "group" ? (
                <GroupEditor
                  depth={depth + 1}
                  group={child}
                  onChange={(next) => setChild(index, next)}
                  onRemove={() => removeChild(index)}
                  showErrors={showErrors}
                />
              ) : (
                <LeafEditor
                  leaf={child}
                  onChange={(next) => setChild(index, next)}
                  onRemove={() => removeChild(index)}
                  showErrors={showErrors}
                />
              )}
            </Fragment>
          ))
        )}

        <div className="flex flex-wrap gap-2 sm:col-start-2">
          <Button
            onClick={() => addChild(defaultLeaf("repo"))}
            size="sm"
            type="button"
            variant="outline"
          >
            <PlusIcon aria-hidden="true" />
            {t("conditions.addCondition")}
          </Button>
          {depth < MAX_CONDITION_DEPTH ? (
            <Button
              onClick={() =>
                addChild({
                  type: "group",
                  op: MODE_JOINER[mode] === "and" ? "or" : "and",
                  children: [defaultLeaf("repo")],
                })
              }
              size="sm"
              type="button"
              variant="ghost"
            >
              <FolderPlusIcon aria-hidden="true" />
              {t("conditions.addGroup")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Visual editor for a rule's condition tree. */
export function ConditionEditor({
  value,
  onChange,
  showErrors,
}: {
  value: ConditionGroup;
  onChange: (value: ConditionGroup) => void;
  showErrors: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <ConditionSummary group={value} />
      <GroupEditor depth={1} group={value} onChange={onChange} showErrors={showErrors} />
    </div>
  );
}
