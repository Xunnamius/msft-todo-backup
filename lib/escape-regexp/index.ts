/**
 * Escape a string for use in `new RegExp(...)`.
 *
 * See
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions#escaping
 * for implementation details.
 */
export function escapeRegExp(regexp: string) {
  // eslint-disable-next-line unicorn/better-regex
  return regexp.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // $& means the whole matched string
}
