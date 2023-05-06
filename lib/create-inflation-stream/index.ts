/* eslint-disable @typescript-eslint/no-explicit-any */
import { isPromise, isNativeError } from 'node:util/types';
import { Transform, type TransformOptions } from 'node:stream';

/**
 * This type represents a callback function invoked after `transform.pushMany`
 * is done `transform.push`-ing items into `transform.readableBuffer`.
 */
export type PushManyCallback = (error: Error | null | undefined) => void;

type PushManyChunks =
  | any[]
  | Iterable<any>
  | Generator<any, any, any>
  | (() => Iterable<any> | Generator<any, any, any>)
  | AsyncIterable<any>
  | AsyncGenerator<any, any, any>
  | (() => AsyncIterable<any> | AsyncGenerator<any, any, any>);

interface PushManyInterface {
  /**
   * This method is equivalent to `transform.push()` called back to back while
   * respecting backpressure from the internal `readable.readableBuffer`.
   *
   * Additionally, if the optional `callback` is provided, it will be invoked
   * after all `transform.push` operations are completed. This is useful if
   * `transform.pushMany` is provided one or more chunks that resolve
   * asynchronously (e.g. `AsyncGeneratorFunction` or `AsyncIterable`).
   */
  pushMany(
    this: InflationStream,
    chunks: PushManyChunks,
    callback?: PushManyCallback
  ): void;
  /**
   * This method is equivalent to `transform.push()` called back to back while
   * respecting backpressure from the internal `readable.readableBuffer`.
   *
   * Additionally, if the optional `callback` is provided, it will be invoked
   * after all `transform.push` operations are completed. This is useful if
   * `transform.pushMany` is provided one or more chunks that resolve
   * asynchronously (e.g. `AsyncGeneratorFunction` or `AsyncIterable`).
   */
  pushMany(
    this: InflationStream,
    chunks: PushManyChunks,
    encoding?: BufferEncoding,
    callback?: PushManyCallback
  ): void;
  pushMany(
    this: InflationStream,
    chunks: PushManyChunks,
    encodingOrCallback?: BufferEncoding | PushManyCallback,
    callback?: PushManyCallback
  ): void;
}

/**
 * This type is exactly the same as {@link Transform} but with the additional
 * `transform.pushMany()` method included.
 */
export type InflationStream = Transform & PushManyInterface;

/**
 * This type is exactly the same as {@link TransformOptions} but with the `this`
 * binding of each method replaced with {@link InflationStream}.
 */
export type InflationStreamOptions = {
  [P in keyof TransformOptions]: Required<TransformOptions>[P] extends (
    ...args: infer R
  ) => infer S
    ? (this: InflationStream, ...args: R) => S
    : Required<TransformOptions>[P];
};

/**
 * Returns a `Transform` instance with a new `transform.pushMany()` method that
 * safely handles backpressure when the internal `readable.readableBuffer` is
 * full. In addition, a new `'flow'` event is emitted whenever the internal
 * `transform._read()` method is invoked, and it is on top of this new event
 * that `transform.pushMany()` is implemented.
 *
 * `InflationStream`s are useful when inflating chunks in an unbounded or
 * semi-bounded way with the assumption that, _from within a `'flow'` event
 * handler_, this stream never consumes (i.e. `this.read()`) chunks that it
 * itself pushed into its own internal `readable.readableBuffer`, which would be
 * nonsensical anyway.
 *
 * The algorithm used here is preferable to the [clever `stream.once('data',
 * ...)` method](https://stackoverflow.com/a/73474849/1367414). This is because
 * said method can cause catastrophic heisenbugs when the stream is being
 * written into when it does not already have any `'data'` handlers attached.
 */
export function createInflationStream(transformOptions: InflationStreamOptions) {
  const transform = new Transform(transformOptions) as InflationStream;

  transform.pushMany = pushMany.bind(transform);
  transform._read = read.bind(transform);

  return transform;
}

const pushMany: PushManyInterface['pushMany'] = function (...args) {
  let [chunks] = args;
  const [, maybeEncodingOrCallback, maybeCallback] = args;

  const [encoding, callback] = (() => {
    if (maybeCallback !== undefined) {
      return [
        maybeEncodingOrCallback as BufferEncoding | undefined,
        maybeCallback as PushManyCallback
      ];
    } else if (typeof maybeEncodingOrCallback === 'function') {
      return [undefined, maybeEncodingOrCallback];
    } else {
      return [maybeEncodingOrCallback, maybeCallback];
    }
  })();

  const processChunk = (
    iterator: Iterator<any, any, any> | AsyncIterator<any, any, any>,
    { value: chunk, done }: IteratorResult<any, any>
  ) => {
    if (done) {
      callback?.(null);
    } else {
      // ? Keep pushing until push returns false or the iterator is done.
      if (
        this.push(
          chunk,
          (encoding as string) === 'buffer' || Buffer.isBuffer(chunk)
            ? undefined
            : encoding
        )
      ) {
        iterateChunks(iterator);
      } else {
        // ? Once _read is called, start pushing again.
        this.once('flow', () => iterateChunks(iterator));
      }
    }
  };

  const iterateChunks = (
    iterator: Iterator<any, any, any> | AsyncIterator<any, any, any>
  ) => {
    const result = iterator.next();

    if (isPromise(result)) {
      result
        .then((yielded) => processChunk(iterator, yielded))
        .catch((error) => {
          callback?.(isNativeError(error) ? error : new Error(String(error)));
        });
    } else {
      try {
        processChunk(iterator, result);
      } catch (error) {
        callback?.(isNativeError(error) ? error : new Error(String(error)));
      }
    }
  };

  if (typeof chunks === 'function') {
    chunks = chunks();
  }

  const chunkIterator =
    Symbol.iterator in chunks
      ? chunks[Symbol.iterator]()
      : chunks[Symbol.asyncIterator]();

  iterateChunks(chunkIterator);
};

function read(this: Transform, size: number) {
  const readableLength = this.readableLength;

  // ? This is the readable-side version of the writable-side's 'drain' event.
  this.emit('flow');

  // ? If nothing is pushed into readableBuffer, then allow the transform to
  // ? continue. Since every call to push triggers another call to _read, we
  // ? can count on the following condition becoming true eventually.
  if (this.readableLength <= readableLength) {
    Transform.prototype._read.call(this, size);
  }
}
