"""
Login and setup dialogs using tkinter.
Custom button widgets used for full color control on macOS.
"""
import tkinter as tk
from typing import Optional
import logging

logger = logging.getLogger(__name__)

# ── Design tokens ──────────────────────────────────────────────────────────────
BG         = "#0f172a"   # dark navy background
CARD_BG    = "#1e293b"   # card surface
INPUT_BG   = "#0f172a"   # input field background
BORDER     = "#334155"   # border color
ACCENT     = "#3b82f6"   # blue accent
ACCENT_HOV = "#2563eb"   # blue hover
FG         = "#f1f5f9"   # primary text
FG_MUTED   = "#94a3b8"   # secondary text
FG_ERROR   = "#f87171"   # error text
FONT       = "Arial"


def _make_custom_button(parent, text: str, command, full_width: bool = True) -> tk.Frame:
    """Custom colored button using Frame+Label (works on macOS)."""
    container = tk.Frame(parent, bg=ACCENT, cursor="hand2")
    label = tk.Label(
        container,
        text=text,
        font=(FONT, 11, "bold"),
        bg=ACCENT,
        fg="white",
        pady=10,
        padx=20,
    )
    label.pack(fill="both", expand=True)

    def on_enter(_):
        container.config(bg=ACCENT_HOV)
        label.config(bg=ACCENT_HOV)

    def on_leave(_):
        container.config(bg=ACCENT)
        label.config(bg=ACCENT)

    def on_click(_):
        command()

    for widget in (container, label):
        widget.bind("<Enter>", on_enter)
        widget.bind("<Leave>", on_leave)
        widget.bind("<Button-1>", on_click)

    if full_width:
        container.pack(fill="x", pady=(8, 0))
    return container


def _make_input(parent, var: tk.StringVar, placeholder: str = "", password: bool = False) -> tk.Entry:
    entry = tk.Entry(
        parent,
        textvariable=var,
        show="•" if password else "",
        font=(FONT, 12),
        bg=INPUT_BG,
        fg=FG,
        insertbackground=FG,
        relief="flat",
        bd=0,
        highlightthickness=1,
        highlightbackground=BORDER,
        highlightcolor=ACCENT,
    )
    entry.pack(fill="x", pady=(4, 12), ipady=8)
    return entry


def _label(parent, text: str, size: int = 9, color: str = FG_MUTED, bold: bool = False) -> tk.Label:
    weight = "bold" if bold else "normal"
    lbl = tk.Label(parent, text=text, font=(FONT, size, weight), bg=CARD_BG, fg=color, anchor="w")
    lbl.pack(fill="x")
    return lbl


# ── Login Dialog ───────────────────────────────────────────────────────────────

def show_login_dialog(server_url: str) -> Optional[dict]:
    from api_client import verify_user

    result: Optional[dict] = None

    root = tk.Tk()
    root.title("Elegant Solutions")
    root.configure(bg=BG)
    root.resizable(False, False)

    win_w, win_h = 400, 380
    root.update_idletasks()
    x = (root.winfo_screenwidth() - win_w) // 2
    y = (root.winfo_screenheight() - win_h) // 2
    root.geometry(f"{win_w}x{win_h}+{x}+{y}")
    root.attributes("-topmost", True)

    # Card
    card = tk.Frame(root, bg=CARD_BG, padx=36, pady=32)
    card.pack(fill="both", expand=True, padx=24, pady=24)

    # Header
    tk.Label(card, text="Elegant Solutions", font=(FONT, 18, "bold"),
             bg=CARD_BG, fg=ACCENT).pack(anchor="w")
    tk.Label(card, text="กรุณาเข้าสู่ระบบเพื่อเริ่มใช้งาน", font=(FONT, 10),
             bg=CARD_BG, fg=FG_MUTED).pack(anchor="w", pady=(4, 20))

    # Fields
    _label(card, "อีเมล")
    email_var = tk.StringVar()
    email_entry = _make_input(card, email_var)

    _label(card, "รหัสผ่าน")
    password_var = tk.StringVar()
    password_entry = _make_input(card, password_var, password=True)

    # Error
    error_var = tk.StringVar()
    error_lbl = tk.Label(card, textvariable=error_var, font=(FONT, 9),
                         bg=CARD_BG, fg=FG_ERROR, anchor="w", wraplength=300)
    error_lbl.pack(fill="x")

    def on_login():
        nonlocal result
        email = email_var.get().strip()
        password = password_var.get()
        if not email or not password:
            error_var.set("กรุณากรอกอีเมลและรหัสผ่าน")
            return
        error_var.set("กำลังตรวจสอบ...")
        root.update()
        resp = verify_user(server_url, email, password)
        if resp is None or "error" in resp:
            error_var.set(resp.get("error", "เชื่อมต่อไม่ได้") if resp else "เชื่อมต่อไม่ได้")
            return
        result = resp
        root.destroy()

    _make_custom_button(card, "เข้าสู่ระบบ", on_login)

    email_entry.bind("<Return>", lambda _: password_entry.focus())
    password_entry.bind("<Return>", lambda _: on_login())
    root.protocol("WM_DELETE_WINDOW", lambda: None)
    email_entry.focus()
    root.mainloop()
    return result


