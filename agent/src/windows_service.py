"""Windows Service host for the shared machine runtime."""
import threading

import servicemanager
import win32event
import win32service
import win32serviceutil

from machine_service import run


class ElegantMachineService(win32serviceutil.ServiceFramework):
    _svc_name_ = "ElegantSolutionsMachine"
    _svc_display_name_ = "Elegant Solutions Machine Agent"
    _svc_description_ = "Machine heartbeat and Agent session broker"

    def __init__(self, args):
        super().__init__(args)
        self.stop_event = threading.Event()
        self.windows_stop_event = win32event.CreateEvent(None, 0, 0, None)

    def SvcStop(self):
        self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
        self.stop_event.set()
        win32event.SetEvent(self.windows_stop_event)

    def SvcDoRun(self):
        servicemanager.LogInfoMsg("Elegant Solutions Machine Agent starting")
        run(self.stop_event)


if __name__ == "__main__":
    win32serviceutil.HandleCommandLine(ElegantMachineService)
