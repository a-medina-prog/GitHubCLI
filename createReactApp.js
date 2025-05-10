/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//   /!\ DO NOT MODIFY THIS FILE /!\
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//
// The only job of create-react-app is to init the repository and then
// forward all the commands to the local version of create-react-app.
//
// If you need to add a new command, please add it to the scripts/ folder.
//
// The only reason to modify this file is to add more warnings and
// troubleshooting information for the `create-react-app` command.
//
// Do not make breaking changes! We absolutely don't want to have to
// tell people to update their global version of create-react-app.
//
// Also be careful with new language features.
// This file must work on Node 10+.
//
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//   /!\ DO NOT MODIFY THIS FILE /!\
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

'use strict';

const https = require('https');
const chalk = require('chalk');
const commander = require('commander');
const dns = require('dns');
const envinfo = require('envinfo');
const execSync = require('child_process').execSync;
const fs = require('fs-extra');
const hyperquest = require('hyperquest');
const prompts = require('prompts');
const os = require('os');
const path = require('path');
const semver = require('semver');
const spawn = require('cross-spawn');
const tmp = require('tmp');
const unpack = require('tar-pack').unpack;
const url = require('url');
const validateProjectName = require('validate-npm-package-name');

const packageJson = require('./package.json');

function isUsingYarn() {
  return (process.env.npm_config_user_agent || '').indexOf('yarn') === 0;
}

function hasGivenWarning() {
  const localWarningFilePath = path.join(
    __dirname,
    'given-deprecation-warning'
  );
  return fs.existsSync(localWarningFilePath);
}

function writeWarningFile() {
  const localWarningFilePath = path.join(
    __dirname,
    'given-deprecation-warning'
  );
  fs.writeFileSync(localWarningFilePath, 'true');
}

let projectName;

function init() {
  if (!hasGivenWarning()) {
    console.log(chalk.yellow.bold('create-react-app is deprecated.'));
    console.log('');
    console.log(
      'You can find a list of up-to-date React frameworks on react.dev'
    );
    console.log(
      'For more info see:' + chalk.underline('https://react.dev/link/cra')
    );
    console.log('');
    console.log(
      chalk.grey('This error message will only be shown once per install.')
    );
    writeWarningFile();
  }

  const program = new commander.Command(packageJson.name)
    .version(packageJson.version)
    .arguments('<project-directory>')
    .usage(`${chalk.green('<project-directory>')} [options]`)
    .action(name => {
      projectName = name;
    })
    .option('--verbose', 'print additional logs')
    .option('--info', 'print environment debug info')
    .option(
      '--scripts-version <alternative-package>',
      'use a non-standard version of react-scripts'
    )
    .option(
      '--template <path-to-template>',
      'specify a template for the created project'
    )
    .option('--use-pnp')
    .allowUnknownOption()
    .on('--help', () => {
      console.log(
        `    Only ${chalk.green('<project-directory>')} is required.`
      );
      console.log();
      console.log(
        `    A custom ${chalk.cyan('--scripts-version')} can be one of:`
      );
      console.log(`      - a specific npm version: ${chalk.green('0.8.2')}`);
      console.log(`      - a specific npm tag: ${chalk.green('@next')}`);
      console.log(
        `      - a custom fork published on npm: ${chalk.green(
          'my-react-scripts'
        )}`
      );
      console.log(
        `      - a local path relative to the current working directory: ${chalk.green(
          'file:../my-react-scripts'
        )}`
      );
      console.log(
        `      - a .tgz archive: ${chalk.green(
          'https://mysite.com/my-react-scripts-0.8.2.tgz'
        )}`
      );
      console.log(
        `      - a .tar.gz archive: ${chalk.green(
          'https://mysite.com/my-react-scripts-0.8.2.tar.gz'
        )}`
      );
      console.log(
        `    It is not needed unless you specifically want to use a fork.`
      );
      console.log();
      console.log(`    A custom ${chalk.cyan('--template')} can be one of:`);
      console.log(
        `      - a custom template published on npm: ${chalk.green(
          'cra-template-typescript'
        )}`
      );
      console.log(
        `      - a local path relative to the current working directory: ${chalk.green(
          'file:../my-custom-template'
        )}`
      );
      console.log(
        `      - a .tgz archive: ${chalk.green(
          'https://mysite.com/my-custom-template-0.8.2.tgz'
        )}`
      );
      console.log(
        `      - a .tar.gz archive: ${chalk.green(
          'https://mysite.com/my-custom-template-0.8.2.tar.gz'
        )}`
      );
      console.log();
      console.log(
        `    If you have any problems, do not hesitate to file an issue:`
      );
      console.log(
        `      ${chalk.cyan(
          'https://github.com/facebook/create-react-app/issues/new'
        )}`
      );
      console.log();
    })
    .parse(process.argv);

  if (program.info) {
    console.log(chalk.bold('\nEnvironment Info:'));
    console.log(
      `\n  current version of ${packageJson.name}: ${packageJson.version}`
    );
    console.log(`  running from ${__dirname}`);
    return envinfo
      .run(
        {
          System: ['OS', 'CPU'],
          Binaries: ['Node', 'npm', 'Yarn'],
          Browsers: [
            'Chrome',
            'Edge',
            'Internet Explorer',
            'Firefox',
            'Safari',
          ],
          npmPackages: ['react', 'react-dom', 'react-scripts'],
          npmGlobalPackages: ['create-react-app'],
        },
        {
          duplicates: true,
          showNotFound: true,
        }
      )
      .then(console.log);
  }

  if (typeof projectName === 'undefined') {
    console.error('Please specify the project directory:');
    console.log(
      `  ${chalk.cyan(program.name())} ${chalk.green('<project-directory>')}`
    );
    console.log();
    console.log('For example:');
    console.log(
      `  ${chalk.cyan(program.name())} ${chalk.green('my-react-app')}`
    );
    console.log();
    console.log(
      `Run ${chalk.cyan(`${program.name()} --help`)} to see all options.`
    );
    process.exit(1);
  }

  // We first check the registry directly via the API, and if that fails, we try
  // the slower `npm view [package] version` command.
  //
  // This is important for users in environments where direct access to npm is
  // blocked by a firewall, and packages are provided exclusively via a private
  // registry.
  checkForLatestVersion()
    .catch(() => {
      try {
        return execSync('npm view create-react-app version').toString().trim();
      } catch (e) {
        return null;
      }
    })
    .then(latest => {
      if (latest && semver.lt(packageJson.version, latest)) {
        console.log();
        console.error(
          chalk.yellow(
            `You are running \`create-react-app\` ${packageJson.version}, which is behind the latest release (${latest}).\n\n` +
              'We recommend always using the latest version of create-react-app if possible.'
          )
        );
        console.log();
        console.log(
          'The latest instructions for creating a new app can be found here:\n' +
            'https://create-react-app.dev/docs/getting-started/'
        );
        console.log();
      } else {
        const useYarn = isUsingYarn();
        createApp(
          projectName,
          program.verbose,
          program.scriptsVersion,
          program.template,
          useYarn,
          program.usePnp
        );
      }
    });
}

function createApp(name, verbose, version, template, useYarn, usePnp) {
  const unsupportedNodeVersion = !semver.satisfies(
    // Coerce strings with metadata (i.e. `15.0.0-nightly`).
    semver.coerce(process.version),
    '>=14'
  );

  if (unsupportedNodeVersion) {
    console.log(
      chalk.yellow(
        `You are using Node ${process.version} so the project will be bootstrapped with an old unsupported version of tools.\n\n` +
          `Please update to Node 14 or higher for a better, fully supported experience.\n`
      )
    );
    // Fall back to latest supported react-scripts on Node 4
    version = 'react-scripts@0.9.x';
  }

  const root = path.resolve(name);
  const appName = path.basename(root);

  checkAppName(appName);
  fs.ensureDirSync(name);
  if (!isSafeToCreateProjectIn(root, name)) {
    process.exit(1);
  }
  console.log();

  console.log(`Creating a new React app in ${chalk.green(root)}.`);
  console.log();

  const packageJson = {
    name: appName,
    version: '0.1.0',
    private: true,
  };
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify(packageJson, null, 2) + os.EOL
  );

  const originalDirectory = process.cwd();
  process.chdir(root);
  if (!useYarn && !checkThatNpmCanReadCwd()) {
    process.exit(1);
  }

  if (!useYarn) {
    const npmInfo = checkNpmVersion();
    if (!npmInfo.hasMinNpm) {
      if (npmInfo.npmVersion) {
        console.log(
          chalk.yellow(
            `You are using npm ${npmInfo.npmVersion} so the project will be bootstrapped with an old unsupported version of tools.\n\n` +
              `Please update to npm 6 or higher for a better, fully supported experience.\n`
          )
        );
      }
      // Fall back to latest supported react-scripts for npm 3
      version = 'react-scripts@0.9.x';
    }
  } else if (usePnp) {
    const yarnInfo = checkYarnVersion();
    if (yarnInfo.yarnVersion) {
      if (!yarnInfo.hasMinYarnPnp) {
        console.log(
          chalk.yellow(
            `You are using Yarn ${yarnInfo.yarnVersion} together with the --use-pnp flag, but Plug'n'Play is only supported starting from the 1.12 release.\n\n` +
              `Please update to Yarn 1.12 or higher for a better, fully supported experience.\n`
          )
        );
        // 1.11 had an issue with webpack-dev-middleware, so better not use PnP with it (never reached stable, but still)
        usePnp = false;
      }
      if (!yarnInfo.hasMaxYarnPnp) {
        console.log(
          chalk.yellow(
            'The --use-pnp flag is no longer necessary with yarn 2 and will be deprecated and removed in a future release.\n'
          )
        );
        // 2 supports PnP by default and breaks when trying to use the flag
        usePnp = false;
      }
    }
  }

  run(
    root,
    appName,
    version,
    verbose,
    originalDirectory,
    template,
    useYarn,
    usePnp
  );
}

function install(root, useYarn, usePnp, dependencies, verbose, isOnline) {
  return new Promise((resolve, reject) => {
    let command;
    let args;
    if (useYarn) {
      command = 'yarnpkg';
      args = ['add', '--exact'];
      if (!isOnline) {
        args.push('--offline');
      }
      if (usePnp) {
        args.push('--enable-pnp');
      }
      [].push.apply(args, dependencies);

      // Explicitly set cwd() to work around issues like
      // https://github.com/facebook/create-react-app/issues/3326.
      // Unfortunately we can only do this for Yarn because npm support for
      // equivalent --prefix flag doesn't help with this issue.
      // This is why for npm, we run checkThatNpmCanReadCwd() early instead.
      args.push('--cwd');
      args.push(root);

      if (!isOnline) {
        console.log(chalk.yellow('You appear to be offline.'));
        console.log(chalk.yellow('Falling back to the local Yarn cache.'));
        console.log();
      }
    } else {
      command = 'npm';
      args = [
        'install',
        '--no-audit', // https://github.com/facebook/create-react-app/issues/11174
        '--save',
        '--save-exact',
        '--loglevel',
        'error',
      ].concat(dependencies);

      if (usePnp) {
        console.log(chalk.yellow("NPM doesn't support PnP."));
        console.log(chalk.yellow('Falling back to the regular installs.'));
        console.log();
      }
    }

    if (verbose) {
      args.push('--verbose');
    }

    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('close', code => {
      if (code !== 0) {
        reject({
          command: `${command} ${args.join(' ')}`,
        });
        return;
      }
      resolve();
    });
  });
}

