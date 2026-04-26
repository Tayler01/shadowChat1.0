#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "cJSON.h"
#include "esp_ota_ops.h"
#include "esp_partition.h"
#include "esp_crt_bundle.h"
#include "esp_err.h"
#include "esp_event.h"
#include "esp_http_client.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_netif.h"
#include "esp_system.h"
#include "esp_websocket_client.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "freertos/task.h"
#include "nvs.h"
#include "nvs_flash.h"
#include "mbedtls/base64.h"
#include "mbedtls/sha256.h"

#define BRIDGE_WIFI_CONNECTED_BIT BIT0
#define BRIDGE_HTTP_BUFFER_SIZE 8192
#define BRIDGE_SHELL_LINE_SIZE 1024
#define BRIDGE_STORAGE_NAMESPACE "bridge_cfg"
#define BRIDGE_SHELL_TASK_STACK_SIZE 32768
#define BRIDGE_SESSION_REFRESH_LEEWAY_SECONDS 300
#define BRIDGE_STARTUP_WIFI_WAIT_MS 45000
#define BRIDGE_REALTIME_TASK_STACK_SIZE 24576
#define BRIDGE_REALTIME_WS_URL_SIZE 640
#define BRIDGE_REALTIME_RX_BUFFER_SIZE 6144
#define BRIDGE_REALTIME_HEARTBEAT_MS 25000
#define BRIDGE_REALTIME_TOKEN_CHECK_MS 30000
#define BRIDGE_REALTIME_TOPIC "realtime:bridge-chat"
#define BRIDGE_PROFILE_CACHE_SIZE 24
#define BRIDGE_OTA_BUFFER_SIZE 4096
#define BRIDGE_BUNDLE_CHUNK_SIZE 384
#define BRIDGE_BUNDLE_BASE64_SIZE (((BRIDGE_BUNDLE_CHUNK_SIZE + 2) / 3) * 4 + 1)

static const char *TAG = "shadowchat_bridge";
static esp_event_handler_instance_t s_wifi_any_id_handler;
static esp_event_handler_instance_t s_ip_got_ip_handler;

typedef struct {
    bool wifi_connected;
    bool wifi_started;
    char wifi_ssid[33];
    char wifi_password[65];
    char device_serial[64];
    char device_id[64];
    char device_status[32];
    char pairing_code[32];
    char access_token[128];
    char refresh_token[128];
    char recovery_token[128];
    char auth_access_token[4096];
    char auth_refresh_token[1024];
    char auth_user_id[64];
    char auth_expires_at[48];
    char session_expires_at[48];
} bridge_state_t;

typedef struct {
    int status_code;
    char body[BRIDGE_HTTP_BUFFER_SIZE];
    size_t body_length;
} bridge_http_response_t;

typedef struct {
    bool update_available;
    char version[64];
    char artifact_url[512];
    char artifact_sha256[65];
    char signature[512];
    int size_bytes;
} bridge_update_info_t;

typedef enum {
    BRIDGE_CHAT_MODE_ADMIN = 0,
    BRIDGE_CHAT_MODE_GROUP,
    BRIDGE_CHAT_MODE_DM,
} bridge_chat_mode_t;

typedef struct {
    char user_id[64];
    char label[80];
} bridge_profile_cache_entry_t;

static EventGroupHandle_t s_wifi_event_group;
static bridge_state_t s_bridge_state;
static bool s_wifi_reconfiguring;
static bool s_protocol_enabled;
static esp_websocket_client_handle_t s_realtime_client;
static TaskHandle_t s_realtime_task_handle;
static bool s_realtime_requested;
static bool s_realtime_connected;
static bool s_realtime_joined;
static uint32_t s_realtime_ref;
static char s_realtime_last_error[96];
static char s_realtime_rx_buffer[BRIDGE_REALTIME_RX_BUFFER_SIZE];
static size_t s_realtime_rx_length;
static bridge_profile_cache_entry_t s_profile_cache[BRIDGE_PROFILE_CACHE_SIZE];
static size_t s_profile_cache_next_index;

static bool bridge_ensure_wifi_connected(const char *action);
static bool bridge_command_update_check_target(const char *target, bool compact_output);

static const char *BRIDGE_CURSOR_GROUP_MESSAGE_ID_KEY = "cur_group_id";
static const char *BRIDGE_CURSOR_DM_RECIPIENT_KEY = "cur_dm_rec";
static const char *BRIDGE_CURSOR_DM_MESSAGE_ID_KEY = "cur_dm_id";

static void bridge_protocol_emit(cJSON *event) {
    if (!s_protocol_enabled || !event) {
        return;
    }

    char *line = cJSON_PrintUnformatted(event);
    if (!line) {
        return;
    }

    printf("@scb:%s\n", line);
    free(line);
}

static void bridge_protocol_emit_forced(cJSON *event) {
    if (!event) {
        return;
    }

    char *line = cJSON_PrintUnformatted(event);
    if (!line) {
        return;
    }

    printf("@scb:%s\n", line);
    fflush(stdout);
    free(line);
}

static void bridge_protocol_emit_mode(const char *mode, const char *recipient_user_id) {
    cJSON *event = cJSON_CreateObject();
    if (!event) {
        return;
    }

    cJSON_AddStringToObject(event, "type", "mode");
    cJSON_AddStringToObject(event, "mode", mode ? mode : "unknown");
    if (recipient_user_id && recipient_user_id[0] != '\0') {
        cJSON_AddStringToObject(event, "recipientUserId", recipient_user_id);
    }

    bridge_protocol_emit(event);
    cJSON_Delete(event);
}

static void bridge_protocol_emit_status(void) {
    cJSON *event = cJSON_CreateObject();
    if (!event) {
        return;
    }

    cJSON_AddStringToObject(event, "type", "status");
    cJSON_AddStringToObject(event, "hardwareModel", CONFIG_BRIDGE_HARDWARE_MODEL);
    cJSON_AddStringToObject(event, "firmwareVersion", CONFIG_BRIDGE_FIRMWARE_VERSION);
    cJSON_AddStringToObject(event, "deviceSerial", s_bridge_state.device_serial);
    cJSON_AddStringToObject(event, "deviceId", s_bridge_state.device_id[0] ? s_bridge_state.device_id : "");
    cJSON_AddStringToObject(event, "deviceStatus", s_bridge_state.device_status[0] ? s_bridge_state.device_status : "");
    cJSON_AddStringToObject(event, "wifiSsid", s_bridge_state.wifi_ssid[0] ? s_bridge_state.wifi_ssid : "");
    cJSON_AddBoolToObject(event, "wifiConnected", s_bridge_state.wifi_connected);
    cJSON_AddBoolToObject(event, "hasAccessToken", s_bridge_state.access_token[0] != '\0');
    cJSON_AddBoolToObject(event, "hasRefreshToken", s_bridge_state.refresh_token[0] != '\0');
    cJSON_AddBoolToObject(event, "hasRecoveryToken", s_bridge_state.recovery_token[0] != '\0');
    cJSON_AddStringToObject(event, "authUserId", s_bridge_state.auth_user_id[0] ? s_bridge_state.auth_user_id : "");
    cJSON_AddStringToObject(event, "sessionExpiresAt", s_bridge_state.session_expires_at[0] ? s_bridge_state.session_expires_at : "");
    cJSON_AddStringToObject(event, "authExpiresAt", s_bridge_state.auth_expires_at[0] ? s_bridge_state.auth_expires_at : "");
    cJSON_AddBoolToObject(event, "realtimeRequested", s_realtime_requested);
    cJSON_AddBoolToObject(event, "realtimeConnected", s_realtime_connected);
    cJSON_AddBoolToObject(event, "realtimeJoined", s_realtime_joined);
    cJSON_AddStringToObject(event, "realtimeLastError", s_realtime_last_error);

    bridge_protocol_emit(event);
    cJSON_Delete(event);
}

static void bridge_protocol_emit_update(
    const char *target,
    const char *channel,
    bool update_available,
    const char *current_version,
    const char *latest_version,
    const char *artifact_sha256,
    int size_bytes,
    const char *message
) {
    cJSON *event = cJSON_CreateObject();
    if (!event) {
        return;
    }

    cJSON_AddStringToObject(event, "type", "update");
    cJSON_AddStringToObject(event, "target", target ? target : "firmware");
    cJSON_AddStringToObject(event, "channel", channel ? channel : CONFIG_BRIDGE_UPDATE_CHANNEL);
    cJSON_AddBoolToObject(event, "updateAvailable", update_available);
    cJSON_AddStringToObject(event, "currentVersion", current_version ? current_version : "");
    cJSON_AddStringToObject(event, "latestVersion", latest_version ? latest_version : "");
    cJSON_AddStringToObject(event, "artifactSha256", artifact_sha256 ? artifact_sha256 : "");
    if (size_bytes >= 0) {
        cJSON_AddNumberToObject(event, "sizeBytes", size_bytes);
    }
    cJSON_AddStringToObject(event, "message", message ? message : "");

    bridge_protocol_emit(event);
    cJSON_Delete(event);
}

static void bridge_protocol_emit_message(
    const char *thread,
    const char *id,
    const char *created_at,
    const char *sender_id,
    const char *sender_label,
    const char *content,
    const char *conversation_id
) {
    cJSON *event = cJSON_CreateObject();
    if (!event) {
        return;
    }

    cJSON_AddStringToObject(event, "type", "message");
    cJSON_AddStringToObject(event, "thread", thread ? thread : "unknown");
    cJSON_AddStringToObject(event, "id", id ? id : "");
    cJSON_AddStringToObject(event, "createdAt", created_at ? created_at : "");
    cJSON_AddStringToObject(event, "senderId", sender_id ? sender_id : "");
    cJSON_AddStringToObject(event, "senderLabel", sender_label ? sender_label : "");
    cJSON_AddStringToObject(event, "content", content ? content : "");
    if (conversation_id && conversation_id[0] != '\0') {
        cJSON_AddStringToObject(event, "conversationId", conversation_id);
    }

    bridge_protocol_emit(event);
    cJSON_Delete(event);
}

static void bridge_protocol_emit_sent(const char *thread, const char *id, const char *conversation_id) {
    cJSON *event = cJSON_CreateObject();
    if (!event) {
        return;
    }

    cJSON_AddStringToObject(event, "type", "sent");
    cJSON_AddStringToObject(event, "thread", thread ? thread : "unknown");
    cJSON_AddStringToObject(event, "id", id ? id : "");
    if (conversation_id && conversation_id[0] != '\0') {
        cJSON_AddStringToObject(event, "conversationId", conversation_id);
    }

    bridge_protocol_emit(event);
    cJSON_Delete(event);
}

static void bridge_save_string(const char *key, const char *value) {
    nvs_handle_t handle;
    if (nvs_open(BRIDGE_STORAGE_NAMESPACE, NVS_READWRITE, &handle) != ESP_OK) {
        return;
    }

    if (value && value[0] != '\0') {
        nvs_set_str(handle, key, value);
    } else {
        nvs_erase_key(handle, key);
    }

    nvs_commit(handle);
    nvs_close(handle);
}

static void bridge_load_string(const char *key, char *buffer, size_t buffer_size) {
    nvs_handle_t handle;
    size_t required_size = buffer_size;

    if (buffer_size == 0) {
        return;
    }

    buffer[0] = '\0';

    if (nvs_open(BRIDGE_STORAGE_NAMESPACE, NVS_READONLY, &handle) != ESP_OK) {
        return;
    }

    if (nvs_get_str(handle, key, buffer, &required_size) != ESP_OK) {
        buffer[0] = '\0';
    }

    nvs_close(handle);
}

static void bridge_set_runtime_string(char *target, size_t target_size, const char *value) {
    if (!target || target_size == 0) {
        return;
    }

    if (!value) {
        target[0] = '\0';
        return;
    }

    snprintf(target, target_size, "%s", value);
}

static void bridge_load_chat_cursors(
    char *group_cursor_message_id,
    size_t group_cursor_message_id_size,
    char *dm_cursor_recipient_user_id,
    size_t dm_cursor_recipient_size,
    char *dm_cursor_message_id,
    size_t dm_cursor_message_id_size
) {
    bridge_load_string(BRIDGE_CURSOR_GROUP_MESSAGE_ID_KEY, group_cursor_message_id, group_cursor_message_id_size);
    bridge_load_string(BRIDGE_CURSOR_DM_RECIPIENT_KEY, dm_cursor_recipient_user_id, dm_cursor_recipient_size);
    bridge_load_string(BRIDGE_CURSOR_DM_MESSAGE_ID_KEY, dm_cursor_message_id, dm_cursor_message_id_size);
}

static void bridge_save_group_cursor(const char *message_id) {
    if (message_id && message_id[0] != '\0') {
        bridge_save_string(BRIDGE_CURSOR_GROUP_MESSAGE_ID_KEY, message_id);
    }
}

static void bridge_save_dm_cursor(const char *recipient_user_id, const char *message_id) {
    bridge_save_string(BRIDGE_CURSOR_DM_RECIPIENT_KEY, recipient_user_id);
    bridge_save_string(BRIDGE_CURSOR_DM_MESSAGE_ID_KEY, message_id);
}

static void bridge_clear_dm_cursor(void) {
    bridge_save_string(BRIDGE_CURSOR_DM_RECIPIENT_KEY, "");
    bridge_save_string(BRIDGE_CURSOR_DM_MESSAGE_ID_KEY, "");
}

static void bridge_clear_chat_cursors(void) {
    bridge_save_string(BRIDGE_CURSOR_GROUP_MESSAGE_ID_KEY, "");
    bridge_clear_dm_cursor();
}

static char *bridge_json_string_body(const char *key_a, const char *value_a, const char *key_b, const char *value_b) {
    cJSON *json = cJSON_CreateObject();
    if (!json) {
        return NULL;
    }

    cJSON_AddStringToObject(json, key_a, value_a ? value_a : "");
    cJSON_AddStringToObject(json, key_b, value_b ? value_b : "");

    char *body = cJSON_PrintUnformatted(json);
    cJSON_Delete(json);
    return body;
}

static char *bridge_json_three_string_body(
    const char *key_a,
    const char *value_a,
    const char *key_b,
    const char *value_b,
    const char *key_c,
    const char *value_c
) {
    cJSON *json = cJSON_CreateObject();
    if (!json) {
        return NULL;
    }

    cJSON_AddStringToObject(json, key_a, value_a ? value_a : "");
    cJSON_AddStringToObject(json, key_b, value_b ? value_b : "");
    cJSON_AddStringToObject(json, key_c, value_c ? value_c : "");

    char *body = cJSON_PrintUnformatted(json);
    cJSON_Delete(json);
    return body;
}

static char *bridge_skip_spaces(char *value) {
    while (value && *value == ' ') {
        value++;
    }
    return value;
}

static void bridge_trim_trailing_spaces(char *value) {
    if (!value) {
        return;
    }

    size_t length = strlen(value);
    while (length > 0 && value[length - 1] == ' ') {
        value[length - 1] = '\0';
        length--;
    }
}

static bool bridge_read_shell_arg(char **input, char *output, size_t output_size) {
    if (!input || !output || output_size == 0) {
        return false;
    }

    char *cursor = bridge_skip_spaces(*input);
    output[0] = '\0';
    if (!cursor || *cursor == '\0') {
        *input = cursor;
        return false;
    }

    char quote = '\0';
    if (*cursor == '"' || *cursor == '\'') {
        quote = *cursor;
        cursor++;
    }

    size_t out_index = 0;
    while (*cursor != '\0') {
        if (quote) {
            if (*cursor == quote) {
                cursor++;
                break;
            }
        } else if (*cursor == ' ') {
            break;
        }

        if (out_index < output_size - 1) {
            output[out_index++] = *cursor;
        }
        cursor++;
    }

    output[out_index] = '\0';
    *input = cursor;
    return output[0] != '\0';
}

static bool bridge_read_shell_remainder(char **input, char *output, size_t output_size) {
    if (!input || !output || output_size == 0) {
        return false;
    }

    char *cursor = bridge_skip_spaces(*input);
    output[0] = '\0';
    if (!cursor || *cursor == '\0') {
        *input = cursor;
        return false;
    }

    if (*cursor == '"' || *cursor == '\'') {
        return bridge_read_shell_arg(input, output, output_size);
    }

    snprintf(output, output_size, "%s", cursor);
    bridge_trim_trailing_spaces(output);
    *input = cursor + strlen(cursor);
    return output[0] != '\0';
}

static char *bridge_dm_poll_body(const char *recipient_user_id, const char *since_message_id) {
    cJSON *json = cJSON_CreateObject();
    if (!json) {
        return NULL;
    }

    cJSON_AddStringToObject(json, "deviceId", s_bridge_state.device_id);
    cJSON_AddStringToObject(json, "recipientUserId", recipient_user_id ? recipient_user_id : "");
    cJSON_AddNumberToObject(json, "limit", 10);
    cJSON_AddBoolToObject(json, "markRead", true);
    if (since_message_id && since_message_id[0] != '\0') {
        cJSON_AddStringToObject(json, "sinceMessageId", since_message_id);
    }

    char *body = cJSON_PrintUnformatted(json);
    cJSON_Delete(json);
    return body;
}

