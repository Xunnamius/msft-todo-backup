import { isNativeError } from 'node:util/types';

import isDeepSubset from 'lodash.ismatch';
import { chain } from 'stream-chain';

import {
  packEntry,
  packedEntrySymbol,
  useDepthTracking,
  type JsonToken,
  type JsonPackedEntryToken
} from 'multiverse/stream-json-extended';

import { makeSafeCallback } from 'multiverse/make-safe-callback';

import type { JsonValue } from 'type-fest';
import {
  createInflationStream,
  type NodeStyleCallback,
  type InflationStreamOptions
} from 'multiverse/create-inflation-stream';

/**
 * A predicate function representing an object entry (key-value) filter
 * condition used to determine if the object containing the entry will be
 * allowed through the sieve or if it will potentially be discarded.
 *
 * Return `true` to ensure the object will pass through the sieve.
 */
export type SieveFunction = (value: JsonValue) => boolean;

/**
 * Filters through a {@link JsonToken} stream discarding objects that do not
 * satisfy any of the conditions given by `filter`. On the other hand, objects
 * that satisfy _one or more_ conditions will not be discarded and will instead
 * pass through the sieve.
 *
 * This is a lighter, more flexible, and more performant version of
 * `StreamValues -> customFilterStream -> Disassembler`.
 *
 * `objectSieve` assumes that a token stream represents subsequent _non-array
 * object_ values being streamed one by one, such as a token stream generated by
 * the `pick` or `selectEntry` filters.
 *
 * Any non-objects encountered in the token stream will pass through the stream
 * untouched, including arrays.
 *
 * Warning: there are memory implications to using `objectSieve`. Namely: _in
 * the worst case_, all tokens associated with an object will be buffered
 * (delayed) until the entire object has been seen. This means, _in the worst
 * case_, the entire contents of each individual object will exist in memory
 * simultaneously (which matches the memory requirements of `StreamValues`).
 * This can be avoided entirely by ensuring the entries inspected by `filter`
 * are the very first entries in the object, or by passing memory-efficient
 * subsets of your objects through the sieve.
 */
export function objectSieve({
  filter,
  pathSeparator = '.',
  ...transformOptions
}: InflationStreamOptions & {
  /**
   * Objects in the {@link JsonToken} stream lacking entries that match at least
   * one of the provided key-value pairs will have its constituent tokens
   * discarded.
   *
   * Note that `filter` keys and values are matched in FILO order, meaning
   * `filter`s like the following will never capture objects with `name ===
   * 'object-4'`:
   *
   * ```javascript
   *  objectSieve({
   *    filter: [['name', 'object-3'], ['name', 'object-4']]
   *  })
   * ```
   *
   * ```javascript
   *  objectSieve({
   *    filter: [[/^.*$/, 'object-3'], ['name', 'object-4']]
   *  })
   * ```
   *
   * Instead, to match multiple possible values for the same key, use a
   * {@link SieveFunction} like so:
   *
   * ```javascript
   *  objectSieve({
   *    filter: [
   *      [
   *        'name',
   *        (value) => {
   *          return value === 'object-3' || value === 'object-4';
   *        }
   *      ]
   *    ]
   *  })
   * ```
   *
   * See {@link packEntry} for more details on how keys provided to `filter` are
   * handled.
   */
  filter: [key: string | RegExp, value: JsonValue | SieveFunction][];
  /**
   * A string that separates stack values when it is converted to a string.
   */
  pathSeparator?: string;
}) {
  const { getDepth, updateDepth } = useDepthTracking();
  const tokenBuffer: (JsonToken | JsonPackedEntryToken)[] = [];
  const ownerSymbol = Symbol('owner');

  let isDiscarding = false;
  let isReleasing = true;

  const discardBuffer = function () {
    if (tokenBuffer.length) {
      // ? Making sure the objects in the array are garbage collected
      tokenBuffer.splice(0, tokenBuffer.length);
    }
  };

  return chain(
    [
      packEntry({ key: filter.map(([key]) => key), ownerSymbol, pathSeparator }),
      createInflationStream({
        ...transformOptions,
        objectMode: true,
        transform(chunk: JsonToken | JsonPackedEntryToken, _encoding, callback_) {
          const safeCallback = makeSafeCallback(callback_);

          try {
            updateDepth(chunk as JsonToken);

            const isOwnPackedEntry =
              chunk.name === packedEntrySymbol && chunk.owner === ownerSymbol;

            const isStartOfRootObject = getDepth() === 1 && chunk.name === 'startObject';
            const isEndOfRootObject = getDepth() === 0 && chunk.name === 'endObject';

            const finish: NodeStyleCallback = (error) => {
              if (error) {
                safeCallback(error);
              } else {
                if (!isDiscarding && !isReleasing) {
                  // ? Since we're current undecided on if we're letting this object
                  // ? through the sieve or not, let's attempt to make a decision.

                  if (isOwnPackedEntry) {
                    const entryFilter = filter.find(([key]) => key === chunk.matcher);

                    if (entryFilter) {
                      const [, entryValueFilter] = entryFilter;

                      const passesValueFilterFn =
                        typeof entryValueFilter === 'function' &&
                        entryValueFilter(chunk.value);

                      const isADeepSubset =
                        chunk.value !== null &&
                        entryValueFilter !== null &&
                        typeof chunk.value === 'object' &&
                        typeof entryValueFilter === 'object' &&
                        isDeepSubset(chunk.value, entryValueFilter);

                      if (
                        chunk.value === entryValueFilter ||
                        passesValueFilterFn ||
                        isADeepSubset
                      ) {
                        // ? This filter matched! Send the current root object
                        // ? downstream.
                        isReleasing = true;
                      } else if (
                        filter.length === 1 &&
                        typeof filter[0][0] === 'string'
                      ) {
                        // * Optimization
                        // ? This filter did not match. Since this is the only
                        // ? filter that could have matched this entry key (filter
                        // ? key is not a regular expression), start discarding the
                        // ? current root object immediately.
                        isDiscarding = true;
                      }
                    }
                  } else {
                    // ? We're still undecided. Try to make a decision later.
                    tokenBuffer.push(chunk);
                  }
                }

                if (isEndOfRootObject) {
                  // ? We've reached the end of a root object. Prepare to accept and
                  // ? potentially release the next token.
                  isDiscarding = false;
                  isReleasing = true;
                }

                safeCallback(null);
              }
            };

            if (isStartOfRootObject) {
              isDiscarding = false;
              isReleasing = false;
            } else if (!isDiscarding && !isReleasing && isEndOfRootObject) {
              // ? We've reached the end of a root object without deciding to
              // ? release it or discard it, so discard it.
              isDiscarding = true;
            }

            if (isDiscarding) {
              discardBuffer();
            } else if (isReleasing) {
              if (!isOwnPackedEntry) {
                tokenBuffer.push(chunk);
              }

              // ? Release the buffer contents downstream
              return this.pushMany(tokenBuffer, (error) => {
                discardBuffer();
                finish(error);
              });
            }

            finish(null);
          } catch (error) {
            safeCallback(isNativeError(error) ? error : new Error(String(error)));
          }
        }
      })
    ],
    { ...transformOptions, objectMode: true }
  );
}