function run(
  root,
  appName,
  version,
  verbose,
  originalDirectory,
  template,
  useYarn,
  usePnp
) {
  Promise.all([
    getInstallPackage(version, originalDirectory),
    getTemplateInstallPackage(template, originalDirectory),
  ]).then(([packageToInstall, templateToInstall]) => {
    const allDependencies = ['react', 'react-dom', packageToInstall];

    console.log('Installing packages. This might take a couple of minutes.');

    Promise.all([
      getPackageInfo(packageToInstall),
      getPackageInfo(templateToInstall),
    ])
      .then(([packageInfo, templateInfo]) =>
        checkIfOnline(useYarn).then(isOnline => ({
          isOnline,
          packageInfo,
          templateInfo,
        }))
      )
      .then(({ isOnline, packageInfo, templateInfo }) => {
        let packageVersion = semver.coerce(packageInfo.version);

        const templatesVersionMinimum = '3.3.0';

        // Assume compatibility if we can't test the version.
        if (!semver.valid(packageVersion)) {
          packageVersion = templatesVersionMinimum;
        }

        // Only support templates when used alongside new react-scripts versions.
        const supportsTemplates = semver.gte(
          packageVersion,
          templatesVersionMinimum
        );
        if (supportsTemplates) {
          allDependencies.push(templateToInstall);
        } else if (template) {
          console.log('');
          console.log(
            `The ${chalk.cyan(packageInfo.name)} version you're using ${
              packageInfo.name === 'react-scripts' ? 'is not' : 'may not be'
            } compatible with the ${chalk.cyan('--template')} option.`
          );
          console.log('');
        }

        console.log(
          `Installing ${chalk.cyan('react')}, ${chalk.cyan(
            'react-dom'
          )}, and ${chalk.cyan(packageInfo.name)}${
            supportsTemplates ? ` with ${chalk.cyan(templateInfo.name)}` : ''
          }...`
        );
        console.log();

        return install(
          root,
          useYarn,
          usePnp,
          allDependencies,
          verbose,
          isOnline
        ).then(() => ({
          packageInfo,
          supportsTemplates,
          templateInfo,
        }));
      })
      .then(async ({ packageInfo, supportsTemplates, templateInfo }) => {
        const packageName = packageInfo.name;
        const templateName = supportsTemplates ? templateInfo.name : undefined;
        checkNodeVersion(packageName);
        setCaretRangeForRuntimeDeps(packageName);

        const pnpPath = path.resolve(process.cwd(), '.pnp.js');

        const nodeArgs = fs.existsSync(pnpPath) ? ['--require', pnpPath] : [];

        await executeNodeScript(
          {
            cwd: process.cwd(),
            args: nodeArgs,
          },
          [root, appName, verbose, originalDirectory, templateName],
          `
        const init = require('${packageName}/scripts/init.js');
        init.apply(null, JSON.parse(process.argv[1]));
      `
        );

        if (version === 'react-scripts@0.9.x') {
          console.log(
            chalk.yellow(
              `\nNote: the project was bootstrapped with an old unsupported version of tools.\n` +
                `Please update to Node >=14 and npm >=6 to get supported tools in new projects.\n`
            )
          );
        }
      })
      .catch(reason => {
        console.log();
        console.log('Aborting installation.');
        if (reason.command) {
          console.log(`  ${chalk.cyan(reason.command)} has failed.`);
        } else {
          console.log(
            chalk.red('Unexpected error. Please report it as a bug:')
          );
          console.log(reason);
        }
        console.log();

        // On 'exit' we will delete these files from target directory.
        const knownGeneratedFiles = ['package.json', 'node_modules'];
        const currentFiles = fs.readdirSync(path.join(root));
        currentFiles.forEach(file => {
          knownGeneratedFiles.forEach(fileToMatch => {
            // This removes all knownGeneratedFiles.
            if (file === fileToMatch) {
              console.log(`Deleting generated file... ${chalk.cyan(file)}`);
              fs.removeSync(path.join(root, file));
            }
          });
        });
        const remainingFiles = fs.readdirSync(path.join(root));
        if (!remainingFiles.length) {
          // Delete target folder if empty
          console.log(
            `Deleting ${chalk.cyan(`${appName}/`)} from ${chalk.cyan(
              path.resolve(root, '..')
            )}`
          );
          process.chdir(path.resolve(root, '..'));
          fs.removeSync(path.join(root));
        }
        console.log('Done.');
        process.exit(1);
      });
  });
}

function getInstallPackage(version, originalDirectory) {
  let packageToInstall = 'react-scripts';
  const validSemver = semver.valid(version);
  if (validSemver) {
    packageToInstall += `@${validSemver}`;
  } else if (version) {
    if (version[0] === '@' && !version.includes('/')) {
      packageToInstall += version;
    } else if (version.match(/^file:/)) {
      packageToInstall = `file:${path.resolve(
        originalDirectory,
        version.match(/^file:(.*)?$/)[1]
      )}`;
    } else {
      // for tar.gz or alternative paths
      packageToInstall = version;
    }
  }

  const scriptsToWarn = [
    {
      name: 'react-scripts-ts',
      message: chalk.yellow(
        `The react-scripts-ts package is deprecated. TypeScript is now supported natively in Create React App. You can use the ${chalk.green(
          '--template typescript'
        )} option instead when generating your app to include TypeScript support. Would you like to continue using react-scripts-ts?`
      ),
    },
  ];

  for (const script of scriptsToWarn) {
    if (packageToInstall.startsWith(script.name)) {
      return prompts({
        type: 'confirm',
        name: 'useScript',
        message: script.message,
        initial: false,
      }).then(answer => {
        if (!answer.useScript) {
          process.exit(0);
        }

        return packageToInstall;
      });
    }
  }

  return Promise.resolve(packageToInstall);
}

function getTemplateInstallPackage(template, originalDirectory) {
  let templateToInstall = 'cra-template';
  if (template) {
    if (template.match(/^file:/)) {
      templateToInstall = `file:${path.resolve(
        originalDirectory,
        template.match(/^file:(.*)?$/)[1]
      )}`;
    } else if (
      template.includes('://') ||
      template.match(/^.+\.(tgz|tar\.gz)$/)
    ) {
      // for tar.gz or alternative paths
      templateToInstall = template;
    } else {
      // Add prefix 'cra-template-' to non-prefixed templates, leaving any
      // @scope/ and @version intact.
      const packageMatch = template.match(/^(@[^/]+\/)?([^@]+)?(@.+)?$/);
      const scope = packageMatch[1] || '';
      const templateName = packageMatch[2] || '';
      const version = packageMatch[3] || '';

      if (
        templateName === templateToInstall ||
        templateName.startsWith(`${templateToInstall}-`)
      ) {
        // Covers:
        // - cra-template
        // - @SCOPE/cra-template
        // - cra-template-NAME
        // - @SCOPE/cra-template-NAME
        templateToInstall = `${scope}${templateName}${version}`;
      } else if (version && !scope && !templateName) {
        // Covers using @SCOPE only
        templateToInstall = `${version}/${templateToInstall}`;
      } else {
        // Covers templates without the `cra-template` prefix:
        // - NAME
        // - @SCOPE/NAME
        templateToInstall = `${scope}${templateToInstall}-${templateName}${version}`;
      }
    }
  }

  return Promise.resolve(templateToInstall);
}

function getTemporaryDirectory() {
  return new Promise((resolve, reject) => {
    // Unsafe cleanup lets us recursively delete the directory if it contains
    // contents; by default it only allows removal if it's empty
    tmp.dir({ unsafeCleanup: true }, (err, tmpdir, callback) => {
      if (err) {
        reject(err);
      } else {
        resolve({
          tmpdir: tmpdir,
          cleanup: () => {
            try {
              callback();
            } catch (ignored) {
              // Callback might throw and fail, since it's a temp directory the
              // OS will clean it up eventually...
            }
          },
        });
      }
    });
  });
}

function extractStream(stream, dest) {
  return new Promise((resolve, reject) => {
    stream.pipe(
      unpack(dest, err => {
        if (err) {
          reject(err);
        } else {
          resolve(dest);
        }
      })
    );
  });
}

