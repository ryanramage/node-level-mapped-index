const mapReduce       = require('map-reduce')
    , xtend           = require('xtend')
    , through2        = require('through2')

    , mapReducePrefix = 'mi/'

function register (db, mapDb, indexName, indexer) {
  if (typeof indexName == 'function') {
    indexer = indexName

    if (typeof mapDb == 'string') {
      indexName = mapDb
      mapDb = mapReducePrefix + mapDb
    } else
      indexName = mapDb._prefix
  }

  function emit (id, value, _emit) {
    indexer(id, value, function (value) {
      _emit(value, id)
    })
  }

  var mapper = mapReduce(db, mapDb, emit)
  db._mappedIndexes[indexName] = typeof mapDb == 'string' ?  mapper : mapDb

  return db
}

function indexedStream (db, indexName, key, options) {
  if (!db._mappedIndexes[indexName])
    throw new Error('No such index: ' + indexName)

  if (!options)
    options = {}

  options = xtend(options || {}, { range: [ String(key), '' ] })

  var stream = db._mappedIndexes[indexName]
    .createReadStream(options)
    .pipe(through2({ objectMode: true }, function (data, enc, callback) {
      db.get(data.value, function (err, value) {
        if (err)
          return callback(err)
        callback(null, { key: data.value, value: value })
      })
    }))

  stream.on('end', function () {
    process.nextTick(stream.emit.bind(stream, 'close'))
  })

  return stream
}

function getBy (db, indexName, key, callback) {
  var data = []
  db.createIndexedStream(indexName, key)
    .on('data', function (_data) {
      data.push(_data)
    })
    .on('error', function (err) {
      callback(err)
      callback = null
    })
    .on('close', function () {
      callback && callback(null, data)
    })
}

function setup (db) {
  if (db._mappedIndexes) return

  db._mappedIndexes      = {}
  db.registerIndex       = register.bind(null, db)
  db.createIndexedStream = indexedStream.bind(null, db)
  db.getBy               = getBy.bind(null, db)

  return db
}

module.exports = setup