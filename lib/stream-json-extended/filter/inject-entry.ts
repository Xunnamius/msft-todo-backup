import {
  type Readable,
  Transform,
  type TransformOptions,
  type Duplex
} from 'node:stream';
import { isNativeError } from 'node:util/types';

import { chain } from 'stream-chain';
import { omitEntry } from 'multiverse/stream-json-extended';

import { escapeRegExp } from 'multiverse/stream-json-extended/util/escape-regexp';
import { type JsonToken, useStackKeyTracking } from 'multiverse/stream-json-extended';
import { makeSafeCallback } from 'multiverse/stream-json-extended/util/make-safe-callback';
import type { Promisable } from 'type-fest';

/**
 * Injects a stream of {@link JsonToken}s representing a new entry (key-value
 * pair) at the end of each object. If the key of the new entry already exists,
 * it will be removed using `omitEntry` automatically by default.
 */
export function injectEntry({
  entry: { injectionPoint, key, valueTokenStreamFactory, autoOmitInjectionKey = true },
  streamKeys = true,
  packKeys = true,
  pathSeparator = '.',
  ...transformOptions
}: TransformOptions & {
  /**
   * The entry to be injected into the token stream.
   */
  entry: {
    /**
     * The point in the object into which this new entry should be injected.
     * `injectionPoint` should be `undefined` (or not provided) if the entry
     * should be injected at the root of the object.
     *
     * If this is a regular expression, and `key` might already exist at the
     * injection point, you _may_ need to disable automatic omission of the
     * injection key by setting `autoOmitInjectionKey` to `false` and instead
     * handle omission manually. This is usually unnecessary unless the regular
     * expression is too complex, uses flags, or contains more than one dollar
     * sign ($) or the dollar sign is not the final character of the expression.
     */
    injectionPoint?: string | RegExp | undefined;
    /**
     * The key of the new entry to inject into the object.
     */
    key: string;
    /**
     * A factory function that returns {@link Readable} stream instances
     * (including {@link Transform}s and {@link Duplex}s). Each {@link Readable}
     * instance, representing the value of the new entry to inject into the
     * current object, will be read until EOF, after which the reference to the
     * stream will be discarded.
     *
     * The {@link Readable} must emit a valid stream of {@link JsonToken}s
     * representing a complete json value (i.e. object, array, or valid
     * primitive).
     *
     * `valueTokenStreamFactory` will first be called when `injectEntry`
     * receives its first chunk, returning a {@link Readable}. Said
     * {@link Readable} will receive all chunks that `injectEntry` receives,
     * allowing the stream to condition its eventual output on the current
     * context.
     *
     * However, **it is imperative that the Readable not `push()` data unless it
     * is in [flowing
     * mode](https://nodejs.org/api/stream.html#two-reading-modes)**, since the
     * stream will not (and must not) immediately enter flowing mode and may
     * **never** enter flowing mode if `injectEntry` never injects any entries.
     * **If the Readable's buffer fills up and starts exerting
     * [backpressure](https://nodejs.org/en/docs/guides/backpressuring-in-streams#rules-to-abide-by-when-implementing-custom-streams)
     * without being in flowing mode, the stream will be destroyed.**
     *
     * After the {@link Readable} returned by `valueTokenStreamFactory` is
     * discarded, `valueTokenStreamFactory` will be called again and the new
     * {@link Readable} will start receiving the chunks received by
     * `injectEntry` starting with the first token sent after the `endObject`
     * token that punctuated the previous root object.
     */
    valueTokenStreamFactory: () => Promisable<Readable>;
    /**
     * If `true`, an {@link omitEntry} filter will be piped into the entry
     * injection stream. The {@link omitEntry} filter will be configured to
     * exclude the `key` entry from the target object by concatenating
     * `injectionPoint + pathSeparator + key` as a regular expression filter
     * without flags.
     *
     * If this is not desired, or you want to do this manually, set
     * `autoOmitInjectionKey` to `false`.
     *
     * @default true
     */
    autoOmitInjectionKey?: boolean;
  };
  /**
   * If `true`, the injected `key`s will be streamed as unpacked
   * {@link JsonToken}s. If `packKeys` is `false`, `streamKeys` will be forced
   * to `true` regardless of the value provided by this option.
   *
   * @see https://github.com/uhop/stream-json/wiki/Parser#constructoroptions
   */
  streamKeys?: boolean;
  /**
   * If `true`, the injected `key`s will be streamed as packed
   * {@link JsonToken}s.
   *
   * @see https://github.com/uhop/stream-json/wiki/Parser#constructoroptions
   */
  packKeys?: boolean;
  /**
   * A string that separates stack values when it is converted to a string.
   */
  pathSeparator?: string;
}) {
  const injectionPointIsString = typeof injectionPoint === 'string';
  const { getStack, getHead, updateStack } = useStackKeyTracking();

  let waitingForTheEndStack: ReturnType<typeof getStack> | undefined;
  let valueTokenStream: Readable;

  const injectionStream = new Transform({
    ...transformOptions,
    objectMode: true,
    async transform(chunk: JsonToken, _encoding, callback_) {
      const safeCallback = makeSafeCallback(callback_);

      try {
        // * Similar to putting the lines after this in process.nextTick(...)
        valueTokenStream ??= await valueTokenStreamFactory();

        if (
          'writable' in valueTokenStream &&
          !(valueTokenStream as Duplex).write(chunk)
        ) {
          return safeCallback(
            new Error('backpressure deadlock: value token stream high water mark reached')
          );
        }

        updateStack(chunk);
        const stack = getStack();

        if (waitingForTheEndStack !== undefined) {
          if (
            chunk.name === 'endObject' &&
            waitingForTheEndStack.toString() === stack.toString()
          ) {
            waitingForTheEndStack = undefined;

            if (streamKeys || !packKeys) {
              const tokens: JsonToken[] = [
                { name: 'startKey' },
                { name: 'stringChunk', value: key },
                { name: 'endKey' }
              ];

              tokens.forEach((token) => this.push(token));
            }

            if (packKeys) {
              this.push({ name: 'keyValue', value: key } satisfies JsonToken);
            }

            const onData = (chunk: unknown) => {
              if (!this.push(chunk)) {
                valueTokenStream.pause();
                // ? Handle backpressure during unbounded chunk inflation. Use
                // ? setImmediate to give whatever caused the pause a chance to
                // ? resolve itself (especially if I/O or network-bound).
                // * https://stackoverflow.com/a/73474849/1367414
                this.once('data', () => setImmediate(() => valueTokenStream.resume()));
              }
            };

            const onEnd = (error?: Error | null) => {
              valueTokenStream.removeListener('error', onEnd);
              valueTokenStream.removeListener('end', onEnd);
              valueTokenStream.removeListener('data', onData);

              this.push(chunk);

              if (error) {
                safeCallback(error);
              } else {
                // ? Generate a new stream and discard the old one when done
                Promise.resolve(valueTokenStreamFactory()).then(
                  (stream) => {
                    valueTokenStream = stream;
                    safeCallback(null);
                  },
                  (error_) => {
                    safeCallback(error_);
                  }
                );
              }
            };

            valueTokenStream.on('error', onEnd);
            valueTokenStream.on('end', onEnd);
            valueTokenStream.on('data', onData);

            // ? If the stream was handed to us in an unreadable state, do
            // ? cleanup immediately.
            if (!valueTokenStream.readable) {
              onEnd(
                valueTokenStream.readable === undefined
                  ? new Error('value token stream is not a Readable')
                  : new Error('value token stream is not readable')
              );
            }

            return;
          }
        } else {
          const parentStack = stack.slice(0, -1);
          const parentStackPath = parentStack.join(pathSeparator);
          const isEvaluatingAnObjectRoot = stack.length >= 1 && getHead() !== 'number';

          if (isEvaluatingAnObjectRoot) {
            if (injectionPoint === undefined) {
              if (stack.length === 1) {
                waitingForTheEndStack = parentStack;
              }
            } else if (
              injectionPoint === parentStackPath ||
              (!injectionPointIsString && parentStackPath?.match(injectionPoint))
            ) {
              waitingForTheEndStack = parentStack;
            }
          }
        }

        this.push(chunk);
        safeCallback(null);
      } catch (error) {
        safeCallback(isNativeError(error) ? error : new Error(String(error)));
      }
    }
  });

  if (autoOmitInjectionKey) {
    const escapedKey = escapeRegExp(key);
    let filterRegExp: RegExp;

    if (injectionPoint === undefined) {
      filterRegExp = new RegExp(`^${escapedKey}$`);
    } else {
      const regexpSuffix = `${escapeRegExp(pathSeparator)}${escapedKey}$`;

      if (injectionPointIsString) {
        filterRegExp = new RegExp(escapeRegExp(injectionPoint) + regexpSuffix);
      } else {
        const { source } = injectionPoint;
        filterRegExp = new RegExp(
          (source.endsWith('$') ? source.slice(0, -1) : source) + regexpSuffix
        );
      }
    }

    return chain([omitEntry({ key: filterRegExp, pathSeparator }), injectionStream], {
      objectMode: true,
      ...transformOptions
    });
  } else {
    return injectionStream;
  }
}