// Extract package name from tarball url or path.
function getPackageInfo(installPackage) {
  if (installPackage.match(/^.+\.(tgz|tar\.gz)$/)) {
    return getTemporaryDirectory()
      .then(obj => {
        let stream;
        if (/^http/.test(installPackage)) {
          stream = hyperquest(installPackage);
        } else {
          stream = fs.createReadStream(installPackage);
        }
        return extractStream(stream, obj.tmpdir).then(() => obj);
      })
      .then(obj => {
        const { name, version } = require(path.join(
          obj.tmpdir,
          'package.json'
        ));
        obj.cleanup();
        return { name, version };
      })
      .catch(err => {
        // The package name could be with or without semver version, e.g. react-scripts-0.2.0-alpha.1.tgz
        // However, this function returns package name only without semver version.
        console.log(
          `Could not extract the package name from the archive: ${err.message}`
        );
        const assumedProjectName = installPackage.match(
          /^.+\/(.+?)(?:-\d+.+)?\.(tgz|tar\.gz)$/
        )[1];
        console.log(
          `Based on the filename, assuming it is "${chalk.cyan(
            assumedProjectName
          )}"`
        );
        return Promise.resolve({ name: assumedProjectName });
      });
  } else if (installPackage.startsWith('git+')) {
    // Pull package name out of git urls e.g:
    // git+https://github.com/mycompany/react-scripts.git
    // git+ssh://github.com/mycompany/react-scripts.git#v1.2.3
    return Promise.resolve({
      name: installPackage.match(/([^/]+)\.git(#.*)?$/)[1],
    });
  } else if (installPackage.match(/.+@/)) {
    // Do not match @scope/ when stripping off @version or @tag
    return Promise.resolve({
      name: installPackage.charAt(0) + installPackage.substr(1).split('@')[0],
      version: installPackage.split('@')[1],
    });
  } else if (installPackage.match(/^file:/)) {
    const installPackagePath = installPackage.match(/^file:(.*)?$/)[1];
    const { name, version } = require(path.join(
      installPackagePath,
      'package.json'
    ));
    return Promise.resolve({ name, version });
  }
  return Promise.resolve({ name: installPackage });
}

function checkNpmVersion() {
  let hasMinNpm = false;
  let npmVersion = null;
  try {
    npmVersion = execSync('npm --version').toString().trim();
    hasMinNpm = semver.gte(npmVersion, '6.0.0');
  } catch (err) {
    // ignore
  }
  return {
    hasMinNpm: hasMinNpm,
    npmVersion: npmVersion,
  };
}

function checkYarnVersion() {
  const minYarnPnp = '1.12.0';
  const maxYarnPnp = '2.0.0';
  let hasMinYarnPnp = false;
  let hasMaxYarnPnp = false;
  let yarnVersion = null;
  try {
    yarnVersion = execSync('yarnpkg --version').toString().trim();
    if (semver.valid(yarnVersion)) {
      hasMinYarnPnp = semver.gte(yarnVersion, minYarnPnp);
      hasMaxYarnPnp = semver.lt(yarnVersion, maxYarnPnp);
    } else {
      // Handle non-semver compliant yarn version strings, which yarn currently
      // uses for nightly builds. The regex truncates anything after the first
      // dash. See #5362.
      const trimmedYarnVersionMatch = /^(.+?)[-+].+$/.exec(yarnVersion);
      if (trimmedYarnVersionMatch) {
        const trimmedYarnVersion = trimmedYarnVersionMatch.pop();
        hasMinYarnPnp = semver.gte(trimmedYarnVersion, minYarnPnp);
        hasMaxYarnPnp = semver.lt(trimmedYarnVersion, maxYarnPnp);
      }
    }
  } catch (err) {
    // ignore
  }
  return {
    hasMinYarnPnp: hasMinYarnPnp,
    hasMaxYarnPnp: hasMaxYarnPnp,
    yarnVersion: yarnVersion,
  };
}

function checkNodeVersion(packageName) {
  const packageJsonPath = path.resolve(
    process.cwd(),
    'node_modules',
    packageName,
    'package.json'
  );

  if (!fs.existsSync(packageJsonPath)) {
    return;
  }

  const packageJson = require(packageJsonPath);
  if (!packageJson.engines || !packageJson.engines.node) {
    return;
  }

  if (!semver.satisfies(process.version, packageJson.engines.node)) {
    console.error(
      chalk.red(
        'You are running Node %s.\n' +
          'Create React App requires Node %s or higher. \n' +
          'Please update your version of Node.'
      ),
      process.version,
      packageJson.engines.node
    );
    process.exit(1);
  }
}

function checkAppName(appName) {
  const validationResult = validateProjectName(appName);
  if (!validationResult.validForNewPackages) {
    console.error(
      chalk.red(
        `Cannot create a project named ${chalk.green(
          `"${appName}"`
        )} because of npm naming restrictions:\n`
      )
    );
    [
      ...(validationResult.errors || []),
      ...(validationResult.warnings || []),
    ].forEach(error => {
      console.error(chalk.red(`  * ${error}`));
    });
    console.error(chalk.red('\nPlease choose a different project name.'));
    process.exit(1);
  }

  // TODO: there should be a single place that holds the dependencies
  const dependencies = ['react', 'react-dom', 'react-scripts'].sort();
  if (dependencies.includes(appName)) {
    console.error(
      chalk.red(
        `Cannot create a project named ${chalk.green(
          `"${appName}"`
        )} because a dependency with the same name exists.\n` +
          `Due to the way npm works, the following names are not allowed:\n\n`
      ) +
        chalk.cyan(dependencies.map(depName => `  ${depName}`).join('\n')) +
        chalk.red('\n\nPlease choose a different project name.')
    );
    process.exit(1);
  }
}

function makeCaretRange(dependencies, name) {
  const version = dependencies[name];

  if (typeof version === 'undefined') {
    console.error(chalk.red(`Missing ${name} dependency in package.json`));
    process.exit(1);
  }

  let patchedVersion = `^${version}`;

  if (!semver.validRange(patchedVersion)) {
    console.error(
      `Unable to patch ${name} dependency version because version ${chalk.red(
        version
      )} will become invalid ${chalk.red(patchedVersion)}`
    );
    patchedVersion = version;
  }

  dependencies[name] = patchedVersion;
}

function setCaretRangeForRuntimeDeps(packageName) {
  const packagePath = path.join(process.cwd(), 'package.json');
  const packageJson = require(packagePath);

  if (typeof packageJson.dependencies === 'undefined') {
    console.error(chalk.red('Missing dependencies in package.json'));
    process.exit(1);
  }

  const packageVersion = packageJson.dependencies[packageName];
  if (typeof packageVersion === 'undefined') {
    console.error(chalk.red(`Unable to find ${packageName} in package.json`));
    process.exit(1);
  }

  makeCaretRange(packageJson.dependencies, 'react');
  makeCaretRange(packageJson.dependencies, 'react-dom');

  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + os.EOL);
}

// If project only contains files generated by GH, it’s safe.
// Also, if project contains remnant error logs from a previous
// installation, lets remove them now.
// We also special case IJ-based products .idea because it integrates with CRA:
// https://github.com/facebook/create-react-app/pull/368#issuecomment-243446094
function isSafeToCreateProjectIn(root, name) {
  const validFiles = [
    '.DS_Store',
    '.git',
    '.gitattributes',
    '.gitignore',
    '.gitlab-ci.yml',
    '.hg',
    '.hgcheck',
    '.hgignore',
    '.idea',
    '.npmignore',
    '.travis.yml',
    'docs',
    'LICENSE',
    'README.md',
    'mkdocs.yml',
    'Thumbs.db',
  ];
  // These files should be allowed to remain on a failed install, but then
  // silently removed during the next create.
  const errorLogFilePatterns = [
    'npm-debug.log',
    'yarn-error.log',
    'yarn-debug.log',
  ];
  const isErrorLog = file => {
    return errorLogFilePatterns.some(pattern => file.startsWith(pattern));
  };

  const conflicts = fs
    .readdirSync(root)
    .filter(file => !validFiles.includes(file))
    // IntelliJ IDEA creates module files before CRA is launched
    .filter(file => !/\.iml$/.test(file))
    // Don't treat log files from previous installation as conflicts
    .filter(file => !isErrorLog(file));

  if (conflicts.length > 0) {
    console.log(
      `The directory ${chalk.green(name)} contains files that could conflict:`
    );
    console.log();
    for (const file of conflicts) {
      try {
        const stats = fs.lstatSync(path.join(root, file));
        if (stats.isDirectory()) {
          console.log(`  ${chalk.blue(`${file}/`)}`);
        } else {
          console.log(`  ${file}`);
        }
      } catch (e) {
        console.log(`  ${file}`);
      }
    }
    console.log();
    console.log(
      'Either try using a new directory name, or remove the files listed above.'
    );

    return false;
  }

  // Remove any log files from a previous installation.
  fs.readdirSync(root).forEach(file => {
    if (isErrorLog(file)) {
      fs.removeSync(path.join(root, file));
    }
  });
  return true;
}

function getProxy() {
  if (process.env.https_proxy) {
    return process.env.https_proxy;
  } else {
    try {
      // Trying to read https-proxy from .npmrc
      let httpsProxy = execSync('npm config get https-proxy').toString().trim();
      return httpsProxy !== 'null' ? httpsProxy : undefined;
    } catch (e) {
      return;
    }
  }
}

// See https://github.com/facebook/create-react-app/pull/3355
function checkThatNpmCanReadCwd() {
  const cwd = process.cwd();
  let childOutput = null;
  try {
    // Note: intentionally using spawn over exec since
    // the problem doesn't reproduce otherwise.
    // `npm config list` is the only reliable way I could find
    // to reproduce the wrong path. Just printing process.cwd()
    // in a Node process was not enough.
    childOutput = spawn.sync('npm', ['config', 'list']).output.join('');
  } catch (err) {
    // Something went wrong spawning node.
    // Not great, but it means we can't do this check.
    // We might fail later on, but let's continue.
    return true;
  }
  if (typeof childOutput !== 'string') {
    return true;
  }
  const lines = childOutput.split('\n');
  // `npm config list` output includes the following line:
  // "; cwd = C:\path\to\current\dir" (unquoted)
  // I couldn't find an easier way to get it.
  const prefix = '; cwd = ';
  const line = lines.find(line => line.startsWith(prefix));
  if (typeof line !== 'string') {
    // Fail gracefully. They could remove it.
    return true;
  }
  const npmCWD = line.substring(prefix.length);
  if (npmCWD === cwd) {
    return true;
  }
  console.error(
    chalk.red(
      `Could not start an npm process in the right directory.\n\n` +
        `The current directory is: ${chalk.bold(cwd)}\n` +
        `However, a newly started npm process runs in: ${chalk.bold(
          npmCWD
        )}\n\n` +
        `This is probably caused by a misconfigured system terminal shell.`
    )
  );
  if (process.platform === 'win32') {
    console.error(
      chalk.red(`On Windows, this can usually be fixed by running:\n\n`) +
        `  ${chalk.cyan(
          'reg'
        )} delete "HKCU\\Software\\Microsoft\\Command Processor" /v AutoRun /f\n` +
        `  ${chalk.cyan(
          'reg'
        )} delete "HKLM\\Software\\Microsoft\\Command Processor" /v AutoRun /f\n\n` +
        chalk.red(`Try to run the above two lines in the terminal.\n`) +
        chalk.red(
          `To learn more about this problem, read: https://blogs.msdn.microsoft.com/oldnewthing/20071121-00/?p=24433/`
        )
    );
  }
  return false;
}

function checkIfOnline(useYarn) {
  if (!useYarn) {
    // Don't ping the Yarn registry.
    // We'll just assume the best case.
    return Promise.resolve(true);
  }

  return new Promise(resolve => {
    dns.lookup('registry.yarnpkg.com', err => {
      let proxy;
      if (err != null && (proxy = getProxy())) {
        // If a proxy is defined, we likely can't resolve external hostnames.
        // Try to resolve the proxy name as an indication of a connection.
        dns.lookup(url.parse(proxy).hostname, proxyErr => {
          resolve(proxyErr == null);
        });
      } else {
        resolve(err == null);
      }
    });
  });
}

function executeNodeScript({ cwd, args }, data, source) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [...args, '-e', source, '--', JSON.stringify(data)],
      { cwd, stdio: 'inherit' }
    );

    child.on('close', code => {
      if (code !== 0) {
        reject({
          command: `node ${args.join(' ')}`,
        });
        return;
      }
      resolve();
    });
  });
}

function checkForLatestVersion() {
  return new Promise((resolve, reject) => {
    https
      .get(
        'https://registry.npmjs.org/-/package/create-react-app/dist-tags',
        res => {
          if (res.statusCode === 200) {
            let body = '';
            res.on('data', data => (body += data));
            res.on('end', () => {
              resolve(JSON.parse(body).latest);
            });
          } else {
            reject();
          }
        }
      )
      .on('error', () => {
        reject();
      });
  });
}

module.exports = {
  init,
  getTemplateInstallPackage,
};

package merge

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/MakeNowJust/heredoc"
	"github.com/cli/cli/v2/api"
	"github.com/cli/cli/v2/context"
	"github.com/cli/cli/v2/git"
	"github.com/cli/cli/v2/internal/ghrepo"
	"github.com/cli/cli/v2/internal/prompter"
	"github.com/cli/cli/v2/internal/run"
	"github.com/cli/cli/v2/pkg/cmd/pr/shared"
	"github.com/cli/cli/v2/pkg/cmdutil"
	"github.com/cli/cli/v2/pkg/httpmock"
	"github.com/cli/cli/v2/pkg/iostreams"
	"github.com/cli/cli/v2/test"
	"github.com/google/shlex"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func Test_NewCmdMerge(t *testing.T) {
	tmpFile := filepath.Join(t.TempDir(), "my-body.md")
	err := os.WriteFile(tmpFile, []byte("a body from file"), 0600)
	require.NoError(t, err)

	tests := []struct {
		name    string
		args    string
		stdin   string
		isTTY   bool
		want    MergeOptions
		wantErr string
	}{
		{
			name:  "number argument",
			args:  "123",
			isTTY: true,
			want: MergeOptions{
				SelectorArg:             "123",
				DeleteBranch:            false,
				IsDeleteBranchIndicated: false,
				CanDeleteLocalBranch:    true,
				MergeMethod:             PullRequestMergeMethodMerge,
				MergeStrategyEmpty:      true,
				Body:                    "",
				BodySet:                 false,
				AuthorEmail:             "",
			},
		},
		{
			name:  "delete-branch specified",
			args:  "--delete-branch=false",
			isTTY: true,
			want: MergeOptions{
				SelectorArg:             "",
				DeleteBranch:            false,
				IsDeleteBranchIndicated: true,
				CanDeleteLocalBranch:    true,
				MergeMethod:             PullRequestMergeMethodMerge,
				MergeStrategyEmpty:      true,
				Body:                    "",
				BodySet:                 false,
				AuthorEmail:             "",
			},
		},
		{
			name:  "body from file",
			args:  fmt.Sprintf("123 --body-file '%s'", tmpFile),
			isTTY: true,
			want: MergeOptions{
				SelectorArg:             "123",
				DeleteBranch:            false,
				IsDeleteBranchIndicated: false,
				CanDeleteLocalBranch:    true,
				MergeMethod:             PullRequestMergeMethodMerge,
				MergeStrategyEmpty:      true,
				Body:                    "a body from file",
				BodySet:                 true,
				AuthorEmail:             "",
			},
		},
		{
			name:  "body from stdin",
			args:  "123 --body-file -",
			stdin: "this is on standard input",
			isTTY: true,
			want: MergeOptions{
				SelectorArg:             "123",
				DeleteBranch:            false,
				IsDeleteBranchIndicated: false,
				CanDeleteLocalBranch:    true,
				MergeMethod:             PullRequestMergeMethodMerge,
				MergeStrategyEmpty:      true,
				Body:                    "this is on standard input",
				BodySet:                 true,
				AuthorEmail:             "",
			},
		},
		{
			name:  "body",
			args:  "123 -bcool",
			isTTY: true,
			want: MergeOptions{
				SelectorArg:             "123",
				DeleteBranch:            false,
				IsDeleteBranchIndicated: false,
				CanDeleteLocalBranch:    true,
				MergeMethod:             PullRequestMergeMethodMerge,
				MergeStrategyEmpty:      true,
				Body:                    "cool",
				BodySet:                 true,
				AuthorEmail:             "",
			},
		},
		{
			name:  "match-head-commit specified",
			args:  "123 --match-head-commit 555",
			isTTY: true,
			want: MergeOptions{
				SelectorArg:             "123",
				DeleteBranch:            false,
				IsDeleteBranchIndicated: false,
				CanDeleteLocalBranch:    true,
				MergeMethod:             PullRequestMergeMethodMerge,
				MergeStrategyEmpty:      true,
				Body:                    "",
				BodySet:                 false,
				MatchHeadCommit:         "555",
				AuthorEmail:             "",
			},
		},
		{
			name:  "author email",
			args:  "123 --author-email octocat@github.com",
			isTTY: true,
			want: MergeOptions{
				SelectorArg:             "123",
				DeleteBranch:            false,
				IsDeleteBranchIndicated: false,
				CanDeleteLocalBranch:    true,
				MergeMethod:             PullRequestMergeMethodMerge,
				MergeStrategyEmpty:      true,
				Body:                    "",
				BodySet:                 false,
				AuthorEmail:             "octocat@github.com",
			},
		},
		{
			name:    "body and body-file flags",
			args:    "123 --body 'test' --body-file 'test-file.txt'",
			isTTY:   true,
			wantErr: "specify only one of `--body` or `--body-file`",
		},
		{
			name:    "no argument with --repo override",
			args:    "-R owner/repo",
			isTTY:   true,
			wantErr: "argument required when using the --repo flag",
		},
		{
			name:    "multiple merge methods",
			args:    "123 --merge --rebase",
			isTTY:   true,
			wantErr: "only one of --merge, --rebase, or --squash can be enabled",
		},
		{
			name:    "multiple merge methods, non-tty",
			args:    "123 --merge --rebase",
			isTTY:   false,
			wantErr: "only one of --merge, --rebase, or --squash can be enabled",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ios, stdin, _, _ := iostreams.Test()
			ios.SetStdoutTTY(tt.isTTY)
			ios.SetStdinTTY(tt.isTTY)
			ios.SetStderrTTY(tt.isTTY)

			if tt.stdin != "" {
				_, _ = stdin.WriteString(tt.stdin)
			}

			f := &cmdutil.Factory{
				IOStreams: ios,
			}

			var opts *MergeOptions
			cmd := NewCmdMerge(f, func(o *MergeOptions) error {
				opts = o
				return nil
			})
			cmd.PersistentFlags().StringP("repo", "R", "", "")

			argv, err := shlex.Split(tt.args)
			require.NoError(t, err)
			cmd.SetArgs(argv)

			cmd.SetIn(&bytes.Buffer{})
			cmd.SetOut(io.Discard)
			cmd.SetErr(io.Discard)

			_, err = cmd.ExecuteC()
			if tt.wantErr != "" {
				require.EqualError(t, err, tt.wantErr)
				return
			} else {
				require.NoError(t, err)
			}

			assert.Equal(t, tt.want.SelectorArg, opts.SelectorArg)
			assert.Equal(t, tt.want.DeleteBranch, opts.DeleteBranch)
			assert.Equal(t, tt.want.CanDeleteLocalBranch, opts.CanDeleteLocalBranch)
			assert.Equal(t, tt.want.MergeMethod, opts.MergeMethod)
			assert.Equal(t, tt.want.MergeStrategyEmpty, opts.MergeStrategyEmpty)
			assert.Equal(t, tt.want.Body, opts.Body)
			assert.Equal(t, tt.want.BodySet, opts.BodySet)
			assert.Equal(t, tt.want.MatchHeadCommit, opts.MatchHeadCommit)
			assert.Equal(t, tt.want.AuthorEmail, opts.AuthorEmail)
		})
	}
}

