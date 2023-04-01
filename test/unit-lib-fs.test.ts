/* eslint-disable jest/no-conditional-in-test */
import fs from 'node:fs/promises';
import { isNativeError } from 'node:util/types';
import { toss } from 'toss-expression';

import { useMockDateNow, mockDateNowMs } from 'multiverse/jest-mock-date';
import * as lib from 'universe/lib/fs';

import type { AnyFunction } from '@xunnamius/jest-types';

// eslint-disable-next-line jest/require-hook
useMockDateNow();

// TODO: add this to typescript-utils
type SpiedFunction<T extends AnyFunction> = jest.SpyInstance<
  ReturnType<T>,
  Parameters<T>
>;

let readFileSpy: SpiedFunction<typeof fs.readFile>;
let writeFileSpy: SpiedFunction<typeof fs.writeFile>;
let unlinkSpy: SpiedFunction<typeof fs.unlink>;

const getEnoentErrorObject = async () => {
  let error: unknown;

  try {
    (await fs.readdir('/dne')) as never;
  } catch (error_: unknown) {
    error = error_;
  }

  if (
    error === undefined ||
    !isNativeError(error) ||
    !('errno' in error) ||
    !('code' in error)
  ) {
    throw new Error('failed to acquire error object');
  }

  return error;
};

beforeEach(() => {
  readFileSpy = jest
    .spyOn(fs, 'readFile')
    .mockImplementation(() => Promise.resolve('[]'));

  writeFileSpy = jest.spyOn(fs, 'writeFile').mockImplementation(() => Promise.resolve());
  unlinkSpy = jest.spyOn(fs, 'unlink').mockImplementation(() => Promise.resolve());

  // * Clear the internal metadata cache
  lib.clearInternalCache();
});

describe('::deleteBackupData', () => {
  const dummyMetadata: lib.BackupMetadata = [
    {
      createdAt: 9,
      filename: `backup-9-partial.json`,
      index: 0,
      lists: [],
      partial: true
    },
    { createdAt: 8, filename: `backup-8.json`, index: 1, lists: [], partial: false },
    { createdAt: 72, filename: `backup-72.json`, index: 2, lists: [], partial: false },
    { createdAt: 71, filename: `backup-71.json`, index: 3, lists: [], partial: false }
  ];

  beforeEach(async () => {
    readFileSpy.mockImplementation(() => Promise.resolve(JSON.stringify(dummyMetadata)));
  });

  it('keeps 0 backups when numToKeep is 0 while always deleting partials', async () => {
    expect.hasAssertions();

    await lib.deleteBackupData({ numToKeep: 0 });

    expect(unlinkSpy.mock.calls).toStrictEqual([
      [dummyMetadata[0].filename],
      [dummyMetadata[1].filename],
      [dummyMetadata[2].filename],
      [dummyMetadata[3].filename]
    ]);
  });

  it('keeps 1 backup when numToKeep is 1 while always deleting partials', async () => {
    expect.hasAssertions();

    await lib.deleteBackupData({ numToKeep: 1 });

    expect(unlinkSpy.mock.calls).toStrictEqual([
      [dummyMetadata[0].filename],
      [dummyMetadata[2].filename],
      [dummyMetadata[3].filename]
    ]);
  });

  it('keeps 2 backups when numToKeep is 2 while always deleting partials', async () => {
    expect.hasAssertions();

    await lib.deleteBackupData({ numToKeep: 2 });

    expect(unlinkSpy.mock.calls).toStrictEqual([
      [dummyMetadata[0].filename],
      [dummyMetadata[3].filename]
    ]);
  });

  it('keeps 3 backups when numToKeep is 3 while always deleting partials', async () => {
    expect.hasAssertions();

    await lib.deleteBackupData({ numToKeep: 3 });
    expect(unlinkSpy.mock.calls).toStrictEqual([[dummyMetadata[0].filename]]);
  });

  it('keeps 4 backups when numToKeep is 4 while always deleting partials', async () => {
    expect.hasAssertions();

    await lib.deleteBackupData({ numToKeep: 4 });
    expect(unlinkSpy.mock.calls).toStrictEqual([[dummyMetadata[0].filename]]);
  });

  it('additional calls are effectively no-op when called back-to-back', async () => {
    expect.hasAssertions();

    // ? Track how metadata is committed to disk
    let committedDummyMetadata = '';

    writeFileSpy.mockImplementation(
      async (_, data) => void (committedDummyMetadata = data.toString())
    );

    await lib.deleteBackupData({ numToKeep: 0 });

    // ? Ensure metadata is written and then read properly
    readFileSpy.mockImplementation(() => Promise.resolve(committedDummyMetadata));

    await lib.deleteBackupData({ numToKeep: 0 });
    await lib.deleteBackupData({ numToKeep: 0 });

    expect(unlinkSpy.mock.calls).toStrictEqual([
      [dummyMetadata[0].filename],
      [dummyMetadata[1].filename],
      [dummyMetadata[2].filename],
      [dummyMetadata[3].filename]
    ]);
  });

  it('does not throw when backup file cannot be found but does in other cases', async () => {
    expect.hasAssertions();

    const error = await getEnoentErrorObject();

    unlinkSpy.mockImplementation(async () => toss(error));

    await expect(lib.deleteBackupData({ numToKeep: 0 })).toResolve();

    error.errno = -13;
    error.code = 'EACCES';
    unlinkSpy.mockImplementation(async () => toss(error));

    await expect(lib.deleteBackupData({ numToKeep: 0 })).rejects.toMatchObject({
      errno: -13,
      code: 'EACCES'
    });
  });
});