static void bridge_load_persisted_state(void) {
    bridge_load_string("wifi_ssid", s_bridge_state.wifi_ssid, sizeof(s_bridge_state.wifi_ssid));
    bridge_load_string("wifi_password", s_bridge_state.wifi_password, sizeof(s_bridge_state.wifi_password));
    bridge_load_string("device_id", s_bridge_state.device_id, sizeof(s_bridge_state.device_id));
    bridge_load_string("device_status", s_bridge_state.device_status, sizeof(s_bridge_state.device_status));
    bridge_load_string("pairing_code", s_bridge_state.pairing_code, sizeof(s_bridge_state.pairing_code));
    bridge_load_string("access_token", s_bridge_state.access_token, sizeof(s_bridge_state.access_token));
    bridge_load_string("refresh_token", s_bridge_state.refresh_token, sizeof(s_bridge_state.refresh_token));
    bridge_load_string("recovery_token", s_bridge_state.recovery_token, sizeof(s_bridge_state.recovery_token));
    bridge_load_string("auth_access_token", s_bridge_state.auth_access_token, sizeof(s_bridge_state.auth_access_token));
    bridge_load_string("auth_refresh_token", s_bridge_state.auth_refresh_token, sizeof(s_bridge_state.auth_refresh_token));
    bridge_load_string("auth_user_id", s_bridge_state.auth_user_id, sizeof(s_bridge_state.auth_user_id));
    bridge_load_string("auth_expires_at", s_bridge_state.auth_expires_at, sizeof(s_bridge_state.auth_expires_at));
    bridge_load_string("session_expires_at", s_bridge_state.session_expires_at, sizeof(s_bridge_state.session_expires_at));
}

static void bridge_derive_device_serial(void) {
    if (CONFIG_BRIDGE_DEVICE_SERIAL[0] != '\0') {
        bridge_set_runtime_string(
            s_bridge_state.device_serial,
            sizeof(s_bridge_state.device_serial),
            CONFIG_BRIDGE_DEVICE_SERIAL
        );
        return;
    }

    uint8_t mac[6] = {0};
    esp_read_mac(mac, ESP_MAC_WIFI_STA);
    snprintf(
        s_bridge_state.device_serial,
        sizeof(s_bridge_state.device_serial),
        "esp32s3-%02X%02X%02X%02X%02X%02X",
        mac[0],
        mac[1],
        mac[2],
        mac[3],
        mac[4],
        mac[5]
    );
}

static void bridge_wifi_event_handler(
    void *arg,
    esp_event_base_t event_base,
    int32_t event_id,
    void *event_data
) {
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        if (s_bridge_state.wifi_ssid[0] != '\0') {
            esp_wifi_connect();
        }
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        wifi_event_sta_disconnected_t *event = (wifi_event_sta_disconnected_t *)event_data;
        s_bridge_state.wifi_connected = false;
        xEventGroupClearBits(s_wifi_event_group, BRIDGE_WIFI_CONNECTED_BIT);
        printf("Wi-Fi disconnected; reason=%d\n", event ? event->reason : -1);

        if (!s_wifi_reconfiguring && s_bridge_state.wifi_ssid[0] != '\0') {
            esp_wifi_connect();
        }
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        s_bridge_state.wifi_connected = true;
        xEventGroupSetBits(s_wifi_event_group, BRIDGE_WIFI_CONNECTED_BIT);
    }
}

static esp_err_t bridge_wifi_init(void) {
    s_wifi_event_group = xEventGroupCreate();

    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    ESP_ERROR_CHECK(esp_event_handler_instance_register(
        WIFI_EVENT,
        ESP_EVENT_ANY_ID,
        &bridge_wifi_event_handler,
        NULL,
        &s_wifi_any_id_handler
    ));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(
        IP_EVENT,
        IP_EVENT_STA_GOT_IP,
        &bridge_wifi_event_handler,
        NULL,
        &s_ip_got_ip_handler
    ));

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_start());
    s_bridge_state.wifi_started = true;
    return ESP_OK;
}

static esp_err_t bridge_wifi_apply_credentials(void) {
    if (s_bridge_state.wifi_ssid[0] == '\0') {
        return ESP_ERR_INVALID_STATE;
    }

    wifi_config_t wifi_config = {0};
    strlcpy((char *)wifi_config.sta.ssid, s_bridge_state.wifi_ssid, sizeof(wifi_config.sta.ssid));
    strlcpy((char *)wifi_config.sta.password, s_bridge_state.wifi_password, sizeof(wifi_config.sta.password));
    wifi_config.sta.threshold.authmode = WIFI_AUTH_WPA2_PSK;
    wifi_config.sta.pmf_cfg.capable = true;
    wifi_config.sta.pmf_cfg.required = false;

    s_wifi_reconfiguring = true;
    xEventGroupClearBits(s_wifi_event_group, BRIDGE_WIFI_CONNECTED_BIT);
    s_bridge_state.wifi_connected = false;

    esp_err_t disconnect_err = esp_wifi_disconnect();
    if (disconnect_err != ESP_OK && disconnect_err != ESP_ERR_WIFI_NOT_CONNECT) {
        s_wifi_reconfiguring = false;
        return disconnect_err;
    }

    vTaskDelay(pdMS_TO_TICKS(250));

    esp_err_t config_err = esp_wifi_set_config(WIFI_IF_STA, &wifi_config);
    if (config_err != ESP_OK) {
        s_wifi_reconfiguring = false;
        return config_err;
    }

    esp_err_t connect_err = esp_wifi_connect();
    s_wifi_reconfiguring = false;
    if (connect_err == ESP_ERR_WIFI_CONN) {
        return ESP_OK;
    }

    return connect_err;
}

static const char *bridge_wifi_auth_mode_name(wifi_auth_mode_t authmode) {
    switch (authmode) {
        case WIFI_AUTH_OPEN:
            return "open";
        case WIFI_AUTH_WEP:
            return "wep";
        case WIFI_AUTH_WPA_PSK:
            return "wpa";
        case WIFI_AUTH_WPA2_PSK:
            return "wpa2";
        case WIFI_AUTH_WPA_WPA2_PSK:
            return "wpa/wpa2";
        case WIFI_AUTH_WPA2_ENTERPRISE:
            return "wpa2-enterprise";
        case WIFI_AUTH_WPA3_PSK:
            return "wpa3";
        case WIFI_AUTH_WPA2_WPA3_PSK:
            return "wpa2/wpa3";
        case WIFI_AUTH_WAPI_PSK:
            return "wapi";
        default:
            return "unknown";
    }
}

static bool bridge_wait_for_wifi(int timeout_ms) {
    EventBits_t bits = xEventGroupWaitBits(
        s_wifi_event_group,
        BRIDGE_WIFI_CONNECTED_BIT,
        pdFALSE,
        pdFALSE,
        pdMS_TO_TICKS(timeout_ms)
    );

    return (bits & BRIDGE_WIFI_CONNECTED_BIT) != 0;
}

static esp_err_t bridge_http_event_handler(esp_http_client_event_t *event) {
    if (event->event_id != HTTP_EVENT_ON_DATA || event->user_data == NULL || event->data == NULL) {
        return ESP_OK;
    }

    bridge_http_response_t *response = (bridge_http_response_t *)event->user_data;
    size_t remaining = sizeof(response->body) - response->body_length - 1;
    if (remaining == 0) {
        return ESP_OK;
    }

    size_t copy_length = event->data_len < remaining ? event->data_len : remaining;
    memcpy(response->body + response->body_length, event->data, copy_length);
    response->body_length += copy_length;
    response->body[response->body_length] = '\0';

    return ESP_OK;
}

static esp_err_t bridge_http_post_json(
    const char *path,
    const char *json_body,
    const char *bridge_access_token,
    bridge_http_response_t *out
) {
    if (!CONFIG_BRIDGE_SUPABASE_URL[0] || !CONFIG_BRIDGE_SUPABASE_ANON_KEY[0]) {
        ESP_LOGE(TAG, "Bridge backend config is missing. Set it with menuconfig.");
        return ESP_ERR_INVALID_STATE;
    }

    char url[320];
    snprintf(url, sizeof(url), "%s/functions/v1/%s", CONFIG_BRIDGE_SUPABASE_URL, path);

    if (out != NULL) {
        memset(out, 0, sizeof(*out));
    }

    esp_http_client_config_t config = {
        .url = url,
        .method = HTTP_METHOD_POST,
        .timeout_ms = 15000,
        .crt_bundle_attach = esp_crt_bundle_attach,
        .event_handler = bridge_http_event_handler,
        .user_data = out,
    };

    esp_http_client_handle_t client = esp_http_client_init(&config);
    if (client == NULL) {
        return ESP_FAIL;
    }

    esp_http_client_set_header(client, "Content-Type", "application/json");
    esp_http_client_set_header(client, "apikey", CONFIG_BRIDGE_SUPABASE_ANON_KEY);
    if (bridge_access_token && bridge_access_token[0] != '\0') {
        esp_http_client_set_header(client, "X-Bridge-Access-Token", bridge_access_token);
    }

    esp_http_client_set_post_field(client, json_body, (int)strlen(json_body));

    esp_err_t err = esp_http_client_perform(client);
    if (err != ESP_OK) {
        esp_http_client_cleanup(client);
        return err;
    }

    if (out != NULL) {
        out->status_code = esp_http_client_get_status_code(client);
    }

    esp_http_client_cleanup(client);
    return ESP_OK;
}

static bool bridge_is_sensitive_json_key(const char *key) {
    if (!key) {
        return false;
    }

    return strcmp(key, "accessToken") == 0 ||
        strcmp(key, "refreshToken") == 0 ||
        strcmp(key, "recoveryToken") == 0 ||
        strcmp(key, "authAccessToken") == 0 ||
        strcmp(key, "authRefreshToken") == 0 ||
        strcmp(key, "password") == 0;
}

static void bridge_redact_sensitive_json(cJSON *item) {
    if (!item) {
        return;
    }

    if (cJSON_IsString(item) && bridge_is_sensitive_json_key(item->string)) {
        cJSON_SetValuestring(item, "(redacted)");
        return;
    }

    cJSON *child = NULL;
    cJSON_ArrayForEach(child, item) {
        bridge_redact_sensitive_json(child);
    }
}

static void bridge_print_response(const char *label, const bridge_http_response_t *response) {
    printf("%s: HTTP %d\n", label, response->status_code);
    if (response->body[0] != '\0') {
        cJSON *json = cJSON_Parse(response->body);
        if (json) {
            bridge_redact_sensitive_json(json);

            char *redacted = cJSON_PrintUnformatted(json);
            if (redacted) {
                printf("%s\n", redacted);
                free(redacted);
            }

            cJSON_Delete(json);
        } else {
            printf("%s\n", response->body);
        }
    }
}

static cJSON *bridge_parse_json_body(const bridge_http_response_t *response) {
    if (!response || response->body[0] == '\0') {
        return NULL;
    }

    return cJSON_Parse(response->body);
}

static const char *bridge_json_string_or_empty(cJSON *object, const char *key) {
    cJSON *value = cJSON_GetObjectItemCaseSensitive(object, key);
    return cJSON_IsString(value) && value->valuestring ? value->valuestring : "";
}

static bool bridge_parse_update_info(cJSON *json, bridge_update_info_t *info) {
    if (!json || !info) {
        return false;
    }

    memset(info, 0, sizeof(*info));
    info->size_bytes = -1;

    cJSON *update_available = cJSON_GetObjectItemCaseSensitive(json, "updateAvailable");
    cJSON *latest_version = cJSON_GetObjectItemCaseSensitive(json, "latestVersion");
    cJSON *manifest = cJSON_GetObjectItemCaseSensitive(json, "manifest");

    info->update_available = cJSON_IsTrue(update_available);
    if (cJSON_IsString(latest_version) && latest_version->valuestring) {
        bridge_set_runtime_string(info->version, sizeof(info->version), latest_version->valuestring);
    }

    if (!cJSON_IsObject(manifest)) {
        return true;
    }

    cJSON *artifact_url = cJSON_GetObjectItemCaseSensitive(manifest, "artifactUrl");
    cJSON *artifact_sha256 = cJSON_GetObjectItemCaseSensitive(manifest, "artifactSha256");
    cJSON *signature = cJSON_GetObjectItemCaseSensitive(manifest, "signature");
    cJSON *size = cJSON_GetObjectItemCaseSensitive(manifest, "sizeBytes");

    if (cJSON_IsString(artifact_url) && artifact_url->valuestring) {
        bridge_set_runtime_string(info->artifact_url, sizeof(info->artifact_url), artifact_url->valuestring);
    }

    if (cJSON_IsString(artifact_sha256) && artifact_sha256->valuestring) {
        bridge_set_runtime_string(info->artifact_sha256, sizeof(info->artifact_sha256), artifact_sha256->valuestring);
    }

    if (cJSON_IsString(signature) && signature->valuestring) {
        bridge_set_runtime_string(info->signature, sizeof(info->signature), signature->valuestring);
    }

    if (cJSON_IsNumber(size)) {
        info->size_bytes = size->valueint;
    }

    return true;
}

static int bridge_hex_nibble(char value) {
    if (value >= '0' && value <= '9') {
        return value - '0';
    }
    if (value >= 'a' && value <= 'f') {
        return value - 'a' + 10;
    }
    if (value >= 'A' && value <= 'F') {
        return value - 'A' + 10;
    }
    return -1;
}

static bool bridge_sha256_hex_matches(const uint8_t digest[32], const char *expected_hex) {
    if (!expected_hex || strlen(expected_hex) != 64) {
        return false;
    }

    for (size_t i = 0; i < 32; i++) {
        int high = bridge_hex_nibble(expected_hex[i * 2]);
        int low = bridge_hex_nibble(expected_hex[i * 2 + 1]);
        if (high < 0 || low < 0) {
            return false;
        }
        if (digest[i] != (uint8_t)((high << 4) | low)) {
            return false;
        }
    }

    return true;
}

static void bridge_sha256_to_hex(const uint8_t digest[32], char out_hex[65]) {
    static const char hex[] = "0123456789abcdef";
    for (size_t i = 0; i < 32; i++) {
        out_hex[i * 2] = hex[(digest[i] >> 4) & 0x0f];
        out_hex[i * 2 + 1] = hex[digest[i] & 0x0f];
    }
    out_hex[64] = '\0';
}

static void bridge_store_session_expiry_from_json(cJSON *json) {
    cJSON *expires_at = cJSON_GetObjectItemCaseSensitive(json, "expiresAt");
    if (cJSON_IsString(expires_at) && expires_at->valuestring) {
        bridge_set_runtime_string(s_bridge_state.session_expires_at, sizeof(s_bridge_state.session_expires_at), expires_at->valuestring);
        bridge_save_string("session_expires_at", s_bridge_state.session_expires_at);
    }
}

static void bridge_store_recovery_token_from_json(cJSON *json) {
    cJSON *recovery_token = cJSON_GetObjectItemCaseSensitive(json, "recoveryToken");
    if (cJSON_IsString(recovery_token) && recovery_token->valuestring) {
        bridge_set_runtime_string(s_bridge_state.recovery_token, sizeof(s_bridge_state.recovery_token), recovery_token->valuestring);
        bridge_save_string("recovery_token", s_bridge_state.recovery_token);
    }
}

static void bridge_store_supabase_auth_from_json(cJSON *json) {
    cJSON *supabase_auth = cJSON_GetObjectItemCaseSensitive(json, "supabaseAuth");
    if (!cJSON_IsObject(supabase_auth)) {
        return;
    }

    cJSON *auth_access_token = cJSON_GetObjectItemCaseSensitive(supabase_auth, "accessToken");
    cJSON *auth_refresh_token = cJSON_GetObjectItemCaseSensitive(supabase_auth, "refreshToken");
    cJSON *auth_user_id = cJSON_GetObjectItemCaseSensitive(supabase_auth, "userId");
    cJSON *auth_expires_at = cJSON_GetObjectItemCaseSensitive(supabase_auth, "expiresAt");

    if (cJSON_IsString(auth_access_token) && auth_access_token->valuestring) {
        bridge_set_runtime_string(s_bridge_state.auth_access_token, sizeof(s_bridge_state.auth_access_token), auth_access_token->valuestring);
        bridge_save_string("auth_access_token", s_bridge_state.auth_access_token);
    }

    if (cJSON_IsString(auth_refresh_token) && auth_refresh_token->valuestring) {
        bridge_set_runtime_string(s_bridge_state.auth_refresh_token, sizeof(s_bridge_state.auth_refresh_token), auth_refresh_token->valuestring);
        bridge_save_string("auth_refresh_token", s_bridge_state.auth_refresh_token);
    }

    if (cJSON_IsString(auth_user_id) && auth_user_id->valuestring) {
        bridge_set_runtime_string(s_bridge_state.auth_user_id, sizeof(s_bridge_state.auth_user_id), auth_user_id->valuestring);
        bridge_save_string("auth_user_id", s_bridge_state.auth_user_id);
    }

    if (cJSON_IsString(auth_expires_at) && auth_expires_at->valuestring) {
        bridge_set_runtime_string(s_bridge_state.auth_expires_at, sizeof(s_bridge_state.auth_expires_at), auth_expires_at->valuestring);
        bridge_save_string("auth_expires_at", s_bridge_state.auth_expires_at);
    }
}

static const char *bridge_profile_label(cJSON *profile, const char *fallback_id) {
    if (cJSON_IsObject(profile)) {
        const char *display_name = bridge_json_string_or_empty(profile, "display_name");
        const char *full_name = bridge_json_string_or_empty(profile, "full_name");
        const char *username = bridge_json_string_or_empty(profile, "username");
        const char *id = bridge_json_string_or_empty(profile, "id");

        if (display_name[0] != '\0') {
            return display_name;
        }

        if (full_name[0] != '\0') {
            return full_name;
        }

        if (username[0] != '\0') {
            return username;
        }

        if (id[0] != '\0') {
            return id;
        }
    }

    return fallback_id && fallback_id[0] != '\0' ? fallback_id : "unknown";
}

static const char *bridge_profile_handle_label(cJSON *profile, const char *fallback_id, char *buffer, size_t buffer_size) {
    if (cJSON_IsObject(profile)) {
        const char *username = bridge_json_string_or_empty(profile, "username");
        if (username[0] != '\0') {
            snprintf(buffer, buffer_size, "@%s", username);
            return buffer;
        }
    }

    return bridge_profile_label(profile, fallback_id);
}

