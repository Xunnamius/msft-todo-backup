/* eslint-disable no-await-in-loop */
import { Transform, Duplex, Writable, Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import assert from 'node:assert';

import { chain } from 'stream-chain';

import {
  injectEntry,
  objectSieve,
  omitEntry,
  selectEntry,
  packEntry,
  packedEntrySymbol,
  type JsonToken,
  type JsonPackedEntryToken
} from 'multiverse/stream-json-extended';

import {
  feedTokenStream,
  tokenizeObject
} from 'multiverse/stream-json-extended/test/setup';

import type { AnyFunction } from '@xunnamius/types';

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

    it('handles returned Readable that is not readable', async () => {
      expect.hasAssertions();

      const nonReadable = Readable.from([]).resume();
      const targetObjects = [{ name: 'object-1' }, { name: 'object-2' }];
      const tokenizedObjects = await tokenizeObject(targetObjects, {
        excludeFirstAndLast: true
      });

      assert(nonReadable.readable === false);

      await expect(
        feedTokenStream(
          tokenizedObjects,
          injectEntry({
            entry: {
              key: 'children',
              valueTokenStreamFactory: async () => nonReadable
            }
          })
        )
      ).rejects.toThrow('value token stream is not readable');
    });

    it('handles Readable that throws', async () => {
      expect.hasAssertions();

      const nonReadable = Readable.from([]).resume();
      const targetObjects = [{ name: 'object-1' }, { name: 'object-2' }];
      const tokenizedObjects = await tokenizeObject(targetObjects, {
        excludeFirstAndLast: true
      });

      assert(nonReadable.readable === false);

      await expect(
        feedTokenStream(
          tokenizedObjects,
          injectEntry({
            entry: {
              key: 'children',
              valueTokenStreamFactory: async () => {
                return new Readable({
                  objectMode: true,
                  read() {
                    this.destroy(new Error('bad'));
                  }
                });
              }
            }
          })
        )
      ).rejects.toThrow('bad');
    });

    it('handles downstream backpressure', async () => {
      expect.assertions(3);

      const readableStream = Readable.from(
        await tokenizeObject([{}], { excludeFirstAndLast: true })
      );

      const injectorStream = injectEntry({
        highWaterMark: 2,
        entry: {
          key: 'value',
          valueTokenStreamFactory: async () => {
            const injectionStream = Readable.from([
              { name: 'startArray' },
              { name: 'numberValue', value: '1' },
              { name: 'numberValue', value: '2' },
              { name: 'numberValue', value: '3' },
              { name: 'endArray' }
            ] satisfies JsonToken[]);

            if (exertBackpressure) {
              injectionStream.once('pause', () => {
                if (writableStreamCallback !== undefined) {
                  // ? Counting expectations with expect.assertions(3)
                  expect(true).toBeTrue();

                  const callback = writableStreamCallback;
                  writableStreamCallback = undefined;
                  exertBackpressure = false;

                  injectionStream.once('resume', () => {
                    // ? Counting expectations with expect.assertions(3)
                    expect(true).toBeTrue();
                  });

                  callback(null);
                }
              });
            }

            return injectionStream;
          }
        }
      });

      let writableStreamCallback: AnyFunction | undefined = undefined;
      let exertBackpressure = true;

      const writableStream = new Writable({
        objectMode: true,
        highWaterMark: 1,
        write(_chunk, _encoding, callback) {
          if (exertBackpressure) {
            // ! callback() is not called !
            writableStreamCallback = callback;
          } else {
            callback(null);
          }
        }
      });

      const pipeline = chain([readableStream, injectorStream, writableStream]).on(
        'end',
        () => {
          // ? Counting expectations with expect.assertions(3)
          expect(true).toBeTrue();
        }
      );

      await finished(pipeline);
    });

    it('errors on backpressure from value token stream and destroys both streams', async () => {
      expect.hasAssertions();

      const duplexStream = new Duplex({
        highWaterMark: 1,
        objectMode: true,
        write(_chunk, _encoding, callback) {
          void callback;
          // ! callback() is not called !
        },
        read() {
          this.push(null);
        }
      });

      const pipeline = chain([
        Readable.from(await tokenizeObject([{}])),
        injectEntry({
          entry: {
            key: 'value',
            valueTokenStreamFactory: async () => duplexStream
          }
        }),
        new Writable({
          objectMode: true,
          write(_chunk, _encoding, callback) {
            callback(null);
          }
        })
      ]);

      await finished(pipeline).catch((error) => {
        expect(duplexStream.destroyed).toBeTrue();
        expect(error).toMatchObject({
          message: 'backpressure deadlock: value token stream high water mark reached'
        });
      });
    });

    it('handles errors from value token stream', async () => {
      expect.hasAssertions();

      const pipeline = chain([
        Readable.from(await tokenizeObject({})),
        injectEntry({
          entry: {
            key: 'value',
            valueTokenStreamFactory: () => {
              return new Readable({
                objectMode: true,
                read() {
                  this.destroy(new Error('bad'));
                }
              });
            }
          }
        }),
        new Writable({
          objectMode: true,
          write(_chunk, _encoding, callback) {
            callback(null);
          }
        })
      ]);

      await finished(pipeline).catch((error) => {
        expect(error).toMatchObject({
          message: 'bad'
        });
      });
    });

    it('excludes the injection key if autoOmitInjectionKey is true', async () => {
      expect.hasAssertions();

      const targetObjects = [{ name: 'object-1' }];

      await expect(
        feedTokenStream(
          tokenizeObject(targetObjects, { excludeFirstAndLast: true }),
          injectEntry({
            autoOmitInjectionKey: true,
            entry: {
              key: 'name',
              valueTokenStreamFactory: async () => Readable.from([])
            }
          })
        )
      ).resolves.toStrictEqual([
        { name: 'startObject' },
        { name: 'startKey' },
        { name: 'stringChunk', value: 'name' },
        { name: 'endKey' },
        { name: 'keyValue', value: 'name' },
        { name: 'endObject' }
      ]);
    });

    it('does not exclude the injection key if autoOmitInjectionKey is false', async () => {
      expect.hasAssertions();

      const targetObjects = [{ name: 'object-1' }];

      await expect(
        feedTokenStream(
          tokenizeObject(targetObjects, { excludeFirstAndLast: true }),
          injectEntry({
            autoOmitInjectionKey: false,
            entry: {
              key: 'name',
              valueTokenStreamFactory: async () => Readable.from([])
            }
          })
        )
      ).resolves.toStrictEqual([
        { name: 'startObject' },
        { name: 'startKey' },
        { name: 'stringChunk', value: 'name' },
        { name: 'endKey' },
        { name: 'keyValue', value: 'name' },
        { name: 'startString' },
        { name: 'stringChunk', value: 'object-1' },
        { name: 'endString' },
        { name: 'stringValue', value: 'object-1' },
        { name: 'startKey' },
        { name: 'stringChunk', value: 'name' },
        { name: 'endKey' },
        { name: 'keyValue', value: 'name' },
        { name: 'endObject' }
      ]);
    });

    it('tokens excluded by autoOmitInjectionKey are still piped into value token Duplex streams with async callbacks', async () => {
      expect.hasAssertions();

      const targetObjects = [
        { name: 'object-1' },
        { name: 'object-2' },
        { name: 'object-3' },
        { name: 'object-4' },
        { name: 'object5' },
        { noname: true }
      ] as const;

      const ownerSymbol = Symbol('owner-symbol');

      await expect(
        feedTokenStream(
          tokenizeObject(targetObjects, { excludeFirstAndLast: true }),
          injectEntry({
            entry: {
              key: 'name',
              valueTokenStreamFactory: () => {
                const tokenBuffer: JsonToken[] = [];

                return chain(
                  [
                    packEntry({ key: 'name', ownerSymbol }),
                    new Duplex({
                      objectMode: true,
                      async write(
                        chunk: JsonToken | JsonPackedEntryToken,
                        _encoding,
                        callback
                      ) {
                        if (
                          chunk.name === packedEntrySymbol &&
                          chunk.owner === ownerSymbol
                        ) {
                          const updatedName =
                            'renamed-object-' +
                            ((chunk.value as string).split('-').at(1) || '???');

                          tokenBuffer.push(...(await tokenizeObject(updatedName)));
                        }

                        callback(null);
                      },
                      async read() {
                        this.once('finish', () => {
                          if (tokenBuffer.length) {
                            tokenBuffer.forEach((token) => this.push(token));
                          } else {
                            this.push({
                              name: 'nullValue',
                              value: null
                            } satisfies JsonToken);
                          }

                          this.push(null);
                        });
                      }
                    })
                  ],
                  { objectMode: true }
                );
              }
            }
          })
        )
      ).resolves.toStrictEqual(
        await tokenizeObject(
          targetObjects.map((obj) => {
            const returnValue =
              'name' in obj
                ? { name: `renamed-object-${obj.name.split('-').at(1) ?? '???'}` }
                : { noname: true, name: null };

            return returnValue as (typeof targetObjects)[number];
          }),
          { excludeFirstAndLast: true }
        )
      );
    });

    it('tokens excluded by autoOmitInjectionKey are still piped into value token Transform streams with async callbacks', async () => {
      expect.hasAssertions();

      const targetObjects = [
        { name: 'object-1' },
        { name: 'object-2' },
        { name: 'object-3' },
        { name: 'object-4' },
        { name: 'object5' },
        { noname: true }
      ] as const;

      const ownerSymbol = Symbol('owner-symbol');

      await expect(
        feedTokenStream(
          tokenizeObject(targetObjects, { excludeFirstAndLast: true }),
          injectEntry({
            entry: {
              key: 'name',
              valueTokenStreamFactory: () => {
                const tokenBuffer: JsonToken[] = [];

                return chain(
                  [
                    packEntry({ key: 'name', ownerSymbol }),
                    new Transform({
                      objectMode: true,
                      async transform(
                        chunk: JsonToken | JsonPackedEntryToken,
                        _encoding,
                        callback
                      ) {
                        if (
                          chunk.name === packedEntrySymbol &&
                          chunk.owner === ownerSymbol
                        ) {
                          const updatedName =
                            'renamed-object-' +
                            ((chunk.value as string).split('-').at(1) || '???');

                          tokenBuffer.push(...(await tokenizeObject(updatedName)));
                        }

                        callback(null);
                      },
                      async flush() {
                        if (tokenBuffer.length) {
                          tokenBuffer.forEach((token) => this.push(token));
                        } else {
                          this.push({
                            name: 'nullValue',
                            value: null
                          } satisfies JsonToken);
                        }

                        this.push(null);
                      }
                    })
                  ],
                  { objectMode: true }
                );
              }
            }
          })
        )
      ).resolves.toStrictEqual(
        await tokenizeObject(
          targetObjects.map((obj) => {
            const returnValue =
              'name' in obj
                ? { name: `renamed-object-${obj.name.split('-').at(1) ?? '???'}` }
                : { noname: true, name: null };

            return returnValue as (typeof targetObjects)[number];
          }),
          { excludeFirstAndLast: true }
        )
      );
    });

    it('respects pathSeparator option and passes it to internal omitEntry stream', async () => {
      expect.hasAssertions();

      const targetObjects = [
        { subObject: { subArray: [{ name: 'object-a' }, { name: 'object-b' }] } },
        { subObject: { subArray: [{ name: 'object-c' }, { name: 'object-d' }] } }
      ];

      const targetObjectsTokens = await tokenizeObject(targetObjects, {
        streamValues: false
      });

      const injectedToken: JsonToken = { name: 'falseValue', value: false };

      await Promise.all([
        expect(
          feedTokenStream(
            targetObjectsTokens,
            injectEntry({
              autoOmitInjectionKey: true,
              pathSeparator: '->',
              streamKeys: false,
              entry: {
                injectionPoint: '1->subObject->subArray->0',
                key: 'name',
                valueTokenStreamFactory: () => Readable.from([injectedToken])
              }
            })
          )
        ).resolves.toStrictEqual(
          targetObjectsTokens.map((token) =>
            token.value === 'object-c' ? injectedToken : token
          )
        ),
        expect(
          feedTokenStream(
            targetObjectsTokens,
            injectEntry({
              autoOmitInjectionKey: true,
              pathSeparator: '->',
              streamKeys: false,
              entry: {
                injectionPoint: /\d+->subObject->subArray->\d+/,
                key: 'name',
                valueTokenStreamFactory: () => Readable.from([injectedToken])
              }
            })
          )
        ).resolves.toStrictEqual(
          targetObjectsTokens.map((token) =>
            typeof token.value === 'string' && token.value.startsWith('object-')
              ? injectedToken
              : token
          )
        )
      ]);
    });

    it('passes autoOmitInjectionKeyFilter to internal omitEntry stream', async () => {
      expect.hasAssertions();

      const targetObjects = [
        { subObject: { subArray: [{ name: 'object-a' }, { name: 'object-b' }] } },
        { subObject: { subArray: [{ name: 'object-c' }, { name: 'object-d' }] } }
      ];

      const targetObjectsTokens = await tokenizeObject(targetObjects, {
        streamValues: false
      });

      const injectedToken: JsonToken = { name: 'falseValue', value: false };

      await expect(
        feedTokenStream(
          targetObjectsTokens,
          injectEntry({
            autoOmitInjectionKey: true,
            autoOmitInjectionKeyFilter: 'does->not->match->anything',
            pathSeparator: '->',
            streamKeys: false,
            entry: {
              injectionPoint: '1->subObject->subArray->0',
              key: 'name',
              valueTokenStreamFactory: () => Readable.from([injectedToken])
            }
          })
        )
      ).resolves.toStrictEqual(
        targetObjectsTokens.flatMap((token) => {
          return token.name === 'stringValue' && token.value === 'object-c'
            ? ([
                token,
                { name: 'keyValue', value: 'name' },
                injectedToken
              ] satisfies JsonToken[])
            : token;
        })
      );
    });

    it('streams new entry keys if streamKeys is true', async () => {
      expect.hasAssertions();

      const targetObjects = [{ name: 'object-1' }];

      await expect(
        feedTokenStream(
          tokenizeObject(targetObjects, { excludeFirstAndLast: true }),
          injectEntry({
            streamKeys: true,
            entry: {
              key: 'name',
              valueTokenStreamFactory: async () =>
                Readable.from([{ name: 'falseValue', value: false } satisfies JsonToken])
            }
          })
        )
      ).resolves.toStrictEqual([
        { name: 'startObject' },
        { name: 'startKey' },
        { name: 'stringChunk', value: 'name' },
        { name: 'endKey' },
        { name: 'keyValue', value: 'name' },
        { name: 'falseValue', value: false },
        { name: 'endObject' }
      ]);
    });

    it('does not stream new entry keys if streamKeys is false', async () => {
      expect.hasAssertions();

      const targetObjects = [{ name: 'object-1' }];

      await expect(
        feedTokenStream(
          tokenizeObject(targetObjects, { excludeFirstAndLast: true }),
          injectEntry({
            streamKeys: false,
            entry: {
              key: 'name',
              valueTokenStreamFactory: async () =>
                Readable.from([{ name: 'falseValue', value: false } satisfies JsonToken])
            }
          })
        )
      ).resolves.toStrictEqual([
        { name: 'startObject' },
        { name: 'keyValue', value: 'name' },
        { name: 'falseValue', value: false },
        { name: 'endObject' }
      ]);
    });

    it('packs new entry keys if packKeys option is true', async () => {
      expect.hasAssertions();

      const targetObjects = [{ name: 'object-1' }];

      await expect(
        feedTokenStream(
          tokenizeObject(targetObjects, { excludeFirstAndLast: true }),
          injectEntry({
            packKeys: true,
            entry: {
              key: 'name',
              valueTokenStreamFactory: async () =>
                Readable.from([{ name: 'falseValue', value: false } satisfies JsonToken])
            }
          })
        )
      ).resolves.toStrictEqual([
        { name: 'startObject' },
        { name: 'startKey' },
        { name: 'stringChunk', value: 'name' },
        { name: 'endKey' },
        { name: 'keyValue', value: 'name' },
        { name: 'falseValue', value: false },
        { name: 'endObject' }
      ]);
    });

    it('does not pack new entry keys if packKeys is false', async () => {
      expect.hasAssertions();

      const targetObjects = [{ name: 'object-1' }];

      await expect(
        feedTokenStream(
          tokenizeObject(targetObjects, { excludeFirstAndLast: true }),
          injectEntry({
            packKeys: false,
            entry: {
              key: 'name',
              valueTokenStreamFactory: async () =>
                Readable.from([{ name: 'falseValue', value: false } satisfies JsonToken])
            }
          })
        )
      ).resolves.toStrictEqual([
        { name: 'startObject' },
        { name: 'startKey' },
        { name: 'stringChunk', value: 'name' },
        { name: 'endKey' },
        { name: 'falseValue', value: false },
        { name: 'endObject' }
      ]);
    });

    it('streams new entry keys but does not pack them if streamKeys and packKeys are both false', async () => {
      expect.hasAssertions();

      const targetObjects = [{ name: 'object-1' }];

      await expect(
        feedTokenStream(
          tokenizeObject(targetObjects, { excludeFirstAndLast: true }),
          injectEntry({
            streamKeys: false,
            packKeys: false,
            entry: {
              key: 'name',
              valueTokenStreamFactory: async () =>
                Readable.from([{ name: 'falseValue', value: false } satisfies JsonToken])
            }
          })
        )
      ).resolves.toStrictEqual([
        { name: 'startObject' },
        { name: 'startKey' },
        { name: 'stringChunk', value: 'name' },
        { name: 'endKey' },
        { name: 'falseValue', value: false },
        { name: 'endObject' }
      ]);
    });
  });
});

