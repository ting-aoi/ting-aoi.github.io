package tw.ting.futaba.bookshelf;

import android.annotation.SuppressLint;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;

/**
 * 雙葉書庫 — Android 外殼。
 *
 * 網頁與資料都在本機：內建的 FileApiServer 只監聽 127.0.0.1，同時代管 APK 內的網頁資產
 * 與 App 專屬目錄下的 data/。網頁端程式碼完全不必修改。
 *
 * 資料位置：Android/data/tw.ting.futaba.bookshelf/files/data/
 *   ├─ books/<id>.json
 *   ├─ index.json / settings.json
 *   └─ data.bak.<日期>.json
 * 可用檔案管理器直接存取備份；解除安裝會一併刪除，請定期匯出。
 */
public class MainActivity extends AppCompatActivity {

    private static final int PORT = 18642;

    private WebView web;
    private FileApiServer server;
    private ValueCallback<Uri[]> filePathCallback;
    private ActivityResultLauncher<Intent> filePicker;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 資料根目錄：App 專屬外部目錄（免權限、檔案管理器可見）
        File root = getExternalFilesDir(null);
        if (root == null) root = getFilesDir();
        new File(root, "data").mkdirs();

        int port = PORT;
        try {
            server = new FileApiServer(root, path -> getAssets().open("www/" + path));
            port = server.start(PORT);
        } catch (IOException e) {
            Toast.makeText(this, "無法啟動本機服務：" + e.getMessage(), Toast.LENGTH_LONG).show();
        }

        // 匯入用的檔案選擇器
        filePicker = registerForActivityResult(
                new ActivityResultContracts.StartActivityForResult(),
                result -> {
                    if (filePathCallback == null) return;
                    Uri[] uris = null;
                    if (result.getResultCode() == RESULT_OK && result.getData() != null) {
                        Uri single = result.getData().getData();
                        if (single != null) uris = new Uri[]{single};
                    }
                    filePathCallback.onReceiveValue(uris);
                    filePathCallback = null;
                });

        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // localStorage：離線快取與備份日期戳記需要
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);           // 一律走本機 HTTP，不開 file://
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);                    // 不隨系統字級縮放，維持版面

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                Uri u = req.getUrl();
                if ("127.0.0.1".equals(u.getHost())) return false;      // App 內部照常
                startActivity(new Intent(Intent.ACTION_VIEW, u));       // 外部連結交給瀏覽器
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb,
                                             FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = cb;
                try {
                    filePicker.launch(params.createIntent());
                    return true;
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
            }
        });

        // 匯出橋接：WebView 不支援 blob: 下載，改由網頁端呼叫此介面存檔
        web.addJavascriptInterface(new NativeBridge(), "FutabaNative");

        // 返回鍵：優先讓網頁處理（其導航為扁平兩層，返回即回主頁）
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (web.canGoBack()) web.goBack();
                else finish();
            }
        });

        web.loadUrl("http://127.0.0.1:" + port + "/index.html");
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.evaluateJavascript("window.FT && FT.saveCurrentBook && FT.saveCurrentBook();", null);
    }

    @Override
    protected void onDestroy() {
        if (server != null) server.stop();
        super.onDestroy();
    }

    /** 供網頁端呼叫的原生介面（僅匯出存檔一項，不暴露其他能力）。 */
    private class NativeBridge {
        @JavascriptInterface
        public String saveBase64(String filename, String base64) {
            try {
                byte[] data = Base64.decode(base64, Base64.DEFAULT);
                String mime = filename.endsWith(".zip") ? "application/zip"
                            : filename.endsWith(".json") ? "application/json"
                            : filename.endsWith(".md") ? "text/markdown" : "application/octet-stream";
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues cv = new ContentValues();
                    cv.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                    cv.put(MediaStore.Downloads.MIME_TYPE, mime);
                    cv.put(MediaStore.Downloads.IS_PENDING, 1);
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                    if (uri == null) return "儲存失敗";
                    try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                        if (os == null) return "儲存失敗";
                        os.write(data);
                    }
                    cv.clear();
                    cv.put(MediaStore.Downloads.IS_PENDING, 0);
                    getContentResolver().update(uri, cv, null, null);
                } else {
                    File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                    if (!dir.exists()) dir.mkdirs();
                    try (FileOutputStream fos = new FileOutputStream(new File(dir, filename))) {
                        fos.write(data);
                    }
                }
                return "已儲存至「下載」：" + filename;
            } catch (Exception e) {
                return "儲存失敗：" + e.getMessage();
            }
        }
    }
}
