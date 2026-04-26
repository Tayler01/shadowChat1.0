#include "sdkconfig.h"

#if CONFIG_BRIDGE_USB_BOOTSTRAP_MSC

#include <errno.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>

#include "esp_check.h"
#include "esp_log.h"
#include "esp_partition.h"
#include "tinyusb.h"
#include "tusb_cdc_acm.h"
#include "tusb_console.h"
#include "tusb_msc_storage.h"
#include "wear_levelling.h"

#include "bridge_usb_bootstrap.h"

#define BRIDGE_USB_BASE_PATH "/usb"

static const char *TAG = "bridge_usb_boot";
static wl_handle_t s_usb_bootstrap_wl = WL_INVALID_HANDLE;
static char s_usb_bootstrap_status[96] = "not started";

static void set_bootstrap_status(const char *stage, esp_err_t err)
{
    if (err == ESP_OK) {
        snprintf(s_usb_bootstrap_status, sizeof(s_usb_bootstrap_status), "%s", stage);
    } else {
        snprintf(s_usb_bootstrap_status, sizeof(s_usb_bootstrap_status), "%s: %s", stage, esp_err_to_name(err));
    }
}

static const char *README_TXT =
    "ShadowChat Bridge Bootstrap\r\n"
    "\r\n"
    "This tiny drive is served by the ESP bridge so an offline Windows PC can get\r\n"
    "the ShadowChat bridge tools without direct internet access.\r\n"
    "\r\n"
    "Quick start:\r\n"
    "1. Double-click START.CMD.\r\n"
    "2. The script auto-detects the ESP serial port.\r\n"
    "3. The ESP downloads only the approved ShadowChat windows_bundle manifest artifact.\r\n"
    "4. The script saves shadowchat-bridge-tools.zip in a ShadowChatBridge folder\r\n"
    "   on your real Windows Desktop, verifies SHA-256, and opens File Explorer.\r\n"
    "\r\n"
    "If the script cannot find the ESP, open a serial console at 115200 baud and run:\r\n"
    "  bootstrap help\r\n"
    "\r\n"
    "The PC does not receive general internet access.\r\n";

static const char *START_HERE_CMD =
    "@echo off\r\n"
    "setlocal\r\n"
    "title ShadowChat Bridge Bootstrap\r\n"
    "cd /d \"%~dp0\"\r\n"
    "echo ShadowChat Bridge bootstrap\r\n"
    "echo.\r\n"
    "powershell -NoProfile -ExecutionPolicy Bypass -File \"%~dp0RECEIVE.PS1\"\r\n"
    "echo.\r\n"
    "pause\r\n";

static const char *AUTORUN_INF =
    "[AutoRun]\r\n"
    "label=ShadowChat Bridge\r\n"
    "action=Start ShadowChat Bridge setup\r\n"
    "open=START.CMD\r\n";

