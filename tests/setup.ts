/**
 * Jest test setup file
 * Runs before each test file
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.AWS_REGION = 'us-east-1';
process.env.S3_BUCKET = 'test-bucket';

// Mock console to reduce noise in tests (optional)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
// };

// Add custom matchers if needed
expect.extend({
  toBeValidRunId(received: string) {
    const runIdPattern = /^\d{8}_\d{6}_[a-zA-Z0-9_-]+$/;
    const pass = runIdPattern.test(received);

    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid RunId`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to match RunId format YYYYMMDD_HHMMSS_nanoid`,
        pass: false,
      };
    }
  },
});

// Extend Jest matchers types
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidRunId(): R;
    }
  }
}
