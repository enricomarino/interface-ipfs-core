/* eslint-env mocha */
/* eslint max-nested-callbacks: ["error", 8] */

'use strict'

const chai = require('chai')
const dirtyChai = require('dirty-chai')
const expect = chai.expect
chai.use(dirtyChai)
const bs58 = require('bs58')
const Readable = require('readable-stream')
const loadFixture = require('aegir/fixtures')
const bl = require('bl')
const isNode = require('detect-node')
const concat = require('concat-stream')
const through = require('through2')

module.exports = (common) => {
  describe('.files', () => {
    let smallFile
    let bigFile
    let directoryContent
    let ipfs

    before(function (done) {
      // CI is slow
      this.timeout(20 * 1000)

      smallFile = loadFixture(__dirname, '../test/fixtures/testfile.txt', 'interface-ipfs-core')
      bigFile = loadFixture(__dirname, '../test/fixtures/15mb.random', 'interface-ipfs-core')

      directoryContent = {
        'pp.txt': loadFixture(__dirname, '../test/fixtures/test-folder/pp.txt', 'interface-ipfs-core'),
        'holmes.txt': loadFixture(__dirname, '../test/fixtures/test-folder/holmes.txt', 'interface-ipfs-core'),
        'jungle.txt': loadFixture(__dirname, '../test/fixtures/test-folder/jungle.txt', 'interface-ipfs-core'),
        'alice.txt': loadFixture(__dirname, '../test/fixtures/test-folder/alice.txt', 'interface-ipfs-core'),
        'files/hello.txt': loadFixture(__dirname, '../test/fixtures/test-folder/files/hello.txt', 'interface-ipfs-core'),
        'files/ipfs.txt': loadFixture(__dirname, '../test/fixtures/test-folder/files/ipfs.txt', 'interface-ipfs-core')
      }

      common.setup((err, factory) => {
        expect(err).to.not.exist()
        factory.spawnNode((err, node) => {
          expect(err).to.not.exist()
          ipfs = node
          done()
        })
      })
    })

    after((done) => {
      common.teardown(done)
    })

    describe('callback API', (done) => {
      describe('.add', () => {
        it('stream', (done) => {
          const buffered = new Buffer('some data')
          const expectedMultihash = 'QmVv4Wz46JaZJeH5PMV4LGbRiiMKEmszPYY3g6fjGnVXBS'

          const rs = new Readable()
          rs.push(buffered)
          rs.push(null)

          const arr = []
          const filePair = {
            path: 'data.txt',
            content: rs
          }

          arr.push(filePair)

          ipfs.files.add(arr, (err, res) => {
            expect(err).to.not.exist()
            expect(res).to.be.length(1)
            const file = res[0]
            expect(file).to.exist()
            expect(file.path).to.equal('data.txt')
            expect(file.size).to.equal(17)
            expect(file.hash).to.equal(expectedMultihash)
            done()
          })
        })

        it('buffer as tuple', (done) => {
          const file = {
            path: 'testfile.txt',
            content: smallFile
          }
          const expectedMultihash = 'Qma4hjFTnCasJ8PVp3mZbZK5g2vGDT4LByLJ7m8ciyRFZP'

          ipfs.files.add([file], (err, res) => {
            expect(err).to.not.exist()

            const file = res[0]
            expect(file.hash).to.equal(expectedMultihash)
            expect(file.path).to.equal('testfile.txt')
            done()
          })
        })

        it('buffer', (done) => {
          const expectedMultihash = 'Qma4hjFTnCasJ8PVp3mZbZK5g2vGDT4LByLJ7m8ciyRFZP'

          ipfs.files.add(smallFile, (err, res) => {
            expect(err).to.not.exist()
            expect(res).to.have.length(1)
            const file = res[0]
            expect(file.hash).to.equal(expectedMultihash)
            expect(file.path).to.equal(file.hash)
            done()
          })
        })

        it('BIG buffer', (done) => {
          const expectedMultihash = 'Qme79tX2bViL26vNjPsF3DP1R9rMKMvnPYJiKTTKPrXJjq'

          ipfs.files.add(bigFile, (err, res) => {
            expect(err).to.not.exist()
            expect(res).to.have.length(1)
            const file = res[0]
            expect(file.hash).to.equal(expectedMultihash)
            expect(file.path).to.equal(file.hash)
            done()
          })
        })

        it('add a nested dir as array', (done) => {
          // Needs https://github.com/ipfs/js-ipfs-api/issues/339 to be fixed
          // for js-ipfs-api + go-ipfs
          if (!isNode) { return done() }

          const content = (name) => ({
            path: `test-folder/${name}`,
            content: directoryContent[name]
          })

          const emptyDir = (name) => ({
            path: `test-folder/${name}`
          })

          const expectedRootMultihash = 'QmVvjDy7yF7hdnqE8Hrf4MHo5ABDtb5AbX6hWbD3Y42bXP'

          const dirs = [
            content('pp.txt'),
            content('holmes.txt'),
            content('jungle.txt'),
            content('alice.txt'),
            emptyDir('empty-folder'),
            content('files/hello.txt'),
            content('files/ipfs.txt'),
            emptyDir('files/empty')
          ]

          ipfs.files.add(dirs, (err, res) => {
            expect(err).to.not.exist()
            const root = res[res.length - 1]

            expect(root.path).to.equal('test-folder')
            expect(root.hash).to.equal(expectedRootMultihash)
            done()
          })
        })

        describe('.createAddStream', () => {
          it('stream of valid files and dirs', (done) => {
            const content = (name) => ({
              path: `test-folder/${name}`,
              content: directoryContent[name]
            })

            const emptyDir = (name) => ({
              path: `test-folder/${name}`
            })

            const expectedRootMultihash = 'QmVvjDy7yF7hdnqE8Hrf4MHo5ABDtb5AbX6hWbD3Y42bXP'

            const files = [
              content('pp.txt'),
              content('holmes.txt'),
              content('jungle.txt'),
              content('alice.txt'),
              emptyDir('empty-folder'),
              content('files/hello.txt'),
              content('files/ipfs.txt'),
              emptyDir('files/empty')
            ]

            ipfs.files.createAddStream((err, stream) => {
              expect(err).to.not.exist()

              stream.on('data', (file) => {
                if (file.path === 'test-folder') {
                  expect(file.hash).to.equal(expectedRootMultihash)
                  done()
                }
              })

              files.forEach((file) => {
                stream.write(file)
              })

              stream.end()
            })
          })
        })

        it('fails in invalid input', (done) => {
          const nonValid = 'sfdasfasfs'

          ipfs.files.add(nonValid, (err, result) => {
            expect(err).to.exist()
            done()
          })
        })
      })

      describe('.cat', () => {
        it('with a base58 string encoded multihash', (done) => {
          const hash = 'Qma4hjFTnCasJ8PVp3mZbZK5g2vGDT4LByLJ7m8ciyRFZP'
          ipfs.files.cat(hash, (err, stream) => {
            expect(err).to.not.exist()
            stream.pipe(bl((err, data) => {
              expect(err).to.not.exist()
              expect(data.toString()).to.contain('Plz add me!')
              done()
            }))
          })
        })

        it('with a multihash', (done) => {
          const mhBuf = new Buffer(bs58.decode('Qma4hjFTnCasJ8PVp3mZbZK5g2vGDT4LByLJ7m8ciyRFZP'))
          ipfs.files.cat(mhBuf, (err, stream) => {
            expect(err).to.not.exist()
            stream.pipe(bl((err, data) => {
              expect(err).to.not.exist()
              expect(data.toString()).to.contain('Plz add me!')
              done()
            }))
          })
        })

        it('streams a large file', (done) => {
          const hash = 'Qme79tX2bViL26vNjPsF3DP1R9rMKMvnPYJiKTTKPrXJjq'
          ipfs.files.cat(hash, (err, stream) => {
            expect(err).to.not.exist()
            stream.pipe(bl((err, data) => {
              expect(err).to.not.exist()
              expect(data).to.deep.equal(bigFile)
              done()
            }))
          })
        })
      })
    })

    describe('promise API', () => {
      describe('.add', () => {
        const expectedMultihash = 'Qma4hjFTnCasJ8PVp3mZbZK5g2vGDT4LByLJ7m8ciyRFZP'

        it('buffer', () => {
          return ipfs.files.add(smallFile)
            .then((res) => {
              const file = res[0]
              expect(file.hash).to.equal(expectedMultihash)
              expect(file.path).to.equal(file.hash)
            })
        })
      })

      describe('.cat', () => {
        it('with a base58 multihash encoded string', () => {
          const hash = 'Qma4hjFTnCasJ8PVp3mZbZK5g2vGDT4LByLJ7m8ciyRFZP'

          return ipfs.files.cat(hash)
            .then((stream) => {
              stream.pipe(bl((err, data) => {
                expect(err).to.not.exist()
                expect(data.toString()).to.contain('Plz add me!')
              }))
            })
        })

        it('errors on invalid key', () => {
          const hash = 'somethingNotMultihash'

          return ipfs.files.cat(hash)
            .catch((err) => {
              expect(err).to.exist()
              const errString = err.toString()
              if (errString === 'Error: invalid ipfs ref path') {
                expect(err.toString()).to.contain('Error: invalid ipfs ref path')
              }
              if (errString === 'Error: Invalid Key') {
                expect(err.toString()).to.contain('Error: Invalid Key')
              }
            })
        })

        it('with a multihash', () => {
          const hash = new Buffer(bs58.decode('Qma4hjFTnCasJ8PVp3mZbZK5g2vGDT4LByLJ7m8ciyRFZP'))
          return ipfs.files.cat(hash)
            .then((stream) => {
              stream.pipe(bl((err, data) => {
                expect(err).to.not.exist()
                expect(data.toString()).to.contain('Plz add me!')
              }))
            })
        })
      })
    })

    describe('.get', () => {
      it('with a base58 encoded multihash', (done) => {
        const hash = 'Qma4hjFTnCasJ8PVp3mZbZK5g2vGDT4LByLJ7m8ciyRFZP'
        ipfs.files.get(hash, (err, stream) => {
          expect(err).to.not.exist()

          let files = []
          stream.pipe(through.obj((file, enc, next) => {
            file.content.pipe(concat((content) => {
              files.push({
                path: file.path,
                content: content
              })
              next()
            }))
          }, () => {
            expect(files).to.be.length(1)
            expect(files[0].path).to.be.eql(hash)
            expect(files[0].content.toString()).to.contain('Plz add me!')
            done()
          }))
        })
      })

      it('with a multihash', (done) => {
        const hash = 'Qma4hjFTnCasJ8PVp3mZbZK5g2vGDT4LByLJ7m8ciyRFZP'
        const mhBuf = new Buffer(bs58.decode(hash))
        ipfs.files.get(mhBuf, (err, stream) => {
          expect(err).to.not.exist()

          let files = []
          stream.pipe(through.obj((file, enc, next) => {
            file.content.pipe(concat((content) => {
              files.push({
                path: file.path,
                content: content
              })
              next()
            }))
          }, () => {
            expect(files).to.be.length(1)
            expect(files[0].path).to.be.eql(hash)
            expect(files[0].content.toString()).to.contain('Plz add me!')
            done()
          }))
        })
      })

      it('large file', (done) => {
        const hash = 'Qme79tX2bViL26vNjPsF3DP1R9rMKMvnPYJiKTTKPrXJjq'
        ipfs.files.get(hash, (err, stream) => {
          expect(err).to.not.exist()

          // accumulate the files and their content
          var files = []
          stream.pipe(through.obj((file, enc, next) => {
            file.content.pipe(concat((content) => {
              files.push({
                path: file.path,
                content: content
              })
              next()
            }))
          }, () => {
            expect(files.length).to.equal(1)
            expect(files[0].path).to.equal(hash)
            expect(files[0].content).to.deep.equal(bigFile)
            done()
          }))
        })
      })

      it('directory', (done) => {
        // Needs https://github.com/ipfs/js-ipfs-api/issues/339 to be fixed
        // for js-ipfs-api + go-ipfs
        if (!isNode) { return done() }

        const hash = 'QmVvjDy7yF7hdnqE8Hrf4MHo5ABDtb5AbX6hWbD3Y42bXP'
        ipfs.files.get(hash, (err, stream) => {
          expect(err).to.not.exist()

          // accumulate the files and their content
          var files = []
          stream.pipe(through.obj((file, enc, next) => {
            if (file.content) {
              file.content.pipe(concat((content) => {
                files.push({
                  path: file.path,
                  content: content
                })
                next()
              }))
            } else {
              files.push(file)
              next()
            }
          }, () => {
            files = files.sort((a, b) => {
              if (a.path > b.path) return 1
              if (a.path < b.path) return -1
              return 0
            })
            // Check paths
            var paths = files.map((file) => {
              return file.path
            })
            expect(paths).to.include.members([
              'QmVvjDy7yF7hdnqE8Hrf4MHo5ABDtb5AbX6hWbD3Y42bXP',
              'QmVvjDy7yF7hdnqE8Hrf4MHo5ABDtb5AbX6hWbD3Y42bXP/alice.txt',
              'QmVvjDy7yF7hdnqE8Hrf4MHo5ABDtb5AbX6hWbD3Y42bXP/empty-folder',
              'QmVvjDy7yF7hdnqE8Hrf4MHo5ABDtb5AbX6hWbD3Y42bXP/files',
              'QmVvjDy7yF7hdnqE8Hrf4MHo5ABDtb5AbX6hWbD3Y42bXP/files/empty',
              'QmVvjDy7yF7hdnqE8Hrf4MHo5ABDtb5AbX6hWbD3Y42bXP/files/hello.txt',
              'QmVvjDy7yF7hdnqE8Hrf4MHo5ABDtb5AbX6hWbD3Y42bXP/files/ipfs.txt',
              'QmVvjDy7yF7hdnqE8Hrf4MHo5ABDtb5AbX6hWbD3Y42bXP/holmes.txt',
              'QmVvjDy7yF7hdnqE8Hrf4MHo5ABDtb5AbX6hWbD3Y42bXP/jungle.txt',
              'QmVvjDy7yF7hdnqE8Hrf4MHo5ABDtb5AbX6hWbD3Y42bXP/pp.txt'
            ])

            // Check contents
            var contents = files.map(function (file) {
              return file.content ? file.content.toString() : null
            })
            expect(contents).to.include.members([
              directoryContent['alice.txt'].toString(),
              directoryContent['files/hello.txt'].toString(),
              directoryContent['files/ipfs.txt'].toString(),
              directoryContent['holmes.txt'].toString(),
              directoryContent['jungle.txt'].toString(),
              directoryContent['pp.txt'].toString()
            ])
            done()
          }))
        })
      })

      describe('promise', () => {
        it('with a base58 encoded string', () => {
          const hash = 'Qma4hjFTnCasJ8PVp3mZbZK5g2vGDT4LByLJ7m8ciyRFZP'
          return ipfs.files.get(hash).then((stream) => {
            let files = []
            return new Promise((resolve, reject) => {
              stream.pipe(through.obj((file, enc, next) => {
                file.content.pipe(concat((content) => {
                  files.push({
                    path: file.path,
                    content: content
                  })
                  next()
                }))
              }, () => {
                expect(files).to.be.length(1)
                expect(files[0].path).to.equal(hash)
                expect(files[0].content.toString()).to.contain('Plz add me!')
                resolve()
              }))
            })
          })
        })

        it('errors on invalid key', () => {
          const hash = 'somethingNotMultihash'
          return ipfs.files.get(hash).catch((err) => {
            expect(err).to.exist()
            const errString = err.toString()
            if (errString === 'Error: invalid ipfs ref path') {
              expect(err.toString()).to.contain('Error: invalid ipfs ref path')
            }
            if (errString === 'Error: Invalid Key') {
              expect(err.toString()).to.contain('Error: Invalid Key')
            }
          })
        })
      })
    })
  })
}
