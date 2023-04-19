import type { UnixEpochMs } from '@xunnamius/types';

import type {
  TaskFileAttachment,
  TodoTask,
  TodoTaskList
} from '@microsoft/microsoft-graph-types';

/**
 * An array literal representation of {@link SupportedFileFormat}.
 */
export const supportedFileFormats = ['json'] as const;

/**
 * A file format input/output type supported by this tool.
 */
export type SupportedFileFormat = (typeof supportedFileFormats)[number];

/**
 * An array of backed up task lists.
 */
export type BackupData = AsyncIterableIterator<BackupListData>;

/**
 * An individual backed up task list.
 */
export type BackupListData = Omit<TodoTaskList, 'tasks'> & {
  tasks: AsyncIterableIterator<BackupTaskData>;
};

/**
 * An individual backed up task.
 */
export type BackupTaskData = Omit<TodoTask, 'attachments'> & {
  attachments: AsyncIterableIterator<Required<TaskFileAttachment>>;
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
  index: Index;
  displayName: string;
  totalTasks: number;
  tasksCompleted: number;
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