# ── Setup Wizard ───────────────────────────────────────────────────────────────

def show_setup_wizard(current_cfg: dict) -> Optional[dict]:
    import socket
    from api_client import register_machine

    result: Optional[dict] = None
    default_hostname = socket.gethostname()

    root = tk.Tk()
    root.title("Elegant Agent — ตั้งค่าเครื่อง")
    root.configure(bg=BG)
    root.resizable(False, False)

    win_w, win_h = 440, 520
    root.update_idletasks()
    x = (root.winfo_screenwidth() - win_w) // 2
    y = (root.winfo_screenheight() - win_h) // 2
    root.geometry(f"{win_w}x{win_h}+{x}+{y}")
    root.attributes("-topmost", True)

    # Card
    card = tk.Frame(root, bg=CARD_BG, padx=36, pady=28)
    card.pack(fill="both", expand=True, padx=20, pady=20)

    # Header
    tk.Label(card, text="ตั้งค่าเครื่องครั้งแรก", font=(FONT, 16, "bold"),
             bg=CARD_BG, fg=FG).pack(anchor="w")
    tk.Label(card, text="กรอกข้อมูลเพื่อลงทะเบียนเครื่องนี้กับระบบ", font=(FONT, 10),
             bg=CARD_BG, fg=FG_MUTED).pack(anchor="w", pady=(4, 20))

    # Fields
    field_defs = [
        ("server_url",       "Server URL",                   current_cfg.get("server_url", "http://localhost:3000"), False),
        ("machine_code",     "รหัสเครื่อง  (เช่น LAB-A101-PC01)", current_cfg.get("machine_code", default_hostname),    False),
        ("room_code",        "รหัสห้อง  (เช่น A101 — เว้นได้)",    current_cfg.get("room_code", ""),                    False),
        ("register_secret",  "Register Secret",              "",                                                       True),
    ]

    fields: dict[str, tk.StringVar] = {}
    entries: list[tk.Entry] = []

    for key, label, default, is_pass in field_defs:
        _label(card, label)
        var = tk.StringVar(value=default)
        entry = _make_input(card, var, password=is_pass)
        fields[key] = var
        entries.append(entry)

    for i, e in enumerate(entries[:-1]):
        e.bind("<Return>", lambda _, n=entries[i + 1]: n.focus())
    entries[-1].bind("<Return>", lambda _: on_save())

    # Error
    error_var = tk.StringVar()
    tk.Label(card, textvariable=error_var, font=(FONT, 9),
             bg=CARD_BG, fg=FG_ERROR, anchor="w", wraplength=360).pack(fill="x")

    def on_save():
        nonlocal result
        server_url     = fields["server_url"].get().strip().rstrip("/")
        machine_code   = fields["machine_code"].get().strip()
        room_code      = fields["room_code"].get().strip()
        register_secret = fields["register_secret"].get().strip()

        if not server_url or not machine_code or not register_secret:
            error_var.set("กรุณากรอกข้อมูลให้ครบ")
            return

        error_var.set("กำลังลงทะเบียน...")
        root.update()

        resp = register_machine(server_url, register_secret, machine_code,
                                default_hostname, room_code)

        if not resp or "apiKey" not in resp:
            error_var.set("ลงทะเบียนไม่สำเร็จ — ตรวจสอบ URL และ Secret")
            return

        result = {
            **current_cfg,
            "server_url":   server_url,
            "machine_code": machine_code,
            "room_code":    room_code,
            "api_key":      resp["apiKey"],
        }
        root.destroy()

    _make_custom_button(card, "ลงทะเบียนเครื่อง", on_save)

    root.protocol("WM_DELETE_WINDOW", root.destroy)
    entries[0].focus()
    root.mainloop()
    return result
