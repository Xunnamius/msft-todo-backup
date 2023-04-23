/* eslint-disable no-await-in-loop */
import { PassThrough, Duplex, Writable, Readable } from 'node:stream';

import {
  type JsonToken,
  injectEntry,
  objectSieve,
  selectOne
} from 'multiverse/stream-json-extended';

import {
  feedTokenStream,
  tokenizeObject
} from 'multiverse/stream-json-extended/test/setup';

describe('|>inject-entry', () => {
  describe('::injectEntry', () => {
    it('injects a stream of tokens at the end of each object using injection stream factory', async () => {
      expect.hasAssertions();

      const targetObjects = [
        { name: 'object-1' },
        { name: 'object-2' },
        { name: 'object-3' },
        { name: 'object-4' },
        { name: 'object-5' }
      ];

      const injectedArray = ['child-1', { name: 'child-2' }, 3, false];

      await expect(
        feedTokenStream(
          tokenizeObject(targetObjects, { excludeFirstAndLast: true }),
          injectEntry({
            entry: {
              key: 'children',
              valueTokenStreamFactory: async () =>
                Readable.from(await tokenizeObject(injectedArray))
            }
          })
        )
      ).resolves.toStrictEqual(
        await tokenizeObject(
          targetObjects.map((obj) => {
            return { ...obj, children: injectedArray };
          }),
          { excludeFirstAndLast: true }
        )
      );
    });

    it('handles deep injections into complex objects and objects within arrays', async () => {
      expect.hasAssertions();

      const targetObjects = {
        bigBoyObject: [
          { name: 'object-1', subObject: { hello: 'world' } },
          {
            name: 'object-2',
            subObjects: [
              { subObject: { hello: 'world' } },
              { subObject: { hello: 'world' } },
              { subObject: { hello: 'world' } }
            ]
          },
          { name: 'object-3' },
          {
            name: 'object-4',
            subObjects: [{ a: { world: 'hello' } }, { subObject: { hello: 'world' } }]
          },
          { name: 'object-5', subObject: { hello: 'world' } }
        ],
        // ? At the root of the object, so this shouldn't match
        subObject: { x: 'y' }
      } as const;

      const injectedArray = ['child-a', { name: 'child-b' }, 0xc, true];

      await expect(
        feedTokenStream(
          await tokenizeObject(targetObjects),
          injectEntry({
            entry: {
              injectionPoint: /\.subObject$/,
              key: 'children',
              valueTokenStreamFactory: async () =>
                Readable.from(await tokenizeObject(injectedArray))
            }
          })
        )
      ).resolves.toStrictEqual(
        await tokenizeObject({
          bigBoyObject: [
            {
              name: 'object-1',
              subObject: { hello: 'world', children: injectedArray }
            },
            {
              name: 'object-2',
              subObjects: [
                { subObject: { hello: 'world', children: injectedArray } },
                { subObject: { hello: 'world', children: injectedArray } },
                { subObject: { hello: 'world', children: injectedArray } }
              ]
            },
            { name: 'object-3' },
            {
              name: 'object-4',
              subObjects: [
                { a: { world: 'hello' } },
                { subObject: { hello: 'world', children: injectedArray } }
              ]
            },
            {
              name: 'object-5',
              subObject: { hello: 'world', children: injectedArray }
            }
          ],
          // ? At the root of the object, so this shouldn't match
          subObject: { x: 'y' }
        })
      );
    });

    it('reads from Readable value token stream', async () => {
      expect.hasAssertions();

      const targetObjects = [
        { name: 'object-1' },
        { name: 'object-2' },
        { name: 'object-3' },
        { name: 'object-4' },
        { name: 'object-5' }
      ];

      const injectedValue = null;

      await expect(
        feedTokenStream(
          tokenizeObject(targetObjects, { excludeFirstAndLast: true }),
          injectEntry({
            entry: {
              key: 'v',
              valueTokenStreamFactory: async () =>
                Readable.from(await tokenizeObject(injectedValue))
            }
          })
        )
      ).resolves.toStrictEqual(
        await tokenizeObject(
          targetObjects.map((obj) => {
            return { ...obj, v: injectedValue };
          }),
          { excludeFirstAndLast: true }
        )
      );
    });

    it('writes all chunks into Duplex value token stream, then reads from it later', async () => {
      expect.hasAssertions();

      const targetObjects = [
        { name: 'object-1' },
        { name: 'object-2' },
        { name: 'object-3' },
        { name: 'object-4' },
        { name: 'object-5' }
      ];

      const targetObjectsTokenization = await tokenizeObject(targetObjects);

      const expectedArray = [...targetObjectsTokenization];
      const targetObjectsTokenNames = targetObjectsTokenization.map(
        (token) => token.name
      );

      // ? This is necessary because the injected stream is tokenized
      // ? differently (streamKeys=true) than the wrapper stream
      // ? (streamKeys=false).
      for (let count = 0; count < 5; count++) {
        expectedArray.splice(
          expectedArray.findIndex(
            (token) =>
              token.name === 'stringValue' && token.value === `object-${count + 1}`
          ) + 1,
          0,
          ...(await tokenizeObject(
            {
              seenTokenNames: targetObjectsTokenNames.slice(
                !count ? 0 : 11 + (count - 1) * 10,
                11 + count * 10
              )
            },
            {
              excludeFirstAndLast: true,
              streamValues: false,
              packValues: true
            }
          ))
        );
      }

      await expect(
        feedTokenStream(
          targetObjectsTokenization,
          injectEntry({
            streamKeys: false,
            entry: {
              injectionPoint: /^\d+$/,
              key: 'seenTokenNames',
              valueTokenStreamFactory: async () => {
                const seenTokenNames: string[] = [];
                let transformedTokens: JsonToken[];

                return new Duplex({
                  objectMode: true,
                  write(chunk: JsonToken, _encoding, callback) {
                    seenTokenNames.push(chunk.name);
                    callback(null);
                  },
                  async read() {
                    if (transformedTokens === undefined) {
                      transformedTokens = await tokenizeObject(seenTokenNames, {
                        streamValues: false,
                        packValues: true
                      });
                    }

                    this.push(
                      transformedTokens.length === 0 ? null : transformedTokens.shift()
                    );
                  }
                });
              }
            }
          })
        )
      ).resolves.toStrictEqual(expectedArray);
    });

    it('errors if passed a purely Writable value token stream', async () => {
      expect.hasAssertions();

      await expect(
        feedTokenStream(
          tokenizeObject({}),
          injectEntry({
            entry: {
              key: 'error',
              // @ts-expect-error: purposely passing a disallowed stream type
              valueTokenStreamFactory: async () => {
                return new Writable({
                  objectMode: true,
                  write(_, __, callback) {
                    callback(null);
                  }
                });
              }
            }
          })
        )
      ).rejects.toThrow('value token stream is not a Readable');
    });

    it('errors if value token stream factory throws', async () => {
      expect.hasAssertions();

      await expect(
        feedTokenStream(
          tokenizeObject({}),
          injectEntry({
            entry: {
              key: 'error',
              valueTokenStreamFactory: async () => {
                throw new Error('bad');
              }
            }
          })
        )
      ).rejects.toThrow('bad');
    });

    it.only('handles returned Readable that is not readable', async () => {
      // TODO: test all non-readable scenarios including error and already-ended
      expect.hasAssertions();
    });

    it('handles downstream backpressure', async () => {
      expect.hasAssertions();
    });

    it('handles backpressure from value token stream', async () => {
      expect.hasAssertions();
    });

    it('handles errors from value token stream', async () => {
      expect.hasAssertions();
    });

    it('excludes the injection key if it exists unless autoIgnoreInjectionKey is false', async () => {
      expect.hasAssertions();
    });

    it('respects pathSeparator option', async () => {
      expect.hasAssertions();
    });

    it('respects streamKeys option', async () => {
      expect.hasAssertions();
    });

    it('respects packKeys option', async () => {
      expect.hasAssertions();
    });
  });
});

describe('|>object-sieve', () => {
  describe('::objectSieve', () => {
    it('todo', async () => {
      expect.hasAssertions();
    });
  });
});

describe('|>omit-entry', () => {
  describe('::omitEntry', () => {
    it('todo', async () => {
      expect.hasAssertions();
    });
  });
});

describe('|>select-one', () => {
  describe('::selectOne', () => {
    it('todo', async () => {
      expect.hasAssertions();
    });
  });
});
