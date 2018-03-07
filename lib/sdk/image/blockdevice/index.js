var Image = require( '../image' )
var fs = require( 'fs' )
var mountutils = require( 'mountutils' )
var driveClean = require( 'win-drive-clean' )
var drivelist = require( 'drivelist' )
var BlockStream = require( './block-stream' )
var BlockReadStream = require( './block-read-stream' )
var BlockWriteStream = require( './block-Write-stream' )
var SparseWriteStream = require( './sparse-Write-stream' )
var debug = require( 'debug' )( 'etcher:sdk:image:blockdevice' )

class BlockDevice extends Image {

  constructor( path, options ) {
    super( path, options )

    // TODO: Set blockSize etc. from drivelist object
  }

  open(callback) {

    debug( 'open' )

    var mode = undefined
    var flags = fs.constants.O_RDWR |
      fs.constants.O_NONBLOCK |
      fs.constants.O_SYNC |
      fs.constants.O_DSYNC

    if( process.platform !== 'linux' ) {
      flags = flags | fs.constants.O_DIRECT
    }

    drivelist.list(( error, drives ) => {

      debug( 'open:drivelist', error ? error.message : 'OK' )

      if( error ) {
        return void callback.call( this, error )
      }

      this.device = drives.filter(( drive ) => {
        return drive.device === this.path ||
          drive.raw === this.path
      }).shift()

      if( !this.device ) {
        return void callback.call( this, new Error( `Couldn't find device "${this.path}"` ))
      }

      mountutils.unmountDisk( this.path, ( error ) => {

        debug( 'open:unmount', error ? error.message : 'OK' )

        if( error ) {
          return void callback.call( this, error )
        }

        this.fs.open( this.device.raw, flags, mode, ( error, fd ) => {

          debug( 'open:fd', error ? error.message : 'OK' )

          this.fd = fd

          if( error ) {
            return void callback.call( this, error )
          }

          this.getMetadata( callback )

        })

      })

    })

  }

  getMetadata( callback ) {

    debug( 'metadata' )

    this.fs.fstat( this.fd, ( error, stats ) => {

      debug( 'metadata', error ? error.message : 'OK' )

      if( error ) {
        this.metadata = null
        return void callback.call( this, error )
      }

      this.metadata = new Image.Metadata()
      this.metadata.size = this.device.size || stats.size
      this.metadata.blockSize = this.device.blockSize || stats.blksize
      this.metadata.logicalBlockSize = this.device.logicalBlockSize || 512
      this.metadata.name = this.device.description

      debug( 'metadata', this.metadata )

      callback.call( this, null, this.metadata )

    })
  }

  createReadStream( callback ) {

    debug( 'read-stream' )

    if( typeof options === 'function' ) {
      callback = options
      options = null
    }

    var stream = new BlockReadStream({
      fd: this.fd,
      autoClose: false,
      blockSize: this.metadata.blockSize,
    })

    // var stream = this.fs.createReadStream( null, {
    //   fd: this.fd,
    //   autoClose: false,
    //   highWaterMark: this.metadata.blockSize,
    // })

    callback.call( this, null, stream )

  }

  createWriteStream( options, callback ) {

    debug( 'write-stream' )

    if( typeof options === 'function' ) {
      callback = options
      options = null
    }

    driveClean( this.device.raw, ( error ) => {

      debug( 'write-stream:clean', error ? error.message : 'OK' )

      if( error ) {
        return void callback.call( this, error )
      }

      var stream = new BlockWriteStream({
        fd: this.fd,
        autoClose: false,
      })

      var blockStream = new BlockStream({
        blockSize: this.metadata.blockSize,
        chunkSize: this.metadata.blockSize
      })

      stream.on( 'error', (error) => blockStream.destroy( error ) )
      blockStream.pipe( stream )

      // var stream = this.fs.createWriteStream( null, {
      //   fd: this.fd,
      //   autoClose: false,
      //   highWaterMark: this.metadata.blockSize * 10,
      // })

      callback.call( this, null, blockStream )

    })

  }

  createSparseWriteStream( options, callback ) {

    debug( 'sparse-write-stream' )

    if( typeof options === 'function' ) {
      callback = options
      options = null
    }

    driveClean( this.device.raw, ( error ) => {

      debug( 'sparse-write-stream:clean', error ? error.message : 'OK' )

      if( error ) {
        return void callback.call( this, error )
      }

      var stream = new SparseWriteStream( null, {
        fd: this.fd,
        autoClose: false,
      })

      callback.call( this, null, stream )

    })

  }

}

BlockDevice.mimeTypes = []
BlockDevice.extensions = []
BlockDevice.defaultExtension = null

BlockDevice.capability = Image.CAPABILITY.READ |
  Image.CAPABILITY.WRITE |
  Image.CAPABILITY.READ_STREAM |
  Image.CAPABILITY.WRITE_STREAM |
  Image.CAPABILITY.WRITE_STREAM_SPARSE

module.exports = BlockDevice