func baseRepo(owner, repo, branch string) ghrepo.Interface {
	return api.InitRepoHostname(&api.Repository{
		Name:             repo,
		Owner:            api.RepositoryOwner{Login: owner},
		DefaultBranchRef: api.BranchRef{Name: branch},
	}, "github.com")
}

func stubCommit(pr *api.PullRequest, oid string) {
	pr.Commits.Nodes = append(pr.Commits.Nodes, api.PullRequestCommit{
		Commit: api.PullRequestCommitCommit{OID: oid},
	})
}

// TODO port to new style tests
func runCommand(rt http.RoundTripper, pm *prompter.PrompterMock, branch string, isTTY bool, cli string) (*test.CmdOut, error) {
	ios, _, stdout, stderr := iostreams.Test()
	ios.SetStdoutTTY(isTTY)
	ios.SetStdinTTY(isTTY)
	ios.SetStderrTTY(isTTY)

	factory := &cmdutil.Factory{
		IOStreams: ios,
		HttpClient: func() (*http.Client, error) {
			return &http.Client{Transport: rt}, nil
		},
		Branch: func() (string, error) {
			return branch, nil
		},
		Remotes: func() (context.Remotes, error) {
			return []*context.Remote{
				{
					Remote: &git.Remote{
						Name: "origin",
					},
					Repo: ghrepo.New("OWNER", "REPO"),
				},
			}, nil
		},
		GitClient: &git.Client{
			GhPath:  "some/path/gh",
			GitPath: "some/path/git",
		},
		Prompter: pm,
	}

	cmd := NewCmdMerge(factory, nil)
	cmd.PersistentFlags().StringP("repo", "R", "", "")

	cli = strings.TrimPrefix(cli, "pr merge")
	argv, err := shlex.Split(cli)
	if err != nil {
		return nil, err
	}
	cmd.SetArgs(argv)

	cmd.SetIn(&bytes.Buffer{})
	cmd.SetOut(io.Discard)
	cmd.SetErr(io.Discard)

	_, err = cmd.ExecuteC()
	return &test.CmdOut{
		OutBuf: stdout,
		ErrBuf: stderr,
	}, err
}

func initFakeHTTP() *httpmock.Registry {
	return &httpmock.Registry{}
}

func TestPrMerge(t *testing.T) {
	http := initFakeHTTP()
	defer http.Verify(t)

	shared.StubFinderForRunCommandStyleTests(t,
		"1",
		&api.PullRequest{
			ID:               "THE-ID",
			Number:           1,
			State:            "OPEN",
			Title:            "The title of the PR",
			MergeStateStatus: "CLEAN",
		},
		baseRepo("OWNER", "REPO", "main"),
	)

	http.Register(
		httpmock.GraphQL(`mutation PullRequestMerge\b`),
		httpmock.GraphQLMutation(`{}`, func(input map[string]interface{}) {
			assert.Equal(t, "THE-ID", input["pullRequestId"].(string))
			assert.Equal(t, "MERGE", input["mergeMethod"].(string))
			assert.NotContains(t, input, "commitHeadline")
		}),
	)

	cs, cmdTeardown := run.Stub()
	defer cmdTeardown(t)
	cs.Register(`git rev-parse --verify refs/heads/`, 0, "")

	output, err := runCommand(http, nil, "main", true, "pr merge 1 --merge")
	if err != nil {
		t.Fatalf("error running command `pr merge`: %v", err)
	}

	r := regexp.MustCompile(`Merged pull request OWNER/REPO#1 \(The title of the PR\)`)

	if !r.MatchString(output.Stderr()) {
		t.Fatalf("output did not match regexp /%s/\n> output\n%q\n", r, output.Stderr())
	}
}

func TestPrMerge_blocked(t *testing.T) {
	http := initFakeHTTP()
	defer http.Verify(t)

	shared.StubFinderForRunCommandStyleTests(t,
		"1",
		&api.PullRequest{
			ID:               "THE-ID",
			Number:           1,
			State:            "OPEN",
			Title:            "The title of the PR",
			MergeStateStatus: "BLOCKED",
		},
		baseRepo("OWNER", "REPO", "main"),
	)

	cs, cmdTeardown := run.Stub()
	defer cmdTeardown(t)
	cs.Register(`git rev-parse --verify refs/heads/`, 0, "")

	output, err := runCommand(http, nil, "main", true, "pr merge 1 --merge")
	assert.EqualError(t, err, "SilentError")

	assert.Equal(t, "", output.String())
	assert.Equal(t, heredoc.Docf(`
		X Pull request OWNER/REPO#1 is not mergeable: the base branch policy prohibits the merge.
		To have the pull request merged after all the requirements have been met, add the %[1]s--auto%[1]s flag.
		To use administrator privileges to immediately merge the pull request, add the %[1]s--admin%[1]s flag.
		`, "`"), output.Stderr())
}

func TestPrMerge_dirty(t *testing.T) {
	http := initFakeHTTP()
	defer http.Verify(t)

	shared.StubFinderForRunCommandStyleTests(t,
		"1",
		&api.PullRequest{
			ID:               "THE-ID",
			Number:           123,
			State:            "OPEN",
			Title:            "The title of the PR",
			MergeStateStatus: "DIRTY",
			BaseRefName:      "trunk",
			HeadRefName:      "feature",
		},
		baseRepo("OWNER", "REPO", "main"),
	)

	cs, cmdTeardown := run.Stub()
	defer cmdTeardown(t)
	cs.Register(`git rev-parse --verify refs/heads/`, 0, "")

	output, err := runCommand(http, nil, "main", true, "pr merge 1 --merge")
	assert.EqualError(t, err, "SilentError")

	assert.Equal(t, "", output.String())
	assert.Equal(t, heredoc.Docf(`
		X Pull request OWNER/REPO#123 is not mergeable: the merge commit cannot be cleanly created.
		To have the pull request merged after all the requirements have been met, add the %[1]s--auto%[1]s flag.
		Run the following to resolve the merge conflicts locally:
		  gh pr checkout 123 && git fetch origin trunk && git merge origin/trunk
	`, "`"), output.Stderr())
}

func TestPrMerge_nontty(t *testing.T) {
	http := initFakeHTTP()
	defer http.Verify(t)

	shared.StubFinderForRunCommandStyleTests(t,
		"1",
		&api.PullRequest{
			ID:               "THE-ID",
			Number:           1,
			State:            "OPEN",
			Title:            "The title of the PR",
			MergeStateStatus: "CLEAN",
		},
		baseRepo("OWNER", "REPO", "main"),
	)

	http.Register(
		httpmock.GraphQL(`mutation PullRequestMerge\b`),
		httpmock.GraphQLMutation(`{}`, func(input map[string]interface{}) {
			assert.Equal(t, "THE-ID", input["pullRequestId"].(string))
			assert.Equal(t, "MERGE", input["mergeMethod"].(string))
			assert.NotContains(t, input, "commitHeadline")
		}))

	cs, cmdTeardown := run.Stub()
	defer cmdTeardown(t)

	cs.Register(`git rev-parse --verify refs/heads/`, 0, "")

	output, err := runCommand(http, nil, "main", false, "pr merge 1 --merge")
	if err != nil {
		t.Fatalf("error running command `pr merge`: %v", err)
	}

	assert.Equal(t, "", output.String())
	assert.Equal(t, "", output.Stderr())
}

func TestPrMerge_editMessage_nontty(t *testing.T) {
	http := initFakeHTTP()
	defer http.Verify(t)

	shared.StubFinderForRunCommandStyleTests(t,
		"1",
		&api.PullRequest{
			ID:               "THE-ID",
			Number:           1,
			State:            "OPEN",
			Title:            "The title of the PR",
			MergeStateStatus: "CLEAN",
		},
		baseRepo("OWNER", "REPO", "main"),
	)

	http.Register(
		httpmock.GraphQL(`mutation PullRequestMerge\b`),
		httpmock.GraphQLMutation(`{}`, func(input map[string]interface{}) {
			assert.Equal(t, "THE-ID", input["pullRequestId"].(string))
			assert.Equal(t, "MERGE", input["mergeMethod"].(string))
			assert.Equal(t, "mytitle", input["commitHeadline"].(string))
			assert.Equal(t, "mybody", input["commitBody"].(string))
		}))

	cs, cmdTeardown := run.Stub()
	defer cmdTeardown(t)

	cs.Register(`git rev-parse --verify refs/heads/`, 0, "")

	output, err := runCommand(http, nil, "main", false, "pr merge 1 --merge -t mytitle -b mybody")
	if err != nil {
		t.Fatalf("error running command `pr merge`: %v", err)
	}

	assert.Equal(t, "", output.String())
	assert.Equal(t, "", output.Stderr())
}

func TestPrMerge_withRepoFlag(t *testing.T) {
	http := initFakeHTTP()
	defer http.Verify(t)

	shared.StubFinderForRunCommandStyleTests(t,
		"1",
		&api.PullRequest{
			ID:               "THE-ID",
			Number:           1,
			State:            "OPEN",
			Title:            "The title of the PR",
			MergeStateStatus: "CLEAN",
		},
		baseRepo("OWNER", "REPO", "main"),
	)

	http.Register(
		httpmock.GraphQL(`mutation PullRequestMerge\b`),
		httpmock.GraphQLMutation(`{}`, func(input map[string]interface{}) {
			assert.Equal(t, "THE-ID", input["pullRequestId"].(string))
			assert.Equal(t, "MERGE", input["mergeMethod"].(string))
			assert.NotContains(t, input, "commitHeadline")
		}))

	_, cmdTeardown := run.Stub()
	defer cmdTeardown(t)

	output, err := runCommand(http, nil, "main", true, "pr merge 1 --merge -R OWNER/REPO")
	if err != nil {
		t.Fatalf("error running command `pr merge`: %v", err)
	}

	r := regexp.MustCompile(`Merged pull request OWNER/REPO#1 \(The title of the PR\)`)

	if !r.MatchString(output.Stderr()) {
		t.Fatalf("output did not match regexp /%s/\n> output\n%q\n", r, output.Stderr())
	}
}

func TestPrMerge_withMatchCommitHeadFlag(t *testing.T) {
	http := initFakeHTTP()
	defer http.Verify(t)

	shared.StubFinderForRunCommandStyleTests(t,
		"1",
		&api.PullRequest{
			ID:               "THE-ID",
			Number:           1,
			State:            "OPEN",
			Title:            "The title of the PR",
			MergeStateStatus: "CLEAN",
		},
		baseRepo("OWNER", "REPO", "main"),
	)

	http.Register(
		httpmock.GraphQL(`mutation PullRequestMerge\b`),
		httpmock.GraphQLMutation(`{}`, func(input map[string]interface{}) {
			assert.Equal(t, 3, len(input))
			assert.Equal(t, "THE-ID", input["pullRequestId"].(string))
			assert.Equal(t, "MERGE", input["mergeMethod"].(string))
			assert.Equal(t, "285ed5ab740f53ff6b0b4b629c59a9df23b9c6db", input["expectedHeadOid"].(string))
		}))

	cs, cmdTeardown := run.Stub()
	defer cmdTeardown(t)
	cs.Register(`git rev-parse --verify refs/heads/`, 0, "")

	output, err := runCommand(http, nil, "main", true, "pr merge 1 --merge --match-head-commit 285ed5ab740f53ff6b0b4b629c59a9df23b9c6db")
	if err != nil {
		t.Fatalf("error running command `pr merge`: %v", err)
	}

	r := regexp.MustCompile(`Merged pull request OWNER/REPO#1 \(The title of the PR\)`)

	if !r.MatchString(output.Stderr()) {
		t.Fatalf("output did not match regexp /%s/\n> output\n%q\n", r, output.Stderr())
	}
}

