import { Transform, type TransformOptions } from 'node:stream';
import assert from 'node:assert';

import {
  FullAssembler,
  type JsonToken,
  type JsonTokenName,
  type FullAssemblerOptions
} from 'multiverse/stream-json-extended';

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
  name: typeof packedEntrySymbol;
  key: string;
  matcher: string | RegExp;
  value: JsonValue;
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
     * The key-related {@link JsonToken}(s) to search for. This parameter can
     * be either a singular string or regular expression or an array of
     * strings / regular expressions each representing a key to search for.
     *
     * Specifying `N` keys will result in anywhere from `0 to N` packed
     * entries flushed downstream.
     *
     * `key` will be compared against the entire key path, with each key
     * separated by `pathSeparator`. For example, `b: 1` in `[{a: {b: 1}}]`
     * would be matched by a `key` of `0.a.b` or `/^0\.a\.b$/`.
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
     * streams are relying on the presents of packed entry tokens so as to
     * avoid crosstalk.
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
  const keys = [key].flat();

  let isPacking = false;
  let matcher: string | RegExp;

  return new Transform({
    ...assemblerTransformOptions,
    objectMode: true,
    transform(chunk: JsonToken, _encoding, callback) {
      // ? The @types package is wrong
      const stackPath = (assembler.path as unknown as (string | number)[]).join(
        pathSeparator
      );

      if (isPacking) {
        // ? TypeScript isn't yet smart enough to accept this.
        assembler[chunk.name](chunk.value!);

        if (assembler.done) {
          isPacking = false;

          if (!discardComponentTokens) {
            this.push(chunk);
          }

          assert(stackPath.length > 0);

          this.push({
            name: packedEntrySymbol,
            key: stackPath,
            matcher,
            value: assembler.current,
            owner: ownerSymbol
          } satisfies JsonPackedEntryToken);
        }

        if (assembler.done || discardComponentTokens) {
          return callback(null);
        }
      } else if (keyTokenNames.includes(chunk.name)) {
        // ? TypeScript isn't yet smart enough to accept this.
        assembler[chunk.name](chunk.value!);

        if (assembler.done) {
          const potentialMatcher = keys.find((key) => {
            return (
              (typeof key === 'string' && stackPath === key) ||
              (typeof key !== 'string' && stackPath.match(key))
            );
          });

          if (potentialMatcher) {
            matcher = potentialMatcher;
            isPacking = true;
          }
        }

        if (discardComponentTokens) {
          return callback(null);
        }
      }

      this.push(chunk);
      callback(null);
    }
  });
}