describe('::serializeAuthData', () => {
  it('commits stringified authentication object to proper path', async () => {
    expect.hasAssertions();

    const data: lib.AuthenticationData = {
      clientId: 'FAKE_CLIENT_ID',
      clientSecret: 'FAKE_CLIENT_SECRET',
      tenantId: 'FAKE_TENANT_ID'
    };

    await lib.serializeAuthData({ data });

    expect(writeFileSpy.mock.calls).toStrictEqual([
      [expect.stringMatching(/auth\.json$/), JSON.stringify(data), 'utf8']
    ]);
  });
});

describe('::serializeBackupData', () => {
  const data: lib.BackupData = [
    {
      displayName: 'list-a',
      tasks: [{ body: { content: 'body', contentType: 'text' }, title: 'title' }]
    }
  ];

  const metadata: lib.BackupMetadata = [
    {
      createdAt: mockDateNowMs,
      filename: `backup-${mockDateNowMs}.json`,
      index: 1,
      lists: [
        {
          displayName: data[0].displayName!,
          index: 1,
          tasksCompleted: 0,
          totalTasks: 1
        }
      ],
      partial: false
    }
  ];

  it('commits stringified backup data and metadata objects to proper paths', async () => {
    expect.hasAssertions();

    await lib.serializeBackupData({ data });

    expect(writeFileSpy.mock.calls).toStrictEqual([
      [
        expect.stringMatching(new RegExp(`/backup-${mockDateNowMs}\\.json$`)),
        JSON.stringify(data),
        'utf8'
      ],
      [
        expect.stringMatching(new RegExp('/meta\\.json$')),
        JSON.stringify(metadata),
        'utf8'
      ]
    ]);
  });

  it('works for lists with completed tasks', async () => {
    expect.hasAssertions();

    const localData: lib.BackupData = [
      {
        displayName: 'list-a',
        tasks: [
          {
            body: { content: 'body', contentType: 'text' },
            title: 'title',
            status: 'completed'
          }
        ]
      }
    ];

    await lib.serializeBackupData({ data: localData });

    expect(writeFileSpy.mock.calls).toStrictEqual([
      [
        expect.stringMatching(new RegExp(`/backup-${mockDateNowMs}\\.json$`)),
        JSON.stringify(localData),
        'utf8'
      ],
      [
        expect.stringMatching(new RegExp('/meta\\.json$')),
        JSON.stringify([
          {
            ...metadata[0],
            lists: [
              {
                ...metadata[0].lists[0],
                tasksCompleted: 1,
                totalTasks: 1
              }
            ]
          }
        ]),
        'utf8'
      ]
    ]);
  });

  it('works for lists with nameless tasks', async () => {
    expect.hasAssertions();

    const localData: lib.BackupData = [
      {
        tasks: [
          {
            body: { content: 'body', contentType: 'text' },
            title: 'title',
            status: 'completed'
          }
        ]
      }
    ];

    await lib.serializeBackupData({ data: localData });

    expect(writeFileSpy.mock.calls).toStrictEqual([
      [
        expect.stringMatching(new RegExp(`/backup-${mockDateNowMs}\\.json$`)),
        JSON.stringify(localData),
        'utf8'
      ],
      [
        expect.stringMatching(new RegExp('/meta\\.json$')),
        JSON.stringify([
          {
            ...metadata[0],
            lists: [
              {
                ...metadata[0].lists[0],
                displayName: '〔 nameless 〕',
                tasksCompleted: 1,
                totalTasks: 1
              } satisfies lib.BackupListMetadata
            ]
          }
        ]),
        'utf8'
      ]
    ]);
  });

  it('works even if no metadata file is available', async () => {
    expect.hasAssertions();

    readFileSpy.mockImplementation(async () => toss(await getEnoentErrorObject()));

    await lib.serializeBackupData({ data });

    expect(writeFileSpy.mock.calls).toStrictEqual([
      [
        expect.stringMatching(new RegExp(`/backup-${mockDateNowMs}\\.json$`)),
        JSON.stringify(data),
        'utf8'
      ],
      [
        expect.stringMatching(new RegExp('/meta\\.json$')),
        JSON.stringify(metadata),
        'utf8'
      ]
    ]);
  });

  it('appends properly to metadata when metadata file already exists', async () => {
    expect.hasAssertions();

    await lib.serializeBackupData({ data });
    writeFileSpy.mockClear();
    await lib.serializeBackupData({ data });

    expect(writeFileSpy.mock.calls).toStrictEqual([
      [
        expect.stringMatching(new RegExp(`/backup-${mockDateNowMs}\\.json$`)),
        JSON.stringify(data),
        'utf8'
      ],
      [
        expect.stringMatching(new RegExp('/meta\\.json$')),
        JSON.stringify([...metadata, { ...metadata[0], index: 2 }]),
        'utf8'
      ]
    ]);
  });

  it('filters out partial metadata entries when committing latest metadata to disk', async () => {
    expect.hasAssertions();

    const getNewMetadataEntry = (displayName: string) => ({
      createdAt: mockDateNowMs,
      filename: `backup-${mockDateNowMs}.json`,
      index: 0,
      lists: [
        {
          displayName,
          index: 1,
          tasksCompleted: 0,
          totalTasks: 1
        }
      ],
      partial: true
    });

    await lib.serializeBackupData({ data });

    writeFileSpy.mockClear();

    await lib.serializeBackupData({
      data: [{ ...data[0], displayName: 'list-y' }],
      partial: true
    });

    await lib.serializeBackupData({
      data: [{ ...data[0], displayName: 'list-z' }],
      partial: true
    });

    expect(writeFileSpy.mock.calls).toStrictEqual([
      expect.toBeArray(),
      [
        expect.stringMatching(new RegExp('/meta\\.json$')),
        JSON.stringify([getNewMetadataEntry('list-y'), ...metadata]),
        'utf8'
      ],
      expect.toBeArray(),
      [
        expect.stringMatching(new RegExp('/meta\\.json$')),
        JSON.stringify([getNewMetadataEntry('list-z'), ...metadata]),
        'utf8'
      ]
    ]);

    writeFileSpy.mockClear();

    await lib.serializeBackupData({ data });

    expect(writeFileSpy.mock.calls).toStrictEqual([
      expect.toBeArray(),
      [
        expect.stringMatching(new RegExp('/meta\\.json$')),
        JSON.stringify([...metadata, { ...metadata[0], index: 2 }]),
        'utf8'
      ]
    ]);
  });

  it('throws with data that cannot be serialized', async () => {
    expect.hasAssertions();

    await expect(
      // @ts-expect-error: testing bad input
      lib.serializeBackupData({ data: [{ item: BigInt(5) }] })
    ).rejects.toMatchObject({
      message: expect.stringContaining('failed to serialize data to file')
    });
  });

  it('throws if writeFile fails', async () => {
    expect.hasAssertions();

    writeFileSpy.mockImplementationOnce(async () => toss(await getEnoentErrorObject()));

    await expect(lib.serializeBackupData({ data })).rejects.toMatchObject({
      message: expect.stringContaining('failed to write file')
    });
  });

  it('throws on unknown failure', async () => {
    expect.hasAssertions();

    writeFileSpy.mockImplementation(async () => toss(new Error('bad')));

    await expect(lib.serializeBackupData({ data })).rejects.toMatchObject({
      message: 'bad'
    });
  });
});