describe('|>object-sieve', () => {
  describe('::objectSieve', () => {
    const complexTargetObjects = [
      {
        something: 'else',
        subObject: {
          subArray: [
            { name: 'thingy-1', id: 1 },
            { name: 'object-5', id: 5 }
          ]
        }
      },
      {
        subObject: {
          something: 'else',
          subArray: [
            { something: 'else' },
            { name: 'thingy-2', id: 2 },
            { name: 'object-4', id: 4 }
          ]
        }
      },
      {
        something: 'else',
        subObject: {
          something: 'else',
          subArray: [
            { name: 'thingy-3', id: 3 },
            { something: 'else' },
            { name: 'object-3', id: 3 }
          ]
        }
      },
      {
        something: 'else',
        subObject: {
          something: 'else',
          subArray: [
            { name: 'thingy-4', id: 4 },
            { name: 'object-2', id: 2 },
            { something: 'else' }
          ]
        }
      },
      {
        something: 'else',
        subObject: {
          something: 'else',
          subArray: [
            { something: 'else' },
            { name: 'thingy-5', id: 5 },
            { name: 'object-1', id: 1 }
          ]
        }
      }
    ] as const;

    it('discards objects that do not satisfy filter value', async () => {
      expect.hasAssertions();

      const targetObjects = [
        { name: 'object-1' },
        { name: 'object-2' },
        { name: 'object-3' },
        { name: 'object-4' },
        { name: 'object-5' }
      ];

      await expect(
        feedTokenStream(
          tokenizeObject(targetObjects, { excludeFirstAndLast: true }),
          objectSieve({
            filter: [['name', 'object-3']]
          })
        )
      ).resolves.toStrictEqual(await tokenizeObject({ name: 'object-3' }));
    });

    it('discards objects that do not satisfy RegExp filter key', async () => {
      expect.hasAssertions();

      const targetObjects = [
        { name: 'object-1' },
        { name: 'object-2' },
        { name: 'object-3' },
        { name: 'object-4' },
        { name: 'object-5' }
      ];

      await expect(
        feedTokenStream(
          tokenizeObject(targetObjects, { excludeFirstAndLast: true }),
          objectSieve({
            filter: [[/^n/, 'object-3']]
          })
        )
      ).resolves.toStrictEqual(await tokenizeObject({ name: 'object-3' }));
    });

    it('discards all objects when no keys match string filter key', async () => {
      expect.hasAssertions();

      const targetObjects = [
        { name: 'object-1' },
        { name: 'object-2' },
        { name: 'object-3' },
        { name: 'object-4' },
        { name: 'object-5' }
      ];

      await expect(
        feedTokenStream(
          tokenizeObject(targetObjects, { excludeFirstAndLast: true }),
          objectSieve({
            filter: [['id', 1]]
          })
        )
      ).resolves.toStrictEqual([]);
    });

    it('discards all objects when no keys match RegExp filter key', async () => {
      expect.hasAssertions();

      const targetObjects = [
        { name: 'object-1' },
        { name: 'object-2' },
        { name: 'object-3' },
        { name: 'object-4' },
        { name: 'object-5' }
      ];

      await expect(
        feedTokenStream(
          tokenizeObject(targetObjects, { excludeFirstAndLast: true }),
          objectSieve({
            filter: [[/^.*$/, 1]]
          })
        )
      ).resolves.toStrictEqual([]);
    });

    it('returns the correct result when filter contains duplicate keys', async () => {
      expect.hasAssertions();

      const targetObjects = [
        { name: 'object-1' },
        { name: 'object-2' },
        { name: 'object-3' },
        { name: 'object-4' },
        { name: 'object-5' }
      ];

      await expect(
        feedTokenStream(
          tokenizeObject(targetObjects, { excludeFirstAndLast: true }),
          objectSieve({
            filter: [
              ['name', 'object-3'],
              ['name', 'object-4']
            ]
          })
        )
      ).resolves.toStrictEqual(await tokenizeObject({ name: 'object-3' }));
    });

    it('returns the correct result when filter contains overlapping keys', async () => {
      expect.hasAssertions();

      const targetObjects = [
        { name: 'object-1' },
        { name: 'object-2' },
        { name: 'object-3' },
        { name: 'object-4' },
        { name: 'object-5' }
      ];

      await expect(
        feedTokenStream(
          tokenizeObject(targetObjects, { excludeFirstAndLast: true }),
          objectSieve({
            filter: [
              [/^.*$/, 'object-3'],
              ['name', 'object-4']
            ]
          })
        )
      ).resolves.toStrictEqual(await tokenizeObject({ name: 'object-3' }));
    });

    it('matches multiple possible values for the same key via SieveFunction', async () => {
      expect.hasAssertions();

      const targetObjects = [
        { name: 'object-1' },
        { name: 'object-2' },
        { name: 'object-3' },
        { name: 'object-4' },
        { name: 'object-5' }
      ];

      await expect(
        feedTokenStream(
          tokenizeObject(targetObjects, { excludeFirstAndLast: true }),
          objectSieve({
            filter: [
              [
                'name',
                (value) => {
                  return value === 'object-3' || value === 'object-4';
                }
              ]
            ]
          })
        )
      ).resolves.toStrictEqual(
        await tokenizeObject([{ name: 'object-3' }, { name: 'object-4' }], {
          excludeFirstAndLast: true
        })
      );
    });

    it('discards objects that do not satisfy any of multiple filter values', async () => {
      expect.hasAssertions();

      const targetObjects = [
        { name: 'object-1', id: 1 },
        { name: 'object-2', id: 2 },
        { name: 'object-3', id: 3 },
        { name: 'object-4', id: 4 },
        { name: 'object-5', id: 5 }
      ];

      await expect(
        feedTokenStream(
          tokenizeObject(targetObjects, { excludeFirstAndLast: true }),
          objectSieve({
            filter: [
              ['name', 'object-3'],
              ['id', 1]
            ]
          })
        )
      ).resolves.toStrictEqual(
        await tokenizeObject(
          [
            { name: 'object-1', id: 1 },
            { name: 'object-3', id: 3 }
          ],
          { excludeFirstAndLast: true }
        )
      );
    });

    it('discards all objects when filter value types do not match', async () => {
      expect.hasAssertions();

      const targetObjects = [
        { name: 'object-1', id: 1 },
        { name: 'object-2', id: 2 },
        { name: 'object-3', id: 3 },
        { name: 'object-4', id: 4 },
        { name: 'object-5', id: 5 }
      ];

      await expect(
        feedTokenStream(
          tokenizeObject(targetObjects, { excludeFirstAndLast: true }),
          objectSieve({
            filter: [['id', '1']]
          })
        )
      ).resolves.toStrictEqual([]);
    });

    it('discards objects that do not satisfy filters with deep string key', async () => {
      expect.hasAssertions();

      await expect(
        feedTokenStream(
          tokenizeObject(complexTargetObjects, { excludeFirstAndLast: true }),
          objectSieve({
            filter: [
              ['subObject.subArray.1.name', (v) => Boolean(v?.toString().endsWith('5'))]
            ]
          })
        )
      ).resolves.toStrictEqual(
        await tokenizeObject([complexTargetObjects[0], complexTargetObjects[4]], {
          excludeFirstAndLast: true
        })
      );
    });

    it('discards objects that do not satisfy filters with deep RegExp key', async () => {
      expect.hasAssertions();

      await expect(
        feedTokenStream(
          tokenizeObject(complexTargetObjects, { excludeFirstAndLast: true }),
          objectSieve({
            filter: [
              [
                /^subObject\.subArray\.\d+\.id/,
                (v) => (v as number) % 2 === 0 || (v as number) === 1
              ]
            ]
          })
        )
      ).resolves.toStrictEqual(
        await tokenizeObject(
          [...complexTargetObjects.slice(0, 2), ...complexTargetObjects.slice(3)],
          { excludeFirstAndLast: true }
        )
      );
    });

    it('discards objects that do not satisfy filters with non-array object values', async () => {
      expect.hasAssertions();

      await expect(
        feedTokenStream(
          tokenizeObject(complexTargetObjects, { excludeFirstAndLast: true }),
          objectSieve({
            filter: [['subObject', complexTargetObjects[4].subObject]]
          })
        )
      ).resolves.toStrictEqual(
        await tokenizeObject([complexTargetObjects[4]], {
          excludeFirstAndLast: true
        })
      );
    });

    it('discards objects that do not satisfy filters with array values', async () => {
      expect.hasAssertions();

      await expect(
        feedTokenStream(
          tokenizeObject(complexTargetObjects, { excludeFirstAndLast: true }),
          objectSieve({
            filter: [['subObject.subArray', complexTargetObjects[0].subObject.subArray]]
          })
        )
      ).resolves.toStrictEqual(
        await tokenizeObject([complexTargetObjects[0]], {
          excludeFirstAndLast: true
        })
      );
    });

    it('discards objects that do not satisfy filters with null values', async () => {
      expect.hasAssertions();

      await expect(
        feedTokenStream(
          tokenizeObject([{ a: 1 }, { a: null }, {}], { excludeFirstAndLast: true }),
          objectSieve({
            filter: [['a', null]]
          })
        )
      ).resolves.toStrictEqual(
        await tokenizeObject([{ a: null }], {
          excludeFirstAndLast: true
        })
      );
    });

    it('discards all objects if no filters provided', async () => {
      expect.hasAssertions();

      await expect(
        feedTokenStream(
          tokenizeObject(complexTargetObjects, { excludeFirstAndLast: true }),
          objectSieve({
            filter: []
          })
        )
      ).resolves.toStrictEqual([]);
    });

    it('respects pathSeparator option and passes it to internal packEntry stream', async () => {
      expect.hasAssertions();

      await expect(
        feedTokenStream(
          tokenizeObject(complexTargetObjects, { excludeFirstAndLast: true }),
          objectSieve({
            pathSeparator: '->',
            filter: [
              [
                /^subObject->subArray->\d+->id/,
                (v) => (v as number) % 2 === 0 || (v as number) === 1
              ]
            ]
          })
        )
      ).resolves.toStrictEqual(
        await tokenizeObject(
          [...complexTargetObjects.slice(0, 2), ...complexTargetObjects.slice(3)],
          { excludeFirstAndLast: true }
        )
      );
    });

    it('passes root non-object primitives and arrays through the sieve without incident', async () => {
      expect.hasAssertions();

      await expect(
        feedTokenStream(
          tokenizeObject(
            [1, 'string', true, false, null, [{ a: 1 }, { a: 1 }], { a: 1 }],
            { excludeFirstAndLast: true }
          ),
          objectSieve({
            filter: [[/^.*$/, () => false]]
          })
        )
      ).resolves.toStrictEqual(
        await tokenizeObject([1, 'string', true, false, null, [{ a: 1 }, { a: 1 }]], {
          excludeFirstAndLast: true
        })
      );

      await expect(
        feedTokenStream(
          tokenizeObject(
            [1, 'string', true, false, null, [{ a: 1 }, { a: 1 }], { a: 1 }],
            { excludeFirstAndLast: true }
          ),
          objectSieve({ filter: [] })
        )
      ).resolves.toStrictEqual(
        await tokenizeObject([1, 'string', true, false, null, [{ a: 1 }, { a: 1 }]], {
          excludeFirstAndLast: true
        })
      );
    });

    it('handles chaining multiple sieves together', async () => {
      expect.hasAssertions();

      await expect(
        feedTokenStream(
          tokenizeObject(complexTargetObjects, { excludeFirstAndLast: true }),
          chain([
            objectSieve({
              filter: [
                ['subObject.subArray.0.id', (v) => (v as number) > 3],
                [/^subObject\.subArray\.\d+\.id/, (v) => (v as number) % 2 === 0]
              ]
            })
          ])
        )
      ).resolves.toStrictEqual(
        await tokenizeObject([complexTargetObjects[1], complexTargetObjects[3]], {
          excludeFirstAndLast: true
        })
      );

      await expect(
        feedTokenStream(
          tokenizeObject(complexTargetObjects, { excludeFirstAndLast: true }),
          chain([
            objectSieve({
              filter: [['subObject.subArray.0.id', (v) => (v as number) > 3]]
            }),
            objectSieve({
              filter: [[/^subObject\.subArray\.\d+\.id/, (v) => (v as number) % 2 === 0]]
            })
          ])
        )
      ).resolves.toStrictEqual(
        await tokenizeObject([complexTargetObjects[3]], {
          excludeFirstAndLast: true
        })
      );
    });
  });
});

