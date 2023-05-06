import assert from 'node:assert';
import { isNativeError } from 'node:util/types';
import { Transform, type TransformOptions } from 'node:stream';

import {
  FullAssembler,
  useStackKeyTracking,
  type JsonToken,
  type JsonTokenName,
  type FullAssemblerOptions
} from 'multiverse/stream-json-extended';

import { makeSafeCallback } from 'multiverse/make-safe-callback';

import type { JsonValue } from 'type-fest';
import {
  createInflationStream,
  type InflationStream,
  type NodeStyleCallback
} from 'multiverse/create-inflation-stream';

/**
 * This symbol the `name` of every {@link JsonPackedEntryToken}.
 */
export const packedEntrySymbol: unique symbol = Symbol('packed-entry');

/**
 * This symbol the `name` of every {@link JsonSparseEntryKeyStartToken}.
 */
export const sparseEntryKeyStartSymbol: unique symbol = Symbol('sparse-entry-key-start');

/**
 * This symbol the `name` of every {@link JsonSparseEntryKeyEndToken}.
 */
export const sparseEntryKeyEndSymbol: unique symbol = Symbol('sparse-entry-key-end');

/**
 * This symbol the `name` of every {@link JsonSparseEntryValueStartToken}.
 */
export const sparseEntryValueStartSymbol: unique symbol = Symbol(
  'sparse-entry-value-start'
);

/**
 * This symbol the `name` of every {@link JsonSparseEntryValueEndToken}.
 */
export const sparseEntryValueEndSymbol: unique symbol = Symbol('sparse-entry-value-end');

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
 * An subset of {@link JsonPackedEntryToken} that represents specific points in
 * a stream of "sparsely packed" object entry (a key-value pair) tokens.
 *
 * @see {@link JsonSparseEntryKeyStartToken}
 * @see {@link JsonSparseEntryKeyEndToken}
 * @see {@link JsonSparseEntryValueStartToken}
 * @see {@link JsonSparseEntryValueEndToken}
 */
export type JsonSparseEntryToken =
  | JsonSparseEntryKeyStartToken
  | JsonSparseEntryKeyEndToken
  | JsonSparseEntryValueStartToken
  | JsonSparseEntryValueEndToken;

/**
 * An subset of {@link JsonPackedEntryToken} that represents the beginning of a
 * series of key tokens from a "sparsely packed" object entry (a key-value pair)
 * along with other useful metadata.
 */
export type JsonSparseEntryKeyStartToken = Omit<
  JsonPackedEntryToken,
  'name' | 'value'
> & { name: typeof sparseEntryKeyStartSymbol };

/**
 * An subset of {@link JsonPackedEntryToken} that represents the end of a series
 * of key tokens from a "sparsely packed" object entry (a key-value pair) along
 * with other useful metadata.
 */
export type JsonSparseEntryKeyEndToken = Omit<JsonPackedEntryToken, 'name' | 'value'> & {
  name: typeof sparseEntryKeyEndSymbol;
};

/**
 * An subset of {@link JsonPackedEntryToken} that represents the beginning of a
 * series of value tokens from a "sparsely packed" object entry (a key-value
 * pair) along with other useful metadata.
 */
export type JsonSparseEntryValueStartToken = Omit<
  JsonPackedEntryToken,
  'name' | 'value'
> & { name: typeof sparseEntryValueStartSymbol };

/**
 * An subset of {@link JsonPackedEntryToken} that represents the end of a series
 * of value tokens from a "sparsely packed" object entry (a key-value pair)
 * along with other useful metadata.
 */
export type JsonSparseEntryValueEndToken = Omit<
  JsonPackedEntryToken,
  'name' | 'value'
> & { name: typeof sparseEntryValueEndSymbol };

/**
 * Filters through a {@link JsonToken} stream looking for object entry keys
 * matching `key`. Once a matching key token(s) is encountered, the tokens
 * representing the entry's value will be packed in their entirety and streamed
 * as a single {@link JsonPackedEntryToken}.
 *
 * If `discardComponentTokens` is `true`, said key and value tokens will be
 * discarded in lieu of the {@link JsonPackedEntryToken}.
 *
 * If `discardComponentTokens` is `false` (default), each
 * {@link JsonPackedEntryToken} is guaranteed to occur in the stream immediately
 * after the final token corresponding to its entry value.
 *
 * **Note that using `packEntry` has memory implications** when `sparseMode` is
 * `false` and you're packing entries with massive values. Regardless of
 * `sparseMode`, entry keys are _always_ assembled, so if you're packing entries
 * with massive keys (which should almost never be the case) then you may wish
 * to avoid using `packEntry`.
 */
