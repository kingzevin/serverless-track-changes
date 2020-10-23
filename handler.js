'use strict'
// environment variables specified by the user
process.env["WEB_API_HOST"] = '172.17.0.1'; // track-changes.config.envs
process.env["WEB_HOST"] = '172.17.0.1';
process.env["SHARELATEX_MONGO_URL"] = "mongodb://172.17.0.1/sharelatex";
process.env["MONGO_HOST"] = '172.17.0.1';
process.env["SHARELATEX_REDIS_HOST"] = '172.17.0.1';
process.env["REDIS_HOST"] = '172.17.0.1';
process.env["TAGS_HOST"] = '172.17.0.1';
process.env["CLSI_HOST"] = '172.17.0.1';
process.env["CHAT_HOST"] = '172.17.0.1';
process.env["DOCSTORE_HOST"] = '172.17.0.1';
process.env["SPELLING_HOST"] = '172.17.0.1';
process.env["FILESTORE_HOST"] = '172.17.0.1';
process.env["DOCUMENT_UPDATER_HOST"] = '172.17.0.1';
process.env["NOTIFICATIONS_HOST"] = '172.17.0.1';
process.env["CONTACTS_HOST"] = '172.17.0.1';
process.env["LISTEN_ADDRESS"] = '0.0.0.0';
process.env["REALTIME_HOST"] = '172.17.0.1';
process.env["TRACK_CHANGES_HOST"] = '172.17.0.1';
process.env["ENABLE_CONVERSIONS"] = 'true';
process.env["WEB_API_USER"] = 'sharelatex';
process.env["ENABLED_LINKED_FILE_TYPES"] = 'url;project_file';
process.env["SHARELATEX_APP_NAME"] = 'Overleaf Community Edition';
process.env["APP_NAME"] = 'Overleaf Community Edition';
process.env["WEB_API_PASSWORD"] = 'rAp8aFvtk77m20PG6Kedzt3iOOrWKJ3pL5eiaQsP6s';
process.env["SESSION_SECRET"] = 'K1pOaUSsFIoXADLUIgtIh4toKBzgoZS1vHRXNySWQc';
process.env["SHARELATEX_SESSION_SECRET"] = 'K1pOaUSsFIoXADLUIgtIh4toKBzgoZS1vHRXNySWQc';
process.env["SHARELATEX_CONFIG"] = __dirname + '/settings.coffee';
process.env['WEB_URL'] = 'http://172.17.0.1:10001/api/v1/web/guest/sharelatex/web'
process.env['DOOCUMENT_UPDATER_URL'] = 'http://172.17.0.1:10001/api/v1/web/guest/sharelatex/document-updater'// the user should specify the express listener
const expressListener = require('./app.js') // track-changes.express.object

const owServerlessExpress = require('./owServerlessExpress.js')

exports.main = function(params){
  return owServerlessExpress(expressListener, params)
}