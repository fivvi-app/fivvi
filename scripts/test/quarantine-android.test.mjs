import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  composeTarget,
  flowTargets,
  listedTests,
  markerProblems,
  quarantineMode,
} from '../quarantine-android.mjs';
import { checkQuarantine, MARKERS } from '../quarantine.mjs';

const SCRIPT = join(import.meta.dirname, '..', 'quarantine-android.mjs');
const REPO = join(import.meta.dirname, '..', '..');
const TODAY = '2026-11-13';
const ENTRY = (test) => `${test} | #1400 | 2026-11-12 | 2026-11-19`;

// Spec #1356, ticket #1363 (ADR-025, amendment of 12 November 2026): the Compose and Maestro quarantine lists, the markers
// of the tests that are never quarantined, and the readers' view of both.

let base;
let count = 0;
/** A checkout with Kotlin test sources ({path: text}), Maestro flows ({name: header}) and the lists ({runner: lines}). */
const checkout = ({ kotlin = {}, flows = {}, lists = {} } = {}) => {
  const root = join(base, `c${count++}`);
  mkdirSync(join(root, 'quarantine'), { recursive: true });
  for (const [path, text] of Object.entries(kotlin)) {
    mkdirSync(dirname(join(root, 'apps/android', path)), { recursive: true });
    writeFileSync(join(root, 'apps/android', path), text);
  }
  mkdirSync(join(root, 'e2e/maestro/shared'), { recursive: true });
  writeFileSync(join(root, 'e2e/maestro/config.yaml'), 'flows:\n  - "*"\n');
  writeFileSync(join(root, 'e2e/maestro/shared/sign-in.yaml'), '- tapOn: x\n');
  for (const [name, header] of Object.entries(flows))
    writeFileSync(join(root, `e2e/maestro/${name}.yaml`), `${header}\n---\n- launchApp\n`);
  for (const [runner, lines] of Object.entries(lists))
    writeFileSync(join(root, 'quarantine', `${runner}.txt`), `${lines.join('\n')}\n`);
  return root;
};

const TEST_CLASS = `package app.fivvi.pro.home

class WorkspaceSwitchTest {
    @Test
    fun switchesWorkspace() {}

    @Test
    @Isolation
    fun showsNoClientsOfTheOtherWorkspace() {}

    @Test
    @Permission fun hidesTheActionWithoutTheCapability() {}

    @Test
    fun \`@concurrency-free name\`() {}
}
`;
const MARKED_CLASS = `package app.fivvi.pro.capabilities

@Permission
class WorkspaceCapabilitiesTest {
    @Test
    fun anyTest() {}
}
`;
const UNIT = 'app/src/test/kotlin/app/fivvi/pro/capabilities/WorkspaceCapabilitiesTest.kt';
const UI = 'app/src/androidTest/kotlin/app/fivvi/pro/home/WorkspaceSwitchTest.kt';
const CLIENT_UI = 'client/src/androidTest/kotlin/app/fivvi/client/ClientAppTest.kt';
const SWITCH = 'app.fivvi.pro.home.WorkspaceSwitchTest';

