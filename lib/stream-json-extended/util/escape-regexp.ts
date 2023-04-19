// * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions#escaping
export function escapeRegExp(regexp: string) {
  // eslint-disable-next-line unicorn/better-regex
  return regexp.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // $& means the whole matched string
}
