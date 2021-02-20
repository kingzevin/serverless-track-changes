// Generated by CoffeeScript 1.12.4
(function() {
  var UpdateCompressor, diff_match_patch, dmp, oneMinute, strInject, strRemove, twoMegabytes;

  strInject = function(s1, pos, s2) {
    return s1.slice(0, pos) + s2 + s1.slice(pos);
  };

  strRemove = function(s1, pos, length) {
    return s1.slice(0, pos) + s1.slice(pos + length);
  };

  diff_match_patch = require("../lib/diff_match_patch").diff_match_patch;

  dmp = new diff_match_patch();

  module.exports = UpdateCompressor = {
    NOOP: "noop",
    convertToSingleOpUpdates: function(updates) {
      var i, j, len, len1, op, ops, splitUpdates, update;
      splitUpdates = [];
      for (i = 0, len = updates.length; i < len; i++) {
        update = updates[i];
        ops = update.op.filter(function(o) {
          return (o.i != null) || (o.d != null);
        });
        if (ops.length === 0) {
          splitUpdates.push({
            op: UpdateCompressor.NOOP,
            meta: {
              start_ts: update.meta.start_ts || update.meta.ts,
              end_ts: update.meta.end_ts || update.meta.ts,
              user_id: update.meta.user_id
            },
            v: update.v
          });
        } else {
          for (j = 0, len1 = ops.length; j < len1; j++) {
            op = ops[j];
            splitUpdates.push({
              op: op,
              meta: {
                start_ts: update.meta.start_ts || update.meta.ts,
                end_ts: update.meta.end_ts || update.meta.ts,
                user_id: update.meta.user_id
              },
              v: update.v
            });
          }
        }
      }
      return splitUpdates;
    },
    concatUpdatesWithSameVersion: function(updates) {
      var concattedUpdates, i, lastUpdate, len, nextUpdate, update;
      concattedUpdates = [];
      for (i = 0, len = updates.length; i < len; i++) {
        update = updates[i];
        lastUpdate = concattedUpdates[concattedUpdates.length - 1];
        if ((lastUpdate != null) && lastUpdate.v === update.v) {
          if (update.op !== UpdateCompressor.NOOP) {
            lastUpdate.op.push(update.op);
          }
        } else {
          nextUpdate = {
            op: [],
            meta: update.meta,
            v: update.v
          };
          if (update.op !== UpdateCompressor.NOOP) {
            nextUpdate.op.push(update.op);
          }
          concattedUpdates.push(nextUpdate);
        }
      }
      return concattedUpdates;
    },
    compressRawUpdates: function(lastPreviousUpdate, rawUpdates) {
      var ref, updates;
      if ((lastPreviousUpdate != null ? (ref = lastPreviousUpdate.op) != null ? ref.length : void 0 : void 0) > 1) {
        return [lastPreviousUpdate].concat(UpdateCompressor.compressRawUpdates(null, rawUpdates));
      }
      if (lastPreviousUpdate != null) {
        rawUpdates = [lastPreviousUpdate].concat(rawUpdates);
      }
      updates = UpdateCompressor.convertToSingleOpUpdates(rawUpdates);
      updates = UpdateCompressor.compressUpdates(updates);
      return UpdateCompressor.concatUpdatesWithSameVersion(updates);
    },
    compressUpdates: function(updates) {
      var compressedUpdates, i, lastCompressedUpdate, len, update;
      if (updates.length === 0) {
        return [];
      }
      compressedUpdates = [updates.shift()];
      for (i = 0, len = updates.length; i < len; i++) {
        update = updates[i];
        lastCompressedUpdate = compressedUpdates.pop();
        if (lastCompressedUpdate != null) {
          compressedUpdates = compressedUpdates.concat(UpdateCompressor._concatTwoUpdates(lastCompressedUpdate, update));
        } else {
          compressedUpdates.push(update);
        }
      }
      return compressedUpdates;
    },
    MAX_TIME_BETWEEN_UPDATES: oneMinute = 60 * 1000,
    MAX_UPDATE_SIZE: twoMegabytes = 2 * 1024 * 1024,
    _concatTwoUpdates: function(firstUpdate, secondUpdate) {
      var diff_ops, firstOp, firstSize, insert, insertedText, offset, ref, ref1, ref2, ref3, ref4, ref5, ref6, secondOp, secondSize;
      firstUpdate = {
        op: firstUpdate.op,
        meta: {
          user_id: firstUpdate.meta.user_id || null,
          start_ts: firstUpdate.meta.start_ts || firstUpdate.meta.ts,
          end_ts: firstUpdate.meta.end_ts || firstUpdate.meta.ts
        },
        v: firstUpdate.v
      };
      secondUpdate = {
        op: secondUpdate.op,
        meta: {
          user_id: secondUpdate.meta.user_id || null,
          start_ts: secondUpdate.meta.start_ts || secondUpdate.meta.ts,
          end_ts: secondUpdate.meta.end_ts || secondUpdate.meta.ts
        },
        v: secondUpdate.v
      };
      if (firstUpdate.meta.user_id !== secondUpdate.meta.user_id) {
        return [firstUpdate, secondUpdate];
      }
      if (secondUpdate.meta.start_ts - firstUpdate.meta.end_ts > UpdateCompressor.MAX_TIME_BETWEEN_UPDATES) {
        return [firstUpdate, secondUpdate];
      }
      firstOp = firstUpdate.op;
      secondOp = secondUpdate.op;
      firstSize = ((ref = firstOp.i) != null ? ref.length : void 0) || ((ref1 = firstOp.d) != null ? ref1.length : void 0);
      secondSize = ((ref2 = secondOp.i) != null ? ref2.length : void 0) || ((ref3 = secondOp.d) != null ? ref3.length : void 0);
      if ((firstOp.i != null) && (secondOp.i != null) && (firstOp.p <= (ref4 = secondOp.p) && ref4 <= (firstOp.p + firstOp.i.length)) && firstSize + secondSize < UpdateCompressor.MAX_UPDATE_SIZE) {
        return [
          {
            meta: {
              start_ts: firstUpdate.meta.start_ts,
              end_ts: secondUpdate.meta.end_ts,
              user_id: firstUpdate.meta.user_id
            },
            op: {
              p: firstOp.p,
              i: strInject(firstOp.i, secondOp.p - firstOp.p, secondOp.i)
            },
            v: secondUpdate.v
          }
        ];
      } else if ((firstOp.d != null) && (secondOp.d != null) && (secondOp.p <= (ref5 = firstOp.p) && ref5 <= (secondOp.p + secondOp.d.length)) && firstSize + secondSize < UpdateCompressor.MAX_UPDATE_SIZE) {
        return [
          {
            meta: {
              start_ts: firstUpdate.meta.start_ts,
              end_ts: secondUpdate.meta.end_ts,
              user_id: firstUpdate.meta.user_id
            },
            op: {
              p: secondOp.p,
              d: strInject(secondOp.d, firstOp.p - secondOp.p, firstOp.d)
            },
            v: secondUpdate.v
          }
        ];
      } else if ((firstOp.i != null) && (secondOp.d != null) && (firstOp.p <= (ref6 = secondOp.p) && ref6 <= (firstOp.p + firstOp.i.length))) {
        offset = secondOp.p - firstOp.p;
        insertedText = firstOp.i.slice(offset, offset + secondOp.d.length);
        if (insertedText === secondOp.d) {
          insert = strRemove(firstOp.i, offset, secondOp.d.length);
          return [
            {
              meta: {
                start_ts: firstUpdate.meta.start_ts,
                end_ts: secondUpdate.meta.end_ts,
                user_id: firstUpdate.meta.user_id
              },
              op: {
                p: firstOp.p,
                i: insert
              },
              v: secondUpdate.v
            }
          ];
        } else {
          return [firstUpdate, secondUpdate];
        }
      } else if ((firstOp.d != null) && (secondOp.i != null) && firstOp.p === secondOp.p) {
        offset = firstOp.p;
        diff_ops = this.diffAsShareJsOps(firstOp.d, secondOp.i);
        if (diff_ops.length === 0) {
          return [
            {
              meta: {
                start_ts: firstUpdate.meta.start_ts,
                end_ts: secondUpdate.meta.end_ts,
                user_id: firstUpdate.meta.user_id
              },
              op: {
                p: firstOp.p,
                i: ""
              },
              v: secondUpdate.v
            }
          ];
        } else {
          return diff_ops.map(function(op) {
            op.p += offset;
            return {
              meta: {
                start_ts: firstUpdate.meta.start_ts,
                end_ts: secondUpdate.meta.end_ts,
                user_id: firstUpdate.meta.user_id
              },
              op: op,
              v: secondUpdate.v
            };
          });
        }
      } else {
        return [firstUpdate, secondUpdate];
      }
    },
    ADDED: 1,
    REMOVED: -1,
    UNCHANGED: 0,
    diffAsShareJsOps: function(before, after, callback) {
      var content, diff, diffs, i, len, ops, position, type;
      if (callback == null) {
        callback = function(error, ops) {};
      }
      diffs = dmp.diff_main(before, after);
      dmp.diff_cleanupSemantic(diffs);
      ops = [];
      position = 0;
      for (i = 0, len = diffs.length; i < len; i++) {
        diff = diffs[i];
        type = diff[0];
        content = diff[1];
        if (type === this.ADDED) {
          ops.push({
            i: content,
            p: position
          });
          position += content.length;
        } else if (type === this.REMOVED) {
          ops.push({
            d: content,
            p: position
          });
        } else if (type === this.UNCHANGED) {
          position += content.length;
        } else {
          throw "Unknown type";
        }
      }
      return ops;
    }
  };

}).call(this);

//# sourceMappingURL=UpdateCompressor.js.map