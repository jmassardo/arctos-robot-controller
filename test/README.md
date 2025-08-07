# Tests

This directory contains backend tests for the Arctos Robot Controller.

## Running Tests

To run all tests:
```bash
npm test
```

## Test Files

- `basic.test.js` - Basic smoke tests to ensure the server and configuration are valid
- `mks57d.test.js` - MKS57D library functionality tests (class instantiation, conversion methods, G-code parsing)
- `mks42d.test.js` - MKS42D library functionality tests (controller operations, G-code translation, error handling)
- `server-api.test.js` - Server configuration and API structure validation tests

## Adding New Tests

Add new test files with the `.test.js` extension in this directory. The test runner will automatically discover and run them.

Tests use Node.js built-in test runner (available in Node.js 16+).