describe('::unserializeAuthData', () => {
  it('parses from proper path authentication data into an object', async () => {
    expect.hasAssertions();

    const data: lib.AuthenticationData = {
      clientId: 'FAKE_CLIENT_ID',
      clientSecret: 'FAKE_CLIENT_SECRET',
      tenantId: 'FAKE_TENANT_ID'
    };

    readFileSpy.mockImplementation(async () => JSON.stringify(data));
    await expect(lib.unserializeAuthData()).resolves.toStrictEqual(data);
  });

  it('does not throw when an error occurs', async () => {
    expect.hasAssertions();

    const error = await getEnoentErrorObject();

    readFileSpy.mockImplementation(async () => toss(error));

    await expect(lib.unserializeAuthData()).resolves.toBeUndefined();

    error.errno = -13;
    error.code = 'EACCES';
    readFileSpy.mockImplementation(async () => toss(error));

    await expect(lib.unserializeAuthData()).resolves.toBeUndefined();
  });
});

describe('::unserializeListsSubsetFromBackupDataByIndex', () => {
  const data: lib.BackupData = [
    {
      displayName: 'list-a',
      tasks: [{ body: { content: 'body-1', contentType: 'text' }, title: 'title-1' }]
    },
    {
      displayName: 'list-b',
      tasks: []
    },
    {
      displayName: 'list-c',
      tasks: [
        {
          body: { content: 'body-2', contentType: 'text' },
          title: 'title-2',
          status: 'completed'
        },
        { body: { content: 'body-3', contentType: 'text' }, title: 'title-3' }
      ]
    }
  ];

  const listsMetadata = [
    {
      displayName: data[0].displayName!,
      index: 1,
      tasksCompleted: 0,
      totalTasks: 1
    },
    {
      displayName: data[1].displayName!,
      index: 2,
      tasksCompleted: 0,
      totalTasks: 0
    },
    {
      displayName: data[2].displayName!,
      index: 3,
      tasksCompleted: 1,
      totalTasks: 2
    }
  ];

  const metadata: lib.BackupMetadata = [
    {
      createdAt: mockDateNowMs,
      filename: `backup-${mockDateNowMs}.json`,
      index: 1,
      lists: listsMetadata,
      partial: false
    },
    {
      createdAt: mockDateNowMs - 1234,
      filename: `backup-${mockDateNowMs - 1234}.json`,
      index: 2,
      lists: listsMetadata,
      partial: false
    },
    {
      createdAt: mockDateNowMs - 987_654,
      filename: `backup-${mockDateNowMs - 987_654}.json`,
      index: 0,
      lists: [],
      partial: true
    }
  ];

  beforeEach(() => {
    readFileSpy.mockImplementation(async (path) => {
      const pathString = path.toString();

      return pathString.endsWith('/meta.json')
        ? JSON.stringify(metadata)
        : JSON.stringify(data);
    });
  });

  it('parses via index lists from backup data by index', async () => {
    expect.hasAssertions();

    await expect(
      lib.unserializeListsSubsetFromBackupDataByIndex({ index: 1, listIndices: [1] })
    ).resolves.toStrictEqual([data[0]]);

    await expect(
      lib.unserializeListsSubsetFromBackupDataByIndex({ index: 2, listIndices: [2] })
    ).resolves.toStrictEqual([data[1]]);

    await expect(
      lib.unserializeListsSubsetFromBackupDataByIndex({ index: 1, listIndices: [1, 2] })
    ).resolves.toStrictEqual(data.slice(0, 2));
  });

  it('parses via name lists from backup data by index', async () => {
    expect.hasAssertions();

    await expect(
      lib.unserializeListsSubsetFromBackupDataByIndex({ index: 1, listNames: ['list-a'] })
    ).resolves.toStrictEqual([data[0]]);

    await expect(
      lib.unserializeListsSubsetFromBackupDataByIndex({ index: 2, listNames: ['list-b'] })
    ).resolves.toStrictEqual([data[1]]);

    await expect(
      lib.unserializeListsSubsetFromBackupDataByIndex({
        index: 1,
        listNames: ['list-a', 'list-b']
      })
    ).resolves.toStrictEqual(data.slice(0, 2));
  });

  it('parses via index and name lists from backup data by index', async () => {
    expect.hasAssertions();

    await expect(
      lib.unserializeListsSubsetFromBackupDataByIndex({
        index: 1,
        listIndices: [2],
        listNames: ['list-a']
      })
    ).resolves.toStrictEqual(data.slice(0, 2));

    await expect(
      lib.unserializeListsSubsetFromBackupDataByIndex({
        index: 2,
        listIndices: [1],
        listNames: ['list-b']
      })
    ).resolves.toStrictEqual(data.slice(0, 2));

    await expect(
      lib.unserializeListsSubsetFromBackupDataByIndex({
        index: 1,
        listIndices: [3],
        listNames: ['list-a', 'list-b']
      })
    ).resolves.toStrictEqual(data);
  });

  it('parses all lists from backup data by index when no parameters provided', async () => {
    expect.hasAssertions();

    await expect(
      lib.unserializeListsSubsetFromBackupDataByIndex({ index: 1 })
    ).resolves.toStrictEqual(data);

    await expect(
      lib.unserializeListsSubsetFromBackupDataByIndex({ index: 2 })
    ).resolves.toStrictEqual(data);
  });

  it('deduplicates returned array when index and name reference same list', async () => {
    expect.hasAssertions();

    await expect(
      lib.unserializeListsSubsetFromBackupDataByIndex({
        index: 1,
        listIndices: [1],
        listNames: ['list-a']
      })
    ).resolves.toStrictEqual([data[0]]);

    await expect(
      lib.unserializeListsSubsetFromBackupDataByIndex({
        index: 2,
        listIndices: [2],
        listNames: ['list-b']
      })
    ).resolves.toStrictEqual([data[1]]);

    await expect(
      lib.unserializeListsSubsetFromBackupDataByIndex({
        index: 1,
        listIndices: [2, 1],
        listNames: ['list-a', 'list-b']
      })
    ).resolves.toStrictEqual(data.slice(0, 2));
  });

  it('throws when no known lists match all the given indices and/or names', async () => {
    expect.hasAssertions();

    await expect(
      lib.unserializeListsSubsetFromBackupDataByIndex({
        index: 1,
        listIndices: [100]
      })
    ).rejects.toMatchObject({ message: expect.stringContaining('unable to find any') });

    await expect(
      lib.unserializeListsSubsetFromBackupDataByIndex({
        index: 1,
        listNames: ['list-z']
      })
    ).rejects.toMatchObject({ message: expect.stringContaining('unable to find any') });

    await expect(
      lib.unserializeListsSubsetFromBackupDataByIndex({
        index: 1,
        listIndices: [100, 200],
        listNames: ['list-z', 'list-y']
      })
    ).rejects.toMatchObject({ message: expect.stringContaining('unable to find any') });
  });

  it('throws when the given index does not match a known backup', async () => {
    expect.hasAssertions();

    await expect(
      lib.unserializeListsSubsetFromBackupDataByIndex({ index: 5 })
    ).rejects.toMatchObject({
      message: expect.stringContaining('unable to find a backup')
    });
  });
});

