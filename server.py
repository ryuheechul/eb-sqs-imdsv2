# based on https://blog.anvileight.com/posts/simple-python-http-server/

from http.server import HTTPServer, BaseHTTPRequestHandler
from tasks import add

class SimpleHTTPRequestHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        result = add(4,4)
        encoded_result = str.encode(
            str(result)
        )

        self.send_response(200)
        self.end_headers()
        self.wfile.write(
            encoded_result
        )

httpd = HTTPServer(('0.0.0.0', 8000), SimpleHTTPRequestHandler)

print("start serving on 0.0.0.0:8000")

httpd.serve_forever()