static const char *bridge_message_time_label(const char *created_at, char *buffer, size_t buffer_size) {
    if (!created_at || created_at[0] == '\0') {
        return "(unknown time)";
    }

    if (strlen(created_at) >= 19 && created_at[10] == 'T' && buffer_size >= 9) {
        snprintf(buffer, buffer_size, "%.8s", created_at + 11);
        return buffer;
    }

    return created_at;
}

static bool bridge_print_message_list(
    const bridge_http_response_t *response,
    const char *thread,
    bool dm_messages,
    char *cursor_message_id,
    size_t cursor_message_id_size,
    bool print_empty
) {
    cJSON *json = bridge_parse_json_body(response);
    if (!json) {
        return false;
    }

    cJSON *messages = cJSON_GetObjectItemCaseSensitive(json, "messages");
    if (!cJSON_IsArray(messages)) {
        cJSON_Delete(json);
        return false;
    }

    int count = cJSON_GetArraySize(messages);
    if (count == 0) {
        if (print_empty) {
            printf("(no messages)\n");
        }
        cJSON_Delete(json);
        return true;
    }

    cJSON *message = NULL;
    cJSON_ArrayForEach(message, messages) {
        const char *id = bridge_json_string_or_empty(message, "id");
        const char *created_at = bridge_json_string_or_empty(message, "created_at");
        const char *content = bridge_json_string_or_empty(message, "content");
        const char *sender_id = bridge_json_string_or_empty(message, dm_messages ? "sender_id" : "user_id");
        const char *conversation_id = dm_messages ? bridge_json_string_or_empty(message, "conversation_id") : "";
        cJSON *profile = cJSON_GetObjectItemCaseSensitive(message, dm_messages ? "sender" : "user");
        char time_label[12] = {0};
        const char *sender_label = bridge_profile_label(profile, sender_id);

        if (s_protocol_enabled) {
            bridge_protocol_emit_message(thread, id, created_at, sender_id, sender_label, content, conversation_id);
        } else {
            printf(
                "%s | %s: %s\n",
                bridge_message_time_label(created_at, time_label, sizeof(time_label)),
                sender_label,
                content
            );
        }

        if (id[0] != '\0' && cursor_message_id && cursor_message_id_size > 0) {
            bridge_set_runtime_string(cursor_message_id, cursor_message_id_size, id);
        }
    }

    cJSON_Delete(json);
    return true;
}

static int bridge_json_int_or_negative(cJSON *object, const char *key) {
    cJSON *value = cJSON_GetObjectItemCaseSensitive(object, key);
    return cJSON_IsNumber(value) ? value->valueint : -1;
}

static void bridge_print_sent_summary(const bridge_http_response_t *response, bool dm_message) {
    cJSON *json = bridge_parse_json_body(response);
    if (!json) {
        printf("sent\n");
        return;
    }

    cJSON *message = cJSON_GetObjectItemCaseSensitive(json, "message");
    const char *id = cJSON_IsObject(message) ? bridge_json_string_or_empty(message, "id") : "";
    const char *conversation_id = bridge_json_string_or_empty(json, "conversationId");
    cJSON *recipient = cJSON_GetObjectItemCaseSensitive(json, "recipient");
    char recipient_label[80] = {0};

    if (dm_message) {
        const char *fallback_recipient_id = bridge_json_string_or_empty(json, "recipientUserId");
        printf("sent dm");
        if (cJSON_IsObject(recipient) || fallback_recipient_id[0] != '\0') {
            printf(" to %s", bridge_profile_handle_label(recipient, fallback_recipient_id, recipient_label, sizeof(recipient_label)));
        }
        if (id[0] != '\0') {
            printf(" %s", id);
        }
        if (conversation_id[0] != '\0') {
            printf(" in conversation %s", conversation_id);
        }
        printf("\n");
    } else if (id[0] != '\0') {
        printf("sent group message %s\n", id);
    } else {
        printf("sent\n");
    }

    bridge_protocol_emit_sent(dm_message ? "dm" : "group", id, conversation_id);

    cJSON *push_dispatch = cJSON_GetObjectItemCaseSensitive(json, "pushDispatch");
    if (cJSON_IsObject(push_dispatch)) {
        if (dm_message) {
            int delivered_count = bridge_json_int_or_negative(push_dispatch, "deliveredCount");
            int removed_subscriptions = bridge_json_int_or_negative(push_dispatch, "removedSubscriptions");
            if (delivered_count >= 0) {
                printf("push delivered: %d", delivered_count);
                if (removed_subscriptions > 0) {
                    printf(" (removed %d stale subscription%s)", removed_subscriptions, removed_subscriptions == 1 ? "" : "s");
                }
                printf("\n");
            }
        } else {
            int delivered_recipients = bridge_json_int_or_negative(push_dispatch, "deliveredRecipients");
            int delivered_subscriptions = bridge_json_int_or_negative(push_dispatch, "deliveredSubscriptions");
            int removed_subscriptions = bridge_json_int_or_negative(push_dispatch, "removedSubscriptions");
            if (delivered_recipients >= 0 || delivered_subscriptions >= 0) {
                printf(
                    "push delivered: %d subscription%s to %d recipient%s",
                    delivered_subscriptions >= 0 ? delivered_subscriptions : 0,
                    delivered_subscriptions == 1 ? "" : "s",
                    delivered_recipients >= 0 ? delivered_recipients : 0,
                    delivered_recipients == 1 ? "" : "s"
                );
                if (removed_subscriptions > 0) {
                    printf(" (removed %d stale subscription%s)", removed_subscriptions, removed_subscriptions == 1 ? "" : "s");
                }
                printf("\n");
            }
        }
    }

    cJSON_Delete(json);
}

static bool bridge_print_user_search_list(const bridge_http_response_t *response) {
    cJSON *json = bridge_parse_json_body(response);
    if (!json) {
        return false;
    }

    cJSON *users = cJSON_GetObjectItemCaseSensitive(json, "users");
    if (!cJSON_IsArray(users)) {
        cJSON_Delete(json);
        return false;
    }

    int count = cJSON_GetArraySize(users);
    if (count == 0) {
        printf("(no users found)\n");
        cJSON_Delete(json);
        return true;
    }

    cJSON *user = NULL;
    cJSON_ArrayForEach(user, users) {
        const char *id = bridge_json_string_or_empty(user, "id");
        const char *username = bridge_json_string_or_empty(user, "username");
        const char *display_name = bridge_json_string_or_empty(user, "display_name");
        const char *status = bridge_json_string_or_empty(user, "status");

        printf(
            "@%s | %s | %s%s%s\n",
            username[0] ? username : "(no username)",
            display_name[0] ? display_name : "(no display name)",
            id[0] ? id : "(no id)",
            status[0] ? " | " : "",
            status
        );
    }

    cJSON_Delete(json);
    return true;
}

static void bridge_command_help(void) {
    printf("\nShadowChat Bridge admin shell\n");
    printf("  help\n");
    printf("  status\n");
    printf("  wifi set <ssid> <password>\n");
    printf("  wifi set \"<ssid with spaces>\" \"<password with spaces>\"\n");
    printf("  wifi connect\n");
    printf("  wifi scan\n");
    printf("  bridge register\n");
    printf("  bridge wipe\n");
    printf("  pair begin\n");
    printf("  pair status\n");
    printf("  session exchange\n");
    printf("  session refresh\n");
    printf("  session recover\n");
    printf("  bridge heartbeat\n\n");
    printf("  update check [firmware|windows_bundle|bootstrap]\n");
    printf("  update apply [firmware]\n\n");
    printf("  bundle check [windows_bundle|bootstrap]\n");
    printf("  bundle get [windows_bundle|bootstrap]\n\n");
    printf("  bootstrap help\n");
    printf("  bootstrap script\n\n");
    printf("  protocol on|off|status\n\n");
    printf("  realtime start|stop|status\n\n");
    printf("  group send <text>\n");
    printf("  group poll\n\n");
    printf("  dm send <recipient_user_id|@username> <text>\n");
    printf("  dm poll <recipient_user_id|@username>\n");
    printf("  users search <name_or_username>\n\n");
    printf("  chat group\n");
    printf("  chat dm <recipient_user_id|@username>\n\n");
}

static void bridge_command_bootstrap_help(void) {
    printf("\nShadowChat Bridge first-plug bootstrap\n");
    printf("  1. Open this serial console at 115200 baud.\n");
    printf("  2. Connect the ESP to Wi-Fi: wifi set \"<ssid>\" \"<password>\" then wifi connect.\n");
    printf("  3. If the bridge is new: bridge register, pair begin, approve in ShadowChat, session exchange.\n");
    printf("  4. Check approved PC tools: bundle check windows_bundle.\n");
    printf("  5. If this PC has no receiver script yet, run bootstrap script and save the printed PowerShell.\n");
    printf("  6. Run that PowerShell script on the PC. It asks the ESP for bundle get windows_bundle and verifies SHA-256.\n");
    printf("\nNo general internet is shared with the PC. The ESP fetches only ShadowChat manifests and artifacts.\n\n");
}

static void bridge_command_bootstrap_script(void) {
    printf("\n----- BEGIN SHADOWCHAT BRIDGE RECEIVER POWERSHELL -----\n");
    printf("param([string]$Port='COM3',[string]$Output='.')\n");
    printf("$ErrorActionPreference='Stop'\n");
    printf("$enc=[Text.UTF8Encoding]::new($false)\n");
    printf("$sp=[IO.Ports.SerialPort]::new($Port,115200,[IO.Ports.Parity]::None,8,[IO.Ports.StopBits]::One)\n");
    printf("$sp.Encoding=$enc; $sp.NewLine=\"`n\"; $sp.ReadTimeout=1000; $sp.WriteTimeout=3000\n");
    printf("$fs=$null; $path=$null; $sha=''; $bytes=0\n");
    printf("try {\n");
    printf("  $sp.Open(); Start-Sleep -Milliseconds 1200; $sp.DiscardInBuffer(); $sp.WriteLine('bundle get windows_bundle')\n");
    printf("  while ($true) {\n");
    printf("    try { $line=$sp.ReadLine() } catch [System.TimeoutException] { continue }\n");
    printf("    $line=$line.TrimEnd(\"`r\",\"`n\")\n");
    printf("    if (-not $line.StartsWith('@scb:')) { if ($line) { Write-Host $line }; continue }\n");
    printf("    $f=$line.Substring(5) | ConvertFrom-Json\n");
    printf("    if ($f.type -eq 'bundleStart') {\n");
    printf("      New-Item -ItemType Directory -Force -Path $Output | Out-Null\n");
    printf("      $name=if ($f.filename) { [IO.Path]::GetFileName([string]$f.filename) } else { 'shadowchat-bridge-tools.zip' }\n");
    printf("      $path=Join-Path $Output $name; $sha=[string]$f.sha256; $fs=[IO.File]::Open($path,[IO.FileMode]::Create,[IO.FileAccess]::Write)\n");
    printf("      Write-Host \"Receiving $name to $path\"\n");
    printf("    } elseif ($f.type -eq 'bundleChunk') {\n");
    printf("      $data=[Convert]::FromBase64String([string]$f.data); $fs.Write($data,0,$data.Length); $bytes+=$data.Length\n");
    printf("    } elseif ($f.type -eq 'bundleEnd') {\n");
    printf("      if ($fs) { $fs.Dispose(); $fs=$null }\n");
    printf("      if (-not [bool]$f.ok) { throw \"Bridge transfer failed: $($f.message)\" }\n");
    printf("      $actual=(Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLowerInvariant()\n");
    printf("      if ($sha -and $actual -ne $sha.ToLowerInvariant()) { throw \"SHA mismatch: $actual\" }\n");
    printf("      Write-Host \"Transfer complete: $path\"; Write-Host \"SHA256: $actual\"; break\n");
    printf("    }\n");
    printf("  }\n");
    printf("} finally { if ($fs) { $fs.Dispose() }; if ($sp.IsOpen) { $sp.Close() }; $sp.Dispose() }\n");
    printf("----- END SHADOWCHAT BRIDGE RECEIVER POWERSHELL -----\n\n");
}

static void bridge_command_bootstrap(const char *subcommand) {
    if (!subcommand || subcommand[0] == '\0' || strcmp(subcommand, "help") == 0) {
        bridge_command_bootstrap_help();
        return;
    }

    if (strcmp(subcommand, "script") == 0) {
        bridge_command_bootstrap_script();
        return;
    }

    printf("Unknown bootstrap command. Use: bootstrap help or bootstrap script\n");
}

static void bridge_chat_help(void) {
    printf("\nShadowChat chat mode\n");
    printf("  type a message and press Enter to send\n");
    printf("  /poll                 fetch latest messages\n");
    printf("  /dm <recipient|@name> switch to a DM thread\n");
    printf("  /group                switch to group chat\n");
    printf("  /status               show bridge status\n");
    printf("  /protocol on|off      enable or disable structured TUI events\n");
    printf("  /realtime on|off      toggle Supabase Realtime receive\n");
    printf("  /admin                return to the admin shell\n");
    printf("  /help                 show this help\n\n");
}

static void bridge_clear_pairing_state(void) {
    s_realtime_requested = false;
    s_realtime_connected = false;
    s_realtime_joined = false;
    bridge_set_runtime_string(s_bridge_state.device_status, sizeof(s_bridge_state.device_status), "unpaired");
    bridge_set_runtime_string(s_bridge_state.pairing_code, sizeof(s_bridge_state.pairing_code), "");
    bridge_set_runtime_string(s_bridge_state.access_token, sizeof(s_bridge_state.access_token), "");
    bridge_set_runtime_string(s_bridge_state.refresh_token, sizeof(s_bridge_state.refresh_token), "");
    bridge_set_runtime_string(s_bridge_state.recovery_token, sizeof(s_bridge_state.recovery_token), "");
    bridge_set_runtime_string(s_bridge_state.auth_access_token, sizeof(s_bridge_state.auth_access_token), "");
    bridge_set_runtime_string(s_bridge_state.auth_refresh_token, sizeof(s_bridge_state.auth_refresh_token), "");
    bridge_set_runtime_string(s_bridge_state.auth_user_id, sizeof(s_bridge_state.auth_user_id), "");
    bridge_set_runtime_string(s_bridge_state.auth_expires_at, sizeof(s_bridge_state.auth_expires_at), "");
    bridge_set_runtime_string(s_bridge_state.session_expires_at, sizeof(s_bridge_state.session_expires_at), "");

    bridge_save_string("device_status", s_bridge_state.device_status);
    bridge_save_string("pairing_code", "");
    bridge_save_string("access_token", "");
    bridge_save_string("refresh_token", "");
    bridge_save_string("recovery_token", "");
    bridge_save_string("auth_access_token", "");
    bridge_save_string("auth_refresh_token", "");
    bridge_save_string("auth_user_id", "");
    bridge_save_string("auth_expires_at", "");
    bridge_save_string("session_expires_at", "");
    bridge_clear_chat_cursors();
}

static void bridge_clear_session_material(void) {
    s_realtime_requested = false;
    s_realtime_connected = false;
    s_realtime_joined = false;
    bridge_set_runtime_string(s_bridge_state.access_token, sizeof(s_bridge_state.access_token), "");
    bridge_set_runtime_string(s_bridge_state.refresh_token, sizeof(s_bridge_state.refresh_token), "");
    bridge_set_runtime_string(s_bridge_state.auth_access_token, sizeof(s_bridge_state.auth_access_token), "");
    bridge_set_runtime_string(s_bridge_state.auth_refresh_token, sizeof(s_bridge_state.auth_refresh_token), "");
    bridge_set_runtime_string(s_bridge_state.auth_user_id, sizeof(s_bridge_state.auth_user_id), "");
    bridge_set_runtime_string(s_bridge_state.auth_expires_at, sizeof(s_bridge_state.auth_expires_at), "");
    bridge_set_runtime_string(s_bridge_state.session_expires_at, sizeof(s_bridge_state.session_expires_at), "");

    bridge_save_string("access_token", "");
    bridge_save_string("refresh_token", "");
    bridge_save_string("auth_access_token", "");
    bridge_save_string("auth_refresh_token", "");
    bridge_save_string("auth_user_id", "");
    bridge_save_string("auth_expires_at", "");
    bridge_save_string("session_expires_at", "");
}

static void bridge_command_status(void) {
    printf("\nBridge status\n");
    printf("  hardware_model: %s\n", CONFIG_BRIDGE_HARDWARE_MODEL);
    printf("  firmware_version: %s\n", CONFIG_BRIDGE_FIRMWARE_VERSION);
    printf("  device_serial: %s\n", s_bridge_state.device_serial);
    printf("  device_id: %s\n", s_bridge_state.device_id[0] ? s_bridge_state.device_id : "(unregistered)");
    printf("  device_status: %s\n", s_bridge_state.device_status[0] ? s_bridge_state.device_status : "(unknown)");
    printf("  wifi_ssid: %s\n", s_bridge_state.wifi_ssid[0] ? s_bridge_state.wifi_ssid : "(not set)");
    printf("  wifi_connected: %s\n", s_bridge_state.wifi_connected ? "yes" : "no");
    printf("  pairing_code: %s\n", s_bridge_state.pairing_code[0] ? s_bridge_state.pairing_code : "(none)");
    printf("  access_token: %s\n", s_bridge_state.access_token[0] ? "(stored)" : "(none)");
    printf("  refresh_token: %s\n", s_bridge_state.refresh_token[0] ? "(stored)" : "(none)");
    printf("  recovery_token: %s\n", s_bridge_state.recovery_token[0] ? "(stored)" : "(none)");
    printf("  auth_user_id: %s\n", s_bridge_state.auth_user_id[0] ? s_bridge_state.auth_user_id : "(none)");
    printf("  auth_access_token: %s\n", s_bridge_state.auth_access_token[0] ? "(stored)" : "(none)");
    printf("  auth_refresh_token: %s\n", s_bridge_state.auth_refresh_token[0] ? "(stored)" : "(none)");
    printf("  session_expires_at: %s\n", s_bridge_state.session_expires_at[0] ? s_bridge_state.session_expires_at : "(none)");
    printf("  auth_expires_at: %s\n\n", s_bridge_state.auth_expires_at[0] ? s_bridge_state.auth_expires_at : "(none)");
    bridge_protocol_emit_status();
}