func TestPrMerge_withAuthorFlag(t *testing.T) {
	http := initFakeHTTP()
	defer http.Verify(t)

	shared.StubFinderForRunCommandStyleTests(t,
		"1",
		&api.PullRequest{
			ID:               "THE-ID",
			Number:           1,
			State:            "OPEN",
			Title:            "The title of the PR",
			MergeStateStatus: "CLEAN",
		},
		baseRepo("OWNER", "REPO", "main"),
	)

	http.Register(
		httpmock.GraphQL(`mutation PullRequestMerge\b`),
		httpmock.GraphQLMutation(`{}`, func(input map[string]interface{}) {
			assert.Equal(t, "THE-ID", input["pullRequestId"].(string))
			assert.Equal(t, "MERGE", input["mergeMethod"].(string))
			assert.Equal(t, "octocat@github.com", input["authorEmail"].(string))
			assert.NotContains(t, input, "commitHeadline")
		}),
	)

	cs, cmdTeardown := run.Stub()
	defer cmdTeardown(t)
	cs.Register(`git rev-parse --verify refs/heads/`, 0, "")

	output, err := runCommand(http, nil, "main", true, "pr merge 1 --merge --author-email octocat@github.com")
	if err != nil {
		t.Fatalf("error running command `pr merge`: %v", err)
	}

	r := regexp.MustCompile(`Merged pull request OWNER/REPO#1 \(The title of the PR\)`)

	if !r.MatchString(output.Stderr()) {
		t.Fatalf("output did not match regexp /%s/\n> output\n%q\n", r, output.Stderr())
	}
}

func TestPrMerge_deleteBranch(t *testing.T) {
	http := initFakeHTTP()
	defer http.Verify(t)

	shared.StubFinderForRunCommandStyleTests(t,
		"",
		&api.PullRequest{
			ID:               "PR_10",
			Number:           10,
			State:            "OPEN",
			Title:            "Blueberries are a good fruit",
			HeadRefName:      "blueberries",
			BaseRefName:      "main",
			MergeStateStatus: "CLEAN",
		},
		baseRepo("OWNER", "REPO", "main"),
	)

	http.Register(
		httpmock.GraphQL(`mutation PullRequestMerge\b`),
		httpmock.GraphQLMutation(`{}`, func(input map[string]interface{}) {
			assert.Equal(t, "PR_10", input["pullRequestId"].(string))
			assert.Equal(t, "MERGE", input["mergeMethod"].(string))
			assert.NotContains(t, input, "commitHeadline")
		}))
	http.Register(
		httpmock.REST("DELETE", "repos/OWNER/REPO/git/refs/heads/blueberries"),
		httpmock.StringResponse(`{}`))

	cs, cmdTeardown := run.Stub()
	defer cmdTeardown(t)

	cs.Register(`git rev-parse --verify refs/heads/main`, 0, "")
	cs.Register(`git checkout main`, 0, "")
	cs.Register(`git rev-parse --verify refs/heads/blueberries`, 0, "")
	cs.Register(`git branch -D blueberries`, 0, "")
	cs.Register(`git pull --ff-only`, 0, "")

	output, err := runCommand(http, nil, "blueberries", true, `pr merge --merge --delete-branch`)
	if err != nil {
		t.Fatalf("Got unexpected error running `pr merge` %s", err)
	}

	assert.Equal(t, "", output.String())
	assert.Equal(t, heredoc.Doc(`
		✓ Merged pull request OWNER/REPO#10 (Blueberries are a good fruit)
		✓ Deleted local branch blueberries and switched to branch main
		✓ Deleted remote branch blueberries
	`), output.Stderr())
}

func TestPrMerge_deleteBranch_mergeQueue(t *testing.T) {
	http := initFakeHTTP()
	defer http.Verify(t)

	shared.StubFinderForRunCommandStyleTests(t,
		"",
		&api.PullRequest{
			ID:                  "PR_10",
			Number:              10,
			State:               "OPEN",
			Title:               "Blueberries are a good fruit",
			HeadRefName:         "blueberries",
			BaseRefName:         "main",
			MergeStateStatus:    "CLEAN",
			IsMergeQueueEnabled: true,
		},
		baseRepo("OWNER", "REPO", "main"),
	)

	_, err := runCommand(http, nil, "blueberries", true, `pr merge --merge --delete-branch`)
	assert.Contains(t, err.Error(), "X Cannot use `-d` or `--delete-branch` when merge queue enabled")
}

func TestPrMerge_deleteBranch_nonDefault(t *testing.T) {
	http := initFakeHTTP()
	defer http.Verify(t)

	shared.StubFinderForRunCommandStyleTests(t,
		"",
		&api.PullRequest{
			ID:               "PR_10",
			Number:           10,
			State:            "OPEN",
			Title:            "Blueberries are a good fruit",
			HeadRefName:      "blueberries",
			MergeStateStatus: "CLEAN",
			BaseRefName:      "fruit",
		},
		baseRepo("OWNER", "REPO", "main"),
	)

	http.Register(
		httpmock.GraphQL(`mutation PullRequestMerge\b`),
		httpmock.GraphQLMutation(`{}`, func(input map[string]interface{}) {
			assert.Equal(t, "PR_10", input["pullRequestId"].(string))
			assert.Equal(t, "MERGE", input["mergeMethod"].(string))
			assert.NotContains(t, input, "commitHeadline")
		}))
	http.Register(
		httpmock.REST("DELETE", "repos/OWNER/REPO/git/refs/heads/blueberries"),
		httpmock.StringResponse(`{}`))

	cs, cmdTeardown := run.Stub()
	defer cmdTeardown(t)

	cs.Register(`git rev-parse --verify refs/heads/fruit`, 0, "")
	cs.Register(`git checkout fruit`, 0, "")
	cs.Register(`git rev-parse --verify refs/heads/blueberries`, 0, "")
	cs.Register(`git branch -D blueberries`, 0, "")
	cs.Register(`git pull --ff-only`, 0, "")

	output, err := runCommand(http, nil, "blueberries", true, `pr merge --merge --delete-branch`)
	if err != nil {
		t.Fatalf("Got unexpected error running `pr merge` %s", err)
	}

	assert.Equal(t, "", output.String())
	assert.Equal(t, heredoc.Doc(`
		✓ Merged pull request OWNER/REPO#10 (Blueberries are a good fruit)
		✓ Deleted local branch blueberries and switched to branch fruit
		✓ Deleted remote branch blueberries
	`), output.Stderr())
}

func TestPrMerge_deleteBranch_onlyLocally(t *testing.T) {
	http := initFakeHTTP()
	defer http.Verify(t)

	shared.StubFinderForRunCommandStyleTests(t,
		"",
		&api.PullRequest{
			ID:                  "PR_10",
			Number:              10,
			State:               "OPEN",
			Title:               "Blueberries are a good fruit",
			HeadRefName:         "blueberries",
			BaseRefName:         "main",
			MergeStateStatus:    "CLEAN",
			HeadRepositoryOwner: api.Owner{Login: "HEAD"}, // Not the same owner as the base repo
		},
		baseRepo("OWNER", "REPO", "main"),
	)

	http.Register(
		httpmock.GraphQL(`mutation PullRequestMerge\b`),
		httpmock.GraphQLMutation(`{}`, func(input map[string]interface{}) {
			assert.Equal(t, "PR_10", input["pullRequestId"].(string))
			assert.Equal(t, "MERGE", input["mergeMethod"].(string))
			assert.NotContains(t, input, "commitHeadline")
		}))

	cs, cmdTeardown := run.Stub()
	defer cmdTeardown(t)

	cs.Register(`git rev-parse --verify refs/heads/main`, 0, "")
	cs.Register(`git checkout main`, 0, "")
	cs.Register(`git rev-parse --verify refs/heads/blueberries`, 0, "")
	cs.Register(`git branch -D blueberries`, 0, "")
	cs.Register(`git pull --ff-only`, 0, "")

	output, err := runCommand(http, nil, "blueberries", true, `pr merge --merge --delete-branch`)
	if err != nil {
		t.Fatalf("Got unexpected error running `pr merge` %s", err)
	}

	assert.Equal(t, "", output.String())
	assert.Equal(t, heredoc.Doc(`
		✓ Merged pull request OWNER/REPO#10 (Blueberries are a good fruit)
		✓ Deleted local branch blueberries and switched to branch main
	`), output.Stderr())
}

func TestPrMerge_deleteBranch_checkoutNewBranch(t *testing.T) {
	http := initFakeHTTP()
	defer http.Verify(t)

	shared.StubFinderForRunCommandStyleTests(t,
		"",
		&api.PullRequest{
			ID:               "PR_10",
			Number:           10,
			State:            "OPEN",
			Title:            "Blueberries are a good fruit",
			HeadRefName:      "blueberries",
			MergeStateStatus: "CLEAN",
			BaseRefName:      "fruit",
		},
		baseRepo("OWNER", "REPO", "main"),
	)

	http.Register(
		httpmock.GraphQL(`mutation PullRequestMerge\b`),
		httpmock.GraphQLMutation(`{}`, func(input map[string]interface{}) {
			assert.Equal(t, "PR_10", input["pullRequestId"].(string))
			assert.Equal(t, "MERGE", input["mergeMethod"].(string))
			assert.NotContains(t, input, "commitHeadline")
		}))
	http.Register(
		httpmock.REST("DELETE", "repos/OWNER/REPO/git/refs/heads/blueberries"),
		httpmock.StringResponse(`{}`))

	cs, cmdTeardown := run.Stub()
	defer cmdTeardown(t)

	cs.Register(`git rev-parse --verify refs/heads/fruit`, 1, "")
	cs.Register(`git checkout -b fruit --track origin/fruit`, 0, "")
	cs.Register(`git rev-parse --verify refs/heads/blueberries`, 0, "")
	cs.Register(`git branch -D blueberries`, 0, "")
	cs.Register(`git pull --ff-only`, 0, "")

	output, err := runCommand(http, nil, "blueberries", true, `pr merge --merge --delete-branch`)
	if err != nil {
		t.Fatalf("Got unexpected error running `pr merge` %s", err)
	}

	assert.Equal(t, "", output.String())
	assert.Equal(t, heredoc.Doc(`
		✓ Merged pull request OWNER/REPO#10 (Blueberries are a good fruit)
		✓ Deleted local branch blueberries and switched to branch fruit
		✓ Deleted remote branch blueberries
	`), output.Stderr())
}

func TestPrMerge_deleteNonCurrentBranch(t *testing.T) {
	http := initFakeHTTP()
	defer http.Verify(t)

	shared.StubFinderForRunCommandStyleTests(t,
		"blueberries",
		&api.PullRequest{
			ID:               "PR_10",
			Number:           10,
			State:            "OPEN",
			Title:            "Blueberries are a good fruit",
			HeadRefName:      "blueberries",
			MergeStateStatus: "CLEAN",
		},
		baseRepo("OWNER", "REPO", "main"),
	)

	http.Register(
		httpmock.GraphQL(`mutation PullRequestMerge\b`),
		httpmock.GraphQLMutation(`{}`, func(input map[string]interface{}) {
			assert.Equal(t, "PR_10", input["pullRequestId"].(string))
			assert.Equal(t, "MERGE", input["mergeMethod"].(string))
			assert.NotContains(t, input, "commitHeadline")
		}))
	http.Register(
		httpmock.REST("DELETE", "repos/OWNER/REPO/git/refs/heads/blueberries"),
		httpmock.StringResponse(`{}`))

	cs, cmdTeardown := run.Stub()
	defer cmdTeardown(t)

	cs.Register(`git rev-parse --verify refs/heads/blueberries`, 0, "")
	cs.Register(`git branch -D blueberries`, 0, "")

	output, err := runCommand(http, nil, "main", true, `pr merge --merge --delete-branch blueberries`)
	if err != nil {
		t.Fatalf("Got unexpected error running `pr merge` %s", err)
	}

	assert.Equal(t, "", output.String())
	assert.Equal(t, heredoc.Doc(`
		✓ Merged pull request OWNER/REPO#10 (Blueberries are a good fruit)
		✓ Deleted local branch blueberries
		✓ Deleted remote branch blueberries
	`), output.Stderr())
}

