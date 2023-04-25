import { Transform, type TransformOptions } from 'node:stream';
import { isNativeError } from 'node:util/types';

import isDeepSubset from 'lodash.ismatch';
import { chain } from 'stream-chain';

import {
  type JsonToken,
  packEntry,
  type JsonPackedEntryToken,
  packedEntrySymbol,
  useDepthTracking
} from 'multiverse/stream-json-extended';

import { makeSafeCallback } from 'multiverse/stream-json-extended/util/make-safe-callback';

import type { JsonValue } from 'type-fest';

/**
 * A predicate function representing an object entry (key-value) filter
 * condition used to determine if the object the entry belongs to will be
 * allowed through the sieve or if it will potentially get discarded.
 *
 * Return `true` to ensure the object will pass through the sieve.
 */
export type SieveFunction = (value: JsonValue) => boolean;

/**
 * Filters through a {@link JsonToken} stream discarding objects that do not
 * satisfy any of the conditions given by `filter`. On the other hand, objects
 * that satisfy one or more conditions will not be discarded and will instead
 * pass through the sieve.
 *
 * This is a lighter, more flexible, and more performant version of
 * `StreamValues -> customFilterStream -> Disassembler`.
 *
 * `objectSieve` assumes that a token stream represents subsequent _non-array
 * object_ values being streamed one by one, such as a token stream generated by
 * the `pick` or `selectOne` filters.
 *
 * Any non-objects encountered in the tokens stream will pass through the stream
 * untouched, including arrays.
 *
 * Warning: there are memory implications to using `objectSieve`. Namely: in the
 * worst case, all tokens associated with an object will be buffered (delayed)
 * until the entire object has been seen, after which the buffered tokens will
 * either be released downstream or discarded. This means the entire contents of
 * each individual object will exist in memory simultaneously. Keep this in mind
 * and consider passing a memory-efficient subset (e.g. metadata) of each object
 * through the sieve if said objects might contain large values.
 */
export function objectSieve({
  filter,
  pathSeparator = '.',
  ...transformOptions
}: TransformOptions & {
  /**
   * Objects in the {@link JsonToken} stream that do not match at least one of
   * the provided key-value pairs will have its constituent tokens discarded.
   *
   * See {@link packEntry} for more details on how `key`s provided by `filter`
   * are handled.
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

  let isOpen = false;
  let isDiscarding = false;
  let isReleasing = true;

  const releaseBuffer = function (this: Transform) {
    // ! Is this memory-safe? Probably, because we're moving data from
    // ! one cache (tokenBuffer) to another (internal stream buffer)
    for (let index = 0, length = tokenBuffer.length; index < length; ++index) {
      this.push(tokenBuffer.shift());
    }
  };

  const discardBuffer = function () {
    // ? Making sure the objects in the array are garbage collected
    tokenBuffer.splice(0, tokenBuffer.length);
  };

  const pipeline = chain(
    [
      packEntry({ key: filter.map(([key]) => key), ownerSymbol, pathSeparator }),
      new Transform({
        ...transformOptions,
        objectMode: true,
        transform(chunk: JsonToken | JsonPackedEntryToken, _encoding, callback_) {
          const safeCallback = makeSafeCallback(callback_);

          try {
            const isOwnPackedEntry =
              chunk.name === packedEntrySymbol && chunk.owner === ownerSymbol;

            updateDepth(chunk as JsonToken);

            if (getDepth() === 1 && chunk.name === 'startObject') {
              isDiscarding = false;
              isReleasing = false;
            } else if (getDepth() === 0) {
              isDiscarding = false;
              isReleasing = true;
            }

            if (isOpen || isReleasing) {
              releaseBuffer.call(this);

              if (!isOwnPackedEntry) {
                this.push(chunk);
              }

              return safeCallback(null);
            }

            if (!isDiscarding) {
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
                    isReleasing = true;
                    releaseBuffer.call(this);
                  }

                  // ? This object does not satisfy any filters
                  else if (filter.length <= 1) {
                    isDiscarding = true;
                    discardBuffer();
                  }
                }
              } else {
                tokenBuffer.push(chunk);
              }
            }

            safeCallback(null);
          } catch (error) {
            safeCallback(isNativeError(error) ? error : new Error(String(error)));
          }
        }
      })
    ],
    { ...transformOptions, objectMode: true }
  ) as ReturnType<typeof chain> & {
    /**
     * Disables `objectSieve`'s default behavior, allowing the free flow of
     * chunks through the sieve. Any chunks that were caught by the sieve will
     * also be released upon the next `write` into the stream.
     *
     * This is useful when you only want the sieve to apply to some subset of
     * streamed tokens. This method is the inverse of `closeSieve`.
     */
    openSieve: () => void;
    /**
     * Enables `objectSieve`'s default behavior, conditionally restricting the
     * flow of chunks through the sieve.
     *
     * This method is the inverse of `openSieve`.
     */
    closeSieve: () => void;
  };

  pipeline.openSieve = function () {
    isOpen = true;
  };

  pipeline.closeSieve = function () {
    isOpen = false;
  };

  return pipeline;
}
