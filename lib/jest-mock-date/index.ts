/**
 * The mock Date.now() value returned after calling `useMockDateNow`.
 */
export const mockDateNowMs = Date.now();

/**
 * Sets up a Jest spy on the `Date` object's `now` method such that it returns
 * `mockNow` or `mockDateNowMs` (default) rather than the actual date. If you
 * want to restore the mock, you will have to do so manually (or use Jest
 * configuration to do so automatically).
 *
 * This is useful when testing against/playing with dummy data containing values
 * derived from the current time (i.e. unix epoch).
 */
export function useMockDateNow(options?: { mockNow?: number }) {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockImplementation(() => options?.mockNow || mockDateNowMs);
  });
}
