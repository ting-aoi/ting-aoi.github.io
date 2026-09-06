package tw.ting.futaba.bookshelf;

import java.io.*;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.Executor;

/**
 * 最小 HTTP 傳輸層 — 取代 com.sun.net.httpserver。
 *
 * 為什麼需要這個：{@code com.sun.net.httpserver} 是 JDK 的模組，**Android 執行期沒有**。
 * 原本 FileApiServer 直接用它，在桌面 JDK 上跑得好好的（server-test 25 項全過），
 * 一進 Android 編譯就是 "package com.sun.net.httpserver does not exist"。
 *
 * 對策：在同一個套件內提供同形狀的 HttpServer / HttpExchange / Headers / HttpHandler，
 * 底層改用 java.net.ServerSocket（Android 有）。FileApiServer 只要拿掉兩行 import，
 * 其餘 handler 與 multipart 解析邏輯一行都不用動——現有 25 項測試因此仍是有效的安全網。
 *
 * 範圍刻意極小：只支援本專案用到的那 13 個方法，且只綁 127.0.0.1。
 * 每個請求處理完即關閉連線（Connection: close）——localhost 建連線成本極低，
 * 不值得為 keep-alive 增加狀態機複雜度。
 */
final class MiniHttp {

    /** 與 com.sun 同名同形狀的函式介面，讓 {@code this::handleApi} 這種方法參考照舊可用。 */
    interface HttpHandler {
        void handle(HttpExchange ex) throws IOException;
    }

    /** 標頭集合：名稱一律不分大小寫。 */
    static final class Headers {
        private final Map<String, List<String>> map = new LinkedHashMap<>();

        void add(String name, String value) {
            map.computeIfAbsent(name.toLowerCase(Locale.ROOT), k -> new ArrayList<>()).add(value);
        }

        String getFirst(String name) {
            List<String> v = map.get(name.toLowerCase(Locale.ROOT));
            return (v == null || v.isEmpty()) ? null : v.get(0);
        }

        /** 供回應階段輸出；保留原始大小寫不重要，HTTP 標頭本就不分大小寫。 */
        Map<String, List<String>> entries() { return map; }
    }

    static final class HttpExchange {
        private final String method;
        private final URI uri;
        private final Headers reqHeaders;
        private final InputStream reqBody;
        private final Headers resHeaders = new Headers();
        private final OutputStream raw;
        private final Socket socket;
        private boolean headersSent = false;
        private boolean closed = false;
        private OutputStream resBody;

        private HttpExchange(String method, URI uri, Headers reqHeaders,
                             InputStream reqBody, OutputStream raw, Socket socket) {
            this.method = method;
            this.uri = uri;
            this.reqHeaders = reqHeaders;
            this.reqBody = reqBody;
            this.raw = raw;
            this.socket = socket;
        }

        String getRequestMethod()   { return method; }
        URI getRequestURI()         { return uri; }
        Headers getRequestHeaders() { return reqHeaders; }
        InputStream getRequestBody(){ return reqBody; }
        Headers getResponseHeaders(){ return resHeaders; }

        /**
         * @param len 大於 0＝明確 Content-Length；等於 0＝空 body；小於 0＝完全沒有 body（如 204）。
         *            這裡與 com.sun 的「0 代表長度未知走 chunked」不同——本專案只用到明確長度
         *            與 -1 兩種，寫成 Content-Length: 0 更單純且語意正確。
         */
        void sendResponseHeaders(int code, long len) throws IOException {
            if (headersSent) return;
            headersSent = true;
            StringBuilder sb = new StringBuilder();
            sb.append("HTTP/1.1 ").append(code).append(' ').append(reason(code)).append("\r\n");
            for (Map.Entry<String, List<String>> e : resHeaders.entries().entrySet())
                for (String v : e.getValue())
                    sb.append(e.getKey()).append(": ").append(v).append("\r\n");
            if (len >= 0) sb.append("Content-Length: ").append(len).append("\r\n");
            sb.append("Connection: close\r\n\r\n");
            raw.write(sb.toString().getBytes(StandardCharsets.ISO_8859_1));
            raw.flush();
        }

        OutputStream getResponseBody() {
            if (resBody == null) {
                // 包一層：handler 慣用 try-with-resources，關掉 body 不該關掉底層 socket，
                // 真正的收尾統一由 close() 負責。
                resBody = new FilterOutputStream(raw) {
                    @Override public void write(byte[] b, int off, int n) throws IOException {
                        out.write(b, off, n);   // 避免 FilterOutputStream 逐位元組轉發
                    }
                    @Override public void close() throws IOException { flush(); }
                };
            }
            return resBody;
        }

        void close() {
            if (closed) return;
            closed = true;
            try { raw.flush(); } catch (IOException ignored) {}
            try { socket.close(); } catch (IOException ignored) {}
        }

        private static String reason(int code) {
            switch (code) {
                case 200: return "OK";
                case 204: return "No Content";
                case 400: return "Bad Request";
                case 404: return "Not Found";
                case 405: return "Method Not Allowed";
                case 500: return "Internal Server Error";
                default:  return "Status";
            }
        }
    }

