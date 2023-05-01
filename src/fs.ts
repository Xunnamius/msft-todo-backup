import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { isNativeError } from 'node:util/types';
import mime from 'mime-types';

import { stringToMd5Hex } from 'universe/crypto';

import type { ApplicationAuthenticationData, BackupMetadata } from 'types/global';
import type { AnyFunction } from '@xunnamius/types';
import type { Asyncify } from 'type-fest';
import type { AttachmentBase } from '@microsoft/microsoft-graph-types';

// ? Not including extensions
export const windowsFilenameMaxLength = 240;
export const storageDirectory = path.resolve(os.homedir(), 'msft-todo-backups');
export const attachmentsStorageDirectory = path.resolve(storageDirectory, 'attachments');

let cachedMetadata: BackupMetadata = [];

/**
 * Commit simple object data to disk.
 */
async function serializeSimpleObject({
  data,
  filename
}: {
  /**
   * The data to serialize to disk.
   */
  data: BackupMetadata | ApplicationAuthenticationData;
  /**
   * The name of the file including its extension. The extension will determine
   * the output file format.
   *
   * Currently, the only supported format is `'json'`.
   */
  filename: string;
}) {
  await ensureBackupDirectoryExists();

  const filepath = path.join(storageDirectory, filename);

  await tryWriteJson(filepath, () => {
    return fs.writeFile(filepath, JSON.stringify(data), 'utf8');
  });
}

/**
 * Retrieve simple object data from disk.
 */
async function unserializeSimpleObject<T = unknown>({
  filename
}: {
  /**
   * The name of the file including its extension.
   */
  filename: string;
}): Promise<T> {
  const filepath = path.join(storageDirectory, filename);

  return tryReadJson<T>(filepath, async () => {
    return JSON.parse(await fs.readFile(filepath, 'utf8'));
  });
}

/**
 * Serialize metadata to disk.
 */
export async function serializeMetadata({
  data
}: {
  /**
   * The metadata to serialize to disk.
   */
  data: BackupMetadata;
}) {
  cachedMetadata = data;
  return serializeSimpleObject({ data, filename: 'meta.json' });
}

/**
 * Unserialize metadata from disk.
 */
export async function unserializeMetadata(): Promise<BackupMetadata | undefined> {
  try {
    return cachedMetadata.length
      ? cachedMetadata
      : (cachedMetadata = await unserializeSimpleObject<BackupMetadata>({
          filename: 'meta.json'
        }));
  } catch {
    return undefined;
  }
}

/**
 * Serialize authentication data to disk.
 */
export async function serializeAuthData({
  data
}: {
  /**
   * The authentication data to serialize to disk.
   */
  data: ApplicationAuthenticationData;
}) {
  return serializeSimpleObject({ data, filename: `auth.json` });
}

/**
 * Unserialize authentication data from disk.
 */
export async function unserializeAuthData(): Promise<
  ApplicationAuthenticationData | undefined
> {
  try {
    return unserializeSimpleObject<ApplicationAuthenticationData>({
      filename: 'auth.json'
    });
  } catch {
    return undefined;
  }
}

/**
 * Delete all partial backups and one or more non-partial backups currently on
 * disk.
 */
export async function deleteBackupData({
  numToKeep
}: {
  /**
   * How many backups should remain on disk after the deletion operation
   * completes. This does not including partial backups.
   */
  numToKeep: number;
}) {
  let count = 0;
  const meta = await unserializeMetadata();
  const metaTargetsForDeletion: typeof meta = [];
  const metaRemaining: typeof meta = [];

  meta?.forEach((data) => {
    const { partial, filename } = data;
    let destArray = metaRemaining;

    if (partial || (filename.startsWith('backup-') && ++count > numToKeep)) {
      destArray = metaTargetsForDeletion;
    }

    destArray.push(data);
  });

  const promises = metaTargetsForDeletion.map(({ filename }) =>
    fs.unlink(filename).catch(async (error) => {
      if ('code' in error && error.code !== 'ENOENT') {
        throw error;
      }
    })
  );

  promises.push(
    serializeMetadata({
      data: metaRemaining.map((data, metaIndex) => {
        data.index = metaIndex + 1;
        return data;
      })
    })
  );

  return Promise.all(promises);
}

/**
 * Clears all internal caches. Not typically useful outside of a testing
 * environment.
 */
export function clearInternalCache() {
  cachedMetadata = [];
}

export async function getFilenameFromAttachmentMetadata(
  attachmentMetadata: AttachmentBase
) {
  assert(attachmentMetadata.id !== undefined, 'attachment has no id');

  const attachmentFileExtension =
    mime.extension(attachmentMetadata.contentType || '') || '';

  return (
    (
      (attachmentMetadata.name ? `${attachmentMetadata.name}-` : '') +
      (await stringToMd5Hex(attachmentMetadata.id))
    ).slice(0, windowsFilenameMaxLength - attachmentFileExtension.length) +
    (attachmentFileExtension ? `.${attachmentFileExtension}` : '')
  );
}

export async function ensureBackupDirectoryExists() {
  await Promise.all(
    [storageDirectory, attachmentsStorageDirectory].map((path) =>
      fs.mkdir(path, { recursive: true })
    )
  );
}

// TODO: replace AnyFunction | Asyncify<AnyFunction> with latest AnyFunction def
/**
 * Wrap an attempt to commit JSON data with consistent error handling.
 */
async function tryWriteJson(
  filepath: string,
  writeHandler: AnyFunction | Asyncify<AnyFunction>
) {
  try {
    return await writeHandler();
  } catch (error) {
    if (isNativeError(error)) {
      if (error.name === 'TypeError') {
        throw new Error(`failed to serialize data to file: ${filepath}`, {
          cause: error
        });
      } else if ('path' in error) {
        throw new Error(`failed to write file: ${error.path}`, { cause: error });
      }
    }

    throw error;
  }
}

// TODO: replace AnyFunction | Asyncify<AnyFunction> with latest AnyFunction def
/**
 * Wrap an attempt to read JSON data with consistent error handling.
 */
async function tryReadJson<T>(
  filepath: string,
  readHandler: AnyFunction | Asyncify<AnyFunction>
): Promise<T> {
  try {
    return (await readHandler()) as T;
  } catch (error) {
    if (isNativeError(error)) {
      if (error.name === 'SyntaxError') {
        /* istanbul ignore next */
        throw new Error(`failed to unserialize data from file: ${filepath}`, {
          cause: error
        });
      } else if ('path' in error) {
        throw new Error(`failed to read file: ${error.path}`, { cause: error });
      }
    }

    /* istanbul ignore next */
    throw error;
  }
}