describe('::unserializeListsSubsetFromBackupDataByName', () => {
  const data: lib.BackupData = [
    {
      displayName: 'list-a',
      tasks: [{ body: { content: 'body-1', contentType: 'text' }, title: 'title-1' }]
    },
    {
      displayName: 'list-b',
      tasks: []
    },
    {
      displayName: 'list-c',
      tasks: [
        {
          body: { content: 'body-2', contentType: 'text' },
          title: 'title-2',
          status: 'completed'
        },
        { body: { content: 'body-3', contentType: 'text' }, title: 'title-3' }
      ]
    }
  ];

  const listsMetadata = [
    {
      displayName: data[0].displayName!,
      index: 1,
      tasksCompleted: 0,
      totalTasks: 1
    },
    {
      displayName: data[1].displayName!,
      index: 2,
      tasksCompleted: 0,
      totalTasks: 0
    },
    {
      displayName: data[2].displayName!,
      index: 3,
      tasksCompleted: 1,
      totalTasks: 2
    }
  ];

  const metadata: lib.BackupMetadata = [
    {
      createdAt: mockDateNowMs,
      filename: `backup-${mockDateNowMs}.json`,
      index: 1,
      lists: listsMetadata,
      partial: false
    },
    {
      createdAt: mockDateNowMs - 1234,
      filename: `backup-${mockDateNowMs - 1234}.json`,
      index: 2,
      lists: listsMetadata,
      partial: false
    },
    {
      createdAt: mockDateNowMs - 987_654,
      filename: `backup-${mockDateNowMs - 987_654}.json`,
      index: 0,
      lists: [],
      partial: true
    }
  ];

  beforeEach(() => {
    readFileSpy.mockImplementation(async (path) => {
      const pathString = path.toString();

      return pathString.endsWith('/meta.json')
        ? JSON.stringify(metadata)
        : JSON.stringify(data);
    });
  });

  it('parses via index lists from backup data by name', async () => {
    expect.hasAssertions();

    await expect(
      lib.unserializeListsSubsetFromBackupDataByName({
        filename: metadata[0].filename,
        listIndices: [1]
      })
    ).resolves.toStrictEqual([data[0]]);

    await expect(
      lib.unserializeListsSubsetFromBackupDataByName({
        filename: metadata[1].filename,
        listIndices: [2]
      })
    ).resolves.toStrictEqual([data[1]]);

    await expect(
      lib.unserializeListsSubsetFromBackupDataByName({
        filename: metadata[0].filename,
        listIndices: [1, 2]
      })
    ).resolves.toStrictEqual(data.slice(0, 2));
  });

  it('parses via name lists from backup data by name', async () => {
    expect.hasAssertions();

    await expect(
      lib.unserializeListsSubsetFromBackupDataByName({
        filename: metadata[0].filename,
        listNames: ['list-a']
      })
    ).resolves.toStrictEqual([data[0]]);

    await expect(
      lib.unserializeListsSubsetFromBackupDataByName({
        filename: metadata[1].filename,
        listNames: ['list-b']
      })
    ).resolves.toStrictEqual([data[1]]);

    await expect(
      lib.unserializeListsSubsetFromBackupDataByName({
        filename: metadata[0].filename,
        listNames: ['list-a', 'list-b']
      })
    ).resolves.toStrictEqual(data.slice(0, 2));
  });

  it('parses via index and name lists from backup data by name', async () => {
    expect.hasAssertions();

    await expect(
      lib.unserializeListsSubsetFromBackupDataByName({
        filename: metadata[0].filename,
        listIndices: [2],
        listNames: ['list-a']
      })
    ).resolves.toStrictEqual(data.slice(0, 2));

    await expect(
      lib.unserializeListsSubsetFromBackupDataByName({
        filename: metadata[1].filename,
        listIndices: [1],
        listNames: ['list-b']
      })
    ).resolves.toStrictEqual(data.slice(0, 2));

    await expect(
      lib.unserializeListsSubsetFromBackupDataByName({
        filename: metadata[0].filename,
        listIndices: [3],
        listNames: ['list-a', 'list-b']
      })
    ).resolves.toStrictEqual(data);
  });

  it('parses all lists from backup data by name when no parameters provided', async () => {
    expect.hasAssertions();

    await expect(
      lib.unserializeListsSubsetFromBackupDataByName({ filename: metadata[0].filename })
    ).resolves.toStrictEqual(data);

    await expect(
      lib.unserializeListsSubsetFromBackupDataByName({ filename: metadata[1].filename })
    ).resolves.toStrictEqual(data);
  });

  it('deduplicates returned array when index and name reference same list', async () => {
    expect.hasAssertions();

    await expect(
      lib.unserializeListsSubsetFromBackupDataByName({
        filename: metadata[0].filename,
        listIndices: [1],
        listNames: ['list-a']
      })
    ).resolves.toStrictEqual([data[0]]);

    await expect(
      lib.unserializeListsSubsetFromBackupDataByName({
        filename: metadata[1].filename,
        listIndices: [2],
        listNames: ['list-b']
      })
    ).resolves.toStrictEqual([data[1]]);

    await expect(
      lib.unserializeListsSubsetFromBackupDataByName({
        filename: metadata[0].filename,
        listIndices: [2, 1],
        listNames: ['list-a', 'list-b']
      })
    ).resolves.toStrictEqual(data.slice(0, 2));
  });

  it('throws when no known lists match all the given indices and/or names', async () => {
    expect.hasAssertions();

    await expect(
      lib.unserializeListsSubsetFromBackupDataByName({
        filename: metadata[0].filename,
        listIndices: [100]
      })
    ).rejects.toMatchObject({ message: expect.stringContaining('unable to find any') });

    await expect(
      lib.unserializeListsSubsetFromBackupDataByName({
        filename: metadata[0].filename,
        listNames: ['list-z']
      })
    ).rejects.toMatchObject({ message: expect.stringContaining('unable to find any') });

    await expect(
      lib.unserializeListsSubsetFromBackupDataByName({
        filename: metadata[0].filename,
        listIndices: [100, 200],
        listNames: ['list-z', 'list-y']
      })
    ).rejects.toMatchObject({ message: expect.stringContaining('unable to find any') });
  });

  it('throws when the given name does not match a known backup', async () => {
    expect.hasAssertions();

    const error = await getEnoentErrorObject();

    readFileSpy.mockImplementation(async () => toss(error));

    await expect(
      lib.unserializeListsSubsetFromBackupDataByName({ filename: 'does-not-exist' })
    ).rejects.toMatchObject({
      message: expect.stringContaining('invalid filename')
    });

    await expect(
      lib.unserializeListsSubsetFromBackupDataByName({ filename: 'does-not-exist.json' })
    ).rejects.toMatchObject({
      message: expect.stringContaining('failed to read file')
    });
  });
});

