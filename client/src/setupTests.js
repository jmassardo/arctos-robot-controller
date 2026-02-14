// jest-dom adds custom jest matchers for asserting on DOM nodes.
import '@testing-library/jest-dom';

// Mock Socket.IO client for testing
jest.mock('socket.io-client', () => {
  const mockSocket = {
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    connected: true,
    disconnect: jest.fn(),
  };
  return jest.fn(() => mockSocket);
});

// Mock window.alert and window.confirm for testing
global.alert = jest.fn();
global.confirm = jest.fn(() => true);

// Setup mock for IntersectionObserver
global.IntersectionObserver = jest.fn(() => ({
  observe: jest.fn(),
  disconnect: jest.fn(),
  unobserve: jest.fn(),
}));
