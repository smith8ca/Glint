import { logger } from '../logger';

// Keep test output readable: the app logs JSON to stdout at `info` by default.
// Tests that assert on logging mock the logger module instead.
logger.level = 'silent';
