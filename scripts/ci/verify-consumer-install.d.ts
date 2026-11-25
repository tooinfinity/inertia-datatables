export const EXPECTED_DATA_TABLE_FILES: string[];
export const EXPECTED_REGISTRY_DEPENDENCIES: string[];
export const EXPECTED_NPM_DEPENDENCIES: string[];

export function verifyGitHubRegistryAddress(addressString?: string): {
    scheme: string;
    owner: string;
    repo: string;
    item: string;
    ref?: string;
};

export function verifyRegistryItemStructure(registryItemPath?: string): Promise<Record<string, unknown>>;

export function verifyConsumerProjectResolution(
    itemPath?: string,
    consumerConfig?: Record<string, unknown>
): Promise<Record<string, unknown>>;

export function main(): Promise<{ ok: boolean }>;