describe('|>omit-entry', () => {
  describe('::omitEntry', () => {
    const targetObjects = [
      { a: 1, b: 'two', c: 3, d: false },
      { a: 1, b: 2, c: 3, d: true },
      { b: 2, c: 3, d: null },
      { a: 'one', b: [{ a: 1, b: 'two', c: 3, d: false }] },
      { b: { a: 1 }, c: { d: false } }
    ] as const;

    it('omits entries with keys matching key string', async () => {
      expect.hasAssertions();

      await expect(
        feedTokenStream(tokenizeObject(targetObjects), omitEntry({ key: '0.a' }))
      ).resolves.toStrictEqual(
        await tokenizeObject(
          targetObjects.map((obj, index) => {
            if (index === 0) {
              const { a: _, ...result } = obj as { a: unknown };
              return result;
            } else {
              return obj;
            }
          })
        )
      );
    });

    it('omits entries with keys matching RegExp string', async () => {
      expect.hasAssertions();

      await expect(
        feedTokenStream(tokenizeObject(targetObjects), omitEntry({ key: /^\d+\.a$/ }))
      ).resolves.toStrictEqual(
        await tokenizeObject(
          targetObjects.map((obj) => {
            const { a: _, ...result } = obj as { a: unknown };
            return result;
          })
        )
      );
    });

    it('omits entries with keys matching one or more key strings or RegExps', async () => {
      expect.hasAssertions();

      await expect(
        feedTokenStream(
          tokenizeObject(targetObjects),
          omitEntry({ key: ['0.a', '0.b', 'x', /d$/] })
        )
      ).resolves.toStrictEqual(
        await tokenizeObject([
          { c: 3 },
          { a: 1, b: 2, c: 3 },
          { b: 2, c: 3 },
          { a: 'one', b: [{ a: 1, b: 'two', c: 3 }] },
          { b: { a: 1 }, c: {} }
        ])
      );
    });

    it('omits entries in stream of non-array objects', async () => {
      expect.hasAssertions();

      await expect(
        feedTokenStream(
          tokenizeObject(targetObjects, { excludeFirstAndLast: true }),
          omitEntry({ key: 'c' })
        )
      ).resolves.toStrictEqual(
        await tokenizeObject(
          targetObjects.map((obj) => {
            const { c: _, ...result } = obj as { c: unknown };
            return result;
          }),
          { excludeFirstAndLast: true }
        )
      );
    });

    it('omits entries with keys matching deep key', async () => {
      expect.hasAssertions();

      await expect(
        feedTokenStream(tokenizeObject(targetObjects), omitEntry({ key: '4.c.d' }))
      ).resolves.toStrictEqual(
        await tokenizeObject([
          { a: 1, b: 'two', c: 3, d: false },
          { a: 1, b: 2, c: 3, d: true },
          { b: 2, c: 3, d: null },
          { a: 'one', b: [{ a: 1, b: 'two', c: 3, d: false }] },
          { b: { a: 1 }, c: {} }
        ])
      );
    });

    it('respects pathSeparator option and passes it to internal packEntry stream', async () => {
      expect.hasAssertions();

      await expect(
        feedTokenStream(
          tokenizeObject(targetObjects),
          omitEntry({ pathSeparator: '->', key: '4->c->d' })
        )
      ).resolves.toStrictEqual(
        await tokenizeObject([
          { a: 1, b: 'two', c: 3, d: false },
          { a: 1, b: 2, c: 3, d: true },
          { b: 2, c: 3, d: null },
          { a: 'one', b: [{ a: 1, b: 'two', c: 3, d: false }] },
          { b: { a: 1 }, c: {} }
        ])
      );
    });

    it('omits entries even with keys are not packed', async () => {
      expect.hasAssertions();

      await expect(
        feedTokenStream(
          tokenizeObject(targetObjects, { packValues: false }),
          omitEntry({ key: '0.a' })
        )
      ).resolves.toStrictEqual(
        await tokenizeObject(
          targetObjects.map((obj, index) => {
            if (index === 0) {
              const { a: _, ...result } = obj as { a: unknown };
              return result;
            } else {
              return obj;
            }
          }),
          { packValues: false }
        )
      );
    });

    it('omits entries even with keys are not streamed', async () => {
      expect.hasAssertions();

      await expect(
        feedTokenStream(
          tokenizeObject(targetObjects, { streamValues: false }),
          omitEntry({ key: '0.a' })
        )
      ).resolves.toStrictEqual(
        await tokenizeObject(
          targetObjects.map((obj, index) => {
            if (index === 0) {
              const { a: _, ...result } = obj as { a: unknown };
              return result;
            } else {
              return obj;
            }
          }),
          { streamValues: false }
        )
      );
    });
  });
});

describe('|>select-entry', () => {
  describe('::selectEntry', () => {
    const targetObject = {
      metadata: 'some-data',
      'something@else': { hello: 'world', true: false },
      value: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]
    };

    it('todo', async () => {
      expect.hasAssertions();
    });
  });
});
