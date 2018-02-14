/**
 * houston/src/cli/commands/build.ts
 * Builds a project with the worker
 */

// Command line files are allowed to have console log statements
// tslint:disable no-console

import * as fs from 'fs-extra'
import * as path from 'path'
import * as semver from 'semver'

import { Config } from '../../lib/config'
import { levelIndex } from '../../lib/log/level'
import { sanitize } from '../../lib/service/rdnn'
import { create as createRepository } from '../../lib/service/repository'
import { Build } from '../../worker/role/build'
import { Storable } from '../../worker/type'
import { Worker } from '../../worker/worker'
import { setup } from '../utilities'

export const command = 'build <repo> <version>'
export const describe = 'Builds a repository with the worker process'

export const builder = (yargs) => {
  return yargs
    .positional('repo', {
      describe: 'Full repository URL',
      type: 'string'
    })
    .positional('version', {
      coerce: semver.valid,
      default: '0.0.1',
      describe: 'Semver version to build for',
      type: 'string'
    })
    .option('type', {
      choices: ['app', 'system-app'],
      default: 'app',
      describe: 'The type of project',
      type: 'string'
    })
    .option('architecture', {
      default: 'amd64',
      describe: 'Architecture to build for',
      type: 'string'
    })
    .option('distribution', {
      default: 'loki',
      describe: 'Distribution to build for',
      type: 'string'
    })
    .option('name-appstream', {
      describe: 'AppStream id',
      type: 'string'
    })
    .option('name-developer', {
      describe: 'Developer\'s name',
      type: 'string'
    })
    .option('name-domain', {
      alias: 'n',
      coerce: sanitize,
      describe: 'Reverse Domain Name Notation',
      type: 'string'
    })
    .option('name-human', {
      describe: 'Human readable name',
      type: 'string'
    })
    .option('package-system', {
      choices: ['deb'],
      default: 'deb',
      describe: 'Package system',
      type: 'string'
    })
    .option('references', {
      default: [],
      describe: 'References to pull',
      type: 'array'
    })
}

/**
 * Creates a basic storage object for information about the build
 * TODO: All the things
 *
 * @param {object} argv
 * @param {Repository} repository
 * @return {object}
 */
function buildStorage (argv, repository) {
  const nameDomain = argv['name-domain'] || repository.rdnn
  const nameAppstream = argv['name-appstream'] || `${nameDomain}.desktop`
  const nameDeveloper = argv['name-developer'] || 'Rabbitbot'
  const nameHuman = argv['name-human'] || 'Application' // TODO: Better name?

  const obj : Storable = {
    appcenter: {},
    appstream: '',
    architecture: argv.architecture,
    changelog: [],
    distribution: argv.distribution,
    logs: [],
    nameAppstream,
    nameDeveloper,
    nameDomain,
    nameHuman,
    packageSystem: argv['package-system'],
    references: argv.references,
    type: argv.type,
    version: argv.version
  }

  return obj
}

/**
 * Logs all of the logs to the console
 *
 * @param {Log[]} logs
 * @return {void}
 */
function logLogs (logs) {
  for (const log of logs.sort((a, b) => (b.level - a.level))) {
    console.log(log.toString())
  }
}

export async function handler (argv) {
  const { app } = setup(argv)

  const config = app.get<Config>(Config)
  const repository = createRepository(argv.repo)
  const storage = buildStorage(argv, repository)

  const worker = new Worker(config, repository, storage)

  console.log(`Running build for ${argv.repo} version ${argv.version}`)

  await worker.setup()
  await worker.run(Build)

  const packagePath = path.resolve(worker.workspace, `package.${storage.packageSystem}`)
  if (await fs.exists(packagePath)) {
    await fs.copy(packagePath, process.cwd(), { overwrite: true })
  }

  if (worker.fails()) {
    console.error(`Error while running build for ${argv.repo} for ${argv.version}`)
    logLogs(worker.storage.logs)

    process.exit(1)
  } else {
    console.log(`Built ${argv.repo} for version ${argv.version}`)
    logLogs(worker.storage.logs)

    process.exit(0)
  }
}
