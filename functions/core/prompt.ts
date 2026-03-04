/**
 * Standard prompt builders for skills. Keeps request formatting consistent.
 */

/**
 * Build a standard "# Request" section with the payload as JSON.
 * Use for content-based skills (runWithContent) or when the full request is the context.
 */
export function buildRequestPrompt(request: unknown): string {
    return [
        "# Request",
        "",
        "```json",
        JSON.stringify(request, null, 2),
        "```",
    ].join("\n");
}
