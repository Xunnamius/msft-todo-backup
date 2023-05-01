import {
  type Readable,
  Transform,
  type TransformOptions,
  type Duplex,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type Writable
} from 'node:stream';

import { isNativeError } from 'node:util/types';
import assert from 'node:assert';

import { chain } from 'stream-chain';

import {
  type JsonToken,
  useStackKeyTracking,
  omitEntry
} from 'multiverse/stream-json-extended';

import { escapeRegExp } from 'multiverse/escape-regexp';
import { makeSafeCallback } from 'multiverse/make-safe-callback';

import type { Promisable } from 'type-fest';

/**
 * Injects a stream of {@link JsonToken}s representing a new entry (key-value
 * pair) at the end of each object. If the key of the new entry already exists,
 * it will be removed using `omitEntry` automatically by default.
 */
export function injectEntry({
  entry: { injectionPoint, key, valueTokenStreamFactory },
  autoOmitInjectionKey = true,
  autoOmitInjectionKeyFilter,
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
     *
     * `injectionPoint` should be `undefined` (or not provided) if the entry
     * should be injected at the base of each object in the token stream. For
     * example, in the token stream `{b: 1} {c: 1} {d: 1}`, an `undefined`
     * `injectionPoint` would result in an entry being injected at the base of
     * each of the three streamed objects.
     *
     * When defined, `injectionPoint` will be compared against the entire key
     * path, with each key separated by `pathSeparator`. For example, to inject
     * a new entry into the `{b: 1}` "root object" in the token stream `[{a: {b:
     * 1}}]`, `injectionPoint` could be `0.a` or `/^\d+\.a$/`.
     *
     * The regular expression `/^\d+\.a$/` could match multiple "root objects"
     * for a token stream, such as:
     *
     * - `{b: 1}`, `{c: 1}`, and `{d: 1}` in `[{a: {b: 1}}, {a: {c: 1}}, {a: {d:
     *   1}}]`
     * - Each of the `{b: number}` objects in `[{a: {b: 1}}, {a: {b: 2}}] [{a:
     *   {b: 3}}] [{a: {b: 4}}]`
     *
     * Note that, if `injectionPoint` is a regular expression, and `key` might
     * already exist in the "root object," you _may_ need to tweak automatic
     * omission of the injection key by providing a custom
     * `autoOmitInjectionKeyFilter` value, or disable automatic omission
     * entirely by setting `autoOmitInjectionKey` to `false` and handling it
     * manually instead.
     *
     * This is usually unnecessary unless the regular expression is too complex,
     * uses flags, or contains more than one dollar sign ($) or the dollar sign
     * is not the final character of the expression.
     */
    injectionPoint?: string | RegExp | undefined;
    /**
     * The key of the new entry to inject into the "root object" (see
     * `injectionPoint` for details).
     */
    key: string;
    /**
     * A factory function that returns value token {@link Readable} streams
     * representing the value of the new entry to inject into the "root object"
     * (see `injectionPoint` for details).
     *
     * This function is invoked once per root object. Each {@link Readable} will
     * be read until EOF, after which the reference to the stream will be
     * discarded.
     *
     * The stream must emit a valid series of {@link JsonToken}s representing a
     * complete JSON value (i.e. object, array, or valid primitive).
     *
     * Value token streams with async read/write/transform/flush callbacks are
     * supported.
     *
     * --------------------------------------
     *
     * How `valueTokenStreamFactory` works:
     *
     * `valueTokenStreamFactory` will initially be invoked when `injectEntry`
     * receives its first chunk from upstream (presumably a {@link JsonToken}),
     * and should return a {@link Readable}, {@link Duplex}, or
     * {@link Transform} instance. This value token stream, if {@link Writable},
     * will receive _all_ chunks that `injectEntry` receives including every
     * token preceding, up to, and including the end of the current "root
     * object" (represented by the `endObject` {@link JsonToken}). This allows
     * the value token stream to condition its eventual output using the current
     * root object as context.
     *
     * If the `injectionPoint` filter never matches, no root object will be
     * determined meaning no entries will be injected and the value token stream
     * will never be read. On the other hand, if the `injectionPoint` filter
     * does match one or more root objects, the following will occur in order:
     *
     * 1. The value token stream, if {@link Writable}, will continue to receive
     *    chunks up until and including the end of the current root object
     *    (represented by the `endObject` {@link JsonToken}).
     *
     * 2. After writing the `endObject` {@link JsonToken} into the value token
     *    stream, if {@link Writable},
     *    [`valueTokenStream.end()`](https://nodejs.org/api/stream.html#writableendchunk-encoding-callback)
     *    is invoked.
     *
     * 3. The value token stream will be switched into [flowing
     *    mode](https://nodejs.org/api/stream.html#two-reading-modes) and
     *    {@link JsonToken}s will be read in and passed downstream until the
     *    stream [signals
     *    EOF](https://nodejs.org/api/stream.html#readablepushchunk-encoding).
     *    **Until the value token stream signals EOF, the pipeline will not
     *    process any new upstream chunks.**
     *
     * 4. After the value token stream signals EOF, any internal references to
     *    it are discarded and `valueTokenStreamFactory` will be invoked again.
     *    The new value token stream will start receiving all {@link JsonToken}
     *    chunks received by `injectEntry`. The first token consumed by the new
     *    value token stream will be the token immediately after the `endObject`
     *    token that punctuated the previous root object.
     *
     * 5. This process repeats until upstream stops sending tokens or otherwise
     *    ends.
     *
     * **WARNING: it is imperative that `valueTokenStream.push()` is not invoked
     * until the value token stream is in [flowing
     * mode](https://nodejs.org/api/stream.html#two-reading-modes)** unless
     * you're sure the stream's `highWaterMark` will never be reached. This is
     * because `injectEntry` will not immediately set the stream to flowing mode
     * (see above) and may *never* set it to flowing mode if no entries are
     * injected. If the stream's buffer fills up and starts exerting
     * [backpressure](https://nodejs.org/en/docs/guides/backpressuring-in-streams#rules-to-abide-by-when-implementing-custom-streams)
     * without being in flowing mode, an error will be emitted on the
     * `injectEntry` wrapper stream and both it and the value token stream will
     * be destroyed.
     *
     * This risk can be avoided by sticking to purely {@link Readable}
     * instances, or using a {@link Duplex} or {@link Transform} instance that
     * explicitly discards written chunks. As it is the case that the
     * {@link Readable} and {@link Writable} sides of value token streams are
     * invoked asymmetrically, and the {@link Writable} side is
     * [ended](https://nodejs.org/api/stream.html#writableendchunk-encoding-callback)
     * before the {@link Readable} side is drained (see above), only call
     * `valueTokenStream.push()` within the
     * [`flush`](https://nodejs.org/api/stream.html#transform_flushcallback)
     * method for {@link Transform} instances or within the
     * [`final`](https://nodejs.org/api/stream.html#writable_finalcallback)
     * method for {@link Duplex} instances.
     */
    valueTokenStreamFactory: () => Promisable<Readable>;
  };
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
  /**
   * If defined, this will be passed to {@link omitEntry} as its `key` option
   * (distinct from the `entry.key` option provided to `injectEntry`). If
   * undefined, {@link omitEntry}'s `key` option will be determined
   * automatically.
   *
   * If {@link autoOmitInjectionKey} is `false`, the value of this option is
   * irrelevant.
   *
   * @default undefined
   */
  autoOmitInjectionKeyFilter?: string | RegExp;
  /**
   * If `true`, injected entry `key`s will be streamed unpacked as three
   * {@link JsonToken}s: `startKey`, `stringChunk`, and `endKey`. If `packKeys`
   * is `false`, `streamKeys` will be forced to `true` regardless of the value
   * provided by this option.
   *
   * **WARNING: this option has no bearing on how the actual value of the entry
   * is streamed**, since said value is generated by the value token stream
   * returned by `valueTokenStreamFactory`. It is up to the value token stream,
   * and not `injectEntry`, to determine how entry values are streamed.
   *
   * @see https://github.com/uhop/stream-json/wiki/Parser#constructoroptions
   */
  streamKeys?: boolean;
  /**
   * If `true`, injected entry `key`s will be streamed packed as one `keyValue`
   * {@link JsonToken}. If `streamKeys` and `packKeys` are both true, `keyValue`
   * will be streamed directly after `startKey`, `stringChunk`, and `endKey`.
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
  let valueTokenStream: Readable | undefined = undefined;

  const passThroughToValueTokenStream = new Transform({
    ...transformOptions,
    objectMode: true,
    async transform(chunk, encoding, callback_) {
      const safeCallback = makeSafeCallback(callback_);

      const advanceToNext: Parameters<typeof Transform.prototype._transform>[2] =
        function (this: Transform, error) {
          this.push(chunk);

          // ? This is required to let the rest of the pipeline process our
          // ? chunks and pump valueTokenStream before we start processing new
          // ? chunks. Synchronization is necessary here because the
          // ? passThroughToValueTokenStream and injectionStream streams share
          // ? state (i.e. valueTokenStream). process.nextTick is not enough.
          setImmediate(() => safeCallback(error));
        };

      try {
        // * Similar to putting the lines after this in process.nextTick(...)
        valueTokenStream ??= await valueTokenStreamFactory();
        const valueTokenStreamIsAWritable = 'writable' in valueTokenStream;

        if (valueTokenStreamIsAWritable) {
          const duplex = valueTokenStream as Duplex;
          if (!duplex.write(chunk, encoding, advanceToNext.bind(this))) {
            duplex.destroy();
            return safeCallback(
              new Error(
                'backpressure deadlock: value token stream high water mark reached'
              )
            );
          }
        } else {
          advanceToNext.call(this, null);
        }
      } catch (error) {
        safeCallback(isNativeError(error) ? error : new Error(String(error)));
      }
    }
  });

  const injectionStream = new Transform({
    ...transformOptions,
    objectMode: true,
    transform(chunk: JsonToken, _encoding, callback_) {
      const safeCallback = makeSafeCallback(callback_);

      try {
        updateStack(chunk);
        const stack = getStack();

        if (waitingForTheEndStack !== undefined) {
          if (
            chunk.name === 'endObject' &&
            waitingForTheEndStack.toString() === stack.toString()
          ) {
            assert(valueTokenStream !== undefined);

            const localValueTokenStream = valueTokenStream;
            const localValueTokenStreamIsAWritable = 'writable' in localValueTokenStream;

            valueTokenStream = undefined;
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
                localValueTokenStream.pause();
                // ? Handle backpressure during unbounded chunk inflation. Use
                // ? setImmediate to give localValueTokenStream a chance to chew
                // ? through the backlog.
                // * https://stackoverflow.com/a/73474849/1367414
                this.once('data', () =>
                  setImmediate(() => localValueTokenStream.resume())
                );
              }
            };

            const onEnd = (error?: Error | null) => {
              localValueTokenStream.removeListener('error', onEnd);
              localValueTokenStream.removeListener('end', onEnd);
              localValueTokenStream.removeListener('data', onData);

              this.push(chunk);
              safeCallback(error);
            };

            localValueTokenStream.on('error', onEnd);
            localValueTokenStream.on('end', onEnd);
            localValueTokenStream.on('data', onData);

            // ? If the stream was handed to us in an unreadable state, do
            // ? cleanup immediately.
            if (!localValueTokenStream.readable) {
              onEnd(
                localValueTokenStream.readable === undefined
                  ? new Error('value token stream is not a Readable')
                  : new Error('value token stream is not readable')
              );
            } else if (localValueTokenStreamIsAWritable) {
              (localValueTokenStream as Duplex).end();
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

  let streams: Readable[];

  if (autoOmitInjectionKey) {
    let omitEntryStream: ReturnType<typeof omitEntry>;

    if (autoOmitInjectionKeyFilter === undefined) {
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

      omitEntryStream = omitEntry({ key: filterRegExp, pathSeparator });
    } else {
      omitEntryStream = omitEntry({ key: autoOmitInjectionKeyFilter, pathSeparator });
    }

    streams = [passThroughToValueTokenStream, omitEntryStream, injectionStream];
  } else {
    streams = [passThroughToValueTokenStream, injectionStream];
  }

  return chain(streams, { ...transformOptions, objectMode: true });
}
