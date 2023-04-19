import assert from 'node:assert';
import { Transform, Writable } from 'node:stream';
import { createWriteStream } from 'node:fs';

import { chain } from 'stream-chain';
import { fork } from 'stream-fork';
import { stringer } from 'stream-json/Stringer.js';
import { objectSieve, injectEntry, packEntry } from 'multiverse/stream-json-extended';

import * as msft from 'universe/msft';

import type { AnyFunction } from '@xunnamius/types';

export function runBackupPipeline(options?: { listNames?: string[] }) {
  const { listNames } = options || {};
  const listIdSymbol = Symbol('list-id');
  const taskIdSymbol = Symbol('task-id');
  const attachmentIdSymbol = Symbol('attachment-id');

  let deferredResolve: AnyFunction | undefined = undefined;
  let deferredReject: AnyFunction | undefined = undefined;

  const pipeline = chain(createBackupPipeline());
  pipeline.on('finish', () => deferredResolve?.());
  pipeline.on('error', () => deferredReject?.());

  const pipelineIsDrained = new Promise((resolve, reject) => {
    deferredResolve = resolve;
    deferredReject = reject;
  });

  assert(deferredResolve !== undefined && deferredReject !== undefined);

  return { pipeline, pipelineIsDrained };

  function createBackupPipeline() {
    return [
      msft.createListsStream(),
      ...(listNames ? [objectSieve({ filter: [['displayName', listNames]] })] : []),
      packEntry({ key: 'id', ownerSymbol: listIdSymbol }),
      injectEntry({
        entry: {
          key: 'tasks',
          valueTokenStream: msft.createTasksStream({ idSymbol: listIdSymbol })
        }
      }),
      fork([createDataSink(), createMetadataSink()])
    ];
  }

  function createDataSink() {
    return chain([
      packEntry({ key: /^tasks\.\d+\.id$/, ownerSymbol: taskIdSymbol }),
      injectEntry({
        entry: {
          injectionPoint: /^tasks\.\d+$/,
          key: 'attachments',
          valueTokenStream: msft.createAttachmentsStream({ idSymbol: taskIdSymbol })
        }
      }),
      fork([createAttachmentsContentBytesSink(), createBackupSink()])
    ]);
  }

  function createMetadataSink() {
    // TODO: read in current metadata, edit depending on incoming stream, commit
    // TODO: results on readable stream end, figure out if "partial" still makes
    // TODO: sense
    return new Transform({
      // TODO
    });
  }

  function createAttachmentsContentBytesSink() {
    return chain([
      packEntry({
        key: /^tasks\.\d+\.attachments\.\d+\.id$/,
        ownerSymbol: attachmentIdSymbol
      }),
      msft.createAttachmentsContentBytesStream({ idSymbol: attachmentIdSymbol }),
      createAttachmentsContentBytesDrain()
    ]);
  }

  function createAttachmentsContentBytesDrain() {
    return new Writable({
      // TODO
    });
  }

  function createBackupSink() {
    const backupFilePath = ''; // TODO

    return chain([
      stringer({ makeArray: true, useValues: true, useStringValues: false }),
      createWriteStream(backupFilePath)
    ]);
  }
}
