type McpToolResult = { content: [{ type: "text"; text: string }] };

export interface DryRunPreview {
  dry_run: true;
  action: string;
  endpoint: string;
  would_affect: Record<string, unknown>;
}

export function isDryRun(params: { dry_run?: boolean }): boolean {
  return params.dry_run !== false;
}

export function buildDryRunResult(preview: {
  action: string;
  endpoint: string;
  would_affect: Record<string, unknown>;
}): McpToolResult {
  const data: DryRunPreview = { dry_run: true, ...preview };
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
