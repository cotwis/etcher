const path = require('path')
const yauzl = require('yauzl')
const BlockMap = require( 'blockmap' )
const debug = require('debug')('etcher:sdk:image:zip-archive')
var Image = require( './image' )

class ZipArchive extends Image {

  constructor( path, options ) {
    super( path, options )

    this.zipFile = null
    this.imageEntry = null

  }

  getMetadata( callback ) {

    debug( 'getMetadata' )

    yauzl.fromFd( this.fd, {
      lazyEntries: true,
      autoClose: false
    }, ( error, zipFile ) => {

      debug( 'getMetadata', error ? error.message : 'OK' )

      if( error ) {
        return void callback.call( this, error )
      }

      this.metadata = new Image.Metadata()

      const isImageFile = ( filename ) => {
        const extname = path.extname( filename ).toLowerCase()
        return Image.supportedExtensions.includes( extname )
      }

      const isMetadataFile = ( filename ) => {
        filename = filename.toLowerCase()
        return filename.endsWith('.meta/manifest.json') ||
          filename.endsWith('.meta/image.bmap') ||
          filename.endsWith('.meta/logo.svg')
      }

      zipFile.readEntry()

      zipFile.on( 'entry', ( entry ) => {
        debug( 'entry', entry )
        if( isImageFile( entry.fileName ) ) {
          this.metadata.size = entry.uncompressedSize
          this.metadata.compressedSize = entry.compressedSize
          this.imageEntry = entry
          // TODO: Error if multiple flashable images are found
          zipFile.readEntry()
        } else if( isMetadataFile( entry.fileName ) ) {
          const basename = path.basename( entry.fileName ).toLowerCase()
          zipFile.openReadStream( entry, ( error, readStream ) => {
            var data = ''
            readStream.on( 'data', (chunk) => data += chunk )
            // TODO: Error handling
            readStream.on( 'error', (error) => zipFile.readEntry() )
            readStream.on( 'end', () => {
              if( basename === 'manifest.json' ) {
                this.metadata.manifest = JSON.parse( data )
              } else if( basename === 'image.bmap' ) {
                this.metadata.blockmap = BlockMap.parse( data )
              } else if( basename === 'logo.svg' ) {
                this.metadata.logo = data
              }
              zipFile.readEntry()
            })
          })
        } else {
          zipFile.readEntry()
        }
      })

      zipFile.once( 'error', ( error ) => {
        debug( 'getMetadata:error' )
        callback.call( this, error )
      })

      zipFile.once( 'end', () => {
        debug( 'getMetadata:end', this.metadata )
        if( !this.metadata.blockmap ) {
          this.setCapability( Image.CAPABILITY.READ_STREAM_SPARSE, false )
        }
        callback.call( this, null, this.metadata )
      })

    })
  }

  createReadStream( options, callback ) {

    if( typeof options === 'function' ) {
      callback = options
      options = null
    }

    yauzl.fromFd( this.fd, {
      lazyEntries: true,
      autoClose: false,
    }, ( error, zipFile ) => {

      if( error ) {
        return void callback.call( this, error )
      }

      zipFile.readEntry()

      zipFile.openReadStream( this.imageEntry, ( error, readStream ) => {
        callback.call( this, error, readStream )
      })

    })

  }

  createSparseReadStream( options, callback ) {

    if( typeof options === 'function' ) {
      callback = options
      options = null
    }

    this.createReadStream( options, ( error, readStream ) => {
      var filterStream = new BlockMap.FilterStream( this.metadata.blockmap )
      readStream.on( 'error', (error) => filterStream.destroy( error ) )
      readStream.pipe( filterStream )
      callback.call( this, error, filterStream )
    })

  }

}

ZipArchive.extensions = [ '.zip', '.etch' ]
ZipArchive.mimeTypes = [ 'application/zip' ]
ZipArchive.defaultExtension = '.zip'

ZipArchive.capability =
  Image.CAPABILITY.READ_STREAM |
  Image.CAPABILITY.READ_STREAM_SPARSE

module.exports = ZipArchive