describe('#1363 the Compose and Maestro lists', () => {
  before(() => {
    base = realpathSync(mkdtempSync(join(tmpdir(), 'quarantine-android-')));
  });
  after(() => rmSync(base, { recursive: true, force: true }));

  describe('the readers', () => {
    it('AC1: listedTests is the test column of the list, without comments and blank lines', () => {
      const root = checkout({
        lists: {
          compose: ['# a comment', '', ENTRY(`${SWITCH}#switchesWorkspace`), ENTRY(`${SWITCH}#x`)],
        },
      });
      assert.deepEqual(listedTests('compose', { root }), [
        `${SWITCH}#switchesWorkspace`,
        `${SWITCH}#x`,
      ]);
      assert.deepEqual(
        listedTests('maestro', { root }),
        [],
        'a list that does not exist has no entries',
      );
    });

    it('AC1: the mode is exclude, or only in the Quarantine job (FIVVI_QUARANTINE=only), and nothing else', () => {
      assert.equal(quarantineMode({}), 'exclude');
      assert.equal(quarantineMode({ FIVVI_QUARANTINE: '' }), 'exclude');
      assert.equal(quarantineMode({ FIVVI_QUARANTINE: 'only' }), 'only');
      assert.throws(() => quarantineMode({ FIVVI_QUARANTINE: 'yes' }), /must be "only" or not set/);
    });

    it('AC1: a Compose entry finds its source: a unit test under src/test, a UI test under src/androidTest, with its module', () => {
      const root = checkout({ kotlin: { [UNIT]: MARKED_CLASS, [UI]: TEST_CLASS } });
      assert.deepEqual(
        composeTarget('app.fivvi.pro.capabilities.WorkspaceCapabilitiesTest#anyTest', { root }),
        { module: 'app', kind: 'unit', file: `apps/android/${UNIT}` },
      );
      assert.deepEqual(composeTarget(`${SWITCH}#switchesWorkspace`, { root }), {
        module: 'app',
        kind: 'ui',
        file: `apps/android/${UI}`,
      });
      assert.deepEqual(
        composeTarget(SWITCH, { root })?.kind,
        'ui',
        'a class alone names all its tests',
      );
    });

    it('AC1: a Compose entry that names no test class, or no method of it, has no source', () => {
      const root = checkout({ kotlin: { [UI]: TEST_CLASS } });
      assert.equal(composeTarget('app.fivvi.pro.home.NoSuchTest#x', { root }), null);
      assert.equal(composeTarget(`${SWITCH}#noSuchMethod`, { root }), null);
      assert.equal(composeTarget('NoPackage#x', { root }), null);
    });

    it('AC1: a Maestro entry is a flow file of e2e/maestro without .yaml, never config or a shared sub-flow', () => {
      const root = checkout({ flows: { clients: 'appId: x', 'workspace-switch': 'appId: x' } });
      assert.deepEqual(flowTargets('only', { root, tests: ['clients'] }).flows, [
        'e2e/maestro/clients.yaml',
      ]);
      assert.deepEqual(flowTargets('only', { root, tests: ['config'] }).missing, ['config']);
      assert.deepEqual(flowTargets('only', { root, tests: ['shared/sign-in'] }).missing, [
        'shared/sign-in',
      ]);
      assert.deepEqual(flowTargets('only', { root, tests: ['clients.yaml'] }).missing, [
        'clients.yaml',
      ]);
    });

    it('AC1: exclude runs every flow but the listed ones; only runs exactly the listed ones', () => {
      const root = checkout({ flows: { a: 'appId: x', b: 'appId: x', c: 'appId: x' } });
      assert.deepEqual(flowTargets('exclude', { root, tests: ['b'] }).flows, [
        'e2e/maestro/a.yaml',
        'e2e/maestro/c.yaml',
      ]);
      assert.deepEqual(flowTargets('only', { root, tests: ['c', 'a'] }).flows, [
        'e2e/maestro/a.yaml',
        'e2e/maestro/c.yaml',
      ]);
      assert.deepEqual(flowTargets('exclude', { root, tests: ['gone'] }).missing, ['gone']);
    });
  });

  describe('AC2: the markers the rule reads', () => {
    const problemsOf = (runner, test, files) =>
      markerProblems(runner, test, { root: checkout(files), markers: MARKERS });

    it('a Compose test with the annotation on its method, or on its class, is marked', () => {
      const files = { kotlin: { [UI]: TEST_CLASS, [UNIT]: MARKED_CLASS } };
      assert.match(
        problemsOf('compose', `${SWITCH}#showsNoClientsOfTheOtherWorkspace`, files)[0],
        /@isolation/,
      );
      assert.match(
        problemsOf('compose', `${SWITCH}#hidesTheActionWithoutTheCapability`, files)[0],
        /@permission/,
      );
      assert.match(
        problemsOf(
          'compose',
          'app.fivvi.pro.capabilities.WorkspaceCapabilitiesTest#anyTest',
          files,
        )[0],
        /@permission/,
      );
    });

    it('a test of an unmarked method, and an entry that names no test, are not marked', () => {
      const files = { kotlin: { [UI]: TEST_CLASS } };
      assert.deepEqual(problemsOf('compose', `${SWITCH}#switchesWorkspace`, files), []);
      assert.deepEqual(problemsOf('compose', 'app.fivvi.pro.home.Gone#x', files), []);
    });

    it('an entry that lists a class names every test of it: a marked method makes it a problem too', () => {
      const files = { kotlin: { [UI]: TEST_CLASS } };
      assert.match(problemsOf('compose', SWITCH, files)[0], /@isolation, @permission/);
    });

    it('a marker of a class is not read from another class or a similar annotation', () => {
      const text = `package p\n\n@Permissions\nclass AATest {\n    @Test\n    fun a() {}\n}\n\n@Isolation\nclass BBTest {\n    @Test\n    fun b() {}\n}\n`;
      const files = {
        kotlin: {
          'app/src/test/kotlin/p/AATest.kt': text,
          'app/src/test/kotlin/p/BBTest.kt': text,
        },
      };
      assert.deepEqual(problemsOf('compose', 'p.AATest#a', files), []);
      assert.match(problemsOf('compose', 'p.BBTest#b', files)[0], /@isolation/);
    });

    it('a marker written fully qualified, or above a multi-line annotation, is read too', () => {
      const text = `package p

class CCTest {
    @app.fivvi.core.quarantine.Isolation
    @Test
    fun qualified() {}

    @Permission
    @Test(
        timeout = 1000,
    )
    fun multiLine() {}

    @Concurrency
    @Suppress("A", "B")
    @Test(timeout = 1000)
    fun sameLine() {}

    @Test(
        timeout = 1000,
    )
    fun unmarked() {}
}
`;
      const files = { kotlin: { 'app/src/test/kotlin/p/CCTest.kt': text } };
      assert.match(problemsOf('compose', 'p.CCTest#qualified', files)[0], /@isolation/);
      assert.match(problemsOf('compose', 'p.CCTest#multiLine', files)[0], /@permission/);
      assert.match(problemsOf('compose', 'p.CCTest#sameLine', files)[0], /@concurrency/);
      assert.deepEqual(problemsOf('compose', 'p.CCTest#unmarked', files), []);
    });

    it('a Maestro flow whose tags hold isolation, concurrency or permission is marked, as a list or inline', () => {
      const files = {
        flows: {
          block: 'appId: x\ntags:\n  - permission\n  - smoke',
          inline: 'appId: x\ntags: [isolation, other]',
          plain: 'appId: x\nname: tags are not here\ntags:\n  - smoke',
        },
      };
      assert.match(problemsOf('maestro', 'block', files)[0], /@permission/);
      assert.match(problemsOf('maestro', 'inline', files)[0], /@isolation/);
      assert.deepEqual(problemsOf('maestro', 'plain', files), []);
      assert.deepEqual(problemsOf('maestro', 'gone', files), []);
    });

    it('the message says what to do, as the rule does for the other runners', () => {
      const [problem] = problemsOf('compose', `${SWITCH}#showsNoClientsOfTheOtherWorkspace`, {
        kotlin: { [UI]: TEST_CLASS },
      });
      assert.match(problem, /never quarantined/);
      assert.match(problem, /fix the test or revert the change/);
    });

    it('the rule (scripts/quarantine.mjs) rejects a marked entry of the compose and maestro lists, with the line', () => {
      const root = checkout({
        kotlin: { [UI]: TEST_CLASS },
        flows: { roles: 'appId: x\ntags:\n  - permission', clients: 'appId: x' },
        lists: {
          compose: [
            ENTRY(`${SWITCH}#showsNoClientsOfTheOtherWorkspace`),
            ENTRY(`${SWITCH}#switchesWorkspace`),
          ],
          maestro: [ENTRY('roles'), ENTRY('clients')],
        },
      });
      const problems = checkQuarantine({ dir: join(root, 'quarantine'), today: TODAY, root });
      assert.equal(problems.length, 2, problems.join('\n'));
      assert.match(problems[0], /^compose\.txt:1: .*@isolation/);
      assert.match(problems[1], /^maestro\.txt:1: .*@permission/);
    });
  });

  describe('the command', () => {
    const run = (args, root, env = {}) =>
      spawnSync('node', [SCRIPT, ...args], {
        encoding: 'utf8',
        env: { ...process.env, FIVVI_QUARANTINE: '', FIVVI_QUARANTINE_ROOT: root, ...env },
      });
    const listed = {
      kotlin: {
        [UNIT]: MARKED_CLASS,
        [UI]: TEST_CLASS,
        [CLIENT_UI]:
          'package app.fivvi.client\n\nclass ClientAppTest {\n    @Test\n    fun signsIn() {}\n}\n',
      },
      flows: { a: 'appId: x', b: 'appId: x' },
      lists: {
        compose: [
          ENTRY('app.fivvi.pro.capabilities.WorkspaceCapabilitiesTest#anyTest'),
          ENTRY(`${SWITCH}#switchesWorkspace`),
          ENTRY('app.fivvi.client.ClientAppTest#signsIn'),
        ],
        maestro: [ENTRY('b')],
      },
    };

    it('count prints the number of entries of a list', () => {
      const root = checkout(listed);
      assert.equal(run(['count', 'compose'], root).stdout, '3\n');
      assert.equal(run(['count', 'maestro'], root).stdout, '1\n');
      assert.equal(run(['count', 'compose'], checkout()).stdout, '0\n');
      assert.equal(run(['count', 'xctest'], root).status, 2, 'only the Android runners');
    });

    it('tests prints every listed Compose test, comma separated, for Gradle', () => {
      const root = checkout(listed);
      assert.equal(
        run(['tests'], root).stdout,
        `app.fivvi.pro.capabilities.WorkspaceCapabilitiesTest#anyTest,${SWITCH}#switchesWorkspace,app.fivvi.client.ClientAppTest#signsIn\n`,
      );
    });

    it('ui prints the listed UI tests, comma separated; ui-modules the modules that have some', () => {
      const root = checkout(listed);
      assert.equal(
        run(['ui'], root).stdout,
        `${SWITCH}#switchesWorkspace,app.fivvi.client.ClientAppTest#signsIn\n`,
      );
      assert.equal(run(['ui-modules'], root).stdout, 'app\nclient\n');
    });

    it('a listed test that names no test fails the Quarantine job, and is a warning in a required job', () => {
      const root = checkout({
        ...listed,
        lists: { compose: [ENTRY('app.fivvi.pro.Gone#x')], maestro: [ENTRY('gone')] },
      });
      const only = run(['tests'], root, { FIVVI_QUARANTINE: 'only' });
      assert.equal(only.status, 1);
      assert.match(only.stderr, /app\.fivvi\.pro\.Gone#x is no test in apps\/android/);
      const required = run(['tests'], root);
      assert.equal(required.status, 0);
      assert.match(required.stderr, /warning: .*app\.fivvi\.pro\.Gone#x is no test/);
      const flows = run(['flows'], root, { FIVVI_QUARANTINE: 'only' });
      assert.equal(flows.status, 1);
      assert.match(flows.stderr, /gone is no flow in e2e\/maestro/);
    });

    it('flows prints the flow files to run: all but the listed ones, or only them with FIVVI_QUARANTINE=only', () => {
      const root = checkout(listed);
      assert.equal(run(['flows'], root).stdout, 'e2e/maestro/a.yaml\n');
      assert.equal(
        run(['flows'], root, { FIVVI_QUARANTINE: 'only' }).stdout,
        'e2e/maestro/b.yaml\n',
      );
    });

    it('a bad FIVVI_QUARANTINE and an unknown command fail', () => {
      const root = checkout(listed);
      assert.equal(run(['flows'], root, { FIVVI_QUARANTINE: 'all' }).status, 2);
      assert.equal(run(['nope'], root).status, 2);
    });
  });

  describe('the lists and the tests of this repository', () => {
    const lines = (runner) =>
      readFileSync(join(REPO, 'quarantine', `${runner}.txt`), 'utf8')
        .split('\n')
        .filter((line) => line.trim() !== '' && !line.startsWith('#'));

    it('AC2: the rule passes on the lists of this checkout, and the sources find the markers', () => {
      assert.deepEqual(checkQuarantine({ today: TODAY }), []);
      // A listed test that carries a marker is refused: take the real source of a marked test.
      const marked = markerProblems(
        'compose',
        'app.fivvi.pro.capabilities.WorkspaceCapabilitiesTest#test_F004_forbiddenHidesTheActionAndRefreshesTheCapabilities',
        { root: REPO, markers: MARKERS },
      );
      assert.match(marked[0] ?? '', /@permission/);
      assert.deepEqual(
        markerProblems('maestro', 'roles', { root: REPO, markers: MARKERS }).length,
        1,
      );
      assert.deepEqual(
        markerProblems('maestro', 'workspace-switch', { root: REPO, markers: MARKERS }).length,
        1,
      );
    });

    it('AC2: the markers of the tests are annotations that exist, in :core, and every Maestro tag is one the rule knows', () => {
      const kotlin = readFileSync(
        join(REPO, 'apps/android/core/src/testShared/kotlin/app/fivvi/core/quarantine/Markers.kt'),
        'utf8',
      );
      for (const marker of MARKERS) {
        const name = marker.slice(1).replace(/^./, (c) => c.toUpperCase());
        assert.match(kotlin, new RegExp(`annotation class ${name}\\b`), name);
      }
      for (const file of readdirSync(join(REPO, 'e2e/maestro')).filter((f) =>
        f.endsWith('.yaml'),
      )) {
        const header = readFileSync(join(REPO, 'e2e/maestro', file), 'utf8').split(/^---$/m)[0];
        const tags = header.match(/^tags:\n((?: {2}- .+\n)+)/m)?.[1] ?? '';
        for (const tag of tags.matchAll(/- (\S+)/g))
          assert.ok(MARKERS.includes(`@${tag[1]}`), `${file}: ${tag[1]}`);
      }
    });

    it('AC2: the refused-call, double-submit and profile tests of this repository carry their marker (TESTING.md §8)', () => {
      const marked = (runner, test, marker) =>
        assert.match(
          markerProblems(runner, test, { root: REPO, markers: MARKERS })[0] ?? '',
          new RegExp(marker),
          test,
        );
      const pro = 'app.fivvi.pro';
      marked(
        'compose',
        `${pro}.clients.ClientsScreenTest#test_F006_AC12_aSaveTheApiRefusesClosesTheEditAndHidesBewerken`,
        '@permission',
      );
      marked(
        'compose',
        `${pro}.clients.ClientsFlowTest#test_F006_AC12_aRefusedSaveHidesOnlyManageAndKeepsViewWhenTheAccountReadFails`,
        '@permission',
      );
      marked(
        'compose',
        `${pro}.home.ProfileViewModelTest#test_F005_AC5_aRefusedSwitchReadsTheListAgain`,
        '@permission',
      );
      marked(
        'compose',
        `${pro}.clients.AddClientViewModelTest#test_F006_AC12_theFormIsOnlySentOnceWhileItIsPending`,
        '@concurrency',
      );
      marked('maestro', 'profile', '@permission');
    });

    it('AC3: the lists in the checkout name tests that exist (the Quarantine job fails on one that does not)', () => {
      for (const test of lines('compose').map((l) => l.split('|')[0].trim()))
        assert.ok(composeTarget(test, { root: REPO }), test);
      for (const test of lines('maestro').map((l) => l.split('|')[0].trim()))
        assert.equal(flowTargets('only', { root: REPO, tests: [test] }).missing.length, 0, test);
    });
  });
});
