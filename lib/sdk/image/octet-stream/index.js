var Image = require( '../image' )
var SparseWriteStream = require( './sparse-write-stream' )
var debug = require( 'debug' )( 'etcher:sdk:image:octet-stream' )

class OctectStream extends Image {

  constructor( path, options ) {
    super( path, options )
  }

  getMetadata( callback ) {
    this.fs.fstat( this.fd, ( error, stats ) => {

      if( error ) {
        this.metadata = null
        return void callback.call( this, error )
      }

      this.metadata = new Image.Metadata()
      this.metadata.size = stats.size

      callback.call( this, null, this.metadata )

    })
  }

  createReadStream( options, callback ) {

    if( typeof options === 'function' ) {
      callback = options
      options = null
    }

    var stream = this.fs.createReadStream( null, {
      fd: this.fd,
      autoClose: false,
      highWaterMark: 2 * 128 * 1024,
    })

    callback.call( this, null, stream )

  }

  createWriteStream( options, callback ) {

    if( typeof options === 'function' ) {
      callback = options
      options = null
    }

    var stream = this.fs.createWriteStream( null, {
      fd: this.fd,
      autoClose: false,
    })

    callback.call( this, null, stream )

  }

  createSparseWriteStream( options, callback ) {

    if( typeof options === 'function' ) {
      callback = options
      options = null
    }

    var stream = new SparseWriteStream( null, {
      fd: this.fd,
      autoClose: false,
    })

    callback.call( this, null, stream )

  }

}

OctectStream.mimeTypes = [
  'application/octet-stream',
  'application/x-iso9660-image'
]

OctectStream.compressionSchemes = [
  'application/x-xz',
  'application/gzip',
  'application/x-bzip2'
]

OctectStream.compressedExtensions = [
  '.bz2', '.bzip2', '.bz', '.bzip',
  '.gz', '.gzip',
  '.xz', '.lzma'
]

OctectStream.extensions = [
  '.img', '.bin', '.raw', '.iso',
  '.hddimg', '.sdcard', '.rpi-sdimg', '.dsk'
]

OctectStream.defaultExtension = '.img'

OctectStream.capability = Image.CAPABILITY.READ |
  Image.CAPABILITY.WRITE |
  Image.CAPABILITY.READ_STREAM |
  Image.CAPABILITY.WRITE_STREAM |
  Image.CAPABILITY.WRITE_STREAM_SPARSE

module.exports = OctectStream
