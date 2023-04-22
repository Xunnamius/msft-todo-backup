import assert from 'node:assert';
import { isNativeError } from 'node:util/types';
import { Transform, type TransformOptions } from 'node:stream';

import {
  FullAssembler,
  type JsonToken,
  type JsonTokenName,
  type FullAssemblerOptions,
  useStackKeyTracking
} from 'multiverse/stream-json-extended';

import { makeSafeCallback } from 'multiverse/stream-json-extended/util/make-safe-callback';

import type { JsonValue } from 'type-fest';

/**
 * This symbol the `name` of every {@link JsonPackedEntryToken}.
 */
export const packedEntrySymbol: unique symbol = Symbol('packed-entry');

/**
 * An extension of {@link JsonToken} that represents a packed object entry (a
 * key-value pair) along with other useful metadata.
 */
export type JsonPackedEntryToken = {
  /**
   * The name of the {@link JsonToken} chunk.
   */
  name: typeof packedEntrySymbol;
  /**
   * The key in the corresponding key-value object entry.
   */
  key: string;
  /**
   * The full stack including the `key`.
   */
  stack: ReturnType<ReturnType<typeof useStackKeyTracking>['getStack']>;
  /**
   * The filter provided to `packEntry` that matched this entry token.
   */
  matcher: string | RegExp;
  /**
   * The assembled value in the corresponding key-value object entry.
   */
  value: JsonValue;
  /**
   * A symbol representing the owner/creator of this entry token.
   */
  owner: symbol | undefined;
};

/**
 * Filters through a {@link JsonToken} stream looking for an object key matching
 * `key`. Once a matching key token(s) is encountered, the tokens representing
 * its value will be packed in their entirety and emitted as a single
 * {@link JsonPackedEntryToken}.
 *
 * Depending on the value of `discardComponentTokens`, said key and value tokens
 * may be discarded in lieu of the {@link JsonPackedEntryToken}.
 *
 * **Note that using `packEntry` has memory implications. Be wary choosing to
 * pack entries with massive keys (rare) or very large values (more common).**
 */
