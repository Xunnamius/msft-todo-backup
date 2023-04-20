import type { Writable } from 'node:stream';

/**
 * Ensure the provided node stream `callback` function is never called more than
 * once.
 */
export function makeSafeCallback(
  /**
   * The callback function to protect.
   */
  callback: NonNullable<Parameters<Writable['write']>[2]>
) {
  let calledCallback = false;
  return function (...parameters: Parameters<typeof callback>) {
    if (calledCallback) {
      const [error] = parameters;
      if (error !== null) {
        // eslint-disable-next-line no-console
        console.error(
          'unhandled internal stream error while suppressing attempt to execute callback multiple times:',
          error
        );
      } else {
        // eslint-disable-next-line no-console
        console.error('suppressed attempt to execute callback multiple times');
      }
    } else {
      calledCallback = true;
      callback(...parameters);
    }
  };
}
