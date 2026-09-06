import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;

/** FileApiServer 行為測試 — 以真實 HTTP 請求驗證是否與 shttps API 規格一致。 */
public class ServerTest {
    static int pass = 0, fail = 0;
    static String base;

    static void chk(String name, boolean ok) {
        if (ok) pass++;
        else { fail++; System.out.println("  ✗ " + name); }
    }

    public static void main(String[] args) throws Exception {
        File root = Files.createTempDirectory("futaba-test").toFile();
        new File(root, "data").mkdirs();

        // 網頁資產來源：模擬 APK assets
        File assetDir = Files.createTempDirectory("futaba-assets").toFile();
        Files.write(new File(assetDir, "index.html").toPath(), "<h1>雙葉書庫</h1>".getBytes(StandardCharsets.UTF_8));
        new File(assetDir, "assets/js").mkdirs();
        Files.write(new File(assetDir, "assets/js/app.js").toPath(), "var FT={};".getBytes(StandardCharsets.UTF_8));

        tw.ting.futaba.bookshelf.FileApiServer srv = new tw.ting.futaba.bookshelf.FileApiServer(
                root, rel -> new FileInputStream(new File(assetDir, rel)));
        int port = srv.start(18080);
        base = "http://127.0.0.1:" + port;

        // ── 1. new-folder ──
        Resp r = req("POST", "/api/file/new-folder", "application/x-www-form-urlencoded",
                "path=data&name=books".getBytes(StandardCharsets.UTF_8));
        chk("new-folder 回 204", r.code == 204);
        chk("new-folder 實際建立目錄", new File(root, "data/books").isDirectory());

        // ── 2. upload（multipart，含中文內容與子路徑檔名）──
        String bookJson = "{\"id\":\"book-1\",\"title\":\"夜的命名術\",\"rating\":5}";
        r = multipartPut("/api/file/upload?path=data/books/", "book-1.json", bookJson);
        chk("upload 回 204", r.code == 204);
        File bf = new File(root, "data/books/book-1.json");
        chk("upload 實際寫檔", bf.isFile());
        chk("upload 內容完整（UTF-8 中文）",
                new String(Files.readAllBytes(bf.toPath()), StandardCharsets.UTF_8).equals(bookJson));

        // 多檔一次上傳
        r = multipartPut2("/api/file/upload?path=data/books/", "b2.json", "{\"id\":2}", "b3.json", "{\"id\":3}");
        chk("upload 多檔", r.code == 204 && new File(root, "data/books/b2.json").isFile()
                && new File(root, "data/books/b3.json").isFile());

        // ── 3. download ──
        r = req("GET", "/api/file/download?path=data/books/book-1.json", null, null);
        chk("download 回 200 且內容相符", r.code == 200 && r.text().equals(bookJson));
        r = req("GET", "/api/file/download?path=data/books/none.json", null, null);
        chk("download 不存在回 404", r.code == 404);

        // ── 4. list ──
        r = req("GET", "/api/file/list?path=" + enc("data/books"), null, null);
        String list = r.text();
        chk("list 回 200", r.code == 200);
        chk("list 含全部檔案", list.contains("book-1.json") && list.contains("b2.json") && list.contains("b3.json"));
        chk("list 欄位齊備（name/length/modified/directory）",
                list.contains("\"name\"") && list.contains("\"length\"")
             && list.contains("\"modified\"") && list.contains("\"directory\":false"));
        r = req("GET", "/api/file/list?path=" + enc("data/nope"), null, null);
        chk("list 不存在回 404", r.code == 404);

        // 目錄項目標記
        r = req("GET", "/api/file/list?path=data", null, null);
        chk("list 標記子目錄", r.text().contains("\"name\":\"books\"") && r.text().contains("\"directory\":true"));

        // ── 5. delete（JSON body）──
        r = req("DELETE", "/api/file/delete", "application/json",
                "{\"path\":\"data/books\",\"files\":[\"b2.json\",\"b3.json\"]}".getBytes(StandardCharsets.UTF_8));
        chk("delete 回 204", r.code == 204);
        chk("delete 實際刪除", !new File(root, "data/books/b2.json").exists()
                && !new File(root, "data/books/b3.json").exists());
        chk("delete 未波及其他檔案", new File(root, "data/books/book-1.json").isFile());

        // ── 6. 路徑逸出防護 ──
        r = req("GET", "/api/file/download?path=" + enc("../../etc/passwd"), null, null);
        chk("阻擋 ../ 逸出（download）", r.code == 404);
        r = multipartPut("/api/file/upload?path=" + enc("../escape"), "x.json", "{}");
        chk("阻擋 ../ 逸出（upload）", r.code != 204 || !new File(root.getParentFile(), "escape/x.json").exists());

        // ── 7. 靜態資產代管 ──
        r = req("GET", "/", null, null);
        chk("/ 提供 index.html", r.code == 200 && r.text().contains("雙葉書庫"));
        chk("index.html 為 UTF-8 HTML", r.ctype != null && r.ctype.contains("text/html"));
        r = req("GET", "/assets/js/app.js", null, null);
        chk("提供 JS 資產且 MIME 正確", r.code == 200 && r.ctype.contains("javascript"));
        r = req("GET", "/assets/js/none.js", null, null);
        chk("缺檔資產回 404", r.code == 404);

        // data/ 走實體檔案（網頁端以 /data/... 讀取）
        r = req("GET", "/data/books/book-1.json", null, null);
        chk("/data/ 路徑讀實體檔案", r.code == 200 && r.text().equals(bookJson));

        // ── 8. 覆寫（同名再上傳）──
        String updated = "{\"id\":\"book-1\",\"title\":\"夜的命名術\",\"rating\":4}";
        multipartPut("/api/file/upload?path=data/books/", "book-1.json", updated);
        chk("同名覆寫成功", new String(Files.readAllBytes(bf.toPath()), StandardCharsets.UTF_8).equals(updated));

        // ── 9. 大檔（模擬備份 JSON）──
        StringBuilder big = new StringBuilder("{\"data\":\"");
        for (int i = 0; i < 200000; i++) big.append('字');
        big.append("\"}");
        r = multipartPut("/api/file/upload?path=data/", "data.bak.2026-01-01.json", big.toString());
        File bigF = new File(root, "data/data.bak.2026-01-01.json");
        chk("大檔上傳完整（600KB UTF-8）", r.code == 204 && bigF.isFile()
                && new String(Files.readAllBytes(bigF.toPath()), StandardCharsets.UTF_8).equals(big.toString()));

        srv.stop();
        System.out.println("\n" + (fail == 0 ? "✓ 全部通過" : "✗ 失敗") + " — " + pass + " 通過 / " + fail + " 失敗");
        System.exit(fail == 0 ? 0 : 1);
    }

