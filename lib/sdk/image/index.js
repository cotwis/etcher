var fs = require( 'fs' )
var path = require( 'path' )
var mime = require( 'mime-types' )
var fileType = require( 'file-type' )

class Image {

  constructor(path, options) {

    options = options || {}

    super()

    if( this.constructor === Image ) {
      throw new Error( 'Image constructor cannot be invoked directly' )
    }

    if( typeof path !== 'string' ) {
      throw new TypeError('Path must be a string')
    }

    this.fd = null
    this.path = path
    this.capability = this.constructor.capability
    this.options = options
    this.metadata = null

    this.fs = options.fs || fs

    Object.defineProperty( this, 'fs', { enumerable: false })

  }

  /**
   * Determine whether given capability flag is set
   * @param {Number} mask
   * @returns {Boolean}
   */
  hasCapability( mask ) {
    return ( this.capability & mask ) === mask
  }

  /**
   * Set given capability flag to a given value
   * @param {Number} mask
   * @param {Boolean} value
   * @returns {Number} flags
   */
  setCapability( mask, value ) {
    if( !value && (this.capability & mask) ) {
      this.capability = this.capability ^ mask
    }
    if( value && !(this.capability & mask) ) {
      this.capability = this.capability | mask
    }
    return this.capability
  }

  open(callback) {

    var mode = undefined
    var flags = fs.constants.O_RDWR |
      fs.constants.O_NONBLOCK |
      fs.constants.O_SYNC |
      fs.constants.O_DSYNC

    if( process.platform !== 'linux' ) {
      flags = flags | fs.constants.O_DIRECT
    }

    this.fs.open( this.path, flags, mode, ( error, fd ) => {

      this.fd = fd

      if( error ) {
        return void callback.call( this, error )
      }

      this.getMetadata( callback )

    })

  }

  close(callback) {
    this.fs.close( this.fd, ( error ) => {
      callback.call( this, error )
    })
    this.fd = null
  }

  create(options, callback) {

    if(typeof options === 'function') {
      callback = options
      options = null
    }

    const error = new Error(`${this.constructor.name}: Creation not supported`)
    callback.call(this, error)

  }

  getMetadata(callback) {
    const error = new Error(`${this.constructor.name}: getMetadata not implemented`)
    callback.call(this, error)
  }

  read(buffer, length, offset, position, callback) {
    const error = new Error(`${this.constructor.name}: read not implemented`)
    callback.call(this, error)
  }

  createReadStream(options, callback) {
    const error = new Error(`${this.constructor.name}: ReadStream not implemented`)
    callback.call(this, error)
  }

  createSparseReadStream(options, callback) {
    const error = new Error(`${this.constructor.name}: SparseReadStream not supported`)
    callback.call(this, error)
  }

  write(buffer, length, offset, position, callback) {
    const error = new Error(`${this.constructor.name}: write not implemented`)
    callback.call(this, error)
  }

  createWriteStream(options, callback) {
    const error = new Error(`${this.constructor.name}: WriteStream not implemented`)
    callback.call(this, error)
  }

  createSparseWriteStream(options, callback) {
    const error = new Error(`${this.constructor.name}: SparseWriteStream not supported`)
    callback.call(this, error)
  }

  createVerify(options, callback) {
    const error = new Error(`${this.constructor.name}: Verify not supported`)
    callback.call(this, error)
  }

}

Image.CAPABILITY = {
  // NONE: 0,
  READ: 1 << 0,
  WRITE: 1 << 1,
  READ_STREAM: 1 << 2,
  WRITE_STREAM: 1 << 3,
  READ_STREAM_SPARSE: 1 << 4,
  WRITE_STREAM_SPARSE: 1 << 5,
  VERIFY: 1 << 6,
  CREATE: 1 << 7,
  CUSTOM_FS: 1 << 8,
}

Image.TYPE = {
  // UNKNOWN: 0,
  DEVICE: 1 << 0,
  RAW: 1 << 1,
  // Archive & compressed could be attributes (under Image.ATTR?)
  COMPRESSED: 1 << 2,
  ARCHIVE: 1 << 3,
  // For something like .cab, .iso & udf?
  // But name should be changed as this could also
  // be used for docker containers?
  // CONTAINER: 1 << 5,
}

