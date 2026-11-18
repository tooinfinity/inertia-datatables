import '@testing-library/jest-dom';
import { vi } from 'vitest';

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
