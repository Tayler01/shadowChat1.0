# XPS setup and tool strategy

Known from Tayler: Windows XPS with Unity and Blender installed; no Higgsfield subscription. Exact installed versions and tool permissions have not been inspected. The package preparation environment is not the XPS. The read-only preflight script discovers and reports; it does not install/upgrade applications, disable security controls, change execution policy, scan personal files, or reveal environment values.

## Needed
Existing Shadow Chat checkout; repository-supported Node/package manager; Python 3.10+ for included tools; installed Blender; Codex able to edit the workspace and run allowed commands; existing Playwright testing workflow. Babylon is a new pinned package selected at implementation after checking current docs/repo compatibility. Keep existing React/Vite/TS/Supabase versions unless a narrowly demonstrated requirement forces a documented change. Lock all newly added dependencies and decoders.

Open the actual repo in Codex; extract this packet to `docs/shadow-circuit-build/`. Keep root/nested AGENTS in control. Codex reads local instruction files; avoid pasting 20 documents into one chat. Use the master instruction as the one starting prompt. Windows tool access follows Codex's configured sandbox/approval workflow; use workspace-scoped permission rather than indiscriminate Full Access. [S13,S14]

Run from packet root:
```powershell
powershell -NoProfile -File .\scripts\preflight.ps1
python .\scripts\verify_package.py
python -m unittest discover -s tests -v
```
If Windows prevents a script by policy, inspect it and use your existing approved process or run its documented checks individually. Do not disable policy to make a checklist green. Python may be `py -3` instead of `python`; record the actual command. Blender normally resides under a versioned `C:\Program Files\Blender Foundation\Blender*\blender.exe`; prefer detected path, not a fabricated version.

## Resource acquisition
```powershell
python .\scripts\fetch_resources.py --list
python .\scripts\fetch_resources.py --resource cclp1-archive
python .\scripts\fetch_resources.py --inspect-archive .\resources\incoming\CCLP1.zip
```
Network may require an allowed-domain prompt. The tool writes incoming artifacts and reports, does not execute them and does not mark redistribution approved. The archive is a complete community alternative—not the requested original data. Review its terms/credits before extracting only needed data and publishing. For the original Windows data, follow the source register/rights gate. Codex may inspect an explicitly supplied authorized installation directory; do not search unrelated personal disks or bypass Steam login/ownership controls. Steam's free modern edition is another source format and must not be mislabeled MSCC.

## Optional tools—not dependencies
Unity and Unity MCP are not used in this architecture. Blender MCP could offer interactive editor access, but reproducible Python scripts + CLI are sufficient and easier to replay. Third-party MCP install requires package/version/source review and exposes local control; don't install one automatically merely because it exists. No Higgsfield/OpenAI paid media API calls, online asset generation account or paid asset pack required. If a free external asset is used, store provenance and license terms. Web UI screenshots are not reusable 3D assets.

## Future implementation commands
Create actual scripts for: `shadow-circuit:test-rules`, `shadow-circuit:content-audit`, `shadow-circuit:validate-levels`, `shadow-circuit:replay`, `shadow-circuit:assets`, `shadow-circuit:qa`, and `shadow-circuit:perf`. These are required outputs of the Codex build, **not commands already installed by this packet**. Preserve existing test runners and add targeted scripts rather than replacing the suite.
