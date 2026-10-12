// Runs before every web test file: adds matchers like `toBeInTheDocument()` and cleans up between tests.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());
