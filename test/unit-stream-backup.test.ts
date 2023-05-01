import fs from 'node:fs';
import { Writable, Transform } from 'node:stream';

import { chain } from 'stream-chain';

import {
  createBackupPipeline,
  createDataSink,
  createMetadataSink,
  createAttachmentsContentBytesSink,
  createBackupSink
} from 'universe/stream/backup';

import * as msft from 'universe/msft';
import { attachmentsStorageDirectory, storageDirectory } from 'universe/fs';
import { tokenizeObject, feedTokenStream } from 'multiverse/stream-json-extended/util';
import { withMockedOutput } from 'testverse/setup';

import type { BackupData } from 'types/global';
import type { JsonArray, ReadonlyDeep } from 'type-fest';
import type { TaskFileAttachment } from '@microsoft/microsoft-graph-types';
import type { JsonToken } from 'multiverse/stream-json-extended';
import type { AnyFunction } from '@xunnamius/types';

type MockedFunction<T extends AnyFunction> = jest.MockedFunction<T>;
type SpiedFunction<T extends AnyFunction> = jest.SpyInstance<
  ReturnType<T>,
  Parameters<T>
>;

let mockWriteStreamOutput: Record<string, string>;
let createWriteStreamSpy: SpiedFunction<typeof fs.createWriteStream>;
let renameSpy: SpiedFunction<typeof fs.rename>;

const mockBackupData = [
  {
    id: 'list-id-1',
    displayName: 'list-name-1',
    isOwner: true,
    isShared: false,
    tasks: [
      {
        id: 'task-id-1',
        title: 'task-title-1',
        body: { content: 'big-task-body-1', contentType: 'text' },
        attachments: [{ id: 'attachment-id-1', contentType: 'image/png' }]
      },
      {
        id: 'task-id-2',
        title: 'task-title-2',
        body: { content: 'big-task-body-2', contentType: 'text' },
        attachments: []
      }
    ]
  },
  {
    id: 'list-id-2',
    displayName: 'list-name-2',
    isOwner: true,
    isShared: false,
    tasks: [
      {
        id: 'task-id-3',
        title: 'task-title-3',
        body: { content: 'big-task-body-3', contentType: 'text' },
        attachments: []
      },
      {
        id: 'task-id-4',
        title: 'task-title-4',
        importance: 'high',
        body: { content: 'big-task-body-4', contentType: 'text' },
        attachments: [{ id: 'attachment-id-2', contentType: 'image/png' }]
      }
    ]
  },
  {
    id: 'list-id-3',
    displayName: 'list-name-3',
    tasks: []
  }
] as const satisfies ReadonlyDeep<BackupData>;

const mockAttachments = [
  {
    id: 'attachment-id-1',
    contentType: 'image/png',
    name: 'some-image',
    size: 5,
    lastModifiedDateTime: new Date().toISOString(),
    contentBytes: Buffer.from('abcde').toString('base64')
  },
  {
    id: 'attachment-id-2',
    contentType: 'image/gif',
    size: 6,
    contentBytes: Buffer.from('123456').toString('base64')
  }
] as const satisfies ReadonlyDeep<TaskFileAttachment[]>;

let mockBackupDataTokens: JsonToken[];
let mockAttachmentsTokens: JsonToken[];
let mockCreateWriteStreamCloseError: Error | undefined = undefined;

beforeAll(async () => {
  mockBackupDataTokens = await tokenizeObject(mockBackupData as JsonArray, {
    streamValues: false,
    streamStrings: true,
    packValues: true,
    packStrings: false,
    excludeFirstAndLast: true
  });

  mockAttachmentsTokens = await tokenizeObject(mockAttachments as JsonArray, {
    streamValues: false,
    streamStrings: true,
    packValues: true,
    packStrings: false,
    excludeFirstAndLast: true
  });
});

beforeEach(() => {
  mockWriteStreamOutput = {};

  createWriteStreamSpy = jest.spyOn(fs, 'createWriteStream').mockImplementation(((
    path_: string
  ) => {
    const path = path_.toString();
    mockWriteStreamOutput[path] = '';

    const stream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        mockWriteStreamOutput[path] += chunk.toString('utf8');
        callback(null);
      }
    }) as ReturnType<typeof fs.createWriteStream>;

    stream.close = (callback) => {
      stream.end(() => callback?.(mockCreateWriteStreamCloseError || null));
    };

    return stream;
  }) as unknown as typeof fs.createWriteStream);

  renameSpy = jest
    .spyOn(fs, 'rename')
    .mockImplementation((_old, _new, callback) => callback(null));
});

