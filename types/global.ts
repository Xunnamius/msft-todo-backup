import type { UnixEpochMs } from '@xunnamius/types';

import type {
  TaskFileAttachment,
  TodoTask,
  TodoTaskList
} from '@microsoft/microsoft-graph-types';

/**
 * An array of backed up task lists.
 */
export type BackupData = BackupListData[];

/**
 * An individual backed up task list.
 */
export type BackupListData = Omit<TodoTaskList, 'tasks' | 'extensions'> & {
  tasks: BackupTaskData[];
};

/**
 * An individual backed up task.
 */
export type BackupTaskData = Omit<TodoTask, 'attachments' | 'extensions'> & {
  attachments: (Omit<TaskFileAttachment, 'contentBytes' | 'id' | 'contentType'> &
    Required<Pick<TaskFileAttachment, 'id' | 'contentType'>>)[];
};

/**
 * The index of a backup file or a backed up list, depending on the context.
 */
export type Index = number;

/**
 * An array of backup file metadata.
 */
export type BackupMetadata = BackupFileMetadata[];

/**
 * Metadata for an individual backup file.
 */
export type BackupFileMetadata = {
  /**
   * When a backup file is `partial`, it signifies some sort of error with
   * acquiring data from Microsoft and/or committing the backup data to disk.
   * Hence, `index` is always 0 and `lists` is always empty.
   */
  partial: boolean;
  /**
   * A unique number signifying the order of backups. `index` will always be `0`
   * if `partial` is `true`.
   */
  index: Index;
  filename: string;
  createdAt: UnixEpochMs;
  lists: BackupListMetadata[];
} & (
  | {
      partial: true;
      index: 0;
      lists: never[];
    }
  | { partial: false }
);

/**
 * Metadata for an individual list within a backup file.
 */
export type BackupListMetadata = {
  id: string;
  displayName: string;
  tasks: BackupTaskMetadata[];
};

/**
 * Metadata for an individual task within a backup file.
 */
export type BackupTaskMetadata = {
  id: string;
  titleHash: string;
};

/**
 * Microsoft API authentication data belonging to an application.
 */
export type ApplicationAuthenticationData = {
  clientId: string;
  tenantId: string;
  /**
   * Used to cache-bust MSAL credential persistence.
   */
  forcedReauthCounter: number;
};
