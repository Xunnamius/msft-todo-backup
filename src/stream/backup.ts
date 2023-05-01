import assert from 'node:assert';
import path from 'node:path';
import { Writable } from 'node:stream';
import { createWriteStream, rename as renameFile, type WriteStream } from 'node:fs';
import { isNativeError } from 'node:util/types';

import { Transform, chain } from 'stream-chain';
import { fork } from 'stream-fork';
import { Base64Decode } from 'base64-stream';

import * as msft from 'universe/msft';

import {
  attachmentsStorageDirectory,
  getFilenameFromAttachmentMetadata,
  unserializeMetadata,
  serializeMetadata,
  storageDirectory
} from 'universe/fs';
import { makeSafeCallback } from 'multiverse/make-safe-callback';

import {
  objectSieve,
  injectEntry,
  packEntry,
  bigStringStringer,
  packedEntrySymbol,
  type JsonPackedEntryToken,
  type JsonToken,
  type GenericJsonToken
} from 'multiverse/stream-json-extended';

import type Chain from 'stream-chain';
import type { BackupMetadata } from 'types/global';
import { stringToMd5Hex } from '../crypto';

export const listIdSymbol = Symbol('list-id');
export const listNameSymbol = Symbol('list-name');
export const taskIdSymbol = Symbol('task-id');
export const taskTitleSymbol = Symbol('task-title');
export const attachmentIdSymbol = Symbol('attachment-id');
export const attachmentNameSymbol = Symbol('attachment-name');
export const attachmentContentTypeSymbol = Symbol('attachment-content-type');
export const attachmentContentBytesSymbol = Symbol('attachment-content-bytes');

export function createBackupPipeline(listNames?: string[]) {
  const createdAt = Date.now();
  return chain([
    msft.createListsStream(),
    objectSieve({
      filter: [
        [
          'displayName',
          (value) => {
            return listNames ? listNames.includes(value as string) : true;
          }
        ]
      ]
    }),
    packEntry({ key: 'id', ownerSymbol: listIdSymbol }),
    injectEntry({
      entry: {
        key: 'tasks',
        valueTokenStreamFactory: () => msft.createTasksStream({ idSymbol: listIdSymbol })
      }
    }),
    packEntry({ key: /^tasks\.\d+\.id$/, ownerSymbol: taskIdSymbol }),
    fork([createDataSink(createdAt), createMetadataSink(createdAt)])
  ]);
}

export function createDataSink(createdAt: number) {
  return chain([
    injectEntry({
      entry: {
        injectionPoint: /^tasks\.\d+$/,
        key: 'attachments',
        valueTokenStreamFactory: () =>
          msft.createAttachmentsStream({ idSymbol: taskIdSymbol })
      }
    }),
    fork([createAttachmentsContentBytesSink(), createBackupSink(createdAt)])
  ]);
}

