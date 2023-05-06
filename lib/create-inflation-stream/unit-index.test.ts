import { Writable } from 'node:stream';
import { finished } from 'node:stream/promises';

import { createInflationStream } from 'multiverse/create-inflation-stream';

describe('::makeInflatableTransform', () => {
  it('emits the "flow" event whenever _read is invoked', async () => {
    expect.assertions(3);

    const inflationStream = createInflationStream({
      objectMode: true,
      transform(chunk, encoding, callback) {
        this.push(chunk, encoding);
        callback(null);
      }
    });

    inflationStream.on('flow', () => {
      expect(true).toBeTrue();
    });

    inflationStream.write('1');
    inflationStream.read();
    inflationStream.write('2');
    inflationStream.read();
    inflationStream.write('3');
    inflationStream.read();
  });

  it('does not re-enter _transform if push occurs during "flow" emission and buffer full', async () => {
    expect.assertions(2);

    const inflationStream = createInflationStream({
      objectMode: true,
      highWaterMark: 1,
      transform(chunk, encoding, callback) {
        this.push(chunk, encoding);
        callback(null);
      }
    });

    inflationStream.once('flow', () => {
      inflationStream.push('a');
      inflationStream.once('flow', () => {
        inflationStream.push('b');
        inflationStream.once('flow', () => {
          inflationStream.push('c');
          inflationStream.once('flow', () => {
            expect(true).toBeTrue();
          });
        });
      });
    });

    inflationStream.write('1');
    inflationStream.write('2');
    inflationStream.write('3');

    const promise = inflationStream.toArray();

    inflationStream.end();

    await expect(promise).resolves.toStrictEqual(['1', 'a', 'b', 'c', '2', '3']);
  });

  it('handles 2-arg pushMany called with an array (single element)', async () => {
    expect.hasAssertions();

    const inflationStream = createInflationStream({
      objectMode: true,
      transform(chunk, encoding, callback) {
        this.pushMany([chunk], encoding);
        callback(null);
      }
    });

    inflationStream.write('1');
    inflationStream.end();

    await expect(inflationStream.toArray()).resolves.toStrictEqual(['1']);
  });

  it('handles 1-arg pushMany called with an array (multiple elements)', async () => {
    expect.hasAssertions();

    const inflationStream = createInflationStream({
      objectMode: true,
      transform(chunk, _encoding, callback) {
        this.pushMany([chunk, chunk, chunk]);
        callback(null);
      }
    });

    inflationStream.write('1');
    inflationStream.write('2');
    inflationStream.end();

    await expect(inflationStream.toArray()).resolves.toStrictEqual([
      '1',
      '1',
      '1',
      '2',
      '2',
      '2'
    ]);
  });

  it('handles pushMany called with a non-array iterable', async () => {
    expect.hasAssertions();

    const inflationStream = createInflationStream({
      objectMode: true,
      transform(_chunk, _encoding, callback) {
        this.pushMany(
          (function* () {
            yield 'a';
            yield 'b';
            yield 'c';
          })()
        );
        callback(null);
      }
    });

    inflationStream.write('1');
    inflationStream.end();

    await expect(inflationStream.toArray()).resolves.toStrictEqual(['a', 'b', 'c']);
  });

  it('handles pushMany called with an async iterable', async () => {
    expect.hasAssertions();

    let firstTransform = true;

    const inflationStream = createInflationStream({
      objectMode: true,
      transform(chunk, _encoding, callback) {
        if (firstTransform) {
          this.pushMany(
            (async function* () {
              yield 'a';
              yield 'b';
              yield 'c';
            })(),
            undefined,
            (error) => (error ? inflationStream.destroy(error) : inflationStream.end())
          );
        } else {
          this.push(chunk);
        }

        firstTransform = false;
        callback(null);
      }
    });

    inflationStream.write('1');
    inflationStream.write('x');

    await expect(inflationStream.toArray()).resolves.toStrictEqual(['x', 'a', 'b', 'c']);
  });

  it('calls 2-arg pushMany callback with final push when otherwise done pushing', async () => {
    expect.hasAssertions();

    const inflationStream = createInflationStream({
      objectMode: true,
      transform(_chunk, _encoding, callback) {
        this.pushMany(
          (async function* () {
            yield 'a';
            yield 'b';
            yield 'c';
          })(),
          // ? pushMany should accept two-argument version with callback
          // undefined
          (error) => callback(error, 'x')
        );
      }
    });

    inflationStream.write('1');
    inflationStream.end();

    await expect(inflationStream.toArray()).resolves.toStrictEqual(['a', 'b', 'c', 'x']);
  });

  it('ensures 3-arg pushMany with async iterator and push happen in the proper order', async () => {
    expect.hasAssertions();

    let firstTransform = true;

    const inflationStream = createInflationStream({
      objectMode: true,
      transform(chunk, _encoding, callback) {
        if (firstTransform) {
          this.pushMany(
            (async function* () {
              yield 'a';
              yield 'b';
              yield 'c';
            })(),
            undefined,
            (error) => callback(error)
          );
        } else {
          this.push(chunk);
          callback(null);
        }

        firstTransform = false;
      }
    });

    inflationStream.write('1');
    inflationStream.write('x');
    inflationStream.end();

    await expect(inflationStream.toArray()).resolves.toStrictEqual(['a', 'b', 'c', 'x']);
  });

  it('handles pushMany called with a generator function', async () => {
    expect.hasAssertions();

    const inflationStream = createInflationStream({
      objectMode: true,
      transform(_chunk, _encoding, callback) {
        this.pushMany(
          function* () {
            yield 'a';
            yield 'b';
            yield 'c';
          },
          (error) => callback(error, 'x')
        );
      }
    });

    inflationStream.write('1');
    inflationStream.end();

    await expect(inflationStream.toArray()).resolves.toStrictEqual(['a', 'b', 'c', 'x']);
  });

  it('handles pushMany called with an async generator function', async () => {
    expect.hasAssertions();

    const inflationStream = createInflationStream({
      objectMode: true,
      transform(_chunk, _encoding, callback) {
        this.pushMany(
          async function* () {
            yield 'a';
            yield 'b';
            yield 'c';
          },
          (error) => callback(error, 'x')
        );
      }
    });

    inflationStream.write('1');
    inflationStream.end();

    await expect(inflationStream.toArray()).resolves.toStrictEqual(['a', 'b', 'c', 'x']);
  });

  it('handles sync backpressure on the Readable side', async () => {
    expect.hasAssertions();

    let countCheckpointReached = 0;

    const inflationStream = createInflationStream({
      objectMode: true,
      highWaterMark: 2,
      transform(chunk: string, encoding, callback) {
        this.pushMany(
          ['first: ' + chunk, 'second: ' + chunk, 'third: ' + chunk],
          encoding,
          (error) => {
            countCheckpointReached += 1;
            callback(error);
          }
        );
      }
    });

    inflationStream.write('a');
    inflationStream.write('b');

    expect(countCheckpointReached).toBe(0);
    expect(inflationStream.readableLength).toBe(2);
    expect(inflationStream.read()).toBe('first: a');
    expect(inflationStream.readableLength).toBe(2);
    expect(countCheckpointReached).toBe(0);
    expect(inflationStream.read()).toBe('second: a');
    expect(inflationStream.readableLength).toBe(2);
    expect(countCheckpointReached).toBe(1);
    expect(inflationStream.read()).toBe('third: a');
    expect(inflationStream.readableLength).toBe(2);
    expect(countCheckpointReached).toBe(1);
    expect(inflationStream.read()).toBe('first: b');
    expect(inflationStream.readableLength).toBe(2);
    expect(countCheckpointReached).toBe(1);
    expect(inflationStream.read()).toBe('second: b');
    expect(inflationStream.readableLength).toBe(1);
    expect(countCheckpointReached).toBe(2);
    expect(inflationStream.read()).toBe('third: b');
    expect(inflationStream.readableLength).toBe(0);
    expect(countCheckpointReached).toBe(2);
    expect(inflationStream.read()).toBeNull();

    inflationStream.end();
    inflationStream.resume();

    await finished(inflationStream);
  });

  it('handles async backpressure on the Readable side', async () => {
    expect.hasAssertions();

    const results: string[] = [];
    let countCheckpointReached = 0;

    const inflationStream = createInflationStream({
      objectMode: true,
      highWaterMark: 2,
      transform(chunk: string, _encoding, callback) {
        this.pushMany(
          async function* () {
            yield 'first: ' + chunk;
            yield 'second: ' + chunk;
            yield 'third: ' + chunk;
          },
          (error) => {
            countCheckpointReached += 1;
            callback(error);
          }
        );
      }
    });

    inflationStream.write('a', () => {
      expect(countCheckpointReached).toBe(1);
    });

    inflationStream.write('b', () => {
      expect(countCheckpointReached).toBe(2);
    });

    const writableStream = inflationStream.pipe(
      new Writable({
        objectMode: true,
        highWaterMark: 1,
        write(chunk, _encoding, callback) {
          results.push(chunk);
          callback(null);
        }
      })
    );

    inflationStream.end();

    await finished(writableStream);

    expect(results).toStrictEqual([
      'first: a',
      'second: a',
      'third: a',
      'first: b',
      'second: b',
      'third: b'
    ]);
  });

  it('handles error in iterables and generator functions consumed by pushMany', async () => {
    expect.assertions(2);

    let thrownError: Error | undefined;

    const inflationStream = createInflationStream({
      transform(_chunk, encoding, callback) {
        this.pushMany(
          function* () {
            yield '1';
            throw new Error('badness');
          },
          encoding,
          (error) => callback(error)
        );
      }
    });

    inflationStream.write('x');
    inflationStream.resume();
    inflationStream.end();

    await finished(inflationStream).catch((error) => (thrownError = error));

    expect(thrownError).toMatchObject({ message: 'badness' });
    expect(inflationStream.destroyed).toBeTrue();
  });

  it('handles error in async iterables and async generator functions consumed by pushMany', async () => {
    expect.assertions(2);

    let thrownError: Error | undefined;

    const inflationStream = createInflationStream({
      transform(_chunk, encoding, callback) {
        this.pushMany(
          async function* () {
            yield '1';
            throw new Error('badness');
          },
          encoding,
          (error) => callback(error)
        );
      }
    });

    inflationStream.write('x');
    inflationStream.resume();
    inflationStream.end();

    await finished(inflationStream).catch((error) => (thrownError = error));

    expect(thrownError).toMatchObject({ message: 'badness' });
    expect(inflationStream.destroyed).toBeTrue();
  });

  it('passes correct encoding when calling 3-arg pushMany', async () => {
    expect.hasAssertions();

    const inflationStream = createInflationStream({
      transform(chunk, encoding, callback) {
        this.pushMany(['1', chunk, '3'], encoding, () => {
          this.pushMany(['1', chunk, '3'], 'hex', (error) => callback(error));
        });
      }
    });

    const spy = jest.spyOn(inflationStream, 'push');

    inflationStream.write('abc123', 'ascii');
    inflationStream.resume();
    inflationStream.end();

    expect(spy.mock.calls).toStrictEqual([
      [expect.anything(), undefined],
      [expect.anything(), undefined],
      [expect.anything(), undefined],
      [expect.anything(), 'hex'],
      [expect.anything(), undefined],
      [expect.anything(), 'hex'],
      [null]
    ]);
  });

  it('still calls callback when passed empty chunks array', async () => {
    expect.assertions(2);

    const inflationStream = createInflationStream({
      transform(_chunk, encoding, callback) {
        this.pushMany([], encoding, () => {
          expect(true).toBeTrue();
          callback(null);
        });
      }
    });

    inflationStream.write('x');
    inflationStream.end();

    await expect(inflationStream.toArray()).resolves.toBeEmpty();
  });
});