export function packEntry({
  key,
  discardComponentTokens = false,
  ownerSymbol,
  pathSeparator = '.',
  sparseMode = false,
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
     * separated by `pathSeparator`. For example, the entry `b: 1` in `[{a: {b:
     * 1}}]` would be matched by a `key` of `0.a.b` or `/^0\.a\.b$/`.
     *
     * Note that `keys` are matched in FILO order, meaning each packed entry is
     * associated only with a first matching `key` filter even if multiple
     * matching strings/RegExps are provided.
     */
    key: string | RegExp | (string | RegExp)[];
    /**
     * If `true`, any token used to assemble the entry key-value pair will not
     * be seen downstream. That is: only the fully packed entry token will be
     * seen once it has been completely assembled; the component tokens used to
     * assemble the entry token will be discarded.
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
    /**
     * If `true`, the entry will be "packed" without actually assembling its
     * value. Essentially, instead of packing the entire entry, special tokens
     * will be inserted into the stream before and after the key tokens and
     * value tokens representing the entry. Those special tokens are:
     *
     * - {@link JsonSparseEntryKeyStartToken} before the first key-related
     *   token.
     * - {@link JsonSparseEntryKeyEndToken} after the last key-related token.
     * - {@link JsonSparseEntryValueStartToken} before the first value-related
     *   token.
     * - {@link JsonSparseEntryValueEndToken} after the last value-related
     *   token.
     *
     * `sparseMode` can be combined with `discardComponentTokens` if the
     * "packed" entry's tokens are not actually needed.
     *
     * This mode is intended for use by other filters that wish to borrow the
     * core entry packing algorithm without actually packing the entry, which
     * could have negative implications for memory usage when packing large
     * values.
     *
     * @default false
     */
    sparseMode?: boolean;
  }) {
  const keyTokenNames = [
    'startKey',
    'endKey',
    'keyValue'
  ] as const satisfies readonly JsonTokenName[];

  const assembler = new FullAssembler({ ...assemblerTransformOptions, sparseMode });
  const { getStack, getHead, updateStack } = useStackKeyTracking();
  const keyTokenBuffer: (JsonToken | JsonSparseEntryToken)[] = [];
  const keys = [key].flat();

  const releaseKeyTokenBuffer = function (
    this: InflationStream,
    callback: NodeStyleCallback
  ) {
    this.pushMany(keyTokenBuffer, (error) => {
      discardKeyTokenBuffer();
      callback(error);
    });
  };

  const discardKeyTokenBuffer = function () {
    // ? Making sure the objects in the array are garbage collected
    keyTokenBuffer.splice(0, keyTokenBuffer.length);
  };

  // prettier-ignore
  let packingState:
    | 'idle'            // ? Scanning for keyTokenName tokens
    | 'packing-key'     // ? Key token found, assembling key
    | 'finalizing-key'  // ? Handling any remaining key tokens and sparse mode
    | 'packing-value'   // ? Assembling value and/or handling sparse mode
    | 'finalizing-value'// ? Handling any remaining value tokens and sparse mode
    = 'idle';

  let matcher: string | RegExp;
  let sawFirstValueChunk: boolean;
  let entryTokenBase: ReturnType<typeof getEntryTokenBase>;

  return createInflationStream({
    ...assemblerTransformOptions,
    objectMode: true,
    transform(chunk, _encoding, callback) {
      return transform.call(this, chunk, callback);
    }
  });

  function transform(
    this: InflationStream,
    chunk: JsonToken,
    callback_: Parameters<typeof Transform.prototype._transform>[2],
    isRerun = false
  ): void {
    const safeCallback = makeSafeCallback(callback_);

    // ? Ensure the stack doesn't get corrupted by reruns.
    if (!isRerun) {
      updateStack(chunk);
    }

    try {
      if (packingState === 'finalizing-value') {
        const tokens = [];
        const isOurValueToken =
          chunk.name === 'numberValue' || chunk.name === 'stringValue';

        if (isOurValueToken && !discardComponentTokens) {
          tokens.push(chunk);
        }

        if (sparseMode) {
          tokens.push({
            ...entryTokenBase,
            name: sparseEntryValueEndSymbol
          } satisfies JsonSparseEntryValueEndToken);
        } else {
          tokens.push({
            ...entryTokenBase,
            name: packedEntrySymbol,
            value: assembler.current
          } satisfies JsonPackedEntryToken);
        }

        this.pushMany(tokens, (error) => {
          // ? Return to idle state.
          packingState = 'idle';

          if (!isOurValueToken) {
            // ? If chunk isn't a numberValue or stringValue (so it's not our
            // ? value token), then run it through the transformer again lest we
            // ? lose it.
            transform.call(this, chunk, safeCallback, true);
          } else {
            safeCallback(error);
          }
        });
      } else if (packingState === 'packing-value') {
        const tokens = [];

        typeSafeConsume(assembler, chunk);

        const isFirstValueChunk = !sawFirstValueChunk;
        sawFirstValueChunk = true;

        if (assembler.done) {
          // ? Advance to the next state.
          packingState = 'finalizing-value';
        }

        if (sparseMode && isFirstValueChunk) {
          tokens.push({
            ...entryTokenBase,
            name: sparseEntryValueStartSymbol
          } satisfies JsonSparseEntryValueStartToken);
        }

        if (!discardComponentTokens) {
          tokens.push(chunk);
        }

        this.pushMany(tokens, (error) => safeCallback(error));
      } else if (packingState === 'finalizing-key') {
        if (chunk.name === 'keyValue') {
          keyTokenBuffer.push(chunk);
        }

        if (discardComponentTokens) {
          // ? If a match is found, discard its constituent tokens.
          discardKeyTokenBuffer();
        }

        if (sparseMode) {
          keyTokenBuffer.unshift({
            ...entryTokenBase,
            name: sparseEntryKeyStartSymbol
          } satisfies JsonSparseEntryKeyStartToken);

          keyTokenBuffer.push({
            ...entryTokenBase,
            name: sparseEntryKeyEndSymbol
          } satisfies JsonSparseEntryKeyEndToken);
        }

        // ? Flush whatever's left of the key buffer.
        releaseKeyTokenBuffer.call(this, (error) => {
          // ? Advance to the next state.
          sawFirstValueChunk = false;
          packingState = 'packing-value';

          if (chunk.name !== 'keyValue') {
            // ? If chunk isn't a keyValue (so it's a value token), then run it
            // ? through the transformer again lest we lose it.
            transform.call(this, chunk, safeCallback, true);
          } else {
            safeCallback(error);
          }
        });
      } else if (
        keyTokenNames.includes(chunk.name as (typeof keyTokenNames)[number]) ||
        packingState === 'packing-key'
      ) {
        packingState = 'packing-key';

        typeSafeConsume(assembler, chunk);
        keyTokenBuffer.push(chunk);

        if (assembler.done) {
          const stackPath = getStackPath();
          const potentialMatcher = keys.find((key) => {
            return (
              (typeof key === 'string' && stackPath === key) ||
              (typeof key !== 'string' && stackPath.match(key))
            );
          });

          if (potentialMatcher) {
            matcher = potentialMatcher;
            // ? Advance to the next state.
            entryTokenBase = getEntryTokenBase();
            packingState = 'finalizing-key';
          } else {
            // ? If no match is found, flush the buffered tokens downstream.
            return releaseKeyTokenBuffer.call(this, (error) => {
              // ? Return to idle state.
              packingState = 'idle';
              safeCallback(error);
            });
          }
        }

        safeCallback(null);
      } else {
        // ? packingState === 'idle'
        this.pushMany([chunk], (error) => safeCallback(error));
      }
    } catch (error) {
      safeCallback(isNativeError(error) ? error : new Error(String(error)));
    }
  }

  function getEntryTokenBase() {
    return {
      key: getEntryKey(),
      stack: getStack(),
      matcher,
      owner: ownerSymbol
    };
  }

  function getEntryKey() {
    const entryKey = getHead();
    assert(typeof entryKey === 'string');
    return entryKey;
  }

  function getStackPath(stack?: ReturnType<typeof getStack>) {
    return (stack ?? getStack()).join(pathSeparator);
  }

  function typeSafeConsume(fullAssembler: FullAssembler, { name, value }: JsonToken) {
    switch (name) {
      case 'keyValue':
      case 'numberChunk':
      case 'stringChunk':
      case 'numberValue':
      case 'stringValue': {
        fullAssembler[name](value);
        break;
      }

      default: {
        fullAssembler[name]();
        break;
      }
    }
  }
}