static const char *RECEIVER_PS1 =
    "[CmdletBinding()]\r\n"
    "param([string]$Port='', [string]$Output='')\r\n"
    "Set-StrictMode -Version Latest\r\n"
    "$ErrorActionPreference='Stop'\r\n"
    "$enc=[Text.UTF8Encoding]::new($false)\r\n"
    "function Read-Frame([string]$Line){ if(-not $Line.StartsWith('@scb:')){return $null}; try{ return ($Line.Substring(5) | ConvertFrom-Json) }catch{return $null} }\r\n"
    "function Test-Port([string]$Name){\r\n"
    "  $sp=[IO.Ports.SerialPort]::new($Name,115200,[IO.Ports.Parity]::None,8,[IO.Ports.StopBits]::One)\r\n"
    "  $sp.Encoding=$enc; $sp.NewLine=\"`n\"; $sp.ReadBufferSize=1048576; $sp.ReadTimeout=250; $sp.WriteTimeout=1000; $sp.DtrEnable=$true; $sp.RtsEnable=$true\r\n"
    "  try{ $sp.Open(); Start-Sleep -Milliseconds 900; $sp.DiscardInBuffer(); $sp.WriteLine('/admin'); Start-Sleep -Milliseconds 250; $sp.WriteLine('bootstrap ping'); $until=(Get-Date).AddSeconds(3); while((Get-Date) -lt $until){ try{ if($sp.ReadLine() -match 'SHADOWCHAT_BRIDGE_READY'){ return $sp } }catch [TimeoutException]{} } }catch{} \r\n"
    "  if($sp.IsOpen){$sp.Close()}; $sp.Dispose(); return $null\r\n"
    "}\r\n"
    "function Open-BridgePort([string]$Requested){\r\n"
    "  $ports=if($Requested){ @($Requested) } else { [IO.Ports.SerialPort]::GetPortNames() | Sort-Object }\r\n"
    "  foreach($p in $ports){ Write-Host \"Checking $p...\"; $open=Test-Port $p; if($open){ Write-Host \"Using $p\"; return $open } }\r\n"
    "  throw 'Could not find the ShadowChat ESP bridge serial port. Open a serial console and run bootstrap help.'\r\n"
    "}\r\n"
    "function Resolve-Out([string]$Requested){ if(!$Requested){$d=[Environment]::GetFolderPath('DesktopDirectory'); if(!$d){$d=Join-Path $env:USERPROFILE 'Desktop'}; $Requested=Join-Path $d 'ShadowChatBridge'}; New-Item -ItemType Directory -Force -Path $Requested | Out-Null; return (Resolve-Path -LiteralPath $Requested).Path }\r\n"
    "$sp=$null; $fs=$null; $path=''; $sha=''; $seq=0; $bytes=0; $out=''\r\n"
    "try{\r\n"
    "  $out=Resolve-Out $Output; Write-Host 'Saving ShadowChat bridge tools to:'; Write-Host \"  $out\"; Write-Host ''\r\n"
    "  $sp=Open-BridgePort $Port\r\n"
    "  $sp.DiscardInBuffer(); $sp.WriteLine('/admin'); Start-Sleep -Milliseconds 250; $sp.WriteLine('bundle get windows_bundle')\r\n"
    "  $deadline=(Get-Date).AddMinutes(15)\r\n"
    "  while($true){\r\n"
    "    if((Get-Date) -gt $deadline){ throw 'Timed out waiting for bundle transfer.' }\r\n"
    "    try{ $line=$sp.ReadLine().TrimEnd(\"`r\",\"`n\") }catch [TimeoutException]{ continue }\r\n"
    "    $frame=Read-Frame $line\r\n"
    "    if($null -eq $frame){ if($line){ Write-Host $line }; continue }\r\n"
    "    if($frame.type -eq 'bundleStart'){\r\n"
    "      $name=if($frame.filename){[IO.Path]::GetFileName([string]$frame.filename)}else{'shadowchat-bridge-tools.zip'}\r\n"
    "      $path=Join-Path $out $name; $sha=[string]$frame.sha256; $seq=0; $bytes=0\r\n"
    "      $fs=[IO.File]::Open($path,[IO.FileMode]::Create,[IO.FileAccess]::Write)\r\n"
    "      Write-Host 'Downloading:'; Write-Host \"  $name\"; Write-Host 'To:'; Write-Host \"  $path\"\r\n"
    "    } elseif($frame.type -eq 'bundleChunk'){\r\n"
    "      if($null -eq $fs){ throw 'Received data before transfer start.' }\r\n"
    "      if([int]$frame.seq -ne $seq){ throw \"Unexpected chunk $($frame.seq), expected $seq\" }\r\n"
    "      $data=[Convert]::FromBase64String([string]$frame.data); $fs.Write($data,0,$data.Length); $bytes+=$data.Length; $seq++\r\n"
    "    } elseif($frame.type -eq 'bundleEnd'){\r\n"
    "      if($fs){$fs.Dispose(); $fs=$null}\r\n"
    "      if(-not [bool]$frame.ok){ throw \"Bridge transfer failed: $($frame.message)\" }\r\n"
    "      $actual=(Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLowerInvariant()\r\n"
    "      if($sha -and $actual -ne $sha.ToLowerInvariant()){ throw \"SHA mismatch. Expected $sha got $actual\" }\r\n"
    "      Write-Host ''; Write-Host 'Download complete.'; Write-Host 'Saved file:'; Write-Host \"  $path\"; Write-Host \"SHA256: $actual\"; try{ Start-Process explorer.exe -ArgumentList \"/select,`\"$path`\"\" }catch{ Write-Host 'Open this folder to find the zip:'; Write-Host \"  $out\" }; break\r\n"
    "    }\r\n"
    "  }\r\n"
    "} finally { if($fs){$fs.Dispose()}; if($sp){ if($sp.IsOpen){$sp.Close()}; $sp.Dispose() } }\r\n";

static esp_err_t write_text_file(const char *path, const char *content)
{
    FILE *file = fopen(path, "w");
    if (!file) {
        ESP_LOGE(TAG, "Failed to open %s for writing: %s", path, strerror(errno));
        return ESP_FAIL;
    }

    fputs(content, file);
    fclose(file);
    return ESP_OK;
}

static esp_err_t storage_init_spiflash(void)
{
    const esp_partition_t *partition = esp_partition_find_first(
        ESP_PARTITION_TYPE_DATA,
        ESP_PARTITION_SUBTYPE_DATA_FAT,
        "usb_boot"
    );
    ESP_RETURN_ON_FALSE(partition != NULL, ESP_ERR_NOT_FOUND, TAG, "usb_boot FAT partition not found");

    return wl_mount(partition, &s_usb_bootstrap_wl);
}

