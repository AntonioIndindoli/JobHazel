/** Build-time configuration only: never accept extension IDs from page URLs. */
export function getJobHazelExtensionId(): string | null {
  const value = process.env.NEXT_PUBLIC_JOBHAZEL_EXTENSION_ID?.trim();
  return value && /^[a-p]{32}$/.test(value) ? value : null;
}
