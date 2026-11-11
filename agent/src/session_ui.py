"""Interactive desktop companion; machine identity remains in machine_service."""
import json
import logging
import tkinter as tk
from tkinter import messagebox
import urllib.error
import urllib.request

import config
import logging_setup
import monitor

logger = logging.getLogger("session_ui")


def bridge_request(path: str, data: dict | None = None) -> dict:
    try:
        token = config.bridge_token_path().read_text(encoding="ascii").strip()
        payload = json.dumps(data).encode("utf-8") if data is not None else None
        request = urllib.request.Request(
            f"http://{config.BRIDGE_HOST}:{config.BRIDGE_PORT}{path}",
            data=payload,
            headers={"X-Local-Agent-Token": token, "Content-Type": "application/json"},
            method="POST" if data is not None else "GET",
        )
        with urllib.request.urlopen(request, timeout=8) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        try:
            return json.load(exc)
        except ValueError:
            return {"error": "Machine service ไม่พร้อม"}
    except (OSError, ValueError, urllib.error.URLError):
        return {"error": "Machine service ไม่พร้อม"}


class SessionWindow:
    def __init__(self) -> None:
        self.root = tk.Tk()
        self.root.title("Elegant Solution Agent")
        self.root.geometry("430x330")
        self.root.resizable(False, False)
        self.status_label = tk.Label(self.root, text="กำลังตรวจสอบสถานะเครื่อง", wraplength=390)
        self.status_label.pack(pady=16)
        self.form = tk.Frame(self.root)
        self.form.pack(fill="x", padx=30)
        self.active = False
        self.root.protocol("WM_DELETE_WINDOW", self.close)
        self.refresh()
        self.root.after(10000, self.send_activity)

    def clear_form(self) -> None:
        for widget in self.form.winfo_children():
            widget.destroy()

    def refresh(self) -> None:
        status = bridge_request("/status")
        self.clear_form()
        if "error" in status:
            self.active = False
            self.status_label.config(text=status["error"])
            tk.Button(self.form, text="ลองอีกครั้ง", command=self.refresh).pack()
        elif not status.get("activated"):
            self.active = False
            self.status_label.config(text="เครื่องยังไม่เปิดใช้งาน · กรอกรหัสจากผู้ดูแลระบบ")
            code = tk.Entry(self.form, width=12, font=("Arial", 18), justify="center")
            code.pack(pady=8)
            tk.Button(self.form, text="เปิดใช้งานเครื่อง", command=lambda: self.activate(code.get().strip())).pack()
        elif not status.get("user"):
            self.active = False
            self.status_label.config(text=f"{status.get('machineCode')} · {status.get('roomCode')} · กรุณาเข้าสู่ระบบ")
            email = tk.Entry(self.form)
            email.pack(fill="x", pady=5)
            email.insert(0, "อีเมล")
            password = tk.Entry(self.form, show="•")
            password.pack(fill="x", pady=5)
            tk.Button(self.form, text="เข้าสู่ระบบ", command=lambda: self.login(email.get(), password.get())).pack()
        else:
            self.active = True
            user = status["user"]
            self.status_label.config(text=f"{status.get('machineCode')} · {status.get('roomCode')}\nผู้ใช้: {user.get('name') or user.get('email')}")
            tk.Button(self.form, text="ออกจากระบบ", command=self.logout).pack(pady=10)

    def activate(self, code: str) -> None:
        result = bridge_request("/activate", {"code": code})
        if "error" in result:
            messagebox.showerror("เปิดใช้งานไม่สำเร็จ", result["error"])
        self.refresh()

    def login(self, email: str, password: str) -> None:
        result = bridge_request("/login", {"email": email.strip(), "password": password})
        if "error" in result:
            messagebox.showerror("เข้าสู่ระบบไม่สำเร็จ", result["error"])
        self.refresh()

    def logout(self) -> None:
        bridge_request("/logout", {})
        self.refresh()

    def send_activity(self) -> None:
        if self.active:
            snapshot = monitor.get_active_window_snapshot()
            result = bridge_request("/activity", {
                "app": snapshot.app_name if snapshot.available else None,
                "title": snapshot.window_title if snapshot.available else None,
            })
            if "error" in result:
                self.refresh()
        self.root.after(10000, self.send_activity)

    def close(self) -> None:
        if self.active:
            bridge_request("/logout", {})
        self.root.destroy()


def main() -> None:
    logging_setup.configure_logging()
    SessionWindow().root.mainloop()


if __name__ == "__main__":
    main()
