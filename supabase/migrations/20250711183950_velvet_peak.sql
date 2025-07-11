/*
  # Enable pg_net extension

  1. Extensions
    - Enable `pg_net` extension for HTTP functions
    - This extension provides `net.http_post` and other HTTP functions
    - Required for webhook notifications and HTTP requests from database

  2. Notes
    - This extension is needed for the `notify_message_http` function
    - Without this extension, HTTP-related database functions will fail
*/

-- Enable the pg_net extension for HTTP functionality
CREATE EXTENSION IF NOT EXISTS pg_net;