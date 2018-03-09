/*
 * Copyright 2016 resin.io
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict'

const Bluebird = require('bluebird')
const visuals = require('resin-cli-visuals')
const form = require('resin-cli-form')
const bytes = require('pretty-bytes')
const ImageWriter = require('../sdk/writer')
const utils = require('./utils')
const options = require('./options')
const messages = require('../shared/messages')
const EXIT_CODES = require('../shared/exit-codes')
const errors = require('../shared/errors')
const permissions = require('../shared/permissions')

const ARGV_IMAGE_PATH_INDEX = 0
const imagePath = options._[ARGV_IMAGE_PATH_INDEX]

permissions.isElevated().then((elevated) => {
  if (!elevated) {
    throw errors.createUserError({
      title: messages.error.elevationRequired(),
      description: 'This tool requires special permissions to write to external drives'
    })
  }

  return form.run([
    {
      message: 'Select drive',
      type: 'drive',
      name: 'drive'
    },
    {
      message: 'This will erase the selected drive. Are you sure?',
      type: 'confirm',
      name: 'yes',
      default: false
    }
  ], {
    override: {
      drive: options.drive,

      // If `options.yes` is `false`, pass `null`,
      // otherwise the question will not be asked because
      // `false` is a defined value.
      yes: options.yes || null

    }
  })
}).then((answers) => {
  if (!answers.yes) {
    throw errors.createUserError({
      title: 'Aborted',
      description: 'We can\'t proceed without confirmation'
    })
  }

  const progressBars = {
    write: new visuals.Progress('Flashing'),
    check: new visuals.Progress('Validating')
  }

  return new Bluebird((resolve, reject) => {
    const results = []
    // const util = require('util')
    // const inspectOptions = {
    //   colors: process.stdout.isTTY,
    //   depth: null
    // }

    const onProgress = (state) => {
      // const output = util.inspect(state, inspectOptions)
      // process.stdout.write(output + '\n')

      state.speed = 0
      state.totalSpeed = 0

      let count = 0
      for( let k in state.speeds ) {
        state.speed += state.speeds[k]
        state.totalSpeed += state.speeds[k]
        count++
      }

      state.speed /= count

      state.message = count > 1 ?
        `${bytes(state.totalSpeed)}/s total, ${bytes(state.speed)}/s avg` :
        `${bytes(state.totalSpeed)}/s`

      state.message = `${state.type === 'write' ? 'Flashing' : 'Validating'}: ${state.message}`

      // Upfate progress bar
      progressBars[state.type].update(state)
    }

    const writer = new ImageWriter({
      verify: options.check,
      unmountOnSuccess: options.unmount,
      checksumAlgorithms: options.check ? [ 'md5' ] : [],
    })

    const onError = function(error) {
      console.error(error)
      // results.push({ device: this.options.path, error })
      // resolve(results)
    }

    const onFinish = function(state) {
      resolve(Array.from(writer.destinations.values()))
    }

    writer.on('progress', onProgress)
    writer.on('error', onError)
    writer.on('finish', onFinish)

    // NOTE: Drive can be (String|Array)
    const destinations = [].concat(answers.drive)

    writer.write(imagePath, destinations)

  })
}).then((results) => {
  let exitCode = EXIT_CODES.SUCCESS

  if (options.check) {
    console.log('')
    console.log('Checksums:')

    results.forEach((result) => {
      if( result.error ) {
        exitCode = EXIT_CODES.GENERAL_ERROR
        console.log(`  - ${result.device.device}: ${result.error.message}`)
      } else {
        console.log(`  - ${result.device.device}: ${result.checksum.md5}`)
      }
    })
  }

  process.exit(exitCode)

}).catch((error) => {
  return Bluebird.try(() => {
    utils.printError(error)
    return Bluebird.resolve()
  }).then(() => {
    if (error.code === 'EVALIDATION') {
      process.exit(EXIT_CODES.VALIDATION_ERROR)
    }

    process.exit(EXIT_CODES.GENERAL_ERROR)
  })
})
