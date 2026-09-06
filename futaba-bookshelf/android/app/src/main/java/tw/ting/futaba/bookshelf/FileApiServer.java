package tw.ting.futaba.bookshelf;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.*;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

/**
 * 迷你檔案伺服器 — 提供與 shttps 相同的 /api/file/* 介面，並代管網頁資產。
 *
 * 設計原則：網頁端（storage.js）一行都不必改。所有路徑語意、狀態碼、回應格式
 * 都對齊 shttps 的 OpenAPI 規格：
 *   GET    /api/file/list?path=...        → JSON 陣列 [{name,length,modified,directory}]
 *   PUT    /api/file/upload?path=...      → multipart/form-data，欄位 files[]  → 204
 *   GET    /api/file/download?path=...    → 檔案內容 / 404
 *   DELETE /api/file/delete               → JSON {path, files[]}                → 204
 *   POST   /api/file/new-folder           → x-www-form-urlencoded {path, name}  → 204
 *   POST   /api/file/rename               → x-www-form-urlencoded {path, name}  → 204
 * 其餘路徑：代管網頁資產（APK assets 或資料目錄）。
 *
 * 安全性：只監聽 127.0.0.1，其他 App 無法存取；所有路徑經 resolveSafe() 檢查，
 * 阻擋 ../ 逸出根目錄。
 */
public class FileApiServer {

    public interface AssetReader {          // 由 Android 層注入（讀 APK 內的網頁資產）
        InputStream open(String relativePath) throws IOException;
    }

    private final File root;                // 資料根目錄（App 專屬目錄）
    private final AssetReader assets;       // 網頁資產來源；null = 從 root 讀
    private HttpServer server;
    private int port;

    public FileApiServer(File root, AssetReader assets) {
        this.root = root;
        this.assets = assets;
    }

    public int start(int preferredPort) throws IOException {
        IOException last = null;
        for (int p = preferredPort; p < preferredPort + 20; p++) {
            try {
                server = HttpServer.create(new InetSocketAddress("127.0.0.1", p), 0);
                port = p;
                break;
            } catch (IOException e) { last = e; }
        }
        if (server == null) throw (last != null ? last : new IOException("no port"));
        server.createContext("/api/file/", this::handleApi);
        server.createContext("/", this::handleStatic);
        server.setExecutor(java.util.concurrent.Executors.newFixedThreadPool(4));
        server.start();
        return port;
    }

    public void stop() { if (server != null) server.stop(0); }
    public int getPort() { return port; }

    // ── 路徑安全 ──────────────────────────────────────────────
    /** 將使用者提供的相對路徑解析為 root 底下的實體路徑；逸出則回傳 null。 */
    private File resolveSafe(String rel) {
        if (rel == null) rel = "";
        rel = rel.replace('\\', '/');
        while (rel.startsWith("/")) rel = rel.substring(1);
        File f = new File(root, rel);
        try {
            String rootPath = root.getCanonicalPath();
            String target = f.getCanonicalPath();
            if (!target.equals(rootPath) && !target.startsWith(rootPath + File.separator)) return null;
            return f;
        } catch (IOException e) { return null; }
    }

