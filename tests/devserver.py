"""Static server for development that never lets the browser cache a module,
and that answers Range requests.

Two things the stdlib handler gets wrong for this app:

1. It sends Last-Modified, and the browser then serves a stale ES module out of
   memory cache — which makes every edit look like it did nothing. So: no-store
   on everything.

2. It ignores `Range:` and answers 200 with the whole body. That is legal, and
   RemoteFile even handles it — but it handles it by downloading the file once
   and slicing locally, which is precisely what this project exists not to do.
   Answering 206 makes the local server behave like SharePoint's pre-authed
   download URLs, so the lazy-read path can be driven against a real 2.3 GB
   project without copying or downloading a byte of it.
"""
import os
import re
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

RANGE_RE = re.compile(r"^bytes=(\d*)-(\d*)$")


class DevHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.send_header("Accept-Ranges", "bytes")
        # The portal embed reads a project cross-origin; mirroring that here
        # means a CORS mistake shows up locally rather than in production.
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Expose-Headers",
                         "content-range, content-length")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "range, content-type")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def send_head(self):
        rng = self.headers.get("Range")
        if not rng:
            return super().send_head()

        path = self.translate_path(self.path)
        if os.path.isdir(path) or not os.path.isfile(path):
            return super().send_head()

        m = RANGE_RE.match(rng.strip())
        if not m:
            return super().send_head()

        size = os.path.getsize(path)
        first, last = m.group(1), m.group(2)
        if first == "":
            # "bytes=-500" means the LAST 500 bytes, not the first 500.
            if last == "":
                return super().send_head()
            length = min(int(last), size)
            start = size - length
            end = size - 1
        else:
            start = int(first)
            end = int(last) if last else size - 1
            if start >= size:
                self.send_response(416)
                self.send_header("Content-Range", "bytes */%d" % size)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return None
            end = min(end, size - 1)

        f = open(path, "rb")
        f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        return _Slice(f, end - start + 1)

    def log_message(self, fmt, *args):
        if "404" in (fmt % args):
            sys.stderr.write("404 %s\n" % (args[0] if args else ""))


class _Slice:
    """A read-only window onto an open file, for copyfile()."""

    def __init__(self, f, length):
        self._f = f
        self._left = length

    def read(self, n=-1):
        if self._left <= 0:
            return b""
        if n is None or n < 0:
            n = self._left
        data = self._f.read(min(n, self._left))
        self._left -= len(data)
        return data

    def close(self):
        self._f.close()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8791
    root = sys.argv[2] if len(sys.argv) > 2 else "."
    os.chdir(root)
    ThreadingHTTPServer(("127.0.0.1", port), DevHandler).serve_forever()
