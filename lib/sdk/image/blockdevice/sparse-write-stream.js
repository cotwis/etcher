var fs = require( 'fs' )
var stream = require( 'readable-stream' )
var debug = require( 'debug' )( 'etcher:sdk:image:blockdevice:sparse-write-stream' )

class SparseWriteStream extends stream.Writable {

  constructor( path, options ) {

    options = options || {}
    options.objectMode = true

    super(options)

    this.fs = options.fs
    this.fd = options.fd
    this.path = options.path
    this.flags = options.flags
    this.mode = options.mode
    this.autoClose = options.autoClose

    this.position = 0
    this.bytesRead = 0
    this.blocksRead = 0
    this.bytesWritten = 0
    this.blocksWritten = 0

    this.once('finish', function () {
      if (this.autoClose) {
        this.close()
      }
    })

  }

  /**
   * @summary Open a handle to the file
   * @private
   * @example
   * this.open()
   */
  open () {
    debug('open')

    if (this.fd != null) {
      this.emit('open', this.fd)
      return
    }

    this.fs.open(this.path, this.flags, this.mode, (error, fd) => {
      if (error) {
        if (this.autoClose) {
          this.destroy()
        }
        this.emit('error', error)
      } else {
        this.fd = fd
        this.emit('open', fd)
      }
    })
  }

  _write( block, _, next ) {

    // debug( 'write', block )

    // Wait for file handle to be open
    if (this.fd == null) {
      this.once('open', () => {
        this._write(chunk, encoding, next)
      })
      return
    }

    fs.write(this.fd, block.buffer, 0, block.buffer.length, block.position, (error, bytesWritten) => {
      if (!error) {
        this.bytesWritten += bytesWritten
        this.delta += bytesWritten
        this.blocksWritten += 1
        this.position += bytesWritten
        this.retries = 0
      }

      next(error)
    })

  }

}

module.exports = SparseWriteStream
