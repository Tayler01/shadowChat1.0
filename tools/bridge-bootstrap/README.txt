ShadowChat Bridge Bootstrap

This tiny drive is served by the ESP bridge so an offline Windows PC can get
the ShadowChat bridge tools without direct internet access.

Quick start:
1. Double-click START.CMD or SETUP.CMD.
2. The script auto-detects the ESP serial port.
3. The ESP downloads only the approved ShadowChat windows_bundle manifest artifact.
4. The script saves shadowchat-bridge-tools.zip in a ShadowChatBridge folder on
   your real Windows Desktop, verifies SHA-256, and opens File Explorer to it.

If the script cannot find the ESP, open a serial console at 115200 baud and run:
  bootstrap help

The PC does not receive general internet access.