static void bridge_command_protocol(const char *mode) {
    if (!mode || mode[0] == '\0' || strcmp(mode, "status") == 0) {
        printf("Structured protocol events are %s\n", s_protocol_enabled ? "on" : "off");
        return;
    }

    if (strcmp(mode, "on") == 0) {
        s_protocol_enabled = true;
        printf("Structured protocol events enabled\n");
        bridge_protocol_emit_status();
        return;
    }

    if (strcmp(mode, "off") == 0) {
        printf("Structured protocol events disabled\n");
        s_protocol_enabled = false;
        return;
    }

    printf("usage: protocol on|off|status\n");
}

static void bridge_command_wifi_set(const char *ssid, const char *password) {
    if (!ssid || !password) {
        printf("usage: wifi set <ssid> <password>\n");
        return;
    }

    bridge_set_runtime_string(s_bridge_state.wifi_ssid, sizeof(s_bridge_state.wifi_ssid), ssid);
    bridge_set_runtime_string(s_bridge_state.wifi_password, sizeof(s_bridge_state.wifi_password), password);
    bridge_save_string("wifi_ssid", s_bridge_state.wifi_ssid);
    bridge_save_string("wifi_password", s_bridge_state.wifi_password);
    printf("Saved Wi-Fi credentials for SSID '%s'\n", s_bridge_state.wifi_ssid);
}

static void bridge_command_wifi_connect(void) {
    if (s_bridge_state.wifi_ssid[0] == '\0') {
        printf("No Wi-Fi credentials stored. Use: wifi set <ssid> <password>\n");
        return;
    }

    if (bridge_wifi_apply_credentials() != ESP_OK) {
        printf("Failed to apply Wi-Fi credentials\n");
        return;
    }

    printf("Connecting to Wi-Fi...\n");
    if (bridge_wait_for_wifi(30000)) {
        printf("Wi-Fi connected\n");
    } else {
        printf("Wi-Fi connect timed out\n");
    }
}

static void bridge_command_wifi_scan(void) {
    wifi_scan_config_t scan_config = {0};
    printf("Scanning nearby Wi-Fi networks...\n");

    esp_err_t err = esp_wifi_scan_start(&scan_config, true);
    if (err != ESP_OK) {
        printf("Wi-Fi scan failed: %s\n", esp_err_to_name(err));
        return;
    }

    uint16_t ap_count = 0;
    err = esp_wifi_scan_get_ap_num(&ap_count);
    if (err != ESP_OK) {
        printf("Wi-Fi scan result count failed: %s\n", esp_err_to_name(err));
        return;
    }
    printf("Found %u network%s\n", ap_count, ap_count == 1 ? "" : "s");

    if (ap_count == 0) {
        return;
    }

    wifi_ap_record_t ap_records[20] = {0};
    uint16_t record_count = ap_count < 20 ? ap_count : 20;
    err = esp_wifi_scan_get_ap_records(&record_count, ap_records);
    if (err != ESP_OK) {
        printf("Wi-Fi scan result read failed: %s\n", esp_err_to_name(err));
        return;
    }

    for (uint16_t i = 0; i < record_count; i++) {
        printf("  %2u. %-32s RSSI %4d  channel %2u  %s\n",
            i + 1,
            ap_records[i].ssid,
            ap_records[i].rssi,
            ap_records[i].primary,
            bridge_wifi_auth_mode_name(ap_records[i].authmode));
    }

    if (ap_count > record_count) {
        printf("  ... %u more not shown\n", ap_count - record_count);
    }
}

static void bridge_command_register(void) {
    if (!s_bridge_state.wifi_connected) {
        printf("Wi-Fi is not connected\n");
        return;
    }

    char body[256];
    snprintf(
        body,
        sizeof(body),
        "{\"deviceSerial\":\"%s\",\"hardwareModel\":\"%s\",\"firmwareVersion\":\"%s\"}",
        s_bridge_state.device_serial,
        CONFIG_BRIDGE_HARDWARE_MODEL,
        CONFIG_BRIDGE_FIRMWARE_VERSION
    );

    bridge_http_response_t response = {0};
    esp_err_t err = bridge_http_post_json("bridge-register", body, NULL, &response);
    if (err != ESP_OK) {
        printf("bridge-register failed: %s\n", esp_err_to_name(err));
        return;
    }

    bridge_print_response("bridge-register", &response);

    cJSON *json = bridge_parse_json_body(&response);
    if (!json) {
        return;
    }

    cJSON *device_id = cJSON_GetObjectItemCaseSensitive(json, "deviceId");
    cJSON *status = cJSON_GetObjectItemCaseSensitive(json, "status");

    if (cJSON_IsString(device_id) && device_id->valuestring) {
        bridge_set_runtime_string(s_bridge_state.device_id, sizeof(s_bridge_state.device_id), device_id->valuestring);
        bridge_save_string("device_id", s_bridge_state.device_id);
    }

    if (cJSON_IsString(status) && status->valuestring) {
        bridge_set_runtime_string(s_bridge_state.device_status, sizeof(s_bridge_state.device_status), status->valuestring);
        bridge_save_string("device_status", s_bridge_state.device_status);
    }

    cJSON_Delete(json);
}

static bool bridge_command_pair_begin(void) {
    if (!s_bridge_state.wifi_connected || s_bridge_state.device_id[0] == '\0') {
        printf("Device must be registered and online before pairing begins\n");
        return false;
    }

    char body[320];
    if (s_bridge_state.recovery_token[0] != '\0') {
        snprintf(
            body,
            sizeof(body),
            "{\"deviceId\":\"%s\",\"recoveryToken\":\"%s\"}",
            s_bridge_state.device_id,
            s_bridge_state.recovery_token
        );
    } else {
        snprintf(body, sizeof(body), "{\"deviceId\":\"%s\"}", s_bridge_state.device_id);
    }

    bridge_http_response_t response = {0};
    esp_err_t err = bridge_http_post_json("bridge-pairing-begin", body, NULL, &response);
    if (err != ESP_OK) {
        printf("bridge-pairing-begin failed: %s\n", esp_err_to_name(err));
        return false;
    }

    bridge_print_response("bridge-pairing-begin", &response);
    if (response.status_code < 200 || response.status_code >= 300) {
        return false;
    }

    cJSON *json = bridge_parse_json_body(&response);
    if (!json) {
        return false;
    }

    cJSON *pairing_code = cJSON_GetObjectItemCaseSensitive(json, "pairingCode");
    cJSON *status = cJSON_GetObjectItemCaseSensitive(json, "status");
    cJSON *auto_approved_recovery = cJSON_GetObjectItemCaseSensitive(json, "autoApprovedRecovery");

    if (cJSON_IsString(pairing_code) && pairing_code->valuestring) {
        bridge_set_runtime_string(s_bridge_state.pairing_code, sizeof(s_bridge_state.pairing_code), pairing_code->valuestring);
        bridge_save_string("pairing_code", s_bridge_state.pairing_code);
        if (cJSON_IsTrue(auto_approved_recovery)) {
            printf("Bridge recovery approved from stored device recovery token. Code: %s\n", s_bridge_state.pairing_code);
        } else {
            printf("Pair this bridge from ShadowChat using code: %s\n", s_bridge_state.pairing_code);
        }
    }

    if (cJSON_IsString(status) && status->valuestring) {
        bridge_set_runtime_string(s_bridge_state.device_status, sizeof(s_bridge_state.device_status), status->valuestring);
        bridge_save_string("device_status", s_bridge_state.device_status);
    }

    cJSON_Delete(json);
    return true;
}

static void bridge_command_pair_status(void) {
    if (!s_bridge_state.wifi_connected || s_bridge_state.device_id[0] == '\0' || s_bridge_state.pairing_code[0] == '\0') {
        printf("Device must be registered and have an active pairing code\n");
        return;
    }

    char body[192];
    snprintf(
        body,
        sizeof(body),
        "{\"deviceId\":\"%s\",\"pairingCode\":\"%s\"}",
        s_bridge_state.device_id,
        s_bridge_state.pairing_code
    );

    bridge_http_response_t response = {0};
    esp_err_t err = bridge_http_post_json("bridge-pairing-status", body, NULL, &response);
    if (err != ESP_OK) {
        printf("bridge-pairing-status failed: %s\n", esp_err_to_name(err));
        return;
    }

    bridge_print_response("bridge-pairing-status", &response);

    cJSON *json = bridge_parse_json_body(&response);
    if (!json) {
        return;
    }

    cJSON *status = cJSON_GetObjectItemCaseSensitive(json, "status");
    if (cJSON_IsString(status) && status->valuestring) {
        bridge_set_runtime_string(s_bridge_state.device_status, sizeof(s_bridge_state.device_status), status->valuestring);
        bridge_save_string("device_status", s_bridge_state.device_status);
    }

    cJSON_Delete(json);
}

static bool bridge_command_session_exchange(void) {
    if (!s_bridge_state.wifi_connected || s_bridge_state.device_id[0] == '\0' || s_bridge_state.pairing_code[0] == '\0') {
        printf("Device must be registered and paired before exchange\n");
        return false;
    }

    char body[192];
    snprintf(
        body,
        sizeof(body),
        "{\"deviceId\":\"%s\",\"pairingCode\":\"%s\"}",
        s_bridge_state.device_id,
        s_bridge_state.pairing_code
    );

    bridge_http_response_t response = {0};
    esp_err_t err = bridge_http_post_json("bridge-session-exchange", body, NULL, &response);
    if (err != ESP_OK) {
        printf("bridge-session-exchange failed: %s\n", esp_err_to_name(err));
        return false;
    }

    bridge_print_response("bridge-session-exchange", &response);

    if (response.status_code < 200 || response.status_code >= 300) {
        return false;
    }

    cJSON *json = bridge_parse_json_body(&response);
    if (!json) {
        return false;
    }

    cJSON *access_token = cJSON_GetObjectItemCaseSensitive(json, "accessToken");
    cJSON *refresh_token = cJSON_GetObjectItemCaseSensitive(json, "refreshToken");

    if (cJSON_IsString(access_token) && access_token->valuestring) {
        bridge_set_runtime_string(s_bridge_state.access_token, sizeof(s_bridge_state.access_token), access_token->valuestring);
        bridge_save_string("access_token", s_bridge_state.access_token);
    }

    if (cJSON_IsString(refresh_token) && refresh_token->valuestring) {
        bridge_set_runtime_string(s_bridge_state.refresh_token, sizeof(s_bridge_state.refresh_token), refresh_token->valuestring);
        bridge_save_string("refresh_token", s_bridge_state.refresh_token);
    }

    bridge_store_supabase_auth_from_json(json);
    bridge_store_session_expiry_from_json(json);
    bridge_store_recovery_token_from_json(json);
    bridge_set_runtime_string(s_bridge_state.device_status, sizeof(s_bridge_state.device_status), "paired");
    bridge_save_string("device_status", s_bridge_state.device_status);
    printf("Stored bridge control-plane and ESP auth session material\n");
    cJSON_Delete(json);
    return true;
}

static bool bridge_refresh_session_material(bool compact_output) {
    if (!s_bridge_state.wifi_connected || s_bridge_state.device_id[0] == '\0' || s_bridge_state.refresh_token[0] == '\0') {
        if (!compact_output) {
            printf("Device must have stored refresh material before refresh\n");
        }
        return false;
    }

    char body[256];
    snprintf(
        body,
        sizeof(body),
        "{\"deviceId\":\"%s\",\"refreshToken\":\"%s\"}",
        s_bridge_state.device_id,
        s_bridge_state.refresh_token
    );

    bridge_http_response_t response = {0};
    esp_err_t err = bridge_http_post_json("bridge-session-refresh", body, NULL, &response);
    if (err != ESP_OK) {
        printf("bridge-session-refresh failed: %s\n", esp_err_to_name(err));
        return false;
    }

    if (!compact_output) {
        bridge_print_response("bridge-session-refresh", &response);
    }

    if (response.status_code < 200 || response.status_code >= 300) {
        if (compact_output) {
            printf("bridge-session-refresh failed: HTTP %d\n", response.status_code);
        }
        return false;
    }

    cJSON *json = bridge_parse_json_body(&response);
    if (!json) {
        return false;
    }

    cJSON *access_token = cJSON_GetObjectItemCaseSensitive(json, "accessToken");
    cJSON *refresh_token = cJSON_GetObjectItemCaseSensitive(json, "refreshToken");

    if (!cJSON_IsString(access_token) || !access_token->valuestring || !cJSON_IsString(refresh_token) || !refresh_token->valuestring) {
        printf("bridge-session-refresh response did not include complete session material\n");
        cJSON_Delete(json);
        return false;
    }

    bridge_set_runtime_string(s_bridge_state.access_token, sizeof(s_bridge_state.access_token), access_token->valuestring);
    bridge_save_string("access_token", s_bridge_state.access_token);

    bridge_set_runtime_string(s_bridge_state.refresh_token, sizeof(s_bridge_state.refresh_token), refresh_token->valuestring);
    bridge_save_string("refresh_token", s_bridge_state.refresh_token);

    bridge_store_supabase_auth_from_json(json);
    bridge_store_session_expiry_from_json(json);
    bridge_set_runtime_string(s_bridge_state.device_status, sizeof(s_bridge_state.device_status), "paired");
    bridge_save_string("device_status", s_bridge_state.device_status);
    printf("%s\n", compact_output ? "Refreshed bridge control-plane and ESP auth session material" : "Rotated bridge control-plane and ESP auth session material");
    cJSON_Delete(json);
    return true;
}

static void bridge_command_session_refresh(void) {
    bridge_refresh_session_material(false);
}

static bool bridge_recover_session_material(bool compact_output) {
    if (!s_bridge_state.wifi_connected || s_bridge_state.device_id[0] == '\0') {
        if (!compact_output) {
            printf("Device must be registered and online before session recovery\n");
        }
        return false;
    }

    if (s_bridge_state.recovery_token[0] == '\0') {
        if (!compact_output) {
            printf("No stored bridge recovery token is available. Start pairing again from ShadowChat.\n");
        }
        return false;
    }

    printf("%s\n", compact_output ? "Recovering expired bridge session from stored recovery token" : "Starting bridge session recovery. This keeps Wi-Fi and device registration, then issues a new pairing code.");
    if (!bridge_command_pair_begin()) {
        printf("Session recovery could not start. Fix Wi-Fi/registration first, then retry: session recover\n");
        return false;
    }

    bool auto_recovery_ready = s_bridge_state.recovery_token[0] != '\0' && strcmp(s_bridge_state.device_status, "paired") == 0;
    if (!auto_recovery_ready) {
        if (!compact_output) {
            printf("Approve the new code in ShadowChat Settings > ESP Bridge, then run: session exchange\n");
        }
        return false;
    }

    bridge_clear_session_material();
    printf("Old local session material cleared.\n");

    printf("Stored recovery token accepted. Exchanging a fresh bridge session now.\n");
    if (!bridge_command_session_exchange()) {
        printf("Automatic recovery exchange failed. Run: session recover\n");
        return false;
    }

    return true;
}

static void bridge_command_session_recover(void) {
    bridge_recover_session_material(false);
}

static bool bridge_response_auth_failed(const bridge_http_response_t *response) {
    if (!response) {
        return false;
    }

    if (response->status_code == 401 || response->status_code == 403) {
        return true;
    }

    return strstr(response->body, "expired") != NULL ||
        strstr(response->body, "Invalid bridge access token") != NULL ||
        strstr(response->body, "Bridge access token") != NULL;
}

static bool bridge_refresh_and_retry_allowed(const char *action, const bridge_http_response_t *response) {
    if (!bridge_response_auth_failed(response)) {
        return false;
    }

    printf("%s auth failed; refreshing bridge session and retrying once\n", action);
    if (bridge_refresh_session_material(true)) {
        return true;
    }

    printf("%s refresh failed; attempting recovery from stored bridge recovery token\n", action);
    return bridge_recover_session_material(true);
}

static bool bridge_parse_iso_utc(const char *iso, time_t *out) {
    if (!iso || iso[0] == '\0' || !out) {
        return false;
    }

    int year = 0;
    int month = 0;
    int day = 0;
    int hour = 0;
    int minute = 0;
    int second = 0;
    if (sscanf(iso, "%d-%d-%dT%d:%d:%d", &year, &month, &day, &hour, &minute, &second) != 6) {
        return false;
    }

    struct tm parsed = {0};
    parsed.tm_year = year - 1900;
    parsed.tm_mon = month - 1;
    parsed.tm_mday = day;
    parsed.tm_hour = hour;
    parsed.tm_min = minute;
    parsed.tm_sec = second;
    parsed.tm_isdst = -1;

    time_t parsed_time = mktime(&parsed);
    if (parsed_time == (time_t)-1) {
        return false;
    }

    *out = parsed_time;
    return true;
}

static bool bridge_session_refresh_due(void) {
    if (s_bridge_state.session_expires_at[0] == '\0') {
        return false;
    }

    time_t now = time(NULL);
    if (now < 1700000000) {
        return false;
    }

    time_t expires_at = 0;
    if (!bridge_parse_iso_utc(s_bridge_state.session_expires_at, &expires_at)) {
        return false;
    }

    return difftime(expires_at, now) <= BRIDGE_SESSION_REFRESH_LEEWAY_SECONDS;
}

static bool bridge_auth_refresh_due(void) {
    if (s_bridge_state.auth_expires_at[0] == '\0') {
        return false;
    }

    time_t now = time(NULL);
    if (now < 1700000000) {
        return false;
    }

    time_t expires_at = 0;
    if (!bridge_parse_iso_utc(s_bridge_state.auth_expires_at, &expires_at)) {
        return false;
    }

    return difftime(expires_at, now) <= BRIDGE_SESSION_REFRESH_LEEWAY_SECONDS;
}

