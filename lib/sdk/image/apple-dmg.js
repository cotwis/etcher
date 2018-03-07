var UDIF = require( 'udif' )
var Image = require( './image' )
var debug = require( 'debug' )( 'etcher:sdk:image:apple-dmg' )

class AppleDmg extends Image {

  constructor( path, options ) {
    super( path, options )
    this.image = new UDIF.Image( this.path, {
      fs: this.fs
    })
  }

  open( callback ) {
    this.image.open(( error ) => {
      if( error ) {
        return void callback.call( this, error )
      }
      this.getMetadata( callback )
    })
  }

  close( callback ) {
    this.image.open(( error ) => {
      callback.call( this, error )
    })
  }

  getMetadata( callback ) {
    this.fs.fstat( this.image.fd, ( error, stats ) => {

      if( error ) {
        this.metadata = null
        return void callback.call( this, error )
      }

      this.metadata = new Image.Metadata()
      this.metadata.size = this.image.getUncompressedSize()
      this.metadata.compressedSize = stats.size

      debug( 'metadata', this.metadata )

      callback.call( this, null, this.metadata )

    })
  }

  createReadStream( options, callback ) {

    if( typeof options === 'function' ) {
      callback = options
      options = null
    }

    var stream = this.image.createReadStream( options )

    callback.call( this, null, stream )

  }

  createSparseReadStream( options, callback ) {

    if( typeof options === 'function' ) {
      callback = options
      options = null
    }

    var stream = this.image.createSparseReadStream( options )

    callback.call( this, null, stream )

  }

}

AppleDmg.capability = Image.CAPABILITY.READ_STREAM |
  Image.CAPABILITY.READ_STREAM_SPARSE

AppleDmg.mimeTypes = [ 'application/x-apple-diskimage' ]
AppleDmg.extensions = [ '.dmg' ]
AppleDmg.defaultExtension = '.dmg'

module.exports = AppleDmg
