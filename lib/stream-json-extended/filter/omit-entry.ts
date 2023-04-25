import { type TransformOptions } from 'node:stream';

import { chain } from 'stream-chain';

import {
  packEntry,
  type JsonToken,
  type JsonPackedEntryToken,
  packedEntrySymbol
} from 'multiverse/stream-json-extended';

export function omitEntry({
  key,
  pathSeparator = '.',
  ...transformOptions
}: TransformOptions & {
  /**
   * The key of the entry to omit. This parameter can be
   * either a singular string or regular expression or an array of strings /
   * regular expressions each representing the key of one or more entries.
   *
   * Specifying `N` keys will result in anywhere from `0 to N` keys and their
   * values being removed from the token stream.
   *
   * `key` will be compared against the entire key path, with each key separated
   * by `pathSeparator`. For example, `b: 1` in `[{a: {b: 1}}]` would be matched
   * by a `key` of `0.a.b` or `/^0\.a\.b$/`.
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
      packEntry({ key, pathSeparator, ownerSymbol, discardComponentTokens: true }),
      (chunk: JsonToken | JsonPackedEntryToken) => {
        // ? Discard any packed entries that we own
        return chunk.name === packedEntrySymbol && chunk.owner === ownerSymbol
          ? null
          : chunk;
      }
    ],
    { ...transformOptions, objectMode: true }
  );
}
