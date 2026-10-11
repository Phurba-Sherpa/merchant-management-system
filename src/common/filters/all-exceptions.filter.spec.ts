import { BadRequestException, ArgumentsHost, HttpStatus } from '@nestjs/common';
import {
  AllExceptionsFilter,
  ErrorResponsePayload,
} from './all-exceptions.filter';
import { Request, Response } from 'express';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockStatus: jest.Mock;
  let mockJson: jest.Mock;
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });

    const mockResponse = {
      status: mockStatus,
    } as unknown as Response;

    const mockRequest = {
      url: '/test/path',
      method: 'POST',
    } as unknown as Request;

    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as unknown as ArgumentsHost;
  });

  it('formats BadRequestException into consistent JSON structure', () => {
    const exception = new BadRequestException('Validation failed');
    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    const sent = (mockJson.mock.calls as [[ErrorResponsePayload]])[0][0];
    expect(sent.statusCode).toBe(400);
    expect(sent.error).toBe('Bad Request');
    expect(sent.message).toBe('Validation failed');
    expect(sent.path).toBe('/test/path');
    expect(typeof sent.timestamp).toBe('string');
  });

  it('maps Postgres unique violation (23505) to 409 Conflict', () => {
    const pgError = {
      code: '23505',
      detail: 'Key (email)=(test@example.com) already exists.',
    };

    filter.catch(pgError, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    const sent = (mockJson.mock.calls as [[ErrorResponsePayload]])[0][0];
    expect(sent.statusCode).toBe(409);
    expect(sent.error).toBe('Conflict');
    expect(sent.message).toBe('Resource already exists');
    expect(sent.path).toBe('/test/path');
    expect(typeof sent.timestamp).toBe('string');
    expect('detail' in sent).toBe(false);
  });

  it('masks unhandled errors with 500 without leaking internals', () => {
    const internalError = new Error(
      'SELECT * FROM users WHERE password_leak_syntax_error',
    );
    filter.catch(internalError, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    const sent = (mockJson.mock.calls as [[ErrorResponsePayload]])[0][0];
    expect(sent.statusCode).toBe(500);
    expect(sent.error).toBe('Internal Server Error');
    expect(sent.message).toBe('Internal server error');
    expect(sent.path).toBe('/test/path');

    expect(JSON.stringify(sent)).not.toContain('SELECT');
    expect(JSON.stringify(sent)).not.toContain('password_leak');
  });
});