esp_err_t bridge_usb_bootstrap_init(void)
{
    set_bootstrap_status("starting", ESP_OK);
    ESP_LOGI(TAG, "Initializing USB bootstrap MSC storage");
    esp_err_t err = storage_init_spiflash();
    if (err != ESP_OK) {
        set_bootstrap_status("usb_boot partition mount failed", err);
        ESP_LOGE(TAG, "Failed to mount wear-levelled usb_boot partition: %s", esp_err_to_name(err));
        return err;
    }

    const tinyusb_msc_spiflash_config_t storage_config = {
        .wl_handle = s_usb_bootstrap_wl,
    };
    err = tinyusb_msc_storage_init_spiflash(&storage_config);
    if (err != ESP_OK) {
        set_bootstrap_status("MSC storage init failed", err);
        ESP_LOGE(TAG, "Failed to initialize MSC storage: %s", esp_err_to_name(err));
        return err;
    }

    err = tinyusb_msc_storage_mount(BRIDGE_USB_BASE_PATH);
    if (err != ESP_OK) {
        set_bootstrap_status("MSC filesystem mount failed", err);
        ESP_LOGE(TAG, "Failed to mount MSC filesystem: %s", esp_err_to_name(err));
        return err;
    }

    err = write_text_file(BRIDGE_USB_BASE_PATH "/README.TXT", README_TXT);
    if (err != ESP_OK) {
        set_bootstrap_status("README.TXT write failed", err);
        return err;
    }

    err = write_text_file(BRIDGE_USB_BASE_PATH "/START.CMD", START_HERE_CMD);
    if (err != ESP_OK) {
        set_bootstrap_status("START.CMD write failed", err);
        return err;
    }

    err = write_text_file(BRIDGE_USB_BASE_PATH "/SETUP.CMD", START_HERE_CMD);
    if (err != ESP_OK) {
        set_bootstrap_status("SETUP.CMD write failed", err);
        return err;
    }

    err = write_text_file(BRIDGE_USB_BASE_PATH "/RECEIVE.PS1", RECEIVER_PS1);
    if (err != ESP_OK) {
        set_bootstrap_status("RECEIVE.PS1 write failed", err);
        return err;
    }

    err = write_text_file(BRIDGE_USB_BASE_PATH "/AUTORUN.INF", AUTORUN_INF);
    if (err != ESP_OK) {
        set_bootstrap_status("AUTORUN.INF write failed", err);
        return err;
    }

    const tinyusb_config_t tusb_cfg = {
        .device_descriptor = NULL,
        .string_descriptor = NULL,
        .string_descriptor_count = 0,
        .external_phy = false,
#if (TUD_OPT_HIGH_SPEED)
        .fs_configuration_descriptor = NULL,
        .hs_configuration_descriptor = NULL,
        .qualifier_descriptor = NULL,
#else
        .configuration_descriptor = NULL,
#endif
    };

    err = tinyusb_driver_install(&tusb_cfg);
    if (err != ESP_OK) {
        set_bootstrap_status("TinyUSB driver install failed", err);
        ESP_LOGE(TAG, "Failed to install TinyUSB driver: %s", esp_err_to_name(err));
        return err;
    }

    set_bootstrap_status("MSC initialized", ESP_OK);
    tinyusb_config_cdcacm_t acm_cfg = {
        .usb_dev = TINYUSB_USBDEV_0,
        .cdc_port = TINYUSB_CDC_ACM_0,
        .rx_unread_buf_sz = 256,
        .callback_rx = NULL,
        .callback_rx_wanted_char = NULL,
        .callback_line_state_changed = NULL,
        .callback_line_coding_changed = NULL,
    };

    err = tusb_cdc_acm_init(&acm_cfg);
    if (err != ESP_OK) {
        set_bootstrap_status("TinyUSB CDC init failed", err);
        ESP_LOGE(TAG, "Failed to initialize TinyUSB CDC: %s", esp_err_to_name(err));
        return err;
    }

    esp_tusb_init_console(TINYUSB_CDC_ACM_0);

    set_bootstrap_status("MSC+CDC initialized", ESP_OK);
    ESP_LOGI(TAG, "USB bootstrap MSC + CDC ready");
    return ESP_OK;
}

const char *bridge_usb_bootstrap_status(void)
{
    return s_usb_bootstrap_status;
}

#else

#include "bridge_usb_bootstrap.h"

esp_err_t bridge_usb_bootstrap_init(void)
{
    return ESP_OK;
}

const char *bridge_usb_bootstrap_status(void)
{
    return "disabled";
}

#endif
