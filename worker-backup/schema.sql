-- Schema for Production-Grade URL Shortener

-- 1. Table for URL mapping
CREATE TABLE IF NOT EXISTS urls (
    id BIGSERIAL PRIMARY KEY,
    short_key VARCHAR(16) UNIQUE NOT NULL,
    original_url TEXT NOT NULL,
    custom_alias VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_urls_short_key ON urls(short_key);
CREATE INDEX IF NOT EXISTS idx_urls_expires_at ON urls(expires_at) WHERE expires_at IS NOT NULL;


-- 2. Table for Redirection Analytics (Partitioned by time)
CREATE TABLE IF NOT EXISTS analytics (
    id BIGSERIAL,
    short_key VARCHAR(16) NOT NULL,
    clicked_at TIMESTAMP WITH TIME ZONE NOT NULL,
    country_code CHAR(2),
    user_agent TEXT,
    referrer TEXT,
    PRIMARY KEY (id, clicked_at)
) PARTITION BY RANGE (clicked_at);

-- Indexes on analytics
CREATE INDEX IF NOT EXISTS idx_analytics_key_date ON analytics(short_key, clicked_at DESC);

-- Default partition to catch all inserts if specific range partitions do not exist yet
CREATE TABLE IF NOT EXISTS analytics_default PARTITION OF analytics DEFAULT;

-- Restart sequence at 56800235584 to guarantee all base62 auto-generated keys are at least 7 characters
ALTER SEQUENCE IF EXISTS urls_id_seq RESTART WITH 56800235584;

