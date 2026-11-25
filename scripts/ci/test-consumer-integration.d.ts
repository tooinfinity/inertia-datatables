export const CONSUMER_CUSTOM_BUTTON_CONTENT: string;
export const DEFAULT_CONSUMER_ALIASES: Record<string, string>;
export const DEFAULT_TS_PATHS: Record<string, string[]>;

export function checkNetworkAvailability(timeoutMs?: number): Promise<boolean>;

export function createConsumerFixture(
    baseDir: string,
    fixtureOptions?: {
        aliases?: Record<string, string>;
        tsPaths?: Record<string, string[]>;
        uiDirRelative?: string;
    }
): Promise<void>;

export function runShadcnAdd(
    cwd: string,
    itemAddress?: string,
    options?: { timeoutMs?: number }
): Promise<{ code: number | null; stdout: string; stderr: string }>;

export function assertInstalledConsumer(
    baseDir: string,
    fixtureOptions?: {
        componentsDirRelative?: string;
        uiDirRelative?: string;
    }
): Promise<boolean>;

export function testConsumerIntegration(options?: {
    requireNetwork?: boolean;
    timeoutMs?: number;
    networkCheck?: () => Promise<boolean>;
}): Promise<{ ok: boolean; skipped: boolean; reason?: string }>;

export function isDirectExecution(metaUrl: string): boolean;
