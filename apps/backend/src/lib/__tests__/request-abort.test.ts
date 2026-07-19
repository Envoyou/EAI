import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import { describe, expect, test } from 'vitest';
import { bindResponseAbort } from '../request-abort';

describe('bindResponseAbort', () => {
  test('aborts provider work when the HTTP response closes early', () => {
    const response = new EventEmitter() as EventEmitter & { writableEnded: boolean };
    response.writableEnded = false;
    const binding = bindResponseAbort(response as unknown as Response, 'Test request');

    response.emit('close');

    expect(binding.signal.aborted).toBe(true);
    expect(binding.isDisconnected()).toBe(true);
  });

  test('does not abort after a normally completed response', () => {
    const response = new EventEmitter() as EventEmitter & { writableEnded: boolean };
    response.writableEnded = true;
    const binding = bindResponseAbort(response as unknown as Response, 'Test request');

    response.emit('finish');
    response.emit('close');

    expect(binding.signal.aborted).toBe(false);
  });
});