static bool bridge_startup_session_refresh_due(void) {
    return s_bridge_state.access_token[0] == '\0' ||
        s_bridge_state.refresh_token[0] == '\0' ||
        s_bridge_state.auth_access_token[0] == '\0' ||
        s_bridge_state.auth_refresh_token[0] == '\0' ||
        s_bridge_state.auth_user_id[0] == '\0' ||
        s_bridge_state.session_expires_at[0] == '\0' ||
        s_bridge_state.auth_expires_at[0] == '\0' ||
        bridge_session_refresh_due() ||
        bridge_auth_refresh_due();
}

static bool bridge_ensure_fresh_session(const char *action) {
    if (!bridge_session_refresh_due()) {
        return true;
    }

    printf("Bridge session expires soon; refreshing before %s\n", action);
    if (bridge_refresh_session_material(true)) {
        return true;
    }

    printf("Bridge session refresh failed before %s; attempting stored recovery\n", action);
    return bridge_recover_session_material(true);
}

static void bridge_startup_recovery_task(void *arg) {
    (void)arg;

    if (s_bridge_state.wifi_ssid[0] == '\0') {
        vTaskDelete(NULL);
        return;
    }

    if (!bridge_wait_for_wifi(BRIDGE_STARTUP_WIFI_WAIT_MS)) {
        printf("Startup session check skipped: Wi-Fi did not connect within %d seconds\n", BRIDGE_STARTUP_WIFI_WAIT_MS / 1000);
        vTaskDelete(NULL);
        return;
    }

    if (s_bridge_state.device_id[0] == '\0') {
        bridge_command_update_check_target("firmware", true);
        vTaskDelete(NULL);
        return;
    }

    if (s_bridge_state.refresh_token[0] == '\0') {
        if (strcmp(s_bridge_state.device_status, "paired") == 0) {
            printf("Startup session check: no bridge refresh token is stored\n");
            if (s_bridge_state.recovery_token[0] != '\0') {
                bridge_recover_session_material(true);
            } else {
                printf("No recovery token is stored. Run: session recover after approving a new code.\n");
            }
        }
        bridge_command_update_check_target("firmware", true);
        vTaskDelete(NULL);
        return;
    }

    if (!bridge_startup_session_refresh_due()) {
        printf("Startup session check: stored bridge session is ready\n");
        bridge_command_update_check_target("firmware", true);
        vTaskDelete(NULL);
        return;
    }

    printf("Startup session check: refreshing stored bridge/auth session material\n");
    if (!bridge_refresh_session_material(true)) {
        printf("Startup session refresh failed; attempting stored recovery\n");
        if (!bridge_recover_session_material(true)) {
            printf("Startup session recovery failed. If Wi-Fi is online, run: session recover\n");
        }
    }

    bridge_command_update_check_target("firmware", true);
    vTaskDelete(NULL);
}

static void bridge_command_heartbeat(void) {
    if (s_bridge_state.device_id[0] == '\0' || s_bridge_state.access_token[0] == '\0') {
        printf("Device must have stored access material before heartbeat\n");
        return;
    }

    if (!bridge_ensure_wifi_connected("heartbeat")) {
        return;
    }

    if (!bridge_ensure_fresh_session("heartbeat")) {
        return;
    }

    char body[384];
    snprintf(
        body,
        sizeof(body),
        "{\"deviceId\":\"%s\",\"firmwareVersion\":\"%s\",\"connectionHealth\":{\"pairStatus\":\"%s\",\"backendConnected\":true,\"realtimeConnected\":%s,\"lastRefreshAt\":null}}",
        s_bridge_state.device_id,
        CONFIG_BRIDGE_FIRMWARE_VERSION,
        s_bridge_state.device_status[0] ? s_bridge_state.device_status : "unknown",
        s_realtime_connected ? "true" : "false"
    );

    bridge_http_response_t response = {0};
    esp_err_t err = bridge_http_post_json("bridge-heartbeat", body, s_bridge_state.access_token, &response);
    if (err == ESP_OK && bridge_refresh_and_retry_allowed("bridge-heartbeat", &response)) {
        response = (bridge_http_response_t){0};
        err = bridge_http_post_json("bridge-heartbeat", body, s_bridge_state.access_token, &response);
    }
    if (err != ESP_OK) {
        printf("bridge-heartbeat failed: %s\n", esp_err_to_name(err));
        return;
    }

    bridge_print_response("bridge-heartbeat", &response);
}

static bool bridge_command_update_check_target(const char *target, bool compact_output) {
    const char *safe_target = (target && target[0] != '\0') ? target : "firmware";
    const char *current_version = strcmp(safe_target, "firmware") == 0 ? CONFIG_BRIDGE_FIRMWARE_VERSION : "";

    if (!bridge_ensure_wifi_connected("update check")) {
        return false;
    }

    bool use_bridge_auth = s_bridge_state.device_id[0] != '\0' && s_bridge_state.access_token[0] != '\0';
    if (use_bridge_auth && !bridge_ensure_fresh_session("update check")) {
        return false;
    }

    char body[448];
    if (use_bridge_auth) {
        snprintf(
            body,
            sizeof(body),
            "{\"deviceId\":\"%s\",\"target\":\"%s\",\"channel\":\"%s\",\"hardwareModel\":\"%s\",\"currentVersion\":\"%s\"}",
            s_bridge_state.device_id,
            safe_target,
            CONFIG_BRIDGE_UPDATE_CHANNEL,
            CONFIG_BRIDGE_HARDWARE_MODEL,
            current_version
        );
    } else {
        snprintf(
            body,
            sizeof(body),
            "{\"target\":\"%s\",\"channel\":\"%s\",\"hardwareModel\":\"%s\",\"currentVersion\":\"%s\"}",
            safe_target,
            CONFIG_BRIDGE_UPDATE_CHANNEL,
            CONFIG_BRIDGE_HARDWARE_MODEL,
            current_version
        );
    }

    bridge_http_response_t response = {0};
    esp_err_t err = bridge_http_post_json(
        "bridge-update-check",
        body,
        use_bridge_auth ? s_bridge_state.access_token : NULL,
        &response
    );

    if (use_bridge_auth && err == ESP_OK && bridge_refresh_and_retry_allowed("bridge-update-check", &response)) {
        response = (bridge_http_response_t){0};
        err = bridge_http_post_json("bridge-update-check", body, s_bridge_state.access_token, &response);
    }

    if (err != ESP_OK) {
        printf("bridge-update-check failed: %s\n", esp_err_to_name(err));
        return false;
    }

    if (response.status_code < 200 || response.status_code >= 300) {
        bridge_print_response("bridge-update-check", &response);
        return false;
    }

    cJSON *json = bridge_parse_json_body(&response);
    if (!json) {
        printf("bridge-update-check returned an empty or invalid response\n");
        return false;
    }

    cJSON *update_available = cJSON_GetObjectItemCaseSensitive(json, "updateAvailable");
    cJSON *latest_version = cJSON_GetObjectItemCaseSensitive(json, "latestVersion");
    cJSON *message = cJSON_GetObjectItemCaseSensitive(json, "message");
    cJSON *manifest = cJSON_GetObjectItemCaseSensitive(json, "manifest");
    const char *latest_version_text = cJSON_IsString(latest_version) && latest_version->valuestring
        ? latest_version->valuestring
        : "";
    const char *message_text = cJSON_IsString(message) && message->valuestring
        ? message->valuestring
        : "";
    const char *artifact_sha256_text = "";
    int size_bytes = -1;

    if (cJSON_IsObject(manifest)) {
        cJSON *artifact_sha256 = cJSON_GetObjectItemCaseSensitive(manifest, "artifactSha256");
        cJSON *size = cJSON_GetObjectItemCaseSensitive(manifest, "sizeBytes");
        if (cJSON_IsString(artifact_sha256) && artifact_sha256->valuestring) {
            artifact_sha256_text = artifact_sha256->valuestring;
        }
        if (cJSON_IsNumber(size)) {
            size_bytes = size->valueint;
        }
    }

    bool has_update = cJSON_IsTrue(update_available);
    if (has_update) {
        if (current_version[0] != '\0') {
            printf("Update available for %s: %s -> %s\n", safe_target, current_version, latest_version_text[0] ? latest_version_text : "(unknown)");
        } else {
            printf("Update available for %s: %s\n", safe_target, latest_version_text[0] ? latest_version_text : "(unknown)");
        }
        if (artifact_sha256_text[0] != '\0') {
            printf("  sha256: %s\n", artifact_sha256_text);
        }
        if (size_bytes >= 0) {
            printf("  size: %d bytes\n", size_bytes);
        }
        if (strcmp(safe_target, "firmware") == 0) {
            printf("  apply: run update apply firmware to download, verify, stage, and reboot\n");
        } else {
            printf("  download: run bundle get %s from the offline PC receiver\n", safe_target);
        }
    } else if (!compact_output) {
        if (latest_version_text[0] != '\0') {
            if (current_version[0] != '\0') {
                printf("No %s update available. Current version %s is up to date for %s.\n", safe_target, current_version, CONFIG_BRIDGE_UPDATE_CHANNEL);
            } else {
                printf("No newer %s package is available for %s.\n", safe_target, CONFIG_BRIDGE_UPDATE_CHANNEL);
            }
        } else if (message_text[0] != '\0') {
            printf("No %s update manifest: %s\n", safe_target, message_text);
        } else {
            printf("No %s update available.\n", safe_target);
        }
    } else if (latest_version_text[0] != '\0') {
        printf("Startup update check: firmware is current (%s)\n", CONFIG_BRIDGE_FIRMWARE_VERSION);
    } else {
        printf("Startup update check: no published firmware manifest\n");
    }

    bridge_protocol_emit_update(
        safe_target,
        CONFIG_BRIDGE_UPDATE_CHANNEL,
        has_update,
        current_version,
        latest_version_text,
        artifact_sha256_text,
        size_bytes,
        message_text
    );

    cJSON_Delete(json);
    return true;
}

static void bridge_command_update_check(const char *target) {
    bridge_command_update_check_target(target, false);
}

static bool bridge_fetch_update_info(const char *target, bridge_update_info_t *info) {
    const char *safe_target = (target && target[0] != '\0') ? target : "firmware";
    const char *current_version = strcmp(safe_target, "firmware") == 0 ? CONFIG_BRIDGE_FIRMWARE_VERSION : "";

    if (!info) {
        return false;
    }

    if (!bridge_ensure_wifi_connected("update apply")) {
        return false;
    }

    bool use_bridge_auth = s_bridge_state.device_id[0] != '\0' && s_bridge_state.access_token[0] != '\0';
    if (use_bridge_auth && !bridge_ensure_fresh_session("update apply")) {
        return false;
    }

    char body[448];
    if (use_bridge_auth) {
        snprintf(
            body,
            sizeof(body),
            "{\"deviceId\":\"%s\",\"target\":\"%s\",\"channel\":\"%s\",\"hardwareModel\":\"%s\",\"currentVersion\":\"%s\"}",
            s_bridge_state.device_id,
            safe_target,
            CONFIG_BRIDGE_UPDATE_CHANNEL,
            CONFIG_BRIDGE_HARDWARE_MODEL,
            current_version
        );
    } else {
        snprintf(
            body,
            sizeof(body),
            "{\"target\":\"%s\",\"channel\":\"%s\",\"hardwareModel\":\"%s\",\"currentVersion\":\"%s\"}",
            safe_target,
            CONFIG_BRIDGE_UPDATE_CHANNEL,
            CONFIG_BRIDGE_HARDWARE_MODEL,
            current_version
        );
    }

    bridge_http_response_t response = {0};
    esp_err_t err = bridge_http_post_json(
        "bridge-update-check",
        body,
        use_bridge_auth ? s_bridge_state.access_token : NULL,
        &response
    );

    if (use_bridge_auth && err == ESP_OK && bridge_refresh_and_retry_allowed("bridge-update-check", &response)) {
        response = (bridge_http_response_t){0};
        err = bridge_http_post_json("bridge-update-check", body, s_bridge_state.access_token, &response);
    }

    if (err != ESP_OK) {
        printf("bridge-update-check failed: %s\n", esp_err_to_name(err));
        return false;
    }

    if (response.status_code < 200 || response.status_code >= 300) {
        bridge_print_response("bridge-update-check", &response);
        return false;
    }

    cJSON *json = bridge_parse_json_body(&response);
    if (!json) {
        printf("bridge-update-check returned an empty or invalid response\n");
        return false;
    }

    bool parsed = bridge_parse_update_info(json, info);
    cJSON_Delete(json);
    return parsed;
}

static bool bridge_apply_firmware_update(const bridge_update_info_t *info) {
    if (!info || !info->update_available) {
        printf("No firmware update is available to apply.\n");
        return false;
    }

    if (info->artifact_url[0] == '\0') {
        printf("Firmware manifest does not include a direct artifact URL yet.\n");
        return false;
    }

    if (info->artifact_sha256[0] == '\0') {
        printf("Firmware manifest is missing artifactSha256; refusing OTA apply.\n");
        return false;
    }

    const esp_partition_t *update_partition = esp_ota_get_next_update_partition(NULL);
    if (!update_partition) {
        printf("No OTA update partition is available.\n");
        return false;
    }

    printf("Downloading firmware %s to OTA partition %s at 0x%lx\n",
        info->version[0] ? info->version : "(unknown)",
        update_partition->label,
        (unsigned long)update_partition->address);

    esp_http_client_config_t config = {
        .url = info->artifact_url,
        .method = HTTP_METHOD_GET,
        .timeout_ms = 30000,
        .crt_bundle_attach = esp_crt_bundle_attach,
    };

    esp_http_client_handle_t client = esp_http_client_init(&config);
    if (!client) {
        printf("Failed to initialize OTA HTTP client\n");
        return false;
    }

    esp_ota_handle_t ota_handle = 0;
    bool ota_started = false;
    uint8_t *buffer = malloc(BRIDGE_OTA_BUFFER_SIZE);
    if (!buffer) {
        printf("Failed to allocate OTA download buffer\n");
        esp_http_client_cleanup(client);
        return false;
    }

    mbedtls_sha256_context sha_ctx;
    mbedtls_sha256_init(&sha_ctx);
    mbedtls_sha256_starts(&sha_ctx, 0);

    bool ok = false;
    int total_read = 0;

    esp_err_t err = esp_http_client_open(client, 0);
    if (err != ESP_OK) {
        printf("OTA HTTP open failed: %s\n", esp_err_to_name(err));
        goto cleanup;
    }

    int64_t content_length = esp_http_client_fetch_headers(client);
    if (content_length > 0) {
        printf("OTA download size: %lld bytes\n", content_length);
    }

    err = esp_ota_begin(update_partition, OTA_SIZE_UNKNOWN, &ota_handle);
    if (err != ESP_OK) {
        printf("esp_ota_begin failed: %s\n", esp_err_to_name(err));
        goto cleanup;
    }
    ota_started = true;

    while (true) {
        int read_len = esp_http_client_read(client, (char *)buffer, BRIDGE_OTA_BUFFER_SIZE);
        if (read_len < 0) {
            printf("OTA HTTP read failed\n");
            goto cleanup;
        }
        if (read_len == 0) {
            break;
        }

        mbedtls_sha256_update(&sha_ctx, buffer, (size_t)read_len);
        err = esp_ota_write(ota_handle, buffer, (size_t)read_len);
        if (err != ESP_OK) {
            printf("esp_ota_write failed: %s\n", esp_err_to_name(err));
            goto cleanup;
        }
        total_read += read_len;
    }

    if (total_read <= 0) {
        printf("OTA download produced no data\n");
        goto cleanup;
    }

    uint8_t digest[32];
    mbedtls_sha256_finish(&sha_ctx, digest);
    if (!bridge_sha256_hex_matches(digest, info->artifact_sha256)) {
        printf("OTA SHA-256 verification failed; refusing to boot downloaded image\n");
        goto cleanup;
    }

    printf("OTA SHA-256 verified for %d bytes\n", total_read);

    err = esp_ota_end(ota_handle);
    ota_started = false;
    if (err != ESP_OK) {
        printf("esp_ota_end failed: %s\n", esp_err_to_name(err));
        goto cleanup;
    }

    err = esp_ota_set_boot_partition(update_partition);
    if (err != ESP_OK) {
        printf("esp_ota_set_boot_partition failed: %s\n", esp_err_to_name(err));
        goto cleanup;
    }

    printf("Firmware update staged. Rebooting into version %s.\n", info->version[0] ? info->version : "(unknown)");
    ok = true;

cleanup:
    if (ota_started) {
        esp_ota_abort(ota_handle);
    }
    mbedtls_sha256_free(&sha_ctx);
    free(buffer);
    esp_http_client_close(client);
    esp_http_client_cleanup(client);

    if (ok) {
        vTaskDelay(pdMS_TO_TICKS(500));
        esp_restart();
    }

    return ok;
}

static void bridge_command_update_apply(const char *target) {
    const char *safe_target = (target && target[0] != '\0') ? target : "firmware";
    if (strcmp(safe_target, "firmware") != 0) {
        printf("update apply currently supports firmware only. Use update check %s for manifest visibility.\n", safe_target);
        return;
    }

    bridge_update_info_t info = {0};
    if (!bridge_fetch_update_info("firmware", &info)) {
        return;
    }

    bridge_apply_firmware_update(&info);
}

static void bridge_artifact_filename(const char *artifact_url, char *out, size_t out_size) {
    if (!out || out_size == 0) {
        return;
    }

    bridge_set_runtime_string(out, out_size, "shadowchat-bridge-bundle.bin");

    if (!artifact_url || artifact_url[0] == '\0') {
        return;
    }

    const char *filename = strrchr(artifact_url, '/');
    filename = filename ? filename + 1 : artifact_url;
    if (filename[0] == '\0') {
        return;
    }

    bridge_set_runtime_string(out, out_size, filename);
    char *query = strchr(out, '?');
    if (query) {
        *query = '\0';
    }
}

