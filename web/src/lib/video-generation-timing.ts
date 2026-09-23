export function generationDurationMs(submittedAt: number, completedAt = Date.now()) {
    return Math.max(0, completedAt - submittedAt);
}
