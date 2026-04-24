idf_component_register(
  SRCS "main.c"
  INCLUDE_DIRS "."
  REQUIRES
    mbedtls
    esp_event
    esp_http_client
    esp_netif
    esp_websocket_client
    esp_wifi
    json
    nvs_flash
)