export function createMetadataSink(createdAt: number) {
  let metadata: BackupMetadata;
  let sawListId = false;
  let sawListName = false;
  let sawTaskId = false;
  let sawTaskTitle = false;

  return chain([
    packEntry({ key: 'displayName', ownerSymbol: listNameSymbol }),
    packEntry({ key: /^tasks\.\d+\.title$/, ownerSymbol: taskTitleSymbol }),
    new Writable({
      objectMode: true,
      async construct(callback) {
        try {
          metadata = ((await unserializeMetadata()) || []).filter(
            (entry) => !entry.partial
          );

          metadata.unshift({
            partial: false,
            index: 0,
            filename: `backup-${createdAt}.json`,
            createdAt: createdAt,
            lists: []
          });

          callback(null);
        } catch (error) {
          callback(isNativeError(error) ? error : new Error(String(error)));
        }
      },
      async write(
        chunk: JsonToken | JsonPackedEntryToken | msft.JsonFinalToken,
        _encoding,
        callback
      ) {
        try {
          if (chunk.name === msft.finalTokenSymbol) {
            const data = metadata.map((entry, index) => {
              entry.index = index + 1;
              return entry;
            });

            await serializeMetadata({ data });
          } else if (chunk.name === packedEntrySymbol) {
            const currentBackupMetadata = metadata.at(0);
            const isSeenListEntriesConsistent = sawListId === sawListName;
            const isSeenTaskEntriesConsistent = sawTaskId === sawTaskTitle;

            assert(currentBackupMetadata !== undefined);

            if (isSeenListEntriesConsistent && !sawListId) {
              currentBackupMetadata.lists.push({
                id: '???',
                displayName: '???',
                tasks: []
              });
            }

            const currentBackupListMetadata = currentBackupMetadata.lists.at(-1);
            assert(currentBackupListMetadata !== undefined);

            if (isSeenTaskEntriesConsistent && !sawTaskId) {
              currentBackupListMetadata.tasks.push({
                id: '???',
                titleHash: '???'
              });
            }

            const currentBackupTaskMetadata = currentBackupListMetadata.tasks.at(-1);
            assert(currentBackupTaskMetadata !== undefined);

            // ? We require that all lists have either an id or a displayName.
            if (chunk.owner === listIdSymbol) {
              if (!isSeenListEntriesConsistent && sawListId) {
                // ? This means we encountered a list without a displayName,
                // ? which is not currently supported.
                throw new Error(`list id "${chunk.value}" is missing an "id" property`);
              }

              sawListId = true;
              currentBackupListMetadata.id = String(chunk.value);
            } else if (chunk.owner === listNameSymbol) {
              if (!isSeenListEntriesConsistent && sawListName) {
                // ? This means we encountered a list without a name, which is
                // ? not currently supported.
                throw new Error(
                  `list "${chunk.value}" is missing a "displayName" property`
                );
              }

              sawListName = true;
              currentBackupListMetadata.displayName = String(chunk.value);
            } else if (chunk.owner === taskIdSymbol) {
              if (!isSeenTaskEntriesConsistent && sawTaskId) {
                // ? This means we encountered a task without an id, which is
                // ? not currently supported.
                throw new Error(`task "${chunk.value}" is missing an "id" property`);
              }

              sawTaskId = true;
              currentBackupTaskMetadata.id = String(chunk.value);
            } else if (chunk.owner === taskTitleSymbol) {
              if (!isSeenTaskEntriesConsistent && sawTaskTitle) {
                // ? This means we encountered a task without a title, which is
                // ? not currently supported.
                throw new Error(`task "${chunk.value}" is missing a "title" property`);
              }

              sawTaskTitle = true;
              currentBackupTaskMetadata.titleHash = await stringToMd5Hex(
                String(chunk.value)
              );
            }

            if (sawListId === sawListName) {
              sawListId = sawListName = false;
            }

            if (sawTaskId === sawTaskTitle) {
              sawTaskId = sawTaskTitle = false;
            }
          }

          callback(null);
        } catch (error) {
          callback(isNativeError(error) ? error : new Error(String(error)));
        }
      },
      async destroy(error, callback) {
        try {
          const currentBackupMetadata = metadata.at(0);

          if (currentBackupMetadata) {
            currentBackupMetadata.partial = true;
            currentBackupMetadata.filename = `backup-${createdAt}-partial.json`;
          }

          await serializeMetadata({ data: metadata });
          callback(error);
        } catch (error_) {
          const guaranteedError = isNativeError(error)
            ? (error_ as Error)
            : new Error(String(error));

          guaranteedError.cause = error;
          callback(guaranteedError);
        }
      }
    })
  ]);
}

export function createAttachmentsContentBytesSink() {
  return chain([
    packEntry({
      key: /^tasks\.\d+\.attachments\.\d+\.id$/,
      ownerSymbol: attachmentIdSymbol
    }),
    msft.createAttachmentsContentBytesStream({ idSymbol: attachmentIdSymbol }),
    new Writable({
      objectMode: true,
      write(chunk: JsonToken | GenericJsonToken, _encoding, callback_) {
        const safeCallback = makeSafeCallback(callback_);
        let outputPipeline: Chain | undefined;

        try {
          if (chunk.name === msft.attachmentFilePathSymbol) {
            assert(outputPipeline === undefined);
            outputPipeline = chain([
              new Base64Decode(),
              createWriteStream(chunk.value as string)
            ]);
            outputPipeline.on('error', (error) => safeCallback(error));
            safeCallback(null);
          } else if (chunk.name === 'startString') {
            assert(outputPipeline !== undefined);
            safeCallback(null);
          } else if (chunk.name === 'endString') {
            assert(outputPipeline !== undefined);
            (outputPipeline.streams[1] as WriteStream).close();
            outputPipeline = undefined;
            safeCallback(null);
          } else {
            assert(outputPipeline !== undefined);
            if (!outputPipeline.write(chunk.value as string)) {
              outputPipeline.once('drain', () => safeCallback(null));
            } else {
              safeCallback(null);
            }
          }
        } catch (error) {
          safeCallback(isNativeError(error) ? error : new Error(String(error)));
        }
      }
    })
  ]);
}

export function createBackupSink(createdAt: number) {
  const backupFilePath = path.join(storageDirectory, `backup-${createdAt}.json`);
  const writeStream = createWriteStream(backupFilePath);

  return chain([
    new Transform({
      objectMode: true,
      transform(chunk: JsonToken | msft.JsonFinalToken, _encoding, callback) {
        if (chunk.name === msft.finalTokenSymbol) {
          this.push(null);
        } else {
          this.push(chunk);
        }

        callback(null);
      }
    }),
    bigStringStringer({ makeArray: true }),
    writeStream
  ]).on('error', () => {
    writeStream.end(async () => {
      renameFile(
        backupFilePath,
        path.join(storageDirectory, `backup-${createdAt}-partial.json`),
        (renameError) => {
          if (renameError) {
            // eslint-disable-next-line no-console
            console.error(
              'deep error while renaming backup file to partial:',
              renameError
            );
          }
        }
      );
    });
  });
}
