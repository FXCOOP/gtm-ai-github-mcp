import { z } from "zod";

export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const MAX_DAILY_MARKDOWN = 50_000;
export const MAX_TREND_LOG_MARKDOWN = 200_000;

const dailyIndexEntry = z
  .object({ date: z.string() })
  .passthrough();

export const updateInputSchema = z
  .object({
    date: z
      .string()
      .regex(DATE_REGEX, "date must match YYYY-MM-DD"),
    latestJson: z
      .object({ date: z.string() })
      .passthrough(),
    dailyIndexJson: z.array(dailyIndexEntry).min(1, "dailyIndexJson must contain at least one entry"),
    dailyMarkdown: z
      .string()
      .min(1, "dailyMarkdown must be a non-empty string")
      .max(MAX_DAILY_MARKDOWN, `dailyMarkdown must be at most ${MAX_DAILY_MARKDOWN} characters`),
    trendLogMarkdown: z
      .string()
      .min(1, "trendLogMarkdown must be a non-empty string")
      .max(MAX_TREND_LOG_MARKDOWN, `trendLogMarkdown must be at most ${MAX_TREND_LOG_MARKDOWN} characters`),
    commitMessage: z.string().min(1).max(200).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.latestJson.date !== value.date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["latestJson", "date"],
        message: `latestJson.date must equal date (${value.date})`,
      });
    }
    const hasEntry = value.dailyIndexJson.some((entry) => entry.date === value.date);
    if (!hasEntry) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dailyIndexJson"],
        message: `dailyIndexJson must include an entry for date ${value.date}`,
      });
    }
  });

export type UpdateInput = z.infer<typeof updateInputSchema>;

export function allowedPathsForDate(date: string): readonly string[] {
  return [
    "public/data/latest.json",
    "public/data/daily-index.json",
    `reports/daily/${date}.md`,
    "reports/trend-log.md",
  ] as const;
}

export function isAllowedPath(path: string, date: string): boolean {
  return allowedPathsForDate(date).includes(path);
}