    static final class HttpServer {
        private final ServerSocket serverSocket;
        private final NavigableMap<String, HttpHandler> contexts =
                new TreeMap<>(Comparator.reverseOrder());   // 反序＝最長前綴優先命中
        private Executor executor;
        private volatile boolean running = false;
        private Thread acceptThread;

        private HttpServer(ServerSocket ss) { this.serverSocket = ss; }

        /** 綁不上就丟 IOException，讓呼叫端的埠號掃描迴圈照舊運作。 */
        static HttpServer create(InetSocketAddress addr, int backlog) throws IOException {
            ServerSocket ss = new ServerSocket();
            ss.setReuseAddress(true);
            ss.bind(addr, backlog > 0 ? backlog : 50);
            return new HttpServer(ss);
        }

        void createContext(String path, HttpHandler h) { contexts.put(path, h); }
        void setExecutor(Executor e) { this.executor = e; }

        void start() {
            running = true;
            acceptThread = new Thread(this::acceptLoop, "MiniHttp-accept");
            acceptThread.setDaemon(true);
            acceptThread.start();
        }

        void stop(int delaySeconds) {
            running = false;
            try { serverSocket.close(); } catch (IOException ignored) {}
        }

        int getPort() { return serverSocket.getLocalPort(); }

        private void acceptLoop() {
            while (running) {
                final Socket s;
                try { s = serverSocket.accept(); }
                catch (IOException e) { if (running) continue; else break; }
                Runnable job = () -> serve(s);
                if (executor != null) executor.execute(job); else job.run();
            }
        }

        private void serve(Socket s) {
            HttpExchange ex = null;
            try {
                s.setTcpNoDelay(true);
                InputStream in = new BufferedInputStream(s.getInputStream());
                OutputStream out = new BufferedOutputStream(s.getOutputStream());

                String requestLine = readLine(in);
                if (requestLine == null || requestLine.isEmpty()) { s.close(); return; }
                String[] parts = requestLine.split(" ");
                if (parts.length < 2) { s.close(); return; }
                String method = parts[0];
                String target = parts[1];

                Headers reqHeaders = new Headers();
                String line;
                while ((line = readLine(in)) != null && !line.isEmpty()) {
                    int c = line.indexOf(':');
                    if (c > 0) reqHeaders.add(line.substring(0, c).trim(), line.substring(c + 1).trim());
                }

                long clen = 0;
                String cl = reqHeaders.getFirst("Content-Length");
                if (cl != null) { try { clen = Long.parseLong(cl.trim()); } catch (NumberFormatException ignored) {} }

                URI uri;
                try { uri = new URI(target); }
                catch (Exception e) { uri = URI.create("/"); }

                ex = new HttpExchange(method, uri, reqHeaders, new BoundedInput(in, clen), out, s);

                HttpHandler h = matchContext(uri.getPath());
                if (h == null) {
                    ex.sendResponseHeaders(404, 0);
                } else {
                    h.handle(ex);
                }
            } catch (Throwable t) {
                if (ex != null) {
                    try { ex.sendResponseHeaders(500, 0); } catch (IOException ignored) {}
                }
            } finally {
                if (ex != null) ex.close();
                else try { s.close(); } catch (IOException ignored) {}
            }
        }

        /** 最長前綴命中（contexts 為反序 TreeMap，第一個符合的就是最長的）。 */
        private HttpHandler matchContext(String path) {
            if (path == null) path = "/";
            for (Map.Entry<String, HttpHandler> e : contexts.entrySet())
                if (path.startsWith(e.getKey())) return e.getValue();
            return null;
        }

        private static String readLine(InputStream in) throws IOException {
            ByteArrayOutputStream bos = new ByteArrayOutputStream(128);
            int c, prev = -1;
            while ((c = in.read()) != -1) {
                if (c == '\n') {
                    byte[] b = bos.toByteArray();
                    int n = b.length;
                    if (n > 0 && b[n - 1] == '\r') n--;      // 去掉 CR
                    return new String(b, 0, n, StandardCharsets.ISO_8859_1);
                }
                bos.write(c);
                prev = c;
            }
            return bos.size() == 0 ? null : bos.toString("ISO-8859-1");
        }
    }

    /** 依 Content-Length 截斷的輸入串流：讓 handler 的 readAll() 讀到本次請求結束就停。 */
    private static final class BoundedInput extends InputStream {
        private final InputStream in;
        private long remaining;

        BoundedInput(InputStream in, long len) { this.in = in; this.remaining = len; }

        @Override public int read() throws IOException {
            if (remaining <= 0) return -1;
            int c = in.read();
            if (c >= 0) remaining--;
            return c;
        }

        @Override public int read(byte[] b, int off, int len) throws IOException {
            if (remaining <= 0) return -1;
            int n = in.read(b, off, (int) Math.min(len, remaining));
            if (n > 0) remaining -= n;
            return n;
        }

        /** handler 的 readAll() 會呼叫 close()——但底層連線要留給回應用，故不真的關。 */
        @Override public void close() { }
    }

    private MiniHttp() {}
}