    // ── /api/file/* ───────────────────────────────────────────
    private void handleApi(HttpExchange ex) throws IOException {
        try {
            String path = ex.getRequestURI().getPath();
            String method = ex.getRequestMethod();
            Map<String, String> q = parseQuery(ex.getRequestURI().getRawQuery());

            if (path.endsWith("/list") && "GET".equals(method))                 { apiList(ex, q.get("path")); return; }
            if (path.endsWith("/upload") && ("PUT".equals(method) || "POST".equals(method))) { apiUpload(ex, q.get("path")); return; }
            if (path.endsWith("/download") && "GET".equals(method))             { apiDownload(ex, q.get("path")); return; }
            if (path.endsWith("/delete") && "DELETE".equals(method))            { apiDelete(ex); return; }
            if (path.endsWith("/new-folder") && "POST".equals(method))          { apiNewFolder(ex); return; }
            if (path.endsWith("/rename") && "POST".equals(method))              { apiRename(ex); return; }
            send(ex, 404, "text/plain", "Not found".getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            send(ex, 500, "text/plain", ("Error: " + e.getMessage()).getBytes(StandardCharsets.UTF_8));
        }
    }

    private void apiList(HttpExchange ex, String p) throws IOException {
        File dir = resolveSafe(p);
        if (dir == null || !dir.isDirectory()) { notFound(ex); return; }
        File[] fs = dir.listFiles();
        StringBuilder sb = new StringBuilder("[");
        if (fs != null) {
            Arrays.sort(fs, Comparator.comparing(File::getName));
            for (int i = 0; i < fs.length; i++) {
                File f = fs[i];
                if (i > 0) sb.append(',');
                sb.append("{\"name\":\"").append(jsonEsc(f.getName())).append('"')
                  .append(",\"length\":\"").append(humanSize(f.length())).append('"')
                  .append(",\"modified\":").append(f.lastModified())
                  .append(",\"directory\":").append(f.isDirectory())
                  .append('}');
            }
        }
        sb.append(']');
        send(ex, 200, "application/json", sb.toString().getBytes(StandardCharsets.UTF_8));
    }

    private void apiDownload(HttpExchange ex, String p) throws IOException {
        File f = resolveSafe(p);
        if (f == null || !f.isFile()) { notFound(ex); return; }
        byte[] data = readAll(new FileInputStream(f));
        send(ex, 200, mimeOf(f.getName()), data);
    }

    /** multipart/form-data 解析：取出 files[] 的每個 part，寫入 path 目錄。 */
    private void apiUpload(HttpExchange ex, String p) throws IOException {
        File dir = resolveSafe(p);
        if (dir == null) { send(ex, 400, "text/plain", "Bad path".getBytes()); return; }
        if (!dir.exists() && !dir.mkdirs()) { send(ex, 400, "text/plain", "mkdir failed".getBytes()); return; }

        String ctype = ex.getRequestHeaders().getFirst("Content-Type");
        if (ctype == null || !ctype.contains("boundary=")) { send(ex, 400, "text/plain", "No boundary".getBytes()); return; }
        String boundary = ctype.substring(ctype.indexOf("boundary=") + 9).trim();
        if (boundary.startsWith("\"")) boundary = boundary.substring(1, boundary.length() - 1);

        byte[] body = readAll(ex.getRequestBody());
        byte[] delim = ("--" + boundary).getBytes(StandardCharsets.ISO_8859_1);
        int count = 0;
        int pos = indexOf(body, delim, 0);
        while (pos >= 0) {
            int partStart = pos + delim.length;
            if (partStart + 2 <= body.length && body[partStart] == '-' && body[partStart + 1] == '-') break; // 結尾
            partStart += 2;                                            // 跳過 CRLF
            int headEnd = indexOf(body, "\r\n\r\n".getBytes(StandardCharsets.ISO_8859_1), partStart);
            if (headEnd < 0) break;
            String head = new String(body, partStart, headEnd - partStart, StandardCharsets.UTF_8);
            int next = indexOf(body, delim, headEnd + 4);
            if (next < 0) break;
            int dataStart = headEnd + 4;
            int dataEnd = next - 2;                                    // 去掉 part 尾端 CRLF
            if (dataEnd < dataStart) dataEnd = dataStart;

            String filename = headerParam(head, "filename");
            if (filename != null && !filename.isEmpty()) {
                filename = filename.replace('\\', '/');
                File out = new File(dir, filename);
                File parent = out.getParentFile();
                if (parent != null && !parent.exists()) parent.mkdirs();
                if (resolveSafe(relOf(out)) != null) {
                    try (FileOutputStream fos = new FileOutputStream(out)) {
                        fos.write(body, dataStart, dataEnd - dataStart);
                    }
                    count++;
                }
            }
            pos = next;
        }
        if (count == 0) { send(ex, 400, "text/plain", "No files".getBytes()); return; }
        send(ex, 204, null, new byte[0]);
    }

    private void apiDelete(HttpExchange ex) throws IOException {
        String body = new String(readAll(ex.getRequestBody()), StandardCharsets.UTF_8);
        String base = jsonString(body, "path");
        List<String> files = jsonStringArray(body, "files");
        File dir = resolveSafe(base);
        if (dir == null || !dir.exists()) { notFound(ex); return; }
        boolean any = false;
        for (String name : files) {
            File f = new File(dir, name);
            if (resolveSafe(relOf(f)) == null) continue;
            if (deleteRecursive(f)) any = true;
        }
        if (!any && !files.isEmpty()) { notFound(ex); return; }
        send(ex, 204, null, new byte[0]);
    }

    private void apiNewFolder(HttpExchange ex) throws IOException {
        Map<String, String> f = parseQuery(new String(readAll(ex.getRequestBody()), StandardCharsets.UTF_8));
        File parent = resolveSafe(f.get("path"));
        String name = f.get("name");
        if (parent == null || name == null || name.isEmpty()) { notFound(ex); return; }
        File dir = new File(parent, name);
        if (resolveSafe(relOf(dir)) == null) { notFound(ex); return; }
        if (!dir.exists()) dir.mkdirs();
        send(ex, 204, null, new byte[0]);
    }

    private void apiRename(HttpExchange ex) throws IOException {
        Map<String, String> f = parseQuery(new String(readAll(ex.getRequestBody()), StandardCharsets.UTF_8));
        File src = resolveSafe(f.get("path"));
        String name = f.get("name");
        if (src == null || !src.exists() || name == null || name.isEmpty()) { notFound(ex); return; }
        File dst = new File(src.getParentFile(), name);
        if (resolveSafe(relOf(dst)) == null) { notFound(ex); return; }
        src.renameTo(dst);
        send(ex, 204, null, new byte[0]);
    }

    // ── 靜態資產 ──────────────────────────────────────────────
    private void handleStatic(HttpExchange ex) throws IOException {
        String p = ex.getRequestURI().getPath();
        if (p.equals("/") || p.isEmpty()) p = "/index.html";
        String rel = p.startsWith("/") ? p.substring(1) : p;
        rel = URLDecoder.decode(rel, "UTF-8");

        // data/ 底下走實體檔案（書評資料）；其餘走網頁資產
        if (rel.startsWith("data/")) {
            File f = resolveSafe(rel);
            if (f == null || !f.isFile()) { notFound(ex); return; }
            send(ex, 200, mimeOf(rel), readAll(new FileInputStream(f)));
            return;
        }
        try {
            InputStream in = (assets != null) ? assets.open(rel) : new FileInputStream(resolveSafe(rel));
            byte[] data = readAll(in);
            ex.getResponseHeaders().add("Cache-Control", "no-cache");
            send(ex, 200, mimeOf(rel), data);
        } catch (IOException e) { notFound(ex); }
    }

    // ── 工具 ─────────────────────────────────────────────────
    private String relOf(File f) {
        try { return f.getCanonicalPath().substring(root.getCanonicalPath().length()); }
        catch (IOException e) { return "\u0000"; }   // 無法解析 → 必定被 resolveSafe 拒絕
    }

    private void notFound(HttpExchange ex) throws IOException {
        send(ex, 404, "text/plain", "Not found".getBytes(StandardCharsets.UTF_8));
    }

    private void send(HttpExchange ex, int code, String ctype, byte[] body) throws IOException {
        if (ctype != null) ex.getResponseHeaders().add("Content-Type", ctype);
        if (code == 204) { ex.sendResponseHeaders(204, -1); ex.close(); return; }
        ex.sendResponseHeaders(code, body.length);
        try (OutputStream os = ex.getResponseBody()) { os.write(body); }
    }

    static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
        in.close();
        return bos.toByteArray();
    }

