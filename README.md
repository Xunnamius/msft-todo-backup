<!-- badges-start -->

[![Black Lives Matter!][x-badge-blm-image]][x-badge-blm-link]
[![Last commit timestamp][x-badge-lastcommit-image]][x-badge-repo-link]
[![Codecov][x-badge-codecov-image]][x-badge-codecov-link]
[![Source license][x-badge-license-image]][x-badge-license-link]
[![Monthly Downloads][x-badge-downloads-image]][x-badge-npm-link]
[![NPM version][x-badge-npm-image]][x-badge-npm-link]
[![Uses Semantic Release!][x-badge-semanticrelease-image]][x-badge-semanticrelease-link]

<!-- badges-end -->

# msft-todo-backup

An NPM package allowing the export (backup) and import (restoration) of your
precious Microsoft Todo tasks for the paranoid among us that aren't willing to
risk a decade of notes on the whims and stability of Microsoft's services.

Currently, one or more lists and all of their tasks can be exported. For lists,
their display names and unique id are exported. For tasks, the following are
exported: body, body last modified date and time, categories, completed date and
time, created date and time, due date and time, unique id, importance, last
modified date and time, recurrence pattern, reminder date and time, start date
and time, status, title, attachments, and checklist items (so-called "steps").

This tool was built using async iterators and streams to ensure proper function
in low-memory environments (i.e. 1-2G RAM odroids). Additionally, unattended
backups, throttling, and automatic retrying are supported out of the box.

However, while attachment and checklist items are backed up and can be restored,
linked resources and extensions are ignored.

---

<!-- remark-ignore-start -->
<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

