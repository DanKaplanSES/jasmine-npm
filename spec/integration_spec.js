const child_process = require('child_process');

describe('Integration', function () {
  beforeEach(function() {
    jasmine.addMatchers({
      toBeSuccess: function(matchersUtil) {
        return {
          compare: function(actual, expected) {
            const result = { pass: actual.exitCode === 0 };

            if (result.pass) {
              result.message = 'Expected process not to succeed but it did.';
            } else {
              result.message = `Expected process to succeed but it exited ${actual.exitCode}.`;
            }

            result.message += '\n\nOutput:\n' + actual.output;
            return result;
          }
        };
      }
    });
  });

  it('supports ES modules', async function () {
    const {exitCode, output} = await runJasmine('spec/fixtures/esm', 'jasmine.mjs');
    expect(exitCode).toEqual(0);
    expect(output).toContain(
      'name_reporter\n' +
      'commonjs_helper\n' +
      'esm_helper\n' +
      'Started\n' +
      'Spec: A spec file ending in .js is required as a commonjs module\n' +
      '.Spec: A spec file ending in .mjs is imported as an es module\n'
    );
  });

  it('supports ES module reporters that end in .mjs', async function() {
    let {output} = await runJasmine(
      'spec/fixtures/sample_project',
      'spec/support/jasmine.json',
      ['--reporter=../customReporter.mjs']
    );
    expect(output).toContain('customReporter.mjs jasmineDone');
  });

  it('supports ES module reporters that end in .js', async function() {
    let {output} = await runJasmine(
      'spec/fixtures/esm-reporter-packagejson',
      'jasmine.json',
      ['--reporter=./customReporter.js']
    );
    expect(output).toContain('customReporter.js jasmineDone');
  });

  it('loads .js files using import when jsLoader is "import"', async function() {
    expect(await runJasmine('spec/fixtures/js-loader-import')).toBeSuccess();
  });

  it('loads .js files using require when jsLoader is "require"', async function() {
    expect(await runJasmine('spec/fixtures/js-loader-require')).toBeSuccess();
  });

  it('loads .js files using import when jsLoader is undefined', async function() {
    expect(await runJasmine('spec/fixtures/js-loader-default')).toBeSuccess();
  });

  it('falls back to require when loading extensions that import does not support', async function() {
    expect(await runJasmine('spec/fixtures/import-jsx')).toBeSuccess();
  });


  it('handles load-time exceptions from CommonJS specs properly', async function () {
    const {exitCode, output} = await runJasmine('spec/fixtures/cjs-load-exception');
    expect(exitCode).toEqual(1);
    expect(output).toContain('Error: nope');
    expect(output).toMatch(/at .*throws_on_load.js/);
  });

  it('handles load-time exceptions from ESM specs properly', async function () {
    const {exitCode, output} = await runJasmine('spec/fixtures/esm-load-exception');
    expect(exitCode).toEqual(1);
    expect(output).toContain('Error: nope');
    expect(output).toMatch(/at .*throws_on_load.mjs/);
  });

  it('handles syntax errors in CommonJS specs properly', async function () {
    const {exitCode, output} = await runJasmine('spec/fixtures/cjs-syntax-error');
    expect(exitCode).toEqual(1);
    expect(output).toContain('SyntaxError');
    expect(output).toContain('syntax_error.js');
  });

  it('handles syntax errors in ESM specs properly', async function () {
    const {exitCode, output} = await runJasmine('spec/fixtures/esm-syntax-error');
    expect(exitCode).toEqual(1);
    expect(output).toContain('SyntaxError');
    expect(output).toContain('syntax_error.mjs');
  });

  it('handles syntax errors from a CommonJS module loaded from an ESM spec properly', async function() {
    try {
      await import('./fixtures/topLevelAwaitSentinel.mjs');
    } catch (e) {
      if (e instanceof SyntaxError && e.message === 'Unexpected reserved word') {
        pending('This Node version does not support top-level await');
      } else if (e.message === 'Not supported') {
        pending('This Node version does not support dynamic import');
      } else {
        throw e;
      }
    }

    const {exitCode, output} = await runJasmine('spec/fixtures/esm-importing-commonjs-syntax-error');
    expect(exitCode).toEqual(1);
    expect(output).toContain('SyntaxError');
    expect(output).toContain('syntax_error.js');
  });

  it('handles exceptions thrown from a module loaded from an ESM spec properly', async function() {
    const {exitCode, output} = await runJasmine('spec/fixtures/esm-indirect-error');
    expect(exitCode).toEqual(1);
    expect(output).toContain('nope');
    expect(output).toContain('throws.mjs');
  });

  it('can configure the env via the `env` config property', async function() {
    const {exitCode, output} = await runJasmine('spec/fixtures/env-config');
    expect(exitCode).toEqual(0);
    expect(output).toContain(
      'in spec 1\n.in spec 2\n.in spec 3\n.in spec 4\n.in spec 5'
    );
  });

  describe('Programmatic usage', function() {
    it('exits on completion by default', async function() {
      const {exitCode, output} = await runCommand('node', ['spec/fixtures/defaultProgrammaticFail.js']);
      expect(exitCode).toEqual(3);
      expect(output).toContain('1 spec, 1 failure');
    });

    it('does not exit on completion when exitOnCompletion is set to false', async function() {
      const {exitCode, output} = await runCommand('node', ['spec/fixtures/dontExitOnCompletion.js']);
      expect(exitCode).toEqual(0);
      expect(output).toContain('in setTimeout cb');
    });

    it('resolves the returned promise when the suite passes', async function() {
      const {exitCode, output} = await runCommand('node', ['spec/fixtures/promiseSuccess.js']);
      expect(exitCode).toEqual(0);
      expect(output).toContain('Promise success!');
    });

    it('resolves the returned promise when the suite fails', async function() {
      const {exitCode, output} = await runCommand('node', ['spec/fixtures/promiseFailure.js']);
      expect(exitCode).toEqual(0);
      expect(output).toContain('Promise failure!');
    });

    it('resolves the returned promise when the suite is incomplete', async function() {
      const {exitCode, output} = await runCommand('node', ['spec/fixtures/promiseIncomplete.js']);
      expect(exitCode).toEqual(0);
      expect(output).toContain('Promise incomplete!');
    });
  });

  describe('When exit() is called before the suite finishes', function() {
    describe('in normal mode', function () {
      it('exits with status 4', async function () {
        const {exitCode} = await runJasmine(
          'spec/fixtures/premature_exit',
          'jasmine.json'
        );
        expect(exitCode).toEqual(4);
      });
    });

    describe('in parallel mode', function () {
      it('exits with status 4', async function () {
        const {exitCode} = await runJasmine(
          'spec/fixtures/premature_exit',
          'jasmine.json',
          ['--parallel=2']
        );
        expect(exitCode).toEqual(4);
      });
    });
  });

  it('does not create globals when the globals option is false', async function() {
    const {exitCode, output} = await runCommand('node', ['runner.js'], 'spec/fixtures/no-globals');

    expect(exitCode).toEqual(0);
    expect(output).toContain('1 spec, 0 failures');
    expect(output).toContain('Globals OK');
  });

  describe('Parallel execution', function() {
    it('runs a passing suite', async function () {
      const expectedOutput = 'Started\n' +
        '...\n' +
        '\n' +
        '\n' +
        '3 specs, 0 failures\n' +
        'Ran in parallel with 2 workers\n' +
        'Finished in ';

      const {exitCode, output} = await runJasmine(
        'spec/fixtures/parallel_pass',
        'jasmine.json',
        ['--parallel=2']
      );

      expect(exitCode).toEqual(0);
      expect(output).toContain(expectedOutput);
    });

    it('runs an incomplete suite', async function () {
      const {exitCode, output} = await runJasmine(
        'spec/fixtures/parallel_suite_incomplete',
        'jasmine.json',
        ['--parallel=2']
      );

      expect(exitCode).toEqual(2);
      expect(output).toContain('Incomplete: No specs found');
    });

    it('runs a suite with a spec failure', async function () {
      const expectedChunks = [
        'Started\n',

        '\n' +
        'Failures:\n' +
        '1) Spec file 1 a failing spec\n' +
        '  Message:\n' +
        '    Expected 1 to be 2.\n' +
        '  Stack:\n' +
        '        at <Jasmine>\n' +
        '        at UserContext.<anonymous> ',

        '3 specs, 1 failure\n' +
        'Ran in parallel with 2 workers\n' +
        'Finished in '
      ];

      const {exitCode, output} = await runJasmine(
        'spec/fixtures/parallel_spec_fail',
        'jasmine.json',
        ['--parallel=2']
      );

      expect(exitCode).toEqual(3);

      for (const chunk of expectedChunks) {
        expect(output).toContain(chunk);
      }

      expect(output).toMatch(/(F\.\.)|(\.F\.)|(\.\.\F)/);
    });

    it('runs a suite with a suite failure', async function () {
      const expectedChunks = [
        'Started\n' +
        '..\n' +
        '\n' +
        '\n' +
        'Suite error: Spec file 1\n' +
        '  Message:\n' +
        '    Expected 1 to be 2.\n' +
        '  Stack:\n' +
        '        at <Jasmine>\n' +
        '        at UserContext.<anonymous> ',

        '2 specs, 1 failure\n' +
        'Ran in parallel with 2 workers\n' +
        'Finished in '
      ];

      const {exitCode, output} = await runJasmine(
        'spec/fixtures/parallel_suite_fail',
        'jasmine.json',
        ['--parallel=2']
      );

      expect(exitCode).toEqual(3);

      for (const chunk of expectedChunks) {
        expect(output).toContain(chunk);
      }
    });

    it('runs a suite with no specs', async function () {
      const expectedChunks = [
        'Started\n' +
        '\n' +
        '\n' +
        'No specs found\n' +
        'Ran in parallel with 2 workers\n' +
        'Finished in ',

        'Incomplete: No specs found\n'
      ];

      const {exitCode, output} = await runJasmine(
        'spec/fixtures/parallel_no_specs',
        'jasmine.json',
        ['--parallel=2']
      );

      expect(exitCode).toEqual(2);

      for (const chunk of expectedChunks) {
        expect(output).toContain(chunk);
      }
    });

    it('loads helper files in each worker process', async function () {
      const expectedOutput = 'Started\n' +
        '..\n' +
        '\n' +
        '\n' +
        '2 specs, 0 failures\n' +
        'Ran in parallel with 2 workers\n' +
        'Finished in ';

      const {exitCode, output} = await runJasmine(
        'spec/fixtures/parallel_helpers',
        'jasmine.json',
        ['--parallel=2']
      );

      expect(exitCode).toEqual(0);
      expect(output).toContain(expectedOutput);
    });

    it('handles spec file load exceptions in worker processes', async function () {
      const {exitCode, output} = await runJasmine(
        'spec/fixtures/parallel_spec_load_exception',
        'jasmine.json',
        ['--parallel=2']
      );

      expect(exitCode).toEqual(3);
      expect(output).toMatch(/Error loading .*\/spec\/fixtures\/parallel_spec_load_exception\/spec.js: nope/);
      expect(output).toMatch(/at Object\.<anonymous> .*spec[\\\/]fixtures[\\\/]parallel_spec_load_exception[\\\/]spec\.js/);
    });

    it('handles helper file load exceptions in worker processes', async function () {
      const {exitCode, output} = await runJasmine(
        'spec/fixtures/parallel_helper_load_exception',
        'jasmine.json',
        ['--parallel=2']
      );

      expect(exitCode).toEqual(1);
      const prefix = 'Fatal error in worker: nope\n';
      expect(output).toContain(prefix);
      expect(output).toMatch(/at Object\.<anonymous> .*spec[\\\/]fixtures[\\\/]parallel_helper_load_exception[\\\/]helper\.js/);

      // The error should only be logged once.
      const firstIndex = output.indexOf(prefix);
      const nextIndex = output.indexOf(prefix, firstIndex + 1);
      expect(nextIndex)
        .withContext('error was reported more than once')
        .toEqual(-1);
    });

    it('prohibits top level beforeEach in spec files in parallel', async function() {
      const {exitCode, output} = await runJasmine(
        'spec/fixtures/parallel_invalid_beforeEach',
        'jasmine.json',
        ['--parallel=2']
      );

      expect(exitCode).toEqual(3);
      expect(output).toContain('In parallel mode, ' +
        'beforeEach must be in a describe block or in a helper file');
    });

    it('prohibits top level afterEach in spec files in parallel', async function() {
      const {exitCode, output} = await runJasmine(
        'spec/fixtures/parallel_invalid_afterEach',
        'jasmine.json',
        ['--parallel=2']
      );

      expect(exitCode).toEqual(3);
      expect(output).toMatch(
        /Error loading .*\/spec\/fixtures\/parallel_invalid_afterEach\/spec.js: In parallel mode, afterEach must be in a describe block or in a helper file/
      );
    });

    it('allows beforeEach and afterEach in helpers and in describe in parallel', async function() {
      const {exitCode, output} = await runJasmine(
        'spec/fixtures/parallel_before_after',
        'jasmine.json',
        ['--parallel=2']
      );

      expect(exitCode).toEqual(0);
      expect(output).toContain('beforeEach in helper ran');
      expect(output).toContain('afterEach in helper ran');
      expect(output).toContain('beforeEach in describe ran');
      expect(output).toContain('afterEach in describe ran');
    });

    it('loads requires in each worker', async function() {
      const {exitCode} = await runJasmine(
        'spec/fixtures/parallel_requires',
        'jasmine.json',
        ['--parallel=2']
      );

      expect(exitCode).toEqual(0);
    });

    it('passes, the jsLoader config setting to workers', async function() {
      const {exitCode, output} = await runJasmine(
        'spec/fixtures/parallel_jsLoader',
        'jasmine.json',
        ['--parallel=2']
      );

      expect(exitCode).toEqual(0);
      expect(output).toContain('1 spec, 0 failures');
    });

    it('passes the --filter setting to workers', async function() {
      const {output} = await runJasmine(
        'spec/fixtures/parallel_filter',
        'jasmine.json',
        ['--parallel=2', '--filter=foo']
      );

      expect(output).toContain('suite 1 foo');
      expect(output).toContain('suite 2 foo');
      expect(output).toContain('Ran 2 of 4 specs');
      expect(output).toContain('2 specs, 2 failures');
    });

    it('does not create globals when the globals option is false', async function() {
      const {exitCode, output} = await runCommand('node', ['runner.js'], 'spec/fixtures/no-globals-parallel');

      expect(exitCode).toEqual(0);
      expect(output).toContain('2 specs, 0 failures');
    });
  });

  describe('Global setup and teardown', function() {
    const scenarios = [['parallel', ['--parallel=2']], ['non-parallel', []]];
    for (const [description, extraArgs] of scenarios) {
      describe(description, function() {
        it('runs globalSetup', async function() {
          const {exitCode, output} = await runJasmine(
            'spec/fixtures/global_setup_success',
            'jasmine.js',
            extraArgs
          );

          expect(exitCode).toEqual(0);
          expect(output).toContain('in globalSetup');
        });

        it('runs globalTeardown', async function() {
          const {exitCode, output} = await runJasmine(
            'spec/fixtures/global_teardown_success',
            'jasmine.js',
            extraArgs
          );

          expect(exitCode).toEqual(0);
          expect(output).toContain('in globalTeardown');
        });

        it('fails if globalSetup fails', async function() {
          const {exitCode, output} = await runJasmine(
            'spec/fixtures/global_setup_failure',
            'jasmine.js',
            extraArgs
          );

          expect(exitCode).toEqual(1);
          expect(output).toContain('oops');
        });

        it('fails if globalTeardown fails', async function() {
          const {exitCode, output} = await runJasmine(
            'spec/fixtures/global_teardown_failure',
            'jasmine.js',
            extraArgs
          );

          expect(exitCode).toEqual(1);
          expect(output).toContain('oops');
        });

        it('fails if there is an unhandled exception during globalTeardown', async function() {
          const {exitCode, output} = await runJasmine(
            'spec/fixtures/global_teardown_unhandled',
            'jasmine.js',
            extraArgs
          );

          expect(exitCode).toEqual(1);
          expect(output).toContain('Unhandled exception during globalTeardown');
          expect(output).toContain('oops');
        });
      });
    }
  });

  it('supports --require', async function() {
    const {exitCode, output} = await runJasmine(
      'spec/fixtures/sample_project',
      'spec/support/jasmine.json',
      ['--require=../noisy_require.js']
    );
    expect(exitCode).toEqual(2); // because no specs
    expect(output).toContain('noisy require was loaded');
  });
});

async function runJasmine(cwd, config="jasmine.json", extraArgs = []) {
  const args = ['../../../bin/jasmine.js', '--config=' + config].concat(extraArgs);
  return runCommand('node', args, cwd);
}

async function runCommand(cmd, args, cwd = '.') {
  return new Promise(function(resolve) {
    const child = child_process.spawn(
      cmd,
      args,
      {
        cwd,
        shell: false
      }
    );
    let output = '';
    child.stdout.on('data', function (data) {
      output += data;
    });
    child.stderr.on('data', function (data) {
      output += data;
    });
    child.on('close', function (exitCode) {
      resolve({exitCode, output});
    });
  });
}
