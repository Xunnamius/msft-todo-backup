import type { Writable } from 'node:stream';

/**
 * Ensure the provided node stream `callback` function is never called more than
 * once. This function is a slight improvement upon the default Node
 * functionality at the time of writing with respect to more detailed error
 * reporting.
 */
export function makeSafeCallback(
  /**
   * The callback function to protect.
   */
  callback: NonNullable<Parameters<Writable['write']>[2]>,
  options?: {
    /**
     * If `false`, along with logging extra information on the extraneous call
     * to the console, the extraneous call will be allowed to happen. If `true`,
     * the extra function call will be ignored.
     *
     * @default false
     */
    suppressExtraneousCalls?: boolean;
  }
) {
  let calledCallback = false;
  const { suppressExtraneousCalls } = options || {};

  return function (...parameters: Parameters<typeof callback>) {
    if (calledCallback) {
      const [error] = parameters;
      if (error !== null) {
        // eslint-disable-next-line no-console
        console.error(
          `unhandled internal stream error occurred while ${
            suppressExtraneousCalls
              ? 'suppressing attempt to illegally invoke'
              : 'illegally invoking'
          } callback multiple times:`,
          error
        );
      } else {
        // eslint-disable-next-line no-console
        console.error(
          `${
            suppressExtraneousCalls
              ? 'suppressed attempt to illegally invoke'
              : 'illegally invoked'
          } callback multiple times`
        );

        const stack = new Error('dummy').stack;

        if (stack) {
          // eslint-disable-next-line no-console
          console.error(stack.split('\n').slice(2).join('\n'));
        }
      }
    }

    if (!calledCallback || !suppressExtraneousCalls) {
      calledCallback = true;
      callback(...parameters);
    }
  };
}
