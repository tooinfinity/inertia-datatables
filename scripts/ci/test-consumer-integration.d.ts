export const CONSUMER_CUSTOM_BUTTON_CONTENT: string;

export function checkNetworkAvailability(timeoutMs?: number): Promise<boolean>;

export function createConsumerFixture(baseDir: string): Promise<void>;

export function runShadcnAdd(
    cwd: string,
    itemAddress?: string,
    options?: { timeoutMs?: number }
): Promise<{ code: number | null; stdout: string; stderr: string }>;

export function assertInstalledConsumer(baseDir: string): Promise<boolean>;

export function testConsumerIntegration(options?: {
    requireNetwork?: boolean;
    timeoutMs?: number;
}): Promise<{ ok: boolean; skipped: boolean; reason?: string }>;

export function isDirectExecution(metaUrl: string): boolean;
