#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "cJSON.h"
#include "esp_crt_bundle.h"
#include "esp_err.h"
#include "esp_event.h"
#include "esp_http_client.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_netif.h"
#include "esp_system.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "freertos/task.h"
#include "nvs.h"
#include "nvs_flash.h"

#define BRIDGE_WIFI_CONNECTED_BIT BIT0
#define BRIDGE_HTTP_BUFFER_SIZE 4096
#define BRIDGE_STORAGE_NAMESPACE "bridge_cfg"
#define BRIDGE_SHELL_TASK_STACK_SIZE 16384

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
} bridge_state_t;

typedef struct {
    int status_code;
    char body[BRIDGE_HTTP_BUFFER_SIZE];
    size_t body_length;
} bridge_http_response_t;

static EventGroupHandle_t s_wifi_event_group;
static bridge_state_t s_bridge_state;

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

static void bridge_load_persisted_state(void) {
    bridge_load_string("wifi_ssid", s_bridge_state.wifi_ssid, sizeof(s_bridge_state.wifi_ssid));
    bridge_load_string("wifi_password", s_bridge_state.wifi_password, sizeof(s_bridge_state.wifi_password));
    bridge_load_string("device_id", s_bridge_state.device_id, sizeof(s_bridge_state.device_id));
    bridge_load_string("device_status", s_bridge_state.device_status, sizeof(s_bridge_state.device_status));
    bridge_load_string("pairing_code", s_bridge_state.pairing_code, sizeof(s_bridge_state.pairing_code));
    bridge_load_string("access_token", s_bridge_state.access_token, sizeof(s_bridge_state.access_token));
    bridge_load_string("refresh_token", s_bridge_state.refresh_token, sizeof(s_bridge_state.refresh_token));
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
        s_bridge_state.wifi_connected = false;
        xEventGroupClearBits(s_wifi_event_group, BRIDGE_WIFI_CONNECTED_BIT);

        if (s_bridge_state.wifi_ssid[0] != '\0') {
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

    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
    return esp_wifi_connect();
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

static void bridge_print_response(const char *label, const bridge_http_response_t *response) {
    printf("%s: HTTP %d\n", label, response->status_code);
    if (response->body[0] != '\0') {
        cJSON *json = cJSON_Parse(response->body);
        if (json) {
            cJSON *access_token = cJSON_GetObjectItemCaseSensitive(json, "accessToken");
            cJSON *refresh_token = cJSON_GetObjectItemCaseSensitive(json, "refreshToken");

            if (cJSON_IsString(access_token)) {
                cJSON_SetValuestring(access_token, "(redacted)");
            }

            if (cJSON_IsString(refresh_token)) {
                cJSON_SetValuestring(refresh_token, "(redacted)");
            }

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

static void bridge_command_help(void) {
    printf("\nShadowChat Bridge admin shell\n");
    printf("  help\n");
    printf("  status\n");
    printf("  wifi set <ssid> <password>\n");
    printf("  wifi connect\n");
    printf("  bridge register\n");
    printf("  bridge wipe\n");
    printf("  pair begin\n");
    printf("  pair status\n");
    printf("  session exchange\n");
    printf("  session refresh\n");
    printf("  bridge heartbeat\n\n");
}

static void bridge_clear_pairing_state(void) {
    bridge_set_runtime_string(s_bridge_state.device_status, sizeof(s_bridge_state.device_status), "unpaired");
    bridge_set_runtime_string(s_bridge_state.pairing_code, sizeof(s_bridge_state.pairing_code), "");
    bridge_set_runtime_string(s_bridge_state.access_token, sizeof(s_bridge_state.access_token), "");
    bridge_set_runtime_string(s_bridge_state.refresh_token, sizeof(s_bridge_state.refresh_token), "");

    bridge_save_string("device_status", s_bridge_state.device_status);
    bridge_save_string("pairing_code", "");
    bridge_save_string("access_token", "");
    bridge_save_string("refresh_token", "");
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
    printf("  refresh_token: %s\n\n", s_bridge_state.refresh_token[0] ? "(stored)" : "(none)");
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
    if (bridge_wait_for_wifi(15000)) {
        printf("Wi-Fi connected\n");
    } else {
        printf("Wi-Fi connect timed out\n");
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

static void bridge_command_pair_begin(void) {
    if (!s_bridge_state.wifi_connected || s_bridge_state.device_id[0] == '\0') {
        printf("Device must be registered and online before pairing begins\n");
        return;
    }

    char body[128];
    snprintf(body, sizeof(body), "{\"deviceId\":\"%s\"}", s_bridge_state.device_id);

    bridge_http_response_t response = {0};
    esp_err_t err = bridge_http_post_json("bridge-pairing-begin", body, NULL, &response);
    if (err != ESP_OK) {
        printf("bridge-pairing-begin failed: %s\n", esp_err_to_name(err));
        return;
    }

    bridge_print_response("bridge-pairing-begin", &response);

    cJSON *json = bridge_parse_json_body(&response);
    if (!json) {
        return;
    }

    cJSON *pairing_code = cJSON_GetObjectItemCaseSensitive(json, "pairingCode");
    cJSON *status = cJSON_GetObjectItemCaseSensitive(json, "status");

    if (cJSON_IsString(pairing_code) && pairing_code->valuestring) {
        bridge_set_runtime_string(s_bridge_state.pairing_code, sizeof(s_bridge_state.pairing_code), pairing_code->valuestring);
        bridge_save_string("pairing_code", s_bridge_state.pairing_code);
        printf("Pair this bridge from ShadowChat using code: %s\n", s_bridge_state.pairing_code);
    }

    if (cJSON_IsString(status) && status->valuestring) {
        bridge_set_runtime_string(s_bridge_state.device_status, sizeof(s_bridge_state.device_status), status->valuestring);
        bridge_save_string("device_status", s_bridge_state.device_status);
    }

    cJSON_Delete(json);
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

static void bridge_command_session_exchange(void) {
    if (!s_bridge_state.wifi_connected || s_bridge_state.device_id[0] == '\0' || s_bridge_state.pairing_code[0] == '\0') {
        printf("Device must be registered and paired before exchange\n");
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
    esp_err_t err = bridge_http_post_json("bridge-session-exchange", body, NULL, &response);
    if (err != ESP_OK) {
        printf("bridge-session-exchange failed: %s\n", esp_err_to_name(err));
        return;
    }

    bridge_print_response("bridge-session-exchange", &response);

    cJSON *json = bridge_parse_json_body(&response);
    if (!json) {
        return;
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

    printf("Stored bridge control-plane session material\n");
    cJSON_Delete(json);
}

static void bridge_command_session_refresh(void) {
    if (!s_bridge_state.wifi_connected || s_bridge_state.device_id[0] == '\0' || s_bridge_state.refresh_token[0] == '\0') {
        printf("Device must have stored refresh material before refresh\n");
        return;
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
        return;
    }

    bridge_print_response("bridge-session-refresh", &response);

    cJSON *json = bridge_parse_json_body(&response);
    if (!json) {
        return;
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

    printf("Rotated bridge control-plane session material\n");
    cJSON_Delete(json);
}

static void bridge_command_heartbeat(void) {
    if (!s_bridge_state.wifi_connected || s_bridge_state.device_id[0] == '\0' || s_bridge_state.access_token[0] == '\0') {
        printf("Device must have stored access material before heartbeat\n");
        return;
    }

    char body[384];
    snprintf(
        body,
        sizeof(body),
        "{\"deviceId\":\"%s\",\"firmwareVersion\":\"%s\",\"connectionHealth\":{\"pairStatus\":\"%s\",\"backendConnected\":true,\"realtimeConnected\":false,\"lastRefreshAt\":null}}",
        s_bridge_state.device_id,
        CONFIG_BRIDGE_FIRMWARE_VERSION,
        s_bridge_state.device_status[0] ? s_bridge_state.device_status : "unknown"
    );

    bridge_http_response_t response = {0};
    esp_err_t err = bridge_http_post_json("bridge-heartbeat", body, s_bridge_state.access_token, &response);
    if (err != ESP_OK) {
        printf("bridge-heartbeat failed: %s\n", esp_err_to_name(err));
        return;
    }

    bridge_print_response("bridge-heartbeat", &response);
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

static void bridge_shell_task(void *arg) {
    char line[256];
    bool prompt_pending = true;

    bridge_command_help();

    while (true) {
        if (prompt_pending) {
            printf("bridge> ");
            fflush(stdout);
            prompt_pending = false;
        }

        if (fgets(line, sizeof(line), stdin) == NULL) {
            vTaskDelay(pdMS_TO_TICKS(100));
            continue;
        }

        size_t length = strlen(line);
        while (length > 0 && (line[length - 1] == '\n' || line[length - 1] == '\r')) {
            line[--length] = '\0';
        }

        if (length == 0) {
            prompt_pending = true;
            continue;
        }

        char *save_ptr = NULL;
        char *command = strtok_r(line, " ", &save_ptr);
        char *subcommand = strtok_r(NULL, " ", &save_ptr);

        if (command == NULL) {
            continue;
        }

        if (strcmp(command, "help") == 0) {
            bridge_command_help();
        } else if (strcmp(command, "status") == 0) {
            bridge_command_status();
        } else if (strcmp(command, "wifi") == 0 && subcommand && strcmp(subcommand, "set") == 0) {
            char *ssid = strtok_r(NULL, " ", &save_ptr);
            char *password = save_ptr;
            while (password && *password == ' ') {
                password++;
            }
            if (password && *password == '\0') {
                password = NULL;
            }
            bridge_command_wifi_set(ssid, password);
        } else if (strcmp(command, "wifi") == 0 && subcommand && strcmp(subcommand, "connect") == 0) {
            bridge_command_wifi_connect();
        } else if (strcmp(command, "bridge") == 0 && subcommand && strcmp(subcommand, "register") == 0) {
            bridge_command_register();
        } else if (strcmp(command, "bridge") == 0 && subcommand && strcmp(subcommand, "heartbeat") == 0) {
            bridge_command_heartbeat();
        } else if (strcmp(command, "bridge") == 0 && subcommand && strcmp(subcommand, "wipe") == 0) {
            bridge_command_wipe();
        } else if (strcmp(command, "pair") == 0 && subcommand && strcmp(subcommand, "begin") == 0) {
            bridge_command_pair_begin();
        } else if (strcmp(command, "pair") == 0 && subcommand && strcmp(subcommand, "status") == 0) {
            bridge_command_pair_status();
        } else if (strcmp(command, "session") == 0 && subcommand && strcmp(subcommand, "exchange") == 0) {
            bridge_command_session_exchange();
        } else if (strcmp(command, "session") == 0 && subcommand && strcmp(subcommand, "refresh") == 0) {
            bridge_command_session_refresh();
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
    ESP_ERROR_CHECK(bridge_wifi_init());

    printf("\nShadowChat Bridge firmware booted\n");
    printf("USB path: ESP32-S3 USB Serial/JTAG console\n");
    printf("Device serial: %s\n", s_bridge_state.device_serial);
    printf("Backend URL: %s\n", CONFIG_BRIDGE_SUPABASE_URL[0] ? CONFIG_BRIDGE_SUPABASE_URL : "(not set)");

    if (s_bridge_state.wifi_ssid[0] != '\0') {
        printf("Attempting Wi-Fi reconnect for SSID '%s'\n", s_bridge_state.wifi_ssid);
        bridge_wifi_apply_credentials();
    }

    xTaskCreate(bridge_shell_task, "bridge_shell", BRIDGE_SHELL_TASK_STACK_SIZE, NULL, 5, NULL);
}
