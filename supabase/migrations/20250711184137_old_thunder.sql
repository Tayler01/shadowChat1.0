/*
  # Enable pg_net extension

  1. Extensions
    - Enable `pg_net` extension for HTTP functions
    
  2. Purpose
    - Provides `net.http_post` and other HTTP functions
    - Required for database triggers that send notifications
    - Enables webhook functionality
*/

-- Enable the pg_net extension for HTTP functions
CREATE EXTENSION IF NOT EXISTS pg_net;