func Test_nonDivergingPullRequest(t *testing.T) {
	http := initFakeHTTP()
	defer http.Verify(t)

	pr := &api.PullRequest{
		ID:               "PR_10",
		Number:           10,
		Title:            "Blueberries are a good fruit",
		State:            "OPEN",
		MergeStateStatus: "CLEAN",
		BaseRefName:      "main",
	}
	stubCommit(pr, "COMMITSHA1")

	shared.StubFinderForRunCommandStyleTests(t, "", pr, baseRepo("OWNER", "REPO", "main"))

	http.Register(
		httpmock.GraphQL(`mutation PullRequestMerge\b`),
		httpmock.GraphQLMutation(`{}`, func(input map[string]interface{}) {
			assert.Equal(t, "PR_10", input["pullRequestId"].(string))
			assert.Equal(t, "MERGE", input["mergeMethod"].(string))
			assert.NotContains(t, input, "commitHeadline")
		}))

	cs, cmdTeardown := run.Stub()
	defer cmdTeardown(t)

	cs.Register(`git .+ show .+ HEAD`, 0, "COMMITSHA1,title")
	cs.Register(`git rev-parse --verify refs/heads/`, 0, "")

	output, err := runCommand(http, nil, "blueberries", true, "pr merge --merge")
	if err != nil {
		t.Fatalf("error running command `pr merge`: %v", err)
	}

	assert.Equal(t, heredoc.Doc(`
		✓ Merged pull request OWNER/REPO#10 (Blueberries are a good fruit)
	`), output.Stderr())
}

func Test_divergingPullRequestWarning(t *testing.T) {
	http := initFakeHTTP()
	defer http.Verify(t)

	pr := &api.PullRequest{
		ID:               "PR_10",
		Number:           10,
		Title:            "Blueberries are a good fruit",
		State:            "OPEN",
		MergeStateStatus: "CLEAN",
		BaseRefName:      "main",
	}
	stubCommit(pr, "COMMITSHA1")

	shared.StubFinderForRunCommandStyleTests(t, "", pr, baseRepo("OWNER", "REPO", "main"))

	http.Register(
		httpmock.GraphQL(`mutation PullRequestMerge\b`),
		httpmock.GraphQLMutation(`{}`, func(input map[string]interface{}) {
			assert.Equal(t, "PR_10", input["pullRequestId"].(string))
			assert.Equal(t, "MERGE", input["mergeMethod"].(string))
			assert.NotContains(t, input, "commitHeadline")
		}))

	cs, cmdTeardown := run.Stub()
	defer cmdTeardown(t)

	cs.Register(`git .+ show .+ HEAD`, 0, "COMMITSHA2,title")
	cs.Register(`git rev-parse --verify refs/heads/`, 0, "")

	output, err := runCommand(http, nil, "blueberries", true, "pr merge --merge")
	if err != nil {
		t.Fatalf("error running command `pr merge`: %v", err)
	}

	assert.Equal(t, heredoc.Doc(`
		! Pull request OWNER/REPO#10 (Blueberries are a good fruit) has diverged from local branch
		✓ Merged pull request OWNER/REPO#10 (Blueberries are a good fruit)
	`), output.Stderr())
}

func Test_pullRequestWithoutCommits(t *testing.T) {
	http := initFakeHTTP()
	defer http.Verify(t)

	shared.StubFinderForRunCommandStyleTests(t,
		"",
		&api.PullRequest{
			ID:               "PR_10",
			Number:           10,
			Title:            "Blueberries are a good fruit",
			State:            "OPEN",
			MergeStateStatus: "CLEAN",
		},
		baseRepo("OWNER", "REPO", "main"),
	)

	http.Register(
		httpmock.GraphQL(`mutation PullRequestMerge\b`),
		httpmock.GraphQLMutation(`{}`, func(input map[string]interface{}) {
			assert.Equal(t, "PR_10", input["pullRequestId"].(string))
			assert.Equal(t, "MERGE", input["mergeMethod"].(string))
			assert.NotContains(t, input, "commitHeadline")
		}))

	cs, cmdTeardown := run.Stub()
	defer cmdTeardown(t)

	cs.Register(`git rev-parse --verify refs/heads/`, 0, "")

	output, err := runCommand(http, nil, "blueberries", true, "pr merge --merge")
	if err != nil {
		t.Fatalf("error running command `pr merge`: %v", err)
	}

	assert.Equal(t, heredoc.Doc(`
		✓ Merged pull request OWNER/REPO#10 (Blueberries are a good fruit)
	`), output.Stderr())
}

func TestPrMerge_rebase(t *testing.T) {
	http := initFakeHTTP()
	defer http.Verify(t)

	shared.StubFinderForRunCommandStyleTests(t,
		"2",
		&api.PullRequest{
			ID:               "THE-ID",
			Number:           2,
			Title:            "The title of the PR",
			State:            "OPEN",
			MergeStateStatus: "CLEAN",
		},
		baseRepo("OWNER", "REPO", "main"),
	)

	http.Register(
		httpmock.GraphQL(`mutation PullRequestMerge\b`),
		httpmock.GraphQLMutation(`{}`, func(input map[string]interface{}) {
			assert.Equal(t, "THE-ID", input["pullRequestId"].(string))
			assert.Equal(t, "REBASE", input["mergeMethod"].(string))
			assert.NotContains(t, input, "commitHeadline")
		}))

	cs, cmdTeardown := run.Stub()
	defer cmdTeardown(t)

	cs.Register(`git rev-parse --verify refs/heads/`, 0, "")

	output, err := runCommand(http, nil, "main", true, "pr merge 2 --rebase")
	if err != nil {
		t.Fatalf("error running command `pr merge`: %v", err)
	}

	r := regexp.MustCompile(`Rebased and merged pull request OWNER/REPO#2 \(The title of the PR\)`)

	if !r.MatchString(output.Stderr()) {
		t.Fatalf("output did not match regexp /%s/\n> output\n%q\n", r, output.Stderr())
	}
}

func TestPrMerge_squash(t *testing.T) {
	http := initFakeHTTP()
	defer http.Verify(t)

	shared.StubFinderForRunCommandStyleTests(t,
		"3",
		&api.PullRequest{
			ID:               "THE-ID",
			Number:           3,
			Title:            "The title of the PR",
			State:            "OPEN",
			MergeStateStatus: "CLEAN",
		},
		baseRepo("OWNER", "REPO", "main"),
	)

	http.Register(
		httpmock.GraphQL(`mutation PullRequestMerge\b`),
		httpmock.GraphQLMutation(`{}`, func(input map[string]interface{}) {
			assert.Equal(t, "THE-ID", input["pullRequestId"].(string))
			assert.Equal(t, "SQUASH", input["mergeMethod"].(string))
			assert.NotContains(t, input, "commitHeadline")
		}))

	cs, cmdTeardown := run.Stub()
	defer cmdTeardown(t)

	cs.Register(`git rev-parse --verify refs/heads/`, 0, "")

	output, err := runCommand(http, nil, "main", true, "pr merge 3 --squash")
	if err != nil {
		t.Fatalf("error running command `pr merge`: %v", err)
	}

	assert.Equal(t, "", output.String())
	assert.Equal(t, heredoc.Doc(`
		✓ Squashed and merged pull request OWNER/REPO#3 (The title of the PR)
	`), output.Stderr())
}

func TestPrMerge_alreadyMerged(t *testing.T) {
	http := initFakeHTTP()
	defer http.Verify(t)

	shared.StubFinderForRunCommandStyleTests(t,
		"4",
		&api.PullRequest{
			ID:               "THE-ID",
			Number:           4,
			State:            "MERGED",
			HeadRefName:      "blueberries",
			BaseRefName:      "main",
			MergeStateStatus: "CLEAN",
		},
		baseRepo("OWNER", "REPO", "main"),
	)

	cs, cmdTeardown := run.Stub()
	defer cmdTeardown(t)

	cs.Register(`git rev-parse --verify refs/heads/main`, 0, "")
	cs.Register(`git checkout main`, 0, "")
	cs.Register(`git rev-parse --verify refs/heads/blueberries`, 0, "")
	cs.Register(`git branch -D blueberries`, 0, "")
	cs.Register(`git pull --ff-only`, 0, "")

	pm := &prompter.PrompterMock{
		ConfirmFunc: func(p string, d bool) (bool, error) {
			if p == "Pull request OWNER/REPO#4 was already merged. Delete the branch locally?" {
				return true, nil
			} else {
				return false, prompter.NoSuchPromptErr(p)
			}
		},
	}

	output, err := runCommand(http, pm, "blueberries", true, "pr merge 4")
	assert.NoError(t, err)
	assert.Equal(t, "", output.String())
	assert.Equal(t, heredoc.Doc(`
		✓ Deleted local branch blueberries and switched to branch main
		✓ Deleted remote branch blueberries
	`), output.Stderr())
}

func TestPrMerge_alreadyMerged_withMergeStrategy(t *testing.T) {
	http := initFakeHTTP()
	defer http.Verify(t)

	shared.StubFinderForRunCommandStyleTests(t,
		"4",
		&api.PullRequest{
			ID:                  "THE-ID",
			Number:              4,
			State:               "MERGED",
			HeadRepositoryOwner: api.Owner{Login: "OWNER"},
			MergeStateStatus:    "CLEAN",
		},
		baseRepo("OWNER", "REPO", "main"),
	)

	cs, cmdTeardown := run.Stub()
	defer cmdTeardown(t)

	cs.Register(`git rev-parse --verify refs/heads/`, 0, "")

	output, err := runCommand(http, nil, "blueberries", false, "pr merge 4 --merge")
	if err != nil {
		t.Fatalf("Got unexpected error running `pr merge` %s", err)
	}

	assert.Equal(t, "", output.String())
	assert.Equal(t, "! Pull request OWNER/REPO#4 was already merged\n", output.Stderr())
}

func TestPrMerge_alreadyMerged_withMergeStrategy_TTY(t *testing.T) {
	http := initFakeHTTP()
	defer http.Verify(t)

	shared.StubFinderForRunCommandStyleTests(t,
		"4",
		&api.PullRequest{
			ID:                  "THE-ID",
			Number:              4,
			State:               "MERGED",
			HeadRepositoryOwner: api.Owner{Login: "OWNER"},
			MergeStateStatus:    "CLEAN",
		},
		baseRepo("OWNER", "REPO", "main"),
	)

	cs, cmdTeardown := run.Stub()
	defer cmdTeardown(t)

	cs.Register(`git rev-parse --verify refs/heads/`, 0, "")
	cs.Register(`git branch -D `, 0, "")

	pm := &prompter.PrompterMock{
		ConfirmFunc: func(p string, d bool) (bool, error) {
			if p == "Pull request OWNER/REPO#4 was already merged. Delete the branch locally?" {
				return true, nil
			} else {
				return false, prompter.NoSuchPromptErr(p)
			}
		},
	}

	output, err := runCommand(http, pm, "blueberries", true, "pr merge 4 --merge")
	if err != nil {
		t.Fatalf("Got unexpected error running `pr merge` %s", err)
	}

	assert.Equal(t, "", output.String())
	assert.Equal(t, "✓ Deleted local branch \n✓ Deleted remote branch \n", output.Stderr())
}

