import { describe, it, expect, vi, beforeEach } from 'vitest';
import http from 'http';

const mockExchangeCode = vi.fn().mockResolvedValue(undefined);
vi.mock('../oauth.js', () => ({
  exchangeCode: (code: string) => mockExchangeCode(code),
}));

vi.mock('../../constants.js', () => ({ OAUTH_CALLBACK_PORT: 9999 }));

let capturedListener: ((req: http.IncomingMessage, res: http.ServerResponse) => void) | null = null;
let capturedErrorListener: ((err: Error) => void) | null = null;
let listenResolveImmediately = true;
const mockListen = vi.fn().mockImplementation(function (this: http.Server, port: number, host: string, cb?: () => void) {
  if (listenResolveImmediately) setImmediate(() => cb?.());
  return this;
});
const mockClose = vi.fn();
const mockCreateServer = vi.fn().mockImplementation((handler: (req: http.IncomingMessage, res: http.ServerResponse) => void) => {
  capturedListener = handler;
  capturedErrorListener = null;
  return {
    listen: mockListen,
    close: mockClose,
    on: vi.fn((event: string, cb: (err: Error) => void) => {
      if (event === 'error') capturedErrorListener = cb;
    }),
  };
});

vi.mock('http', () => ({
  default: {
    createServer: (handler: (req: http.IncomingMessage, res: http.ServerResponse) => void) => mockCreateServer(handler),
  },
}));

describe('callback', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    capturedListener = null;
    capturedErrorListener = null;
    listenResolveImmediately = true;
    const { stopCallbackServer } = await import('../callback.js');
    stopCallbackServer();
  });

  it('startCallbackServer resolves when server listens', async () => {
    const { startCallbackServer } = await import('../callback.js');
    await expect(startCallbackServer()).resolves.toBeUndefined();
    expect(mockCreateServer).toHaveBeenCalled();
    expect(mockListen).toHaveBeenCalledWith(9999, '127.0.0.1', expect.any(Function));
  });

  it('startCallbackServer resolves immediately when server already running', async () => {
    const { startCallbackServer } = await import('../callback.js');
    await startCallbackServer();
    const callCount = mockCreateServer.mock.calls.length;
    await startCallbackServer();
    expect(mockCreateServer.mock.calls.length).toBe(callCount);
  });

  it('getAuthStatus returns complete false and error null initially', async () => {
    const { getAuthStatus } = await import('../callback.js');
    expect(getAuthStatus()).toEqual({ complete: false, error: null });
  });

  it('request to /callback with error param returns 400 and stops server', async () => {
    const { startCallbackServer } = await import('../callback.js');
    await startCallbackServer();
    expect(capturedListener).not.toBeNull();

    const req = {
      url: '/callback?error=access_denied',
    } as http.IncomingMessage;
    const res = {
      writeHead: vi.fn(),
      end: vi.fn(),
    } as unknown as http.ServerResponse;

    capturedListener!(req, res);
    await new Promise((r) => setImmediate(r));

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    expect(res.end).toHaveBeenCalled();
    expect(mockExchangeCode).not.toHaveBeenCalled();
  });

  it('request to /callback with code exchanges and returns 200', async () => {
    const { startCallbackServer } = await import('../callback.js');
    await startCallbackServer();
    expect(capturedListener).not.toBeNull();

    const req = {
      url: '/callback?code=auth-code-123',
    } as http.IncomingMessage;
    const res = {
      writeHead: vi.fn(),
      end: vi.fn(),
    } as unknown as http.ServerResponse;

    capturedListener!(req, res);
    await new Promise((r) => setImmediate(r));

    expect(mockExchangeCode).toHaveBeenCalledWith('auth-code-123');
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(res.end).toHaveBeenCalledWith(expect.stringContaining('Authorization Successful'));
  });

  it('request to /callback with no code returns 400', async () => {
    const { startCallbackServer } = await import('../callback.js');
    await startCallbackServer();

    const req = { url: '/callback' } as http.IncomingMessage;
    const res = {
      writeHead: vi.fn(),
      end: vi.fn(),
    } as unknown as http.ServerResponse;

    capturedListener!(req, res);
    await new Promise((r) => setImmediate(r));

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    expect(res.end).toHaveBeenCalledWith(expect.stringContaining('No authorization code'));
    expect(mockExchangeCode).not.toHaveBeenCalled();
  });

  it('request to /callback when exchangeCode throws returns 500', async () => {
    mockExchangeCode.mockRejectedValueOnce(new Error('Token exchange failed'));
    const { startCallbackServer } = await import('../callback.js');
    await startCallbackServer();

    const req = { url: '/callback?code=bad-code' } as http.IncomingMessage;
    const res = {
      writeHead: vi.fn(),
      end: vi.fn(),
    } as unknown as http.ServerResponse;

    capturedListener!(req, res);
    await new Promise((r) => setImmediate(r));

    expect(res.writeHead).toHaveBeenCalledWith(500, expect.any(Object));
    expect(res.end).toHaveBeenCalledWith(expect.stringContaining('Token exchange failed'));
  });

  it('request to non-/callback returns 404', async () => {
    const { startCallbackServer } = await import('../callback.js');
    await startCallbackServer();

    const req = { url: '/other' } as http.IncomingMessage;
    const res = {
      writeHead: vi.fn(),
      end: vi.fn(),
    } as unknown as http.ServerResponse;

    capturedListener!(req, res);

    expect(res.writeHead).toHaveBeenCalledWith(404);
    expect(res.end).toHaveBeenCalledWith('Not found');
  });

  it('stopCallbackServer closes server', async () => {
    const { startCallbackServer, stopCallbackServer } = await import('../callback.js');
    await startCallbackServer();
    stopCallbackServer();
    expect(mockClose).toHaveBeenCalled();
  });

  it('rejects when server emits error', async () => {
    listenResolveImmediately = false;
    const { startCallbackServer } = await import('../callback.js');
    const promise = startCallbackServer();
    await new Promise((r) => setImmediate(r));
    expect(capturedErrorListener).not.toBeNull();
    capturedErrorListener!(new Error('EADDRINUSE'));
    await expect(promise).rejects.toThrow('Failed to start callback server');
  });
});