static void bridge_emit_bundle_end(
    const char *target,
    const bridge_update_info_t *info,
    bool ok,
    int total_read,
    bool sha_matched,
    const char *actual_sha256,
    const char *message
) {
    cJSON *event = cJSON_CreateObject();
    if (!event) {
        return;
    }

    cJSON_AddStringToObject(event, "type", "bundleEnd");
    cJSON_AddStringToObject(event, "target", target ? target : "windows_bundle");
    cJSON_AddStringToObject(event, "version", info && info->version[0] ? info->version : "");
    cJSON_AddBoolToObject(event, "ok", ok);
    cJSON_AddNumberToObject(event, "bytes", total_read);
    cJSON_AddBoolToObject(event, "sha256Matched", sha_matched);
    cJSON_AddStringToObject(event, "sha256", actual_sha256 ? actual_sha256 : "");
    cJSON_AddStringToObject(event, "expectedSha256", info && info->artifact_sha256[0] ? info->artifact_sha256 : "");
    cJSON_AddStringToObject(event, "message", message ? message : "");
    bridge_protocol_emit_forced(event);
    cJSON_Delete(event);
}

static bool bridge_stream_bundle_artifact(const char *target, const bridge_update_info_t *info) {
    const char *safe_target = (target && target[0] != '\0') ? target : "windows_bundle";

    if (!info || !info->update_available) {
        printf("No %s package is available to download.\n", safe_target);
        return false;
    }

    if (info->artifact_url[0] == '\0') {
        printf("%s manifest does not include a direct artifact URL.\n", safe_target);
        return false;
    }

    if (info->artifact_sha256[0] == '\0') {
        printf("%s manifest is missing artifactSha256; refusing transfer.\n", safe_target);
        return false;
    }

    printf("Streaming %s %s over serial. Keep the receiver open until bundleEnd.\n",
        safe_target,
        info->version[0] ? info->version : "(unknown)");

    esp_http_client_config_t config = {
        .url = info->artifact_url,
        .method = HTTP_METHOD_GET,
        .timeout_ms = 30000,
        .crt_bundle_attach = esp_crt_bundle_attach,
    };

    esp_http_client_handle_t client = esp_http_client_init(&config);
    if (!client) {
        printf("Failed to initialize bundle HTTP client\n");
        return false;
    }

    uint8_t *buffer = malloc(BRIDGE_BUNDLE_CHUNK_SIZE);
    uint8_t *encoded = malloc(BRIDGE_BUNDLE_BASE64_SIZE);
    if (!buffer || !encoded) {
        printf("Failed to allocate bundle transfer buffers\n");
        free(buffer);
        free(encoded);
        esp_http_client_cleanup(client);
        return false;
    }

    mbedtls_sha256_context sha_ctx;
    mbedtls_sha256_init(&sha_ctx);
    mbedtls_sha256_starts(&sha_ctx, 0);

    bool ok = false;
    int total_read = 0;
    int sequence = 0;
    char actual_sha256[65] = {0};
    char filename[96] = {0};
    bridge_artifact_filename(info->artifact_url, filename, sizeof(filename));

    esp_err_t err = esp_http_client_open(client, 0);
    if (err != ESP_OK) {
        printf("Bundle HTTP open failed: %s\n", esp_err_to_name(err));
        bridge_emit_bundle_end(safe_target, info, false, 0, false, "", "HTTP open failed");
        goto cleanup;
    }

    int64_t content_length = esp_http_client_fetch_headers(client);

    cJSON *start = cJSON_CreateObject();
    if (start) {
        cJSON_AddStringToObject(start, "type", "bundleStart");
        cJSON_AddStringToObject(start, "target", safe_target);
        cJSON_AddStringToObject(start, "version", info->version[0] ? info->version : "");
        cJSON_AddStringToObject(start, "filename", filename);
        cJSON_AddStringToObject(start, "sha256", info->artifact_sha256);
        cJSON_AddNumberToObject(start, "sizeBytes", info->size_bytes >= 0 ? info->size_bytes : (double)content_length);
        cJSON_AddNumberToObject(start, "chunkBytes", BRIDGE_BUNDLE_CHUNK_SIZE);
        bridge_protocol_emit_forced(start);
        cJSON_Delete(start);
    }

    while (true) {
        int read_len = esp_http_client_read(client, (char *)buffer, BRIDGE_BUNDLE_CHUNK_SIZE);
        if (read_len < 0) {
            printf("Bundle HTTP read failed\n");
            bridge_emit_bundle_end(safe_target, info, false, total_read, false, "", "HTTP read failed");
            goto cleanup;
        }
        if (read_len == 0) {
            break;
        }

        mbedtls_sha256_update(&sha_ctx, buffer, (size_t)read_len);

        size_t encoded_len = 0;
        int encode_result = mbedtls_base64_encode(encoded, BRIDGE_BUNDLE_BASE64_SIZE, &encoded_len, buffer, (size_t)read_len);
        if (encode_result != 0 || encoded_len >= BRIDGE_BUNDLE_BASE64_SIZE) {
            printf("Bundle base64 encoding failed\n");
            bridge_emit_bundle_end(safe_target, info, false, total_read, false, "", "base64 encode failed");
            goto cleanup;
        }
        encoded[encoded_len] = '\0';

        cJSON *chunk = cJSON_CreateObject();
        if (!chunk) {
            printf("Failed to allocate bundle chunk event\n");
            bridge_emit_bundle_end(safe_target, info, false, total_read, false, "", "chunk event allocation failed");
            goto cleanup;
        }

        cJSON_AddStringToObject(chunk, "type", "bundleChunk");
        cJSON_AddStringToObject(chunk, "target", safe_target);
        cJSON_AddNumberToObject(chunk, "seq", sequence);
        cJSON_AddNumberToObject(chunk, "bytes", read_len);
        cJSON_AddStringToObject(chunk, "data", (const char *)encoded);
        bridge_protocol_emit_forced(chunk);
        cJSON_Delete(chunk);

        total_read += read_len;
        sequence++;
        vTaskDelay(pdMS_TO_TICKS(2));
    }

    if (total_read <= 0) {
        printf("Bundle download produced no data\n");
        bridge_emit_bundle_end(safe_target, info, false, 0, false, "", "empty download");
        goto cleanup;
    }

    uint8_t digest[32];
    mbedtls_sha256_finish(&sha_ctx, digest);
    bridge_sha256_to_hex(digest, actual_sha256);
    bool sha_matched = bridge_sha256_hex_matches(digest, info->artifact_sha256);
    if (!sha_matched) {
        printf("Bundle SHA-256 verification failed after streaming\n");
        bridge_emit_bundle_end(safe_target, info, false, total_read, false, actual_sha256, "sha256 mismatch");
        goto cleanup;
    }

    printf("Bundle SHA-256 verified for %d bytes\n", total_read);
    bridge_emit_bundle_end(safe_target, info, true, total_read, true, actual_sha256, "complete");
    ok = true;

cleanup:
    mbedtls_sha256_free(&sha_ctx);
    free(buffer);
    free(encoded);
    esp_http_client_close(client);
    esp_http_client_cleanup(client);
    return ok;
}

static void bridge_command_bundle_check(const char *target) {
    const char *safe_target = (target && target[0] != '\0') ? target : "windows_bundle";
    if (strcmp(safe_target, "windows_bundle") != 0 && strcmp(safe_target, "bootstrap") != 0) {
        printf("bundle check supports windows_bundle or bootstrap.\n");
        return;
    }

    bridge_command_update_check(safe_target);
}

static void bridge_command_bundle_get(const char *target) {
    const char *safe_target = (target && target[0] != '\0') ? target : "windows_bundle";
    if (strcmp(safe_target, "windows_bundle") != 0 && strcmp(safe_target, "bootstrap") != 0) {
        printf("bundle get supports windows_bundle or bootstrap.\n");
        return;
    }

    bridge_update_info_t info = {0};
    if (!bridge_fetch_update_info(safe_target, &info)) {
        return;
    }

    bridge_stream_bundle_artifact(safe_target, &info);
}

static void bridge_command_wipe(void) {
    bool backend_wipe_attempted = false;

    if (s_bridge_state.wifi_connected && s_bridge_state.device_id[0] != '\0' && s_bridge_state.refresh_token[0] != '\0') {
        char body[320];
        snprintf(
            body,
            sizeof(body),
            "{\"deviceId\":\"%s\",\"mode\":\"device_wipe\",\"refreshToken\":\"%s\"}",
            s_bridge_state.device_id,
            s_bridge_state.refresh_token
        );

        bridge_http_response_t response = {0};
        esp_err_t err = bridge_http_post_json("bridge-pairing-revoke", body, NULL, &response);
        backend_wipe_attempted = true;

        if (err != ESP_OK) {
            printf("bridge-pairing-revoke failed: %s\n", esp_err_to_name(err));
        } else {
            bridge_print_response("bridge-pairing-revoke", &response);
        }
    } else {
        printf("Skipping backend wipe; device is offline or has no stored bridge session.\n");
    }

    bridge_clear_pairing_state();
    printf(
        "Local bridge pairing/session material cleared%s\n",
        backend_wipe_attempted ? "" : " without backend confirmation"
    );
}

static bool bridge_ensure_wifi_connected(const char *action) {
    if (s_bridge_state.wifi_connected) {
        return true;
    }

    if (s_bridge_state.wifi_ssid[0] == '\0') {
        printf("Wi-Fi is not configured. Use: wifi set <ssid> <password>\n");
        return false;
    }

    printf("Wi-Fi is disconnected; reconnecting before %s\n", action);
    esp_err_t err = bridge_wifi_apply_credentials();
    if (err != ESP_OK) {
        printf("Wi-Fi reconnect failed before %s: %s\n", action, esp_err_to_name(err));
        return false;
    }

    if (!bridge_wait_for_wifi(30000)) {
        printf("Wi-Fi reconnect timed out before %s\n", action);
        return false;
    }

    printf("Wi-Fi reconnected\n");
    return true;
}

static bool bridge_has_access_material(const char *action) {
    if (s_bridge_state.device_id[0] == '\0' || s_bridge_state.access_token[0] == '\0') {
        printf("Device must be paired and have stored access material before %s\n", action);
        return false;
    }

    return bridge_ensure_wifi_connected(action);
}

static void bridge_realtime_set_error(const char *message) {
    bridge_set_runtime_string(s_realtime_last_error, sizeof(s_realtime_last_error), message ? message : "");
}

static const char *bridge_profile_cache_get(const char *user_id) {
    if (!user_id || user_id[0] == '\0') {
        return NULL;
    }

    for (size_t index = 0; index < BRIDGE_PROFILE_CACHE_SIZE; index++) {
        if (strcmp(s_profile_cache[index].user_id, user_id) == 0 && s_profile_cache[index].label[0] != '\0') {
            return s_profile_cache[index].label;
        }
    }

    return NULL;
}

static void bridge_profile_cache_put(const char *user_id, const char *label) {
    if (!user_id || user_id[0] == '\0' || !label || label[0] == '\0') {
        return;
    }

    for (size_t index = 0; index < BRIDGE_PROFILE_CACHE_SIZE; index++) {
        if (strcmp(s_profile_cache[index].user_id, user_id) == 0) {
            bridge_set_runtime_string(s_profile_cache[index].label, sizeof(s_profile_cache[index].label), label);
            return;
        }
    }

    bridge_profile_cache_entry_t *entry = &s_profile_cache[s_profile_cache_next_index % BRIDGE_PROFILE_CACHE_SIZE];
    bridge_set_runtime_string(entry->user_id, sizeof(entry->user_id), user_id);
    bridge_set_runtime_string(entry->label, sizeof(entry->label), label);
    s_profile_cache_next_index++;
}

static const char *bridge_lookup_profile_label(const char *user_id, char *buffer, size_t buffer_size) {
    if (!user_id || user_id[0] == '\0') {
        return "unknown";
    }

    if (strcmp(user_id, s_bridge_state.auth_user_id) == 0) {
        return "ESP Bridge";
    }

    const char *cached = bridge_profile_cache_get(user_id);
    if (cached) {
        return cached;
    }

    if (!buffer || buffer_size == 0) {
        return user_id;
    }

    snprintf(buffer, buffer_size, "%s", user_id);

    if (!bridge_has_access_material("profile lookup") || !bridge_ensure_fresh_session("profile lookup")) {
        return buffer;
    }

    char body[160];
    snprintf(body, sizeof(body), "{\"deviceId\":\"%s\",\"userIds\":[\"%s\"]}", s_bridge_state.device_id, user_id);

    bridge_http_response_t response = {0};
    esp_err_t err = bridge_http_post_json("bridge-user-profile", body, s_bridge_state.access_token, &response);
    if (err == ESP_OK && bridge_refresh_and_retry_allowed("bridge-user-profile", &response)) {
        response = (bridge_http_response_t){0};
        err = bridge_http_post_json("bridge-user-profile", body, s_bridge_state.access_token, &response);
    }
    if (err != ESP_OK || response.status_code < 200 || response.status_code >= 300) {
        return buffer;
    }

    cJSON *json = bridge_parse_json_body(&response);
    if (!json) {
        return buffer;
    }

    cJSON *users = cJSON_GetObjectItemCaseSensitive(json, "users");
    cJSON *profile = cJSON_IsArray(users) ? cJSON_GetArrayItem(users, 0) : NULL;
    const char *label = bridge_profile_label(profile, user_id);
    bridge_set_runtime_string(buffer, buffer_size, label);
    bridge_profile_cache_put(user_id, buffer);

    cJSON_Delete(json);
    return buffer;
}

static bool bridge_realtime_build_url(char *buffer, size_t buffer_size) {
    if (!buffer || buffer_size == 0) {
        return false;
    }

    if (!CONFIG_BRIDGE_SUPABASE_URL[0] || !CONFIG_BRIDGE_SUPABASE_ANON_KEY[0]) {
        bridge_realtime_set_error("backend config missing");
        return false;
    }

    char base[320] = {0};
    const char *source = CONFIG_BRIDGE_SUPABASE_URL;
    if (strncmp(source, "https://", 8) == 0) {
        snprintf(base, sizeof(base), "wss://%s", source + 8);
    } else if (strncmp(source, "http://", 7) == 0) {
        snprintf(base, sizeof(base), "ws://%s", source + 7);
    } else {
        snprintf(base, sizeof(base), "wss://%s", source);
    }

    size_t length = strlen(base);
    while (length > 0 && base[length - 1] == '/') {
        base[length - 1] = '\0';
        length--;
    }

    int written = snprintf(
        buffer,
        buffer_size,
        "%s/realtime/v1/websocket?apikey=%s&vsn=1.0.0",
        base,
        CONFIG_BRIDGE_SUPABASE_ANON_KEY
    );
    return written > 0 && (size_t)written < buffer_size;
}

static bool bridge_realtime_send_event(const char *topic, const char *event_name, cJSON *payload) {
    if (!s_realtime_client || !s_realtime_connected) {
        cJSON_Delete(payload);
        return false;
    }

    cJSON *envelope = cJSON_CreateObject();
    if (!envelope) {
        cJSON_Delete(payload);
        return false;
    }

    char ref[16];
    snprintf(ref, sizeof(ref), "%lu", (unsigned long)++s_realtime_ref);
    cJSON_AddStringToObject(envelope, "topic", topic ? topic : BRIDGE_REALTIME_TOPIC);
    cJSON_AddStringToObject(envelope, "event", event_name ? event_name : "");
    cJSON_AddItemToObject(envelope, "payload", payload ? payload : cJSON_CreateObject());
    cJSON_AddStringToObject(envelope, "ref", ref);
    if (event_name && strcmp(event_name, "phx_join") == 0) {
        cJSON_AddStringToObject(envelope, "join_ref", ref);
    }

    char *line = cJSON_PrintUnformatted(envelope);
    cJSON_Delete(envelope);
    if (!line) {
        return false;
    }

    int result = esp_websocket_client_send_text(s_realtime_client, line, strlen(line), pdMS_TO_TICKS(5000));
    free(line);
    return result >= 0;
}

static cJSON *bridge_realtime_change_filter(const char *table) {
    cJSON *filter = cJSON_CreateObject();
    if (!filter) {
        return NULL;
    }

    cJSON_AddStringToObject(filter, "event", "INSERT");
    cJSON_AddStringToObject(filter, "schema", "public");
    cJSON_AddStringToObject(filter, "table", table);
    return filter;
}

static bool bridge_realtime_join_channel(void) {
    cJSON *payload = cJSON_CreateObject();
    cJSON *config = cJSON_CreateObject();
    cJSON *changes = cJSON_CreateArray();
    cJSON *broadcast = cJSON_CreateObject();
    cJSON *presence = cJSON_CreateObject();
    if (!payload || !config || !changes || !broadcast || !presence) {
        cJSON_Delete(payload);
        cJSON_Delete(config);
        cJSON_Delete(changes);
        cJSON_Delete(broadcast);
        cJSON_Delete(presence);
        return false;
    }

    cJSON_AddItemToArray(changes, bridge_realtime_change_filter("messages"));
    cJSON_AddItemToArray(changes, bridge_realtime_change_filter("dm_messages"));
    cJSON_AddBoolToObject(broadcast, "self", false);
    cJSON_AddStringToObject(presence, "key", "");
    cJSON_AddItemToObject(config, "broadcast", broadcast);
    cJSON_AddItemToObject(config, "presence", presence);
    cJSON_AddItemToObject(config, "postgres_changes", changes);
    cJSON_AddItemToObject(payload, "config", config);
    cJSON_AddStringToObject(payload, "access_token", s_bridge_state.auth_access_token);

    return bridge_realtime_send_event(BRIDGE_REALTIME_TOPIC, "phx_join", payload);
}

