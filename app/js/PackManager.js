// Generated by CoffeeScript 1.12.4
(function() {
  var BSON, DAYS, LockManager, Metrics, MongoAWS, ObjectId, PackManager, ProjectIterator, Settings, _, async, db, keys, logger, ref;

  async = require("async");

  _ = require("underscore");

  ref = require("./mongojs"), db = ref.db, ObjectId = ref.ObjectId, BSON = ref.BSON;

  logger = require("logger-sharelatex");

  LockManager = require("./LockManager");

  MongoAWS = require("./MongoAWS");

  Metrics = require("metrics-sharelatex");

  ProjectIterator = require("./ProjectIterator");

  Settings = require("settings-sharelatex");

  keys = Settings.redis.lock.key_schema;

  DAYS = 24 * 3600 * 1000;

  module.exports = PackManager = {
    MAX_SIZE: 1024 * 1024,
    MAX_COUNT: 1024,
    insertCompressedUpdates: function(project_id, doc_id, lastUpdate, newUpdates, temporary, callback) {
      var n, nextUpdate, nextUpdateSize, sz, updatesRemaining, updatesToFlush;
      if (callback == null) {
        callback = function(error) {};
      }
      if (newUpdates.length === 0) {
        return callback();
      }
      if (((lastUpdate != null ? lastUpdate.expiresAt : void 0) != null) && !temporary) {
        lastUpdate = null;
      }
      updatesToFlush = [];
      updatesRemaining = newUpdates.slice();
      n = (lastUpdate != null ? lastUpdate.n : void 0) || 0;
      sz = (lastUpdate != null ? lastUpdate.sz : void 0) || 0;
      while (updatesRemaining.length && n < PackManager.MAX_COUNT && sz < PackManager.MAX_SIZE) {
        nextUpdate = updatesRemaining[0];
        nextUpdateSize = BSON.calculateObjectSize(nextUpdate);
        if (nextUpdateSize + sz > PackManager.MAX_SIZE && n > 0) {
          break;
        }
        n++;
        sz += nextUpdateSize;
        updatesToFlush.push(updatesRemaining.shift());
      }
      return PackManager.flushCompressedUpdates(project_id, doc_id, lastUpdate, updatesToFlush, temporary, function(error) {
        if (error != null) {
          return callback(error);
        }
        return PackManager.insertCompressedUpdates(project_id, doc_id, null, updatesRemaining, temporary, callback);
      });
    },
    flushCompressedUpdates: function(project_id, doc_id, lastUpdate, newUpdates, temporary, callback) {
      var age, canAppend, ref1;
      if (callback == null) {
        callback = function(error) {};
      }
      if (newUpdates.length === 0) {
        return callback();
      }
      canAppend = false;
      if (lastUpdate != null) {
        if (!temporary && (lastUpdate.expiresAt == null)) {
          canAppend = true;
        }
        age = Date.now() - ((ref1 = lastUpdate.meta) != null ? ref1.start_ts : void 0);
        if (temporary && (lastUpdate.expiresAt != null) && age < 1 * DAYS) {
          canAppend = true;
        }
      }
      if (canAppend) {
        return PackManager.appendUpdatesToExistingPack(project_id, doc_id, lastUpdate, newUpdates, temporary, callback);
      } else {
        return PackManager.insertUpdatesIntoNewPack(project_id, doc_id, newUpdates, temporary, callback);
      }
    },
    insertUpdatesIntoNewPack: function(project_id, doc_id, newUpdates, temporary, callback) {
      var first, last, n, newPack, sz;
      if (callback == null) {
        callback = function(error) {};
      }
      first = newUpdates[0];
      last = newUpdates[newUpdates.length - 1];
      n = newUpdates.length;
      sz = BSON.calculateObjectSize(newUpdates);
      newPack = {
        project_id: ObjectId(project_id.toString()),
        doc_id: ObjectId(doc_id.toString()),
        pack: newUpdates,
        n: n,
        sz: sz,
        meta: {
          start_ts: first.meta.start_ts,
          end_ts: last.meta.end_ts
        },
        v: first.v,
        v_end: last.v,
        temporary: temporary
      };
      if (temporary) {
        newPack.expiresAt = new Date(Date.now() + 7 * DAYS);
        newPack.last_checked = new Date(Date.now() + 30 * DAYS);
      }
      logger.log({
        project_id: project_id,
        doc_id: doc_id,
        newUpdates: newUpdates
      }, "inserting updates into new pack");
      return db.docHistory.save(newPack, function(err, result) {
        if (err != null) {
          return callback(err);
        }
        Metrics.inc("insert-pack-" + (temporary ? "temporary" : "permanent"));
        if (temporary) {
          return callback();
        } else {
          return PackManager.updateIndex(project_id, doc_id, callback);
        }
      });
    },
    appendUpdatesToExistingPack: function(project_id, doc_id, lastUpdate, newUpdates, temporary, callback) {
      var first, last, n, query, sz, update;
      if (callback == null) {
        callback = function(error) {};
      }
      first = newUpdates[0];
      last = newUpdates[newUpdates.length - 1];
      n = newUpdates.length;
      sz = BSON.calculateObjectSize(newUpdates);
      query = {
        _id: lastUpdate._id,
        project_id: ObjectId(project_id.toString()),
        doc_id: ObjectId(doc_id.toString()),
        pack: {
          $exists: true
        }
      };
      update = {
        $push: {
          "pack": {
            $each: newUpdates
          }
        },
        $inc: {
          "n": n,
          "sz": sz
        },
        $set: {
          "meta.end_ts": last.meta.end_ts,
          "v_end": last.v
        }
      };
      if (lastUpdate.expiresAt && temporary) {
        update.$set.expiresAt = new Date(Date.now() + 7 * DAYS);
      }
      logger.log({
        project_id: project_id,
        doc_id: doc_id,
        lastUpdate: lastUpdate,
        newUpdates: newUpdates
      }, "appending updates to existing pack");
      Metrics.inc("append-pack-" + (temporary ? "temporary" : "permanent"));
      return db.docHistory.findAndModify({
        query: query,
        update: update,
        "new": true,
        fields: {
          meta: 1,
          v_end: 1
        }
      }, callback);
    },
    getOpsByVersionRange: function(project_id, doc_id, fromVersion, toVersion, callback) {
      if (callback == null) {
        callback = function(error, updates) {};
      }
      return PackManager.loadPacksByVersionRange(project_id, doc_id, fromVersion, toVersion, function(error) {
        var query;
        query = {
          doc_id: ObjectId(doc_id.toString())
        };
        if (toVersion != null) {
          query.v = {
            $lte: toVersion
          };
        }
        if (fromVersion != null) {
          query.v_end = {
            $gte: fromVersion
          };
        }
        return db.docHistory.find(query).sort({
          v: -1
        }, function(err, result) {
          var docHistory, j, k, len, len1, op, opInRange, ref1, updates;
          if (err != null) {
            return callback(err);
          }
          updates = [];
          opInRange = function(op, from, to) {
            if ((fromVersion != null) && op.v < fromVersion) {
              return false;
            }
            if ((toVersion != null) && op.v > toVersion) {
              return false;
            }
            return true;
          };
          for (j = 0, len = result.length; j < len; j++) {
            docHistory = result[j];
            ref1 = docHistory.pack.reverse();
            for (k = 0, len1 = ref1.length; k < len1; k++) {
              op = ref1[k];
              if (!(opInRange(op, fromVersion, toVersion))) {
                continue;
              }
              op.project_id = docHistory.project_id;
              op.doc_id = docHistory.doc_id;
              updates.push(op);
            }
          }
          return callback(null, updates);
        });
      });
    },
    loadPacksByVersionRange: function(project_id, doc_id, fromVersion, toVersion, callback) {
      return PackManager.getIndex(doc_id, function(err, indexResult) {
        var indexPacks, neededIds, pack, packInRange;
        if (err != null) {
          return callback(err);
        }
        indexPacks = (indexResult != null ? indexResult.packs : void 0) || [];
        packInRange = function(pack, from, to) {
          if ((fromVersion != null) && pack.v_end < fromVersion) {
            return false;
          }
          if ((toVersion != null) && pack.v > toVersion) {
            return false;
          }
          return true;
        };
        neededIds = (function() {
          var j, len, results;
          results = [];
          for (j = 0, len = indexPacks.length; j < len; j++) {
            pack = indexPacks[j];
            if (packInRange(pack, fromVersion, toVersion)) {
              results.push(pack._id);
            }
          }
          return results;
        })();
        if (neededIds.length) {
          return PackManager.fetchPacksIfNeeded(project_id, doc_id, neededIds, callback);
        } else {
          return callback();
        }
      });
    },
    fetchPacksIfNeeded: function(project_id, doc_id, pack_ids, callback) {
      var id;
      return db.docHistory.find({
        _id: {
          $in: (function() {
            var j, len, results;
            results = [];
            for (j = 0, len = pack_ids.length; j < len; j++) {
              id = pack_ids[j];
              results.push(ObjectId(id));
            }
            return results;
          })()
        }
      }, {
        _id: 1
      }, function(err, loadedPacks) {
        var allPackIds, loadedPackIds, pack, packIdsToFetch;
        if (err != null) {
          return callback(err);
        }
        allPackIds = (function() {
          var j, len, results;
          results = [];
          for (j = 0, len = pack_ids.length; j < len; j++) {
            id = pack_ids[j];
            results.push(id.toString());
          }
          return results;
        })();
        loadedPackIds = (function() {
          var j, len, results;
          results = [];
          for (j = 0, len = loadedPacks.length; j < len; j++) {
            pack = loadedPacks[j];
            results.push(pack._id.toString());
          }
          return results;
        })();
        packIdsToFetch = _.difference(allPackIds, loadedPackIds);
        logger.log({
          project_id: project_id,
          doc_id: doc_id,
          loadedPackIds: loadedPackIds,
          allPackIds: allPackIds,
          packIdsToFetch: packIdsToFetch
        }, "analysed packs");
        if (packIdsToFetch.length === 0) {
          return callback();
        }
        return async.eachLimit(packIdsToFetch, 4, function(pack_id, cb) {
          return MongoAWS.unArchivePack(project_id, doc_id, pack_id, cb);
        }, function(err) {
          if (err != null) {
            return callback(err);
          }
          logger.log({
            project_id: project_id,
            doc_id: doc_id
          }, "done unarchiving");
          return callback();
        });
      });
    },
    makeProjectIterator: function(project_id, before, callback) {
      return db.docHistory.find({
        project_id: ObjectId(project_id)
      }, {
        pack: false
      }).sort({
        "meta.end_ts": -1
      }, function(err, packs) {
        var allPacks, j, len, pack, seenIds;
        if (err != null) {
          return callback(err);
        }
        allPacks = [];
        seenIds = {};
        for (j = 0, len = packs.length; j < len; j++) {
          pack = packs[j];
          allPacks.push(pack);
          seenIds[pack._id] = true;
        }
        return db.docHistoryIndex.find({
          project_id: ObjectId(project_id)
        }, function(err, indexes) {
          var index, k, l, len1, len2, ref1;
          if (err != null) {
            return callback(err);
          }
          for (k = 0, len1 = indexes.length; k < len1; k++) {
            index = indexes[k];
            ref1 = index.packs;
            for (l = 0, len2 = ref1.length; l < len2; l++) {
              pack = ref1[l];
              if (!(!seenIds[pack._id])) {
                continue;
              }
              pack.project_id = index.project_id;
              pack.doc_id = index._id;
              pack.fromIndex = true;
              allPacks.push(pack);
              seenIds[pack._id] = true;
            }
          }
          return callback(null, new ProjectIterator(allPacks, before, PackManager.getPackById));
        });
      });
    },
    getPackById: function(project_id, doc_id, pack_id, callback) {
      return db.docHistory.findOne({
        _id: pack_id
      }, function(err, pack) {
        if (err != null) {
          return callback(err);
        }
        if (pack == null) {
          return MongoAWS.unArchivePack(project_id, doc_id, pack_id, callback);
        } else if ((pack.expiresAt != null) && pack.temporary === false) {
          return PackManager.increaseTTL(pack, callback);
        } else {
          return callback(null, pack);
        }
      });
    },
    increaseTTL: function(pack, callback) {
      if (pack.expiresAt < new Date(Date.now() + 6 * DAYS)) {
        return db.docHistory.findAndModify({
          query: {
            _id: pack._id
          },
          update: {
            $set: {
              expiresAt: new Date(Date.now() + 7 * DAYS)
            }
          }
        }, function(err) {
          return callback(err, pack);
        });
      } else {
        return callback(null, pack);
      }
    },
    getIndex: function(doc_id, callback) {
      return db.docHistoryIndex.findOne({
        _id: ObjectId(doc_id.toString())
      }, callback);
    },
    getPackFromIndex: function(doc_id, pack_id, callback) {
      return db.docHistoryIndex.findOne({
        _id: ObjectId(doc_id.toString()),
        "packs._id": pack_id
      }, {
        "packs.$": 1
      }, callback);
    },
    getLastPackFromIndex: function(doc_id, callback) {
      return db.docHistoryIndex.findOne({
        _id: ObjectId(doc_id.toString())
      }, {
        packs: {
          $slice: -1
        }
      }, function(err, indexPack) {
        if (err != null) {
          return callback(err);
        }
        if (indexPack == null) {
          return callback();
        }
        return callback(null, indexPack[0]);
      });
    },
    getIndexWithKeys: function(doc_id, callback) {
      return PackManager.getIndex(doc_id, function(err, index) {
        var j, len, pack, ref1;
        if (err != null) {
          return callback(err);
        }
        if (index == null) {
          return callback();
        }
        ref1 = (index != null ? index.packs : void 0) || [];
        for (j = 0, len = ref1.length; j < len; j++) {
          pack = ref1[j];
          index[pack._id] = pack;
        }
        return callback(null, index);
      });
    },
    initialiseIndex: function(project_id, doc_id, callback) {
      return PackManager.findCompletedPacks(project_id, doc_id, function(err, packs) {
        if (err != null) {
          return callback(err);
        }
        if (packs == null) {
          return callback();
        }
        return PackManager.insertPacksIntoIndexWithLock(project_id, doc_id, packs, callback);
      });
    },
    updateIndex: function(project_id, doc_id, callback) {
      return PackManager.findUnindexedPacks(project_id, doc_id, function(err, newPacks) {
        if (err != null) {
          return callback(err);
        }
        if ((newPacks == null) || newPacks.length === 0) {
          return callback();
        }
        return PackManager.insertPacksIntoIndexWithLock(project_id, doc_id, newPacks, function(err) {
          if (err != null) {
            return callback(err);
          }
          logger.log({
            project_id: project_id,
            doc_id: doc_id,
            newPacks: newPacks
          }, "added new packs to index");
          return callback();
        });
      });
    },
    findCompletedPacks: function(project_id, doc_id, callback) {
      var query;
      query = {
        doc_id: ObjectId(doc_id.toString()),
        expiresAt: {
          $exists: false
        }
      };
      return db.docHistory.find(query, {
        pack: false
      }).sort({
        v: 1
      }, function(err, packs) {
        var last;
        if (err != null) {
          return callback(err);
        }
        if (packs == null) {
          return callback();
        }
        if (!(packs != null ? packs.length : void 0)) {
          return callback();
        }
        last = packs.pop();
        if (last.finalised) {
          packs.push(last);
        }
        return callback(null, packs);
      });
    },
    findPacks: function(project_id, doc_id, callback) {
      var query;
      query = {
        doc_id: ObjectId(doc_id.toString()),
        expiresAt: {
          $exists: false
        }
      };
      return db.docHistory.find(query, {
        pack: false
      }).sort({
        v: 1
      }, function(err, packs) {
        if (err != null) {
          return callback(err);
        }
        if (packs == null) {
          return callback();
        }
        if (!(packs != null ? packs.length : void 0)) {
          return callback();
        }
        return callback(null, packs);
      });
    },
    findUnindexedPacks: function(project_id, doc_id, callback) {
      return PackManager.getIndexWithKeys(doc_id, function(err, indexResult) {
        if (err != null) {
          return callback(err);
        }
        return PackManager.findCompletedPacks(project_id, doc_id, function(err, historyPacks) {
          var newPacks, pack;
          if (err != null) {
            return callback(err);
          }
          if (historyPacks == null) {
            return callback();
          }
          newPacks = (function() {
            var j, len, results;
            results = [];
            for (j = 0, len = historyPacks.length; j < len; j++) {
              pack = historyPacks[j];
              if ((indexResult != null ? indexResult[pack._id] : void 0) == null) {
                results.push(pack);
              }
            }
            return results;
          })();
          newPacks = (function() {
            var j, len, results;
            results = [];
            for (j = 0, len = newPacks.length; j < len; j++) {
              pack = newPacks[j];
              results.push(_.omit(pack, 'doc_id', 'project_id', 'n', 'sz', 'last_checked', 'finalised'));
            }
            return results;
          })();
          if (newPacks.length) {
            logger.log({
              project_id: project_id,
              doc_id: doc_id,
              n: newPacks.length
            }, "found new packs");
          }
          return callback(null, newPacks);
        });
      });
    },
    insertPacksIntoIndexWithLock: function(project_id, doc_id, newPacks, callback) {
      return LockManager.runWithLock(keys.historyIndexLock({
        doc_id: doc_id
      }), function(releaseLock) {
        return PackManager._insertPacksIntoIndex(project_id, doc_id, newPacks, releaseLock);
      }, callback);
    },
    _insertPacksIntoIndex: function(project_id, doc_id, newPacks, callback) {
      return db.docHistoryIndex.findAndModify({
        query: {
          _id: ObjectId(doc_id.toString())
        },
        update: {
          $setOnInsert: {
            project_id: ObjectId(project_id.toString())
          },
          $push: {
            packs: {
              $each: newPacks,
              $sort: {
                v: 1
              }
            }
          }
        },
        upsert: true
      }, callback);
    },
    archivePack: function(project_id, doc_id, pack_id, callback) {
      var clearFlagOnError;
      clearFlagOnError = function(err, cb) {
        if (err != null) {
          return PackManager.clearPackAsArchiveInProgress(project_id, doc_id, pack_id, function(err2) {
            if (err2 != null) {
              return cb(err2);
            }
            return cb(err);
          });
        } else {
          return cb();
        }
      };
      return async.series([
        function(cb) {
          return PackManager.checkArchiveNotInProgress(project_id, doc_id, pack_id, cb);
        }, function(cb) {
          return PackManager.markPackAsArchiveInProgress(project_id, doc_id, pack_id, cb);
        }, function(cb) {
          return MongoAWS.archivePack(project_id, doc_id, pack_id, function(err) {
            return clearFlagOnError(err, cb);
          });
        }, function(cb) {
          return PackManager.checkArchivedPack(project_id, doc_id, pack_id, function(err) {
            return clearFlagOnError(err, cb);
          });
        }, function(cb) {
          return PackManager.markPackAsArchived(project_id, doc_id, pack_id, cb);
        }, function(cb) {
          return PackManager.setTTLOnArchivedPack(project_id, doc_id, pack_id, callback);
        }
      ], callback);
    },
    checkArchivedPack: function(project_id, doc_id, pack_id, callback) {
      return db.docHistory.findOne({
        _id: pack_id
      }, function(err, pack) {
        if (err != null) {
          return callback(err);
        }
        if (pack == null) {
          return callback(new Error("pack not found"));
        }
        return MongoAWS.readArchivedPack(project_id, doc_id, pack_id, function(err, result) {
          var i, j, k, key, len, len1, op, ref1, ref2;
          delete result.last_checked;
          delete pack.last_checked;
          ref1 = ['_id', 'project_id', 'doc_id'];
          for (j = 0, len = ref1.length; j < len; j++) {
            key = ref1[j];
            if (result[key].equals(pack[key])) {
              result[key] = pack[key];
            }
          }
          ref2 = result.pack;
          for (i = k = 0, len1 = ref2.length; k < len1; i = ++k) {
            op = ref2[i];
            if ((op._id != null) && op._id.equals(pack.pack[i]._id)) {
              op._id = pack.pack[i]._id;
            }
          }
          if (_.isEqual(pack, result)) {
            return callback();
          } else {
            logger.err({
              pack: pack,
              result: result,
              jsondiff: JSON.stringify(pack) === JSON.stringify(result)
            }, "difference when comparing packs");
            return callback(new Error("pack retrieved from s3 does not match pack in mongo"));
          }
        });
      });
    },
    pushOldPacks: function(project_id, doc_id, callback) {
      return PackManager.findPacks(project_id, doc_id, function(err, packs) {
        if (err != null) {
          return callback(err);
        }
        if (!(packs != null ? packs.length : void 0)) {
          return callback();
        }
        return PackManager.processOldPack(project_id, doc_id, packs[0]._id, callback);
      });
    },
    pullOldPacks: function(project_id, doc_id, callback) {
      return PackManager.loadPacksByVersionRange(project_id, doc_id, null, null, callback);
    },
    processOldPack: function(project_id, doc_id, pack_id, callback) {
      var markAsChecked;
      markAsChecked = function(err) {
        return PackManager.markPackAsChecked(project_id, doc_id, pack_id, function(err2) {
          if (err2 != null) {
            return callback(err2);
          }
          return callback(err);
        });
      };
      logger.log({
        project_id: project_id,
        doc_id: doc_id
      }, "processing old packs");
      return db.docHistory.findOne({
        _id: pack_id
      }, function(err, pack) {
        if (err != null) {
          return markAsChecked(err);
        }
        if (pack == null) {
          return markAsChecked();
        }
        if (pack.expiresAt != null) {
          return callback();
        }
        return PackManager.finaliseIfNeeded(project_id, doc_id, pack._id, pack, function(err) {
          if (err != null) {
            return markAsChecked(err);
          }
          return PackManager.updateIndexIfNeeded(project_id, doc_id, function(err) {
            if (err != null) {
              return markAsChecked(err);
            }
            return PackManager.findUnarchivedPacks(project_id, doc_id, function(err, unarchivedPacks) {
              if (err != null) {
                return markAsChecked(err);
              }
              if (!(unarchivedPacks != null ? unarchivedPacks.length : void 0)) {
                logger.log({
                  project_id: project_id,
                  doc_id: doc_id
                }, "no packs need archiving");
                return markAsChecked();
              }
              return async.eachSeries(unarchivedPacks, function(pack, cb) {
                return PackManager.archivePack(project_id, doc_id, pack._id, cb);
              }, function(err) {
                if (err != null) {
                  return markAsChecked(err);
                }
                logger.log({
                  project_id: project_id,
                  doc_id: doc_id
                }, "done processing");
                return markAsChecked();
              });
            });
          });
        });
      });
    },
    finaliseIfNeeded: function(project_id, doc_id, pack_id, pack, callback) {
      var age, archive_threshold, n, sz;
      sz = pack.sz / (1024 * 1024);
      n = pack.n / 1024;
      age = (Date.now() - pack.meta.end_ts) / DAYS;
      if (age < 30) {
        logger.log({
          project_id: project_id,
          doc_id: doc_id,
          pack_id: pack_id,
          age: age
        }, "less than 30 days old");
        return callback();
      }
      archive_threshold = 30 / age;
      if (sz > archive_threshold || n > archive_threshold || age > 90) {
        logger.log({
          project_id: project_id,
          doc_id: doc_id,
          pack_id: pack_id,
          age: age,
          archive_threshold: archive_threshold,
          sz: sz,
          n: n
        }, "meets archive threshold");
        return PackManager.markPackAsFinalisedWithLock(project_id, doc_id, pack_id, callback);
      } else {
        logger.log({
          project_id: project_id,
          doc_id: doc_id,
          pack_id: pack_id,
          age: age,
          archive_threshold: archive_threshold,
          sz: sz,
          n: n
        }, "does not meet archive threshold");
        return callback();
      }
    },
    markPackAsFinalisedWithLock: function(project_id, doc_id, pack_id, callback) {
      return LockManager.runWithLock(keys.historyLock({
        doc_id: doc_id
      }), function(releaseLock) {
        return PackManager._markPackAsFinalised(project_id, doc_id, pack_id, releaseLock);
      }, callback);
    },
    _markPackAsFinalised: function(project_id, doc_id, pack_id, callback) {
      logger.log({
        project_id: project_id,
        doc_id: doc_id,
        pack_id: pack_id
      }, "marking pack as finalised");
      return db.docHistory.findAndModify({
        query: {
          _id: pack_id
        },
        update: {
          $set: {
            finalised: true
          }
        }
      }, callback);
    },
    updateIndexIfNeeded: function(project_id, doc_id, callback) {
      logger.log({
        project_id: project_id,
        doc_id: doc_id
      }, "archiving old packs");
      return PackManager.getIndexWithKeys(doc_id, function(err, index) {
        if (err != null) {
          return callback(err);
        }
        if (index == null) {
          return PackManager.initialiseIndex(project_id, doc_id, callback);
        } else {
          return PackManager.updateIndex(project_id, doc_id, callback);
        }
      });
    },
    markPackAsChecked: function(project_id, doc_id, pack_id, callback) {
      logger.log({
        project_id: project_id,
        doc_id: doc_id,
        pack_id: pack_id
      }, "marking pack as checked");
      return db.docHistory.findAndModify({
        query: {
          _id: pack_id
        },
        update: {
          $currentDate: {
            "last_checked": true
          }
        }
      }, callback);
    },
    findUnarchivedPacks: function(project_id, doc_id, callback) {
      return PackManager.getIndex(doc_id, function(err, indexResult) {
        var indexPacks, pack, unArchivedPacks;
        if (err != null) {
          return callback(err);
        }
        indexPacks = (indexResult != null ? indexResult.packs : void 0) || [];
        unArchivedPacks = (function() {
          var j, len, results;
          results = [];
          for (j = 0, len = indexPacks.length; j < len; j++) {
            pack = indexPacks[j];
            if (pack.inS3 == null) {
              results.push(pack);
            }
          }
          return results;
        })();
        if (unArchivedPacks.length) {
          logger.log({
            project_id: project_id,
            doc_id: doc_id,
            n: unArchivedPacks.length
          }, "find unarchived packs");
        }
        return callback(null, unArchivedPacks);
      });
    },
    checkArchiveNotInProgress: function(project_id, doc_id, pack_id, callback) {
      logger.log({
        project_id: project_id,
        doc_id: doc_id,
        pack_id: pack_id
      }, "checking if archive in progress");
      return PackManager.getPackFromIndex(doc_id, pack_id, function(err, result) {
        if (err != null) {
          return callback(err);
        }
        if (result == null) {
          return callback(new Error("pack not found in index"));
        }
        if (result.inS3) {
          return callback(new Error("pack archiving already done"));
        } else if (result.inS3 != null) {
          return callback(new Error("pack archiving already in progress"));
        } else {
          return callback();
        }
      });
    },
    markPackAsArchiveInProgress: function(project_id, doc_id, pack_id, callback) {
      logger.log({
        project_id: project_id,
        doc_id: doc_id
      }, "marking pack as archive in progress status");
      return db.docHistoryIndex.findAndModify({
        query: {
          _id: ObjectId(doc_id.toString()),
          packs: {
            $elemMatch: {
              "_id": pack_id,
              inS3: {
                $exists: false
              }
            }
          }
        },
        fields: {
          "packs.$": 1
        },
        update: {
          $set: {
            "packs.$.inS3": false
          }
        }
      }, function(err, result) {
        if (err != null) {
          return callback(err);
        }
        if (result == null) {
          return callback(new Error("archive is already in progress"));
        }
        logger.log({
          project_id: project_id,
          doc_id: doc_id,
          pack_id: pack_id
        }, "marked as archive in progress");
        return callback();
      });
    },
    clearPackAsArchiveInProgress: function(project_id, doc_id, pack_id, callback) {
      logger.log({
        project_id: project_id,
        doc_id: doc_id,
        pack_id: pack_id
      }, "clearing as archive in progress");
      return db.docHistoryIndex.findAndModify({
        query: {
          _id: ObjectId(doc_id.toString()),
          "packs": {
            $elemMatch: {
              "_id": pack_id,
              inS3: false
            }
          }
        },
        fields: {
          "packs.$": 1
        },
        update: {
          $unset: {
            "packs.$.inS3": true
          }
        }
      }, callback);
    },
    markPackAsArchived: function(project_id, doc_id, pack_id, callback) {
      logger.log({
        project_id: project_id,
        doc_id: doc_id,
        pack_id: pack_id
      }, "marking pack as archived");
      return db.docHistoryIndex.findAndModify({
        query: {
          _id: ObjectId(doc_id.toString()),
          "packs": {
            $elemMatch: {
              "_id": pack_id,
              inS3: false
            }
          }
        },
        fields: {
          "packs.$": 1
        },
        update: {
          $set: {
            "packs.$.inS3": true
          }
        }
      }, function(err, result) {
        if (err != null) {
          return callback(err);
        }
        if (result == null) {
          return callback(new Error("archive is not marked as progress"));
        }
        logger.log({
          project_id: project_id,
          doc_id: doc_id,
          pack_id: pack_id
        }, "marked as archived");
        return callback();
      });
    },
    setTTLOnArchivedPack: function(project_id, doc_id, pack_id, callback) {
      return db.docHistory.findAndModify({
        query: {
          _id: pack_id
        },
        update: {
          $set: {
            expiresAt: new Date(Date.now() + 1 * DAYS)
          }
        }
      }, function(err) {
        logger.log({
          project_id: project_id,
          doc_id: doc_id,
          pack_id: pack_id
        }, "set expiry on pack");
        return callback();
      });
    }
  };

}).call(this);

//# sourceMappingURL=PackManager.js.map
