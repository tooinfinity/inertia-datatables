import '@testing-library/jest-dom';
import { afterEach, beforeEach, vi } from 'vitest';

Object.defineProperty(window, 'location', {
    value: {
        pathname: '/',
        search: '',
        href: 'http://localhost/',
        origin: 'http://localhost',
        protocol: 'http:',
        host: 'localhost',
        hostname: 'localhost',
        port: '',
    },
    writable: true,
});

vi.mock('@inertiajs/react', () => ({
    router: {
        visit: vi.fn(),
    },
    usePage: () => ({
        props: {},
    }),
}));

// Console-error guard: fail tests that emit unexpected console.error output.
// Third-party (shadcn/ui) React warnings about unknown DOM props are
// allow-listed because they come from upstream components we don't control.
const ALLOWED_ERROR_SUBSTRINGS = ['asChild', 'sideOffset'];

let capturedErrors: string[] = [];

beforeEach(() => {
    capturedErrors = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
        capturedErrors.push(args.map(String).join(' '));
    });
});

afterEach(() => {
    const unexpected = capturedErrors.filter(
        (msg) =>
            !ALLOWED_ERROR_SUBSTRINGS.some((sub) => msg.includes(sub))
    );
    vi.restoreAllMocks();
    if (unexpected.length > 0) {
        throw new Error(`Unexpected console.error output:\n${unexpected.join('\n')}`);
    }
});