static bool bridge_realtime_send_access_token(void) {
    cJSON *payload = cJSON_CreateObject();
    if (!payload) {
        return false;
    }

    cJSON_AddStringToObject(payload, "access_token", s_bridge_state.auth_access_token);
    return bridge_realtime_send_event(BRIDGE_REALTIME_TOPIC, "access_token", payload);
}

static bool bridge_realtime_send_heartbeat(void) {
    return bridge_realtime_send_event("phoenix", "heartbeat", cJSON_CreateObject());
}

static void bridge_realtime_emit_record(const char *thread, cJSON *record) {
    if (!cJSON_IsObject(record)) {
        return;
    }

    const char *id = bridge_json_string_or_empty(record, "id");
    const char *created_at = bridge_json_string_or_empty(record, "created_at");
    const char *content = bridge_json_string_or_empty(record, "content");
    const char *sender_id = bridge_json_string_or_empty(record, strcmp(thread, "dm") == 0 ? "sender_id" : "user_id");
    const char *conversation_id = strcmp(thread, "dm") == 0 ? bridge_json_string_or_empty(record, "conversation_id") : "";
    char time_label[12] = {0};
    char sender_label_buffer[80] = {0};
    const char *sender_label = bridge_lookup_profile_label(sender_id, sender_label_buffer, sizeof(sender_label_buffer));

    if (s_protocol_enabled) {
        bridge_protocol_emit_message(thread, id, created_at, sender_id, sender_label, content, conversation_id);
    } else {
        printf(
            "%s | %s: %s\n",
            bridge_message_time_label(created_at, time_label, sizeof(time_label)),
            sender_label[0] ? sender_label : "unknown",
            content
        );
    }

    if (id[0] != '\0' && strcmp(thread, "group") == 0) {
        bridge_save_group_cursor(id);
    }
}

static void bridge_realtime_handle_json(const char *payload) {
    cJSON *json = cJSON_Parse(payload);
    if (!json) {
        bridge_realtime_set_error("invalid realtime json");
        return;
    }

    const char *topic = bridge_json_string_or_empty(json, "topic");
    const char *event_name = bridge_json_string_or_empty(json, "event");
    cJSON *event_payload = cJSON_GetObjectItemCaseSensitive(json, "payload");

    if (strcmp(event_name, "phx_reply") == 0 && strcmp(topic, BRIDGE_REALTIME_TOPIC) == 0) {
        const char *status = bridge_json_string_or_empty(event_payload, "status");
        if (strcmp(status, "ok") == 0) {
            s_realtime_joined = true;
            bridge_realtime_set_error("");
            printf("Realtime channel joined\n");
            bridge_protocol_emit_status();
        } else if (status[0] != '\0') {
            s_realtime_joined = false;
            bridge_realtime_set_error(status);
            printf("Realtime channel join failed: %s\n", status);
            bridge_protocol_emit_status();
        }
        cJSON_Delete(json);
        return;
    }

    if (strcmp(event_name, "postgres_changes") != 0 || !cJSON_IsObject(event_payload)) {
        cJSON_Delete(json);
        return;
    }

    cJSON *data = cJSON_GetObjectItemCaseSensitive(event_payload, "data");
    if (!cJSON_IsObject(data)) {
        data = event_payload;
    }

    const char *table = bridge_json_string_or_empty(data, "table");
    if (table[0] == '\0') {
        table = bridge_json_string_or_empty(event_payload, "table");
    }

    cJSON *record = cJSON_GetObjectItemCaseSensitive(data, "record");
    if (!cJSON_IsObject(record)) {
        record = cJSON_GetObjectItemCaseSensitive(data, "new");
    }
    if (!cJSON_IsObject(record)) {
        record = cJSON_GetObjectItemCaseSensitive(event_payload, "record");
    }

    if (strcmp(table, "messages") == 0) {
        bridge_realtime_emit_record("group", record);
    } else if (strcmp(table, "dm_messages") == 0) {
        bridge_realtime_emit_record("dm", record);
    }

    cJSON_Delete(json);
}

static void bridge_realtime_handle_data(const esp_websocket_event_data_t *data) {
    if (!data || data->op_code != 0x1 || data->data_len <= 0) {
        return;
    }

    if (data->payload_offset == 0) {
        s_realtime_rx_length = 0;
    }

    if (s_realtime_rx_length + (size_t)data->data_len >= sizeof(s_realtime_rx_buffer)) {
        s_realtime_rx_length = 0;
        bridge_realtime_set_error("realtime frame too large");
        return;
    }

    memcpy(s_realtime_rx_buffer + s_realtime_rx_length, data->data_ptr, data->data_len);
    s_realtime_rx_length += data->data_len;

    if (!data->fin && data->payload_offset + data->data_len < data->payload_len) {
        return;
    }

    s_realtime_rx_buffer[s_realtime_rx_length] = '\0';
    bridge_realtime_handle_json(s_realtime_rx_buffer);
    s_realtime_rx_length = 0;
}

static void bridge_realtime_event_handler(void *handler_args, esp_event_base_t base, int32_t event_id, void *event_data) {
    (void)handler_args;
    (void)base;

    esp_websocket_event_data_t *data = (esp_websocket_event_data_t *)event_data;
    switch (event_id) {
    case WEBSOCKET_EVENT_CONNECTED:
        s_realtime_connected = true;
        s_realtime_joined = false;
        bridge_realtime_set_error("");
        printf("Realtime WebSocket connected\n");
        bridge_protocol_emit_status();
        if (!bridge_realtime_join_channel()) {
            bridge_realtime_set_error("join send failed");
        }
        break;
    case WEBSOCKET_EVENT_DISCONNECTED:
    case WEBSOCKET_EVENT_CLOSED:
        s_realtime_connected = false;
        s_realtime_joined = false;
        printf("Realtime WebSocket disconnected\n");
        bridge_protocol_emit_status();
        break;
    case WEBSOCKET_EVENT_ERROR:
        s_realtime_connected = false;
        s_realtime_joined = false;
        if (data) {
            snprintf(
                s_realtime_last_error,
                sizeof(s_realtime_last_error),
                "ws error %d/%d",
                (int)data->error_handle.error_type,
                data->error_handle.esp_ws_handshake_status_code
            );
        } else {
            bridge_realtime_set_error("ws error");
        }
        printf("Realtime WebSocket error: %s\n", s_realtime_last_error);
        bridge_protocol_emit_status();
        break;
    case WEBSOCKET_EVENT_DATA:
        bridge_realtime_handle_data(data);
        break;
    default:
        break;
    }
}

static void bridge_realtime_task(void *arg) {
    (void)arg;

    char url[BRIDGE_REALTIME_WS_URL_SIZE];
    while (s_realtime_requested) {
        s_realtime_connected = false;
        s_realtime_joined = false;

        if (!bridge_has_access_material("realtime")) {
            vTaskDelay(pdMS_TO_TICKS(10000));
            continue;
        }
        if (!bridge_ensure_fresh_session("realtime")) {
            bridge_realtime_set_error("session refresh failed");
            vTaskDelay(pdMS_TO_TICKS(10000));
            continue;
        }
        if (!s_bridge_state.auth_access_token[0]) {
            bridge_realtime_set_error("missing auth token");
            vTaskDelay(pdMS_TO_TICKS(10000));
            continue;
        }
        if (!bridge_realtime_build_url(url, sizeof(url))) {
            vTaskDelay(pdMS_TO_TICKS(10000));
            continue;
        }

        esp_websocket_client_config_t config = {
            .uri = url,
            .buffer_size = 4096,
            .task_stack = BRIDGE_REALTIME_TASK_STACK_SIZE,
            .network_timeout_ms = 10000,
            .reconnect_timeout_ms = 5000,
            .ping_interval_sec = 20,
            .crt_bundle_attach = esp_crt_bundle_attach,
        };

        esp_websocket_client_handle_t client = esp_websocket_client_init(&config);
        if (!client) {
            bridge_realtime_set_error("client init failed");
            vTaskDelay(pdMS_TO_TICKS(10000));
            continue;
        }

        s_realtime_client = client;
        esp_websocket_register_events(client, WEBSOCKET_EVENT_ANY, bridge_realtime_event_handler, NULL);
        esp_err_t err = esp_websocket_client_start(client);
        if (err != ESP_OK) {
            snprintf(s_realtime_last_error, sizeof(s_realtime_last_error), "start failed %s", esp_err_to_name(err));
            esp_websocket_client_destroy(client);
            s_realtime_client = NULL;
            vTaskDelay(pdMS_TO_TICKS(10000));
            continue;
        }

        TickType_t last_heartbeat = 0;
        TickType_t last_token_check = 0;
        while (s_realtime_requested) {
            TickType_t now = xTaskGetTickCount();
            if (s_realtime_connected && s_realtime_joined) {
                if (last_heartbeat == 0 || (now - last_heartbeat) >= pdMS_TO_TICKS(BRIDGE_REALTIME_HEARTBEAT_MS)) {
                    bridge_realtime_send_heartbeat();
                    last_heartbeat = now;
                }
                if (last_token_check == 0 || (now - last_token_check) >= pdMS_TO_TICKS(BRIDGE_REALTIME_TOKEN_CHECK_MS)) {
                    if (bridge_ensure_fresh_session("realtime token refresh")) {
                        bridge_realtime_send_access_token();
                    }
                    last_token_check = now;
                }
            }
            vTaskDelay(pdMS_TO_TICKS(500));
        }

        esp_websocket_client_stop(client);
        esp_websocket_client_destroy(client);
        s_realtime_client = NULL;
    }

    s_realtime_connected = false;
    s_realtime_joined = false;
    s_realtime_task_handle = NULL;
    bridge_protocol_emit_status();
    vTaskDelete(NULL);
}

static void bridge_command_realtime(const char *mode) {
    if (!mode || mode[0] == '\0' || strcmp(mode, "status") == 0) {
        printf(
            "Realtime: requested=%s connected=%s joined=%s%s%s\n",
            s_realtime_requested ? "yes" : "no",
            s_realtime_connected ? "yes" : "no",
            s_realtime_joined ? "yes" : "no",
            s_realtime_last_error[0] ? " error=" : "",
            s_realtime_last_error
        );
        bridge_protocol_emit_status();
        return;
    }

    if (strcmp(mode, "start") == 0 || strcmp(mode, "on") == 0) {
        if (s_realtime_task_handle) {
            printf("Realtime is already running\n");
            bridge_protocol_emit_status();
            return;
        }

        s_realtime_requested = true;
        bridge_realtime_set_error("");
        BaseType_t created = xTaskCreate(
            bridge_realtime_task,
            "bridge_realtime",
            BRIDGE_REALTIME_TASK_STACK_SIZE,
            NULL,
            5,
            &s_realtime_task_handle
        );
        if (created != pdPASS) {
            s_realtime_requested = false;
            s_realtime_task_handle = NULL;
            bridge_realtime_set_error("task create failed");
            printf("Realtime task could not start\n");
        } else {
            printf("Realtime WebSocket starting\n");
        }
        bridge_protocol_emit_status();
        return;
    }

    if (strcmp(mode, "stop") == 0 || strcmp(mode, "off") == 0) {
        s_realtime_requested = false;
        s_realtime_connected = false;
        s_realtime_joined = false;
        if (s_realtime_client) {
            esp_websocket_client_close(s_realtime_client, pdMS_TO_TICKS(1000));
        }
        printf("Realtime WebSocket stopping\n");
        bridge_protocol_emit_status();
        return;
    }

    printf("usage: realtime start|stop|status\n");
}

static bool bridge_send_group_message(const char *content, bool compact_output) {
    (void)compact_output;

    if (!content || content[0] == '\0') {
        printf("usage: group send <text>\n");
        return false;
    }

    if (!bridge_has_access_material("group send")) {
        return false;
    }
    if (!bridge_ensure_fresh_session("group send")) {
        return false;
    }

    char *body = bridge_json_string_body("deviceId", s_bridge_state.device_id, "content", content);
    if (!body) {
        printf("Failed to build group message payload\n");
        return false;
    }

    bridge_http_response_t response = {0};
    esp_err_t err = bridge_http_post_json("bridge-group-send", body, s_bridge_state.access_token, &response);
    if (err == ESP_OK && bridge_refresh_and_retry_allowed("bridge-group-send", &response)) {
        response = (bridge_http_response_t){0};
        err = bridge_http_post_json("bridge-group-send", body, s_bridge_state.access_token, &response);
    }

    free(body);
    if (err != ESP_OK) {
        printf("bridge-group-send failed: %s\n", esp_err_to_name(err));
        return false;
    }

    if (response.status_code >= 200 && response.status_code < 300) {
        bridge_print_sent_summary(&response, false);
    } else {
        bridge_print_response("bridge-group-send", &response);
    }

    return response.status_code >= 200 && response.status_code < 300;
}

static void bridge_command_group_send(const char *content) {
    bridge_send_group_message(content, false);
}

static bool bridge_poll_group_messages(
    bool compact_output,
    bool new_only,
    char *cursor_message_id,
    size_t cursor_message_id_size,
    bool print_empty
) {
    (void)compact_output;

    if (!bridge_has_access_material("group poll")) {
        return false;
    }
    if (!bridge_ensure_fresh_session("group poll")) {
        return false;
    }

    char body[192];
    if (new_only && cursor_message_id && cursor_message_id[0] != '\0') {
        snprintf(
            body,
            sizeof(body),
            "{\"deviceId\":\"%s\",\"limit\":10,\"sinceMessageId\":\"%s\"}",
            s_bridge_state.device_id,
            cursor_message_id
        );
    } else {
        snprintf(body, sizeof(body), "{\"deviceId\":\"%s\",\"limit\":10}", s_bridge_state.device_id);
    }

    bridge_http_response_t response = {0};
    esp_err_t err = bridge_http_post_json("bridge-group-poll", body, s_bridge_state.access_token, &response);
    if (err == ESP_OK && bridge_refresh_and_retry_allowed("bridge-group-poll", &response)) {
        response = (bridge_http_response_t){0};
        err = bridge_http_post_json("bridge-group-poll", body, s_bridge_state.access_token, &response);
    }
    if (err != ESP_OK) {
        printf("bridge-group-poll failed: %s\n", esp_err_to_name(err));
        return false;
    }

    if (response.status_code >= 200 && response.status_code < 300) {
        if (bridge_print_message_list(&response, "group", false, cursor_message_id, cursor_message_id_size, print_empty)) {
            if (cursor_message_id && cursor_message_id_size > 0) {
                bridge_save_group_cursor(cursor_message_id);
            }
        } else {
            bridge_print_response("bridge-group-poll", &response);
        }
    } else {
        bridge_print_response("bridge-group-poll", &response);
    }

    return response.status_code >= 200 && response.status_code < 300;
}

static void bridge_command_group_poll(void) {
    bridge_poll_group_messages(false, false, NULL, 0, true);
}

static bool bridge_send_dm_message(const char *recipient_user_id, const char *content, bool compact_output) {
    (void)compact_output;

    if (!recipient_user_id || recipient_user_id[0] == '\0' || !content || content[0] == '\0') {
        printf("usage: dm send <recipient_user_id> <text>\n");
        return false;
    }

    if (!bridge_has_access_material("DM send")) {
        return false;
    }
    if (!bridge_ensure_fresh_session("DM send")) {
        return false;
    }

    char *body = bridge_json_three_string_body(
        "deviceId",
        s_bridge_state.device_id,
        "recipientUserId",
        recipient_user_id,
        "content",
        content
    );
    if (!body) {
        printf("Failed to build DM payload\n");
        return false;
    }

    bridge_http_response_t response = {0};
    esp_err_t err = bridge_http_post_json("bridge-dm-send", body, s_bridge_state.access_token, &response);
    if (err == ESP_OK && bridge_refresh_and_retry_allowed("bridge-dm-send", &response)) {
        response = (bridge_http_response_t){0};
        err = bridge_http_post_json("bridge-dm-send", body, s_bridge_state.access_token, &response);
    }

    free(body);
    if (err != ESP_OK) {
        printf("bridge-dm-send failed: %s\n", esp_err_to_name(err));
        return false;
    }

    if (response.status_code >= 200 && response.status_code < 300) {
        bridge_print_sent_summary(&response, true);
    } else {
        bridge_print_response("bridge-dm-send", &response);
    }

    return response.status_code >= 200 && response.status_code < 300;
}

static void bridge_command_dm_send(const char *recipient_user_id, const char *content) {
    bridge_send_dm_message(recipient_user_id, content, false);
}

static bool bridge_poll_dm_messages(
    const char *recipient_user_id,
    bool compact_output,
    bool new_only,
    char *cursor_message_id,
    size_t cursor_message_id_size,
    bool print_empty
) {
    (void)compact_output;

    if (!recipient_user_id || recipient_user_id[0] == '\0') {
        printf("usage: dm poll <recipient_user_id>\n");
        return false;
    }

    if (!bridge_has_access_material("DM poll")) {
        return false;
    }
    if (!bridge_ensure_fresh_session("DM poll")) {
        return false;
    }

    char *body = bridge_dm_poll_body(
        recipient_user_id,
        (new_only && cursor_message_id && cursor_message_id[0] != '\0') ? cursor_message_id : NULL
    );
    if (!body) {
        printf("Failed to build DM poll payload\n");
        return false;
    }

    bridge_http_response_t response = {0};
    esp_err_t err = bridge_http_post_json("bridge-dm-poll", body, s_bridge_state.access_token, &response);
    if (err == ESP_OK && bridge_refresh_and_retry_allowed("bridge-dm-poll", &response)) {
        response = (bridge_http_response_t){0};
        err = bridge_http_post_json("bridge-dm-poll", body, s_bridge_state.access_token, &response);
    }

    free(body);
    if (err != ESP_OK) {
        printf("bridge-dm-poll failed: %s\n", esp_err_to_name(err));
        return false;
    }

    if (response.status_code >= 200 && response.status_code < 300) {
        if (bridge_print_message_list(&response, "dm", true, cursor_message_id, cursor_message_id_size, print_empty)) {
            if (cursor_message_id && cursor_message_id_size > 0) {
                bridge_save_dm_cursor(recipient_user_id, cursor_message_id);
            }
        } else {
            bridge_print_response("bridge-dm-poll", &response);
        }
    } else {
        bridge_print_response("bridge-dm-poll", &response);
    }

    return response.status_code >= 200 && response.status_code < 300;
}