    // ── HTTP 工具 ──
    static String enc(String s) throws Exception { return URLEncoder.encode(s, "UTF-8"); }

    static class Resp { int code; byte[] body; String ctype;
        String text() { return new String(body, StandardCharsets.UTF_8); } }

    static Resp req(String method, String path, String ctype, byte[] body) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(base + path).openConnection();
        c.setRequestMethod(method);
        if (ctype != null) c.setRequestProperty("Content-Type", ctype);
        if (body != null) { c.setDoOutput(true); c.getOutputStream().write(body); }
        Resp r = new Resp();
        r.code = c.getResponseCode();
        r.ctype = c.getContentType();
        InputStream in = (r.code >= 400) ? c.getErrorStream() : c.getInputStream();
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        if (in != null) { byte[] bf = new byte[8192]; int n; while ((n = in.read(bf)) > 0) bo.write(bf, 0, n); in.close(); }
        r.body = bo.toByteArray();
        return r;
    }

    static Resp multipartPut(String path, String filename, String content) throws Exception {
        return multipartPut2(path, filename, content, null, null);
    }

    static Resp multipartPut2(String path, String f1, String c1, String f2, String c2) throws Exception {
        String b = "----futaba" + System.nanoTime();
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        appendPart(bos, b, f1, c1);
        if (f2 != null) appendPart(bos, b, f2, c2);
        bos.write(("--" + b + "--\r\n").getBytes(StandardCharsets.ISO_8859_1));
        return req("PUT", path, "multipart/form-data; boundary=" + b, bos.toByteArray());
    }

    static void appendPart(ByteArrayOutputStream bos, String boundary, String filename, String content) throws IOException {
        bos.write(("--" + boundary + "\r\n").getBytes(StandardCharsets.ISO_8859_1));
        bos.write(("Content-Disposition: form-data; name=\"files[]\"; filename=\"" + filename + "\"\r\n")
                .getBytes(StandardCharsets.UTF_8));
        bos.write("Content-Type: application/json\r\n\r\n".getBytes(StandardCharsets.ISO_8859_1));
        bos.write(content.getBytes(StandardCharsets.UTF_8));
        bos.write("\r\n".getBytes(StandardCharsets.ISO_8859_1));
    }
}
