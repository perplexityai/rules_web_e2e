import {createServer} from 'node:http'

createServer((_, response) => {
  response.setHeader('content-type', 'text/html')
  response.end(
    '<button style="width:200px;height:80px" onclick="this.textContent=\'Saved\'">Save</button>'
  )
}).listen(Number(process.env.PORT), '127.0.0.1')