static void bridge_command_dm_poll(const char *recipient_user_id) {
    bridge_poll_dm_messages(recipient_user_id, false, false, NULL, 0, true);
}

static void bridge_command_users_search(const char *query) {
    if (!query || query[0] == '\0') {
        printf("usage: users search <name_or_username>\n");
        return;
    }

    if (!bridge_has_access_material("users search")) {
        return;
    }
    if (!bridge_ensure_fresh_session("users search")) {
        return;
    }

    char *body = bridge_json_string_body("deviceId", s_bridge_state.device_id, "query", query);
    if (!body) {
        printf("Failed to build user search payload\n");
        return;
    }

    bridge_http_response_t response = {0};
    esp_err_t err = bridge_http_post_json("bridge-user-search", body, s_bridge_state.access_token, &response);
    if (err == ESP_OK && bridge_refresh_and_retry_allowed("bridge-user-search", &response)) {
        response = (bridge_http_response_t){0};
        err = bridge_http_post_json("bridge-user-search", body, s_bridge_state.access_token, &response);
    }

    free(body);
    if (err != ESP_OK) {
        printf("bridge-user-search failed: %s\n", esp_err_to_name(err));
        return;
    }

    if (response.status_code >= 200 && response.status_code < 300) {
        if (!bridge_print_user_search_list(&response)) {
            bridge_print_response("bridge-user-search", &response);
        }
    } else {
        bridge_print_response("bridge-user-search", &response);
    }
}

static const char *bridge_prompt_for_mode(bridge_chat_mode_t chat_mode) {
    switch (chat_mode) {
    case BRIDGE_CHAT_MODE_GROUP:
        return "chat:group> ";
    case BRIDGE_CHAT_MODE_DM:
        return "chat:dm> ";
    case BRIDGE_CHAT_MODE_ADMIN:
    default:
        return "bridge> ";
    }
}

static void bridge_enter_group_chat(
    bridge_chat_mode_t *chat_mode,
    char *group_cursor_message_id,
    size_t group_cursor_message_id_size
) {
    *chat_mode = BRIDGE_CHAT_MODE_GROUP;
    printf("Entered group chat. Type /help for chat commands or /admin for the admin shell.\n");
    bridge_protocol_emit_mode("group", NULL);
    bridge_poll_group_messages(
        true,
        false,
        group_cursor_message_id,
        group_cursor_message_id_size,
        true
    );
}

static void bridge_enter_dm_chat(
    bridge_chat_mode_t *chat_mode,
    char *recipient_user_id,
    size_t recipient_size,
    const char *next_recipient_user_id,
    char *dm_cursor_recipient_user_id,
    size_t dm_cursor_recipient_size,
    char *dm_cursor_message_id,
    size_t dm_cursor_message_id_size
) {
    if (!next_recipient_user_id || next_recipient_user_id[0] == '\0') {
        printf("usage: chat dm <recipient_user_id|@username>\n");
        return;
    }

    if (
        !dm_cursor_recipient_user_id ||
        !dm_cursor_message_id ||
        strcmp(dm_cursor_recipient_user_id, next_recipient_user_id) != 0
    ) {
        bridge_set_runtime_string(dm_cursor_message_id, dm_cursor_message_id_size, "");
    }

    bridge_set_runtime_string(recipient_user_id, recipient_size, next_recipient_user_id);
    bridge_set_runtime_string(dm_cursor_recipient_user_id, dm_cursor_recipient_size, next_recipient_user_id);
    bridge_save_dm_cursor(dm_cursor_recipient_user_id, dm_cursor_message_id);
    *chat_mode = BRIDGE_CHAT_MODE_DM;
    printf("Entered DM chat with %s. Type /help for chat commands or /admin for the admin shell.\n", recipient_user_id);
    bridge_protocol_emit_mode("dm", recipient_user_id);
    bridge_poll_dm_messages(
        recipient_user_id,
        true,
        false,
        dm_cursor_message_id,
        dm_cursor_message_id_size,
        true
    );
}

static bool bridge_handle_chat_line(
    bridge_chat_mode_t *chat_mode,
    char *recipient_user_id,
    size_t recipient_size,
    char *group_cursor_message_id,
    size_t group_cursor_message_id_size,
    char *dm_cursor_recipient_user_id,
    size_t dm_cursor_recipient_size,
    char *dm_cursor_message_id,
    size_t dm_cursor_message_id_size,
    char *line
) {
    if (line[0] == '/') {
        if (strcmp(line, "/help") == 0) {
            bridge_chat_help();
        } else if (strcmp(line, "/admin") == 0 || strcmp(line, "/back") == 0 || strcmp(line, "/quit") == 0) {
            *chat_mode = BRIDGE_CHAT_MODE_ADMIN;
            printf("Returned to admin shell.\n");
            bridge_protocol_emit_mode("admin", NULL);
        } else if (strcmp(line, "/group") == 0) {
            bridge_enter_group_chat(chat_mode, group_cursor_message_id, group_cursor_message_id_size);
        } else if (strncmp(line, "/dm ", 4) == 0) {
            char *next_recipient_user_id = line + 4;
            while (*next_recipient_user_id == ' ') {
                next_recipient_user_id++;
            }
            bridge_enter_dm_chat(
                chat_mode,
                recipient_user_id,
                recipient_size,
                next_recipient_user_id,
                dm_cursor_recipient_user_id,
                dm_cursor_recipient_size,
                dm_cursor_message_id,
                dm_cursor_message_id_size
            );
        } else if (strcmp(line, "/poll") == 0) {
            if (*chat_mode == BRIDGE_CHAT_MODE_GROUP) {
                bridge_poll_group_messages(true, true, group_cursor_message_id, group_cursor_message_id_size, false);
            } else if (*chat_mode == BRIDGE_CHAT_MODE_DM) {
                bridge_poll_dm_messages(recipient_user_id, true, true, dm_cursor_message_id, dm_cursor_message_id_size, false);
            }
        } else if (strcmp(line, "/status") == 0) {
            bridge_command_status();
        } else if (strncmp(line, "/protocol ", 10) == 0) {
            bridge_command_protocol(line + 10);
        } else if (strncmp(line, "/realtime ", 10) == 0) {
            bridge_command_realtime(line + 10);
        } else if (strcmp(line, "/realtime") == 0) {
            bridge_command_realtime("status");
        } else {
            printf("Unknown chat command. Type /help.\n");
        }

        return true;
    }

    if (*chat_mode == BRIDGE_CHAT_MODE_GROUP) {
        bridge_send_group_message(line, true);
    } else if (*chat_mode == BRIDGE_CHAT_MODE_DM) {
        bridge_send_dm_message(recipient_user_id, line, true);
    }

    return true;
}

static bool bridge_read_shell_line(char *line, size_t line_size, bool *overflowed) {
    static char pending_line[BRIDGE_SHELL_LINE_SIZE];
    static size_t pending_length = 0;
    static bool discarding_oversized_line = false;

    if (overflowed) {
        *overflowed = false;
    }

    if (!line || line_size == 0) {
        return false;
    }

    while (true) {
        int ch = fgetc(stdin);
        if (ch == EOF) {
            return false;
        }

        if (ch == '\n' || ch == '\r') {
            if (discarding_oversized_line) {
                discarding_oversized_line = false;
                pending_length = 0;
                line[0] = '\0';
                if (overflowed) {
                    *overflowed = true;
                }
                return true;
            }

            pending_line[pending_length] = '\0';
            snprintf(line, line_size, "%s", pending_line);
            pending_length = 0;
            return true;
        }

        if (discarding_oversized_line) {
            continue;
        }

        if (pending_length >= sizeof(pending_line) - 1 || pending_length >= line_size - 1) {
            discarding_oversized_line = true;
            pending_length = 0;
            continue;
        }

        pending_line[pending_length++] = (char)ch;
    }
}

static void bridge_shell_task(void *arg) {
    char line[BRIDGE_SHELL_LINE_SIZE];
    char active_dm_recipient_user_id[64] = {0};
    char group_cursor_message_id[64] = {0};
    char dm_cursor_recipient_user_id[64] = {0};
    char dm_cursor_message_id[64] = {0};
    bridge_chat_mode_t chat_mode = BRIDGE_CHAT_MODE_ADMIN;
    bool prompt_pending = true;

    bridge_load_chat_cursors(
        group_cursor_message_id,
        sizeof(group_cursor_message_id),
        dm_cursor_recipient_user_id,
        sizeof(dm_cursor_recipient_user_id),
        dm_cursor_message_id,
        sizeof(dm_cursor_message_id)
    );

    bridge_command_help();

    while (true) {
        if (prompt_pending) {
            printf("%s", bridge_prompt_for_mode(chat_mode));
            fflush(stdout);
            prompt_pending = false;
        }

        bool line_overflowed = false;
        if (!bridge_read_shell_line(line, sizeof(line), &line_overflowed)) {
            vTaskDelay(pdMS_TO_TICKS(100));
            continue;
        }

        if (line_overflowed) {
            printf("Input line is too long. Limit is %d bytes; discarded the whole line.\n", BRIDGE_SHELL_LINE_SIZE - 1);
            prompt_pending = true;
            continue;
        }

        if (line[0] == '\0') {
            prompt_pending = true;
            continue;
        }

        if (chat_mode != BRIDGE_CHAT_MODE_ADMIN) {
            bridge_handle_chat_line(
                &chat_mode,
                active_dm_recipient_user_id,
                sizeof(active_dm_recipient_user_id),
                group_cursor_message_id,
                sizeof(group_cursor_message_id),
                dm_cursor_recipient_user_id,
                sizeof(dm_cursor_recipient_user_id),
                dm_cursor_message_id,
                sizeof(dm_cursor_message_id),
                line
            );
            prompt_pending = true;
            continue;
        }

        char *save_ptr = NULL;
        char *command = strtok_r(line, " ", &save_ptr);
        char *subcommand = strtok_r(NULL, " ", &save_ptr);

        if (command == NULL) {
            continue;
        }

        if (strcmp(command, "help") == 0 || strcmp(command, "/help") == 0) {
            bridge_command_help();
        } else if (strcmp(command, "/admin") == 0 || strcmp(command, "/back") == 0 || strcmp(command, "/quit") == 0) {
            printf("Already in admin shell.\n");
            bridge_protocol_emit_mode("admin", NULL);
        } else if (strcmp(command, "status") == 0) {
            bridge_command_status();
        } else if (strcmp(command, "protocol") == 0) {
            bridge_command_protocol(subcommand);
        } else if (strcmp(command, "realtime") == 0) {
            bridge_command_realtime(subcommand);
        } else if (strcmp(command, "wifi") == 0 && subcommand && strcmp(subcommand, "set") == 0) {
            char ssid[33] = {0};
            char password[65] = {0};
            char *args = save_ptr;
            bool has_ssid = bridge_read_shell_arg(&args, ssid, sizeof(ssid));
            bool has_password = bridge_read_shell_remainder(&args, password, sizeof(password));
            bridge_command_wifi_set(has_ssid ? ssid : NULL, has_password ? password : NULL);
        } else if (strcmp(command, "wifi") == 0 && subcommand && strcmp(subcommand, "connect") == 0) {
            bridge_command_wifi_connect();
        } else if (strcmp(command, "wifi") == 0 && subcommand && strcmp(subcommand, "scan") == 0) {
            bridge_command_wifi_scan();
        } else if (strcmp(command, "bridge") == 0 && subcommand && strcmp(subcommand, "register") == 0) {
            bridge_command_register();
        } else if (strcmp(command, "bridge") == 0 && subcommand && strcmp(subcommand, "heartbeat") == 0) {
            bridge_command_heartbeat();
        } else if (strcmp(command, "bridge") == 0 && subcommand && strcmp(subcommand, "wipe") == 0) {
            bridge_command_wipe();
        } else if (strcmp(command, "update") == 0 && subcommand && strcmp(subcommand, "check") == 0) {
            char *target = strtok_r(NULL, " ", &save_ptr);
            bridge_command_update_check(target);
        } else if (strcmp(command, "update") == 0 && subcommand && strcmp(subcommand, "apply") == 0) {
            char *target = strtok_r(NULL, " ", &save_ptr);
            bridge_command_update_apply(target);
        } else if (strcmp(command, "bundle") == 0 && subcommand && strcmp(subcommand, "check") == 0) {
            char *target = strtok_r(NULL, " ", &save_ptr);
            bridge_command_bundle_check(target);
        } else if (strcmp(command, "bundle") == 0 && subcommand && strcmp(subcommand, "get") == 0) {
            char *target = strtok_r(NULL, " ", &save_ptr);
            bridge_command_bundle_get(target);
        } else if (strcmp(command, "bootstrap") == 0) {
            bridge_command_bootstrap(subcommand);
        } else if (strcmp(command, "group") == 0 && subcommand && strcmp(subcommand, "send") == 0) {
            char *content = save_ptr;
            while (content && *content == ' ') {
                content++;
            }
            bridge_command_group_send(content);
        } else if (strcmp(command, "group") == 0 && subcommand && strcmp(subcommand, "poll") == 0) {
            bridge_command_group_poll();
        } else if (strcmp(command, "dm") == 0 && subcommand && strcmp(subcommand, "send") == 0) {
            char *recipient_user_id = strtok_r(NULL, " ", &save_ptr);
            char *content = save_ptr;
            while (content && *content == ' ') {
                content++;
            }
            bridge_command_dm_send(recipient_user_id, content);
        } else if (strcmp(command, "dm") == 0 && subcommand && strcmp(subcommand, "poll") == 0) {
            char *recipient_user_id = strtok_r(NULL, " ", &save_ptr);
            bridge_command_dm_poll(recipient_user_id);
        } else if (strcmp(command, "users") == 0 && subcommand && strcmp(subcommand, "search") == 0) {
            char *query = save_ptr;
            while (query && *query == ' ') {
                query++;
            }
            bridge_command_users_search(query);
        } else if (strcmp(command, "chat") == 0 && subcommand && strcmp(subcommand, "group") == 0) {
            bridge_enter_group_chat(&chat_mode, group_cursor_message_id, sizeof(group_cursor_message_id));
        } else if (strcmp(command, "chat") == 0 && subcommand && strcmp(subcommand, "dm") == 0) {
            char *recipient_user_id = strtok_r(NULL, " ", &save_ptr);
            bridge_enter_dm_chat(
                &chat_mode,
                active_dm_recipient_user_id,
                sizeof(active_dm_recipient_user_id),
                recipient_user_id,
                dm_cursor_recipient_user_id,
                sizeof(dm_cursor_recipient_user_id),
                dm_cursor_message_id,
                sizeof(dm_cursor_message_id)
            );
        } else if (strcmp(command, "pair") == 0 && subcommand && strcmp(subcommand, "begin") == 0) {
            bridge_command_pair_begin();
        } else if (strcmp(command, "pair") == 0 && subcommand && strcmp(subcommand, "status") == 0) {
            bridge_command_pair_status();
        } else if (strcmp(command, "session") == 0 && subcommand && strcmp(subcommand, "exchange") == 0) {
            bridge_command_session_exchange();
        } else if (strcmp(command, "session") == 0 && subcommand && strcmp(subcommand, "refresh") == 0) {
            bridge_command_session_refresh();
        } else if (strcmp(command, "session") == 0 && subcommand && strcmp(subcommand, "recover") == 0) {
            bridge_command_session_recover();
        } else {
            printf("Unknown command. Type 'help'.\n");
        }

        prompt_pending = true;
    }
}

void app_main(void) {
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        err = nvs_flash_init();
    }
    ESP_ERROR_CHECK(err);

    memset(&s_bridge_state, 0, sizeof(s_bridge_state));
    bridge_load_persisted_state();
    bridge_derive_device_serial();

    const esp_partition_t *running_partition = esp_ota_get_running_partition();
    esp_ota_img_states_t ota_state;
    if (
        running_partition &&
        esp_ota_get_state_partition(running_partition, &ota_state) == ESP_OK &&
        ota_state == ESP_OTA_IMG_PENDING_VERIFY
    ) {
        ESP_LOGI(TAG, "Marking OTA app valid after successful boot");
        esp_ota_mark_app_valid_cancel_rollback();
    }

    ESP_ERROR_CHECK(bridge_wifi_init());

    printf("\nShadowChat Bridge firmware booted\n");
    printf("USB path: ESP32-S3 USB Serial/JTAG console\n");
    printf("Device serial: %s\n", s_bridge_state.device_serial);
    printf("Backend URL: %s\n", CONFIG_BRIDGE_SUPABASE_URL[0] ? CONFIG_BRIDGE_SUPABASE_URL : "(not set)");
    printf("First plug: type 'bootstrap help' for offline Windows setup and bundle download instructions.\n");

    if (s_bridge_state.wifi_ssid[0] != '\0') {
        printf("Attempting Wi-Fi reconnect for SSID '%s'\n", s_bridge_state.wifi_ssid);
        bridge_wifi_apply_credentials();
    }

    xTaskCreate(bridge_startup_recovery_task, "bridge_startup_recovery", BRIDGE_SHELL_TASK_STACK_SIZE, NULL, 4, NULL);
    xTaskCreate(bridge_shell_task, "bridge_shell", BRIDGE_SHELL_TASK_STACK_SIZE, NULL, 5, NULL);
}
