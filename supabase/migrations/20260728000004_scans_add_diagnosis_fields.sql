-- Add diagnosis-detail columns populated by the analyze-crop Edge Function.
-- treatment_steps stores the ordered list of remediation actions as a text array.
-- severity mirrors the DiagnosisResult schema returned by Gemini.

alter table public.scans
  add column if not exists treatment_steps text[] not null default '{}',
  add column if not exists severity        text    check (severity in ('low', 'medium', 'high'));

comment on column public.scans.treatment_steps is
  'Ordered list of treatment / prevention steps returned by Gemini. Empty until analyzed.';
comment on column public.scans.severity is
  'Disease severity: low (cosmetic), medium (yield impact), high (crop-loss risk). Null until analyzed.';