    static Map<String, String> parseQuery(String q) {
        Map<String, String> m = new HashMap<>();
        if (q == null) return m;
        for (String pair : q.split("&")) {
            if (pair.isEmpty()) continue;
            int i = pair.indexOf('=');
            try {
                String k = URLDecoder.decode(i < 0 ? pair : pair.substring(0, i), "UTF-8");
                String v = i < 0 ? "" : URLDecoder.decode(pair.substring(i + 1), "UTF-8");
                m.put(k, v);
            } catch (UnsupportedEncodingException ignored) {}
        }
        return m;
    }

    static String headerParam(String head, String key) {
        int i = head.indexOf(key + "=\"");
        if (i < 0) return null;
        int s = i + key.length() + 2;
        int e = head.indexOf('"', s);
        return e < 0 ? null : head.substring(s, e);
    }

    static int indexOf(byte[] hay, byte[] needle, int from) {
        outer:
        for (int i = Math.max(0, from); i <= hay.length - needle.length; i++) {
            for (int j = 0; j < needle.length; j++) if (hay[i + j] != needle[j]) continue outer;
            return i;
        }
        return -1;
    }

    static boolean deleteRecursive(File f) {
        if (!f.exists()) return false;
        if (f.isDirectory()) {
            File[] kids = f.listFiles();
            if (kids != null) for (File k : kids) deleteRecursive(k);
        }
        return f.delete();
    }

