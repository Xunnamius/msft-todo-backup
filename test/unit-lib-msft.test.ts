/* eslint-disable jest/no-conditional-in-test */
import { toss } from 'toss-expression';

import { Client } from '@microsoft/microsoft-graph-client';
import * as lib from 'universe/lib/msft';

import { asMockedFunction } from '@xunnamius/jest-types';
import type { ApplicationAuthenticationData, BackupData } from 'types/global';

jest.mock('@microsoft/microsoft-graph-client');

// eslint-disable-next-line jest/unbound-method
const mockedClientInitWithMiddleware = asMockedFunction(Client.initWithMiddleware);

beforeEach(() => {
  mockedClientInitWithMiddleware.mockImplementation(() => {
    return {
      api() {
        // TODO
      }
    } as unknown as Client;
  });
});

describe('::testApiAuthCredentials', () => {
  it('todo', async () => {
    expect.hasAssertions();
  });
});

describe('::getListsFromApi', () => {
  it('todo', async () => {
    expect.hasAssertions();
  });
});

describe('::putListsToApi', () => {
  it('todo', async () => {
    expect.hasAssertions();
  });
});