describe('::createBackupSink', () => {
  it('functions as sink for backup chunks', async () => {
    expect.hasAssertions();

    const path = `${storageDirectory}/backup-0.json`;

    await feedTokenStream(
      [...mockBackupDataTokens, { name: finalTokenSymbol }],
      createBackupSink(0)
    );

    expect(mockWriteStreamOutput).toContainAllKeys([path]);
    expect(mockWriteStreamOutput[path]).toBe(JSON.stringify(mockBackupData));
  });

  it('renames the backup file to a partial when a write stream error occurs', async () => {
    expect.hasAssertions();

    const oldPath = `${storageDirectory}/backup-123.json`;
    const updatedPath = `${storageDirectory}/backup-123-partial.json`;
    let counter = 0;

    jest.spyOn(fs, 'createWriteStream').mockImplementation(((path_: string) => {
      const path = path_.toString();
      mockWriteStreamOutput[path] = '';
      return new Writable({
        write(chunk: Buffer, _encoding, callback) {
          if (counter++ < 5) {
            mockWriteStreamOutput[path] += chunk.toString('utf8');
            callback(null);
          } else {
            callback(new Error('something bad happened'));
          }
        }
      });
    }) as unknown as typeof fs.createWriteStream);

    await expect(
      feedTokenStream(
        [...mockBackupDataTokens, { name: finalTokenSymbol }],
        createBackupSink(123)
      )
    ).rejects.toThrow('something bad happened');

    expect(mockWriteStreamOutput).toContainAllKeys([oldPath]);
    // ? Only the first five tokens get stringified
    expect(mockWriteStreamOutput[oldPath]).toBe('[{"id":"list-id-1');
    expect(renameSpy.mock.calls).toStrictEqual([
      [oldPath, updatedPath, expect.any(Function)]
    ]);
  });

  it('reports deep errors while renaming backup file to partial', async () => {
    expect.hasAssertions();

    jest.spyOn(fs, 'createWriteStream').mockImplementation((() => {
      return new Writable({
        write(_chunk: Buffer, _encoding, callback) {
          callback(new Error('something bad happened'));
        }
      });
    }) as unknown as typeof fs.createWriteStream);

    jest
      .spyOn(fs, 'rename')
      .mockImplementation((_old, _new, callback) => callback(new Error('bAd')));

    await withMockedOutput(async ({ errorSpy }) => {
      await expect(
        feedTokenStream(
          [...mockBackupDataTokens, { name: finalTokenSymbol }],
          createBackupSink(123)
        )
      ).rejects.toThrow('something bad happened');

      expect(errorSpy.mock.calls).toStrictEqual([
        [
          expect.stringContaining('deep error while renaming'),
          expect.objectContaining({ message: 'bAd' })
        ]
      ]);
    });
  });
});

describe('::createAttachmentsContentBytesSink', () => {
  it.only('functions as sink for attachment chunks', async () => {
    expect.hasAssertions();

    const path1 = `${attachmentsStorageDirectory}/some-image-x.png`;
    const path2 = `${attachmentsStorageDirectory}/x.gif`;

    jest.spyOn(msft, 'createAttachmentsContentBytesStream').mockImplementation((() => {
      return new Transform({
        objectMode: true,
        transform(chunk, _encoding, callback) {
          this.push(chunk.name === msft.finalTokenSymbol ? null : chunk);
          callback(null);
        }
      });
    }) as unknown as typeof msft.createAttachmentsContentBytesStream);

    await feedTokenStream(
      [
        {
          // TODO: special tokens
        },
        { name: msft.finalTokenSymbol }
      ],
      createAttachmentsContentBytesSink()
    );

    expect(mockWriteStreamOutput).toStrictEqual({
      [path1]: mockAttachments[0].contentBytes,
      [path2]: mockAttachments[1].contentBytes
    });
  });
});
