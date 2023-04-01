import type { TodoTaskList } from 'microsoft-graph';
import type { BackupData } from 'types/global';

export async function testApiAuthCredentials() {
  // TODO
}

export async function getListsFromApi({
  displayNames
}: {
  /**
   *
   */
  displayNames?: string[];
}): Promise<TodoTaskList[]> {
  void displayNames;
  return [];
}

export async function putListsToApi({
  listsData,
  restorationMode = 'deduplication'
}: {
  /**
   *
   */
  listsData: BackupData;
  /**
   * @default 'deduplication'
   */
  restorationMode: 'no-deduplication' | 'clean-before-restore' | 'deduplication';
}): Promise<void> {
  void listsData, restorationMode;
}
