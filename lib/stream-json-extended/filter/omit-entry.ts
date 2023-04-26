import { type TransformOptions } from 'node:stream';

import { chain } from 'stream-chain';

import {
  packEntry,
  type JsonToken,
  type JsonSparseEntryToken
} from 'multiverse/stream-json-extended';

/**
 * Filters through a {@link JsonToken} stream discarding object entries with
 * keys that satisfy any of the conditions given by `key`.
 *
 * This filter is like
 * [`Ignore`](https://github.com/uhop/stream-json/wiki/Ignore) except it does
 * not require entry keys to be packed and its interface is more flexible.
 */
export function omitEntry({
  key,
  pathSeparator = '.',
  ...transformOptions
}: TransformOptions & {
  /**
   * The key of the entry to omit. This parameter can be either a singular
   * string or regular expression or an array of strings / regular expressions
   * each representing the key of one or more entries.
   *
   * Specifying `N` keys will result in anywhere from `0 to N` keys and their
   * values being removed from the token stream.
   *
   * `key` will be compared against the entire key path, with each key separated
   * by `pathSeparator`. For example, the entry `b: 1` in `[{a: {b: 1}}]` would
   * be matched by a `key` of `0.a.b` or `/^0\.a\.b$/`.
   */
  key: string | RegExp | (string | RegExp)[];
  /**
   * A string that separates stack values when it is converted to a string.
   */
  pathSeparator?: string;
}) {
  const ownerSymbol = Symbol('owner-symbol');

  return chain(
    [
      packEntry({
        key,
        pathSeparator,
        ownerSymbol,
        discardComponentTokens: true,
        sparseMode: true
      }),
      (chunk: JsonToken | JsonSparseEntryToken) => {
        // ? Discard any packed entry tokens that we own
        return typeof chunk.name !== 'string' && chunk.owner === ownerSymbol
          ? null
          : chunk;
      }
    ],
    { ...transformOptions, objectMode: true }
  );
}
