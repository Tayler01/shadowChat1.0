#pragma once

#include "esp_err.h"

esp_err_t bridge_usb_bootstrap_init(void);
const char *bridge_usb_bootstrap_status(void);