    static String humanSize(long n) {
        if (n < 1024) return n + " B";
        if (n < 1024 * 1024) return String.format(Locale.US, "%.1f KB", n / 1024.0);
        return String.format(Locale.US, "%.1f MB", n / 1048576.0);
    }

    static String jsonEsc(String s) {
        StringBuilder sb = new StringBuilder();
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"':  sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n");  break;
                case '\r': sb.append("\\r");  break;
                case '\t': sb.append("\\t");  break;
                default:
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
            }
        }
        return sb.toString();
    }

    /** 極簡 JSON 取值：{"path":"/data"} → "/data"（本 App 的請求格式固定，夠用且無相依） */
    static String jsonString(String json, String key) {
        int i = json.indexOf("\"" + key + "\"");
        if (i < 0) return null;
        int c = json.indexOf(':', i);
        int s = json.indexOf('"', c + 1);
        if (s < 0) return null;
        StringBuilder sb = new StringBuilder();
        for (int p = s + 1; p < json.length(); p++) {
            char ch = json.charAt(p);
            if (ch == '\\' && p + 1 < json.length()) { sb.append(unesc(json.charAt(++p))); continue; }
            if (ch == '"') break;
            sb.append(ch);
        }
        return sb.toString();
    }

    static List<String> jsonStringArray(String json, String key) {
        List<String> out = new ArrayList<>();
        int i = json.indexOf("\"" + key + "\"");
        if (i < 0) return out;
        int start = json.indexOf('[', i);
        int end = json.indexOf(']', start);
        if (start < 0 || end < 0) return out;
        String body = json.substring(start + 1, end);
        boolean in = false;
        StringBuilder cur = new StringBuilder();
        for (int p = 0; p < body.length(); p++) {
            char ch = body.charAt(p);
            if (ch == '\\' && in && p + 1 < body.length()) { cur.append(unesc(body.charAt(++p))); continue; }
            if (ch == '"') {
                if (in) { out.add(cur.toString()); cur.setLength(0); in = false; }
                else in = true;
                continue;
            }
            if (in) cur.append(ch);
        }
        return out;
    }

    private static char unesc(char c) {
        switch (c) {
            case 'n': return '\n';
            case 'r': return '\r';
            case 't': return '\t';
            default:  return c;
        }
    }

    static String mimeOf(String name) {
        String n = name.toLowerCase(Locale.US);
        if (n.endsWith(".html")) return "text/html; charset=utf-8";
        if (n.endsWith(".js"))   return "application/javascript; charset=utf-8";
        if (n.endsWith(".css"))  return "text/css; charset=utf-8";
        if (n.endsWith(".json")) return "application/json; charset=utf-8";
        if (n.endsWith(".png"))  return "image/png";
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
        if (n.endsWith(".svg"))  return "image/svg+xml";
        if (n.endsWith(".woff2")) return "font/woff2";
        if (n.endsWith(".woff")) return "font/woff";
        if (n.endsWith(".md"))   return "text/markdown; charset=utf-8";
        return "application/octet-stream";
    }
}
