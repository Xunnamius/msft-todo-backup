import { chain } from 'stream-chain';

import {
  packEntry,
  useDepthTracking,
  sparseEntryValueStartSymbol,
  sparseEntryValueEndSymbol,
  type JsonToken,
  type JsonSparseEntryToken
} from 'multiverse/stream-json-extended';

import type { TransformOptions } from 'node:stream';

/**
 * Pick an object entry's value out of the stream and discard the rest of the
 * object. If the selected value is a non-array object (or primitive), its
 * tokens will be streamed as is. If the selected value is an array, each of its
 * elements' tokens will be streamed out one by one; that is: the enclosing
 * array is discarded unless `discardEnclosingArray` is `false`.
 *
 * Regardless of the type of the selected value, this stream will output object
 * value _tokens_ similar in intent to `StreamValues`.
 *
 * This filter is like [`Pick`](https://github.com/uhop/stream-json/wiki/Pick)
 * except it does not require entry keys to be packed, its interface is more
 * flexible, and its output is more useful.
 */
export function selectEntry({
  key,
  pathSeparator = '.',
  discardEnclosingArray = true,
  ...transformOptions
}: TransformOptions & {
  /**
   * The key of the entry to select. This parameter can be either a singular
   * string or regular expression or an array of strings / regular expressions
   * each representing the key of one or more entries that should be selected.
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
  /**
   * If `true` and the selected value is an array, each of its elements' tokens
   * will be streamed out one by one (the enclosing array's tokens will be
   * discarded). If `false` and the selected value is an array, the enclosing
   * array's tokens will pass through untouched.
   *
   * @default true
   */
  discardEnclosingArray?: boolean;
}) {
  const { getDepth, updateDepth } = useDepthTracking();

  const ownerSymbol = Symbol('owner-symbol');
  let discarding = true;

  return chain(
    [
      packEntry({
        key,
        pathSeparator,
        ownerSymbol,
        sparseMode: true
      }),
      // ? Discard everything that isn't a "packed" entry we own
      (chunk: JsonToken | JsonSparseEntryToken) => {
        if (chunk.name === sparseEntryValueStartSymbol && chunk.owner === ownerSymbol) {
          discarding = false;
        }

        if (chunk.name === sparseEntryValueEndSymbol && chunk.owner === ownerSymbol) {
          discarding = true;
        }

        if (!discarding && typeof chunk.name === 'string') {
          if (discardEnclosingArray) {
            updateDepth(chunk);
            const depth = getDepth();
            return (depth === 1 && chunk.name === 'startArray') ||
              (depth === 0 && chunk.name === 'endArray')
              ? null
              : chunk;
          } else {
            return chunk;
          }
        }

        return null;
      }
    ],
    { ...transformOptions, objectMode: true }
  );
}