func TestPrMerge_alreadyMerged_withMergeStrategy_crossRepo(t *testing.T) {
	http := initFakeHTTP()
	defer http.Verify(t)

	shared.StubFinderForRunCommandStyleTests(t,
		"4",
		&api.PullRequest{
			ID:                  "THE-ID",
			Number:              4,
			State:               "MERGED",
			HeadRepositoryOwner: api.Owner{Login: "monalisa"},
			MergeStateStatus:    "CLEAN",
		},
		baseRepo("OWNER", "REPO", "main"),
	)

	cs, cmdTeardown := run.Stub()
	defer cmdTeardown(t)

	cs.Register(`git rev-parse --verify refs/heads/`, 0, "")

	pm := &prompter.PrompterMock{
		ConfirmFunc: func(p string, d bool) (bool, error) {
			if p == "Pull request OWNER/REPO#4 was already merged. Delete the branch locally?" {
				return d, nil
			} else {
				return false, prompter.NoSuchPromptErr(p)
			}
		},
	}

	output, err := runCommand(http, pm, "blueberries", true, "pr merge 4 --merge")
	if err != nil {
		t.Fatalf("Got unexpected error running `pr merge` %s", err)
	}

	assert.Equal(t, "", output.String())
	assert.Equal(t, "", output.Stderr())
}
func TestPRMergeTTY(t *testing.T) {
	http := initFakeHTTP()
	defer http.Verify(t)

	shared.StubFinderForRunCommandStyleTests(t,
		"",
		&api.PullRequest{
			ID:               "THE-ID",
			Number:           3,
			Title:            "It was the best of times",
			HeadRefName:      "blueberries",
			MergeStateStatus: "CLEAN",
		},
		baseRepo("OWNER", "REPO", "main"),
	)

	http.Register(
		httpmock.GraphQL(`query RepositoryInfo\b`),
		httpmock.StringResponse(`
		{ "data": { "repository": {
			"mergeCommitAllowed": true,
			"rebaseMergeAllowed": true,
			"squashMergeAllowed": true
		} } }`))

	http.Register(
		httpmock.GraphQL(`mutation PullRequestMerge\b`),
		httpmock.GraphQLMutation(`{}`, func(input map[string]interface{}) {
			assert.Equal(t, "THE-ID", input["pullRequestId"].(string))
			assert.Equal(t, "MERGE", input["mergeMethod"].(string))
			assert.NotContains(t, input, "commitHeadline")
		}))

	cs, cmdTeardown := run.Stub()
	defer cmdTeardown(t)

	cs.Register(`git rev-parse --verify refs/heads/blueberries`, 0, "")

	pm := &prompter.PrompterMock{
		ConfirmFunc: func(p string, d bool) (bool, error) {
			if p == "Delete the branch locally and on GitHub?" {
				return d, nil
			} else {
				return false, prompter.NoSuchPromptErr(p)
			}
		},
		SelectFunc: func(p, d string, opts []string) (int, error) {
			switch p {
			case "What's next?":
				return prompter.IndexFor(opts, "Submit")
			case "What merge method would you like to use?":
				return 0, nil
			default:
				return -1, prompter.NoSuchPromptErr(p)
			}
		},
	}

	output, err := runCommand(http, pm, "blueberries", true, "")
	if err != nil {
		t.Fatalf("Got unexpected error running `pr merge` %s", err)
	}

	assert.Equal(t, "Merging pull request OWNER/REPO#3 (It was the best of times)\n✓ Merged pull request OWNER/REPO#3 (It was the best of times)\n", output.Stderr())
}

func TestPRMergeTTY_withDeleteBranch(t *testing.T) {
	http := initFakeHTTP()
	defer http.Verify(t)

	shared.StubFinderForRunCommandStyleTests(t,
		"",
		&api.PullRequest{
			ID:               "THE-ID",
			Number:           3,
			Title:            "It was the best of times",
			HeadRefName:      "blueberries",
			MergeStateStatus: "CLEAN",
			BaseRefName:      "main",
		},
		baseRepo("OWNER", "REPO", "main"),
	)

	http.Register(
		httpmock.GraphQL(`query RepositoryInfo\b`),
		httpmock.StringResponse(`
		{ "data": { "repository": {
			"mergeCommitAllowed": true,
			"rebaseMergeAllowed": true,
			"squashMergeAllowed": true,
			"mergeQueue": {
				"mergeMethod": ""
			}
		} } }`))
	http.Register(
		httpmock.GraphQL(`mutation PullRequestMerge\b`),
		httpmock.GraphQLMutation(`{}`, func(input map[string]interface{}) {
			assert.Equal(t, "THE-ID", input["pullRequestId"].(string))
			assert.Equal(t, "MERGE", input["mergeMethod"].(string))
			assert.NotContains(t, input, "commitHeadline")
		}))
	http.Register(
		httpmock.REST("DELETE", "repos/OWNER/REPO/git/refs/heads/blueberries"),
		httpmock.StringResponse(`{}`))

	cs, cmdTeardown := run.Stub()
	defer cmdTeardown(t)

	cs.Register(`git rev-parse --verify refs/heads/main`, 0, "")
	cs.Register(`git checkout main`, 0, "")
	cs.Register(`git rev-parse --verify refs/heads/blueberries`, 0, "")
	cs.Register(`git branch -D blueberries`, 0, "")
	cs.Register(`git pull --ff-only`, 0, "")

	pm := &prompter.PrompterMock{
		SelectFunc: func(p, d string, opts []string) (int, error) {
			switch p {
			case "What's next?":
				return prompter.IndexFor(opts, "Submit")
			case "What merge method would you like to use?":
				return 0, nil
			default:
				return -1, prompter.NoSuchPromptErr(p)
			}
		},
	}

	output, err := runCommand(http, pm, "blueberries", true, "-d")
	if err != nil {
		t.Fatalf("Got unexpected error running `pr merge` %s", err)
	}

	assert.Equal(t, "", output.String())
	assert.Equal(t, heredoc.Doc(`
		Merging pull request OWNER/REPO#3 (It was the best of times)
		✓ Merged pull request OWNER/REPO#3 (It was the best of times)
		✓ Deleted local branch blueberries and switched to branch main
		✓ Deleted remote branch blueberries
	`), output.Stderr())
}

func TestPRMergeTTY_squashEditCommitMsgAndSubject(t *testing.T) {
	ios, _, stdout, stderr := iostreams.Test()
	ios.SetStdinTTY(true)
	ios.SetStdoutTTY(true)
	ios.SetStderrTTY(true)

	tr := initFakeHTTP()
	defer tr.Verify(t)

	tr.Register(
		httpmock.GraphQL(`query RepositoryInfo\b`),
		httpmock.StringResponse(`
		{ "data": { "repository": {
			"mergeCommitAllowed": true,
			"rebaseMergeAllowed": true,
			"squashMergeAllowed": true
		} } }`))
	tr.Register(
		httpmock.GraphQL(`query PullRequestMergeText\b`),
		httpmock.StringResponse(`
		{ "data": { "node": {
			"viewerMergeHeadlineText": "default headline text",
			"viewerMergeBodyText": "default body text"
		} } }`))
	tr.Register(
		httpmock.GraphQL(`query PullRequestMergeText\b`),
		httpmock.StringResponse(`
		{ "data": { "node": {
			"viewerMergeHeadlineText": "default headline text",
			"viewerMergeBodyText": "default body text"
		} } }`))
	tr.Register(
		httpmock.GraphQL(`mutation PullRequestMerge\b`),
		httpmock.GraphQLMutation(`{}`, func(input map[string]interface{}) {
			assert.Equal(t, "THE-ID", input["pullRequestId"].(string))
			assert.Equal(t, "SQUASH", input["mergeMethod"].(string))
			assert.Equal(t, "DEFAULT HEADLINE TEXT", input["commitHeadline"].(string))
			assert.Equal(t, "DEFAULT BODY TEXT", input["commitBody"].(string))
		}))

	_, cmdTeardown := run.Stub()
	defer cmdTeardown(t)

	selectCount := -1
	answers := []string{"Edit commit message", "Edit commit subject", "Submit"}

	pm := &prompter.PrompterMock{
		ConfirmFunc: func(p string, d bool) (bool, error) {
			if p == "Delete the branch on GitHub?" {
				return d, nil
			} else {
				return false, prompter.NoSuchPromptErr(p)
			}
		},
		SelectFunc: func(p, d string, opts []string) (int, error) {
			switch p {
			case "What's next?":
				selectCount++
				return prompter.IndexFor(opts, answers[selectCount])
			case "What merge method would you like to use?":
				return prompter.IndexFor(opts, "Squash and merge")
			default:
				return -1, prompter.NoSuchPromptErr(p)
			}
		},
	}

	err := mergeRun(&MergeOptions{
		IO:     ios,
		Editor: testEditor{},
		HttpClient: func() (*http.Client, error) {
			return &http.Client{Transport: tr}, nil
		},
		Prompter:           pm,
		SelectorArg:        "https://github.com/OWNER/REPO/pull/123",
		MergeStrategyEmpty: true,
		Finder: shared.NewMockFinder(
			"https://github.com/OWNER/REPO/pull/123",
			&api.PullRequest{ID: "THE-ID", Number: 123, Title: "title", MergeStateStatus: "CLEAN"},
			ghrepo.New("OWNER", "REPO"),
		),
	})
	assert.NoError(t, err)

	assert.Equal(t, "", stdout.String())
	assert.Equal(t, "Merging pull request OWNER/REPO#123 (title)\n✓ Squashed and merged pull request OWNER/REPO#123 (title)\n", stderr.String())
}

func TestPRMergeEmptyStrategyNonTTY(t *testing.T) {
	http := initFakeHTTP()
	defer http.Verify(t)

	shared.StubFinderForRunCommandStyleTests(t,
		"1",
		&api.PullRequest{
			ID:               "THE-ID",
			Number:           1,
			State:            "OPEN",
			Title:            "The title of the PR",
			MergeStateStatus: "CLEAN",
			BaseRefName:      "main",
		},
		baseRepo("OWNER", "REPO", "main"),
	)

	cs, cmdTeardown := run.Stub()
	defer cmdTeardown(t)
	cs.Register(`git rev-parse --verify refs/heads/`, 0, "")

	output, err := runCommand(http, nil, "blueberries", false, "pr merge 1")
	assert.EqualError(t, err, "--merge, --rebase, or --squash required when not running interactively")
	assert.Equal(t, "", output.String())
	assert.Equal(t, "", output.Stderr())
}

func TestPRTTY_cancelled(t *testing.T) {
	http := initFakeHTTP()
	defer http.Verify(t)

	shared.StubFinderForRunCommandStyleTests(t,
		"",
		&api.PullRequest{ID: "THE-ID", Number: 123, Title: "title", MergeStateStatus: "CLEAN"},
		ghrepo.New("OWNER", "REPO"),
	)

	http.Register(
		httpmock.GraphQL(`query RepositoryInfo\b`),
		httpmock.StringResponse(`
		{ "data": { "repository": {
			"mergeCommitAllowed": true,
			"rebaseMergeAllowed": true,
			"squashMergeAllowed": true
		} } }`))

	cs, cmdTeardown := run.Stub()
	defer cmdTeardown(t)

	cs.Register(`git rev-parse --verify refs/heads/`, 0, "")

	pm := &prompter.PrompterMock{
		ConfirmFunc: func(p string, d bool) (bool, error) {
			if p == "Delete the branch locally and on GitHub?" {
				return d, nil
			} else {
				return false, prompter.NoSuchPromptErr(p)
			}
		},
		SelectFunc: func(p, d string, opts []string) (int, error) {
			switch p {
			case "What's next?":
				return prompter.IndexFor(opts, "Cancel")
			case "What merge method would you like to use?":
				return 0, nil
			default:
				return -1, prompter.NoSuchPromptErr(p)
			}
		},
	}

	output, err := runCommand(http, pm, "blueberries", true, "")
	if !errors.Is(err, cmdutil.CancelError) {
		t.Fatalf("got error %v", err)
	}

	assert.Equal(t, "Merging pull request OWNER/REPO#123 (title)\nCancelled.\n", output.Stderr())
}

func Test_mergeMethodSurvey(t *testing.T) {
	repo := &api.Repository{
		MergeCommitAllowed: false,
		RebaseMergeAllowed: true,
		SquashMergeAllowed: true,
	}

	pm := &prompter.PrompterMock{
		SelectFunc: func(p, d string, opts []string) (int, error) {
			if p == "What merge method would you like to use?" {
				return prompter.IndexFor(opts, "Rebase and merge")
			} else {
				return -1, prompter.NoSuchPromptErr(p)
			}
		},
	}

	method, err := mergeMethodSurvey(pm, repo)
	assert.Nil(t, err)
	assert.Equal(t, PullRequestMergeMethodRebase, method)
}

func TestMergeRun_autoMerge(t *testing.T) {
	ios, _, stdout, stderr := iostreams.Test()
	ios.SetStdoutTTY(true)
	ios.SetStderrTTY(true)

	tr := initFakeHTTP()
	defer tr.Verify(t)
	tr.Register(
		httpmock.GraphQL(`mutation PullRequestAutoMerge\b`),
		httpmock.GraphQLMutation(`{}`, func(input map[string]interface{}) {
			assert.Equal(t, "THE-ID", input["pullRequestId"].(string))
			assert.Equal(t, "SQUASH", input["mergeMethod"].(string))
		}))

	_, cmdTeardown := run.Stub()
	defer cmdTeardown(t)

	err := mergeRun(&MergeOptions{
		IO: ios,
		HttpClient: func() (*http.Client, error) {
			return &http.Client{Transport: tr}, nil
		},
		SelectorArg:     "https://github.com/OWNER/REPO/pull/123",
		AutoMergeEnable: true,
		MergeMethod:     PullRequestMergeMethodSquash,
		Finder: shared.NewMockFinder(
			"https://github.com/OWNER/REPO/pull/123",
			&api.PullRequest{ID: "THE-ID", Number: 123, MergeStateStatus: "BLOCKED"},
			ghrepo.New("OWNER", "REPO"),
		),
	})
	assert.NoError(t, err)

	assert.Equal(t, "", stdout.String())
	assert.Equal(t, "✓ Pull request OWNER/REPO#123 will be automatically merged via squash when all requirements are met\n", stderr.String())
}