describe('::unserializeMetadata', () => {
  const data: lib.BackupData = [
    {
      displayName: 'list-a',
      tasks: [{ body: { content: 'body', contentType: 'text' }, title: 'title' }]
    }
  ];

  const listsMetadata = [
    {
      displayName: 'list-a',
      index: 1,
      tasksCompleted: 0,
      totalTasks: 1
    },
    {
      displayName: 'list-b',
      index: 2,
      tasksCompleted: 0,
      totalTasks: 0
    },
    {
      displayName: 'list-c',
      index: 3,
      tasksCompleted: 1,
      totalTasks: 2
    }
  ];

  const metadata: lib.BackupMetadata = [
    {
      createdAt: mockDateNowMs - 12,
      filename: `backup-${mockDateNowMs - 12}.json`,
      index: 1,
      lists: listsMetadata,
      partial: false
    },
    {
      createdAt: mockDateNowMs - 1234,
      filename: `backup-${mockDateNowMs - 1234}.json`,
      index: 2,
      lists: listsMetadata,
      partial: false
    },
    {
      createdAt: mockDateNowMs - 987_654,
      filename: `backup-${mockDateNowMs - 987_654}.json`,
      index: 0,
      lists: [],
      partial: true
    }
  ];

  beforeEach(() => {
    readFileSpy.mockImplementation(async () => JSON.stringify(metadata));
  });

  it('parses from proper path metadata into an object', async () => {
    expect.hasAssertions();

    await expect(lib.unserializeMetadata()).resolves.toStrictEqual(metadata);
  });

  it('uses cached metadata if called multiple times', async () => {
    expect.hasAssertions();

    const returnValue = await lib.unserializeMetadata();

    expect(returnValue).toStrictEqual(metadata);

    readFileSpy.mockImplementation(async () => toss(new Error('should not be called')));

    await expect(lib.unserializeMetadata()).resolves.toBe(returnValue);
    await expect(lib.unserializeMetadata()).resolves.toBe(returnValue);
  });

  it('uses cached metadata updates from serializeBackupData if available', async () => {
    expect.hasAssertions();

    await expect(lib.unserializeMetadata()).resolves.toStrictEqual(metadata);

    await lib.serializeBackupData({ data });
    await lib.serializeBackupData({ data, partial: true });

    readFileSpy.mockImplementation(async () => toss(new Error('should not be called')));

    await expect(lib.unserializeMetadata()).resolves.toStrictEqual([
      {
        createdAt: mockDateNowMs,
        filename: `backup-${mockDateNowMs}.json`,
        index: 0,
        lists: [
          {
            displayName: 'list-a',
            index: 1,
            tasksCompleted: 0,
            totalTasks: 1
          }
        ],
        partial: true
      },
      {
        createdAt: mockDateNowMs,
        filename: `backup-${mockDateNowMs}.json`,
        index: 1,
        lists: [
          {
            displayName: 'list-a',
            index: 1,
            tasksCompleted: 0,
            totalTasks: 1
          }
        ],
        partial: false
      },
      ...metadata
        .filter((entry) => !entry.partial)
        .map((entry) => {
          entry.index += 1;

          return entry;
        })
    ]);
  });

  it('does not throw when an error occurs', async () => {
    expect.hasAssertions();

    const error = await getEnoentErrorObject();

    readFileSpy.mockImplementation(async () => toss(error));

    await expect(lib.unserializeMetadata()).resolves.toBeUndefined();

    error.errno = -13;
    error.code = 'EACCES';
    readFileSpy.mockImplementation(async () => toss(error));

    await expect(lib.unserializeMetadata()).resolves.toBeUndefined();
  });
});