Image.selectByMimeType = ( formats, mimeType ) => {
  return formats.filter(( format ) => {
    return format.mimeTypes.includes( mimeType )
  })
}

Image.selectByExtension = ( formats, ext ) => {
  return formats.filter(( format ) => {
    return format.extensions.includes( ext )
  })
}

// TODO: Error on ambiguous solutions?
Image.getByMimeType = ( mimeType ) => {
  return Image.selectByMimeType( Image.formats, mimeType ).shift()
}

// TODO: Error on ambiguous solutions?
Image.getByExtension = ( ext ) => {
  return Image.selectByExtension( Image.formats, ext ).shift()
}

Image.getSupportedExtensions = () => {
  const extensions = Image.formats.reduce(( extensions, format ) => {
    return extensions.concat( format.extensions )
  }, [])
  return Array.from( new Set( extensions ) )
}

Image.getSupportedMimeTypes = () => {
  const mimeTypes = Image.formats.reduce(( mimeTypes, format ) => {
    return mimeTypes.concat( format.mimeTypes )
  }, [])
  return Array.from( new Set( mimeTypes ) )
}

Image.getSupportedCompressionSchemes = () => {
  const schemes = Image.formats.reduce(( schemes, format ) => {
    return schemes.concat( format.compressionSchemes )
  }, [])
  return Array.from( new Set( schemes ) )
}

Image.getSupportedCompressedExtensions = () => {
  const extensions = Image.formats.reduce(( extensions, format ) => {
    return extensions.concat( format.compressedExtensions )
  }, [])
  return Array.from( new Set( extensions ) )
}

Image.isCompressed = ( filename ) => {
  const extname = path.extname( filename )
  return Image.supportedCompressedExtensions.includes( extname ) ||
    Image.supportedCompressionSchemes.includes( mime.lookup( extname ) )
}

// IDEA: Middleware style formats
// Image.use = ( format ) => {
//   Image[ format.name ] = format
//   Image.formats.push( format )
// }

Image.from = ( filename ) => {

  var extname = path.extname( filename )

  if( /^[a-z0-9]+:/.test( filename ) || extname === '.torrent' ) {
    throw new Error( 'network' )
  }

  var stats = fs.statSync( filename )
  if( stats.isBlockDevice() ) {
    return new Image.BlockDevice( filename )
  } else if( stats.isCharacterDevice() ) {
    // Handle things like `/dev/zero`
    return new Image.OctetStream( filename )
  }

  var Format = null
  var basename = null

  if( Image.isCompressed( filename ) ) {
    basename = path.basename( filename, extname )
  }

  var mimeType = mime.lookup( basename || filename )
  if( mimeType ) {
    Format = Image.getByMimeType( mimeType )
    return new Format( filename )
  }

  var fd = fs.openSync( filename, 'r' )
  var buffer = Buffer.allocUnsafe( 16 * 1024 )

  fs.readSync( fd, buffer, 0, buffer.length, 0 )
  fs.closeSync( fd )

  var file = fileType( buffer )
  Format = Image.getByMimeType( file.mime )

  // TODO: Fall back to OctetStream?

  return new Format( filename )

}

module.exports = Image

Image.Metadata = require( './metadata' )

Image.BlockDevice = require( './blockdevice' )
Image.OctetStream = require( './octet-stream' )
Image.ZipArchive = require( './zip-archive' )
Image.AppleDmg = require( './apple-dmg' )

Image.formats = [
  Image.BlockDevice,
  Image.OctetStream,
  Image.ZipArchive,
  Image.AppleDmg
]

Image.supportedMimeTypes = Image.getSupportedMimeTypes()
Image.supportedExtensions = Image.getSupportedExtensions()
Image.supportedCompressionSchemes = Image.getSupportedCompressionSchemes()
Image.supportedCompressedExtensions = Image.getSupportedCompressedExtensions()
