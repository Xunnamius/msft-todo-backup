/* eslint-disable jest/no-conditional-in-test */
import { toss } from 'toss-expression';

import * as lib from 'universe/lib/msft';

import type { AnyFunction } from '@xunnamius/jest-types';

// TODO: add this to typescript-utils
type SpiedFunction<T extends AnyFunction> = jest.SpyInstance<
  ReturnType<T>,
  Parameters<T>
>;

// let XSpy: SpiedFunction<typeof X>;

beforeEach(() => {
  // TODO
});

describe('::testAuthCredentials', () => {
  it('todo', async () => {
    expect.hasAssertions();
  });
});
