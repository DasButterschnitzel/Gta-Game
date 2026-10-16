# Keep the JavaScript bridge methods called from the WebView.
-keepclassmembers class de.dasbutterschnitzel.hafengold.MainActivity$Bridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
