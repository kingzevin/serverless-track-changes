
const http = require('http')

// Unix Domain Socket
function getRandomSocket() {
  const socketPathSuffix = Math.random().toString(36).substring(2, 15)
  return `/tmp/server-${socketPathSuffix}.sock`
}

function startServer(expressListener, socketPath){
  return new Promise(function(resolve) {
    const server = http.createServer(expressListener);
    server.on('listening', () => {
      resolve(`listening on ${socketPath}`)
    } );
    server.listen(socketPath)
  });
}

function httpRequest(opt) {
  return new Promise(function(resolve) {
    var req = http.request(opt, function(response) {
      // cumulate data
      var buf = [];
      response.on('data', function(chunk) {
        buf.push(chunk);
      });
      response.on('end', function() {
        const body = Buffer.concat(buf).toString('utf8');
        const statusCode = response.statusCode
        const headers = response.headers
        const successResponse = { statusCode, body, headers}
        resolve(successResponse);
      });
    });
    req.on('error', function(err) {
      resolve({body: `error: err`, statusCode: 500});
    });
    if (opt['body']) {
        req.write(opt['body']);
    }
    // IMPORTANT
    req.end();
  });
}

async function owServerlessExpress(expressListener, params = {}){
  const opt = {}
  opt['path'] = params.__ow_path
  opt['method'] = params.__ow_method
  opt['headers'] = params.__ow_headers
  opt['socketPath'] = getRandomSocket()

  let buf = params.__ow_body || '';
  // body - base64
  if(buf !== '' && Buffer.from(buf, 'base64').toString('base64') === buf)
    buf = Buffer.from(buf, 'base64').toString('utf-8');
  opt['body'] = buf;
  if(opt['body'] != ''){
    // the content-length may be deleted by the openwhisk controller
    opt['headers']['Content-Length'] = Buffer.byteLength(opt['body'])
  }
  // query string
  if(params.__ow_query !== ''){
    const qs = '?' + params.__ow_query;
    opt['path'] += qs;
  }
  await startServer(expressListener, opt['socketPath']);
  const result = await httpRequest(opt);
  return result;
}

module.exports = owServerlessExpress