func TestMergeRun_autoMerge_directMerge(t *testing.T) {
	ios, _, stdout, stderr := iostreams.Test()
	ios.SetStdoutTTY(true)
	ios.SetStderrTTY(true)

	tr := initFakeHTTP()
	defer tr.Verify(t)
	tr.Register(
		httpmock.GraphQL(`mutation PullRequestMerge\b`),
		httpmock.GraphQLMutation(`{}`, func(input map[string]interface{}) {
			assert.Equal(t, "THE-ID", input["pullRequestId"].(string))
			assert.Equal(t, "MERGE", input["mergeMethod"].(string))
			assert.NotContains(t, input, "commitHeadline")
		}))

	_, cmdTeardown := run.Stub()
	defer cmdTeardown(t)

	err := mergeRun(&MergeOptions{
		IO: ios,
		HttpClient: func() (*http.Client, error) {
			return &http.Client{Transport: tr}, nil
		},
		SelectorArg:     "https://github.com/OWNER/REPO/pull/123",
		AutoMergeEnable: true,
		MergeMethod:     PullRequestMergeMethodMerge,
		Finder: shared.NewMockFinder(
			"https://github.com/OWNER/REPO/pull/123",
			&api.PullRequest{ID: "THE-ID", Number: 123, MergeStateStatus: "CLEAN"},
			ghrepo.New("OWNER", "REPO"),
		),
	})
	assert.NoError(t, err)

	assert.Equal(t, "", stdout.String())
	assert.Equal(t, "✓ Merged pull request OWNER/REPO#123 ()\n", stderr.String())
}

func TestMergeRun_disableAutoMerge(t *testing.T) {
	ios, _, stdout, stderr := iostreams.Test()
	ios.SetStdoutTTY(true)
	ios.SetStderrTTY(true)

	tr := initFakeHTTP()
	defer tr.Verify(t)
	tr.Register(
		httpmock.GraphQL(`mutation PullRequestAutoMergeDisable\b`),
		httpmock.GraphQLQuery(`{}`, func(s string, m map[string]interface{}) {
			assert.Equal(t, map[string]interface{}{"prID": "THE-ID"}, m)
		}))

	_, cmdTeardown := run.Stub()
	defer cmdTeardown(t)

	err := mergeRun(&MergeOptions{
		IO: ios,
		HttpClient: func() (*http.Client, error) {
			return &http.Client{Transport: tr}, nil
		},
		SelectorArg:      "https://github.com/OWNER/REPO/pull/123",
		AutoMergeDisable: true,
		Finder: shared.NewMockFinder(
			"https://github.com/OWNER/REPO/pull/123",
			&api.PullRequest{ID: "THE-ID", Number: 123},
			ghrepo.New("OWNER", "REPO"),
		),
	})
	assert.NoError(t, err)

	assert.Equal(t, "", stdout.String())
	assert.Equal(t, "✓ Auto-merge disabled for pull request OWNER/REPO#123\n", stderr.String())
}

func TestPrInMergeQueue(t *testing.T) {
	http := initFakeHTTP()
	defer http.Verify(t)

	shared.StubFinderForRunCommandStyleTests(t,
		"1",
		&api.PullRequest{
			ID:                  "THE-ID",
			Number:              1,
			State:               "OPEN",
			Title:               "The title of the PR",
			MergeStateStatus:    "CLEAN",
			IsInMergeQueue:      true,
			IsMergeQueueEnabled: true,
		},
		baseRepo("OWNER", "REPO", "main"),
	)

	cs, cmdTeardown := run.Stub()
	defer cmdTeardown(t)
	cs.Register(`git rev-parse --verify refs/heads/`, 0, "")

	output, err := runCommand(http, nil, "blueberries", true, "pr merge 1")
	if err != nil {
		t.Fatalf("error running command `pr merge`: %v", err)
	}

	assert.Equal(t, "", output.String())
	assert.Equal(t, "! Pull request OWNER/REPO#1 is already queued to merge\n", output.Stderr())
}

func TestPrAddToMergeQueueWithMergeMethod(t *testing.T) {
	http := initFakeHTTP()
	defer http.Verify(t)

	shared.StubFinderForRunCommandStyleTests(t,
		"1",
		&api.PullRequest{
			ID:                  "THE-ID",
			Number:              1,
			State:               "OPEN",
			Title:               "The title of the PR",
			MergeStateStatus:    "CLEAN",
			IsInMergeQueue:      false,
			IsMergeQueueEnabled: true,
			BaseRefName:         "main",
		},
		baseRepo("OWNER", "REPO", "main"),
	)
	http.Register(
		httpmock.GraphQL(`mutation PullRequestAutoMerge\b`),
		httpmock.GraphQLMutation(`{}`, func(input map[string]interface{}) {
			assert.Equal(t, "THE-ID", input["pullRequestId"].(string))
			assert.Equal(t, "MERGE", input["mergeMethod"].(string))
		}),
	)

	cs, cmdTeardown := run.Stub()
	defer cmdTeardown(t)
	cs.Register(`git rev-parse --verify refs/heads/`, 0, "")

	output, err := runCommand(http, nil, "blueberries", true, "pr merge 1 --merge")
	if err != nil {
		t.Fatalf("error running command `pr merge`: %v", err)
	}
	assert.Equal(t, "", output.String())
	assert.Equal(t, "! The merge strategy for main is set by the merge queue\n✓ Pull request OWNER/REPO#1 will be added to the merge queue for main when ready\n", output.Stderr())
}

func TestPrAddToMergeQueueClean(t *testing.T) {
	http := initFakeHTTP()
	defer http.Verify(t)

	shared.StubFinderForRunCommandStyleTests(t,
		"1",
		&api.PullRequest{
			ID:                  "THE-ID",
			Number:              1,
			State:               "OPEN",
			Title:               "The title of the PR",
			MergeStateStatus:    "CLEAN",
			IsInMergeQueue:      false,
			IsMergeQueueEnabled: true,
			BaseRefName:         "main",
		},
		baseRepo("OWNER", "REPO", "main"),
	)

	http.Register(
		httpmock.GraphQL(`mutation PullRequestAutoMerge\b`),
		httpmock.GraphQLMutation(`{}`, func(input map[string]interface{}) {
			assert.Equal(t, "THE-ID", input["pullRequestId"].(string))
			assert.Equal(t, "MERGE", input["mergeMethod"].(string))
		}),
	)

	cs, cmdTeardown := run.Stub()
	defer cmdTeardown(t)
	cs.Register(`git rev-parse --verify refs/heads/`, 0, "")

	output, err := runCommand(http, nil, "blueberries", true, "pr merge 1")
	if err != nil {
		t.Fatalf("error running command `pr merge`: %v", err)
	}

	assert.Equal(t, "", output.String())
	assert.Equal(t, "✓ Pull request OWNER/REPO#1 will be added to the merge queue for main when ready\n", output.Stderr())
}

func TestPrAddToMergeQueueBlocked(t *testing.T) {
	http := initFakeHTTP()
	defer http.Verify(t)

	shared.StubFinderForRunCommandStyleTests(t,
		"1",
		&api.PullRequest{
			ID:                  "THE-ID",
			Number:              1,
			State:               "OPEN",
			Title:               "The title of the PR",
			MergeStateStatus:    "BLOCKED",
			IsInMergeQueue:      false,
			IsMergeQueueEnabled: true,
			BaseRefName:         "main",
		},
		baseRepo("OWNER", "REPO", "main"),
	)

	http.Register(
		httpmock.GraphQL(`mutation PullRequestAutoMerge\b`),
		httpmock.GraphQLMutation(`{}`, func(input map[string]interface{}) {
			assert.Equal(t, "THE-ID", input["pullRequestId"].(string))
			assert.Equal(t, "MERGE", input["mergeMethod"].(string))
		}),
	)

	cs, cmdTeardown := run.Stub()
	defer cmdTeardown(t)
	cs.Register(`git rev-parse --verify refs/heads/`, 0, "")

	output, err := runCommand(http, nil, "blueberries", true, "pr merge 1")
	if err != nil {
		t.Fatalf("error running command `pr merge`: %v", err)
	}

	assert.Equal(t, "", output.String())
	assert.Equal(t, "✓ Pull request OWNER/REPO#1 will be added to the merge queue for main when ready\n", output.Stderr())
}

func TestPrAddToMergeQueueAdmin(t *testing.T) {
	http := initFakeHTTP()
	defer http.Verify(t)

	shared.StubFinderForRunCommandStyleTests(t,
		"1",
		&api.PullRequest{
			ID:                  "THE-ID",
			Number:              1,
			State:               "OPEN",
			Title:               "The title of the PR",
			MergeStateStatus:    "CLEAN",
			IsInMergeQueue:      false,
			IsMergeQueueEnabled: true,
		},
		baseRepo("OWNER", "REPO", "main"),
	)

	http.Register(
		httpmock.GraphQL(`query RepositoryInfo\b`),
		httpmock.StringResponse(`
		{ "data": { "repository": {
			"mergeCommitAllowed": true,
			"rebaseMergeAllowed": true,
			"squashMergeAllowed": true
		} } }`))

	http.Register(
		httpmock.GraphQL(`mutation PullRequestMerge\b`),
		httpmock.GraphQLMutation(`{}`, func(input map[string]interface{}) {
			assert.Equal(t, "THE-ID", input["pullRequestId"].(string))
			assert.Equal(t, "MERGE", input["mergeMethod"].(string))
			assert.NotContains(t, input, "commitHeadline")
		}),
	)

	cs, cmdTeardown := run.Stub()
	defer cmdTeardown(t)
	cs.Register(`git rev-parse --verify refs/heads/`, 0, "")

	pm := &prompter.PrompterMock{
		ConfirmFunc: func(p string, d bool) (bool, error) {
			if p == "Delete the branch locally and on GitHub?" {
				return d, nil
			} else {
				return false, prompter.NoSuchPromptErr(p)
			}
		},
		SelectFunc: func(p, d string, opts []string) (int, error) {
			switch p {
			case "What's next?":
				return 0, nil
			case "What merge method would you like to use?":
				return 0, nil
			default:
				return -1, prompter.NoSuchPromptErr(p)
			}
		},
	}

	output, err := runCommand(http, pm, "blueberries", true, "pr merge 1 --admin")
	if err != nil {
		t.Fatalf("error running command `pr merge`: %v", err)
	}

	assert.Equal(t, "", output.String())
	assert.Equal(t, "Merging pull request OWNER/REPO#1 (The title of the PR)\n✓ Merged pull request OWNER/REPO#1 (The title of the PR)\n", output.Stderr())
}

func TestPrAddToMergeQueueAdminWithMergeStrategy(t *testing.T) {
	http := initFakeHTTP()
	defer http.Verify(t)

	shared.StubFinderForRunCommandStyleTests(t,
		"1",
		&api.PullRequest{
			ID:               "THE-ID",
			Number:           1,
			State:            "OPEN",
			Title:            "The title of the PR",
			MergeStateStatus: "CLEAN",
			IsInMergeQueue:   false,
		},
		baseRepo("OWNER", "REPO", "main"),
	)

	http.Register(
		httpmock.GraphQL(`mutation PullRequestMerge\b`),
		httpmock.GraphQLMutation(`{}`, func(input map[string]interface{}) {
			assert.Equal(t, "THE-ID", input["pullRequestId"].(string))
			assert.Equal(t, "MERGE", input["mergeMethod"].(string))
			assert.NotContains(t, input, "commitHeadline")
		}),
	)

	cs, cmdTeardown := run.Stub()
	defer cmdTeardown(t)
	cs.Register(`git rev-parse --verify refs/heads/`, 0, "")

	output, err := runCommand(http, nil, "blueberries", true, "pr merge 1 --admin --merge")
	if err != nil {
		t.Fatalf("error running command `pr merge`: %v", err)
	}

	assert.Equal(t, "", output.String())
	assert.Equal(t, "✓ Merged pull request OWNER/REPO#1 (The title of the PR)\n", output.Stderr())
}

type testEditor struct{}

func (e testEditor) Edit(filename, text string) (string, error) {
	return strings.ToUpper(text), nil
}
