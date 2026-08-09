import sys
import webview

route = sys.argv[1] if len(sys.argv) > 1 else "/"
title = sys.argv[2] if len(sys.argv) > 2 else "Nano Banana Studio"
webview.create_window(title, f"http://127.0.0.1:3000{route}", width=1480, height=940)
webview.start()
