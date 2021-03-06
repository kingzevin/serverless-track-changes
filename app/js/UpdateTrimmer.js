// Generated by CoffeeScript 1.12.4
(function() {
  var MongoManager, UpdateTrimmer, WebApiManager, logger;

  MongoManager = require("./MongoManager");

  WebApiManager = require("./WebApiManager");

  logger = require("logger-sharelatex");

  module.exports = UpdateTrimmer = {
    shouldTrimUpdates: function(project_id, callback) {
      if (callback == null) {
        callback = function(error, shouldTrim) {};
      }
      return MongoManager.getProjectMetaData(project_id, function(error, metadata) {
        if (error != null) {
          return callback(error);
        }
        if (metadata != null ? metadata.preserveHistory : void 0) {
          return callback(null, false);
        } else {
          return WebApiManager.getProjectDetails(project_id, function(error, details) {
            var ref;
            if (error != null) {
              return callback(error);
            }
            logger.log({
              project_id: project_id,
              details: details
            }, "got details");
            if (details != null ? (ref = details.features) != null ? ref.versioning : void 0 : void 0) {
              return MongoManager.setProjectMetaData(project_id, {
                preserveHistory: true
              }, function(error) {
                if (error != null) {
                  return callback(error);
                }
                return MongoManager.upgradeHistory(project_id, function(error) {
                  if (error != null) {
                    return callback(error);
                  }
                  return callback(null, false);
                });
              });
            } else {
              return callback(null, true);
            }
          });
        }
      });
    }
  };

}).call(this);

//# sourceMappingURL=UpdateTrimmer.js.map
