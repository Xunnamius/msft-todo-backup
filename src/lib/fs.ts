import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { isNativeError } from 'node:util/types';

import type { UnixEpochMs } from '@xunnamius/types';
import type { TodoTaskList } from '@microsoft/microsoft-graph-types';

const storageDirectory = path.resolve(os.homedir(), 'msft-todo-backups');
let cachedMetadata: BackupMetadata = [];

type Index = number;

export type BackupData = BackupListData[];
export type BackupListData = TodoTaskList;

export type BackupMetadata = BackupFileMetadata[];

export type BackupFileMetadata = {
  partial: boolean;
  index: Index;
  filename: string;
  createdAt: UnixEpochMs;
  lists: BackupListMetadata[];
};

export type BackupListMetadata = {
  index: Index;
  displayName: string;
  totalTasks: number;
  tasksCompleted: number;
};

export type AuthenticationData = {
  clientId: string;
  clientSecret: string;
  tenantId: string;
};

/**
 * Commit data to disk.
 */
async function serialize({
  data,
  filename
}: {
  /**
   * The data to serialize to disk.
   */
  data: unknown;
  /**
   * The name of the file including its extension. The extension will determine
   * the output file format.
   *
   * Currently, the only supported format is `'json'`.
   */
  filename: string;
}) {
  const { ext } = path.parse(filename);
  const filepath = path.join(storageDirectory, filename);

  if (ext === '.json') {
    try {
      return await fs.writeFile(filepath, JSON.stringify(data), 'utf8');
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
  } else {
    /* istanbul ignore next */
    throw new Error(`unknown file format "${ext}"`);
  }
}

/**
 * Retrieve data from disk.
 */
async function unserialize<T = unknown>({
  /**
   * The name of the file including its extension.
   */
  filename
}: {
  filename: string;
}): Promise<T> {
  const { ext } = path.parse(filename);
  const filepath = path.join(storageDirectory, filename);

  if (ext === '.json') {
    try {
      return JSON.parse(await fs.readFile(filepath, 'utf8')) as T;
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
  } else if (ext === '') {
    throw new Error(`invalid filename "${filename}": must have file format extension`);
  } else {
    /* istanbul ignore next */
    throw new Error(`unknown file format extension "${ext}"`);
  }
}

/**
 * Serialize metadata to disk.
 */
async function serializeMetadata({
  data
}: {
  /**
   * The metadata to serialize to disk.
   */
  data: BackupMetadata;
}) {
  cachedMetadata = data;
  return serialize({ data, filename: 'meta.json' });
}

/**
 * Unserialize metadata from disk.
 */
export async function unserializeMetadata(): Promise<BackupMetadata | undefined> {
  try {
    return cachedMetadata.length
      ? cachedMetadata
      : (cachedMetadata = await unserialize<BackupMetadata>({
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
  data: AuthenticationData;
}) {
  return serialize({ data, filename: `auth.json` });
}

/**
 * Unserialize authentication data from disk.
 */
export async function unserializeAuthData(): Promise<AuthenticationData | undefined> {
  try {
    return await unserialize<AuthenticationData>({ filename: 'auth.json' });
  } catch {
    return undefined;
  }
}

/**
 * Serialize a new backup dataset and related metadata to disk. The backup will
 * be saved using an auto-generated filename.
 */
export async function serializeBackupData({
  data: backupData,
  fileFormat = 'json',
  partial = false
}: {
  /**
   * The backup data to serialize to disk.
   */
  data: BackupData;
  /**
   * The format of the file. This will determine its extension.
   *
   * Currently, the only supported format is `'json'`.
   *
   * @default 'json'
   */
  fileFormat?: 'json';
  /**
   * If `true`, the serialized backup will be considered partial.
   *
   * @default false
   */
  partial?: boolean;
}) {
  const createdAt = Date.now();
  const filename = `backup-${createdAt}.${fileFormat}`;

  let metadata = (await unserializeMetadata())?.filter((entry) => !entry.partial);

  if (metadata) {
    if (!partial) {
      metadata = metadata.map((entry) => {
        entry.index = entry.index + 1;
        return entry;
      });
    }
  } else {
    metadata = [];
  }

  metadata.unshift({
    createdAt,
    filename,
    index: partial ? 0 : 1,
    lists: backupData.map((list, listIndex): BackupListMetadata => {
      let tasksCompleted = 0;
      let totalTasks = 0;

      list.tasks?.forEach((task) => {
        tasksCompleted += task.status === 'completed' ? 1 : 0;
        totalTasks += 1;
      });

      return {
        displayName: list.displayName || '〔 nameless 〕',
        index: listIndex + 1,
        tasksCompleted,
        totalTasks
      };
    }),
    partial
  });

  return Promise.all([
    serialize({ data: backupData, filename }),
    serializeMetadata({ data: metadata })
  ]);
}

/**
 * Unserialize backup data from disk.
 */
async function unserializeBackupData({
  filename
}: {
  filename: string;
}): Promise<BackupData> {
  return unserialize<BackupData>({ filename });
}

/**
 * Retrieve from a specific backup one or more lists by display name and in the
 * order they are provided in `lists`.
 */
export async function unserializeListsSubsetFromBackupDataByName({
  listIndices,
  listNames,
  filename
}: {
  listIndices?: Index[];
  listNames?: string[];
  filename: string;
}): Promise<BackupData> {
  const lists = (await unserializeBackupData({ filename })).filter(
    ({ displayName }, listIndex) => {
      return (
        (listIndices && listIndices.includes(listIndex + 1)) ||
        (listNames && displayName && listNames.includes(displayName)) ||
        (!listIndices && !listNames)
      );
    }
  );

  if (!lists.length) {
    throw new Error(
      `unable to find any lists matching your criteria from backup "${filename}"`
    );
  }

  return lists;
}

/**
 * Retrieve from a specific backup one or more lists by index and in the order
 * they are provided in `lists`.
 */
export async function unserializeListsSubsetFromBackupDataByIndex({
  listIndices,
  listNames,
  index
}: {
  listIndices?: Index[];
  listNames?: string[];
  index: Index;
}): Promise<BackupData> {
  const metadata = (await unserializeMetadata())?.find((entry) => entry.index === index);
  let lists: BackupData = [];

  if (metadata) {
    lists = await unserializeListsSubsetFromBackupDataByName({
      listIndices,
      listNames,
      filename: metadata.filename
    });
  }

  if (!metadata) {
    throw new Error(`unable to find a backup with index "${index}"`);
  }

  return lists;
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

    if (
      partial ||
      filename.includes('-partial.') ||
      (filename.startsWith('backup-') && ++count > numToKeep)
    ) {
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