- [Install](#install)
- [Usage](#usage)
  - [Backing up Lists](#backing-up-lists)
  - [Restoring Lists](#restoring-lists)
  - [Enumerating and Deleting Stored Backups](#enumerating-and-deleting-stored-backups)
- [Appendix](#appendix)
  - [Limitations and Considerations](#limitations-and-considerations)
  - [Inspiration](#inspiration)
  - [Published Package Details](#published-package-details)
  - [License](#license)
- [Contributing and Support](#contributing-and-support)
  - [Contributors](#contributors)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->
<!-- remark-ignore-end -->

## Install

You can install this package globally:

```shell
npm install --global msft-todo-backup
```

Alternatively, you can use npx to call this package without pre-installation:

```shell
npx msft-todo-backup ...
```

## Usage

> For a full list of available commands and flags, use
> `msft-todo-backup --help`.

Before using `msft-todo-backup`, you'll have to acquire a Microsoft Graph tenant
(directory) and client (application) ID:

1. [Create a free new app registration][1] by clicking "New registration".
   Select "Only associate the new app with your personal account". Name the
   application "msft-todo-backup". For _Supported account types_ you must select
   "Accounts in any organizational directory (Any Azure AD directory -
   Multitenant) and personal Microsoft accounts (e.g. Skype, Xbox)". No redirect
   URI should be configured. Click "Register". Once you're taken to your app's
   dashboard, copy the Application (client) ID and Directory (tenant) ID.

   > Microsoft has more detailed instructions on setting up a new app
   > registration [here][2].

2. Once the new app registration is created, it must be configured. Using the
   sidebar, click "Authentication" > scroll down to _Advanced settings_ and set
   _Allow public client flows_ to "Yes". Click "Save".

3. Register your app IDs with the CLI tool by running
   `msft-todo-backup authenticate`. You'll have to provide the Application ID
   and Directory ID, after which you'll be presented with instructions on how to
   link up with your Microsoft account using the device login flow. The IDs will
   be saved to `~/msft-todo-backups/auth.json` while your sensitive account
   access tokens will be encrypted and stored elsewhere.

Note that, if you do not run msft-todo-backup anywhere from 30 to 90 days after
authenticating (or if you revoke access to the msft-todo-backup app from your
Microsoft account), your access/refresh tokens may expire. If this happens, just
rerun `msft-todo-backup authenticate`.

Also note that, for some reason, you must complete authentication using your
actual account. You cannot use the incredibly convenient "Sign in with another
account" as of this writing. For example, you cannot authenticate successfully
using your GitHub account to login to your Microsoft account. If you attempt to
authenticate by entering the device code in your browser but are not presented
with a permissions approval screen for the "msft-todo-backup" app, you must
authenticate using your real account credentials instead.

> Manually registering a new application is necessary because interacting with
> the Microsoft Graph API to backup your tasks can be an intensive and
> data-heavy process, especially if you have a lot of files attached to your
> tasks. Hence, creating a shared API service would quickly run into throttling
> and bandwidth limit issues.

### Backing up Lists

You can backup all your lists:

```shell
msft-todo-backup backup
```

Or you can backup specific lists by their display name:

```shell
msft-todo-backup backup list-1 list-2 list-3
```

The backup process is non-destructive (read-only). Backups are stored at
`~/msft-todo-backups/{dateTimeMs}.json` on Linux and
`%USERPROFILE%\msft-todo-backups\{dateTimeMs}.json` on Windows.

You can specify how many backups to keep around with the `--keep-num-backups`
flag:

```shell
# Will keep five backups in storage before overwriting the oldest backup
msft-todo-backup backup list-1 list-2 --keep-num-backups 5
```

You can specify what format you want backups to be saved in. This will also
affect the file extension.

```shell
msft-todo-backup backup list-1 list-2 --format json
```

Currently, the only backup format available is `json`.

If the backup is interrupted or fails, a partial backup will be available at
`~/msft-todo-backups/{dateTimeMs}-partial.json`. Reattempting the backup process
will immediately delete any partial backup files, so save it someplace else if
you want to keep it.

#### Automatic Backups

Once `msft-todo-backup authenticate` has been run successfully at least once,
and your access/refresh tokens have not expired, backups can be performed
automatically in the background without you having to do anything. For example,
to backup your Microsoft Todo tasks once a day, you can run
`msft-todo-backup backup --keep-num-backups 5` as a [daily cron][3] (Linux) or
via the [task scheduler][4] (Windows).

### Restoring Lists

You can restore all your lists:

```shell
msft-todo-backup restore
```

Or you can restore specific lists:

```shell
msft-todo-backup restore list-1 list-2 list-3
```

Or you can restore from a specific backup if you have multiple backups saved
(defaults to the most recent "first" backup):

```shell
# Restore from the second stored backup (one-indexed)
msft-todo-backup restore list-1 list-2 list-3 --from-backup-index 2
# Restore from the first stored backup, making the following two lines equivalent
msft-todo-backup restore list-1 list-2 list-3 --from-backup-index 1
msft-todo-backup restore list-1 list-2 list-3
```

Restoration is non-destructive by default. Lists and tasks are never overwritten
or deleted; all operations are append-only. Therefore, if the restoration is
interrupted or fails, it can be safely restarted without worrying about
duplicates or missing/lost/partial data.

Further, lists with the same display name will not be recreated. Similarly,
tasks with the same body contents and content type will not be recreated.

#### Dangerous Restoration

In addition to the default [`--deep-deduplication` mode][5], there are three
other non-default "dangerous" restoration modes:

##### `--shallow-deduplication`

Unlike `--deep-deduplication`, which deduplicates using list display names and
task bodies, `--shallow-deduplication` deduplicates using the IDs of lists and
tasks. For accounts with a lot of data-heavy tasks, this can speed things up
somewhat.

However, since the creation of new lists/tasks results in those lists/tasks
having new IDs, restoration operations using `--shallow-deduplication` are
**NOT** idempotent and **NOT** resumable if interrupted. That is: executing two
`--shallow-deduplication` restoration operations to the same account
back-to-back without creating a new backup before the second restoration
operation will _always_ result in duplicates.

##### `--no-deduplication`

No checks for duplicate lists or tasks are performed before restoration. When
using this mode, _all_ lists and tasks will always be restored separately from
the lists and tasks that already exist in the account. This will likely result
in many duplicates and will require manual resolution and list merging by the
user.

```shell
msft-todo-backup restore "My Special List" --no-deduplication
```

##### `--clean-before-restore`

All existing lists and tasks will be deleted before the restoration process is
performed. When using this mode, **all existing lists and tasks in the entire
account will be irrecoverably destroyed**. Afterwards, the restoration process
will proceed as usual. While useful for performing a sort of "system restore" to
return your lists back to a previous state in time, since this mode involves
deletion of data, it is extremely dangerous and should be invoked only with the
utmost caution.

```shell
msft-todo-backup restore --clean-before-restore
```

### Enumerating and Deleting Stored Backups

You can also enumerate and delete backups:

```shell
# List all backups along with the lists they contain and some metadata
msft-todo-backup list
# Delete all but the most recent two backup files
msft-todo-backup clean --keep-num-backups 2
# Delete all backup files
msft-todo-backup clean --keep-num-backups 0
# Will fail without the --keep-num-backups flag to prevent accidental usage
msft-todo-backup clean
```

Enumerating backups with `msft-todo-backup list` will also reveal the internal
index of each backed up list, which can be provided when executing commands in
lieu of the list's display name. This is useful when two lists might have the
same name. When two or more lists have the same name, referring to that name
when executing a restoration operation will result in an error. However,
referring to the list using its internal index will allow the operation to
proceed normally.

For example, suppose your account has the following lists: "list-A" (index=1),
"list-B" (index=2), and a second "list-A" (index=3). The following command,
which attempts to restore _only the second list-A_, will fail:

```shell
# Fails due to ambiguity
msft-todo-backup restore list-A
```

However, the following command will succeed, restoring the second list-A and
ignoring the first:

```shell
# Succeeds
msft-todo-backup restore --list-index 3
# You can also specify multiple IDs (one-indexed)
msft-todo-backup restore --list-index 2 --list-index=3
```

When two or more lists have the same name, referring to that name when executing
a _backup_ operation will _not_ error. Instead, all of the lists with a matching
display name will be backed up. For example, the following will backup all lists
named "list-A":

```shell
# Succeeds
msft-todo-backup backup list-A
```

## Appendix

Further documentation can be found under [`docs/`][x-repo-docs].

### Limitations and Considerations

First and foremost, though I've tested this on my own account and use it daily
to back up thousands of tasks, **make sure you test this package thoroughly to
ensure it meets your needs before you use it on precious or sensitive data**.
You alone are responsible for the integrity, safety, and existence of your data.

Second, this package shares ZERO data or account permissions with any service or
external entity except for Microsoft itself. Your data is yours.

Third, it seems the current Microsoft Graph API does not expose any method of
capturing or specifying task list groups. This means any restoration action that
requires new lists to be created will result in said lists not being added to
any task list groups. Deduplicated restorations (the default kind of
restoration), when adding tasks to existing task lists, are unaffected by this
limitation. The old beta version of Microsoft's Graph API did have a
[taskGroups][6] endpoint, but it looks like it was removed for some reason.
Perhaps this can be revisited at a later point. PRs welcome!

Fourth, linked resources and extensions are _not_ backed up, though the API
exposes methods of capturing and perhaps restoring them. I haven't played around
with it though since the functionality would be of limited use to me. PRs
welcome!

Finally, note that moving a task from one list to another will change its ID.
This can result in unexpected duplicates during restorations when using
non-default restoration modes.

### Inspiration

Thanks to [Dan O'Sullivan][7] for giving me an idea of how Microsoft's Graph API
works and the knowledge that backing up Microsoft Todo tasks was even possible.

### Published Package Details

This is a [CJS2 package][x-pkg-cjs-mojito] with statically-analyzable exports
built by Babel for Node14 and above.

<details><summary>Expand details</summary>

That means both CJS2 (via `require(...)`) and ESM (via `import { ... } from ...`
or `await import(...)`) source will load this package from the same entry points
when using Node. This has several benefits, the foremost being: less code
shipped/smaller package size, avoiding [dual package
hazard][x-pkg-dual-package-hazard] entirely, distributables are not
packed/bundled/uglified, and a less complex build process.

Each entry point (i.e. `ENTRY`) in [`package.json`'s
`exports[ENTRY]`][x-repo-package-json] object includes one or more [export
conditions][x-pkg-exports-conditions]. These entries may or may not include: an
[`exports[ENTRY].types`][x-pkg-exports-types-key] condition pointing to a type
declarations file for TypeScript and IDEs, an
[`exports[ENTRY].module`][x-pkg-exports-module-key] condition pointing to
(usually ESM) source for Webpack/Rollup, an `exports[ENTRY].node` condition
pointing to (usually CJS2) source for Node.js `require` _and `import`_, an
`exports[ENTRY].default` condition pointing to source for browsers and other
environments, and [other conditions][x-pkg-exports-conditions] not enumerated
here. Check the [package.json][x-repo-package-json] file to see which export
conditions are supported.

Though [`package.json`][x-repo-package-json] includes
[`{ "type": "commonjs" }`][x-pkg-type], note that any ESM-only entry points will
be ES module (`.mjs`) files. Finally, [`package.json`][x-repo-package-json] also
includes the [`sideEffects`][x-pkg-side-effects-key] key, which is `false` for
optimal [tree shaking][x-pkg-tree-shaking].

</details>

### License

See [LICENSE][x-repo-license].

## Contributing and Support

**[New issues][x-repo-choose-new-issue] and [pull requests][x-repo-pr-compare]
are always welcome and greatly appreciated! 🤩** Just as well, you can [star 🌟
this project][x-badge-repo-link] to let me know you found it useful! ✊🏿 Thank
you!

See [CONTRIBUTING.md][x-repo-contributing] and [SUPPORT.md][x-repo-support] for
more information.

### Contributors

<!-- remark-ignore-start -->
<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->

[![All Contributors](https://img.shields.io/badge/all_contributors-1-orange.svg?style=flat-square)](#contributors-)

<!-- ALL-CONTRIBUTORS-BADGE:END -->
<!-- remark-ignore-end -->

Thanks goes to these wonderful people ([emoji
key][x-repo-all-contributors-emojis]):

<!-- remark-ignore-start -->
<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->

<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://xunn.io/"><img src="https://avatars.githubusercontent.com/u/656017?v=4?s=100" width="100px;" alt="Bernard"/><br /><sub><b>Bernard</b></sub></a><br /><a href="#infra-Xunnamius" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a> <a href="https://github.com/Xunnamius/msft-todo-backup/commits?author=Xunnamius" title="Code">💻</a> <a href="https://github.com/Xunnamius/msft-todo-backup/commits?author=Xunnamius" title="Documentation">📖</a> <a href="#maintenance-Xunnamius" title="Maintenance">🚧</a> <a href="https://github.com/Xunnamius/msft-todo-backup/commits?author=Xunnamius" title="Tests">⚠️</a> <a href="https://github.com/Xunnamius/msft-todo-backup/pulls?q=is%3Apr+reviewed-by%3AXunnamius" title="Reviewed Pull Requests">👀</a></td>
    </tr>
  </tbody>
  <tfoot>
    <tr>
      <td align="center" size="13px" colspan="7">
        <img src="https://raw.githubusercontent.com/all-contributors/all-contributors-cli/1b8533af435da9854653492b1327a23a4dbd0a10/assets/logo-small.svg">
          <a href="https://all-contributors.js.org/docs/en/bot/usage">Add your contributions</a>
        </img>
      </td>
    </tr>
  </tfoot>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->
<!-- remark-ignore-end -->

This project follows the [all-contributors][x-repo-all-contributors]
specification. Contributions of any kind welcome!

[x-badge-blm-image]: https://xunn.at/badge-blm 'Join the movement!'
[x-badge-blm-link]: https://xunn.at/donate-blm
[x-badge-codecov-image]:
  https://img.shields.io/codecov/c/github/Xunnamius/msft-todo-backup/main?style=flat-square&token=HWRIOBAAPW
  'Is this package well-tested?'
[x-badge-codecov-link]: https://codecov.io/gh/Xunnamius/msft-todo-backup
[x-badge-downloads-image]:
  https://img.shields.io/npm/dm/msft-todo-backup?style=flat-square
  'Number of times this package has been downloaded per month'
[x-badge-lastcommit-image]:
  https://img.shields.io/github/last-commit/xunnamius/msft-todo-backup?style=flat-square
  'Latest commit timestamp'
[x-badge-license-image]:
  https://img.shields.io/npm/l/msft-todo-backup?style=flat-square
  "This package's source license"
[x-badge-license-link]:
  https://github.com/Xunnamius/msft-todo-backup/blob/main/LICENSE
[x-badge-npm-image]:
  https://xunn.at/npm-pkg-version/msft-todo-backup
  'Install this package using npm or yarn!'
[x-badge-npm-link]: https://www.npmjs.com/package/msft-todo-backup
[x-badge-repo-link]: https://github.com/xunnamius/msft-todo-backup
[x-badge-semanticrelease-image]:
  https://xunn.at/badge-semantic-release
  'This repo practices continuous integration and deployment!'
[x-badge-semanticrelease-link]:
  https://github.com/semantic-release/semantic-release
[x-pkg-cjs-mojito]:
  https://dev.to/jakobjingleheimer/configuring-commonjs-es-modules-for-nodejs-12ed#publish-only-a-cjs-distribution-with-property-exports
[x-pkg-dual-package-hazard]:
  https://nodejs.org/api/packages.html#dual-package-hazard
[x-pkg-exports-conditions]:
  https://webpack.js.org/guides/package-exports#reference-syntax
[x-pkg-exports-module-key]:
  https://webpack.js.org/guides/package-exports#providing-commonjs-and-esm-version-stateless
[x-pkg-exports-types-key]:
  https://devblogs.microsoft.com/typescript/announcing-typescript-4-5-beta#packagejson-exports-imports-and-self-referencing
[x-pkg-side-effects-key]:
  https://webpack.js.org/guides/tree-shaking#mark-the-file-as-side-effect-free
[x-pkg-tree-shaking]: https://webpack.js.org/guides/tree-shaking
[x-pkg-type]:
  https://github.com/nodejs/node/blob/8d8e06a345043bec787e904edc9a2f5c5e9c275f/doc/api/packages.md#type
[x-repo-all-contributors]: https://github.com/all-contributors/all-contributors
[x-repo-all-contributors-emojis]: https://allcontributors.org/docs/en/emoji-key
[x-repo-choose-new-issue]:
  https://github.com/xunnamius/msft-todo-backup/issues/new/choose
[x-repo-contributing]: /CONTRIBUTING.md
[x-repo-docs]: docs
[x-repo-license]: ./LICENSE
[x-repo-package-json]: package.json
[x-repo-pr-compare]: https://github.com/xunnamius/msft-todo-backup/compare
[x-repo-support]: /.github/SUPPORT.md
[1]:
  https://aad.portal.azure.com#view/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/~/RegisteredApps
[2]:
  https://learn.microsoft.com/en-us/graph/auth-register-app-v2#register-an-application
[3]: https://opensource.com/article/17/11/how-use-cron-linux
[4]:
  https://www.windowscentral.com/how-create-automated-task-using-task-scheduler-windows-10
[5]: #restoring-lists
[6]:
  https://learn.microsoft.com/en-us/graph/api/outlookuser-list-taskgroups?view=graph-rest-beta&tabs=http
[7]:
  https://blog.osull.com/2020/09/14/backup-migrate-microsoft-to-do-tasks-with-powershell-and-microsoft-graph