export function packEntry({
  key,
  discardComponentTokens = false,
  ownerSymbol,
  pathSeparator = '.',
  ...assemblerTransformOptions
}: FullAssemblerOptions &
  TransformOptions & {
    /**
     * The entry key {@link JsonToken}(s) to search for. This parameter can be
     * either a singular string or regular expression or an array of strings /
     * regular expressions each representing a key to search for.
     *
     * Specifying `N` keys will result in anywhere from `0 to N` packed entries
     * flushed downstream.
     *
     * `key` will be compared against the entire key path, with each key
     * separated by `pathSeparator`. For example, `b: 1` in `[{a: {b: 1}}]`
     * would be matched by a `key` of `0.a.b` or `/^0\.a\.b$/`.
     *
     * Note that `keys` are matched in FILO order, meaning each packed entry is
     * associated only with a first matching `key` filter even if multiple
     * matching strings/RegExps are provided.
     */
    key: string | RegExp | (string | RegExp)[];
    /**
     * If `true`, any token used to assemble the entry key-value pair will not
     * be seen downstream. That is: only the fully packed entry token will be
     * seen once it has been completely assembled; the component tokens used
     * to assemble the entry token will be discarded.
     *
     * @default false
     */
    discardComponentTokens?: boolean;
    /**
     * Used to mark ownership of {@JsonPackedEntryToken}s. Useful if multiple
     * streams are relying on the presence of packed entry tokens in the same
     * data stream so as to avoid crosstalk.
     */
    ownerSymbol?: symbol;
    /**
     * A string that separates stack values when it is converted to a string.
     */
    pathSeparator?: string;
  }) {
  // eslint-disable-next-line unicorn/prefer-set-has
  const keyTokenNames: JsonTokenName[] = ['startKey', 'endKey', 'keyValue'];
  const assembler = new FullAssembler(assemblerTransformOptions);
  const { getStack, getHead, updateStack } = useStackKeyTracking();
  const keyTokenBuffer: JsonToken[] = [];
  const keys = [key].flat();

  const releaseKeyTokenBuffer = function (this: Transform) {
    // ! Is this memory-safe? Probably, because we're moving data from
    // ! one cache (keyTokenBuffer) to another (internal stream buffer)
    for (let index = 0, length = keyTokenBuffer.length; index < length; ++index) {
      this.push(keyTokenBuffer.shift());
    }
  };

  const discardKeyTokenBuffer = function () {
    // ? Making sure the objects in the array are garbage collected
    keyTokenBuffer.splice(0, keyTokenBuffer.length);
  };

  let matcher: string | RegExp;
  let isPackingKey = false;
  let isPackingValue = false;
  let previouslyMatchedTokenName: JsonTokenName | undefined = undefined;

  return new Transform({
    ...assemblerTransformOptions,
    objectMode: true,
    transform(chunk: JsonToken, _encoding, callback) {
      updateStack(chunk);
      const safeCallback = makeSafeCallback(callback);

      const shouldSkipAssembly =
        (previouslyMatchedTokenName === 'endKey' && chunk.name === 'keyValue') ||
        (previouslyMatchedTokenName === 'endString' && chunk.name === 'stringValue') ||
        (previouslyMatchedTokenName === 'endNumber' && chunk.name === 'numberValue');

      previouslyMatchedTokenName = undefined;

      assert(isPackingKey !== isPackingValue || isPackingKey === false);

      try {
        // ? Account for values that are both streamed and packed
        if (!shouldSkipAssembly) {
          if (isPackingValue) {
            // ? TypeScript isn't yet smart enough to accept this.
            assembler[chunk.name]?.(chunk.value!);

            if (assembler.done) {
              isPackingValue = false;

              if (!discardComponentTokens) {
                // ? Ensure any end tokens are flushed before the entry token.
                this.push(chunk);
              }

              const entryKey = getHead();
              assert(typeof entryKey === 'string');

              this.push({
                name: packedEntrySymbol,
                key: entryKey,
                stack: getStack(),
                matcher,
                value: assembler.current,
                owner: ownerSymbol
              } satisfies JsonPackedEntryToken);

              previouslyMatchedTokenName = chunk.name;
            }

            if (assembler.done || discardComponentTokens) {
              // ? Ensure the token is not flushed downstream by the code below.
              return safeCallback(null);
            }
          } else if (keyTokenNames.includes(chunk.name) || isPackingKey) {
            isPackingKey = true;
            // ? TypeScript isn't yet smart enough to accept this.
            assembler[chunk.name]?.(chunk.value!);

            if (assembler.done) {
              const stackPath = getStackPath();
              const potentialMatcher = keys.find((key) => {
                return (
                  (typeof key === 'string' && stackPath === key) ||
                  (typeof key !== 'string' && stackPath.match(key))
                );
              });

              isPackingKey = false;

              if (potentialMatcher) {
                matcher = potentialMatcher;
                isPackingValue = true;

                previouslyMatchedTokenName = chunk.name;

                if (discardComponentTokens) {
                  // ? If a match is found, discard its constituent tokens.
                  discardKeyTokenBuffer();
                  // ? Ensure the token is not flushed downstream by the code
                  // ? below.
                  return safeCallback(null);
                }
              } else if (discardComponentTokens) {
                // ? If no match is found, flush the buffered tokens downstream.
                releaseKeyTokenBuffer.call(this);
                // ? Also, allow the current token to be flushed downstream too.
              }
            } else if (discardComponentTokens) {
              // ? Capture the token into our buffer.
              keyTokenBuffer.push(chunk);
              // ? Ensure the token is not flushed downstream by the code below.
              return safeCallback(null);
            }
          }
        }

        // ? Ensure we discard the packed version of streamed tokens that we
        // ? ignored above, if necessary.
        if (!shouldSkipAssembly || !discardComponentTokens) {
          this.push(chunk);
        }

        safeCallback(null);
      } catch (error) {
        safeCallback(isNativeError(error) ? error : new Error(String(error)));
      }
    }
  });

  function getStackPath() {
    return getStack().join(pathSeparator);
  }
}
